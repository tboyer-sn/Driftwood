# Driftwood: data model proposal (logical objects, observations, CIs)

**Status:** adopted 2026-11-08 (decisions in section 7) · **Applies to:** v0.6 onwards · **Replaces:** the per-category storage choice of POC decision 3, as the default

## 1. Why change

Today every item exists once **per instance**. *Table: incident* on Dev, Test and Prod is three unrelated records that only meet when the Drift Report compares them on the fly. You can't open "incident" and see how it differs across environments. Drift isn't stored anywhere, so it can't be listed, filtered, alerted on or trended.

The goal is **one logical item, observed in each environment**. Open *incident*, and see every environment's definition side by side, with the differences highlighted.

## 2. Proposed model: three layers

| Layer | What it is | Example | Storage |
|---|---|---|---|
| **Instance** | One per ServiceNow instance (local or imported) | `dev466156`, `prod01` | CI (exists today: `cmdb_ci_sn_instance`) |
| **Tracked object** (new) | One per *category + key*, across all instances. The thing you care about. | *Table: incident*, *Property: glide.authenticate.multifactor*, *Update set: STRY001* | New table; CI for applications, tables and plugins (see section 3) |
| **Observation** | What one instance has for that object: values, attributes, source link, first seen / last changed | *incident on prod01: 48,310 rows, 97 columns* | Existing tracked item records, now always plain records, gaining a reference to their object |

```
Tracked object: Table: incident            drift: differs (schema)  present 3/3
 ├─ observation  dev466156  rows 1,204   cols 96  fingerprint A1B2…
 ├─ observation  test01     rows 1,198   cols 96  fingerprint A1B2…
 └─ observation  prod01     rows 48,310  cols 97  fingerprint C3D4…   (+ u_vendor_ref)
```

Objects are matched across instances by the **same key the comparison already uses**:

- tables: table name;
- columns: `table.column`;
- properties: name;
- update sets: originating set;
- plugins: plugin ID;
- applications: scope.

No new matching rules are needed.

## 3. CI or plain record, per category

The rule: **an object becomes a CI if you'd relate it to other CIs, assign it an owner or run CMDB processes on it.** Fine-grained or high-volume items stay plain records. **Observations are always plain records.** That avoids multiplying CIs by the number of environments.

| Category | Tracked object | Observations | Why |
|---|---|---|---|
| Instance | **CI** (exists) | — | The anchor for everything |
| Applications | **CI** (proposed class *SN Application*) | Plain | Owned and supported; relates to its tables; lines up with CSDM application services |
| Tables | **CI** (proposed class *SN Table*, the Z08 "table as a CI") | Plain | Owned, relates to its application and its columns; prod-data indicator (Z09) hangs off it |
| Plugins | **CI** (proposed class *SN Plugin*), one per plugin across all instances | Plain | Decided 2026-11-08: plugins stay in the CMDB, but as ~1,400 logical plugin CIs instead of one CI per plugin per instance. **Today the per-instance records are CIs** (about 5,500 on dev466156); they move to plain observations. |
| Columns | Plain, linked to its table object | Plain | ~800–1,200 per instance; detail of a table |
| System properties | Plain | Plain | Settings, not managed components |
| Clone preservers / exclusions | Plain | Plain | Rules; best shown on their table object (Z05) |
| Update sets | Plain | Plain | Delivery records; the object shows where each set has reached |
| MID servers | Plain | Plain | Specific to one instance; the object mostly has a single observation |

**CMDB impact:**

- **Count.** Today there are about 5,500 tracked CIs on dev466156 (plugins, one per instance). With this model there are about 2,250 (about 1,400 plugins + 800 applications + 40 tables), one CI per logical item regardless of how many instances, so the count no longer grows with each environment added.
- **Health and identification.** CMDB Health (H01) and identification work (Z10) apply to far fewer CIs. The IRE identifies application and table objects by scope or table name. They're no longer dependent on an instance, which is simpler than the dependent rules Z10 needed.

## 4. Drift status, stored on the object

After every collection or import, and in a daily job, Driftwood runs the same matching the matrix does and writes the result to each object:

| Field | Example |
|---|---|
| Drift status | same · differs · missing somewhere · single instance |
| Drift kinds | schema, config, clone, count, version, sys_id (when enabled) |
| Present on | 3 of 4 instances |
| Differs on | prod01 |
| Baseline | dev466156 (the same ordering rule as the matrix) |
| Last compared | 2026-11-08 02:20 |

The existing ignore rules still apply: expected differences, the app's own scope, version-only and count-only flags.

**What this enables:**

- Lists such as "all tables that differ on Prod" or "all properties missing somewhere", in **standard list views** with sort, filter, saved views and export.
- **Platform Analytics** indicators on stored fields (drift status × category × environment), with targets and thresholds. That answers the earlier question: analytics can take over trends, and runs and changes can have shorter retention.
- Notifications or tasks when a Prod object changes kind or status.

## 5. Screens

| Where | Shows |
|---|---|
| **Tracked object form** (new) | Header: drift status, kinds, present on, differs on. Related list: one observation per environment, with values, attributes and the open ↗ link. A side-by-side panel with the differing fields highlighted (one matrix row). Related objects: application → tables → columns. |
| **Category list modules** (G06, in progress) | *Tables*, *Columns*, *Plugins*… listing the **objects** with their drift status. A second module per category lists the per-environment observations. |
| **Instance CI form** (G06, in progress) | One related list per category: what this instance has. Plus collection runs and item changes. |
| **Drift Report page** | Unchanged for now; becomes the workspace drift view later (UI roadmap Tier 3). |

## 6. Migration from v0.5

1. **Schema.** Add the tracked object table, and later the *SN Application* and *SN Table* CI classes. Add an `object` reference on observations.
2. **Backfill.** Create objects from existing observations (one per category + key) and set the references. It's idempotent and dry-run first, like the installers.
3. **Plugins.** Move the plugin observations from the CI subclass to the plain table (a one-time migration script with a dry run). Retire the plugin CI subclass once it's empty.
4. **Writer.** Create the object on first sight of a key and set the reference on insert. The change-only behaviour is unchanged.
5. **Drift job.** Fill the object drift fields after each persist, and in a daily job.
6. **Compare and Drift Report.** Unchanged; they keep working from observations.

## 7. Decisions (2026-11-08)

1. **Three-layer model: adopted.**
2. **CI objects: applications, tables and plugins.** Each is one CI per logical item across all instances (*SN Application*, *SN Table*, *SN Plugin*). Columns, properties, clone rules, update sets and MID servers are plain object records.
3. **Per-instance plugin records leave the CMDB:** migrated to plain observations (a one-time, dry-run-first script in v0.6). The plugin CI subclass is retired once empty.
4. **Drift status:** recomputed for touched objects after every persist, plus a daily full pass.
5. **Prod drift:** list-only for now. Notifications, tasks or analytics thresholds come later, once the data has been watched for a while.

## 8. Suggested phasing

| Version | Scope |
|---|---|
| **v0.5.2** | Category list modules and instance-form related lists (G06, nearly done) |
| **v0.6** | Tracked objects (plain), observation references, backfill, stored drift status, object form and lists, plugin migration |
| **v0.7** | *SN Application*, *SN Table* and *SN Plugin* CI classes for those objects, relationships (App → Table → Column), IRE rules (replaces Z10's dependent-identification plan), CMDB Health check (H01) |
| **v1** | Workspace (UI roadmap Tier 3) on top of objects, observations and stored drift; Platform Analytics indicators |
