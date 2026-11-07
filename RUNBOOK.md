# Driftwood: Build, deploy and verification runbook

**App scope:** `x_2160899_driftw_0` (retargetable) · **Version:** v0.3.0 (POC + drift + table drift)
**Release matrix:** Brazil ✔ · Zurich ✔ · Australia (to do)

This runbook covers every procedure used to build, deploy and verify the app. All scripts are in the bundle, under `run-ready/` and `project/src/`.

---

## 1. Script inventory

| Script | Where it lives | Script scope | App picker | Writes? | Purpose |
|---|---|---|---|---|---|
| `background_dry_run.js` | `run-ready/`, `project/dist/` | **global** | any | No | Collector feasibility check on any instance. No app needed. |
| `export_snapshot.js` | `run-ready/`, `project/dist/` | **global** | any | One attachment | Collects any instance (no app needed) and saves an importable snapshot JSON (Procedure G) |
| `build_schema.js` | `run-ready/`, `project/src/background/` | **global** | **Driftwood** | Only with `DRY_RUN = false` | Roles and containment, all 4 tables, columns, choices |
| `install_code.js` | `run-ready/`, `project/dist/` | **global** | **Driftwood** | Only with `DRY_RUN = false` | 5 script includes (Config, Collector, Writer, Compare, Importer) plus 5 routing properties |
| `install_ui.js` | `run-ready/`, `project/dist/` | **global** | **Driftwood** | Only with `DRY_RUN = false` | ACLs, UI action, job, REST API (4 resources), 2 UI pages, menu, 5 modules. Elevate to **security_admin** for a live run. |
| `verify_collect.js` | `project/src/background/` | **Driftwood** (app) | any | **Yes** (change-only) | End-to-end collect, persist and routing counts (tests F01, F03, F06) |
| `diag_class_info.js` | `project/src/diagnostics/` | **global** | any | No | CMDB class hierarchy, extensibility, package, rows, identification rules |
| `diag_inherited_columns.js` | `project/src/diagnostics/` | **global** | any | No | Planned column names already inherited from parent classes |
| `diag_plugin_flag.js` | `project/src/diagnostics/` | **global** | any | No | How `sys_plugins.active` is stored on this release |
| `diag_customer_rule.js` | `project/src/diagnostics/` | **global** | any | No | What the customer-created rule counts, by package, scope, creator and year (v0.4) |
| `diag_customer_updates.js` | `project/src/diagnostics/` | **global** | any | No | Validates and times the update-history customer count (option 2) before it's turned on (v0.4.2) |
| `diag_update_sets.js` | `project/src/diagnostics/` | **global** | any | No | Checks update-set fields and origin/commit links, and times the counts (v0.5) |

### Conventions (all scripts)

- **Script scope** is the dropdown in *Scripts - Background*. **App picker** is the application picker in the top banner. They are different settings.
- **Run diagnostics in global.** Running them with the app scope selected auto-creates cross-scope privilege records in the app.
- **Installers default to `DRY_RUN = true`.** Always dry-run first, then set it to `false`.
- **Installers are idempotent.** They skip anything that exists, flag differences, and only overwrite with `UPDATE_EXISTING = true`. They refuse a live run if the app picker isn't Driftwood.
- **All server code is ES3-safe.** Global background scripts run at ES Level 0, where reserved words such as `private` and `boolean` can't be bare object keys.

---

## 2. Procedure A: Feasibility check on any instance (read-only)

1. Open *Scripts - Background* and set the script scope to **global**.
2. Paste and run `background_dry_run.js`.
3. Record:
   - the instance, release and patch lines
   - the per-category counts
   - **Warnings**: each one is a release or access finding
   - the duration

Optional: set `CATEGORIES = ['plugins']` to narrow the run, or `PRINT_FULL_JSON = true` to print everything.

**Brazil reference:** plugins 1,381 · apps 765 · MID 0 · props 17 · preservers 244 · exclusions 42 · 0 warnings · ~0.4 s.

---

## 3. Procedure B: Fresh build with installers

Use this on an instance without the app. Only the empty app is made by hand; everything else is scripted. The installers carry the scope they were generated for. To build under a different scope, retarget them first (section 3a).

| Step | Action | Expected |
|---|---|---|
| B1 | Create an **empty** custom app with the intended scope (for example `x_<code>_cfgnow`). Nothing else. | App exists |
| B2 | `build_schema.js` dry run, then live | Dry run on an empty app: `Would create: 8 role record(s), 4 table(s), 47 column(s), 15 choice(s)` (5 roles + 3 containment links). Live: the same as `Created:`, plus 4 × `VERIFY … OK`. **If the instance table insert fails, stop:** that means `cmdb_ci_appl_now_app` can't be extended on that release. |
| B3 | `install_code.js` dry run, then live | `Would create: 10` → `Created: 10`, with 5 `api_name` lines |
| B4 | **Elevate to security_admin**, then `install_ui.js` dry run, then live | `Would create: 25` → `Created: 25`. Base path `/api/<scope>/driftwood`. |
| B5 | Manual index: *Tables › `<scope>_tracked_item` › Database Indexes*: (`instance`, `item_category`, `item_key`), not unique | Index created. Don't add it on the CI table (shared CMDB storage). |
| B6 | Run Procedure D | |

On an instance where roles or the instance table were made by hand (like the original Brazil build), B2 skips them and creates only what's missing.

Optional pre-check before B2 on a new release: run `diag_inherited_columns.js`. Only `environment`, `version`, `fqdn`, `category` and `attributes` should show as inherited.

### 3a. Retarget to a different scope

ServiceNow can't change an existing app's scope. To move to another account or vendor prefix, rebuild with retargeted scripts:

```
python3 tools_build_for_scope.py x_<code>_<suffix>
```

This writes a complete copy of the project to `build/<scope>/`, with the scope replaced everywhere: table names, roles, properties, REST path, UI page, tests and docs. It regenerates the installers and puts paste-ready scripts in `build/<scope>/run-ready/`. Run the tests inside that copy before using it. The scope must be `x_<code>_<suffix>`, at most 18 characters.

Baseline JSON snapshots don't depend on scope, so they can be imported into the re-scoped app.

## 4. Procedure C: Deploy from Git and verify the import

1. On the target instance, create a Git credential, then *Studio › Import from source control* (repo `main` branch).
2. Note any warning about the app being built on a newer release.
3. Run the three installers in **dry-run** mode (script scope global, app picker Driftwood) as an import verifier:

| Verifier | Expected on a complete import |
|---|---|
| `build_schema.js` | `Would create: 0 table(s), 0 column(s), 0 choice(s). Skipped (already there): 51` |
| `install_code.js` | 3 × `SI … up to date`, 5 × `PROP … (already set)`, `unchanged: 8` |
| `install_ui.js` | 10 × `ACL … exists`, all else `up to date`, `unchanged: 20` |

Anything listed as CREATE or "differs" was dropped or changed by the import. To repair, re-run that installer live.

4. Run Procedure D.

**Zurich result:** all three verifiers were clean (94 records identical to Brazil), and `cmdb_ci_appl_now_app` is extensible.

---

## 5. Procedure D: Functional verification

### D1: Collect and persist, twice (F01 / F03 / F06)

Set the script scope to **Driftwood** (app scope), then run `verify_collect.js` **twice**:

```js
var t0 = new Date().getTime();
var snap = new ConfigNowCollector().collect();
gs.info('COLLECT ' + snap.duration_ms + ' ms, warnings: ' + JSON.stringify(snap.warnings));
for (var c in snap.categories) gs.info('  ' + c + ': ' + snap.categories[c].count);
gs.info('ENV read back: ' + (snap.instance.environment || '(not set on CI)') + '   release: ' + snap.instance.family + ' / ' + snap.instance.patch);
var res = new ConfigNowWriter().persist(snap);
gs.info('PERSIST total ' + (new Date().getTime() - t0) + ' ms');
gs.info('TOTALS ' + JSON.stringify(res.totals));
for (var k in res.categories) gs.info('  ' + k + ': ' + JSON.stringify(res.categories[k]));
gs.info('INSTANCE CI ' + res.instance_sys_id);

function cnt(t, q) { var ga = new GlideAggregate(t); if (q) ga.addEncodedQuery(q); ga.addAggregate('COUNT'); ga.query(); return ga.next() ? ga.getAggregate('COUNT') : '?'; }
gs.info('CI plugins      : ' + cnt('x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin'));
gs.info('CI parent (all) : ' + cnt('x_2160899_driftw_0_cmdb_ci_sn_tracked_table'));
gs.info('Plain items     : ' + cnt('x_2160899_driftw_0_tracked_item'));
gs.info('Plain by cat    : apps=' + cnt('x_2160899_driftw_0_tracked_item', 'item_category=applications') +
        ' props=' + cnt('x_2160899_driftw_0_tracked_item', 'item_category=system_properties') +
        ' pres=' + cnt('x_2160899_driftw_0_tracked_item', 'item_category=clone_preservers') +
        ' excl=' + cnt('x_2160899_driftw_0_tracked_item', 'item_category=clone_exclusions'));
gs.info('Instance CIs    : ' + cnt('x_2160899_driftw_0_cmdb_ci_sn_instance'));
```

| Check | Expected |
|---|---|
| Run 1 (fresh instance) | `TOTALS {"inserted":≈all items,…}`. First-run "Security restricted … added to cross scope privileges" lines are expected (F02). |
| Run 2 (nothing changed) | `TOTALS {"inserted":0,"updated":0,"unchanged":<all>,"removed":0,"restored":0}` |
| Routing | CI plugins = plugin count. Plain items = apps + props + preservers + exclusions. **Instance CIs = 1.** |

**Brazil reference:** run 1 inserted 2,449 in 16.4 s; run 2 wrote 0 in 0.875 s.

### D2: Change detection (F04)

1. Change `glide.ui.session_timeout` (for example 30 → 31) in `sys_properties.list`.
2. Run D1 once. Expect `system_properties: {"updated":1,…}` and everything else unchanged.
3. Revert the value and run again. Expect `updated: 1` again.

### D3: Environment preserved (F05)

1. Open the instance CI and set **Environment** to Development. Save.
2. Run D1. `ENV read back:` should show the value, and the CI field should still be set afterwards. The collector never writes it.

### D4: UI and API checks

Refresh the browser first.

| Check | Expected |
|---|---|
| *Driftwood › Current Instance Settings* | Instance cards plus 6 tabs with the D1 counts |
| Instance CI › **Collect now** | "0 new, 0 changed … unchanged" |
| *REST API Explorer* › namespace `x_2160899_driftw_0` › Driftwood › `GET /current` | 200 with the JSON snapshot |

A bare browser URL to `/api/x_2160899_driftw_0/driftwood/current` returns **"User is not authenticated"** on Brazil. That's expected: use the page or REST API Explorer.

### D5: Scheduled job

The next day, check that the instance CI's **Last collected** shows ~02:15 and **Collection status** = completed.

---

## 5a. Procedure E: Cross-instance drift (v0.2)

### Upgrade an existing v0.1.2 install

Script scope global, app picker set to the app, dry run first.

| Step | Script | Expected dry run |
|---|---|---|
| E1 | `install_code.js` with **`UPDATE_EXISTING = true`** | `Would create: 2` (Compare, Importer), `would update: 2` (Config, Writer), `unchanged: 6` |
| E2 | Elevate, then `install_ui.js` | `Would create: 5` (3 REST resources, `drift_report` page, Drift Report module), `unchanged: 20` |

A fresh build (Procedure B) gets everything in one pass.

### E3: Import snapshots

1. On each source instance: *Current Instance Settings › Download JSON*.
2. On the comparing instance: *Driftwood › Drift Report › Import snapshots…* and choose one or more files. Each file becomes its own instance CI, timestamped with the snapshot's collection time.
   - Re-importing the same file writes nothing.
   - An **older** snapshot than what's stored is refused unless *Allow older snapshot* is ticked.
   - Requires `configuration_admin`. `POST /api/<scope>/driftwood/snapshot` does the same from a script or REST client.

### E4: Compare

1. Pick **Instance A** and **Instance B**, then **Compare**.
2. Summary cards show Changed, Only in A, Only in B, Same and Ignored (expected). Click a card to filter, use a category tab to narrow, or the search box to find a key.
3. Changed rows highlight the differing fields (value, version, state or attributes). Secret properties show only `secure_value`, never a value.
4. **Download result** saves the comparison JSON (`driftwood.compare/0.1`).

### E5: All instances (v0.2.2)

*Drift Report › **All instances***. Every instance is a column, so one row per item shows each instance's value side by side.

- **Column order is fixed:** the current instance first, then names listed in `<scope>.instance_order` (comma-separated, `ignore_cache = true`), then by Environment (dev → test → QA → UAT → staging → sub-prod → pre-prod → prod → unset), then by name. The two-instance dropdowns use the same order.
- **The current instance is always shown.** Its chip is locked on, and it's the **baseline**: a sticky column that stays visible while you scroll sideways. Every other column is compared against it. If the baseline doesn't have an item, the first column that does is the reference for that row.
- **Row types:** *Differs* (present everywhere, some value differs), *Missing somewhere* (absent on at least one column), and *Version only* (every difference is a version). Same-everywhere rows are counted, not listed.
- **Per-instance line:** for each column, how many items are changed, missing or extra compared with the baseline.
- Untick an instance chip to drop its column. Category tabs, search, the status cards and **Hide version-only changes** all work as in two-instance mode. **Download result** saves `driftwood.matrix/0.1`.
- API: `GET /matrix[?instances=a,b,c][&categories=…]` (configuration_read). Leave out `instances` to compare all.

### What counts as drift (v0.2.1)

- Items are compared **field by field** (value, version, state, attributes), not by stored hash. Snapshots from older collector versions therefore compare correctly.
- **Version only:** a Changed row where only the version differs is flagged *Version only*, which usually means release or Store-update drift. **Hide version-only changes** removes those rows, so configuration drift stands out across release families.
- **Vendor** is shown but never counts as drift. It flips between empty and "ServiceNow" for the same app across releases. From v0.2.1 it's also left out of the change-tracking hash, so the first collection after upgrading reports a one-time update for most application records.
- **The app's own record** (its scope, and the scope that collected each side) is ignored automatically. Snapshots made before v0.2.1 don't record their collector scope. For those, add `applications|x_<old scope>` to `compare_ignore`.
- **This instance's own snapshot** is refused on import unless *Allow this instance's own snapshot* is ticked (`?allow_local=true`). Its CI belongs to the local collector.

### Expected differences

`system_properties|glide.servlet.uri` is ignored by default. Add more as comma-separated `category|item_key` pairs in the property `<scope>.compare_ignore`. That property is read on each comparison. Create it with `ignore_cache = true` to avoid a platform cache flush when you change it.

### API

| Resource | Role | Purpose |
|---|---|---|
| `GET /instances` | configuration_read | Instance CIs available to compare (local and imported) |
| `GET /compare?a=&b=[&categories=]` | configuration_read | Drift result. `a`/`b` = instance name or sys_id. |
| `GET /matrix[?instances=][&categories=]` | configuration_read | All-instances comparison, in fixed column order |
| `POST /snapshot[?force=true][&allow_local=true]` | configuration_admin | Import a snapshot (body = snapshot JSON) |

## 5b. Procedure F: Table configuration drift (v0.3)

A new **Tables** category: one item per tracked table, with record counts and a schema fingerprint. It appears in Current Instance Settings, both Drift Report modes and the API, like any other category.

### What's tracked
1. **Curated list** (`ConfigNowConfig.curatedTables`, 35 platform-configuration tables): business rules, script includes, client and fix scripts, UI policies, actions, pages and scripts, ACLs, roles and role containment, dictionary, tables, choices, properties, scheduled jobs, flows and actions, workflows, REST/SOAP messages and scripted REST, notifications and script actions, transform maps, data sources, portal widgets and pages, menus and modules, reports, custom and store apps.
2. **Every custom table**, found automatically: names starting `x_` or `u_`. The app's own tables and remote (scriptable) tables are skipped. At most 500 are counted, with a warning if there are more.
3. **Driftwood › Tracked Tables** (`<scope>_sn_cmdb_table_config`): a row with **Active** ticked adds a table; a row with **Active** unticked stops a curated or auto-discovered table from being tracked. Needs `configuration_admin`.

A tracked table that doesn't exist on an instance is reported with state **absent**.

### What's measured
| Attribute | Meaning |
|---|---|
| `total` | Row count. Includes rows of tables that extend it, e.g. a CI class counts its subclasses. |
| `customer` | Rows in the **Global package or an `x_` app**, the heuristic for "not delivered by ServiceNow". Only for tables with `sys_package`/`sys_scope` (metadata); blank otherwise. |
| `column_count`, `parent`, `fingerprint` | The table's own columns (`name:type:length`, sorted) and parent, hashed. Inherited columns belong to the parent's row. |
| column list | Stored for drill-in. When the fingerprint differs, the Drift Report lists **columns +** (added) and **columns −** (removed) against the baseline or other side. Lists over about 3,900 characters are truncated and marked. |

**Drift rule: exact.** Any difference in `total`, `customer` or the schema is drift. `source` (curated, custom or manual) is not compared.

### Upgrade an existing v0.2.x install
Script scope global, app picker set to the app, dry run first:

| Step | Script | Expected dry run |
|---|---|---|
| F1 | `build_schema.js` | `Would create: 0 role record(s), 1 table(s), 3 column(s), 2 choice(s)` (Tracked Tables, plus the `tables` choice on both tracked tables) |
| F2 | `install_code.js` with `UPDATE_EXISTING = true` | `would update: 4` (Config, Collector, Writer, Compare) |
| F3 | Elevate, then `install_ui.js` with `UPDATE_EXISTING = true` | `Would create: 6` (5 ACLs, Tracked Tables module), `would update: 2` (both pages) |
| F4 | **Collect now** on the instance CI | About 35 or more `tables` items inserted. The first run logs one "Security restricted … cross scope privileges" line per new global table read. That's expected, and they're the app's dependency footprint. |

### Comparing with older snapshots
Snapshots from collectors before v0.3 contain no table data. In comparisons those columns show **not collected** (not *missing*), and a category with fewer than two collected instances shows a note instead of rows. Collect on each instance with v0.3 or later, then download and import new snapshots, to compare tables across instances.

## 5c. Procedure G: Export a snapshot from any instance (no app needed)

`export_snapshot.js` contains the full collector, all categories including **Tables**. It runs in *Scripts - Background* with scope **global** on any instance, with or without the app.

1. Paste and run it. The output lists counts per category and any warnings.
2. It saves the snapshot as **one attachment on your own user record**. That's the only record it writes; set `ATTACH = false` for a report-only run. The output prints a **Download** link (`…/sys_attachment.do?sys_id=…`).
3. On the comparing instance: *Drift Report › Import snapshots…* and choose the file.
4. Delete the attachment afterwards. The output names its sys_id.

Notes:
- The snapshot is the same format as *Download JSON*. `collector_version` ends in `-exporter`, and `collector_scope` is empty.
- Secure values use the default salt (`cfgnow-poc`), matching app instances that haven't overridden `<scope>.secure_hash_salt`.
- The background script is logged in full to `sys_script_execution_history`, as usual. It contains no credentials.
- On an instance without the app, the Tracked Tables list doesn't exist, so the export uses the curated list plus auto-discovered `x_`/`u_` tables.

## 5d. Procedure H: Table definitions, columns and drift kinds (v0.4)

### What's new
| Area | Change |
|---|---|
| **Tables** | Each table item now also carries its `sys_db_object` definition: `scope`, `package`, `extensible`, `extension_model`, `accessible_from`, `caller_access`, `can_read/create/update/delete`, `web_service_access`, `allow_configuration`, `allow_new_fields`, `create_access_controls`, `live_feed`, `remote_table`, `auto_number`, `user_role`. Fields a release doesn't have are left out. References are stored as names, never sys_ids. |
| **Clone flags** | `clone_exclusion_rules` and `clone_preserver_rules`: the number of **active** clone rules naming that table (direct match only; a rule on a parent table isn't counted for its children). |
| **Columns** (new category) | One item per `sys_dictionary` entry of each tracked table (own columns only), key `<table>.<column>`. Attributes: `type`, `max_length`, `reference`, `mandatory`, `read_only`, `unique`, `active`, `display`, `calculated`, `function_field`, `choice`, `dependent`, `default_value`, `dictionary_attributes`, `scope`, `table`. The label is the item name and isn't compared (labels are translated). Default values and attribute strings over 500 characters are stored as the first 200 characters plus length and a hash, so a change is still detected. Routed to the plain `tracked_item` table. |
| **Drift kinds** | Each difference row lists its `kinds`: `schema` (definition or columns), `count` (`total`, `customer`), `clone` (clone flags), `config` (other categories), `version`. A row whose only differences are counts is **count-only**; the Drift Report has a **Hide count-only changes** toggle, and schema rows get a **Schema** label. |
| **Older snapshots** | An attribute reported by only one side (a v0.3 snapshot has no definition or clone fields) is not compared, so there's no false drift. Columns show *not collected* for v0.3 snapshots. |
| **Customer rule** | Still the v0.3 rule by default, now overridable with `<scope>.customer_query` (an encoded query). `diagnostics/diag_customer_rule.js` (global, read-only) shows what the rule is counting, to choose a better default. |

### Upgrade an existing v0.3.x install
Script scope global, app picker set to the app, dry run first:

| Step | Script | Expected dry run |
|---|---|---|
| H1 | `build_schema.js` | `Would create: 0 role record(s), 0 table(s), 0 column(s), 2 choice(s)` (the `columns` choice on both tracked tables) |
| H2 | `install_code.js` with `UPDATE_EXISTING = true` | `would update: 3` (Config, Collector, Compare). Writer, Importer and the 5 properties unchanged. |
| H3 | Elevate, then `install_ui.js` with `UPDATE_EXISTING = true` | `Would create: 0`, `would update: 2` (both UI pages) |
| H4 | **Collect now** | Columns: one item per own column of each tracked table (about 800 on a PDI with the curated list). Tables: every item updated once (new attributes), then unchanged on the next run. No new cross-scope privileges are expected: every table it reads is already in the footprint. |
| H5 | Hard refresh both pages | Current settings: a **Columns** tab, and Scope and clone columns on **Tables**. Drift Report: **Hide count-only changes**. |
| H6 | Run `diag_customer_rule.js` (global) and paste the output | Used to pick the new customer rule (d21). |

To compare columns across instances, every instance needs a v0.4 collection or a v0.4 `export_snapshot.js` export.

### v0.4.1: page updates (install_ui.js only)
| Change | Detail |
|---|---|
| **Collect now on the page** | *Current Instance Settings* has a **Collect now** button: collects and saves (new `POST /collect`, role `configuration_admin`, checked in the script), shows the totals and reloads. **Refresh** still only re-reads live values. |
| **Sort and filter per column** | Click a column heading to sort (again to reverse; numbers sort numerically). The filter row under the headings filters per column: `text` contains, `=text` equals, `!text` doesn't contain, `>n` / `<n` numeric, `empty` / `!empty`. Sort and filters are kept per tab. |
| **Dark mode** | Both pages follow the surrounding theme, with an explicit background so they're readable either way. The **Light/Dark** button overrides it (remembered per browser). |

Upgrade from v0.4.0: elevate, then `install_ui.js` with `UPDATE_EXISTING = true`. Expected dry run: `Would create: 1, would update: 2` (the `/collect` operation and both pages). `build_schema.js`, `install_code.js` and `export_snapshot.js` are unchanged from v0.4.0.

### v0.4.2: customer counts split (option 1) and update-history count prepared (option 2)
The single `customer` count over-counted out-of-box records (findings d21, d27). Tables now carry:

| Attribute | Rule | Quality |
|---|---|---|
| `customer_scoped` | Rows in an `x_` application scope, **excluding this app's own scope** (`<scope>.customer_scoped_query`) | Exact |
| `customer_global` | Rows in the Global package **not** created by `system`, `maint`, `glide.maint`, `guest`, `*@snc*` or `*.maint*` (`<scope>.customer_global_query`) | Estimate: plugin activations run as admin, and some ServiceNow staff accounts, still count. Shown as *Global custom (est.)*. |
| `customer_updates` | Records whose **current** version (`sys_update_version`) came from a customer update set (`sys_update_set`, `sys_remote_update_set`). Update names of longer tables sharing the prefix are excluded. | Precise, but **off** until validated: `<scope>.customer_history = true` turns it on |

All three are *count* drift. Older snapshots still carry `customer`; it isn't compared with the new attributes, so there's no false drift. Data tables report `null`.

**Before turning on option 2:** run `diagnostics/diag_customer_updates.js` (global, read-only) on a PDI and, if possible, on a long-lived non-production instance. It checks the `sys_update_version` fields and values the method relies on, prints the three counts per tracked table side by side, and times each history count. Turning it on adds `sys_update_version` to the app's cross-scope read footprint.

Upgrade from v0.4.1 (script scope global, app picker Driftwood, dry run first):

| Step | Script | Expected dry run |
|---|---|---|
| 1 | `build_schema.js` | Nothing to create (unchanged) |
| 2 | `install_code.js` with `UPDATE_EXISTING = true` | `would update: 3` (Config, Collector, Compare) |
| 3 | Elevate, then `install_ui.js` with `UPDATE_EXISTING = true` | `would update: 1` (Current Instance Settings page: new count columns). If v0.4.1 wasn't deployed yet: `Would create: 1, would update: 2`. |
| 4 | **Collect now** | About 35 table items changed (customer counts replaced), everything else unchanged |

## 5e. Procedure I: History, update sets, source links and sys_id drift (v0.5)

### What's new
| Area | Change |
|---|---|
| **Collection runs** (`collection_run`) | One row per collection or import: run ID, instance, source (local / import), mode (full / incremental), collected and saved times, collector version, categories, **baseline categories**, totals, warnings, update-set watermark, and the **snapshot JSON attached** (`keep_snapshots`, default on). |
| **Item changes** (`item_change`) | One row per item **added / changed / no longer present / restored**, with the changed fields and the before/after value, version, state and attributes, linked to its run (`log_changes`, default on). A category's first load on an instance is its **baseline**: recorded on the run, no change rows. |
| **Retention** | Daily job *Driftwood - Purge history* (03:15) deletes runs, their changes and snapshots older than the retention period: the instance CI's **History retention (days)** if set, else `<scope>.retention_days` (default **180**). The latest run of each instance is always kept; current tracked items are never touched. `new ConfigNowRetention().purge({ dryRun: true })` previews it. |
| **Update sets** (new category) | Local (`sys_update_set`) and retrieved (`sys_remote_update_set`) sets, **one item per originating set** (`origin:<sys_id where it was built>`), so a set built on Dev and committed on Test lines up. A committed local copy is folded into its retrieved set. Each application's Default set is `default:<scope>`. Attributes: application, local/retrieved state, update counts, parent, base set, default flag, preview errors/warnings/unresolved; dates and creator are shown but not compared. |
| **Incremental update sets** | The first run collects all sets. Later runs through the job / Collect now read only sets changed since the last run's watermark (60-minute overlap) plus every open set; a full sweep runs every 7 days (`<scope>.update_sets_full_days`) so deleted sets are noticed. Incremental runs never mark sets as removed. The live page read and the exporter always collect everything. |
| **Source links** | Every tracked item (and change row) stores `source_table` and a **Source record** URL to the record on its own instance. Existing items get it on their next collection without counting as a change. The pages show an **open ↗** link. |
| **sys_id drift** (optional) | **Check sys_id drift** on the Drift Report (or `sys_ids=true` on `/compare` and `/matrix`, or `<scope>.compare_sys_ids = true` as the default) flags items whose source record has a different sys_id on another instance: usually created by hand instead of promoted by update set. MID servers and update sets are never checked. |

### Upgrade an existing v0.4.x install
Script scope global, app picker set to the app, dry run first:

| Step | Script | Expected dry run |
|---|---|---|
| I1 | `build_schema.js` | `Would create: 0 role record(s), 2 table(s), 33 column(s), 19 choice(s)` (the two history tables, retention + link columns, the `update_sets` choice and the history choices) |
| I2 | `install_code.js` with `UPDATE_EXISTING = true` | `Would create: 1` (ConfigNowRetention), `would update: 4` (Config, Collector, Writer, Compare) |
| I3 | Elevate, then `install_ui.js` with `UPDATE_EXISTING = true` | `Would create: 9` (6 history ACLs, purge job, 2 modules), `would update: 7` (UI action, collect job, `/compare`, `/matrix`, `/collect`, both pages). From v0.4.0 add `/collect` to the creates. |
| I4 | Run `diagnostics/diag_update_sets.js` (global) | Checks the fields and links the update-set model relies on and times the counts. Paste the output before relying on update-set drift. |
| I5 | **Collect now** | A run is recorded; **update_sets** is a baseline (all sets inserted, no change rows); other categories log only real changes; links are filled in silently. |
| I6 | Collect now again | `0 new, 0 changed`; the run says *incremental* and logs 0 changes. |
| I7 | Menu | **Collection Runs** and **Item Changes** list modules (standard list views: sort, filter, export). |

To compare update sets across instances, every instance needs a v0.5 collection or a v0.5 `export_snapshot.js` export (the exporter always collects all sets).

### v0.5.5: installers refuse to run outside global scope
`build_schema.js`, `install_code.js`, `install_ui.js`, `export_snapshot.js` and every diagnostic now check the **script scope** first. Unless it is global, they stop before touching any table or API:
- installers and the exporter print `ABORT: set the script scope (Scripts - Background) to global …`;
- diagnostics throw an error with the same advice.

This is because a run in an app scope (even a dry run) adds every table and API it touches to that app's cross-scope privileges (finding d37). The *application picker* must still be Driftwood for the installers; the two settings are separate.

No instance changes: replace your copies of the scripts. `verify_collect.js` and `background_dry_run.js` are unchanged, because they are meant to run in the app scope.

### v0.5.4: list layouts (install_ui.js only)
Default-view list layouts, so lists and related lists open with useful columns:

| Table | Columns |
|---|---|
| Item Changes | Changed on, Instance, Category, Item key, Item name, Change, Changed fields, Run, Source record |
| Collection Runs | Run ID, Instance, Source, Mode, Collected at, Changes logged, Baseline categories, Totals, Warnings, Snapshot attached |
| Tracked items (plain) | Instance, Category, Name, Item key, Value, Version, State, Last changed, Source record |
| Tracked plugins (CI) | Instance, Name, Item key, Version, State, Last changed, Source record |
| Instances | Name, Environment, Family, Patch, Last collected, Collection status, Nodes |

A layout is created when missing. A layout that exists with other columns (for example one you personalised) is reported and left alone, unless `UPDATE_EXISTING = true`, which replaces it.

Upgrade from v0.5.3: elevate, then `install_ui.js` with `UPDATE_EXISTING = true`. Expect 5 `LIST` lines, each CREATE or UPDATE depending on whether the table already had a default layout, and nothing else.

### v0.5.3: rebrand to Driftwood
Everything that said ConfigurationNOW now says **Driftwood**:
- menu, pages, messages and log lines;
- job names, role descriptions and script include descriptions;
- export file names (`driftwood_<instance>_<time>.json`).

Two identifiers changed:

| Identifier | Before | After | Compatibility |
|---|---|---|---|
| REST API path | `/api/<scope>/configurationnow/...` | `/api/<scope>/driftwood/...` | The installer creates the new API with all 6 operations and **deactivates** the old one (not deleted). Anything outside the pages that called the old path must switch. |
| Snapshot format id | `configurationnow.snapshot/0.1` | `driftwood.snapshot/0.1` | Same format. Files exported before the rename still import. Compare/matrix downloads are now `driftwood.compare/0.1` / `driftwood.matrix/0.1`. |

Unchanged on purpose: the script include classes (`ConfigNow*`), table names, roles and the app scope.

The installer **renames existing records in place**: the menu (so modules stay attached) and both scheduled jobs (so nothing runs twice). A re-run changes nothing.

Upgrade from v0.5.2 (script scope global, app picker Driftwood, dry run first):

| Step | Script | Expected dry run |
|---|---|---|
| 1 | `build_schema.js` | Nothing to create (descriptions of existing roles are relabelled by `install_ui.js`) |
| 2 | `install_code.js` with `UPDATE_EXISTING = true` | `would update: 6` (all script includes: renamed messages, format ids, descriptions) |
| 3 | Elevate, then `install_ui.js` with `UPDATE_EXISTING = true` | `Would create: 7` (the `/driftwood` API + 6 operations), `would update: 14`:<br>• menu rename 1<br>• job renames 2 + job scripts 2<br>• old API deactivated 1<br>• UI action 1<br>• both pages 2<br>• the 5 role descriptions |
| 4 | Hard refresh | Menu says **Driftwood**; pages load (they call `/driftwood`); Collect now still works |
| 5 | Re-run `install_ui.js` | `Created: 0, updated: 0` |

### v0.5.2: category lists and instance-form related lists (install_ui.js only)
- **Menu:** one list module per category (*Plugins*, *Applications*, *System Properties*, *Clone Preservers*, *Clone Exclusions*, *Tables*, *Columns*, *Update Sets*, *MID Servers*). Each opens the stored records for that category (`present=true`) in a standard list view: sort, filter, group, export, and the **Source record** link to the real record. The table comes from the routing property, so plugins open the CI list and the rest the plain table.
- **Instance CI form:** one related list per category (scripted relationships *Driftwood: <Category>*, filtered on that instance), plus **Collection Runs** and **Item Changes**.
- Upgrade from v0.5.1: elevate, then `install_ui.js` with `UPDATE_EXISTING = true`. Expected dry run: `Would create: 30, would update: 0` (9 modules, 9 relationships, the instance form's related-list record and 11 entries). If the instance form already has a personalised related-list record, it's reused (29 creates).
- These are the per-environment views. The per-object view (open *incident*, see every environment) comes with the v0.6 data model (`poc/Data-model-proposal.md`).

### v0.5.1: sys_id drift limited to categories where it means something
Measured on the Brazil (dev465827) and Australia (dev431461) exports: `sys_plugins`, `sys_db_object` and `sys_dictionary` records get a **new sys_id on every instance** (1,359 plugins, 35 tables, 819 of 822 columns differed between two untouched PDIs), while store apps, custom apps and clone rules keep theirs. Plugins, tables and columns are therefore excluded from the sys_id check by default, alongside MID servers and update sets (`<scope>.sys_id_exclude` overrides the list). On those two exports the check now flags only 2 properties that were created separately on each instance.

Upgrade from v0.5.0: `install_code.js` with `UPDATE_EXISTING = true` → `would update: 2` (Config, Compare). Nothing else changed. From v0.4.x, follow the Procedure I steps with this package; the counts are the same.

## 6. Release matrix

| Release | Dry run (A) | Git import (C) | D1 run 1 | D1 run 2 | UI (D4) | Notes |
|---|---|---|---|---|---|---|
| Brazil patch1-hotfix1 | ✔ 0 warnings | n/a (built here) | ✔ 2,449 inserted | ✔ 0 writes | ✔ | `sys_plugins.active` is boolean |
| Zurich patch13 | ✔ (in-scope run, 0 warnings) | ✔ 94/94 identical | ✔ | ✔ 0 writes, 2,345 unchanged, 785 ms | ✔ | `cmdb_ci_appl_now_app` extensible. Plugins 1,330 · apps 730 · props 17 · preservers 226 · exclusions 42 |
| Australia | to do | to do | to do | to do | to do | |

---

## 7. Changing the app

1. Edit the files under `project/src/` (script includes, UI action, job, REST, page).
2. Regenerate the installers: `python3 tools_gen_install.py`. `install_code.js` and `install_ui.js` embed the sources byte-for-byte.
3. Run the ES3 check: `node tests/es3_strict_check.js <files>`. It must report OK for every server script.
4. Run the tests: `test_poc.js`, `test_schema.js`, `test_install.js`, `test_install_ui.js` and `test_verify_collect.js`.
5. Deploy: run the installer live with `UPDATE_EXISTING = true`, or commit on the instance and push via Git.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `invalid property id … Script ES Level: 0` | ES3 reserved word used as an object key or member (`private`, `boolean`, …) | Quote the key. Run `es3_strict_check.js` before every deploy. |
| `Function print is not allowed in scope …` | Script run with the app scope selected | Use global, or `gs.info` |
| "Security restricted … added to cross scope privileges" | First scoped access to a global table or API | Expected. These records are the app's dependency footprint. |
| Installer: "Application picker is not Driftwood" | App picker on another app | Switch the picker and re-run |
| ACL inserts fail | Not elevated | Elevate to security_admin and re-run `install_ui.js` |
| Plugins = 0 | Release stores `active` differently | Run `diag_plugin_flag.js`. The collector normalises `active`/`true`/`1`. |
| Slow saves on `sys_properties` | Every property write flushes the platform cache (1–7 s) | Expected. Avoid runtime property writes, and use `ignore_cache = true`. |
| Querying `v_plugin` takes ~17 s | Catalog cache rebuild | Never use `v_plugin`; use `sys_plugins` |
| REST URL in the browser: "User is not authenticated" | Scripted REST refuses a bare session cookie | Use the report page or REST API Explorer |
| Need to know who ran what | Every background script is logged in full to `sys_script_execution_history` | Never put credentials or secrets in a background script |

---

## Appendix: Dependency footprint (cross-scope privileges)

- **Read:** `sys_properties`, `sys_cluster_state`, `sys_plugins`, `sys_store_app`, `sys_app`, `ecc_agent`, `sys_scope`, `clone_data_preserver`, `clone_data_exclude`
- **Execute:** Glide properties API, `GlideDigest.getSHA256Hex`, `GlideRecord.setValue` / `insert` / `update`
