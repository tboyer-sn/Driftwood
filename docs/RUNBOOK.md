# Driftwood: Build, deploy and verification runbook

**App scope:** `x_2160899_driftw_0` (retargetable) · **Version:** 0.6.0 (objects, stored drift, Health) · **Updated:** 2026-11-08
**Release matrix:** Brazil ✔ (app) · Zurich ✔ (app, v0.2) · Australia ✔ (export only)

This runbook covers every procedure used to build, deploy and verify the app. The scripts are in the package: paste-ready copies are in `run-ready/` and the sources in `src/`. Procedures A–I build up the app version by version; **Procedure J** (section 5f) is v0.6. For a new instance use Procedure B (scripts) or C (Git).

---

## 1. Script inventory

| Script | Where it lives | Script scope | App picker | Writes? | Purpose |
|---|---|---|---|---|---|
| `background_dry_run.js` | `run-ready/`, `project/dist/` | **global** | any | No | Collector feasibility check on any instance. No app needed. |
| `export_snapshot.js` | `run-ready/`, `project/dist/` | **global** | any | One attachment | Collects any instance (no app needed) and saves an importable snapshot JSON (Procedure G) |
| `build_schema.js` | `run-ready/`, `src/background/` | **global** | **Driftwood** | Only with `DRY_RUN = false` | Roles and containment, the 8 tables, columns, choices |
| `install_code.js` | `run-ready/`, `dist/` | **global** | **Driftwood** | Only with `DRY_RUN = false` | The 10 script includes, 3 fix scripts (installed, not run), 6 routing properties |
| `install_ui.js` | `run-ready/`, `dist/` | **global** | **Driftwood** | Only with `DRY_RUN = false` | 24 ACLs, 2 UI actions, 4 jobs, REST API (7 resources), 3 UI pages, menu and modules, relationships, related lists, list and form layouts. Elevate to **security_admin** for a live run. |
| Fix scripts | in the app (*System Definition › Fix Scripts*) | app | n/a | **Yes** (idempotent) | *Backfill tracked objects*, *Move plugins off the CMDB*, *Recompute all drift*. Each has a dry run you can call from Scripts - Background in the Driftwood scope. |
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
| B2 | `build_schema.js` dry run, then live | Dry run on an empty app: `Would create: 8 role record(s), 8 table(s), 102 column(s), 53 choice(s)` (5 roles + 3 containment links). Live: the same as `Created:`, plus 8 × `VERIFY … OK`. **If the instance table insert fails, stop:** that means `cmdb_ci_appl_now_app` can't be extended on that release. |
| B3 | `install_code.js` dry run, then live | `Would create: 19` → `Created: 19` (10 script includes with their `api_name` lines, 3 fix scripts, 6 properties) |
| B4 | **Elevate to security_admin**, then `install_ui.js` dry run, then live | `Would create: 111` → `Created: 111`. Base path `/api/<scope>/driftwood`. |
| B5 | Manual index: *Tables › `<scope>_tracked_item` › Database Indexes*: (`instance`, `item_category`, `item_key`), not unique | Index created. Don't add it on the CI table (shared CMDB storage). |
| B6 | Run Procedure D, then open *Driftwood › Health* | Health: *Healthy (notes)* once a collection has run |

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

This is also the **release install on personal developer instances**, where the application repository is disabled (d38 amended).

1. On the target instance, create a Git credential, then *Studio › Import from source control* (repo `main`, or a release tag such as `v0.6.0`).
2. Note any warning about the app being built on a newer release.
3. Run the three installers in **dry-run** mode (script scope global, app picker Driftwood) as an import verifier:

| Verifier | Expected on a complete import |
|---|---|
| `build_schema.js` | `Would create: 0 role record(s), 0 table(s), 0 column(s), 0 choice(s)`, everything *exists* |
| `install_code.js` | 10 × `SI … up to date`, 3 × `FIX … up to date`, 6 × `PROP … (already set)`: `Would create: 0, would update: 0` |
| `install_ui.js` | 24 × `ACL … exists`, everything else *up to date*: `Would create: 0, would update: 0` |

From v0.6, *Driftwood › Health* checks the same things without the installers (tables, script includes, fix scripts, roles, ACLs, jobs, REST, the 59 privileges). On a fresh instance it shows notes plus *Last collection: never collected* until **Collect now** has run.

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

## 5f. Procedure J: Tracked objects and stored drift (v0.6)

Built on branch `0.6.0` step by step (checklist O01–O09); see `v0.6-plan.md`.

### O01: Tracked Object table, Object references, Objects menu

New table **Tracked Object** (`<scope>_tracked_object`): one row per category + key across all instances. `object_key` (`<category>|<key>`) is unique. The drift fields stay empty until the drift engine (O03) runs. The observation tables (`tracked_item`, the tracked CI table and so its plugin subclass) and `item_change` gain an **Object** reference, empty until the backfill (O02).

Run in global scope, application picker on Driftwood:

| Step | Script | Expected |
|---|---|---|
| J1 | `build_schema.js` dry run, then live | `1 table(s), 19 column(s), 14 choice(s)`, no warnings. Re-run: all zero. |
| J2 | `install_code.js` dry run, `UPDATE_EXISTING = true` | `ConfigNowConfig` differs (new `object` table entry, version `0.6.0-dev`); live run updates it. |
| J3 | Elevate, `install_ui.js` dry run, `UPDATE_EXISTING = true` | `Would create: 18, would update: 3`: 3 ACLs, the **Objects** section plus 13 lists, the object list layout; the plain, plugin and item change layouts gain the Object column. Live run, then re-run: `Created: 0, updated: 0`. |
| J4 | Check | *Driftwood › Objects › All Objects* opens an empty list with the new columns. The Object column is empty on observations. |
| J5 | Studio | Commit on `0.6.0`: "O01 tracked object table". |

### O02: Linking observations to objects, and the backfill

New script include **ConfigNowObjects**. On every collection or import, the **Writer** links each observation it writes, or finds without a link, to its object, creating the object the first time a category + key is seen. A column also points at its table's object (*parent object*).

**Inherited columns (Z12):** a column whose element also exists on a tracked parent table (from the tables category's `parent`) is inherited and gets **no object**; the parent's column stands for it. The rule uses the observations only, so imported snapshots work and no item hash changes. On Brazil this is the 96 columns the plugin class repeats from the tracked-item class.

New fix script **Driftwood - Backfill tracked objects** links everything already stored, for every instance. It only creates objects and fills empty Object references; re-running it changes nothing. Installs from the application repository run it automatically.

| Step | Where | Expected |
|---|---|---|
| J6 | `install_code.js`, global scope, `UPDATE_EXISTING = true`, dry run then live | `SI ConfigNowWriter UPDATE`, `SI ConfigNowObjects CREATE`, `FIX Driftwood - Backfill tracked objects CREATE (not run)`: `Would create: 2, would update: 1`. |
| J7 | Scripts - Background, **script scope Driftwood**: `gs.info(new ConfigNowObjects().backfill({ dryRun: true }).text);` | One line per instance (`would link N`, plus inherited columns), per-category counts, and `Would create: <objects>; would link: <observations>; already linked: 0`. Nothing is written. Roughly 3,700 objects for 4 instances. |
| J8 | *System Definition › Fix Scripts › Driftwood - Backfill tracked objects › Run Fix Script › Proceed in background* | Finishes in a few minutes (each plugin CI update runs the CMDB business rules). Output in *System Logs › Script Log Statements*: `Created: <objects>; linked: <observations>`. |
| J9 | Re-run J7 | `Would create: 0 object(s); would link: 0; already linked: <all>`. |
| J10 | Check | *Objects › All Objects* shows the objects. `tracked_item` and the plugin list filtered on *Object is empty* show only inherited columns. *Objects: Columns* records show their table as *Parent object*. |
| J11 | Collect now | Same totals as before (no item changes). Commit on `0.6.0`: "O02 object linking and backfill". |

### O03: Stored drift

New script include **ConfigNowDrift** writes each object's drift fields from the stored observations. It uses the rules of *Drift Report › All instances*: the reference is the baseline instance when it has the item, else the first instance that does; field-level differences; the ignore list; drift kinds; and the optional sys_id check.

| Field | Meaning |
|---|---|
| Drift status | *Same everywhere*, *Differs*, *Missing somewhere* (absent on a compared instance), *Single instance* (fewer than 2 instances report the category), *Expected difference* (on the ignore list, e.g. `glide.servlet.uri`) |
| Drift kinds | schema, config, clone, sys_id, count, version |
| Present on / Instances compared | Instances that have it / instances that report the category |
| Differs on / Missing on | Instance names, in column order |
| Differs on Prod | A Production instance differs from the reference, lacks the item, or is the reference while others differ |
| Baseline instance | The reference instance used |
| Drift status changed / Last compared | When the status last changed / when any drift field was last written |

**When it runs:**
- After every collection or import, for the objects that save touched, plus every object of a category the instance reports for the first time or no longer reports. A failure here never fails the save.
- Daily at 02:45, as the job *Driftwood - Recompute drift*: a full pass that catches everything else (for example an Environment change).
- From the fix script *Driftwood - Recompute all drift*.

Writes are change-only, so a quiet day writes nothing. Lists: *Objects: Differs Somewhere* and *Differs on Prod* leave out count-only differences, which have their own list, *Objects: Count-only Differences*.

| Step | Where | Expected |
|---|---|---|
| J12 | `build_schema.js` dry run, then live | `1 choice(s)` (the *Expected difference* status) |
| J13 | `install_code.js`, `UPDATE_EXISTING = true` | `SI ConfigNowWriter UPDATE`, `SI ConfigNowDrift CREATE`, `FIX Driftwood - Recompute all drift CREATE (not run)`: `Would create: 2, would update: 1` |
| J14 | Elevate, `install_ui.js`, `UPDATE_EXISTING = true` | `Would create: 2, would update: 5`: the drift job, the count-only list; the Collect now button, `POST /collect`, the settings page script, and 2 list filters |
| J15 | Scripts - Background, script scope Driftwood: `gs.info(new ConfigNowDrift().recompute({ dryRun: true }).text);` | `Driftwood drift (full, DRY RUN): <N> object(s) evaluated, <N> would change …`: every object changes the first time (they are all *Not compared yet*). |
| J16 | Fix script *Driftwood - Recompute all drift* › Run Fix Script › Proceed in background; then re-run J15 | `0 would change`. The *Now:* counts give the status split. |
| J17 | Check | *Objects: Differs Somewhere* has the MFA property; the column objects behind the Brazil vs Australia schema differences are *Differs* with kind *schema*; *Drift Report › All instances* shows the same rows. |
| J18 | Collect now | The message ends with `Drift: <n> object(s) checked, <n> updated`. Commit on `0.6.0`: "O03 stored drift". |

### O04: Object form and "Compare across instances"

**Tracked Object form:** a one-column layout (name, category, key, parent object, the drift fields, timestamps) with four related lists:

| Related list | Shows |
|---|---|
| Driftwood: Observations | One row per instance where the object exists now (plain tracked items) |
| Driftwood: Observations (CI) | The same for categories still stored as CIs (plugins, until O05) |
| Driftwood: Table Columns | On a table object, its column objects (*Parent object* = this table) |
| Item Changes | Every logged change to this object on any instance, including removals |

**Compare across instances** (form button, configuration_read) opens *Drift Report › All instances* on this one object (`…_drift_report.do?category=<cat>&key=<key>`): every instance side by side, differences highlighted, even when it is the same everywhere or only differs in version or count. *Show all differences* returns to the full comparison. Behind it, `GET /matrix` accepts `&keys=<key>`.

| Step | Where | Expected |
|---|---|---|
| J19 | `install_code.js`, `UPDATE_EXISTING = true` | `SI ConfigNowCompare UPDATE`: `would update: 1` |
| J20 | Elevate, `install_ui.js`, `UPDATE_EXISTING = true` | `Would create: 10, would update: 2`: the button, the form layout, the related list record, 3 relationships, 4 related list entries; the Drift Report page and `GET /matrix` |
| J21 | Check | Open *Objects: Tables › incident*: drift fields at the top, one Observations row per instance, its columns under *Driftwood: Table Columns*. **Compare across instances** shows incident on every instance. Try a *Same everywhere* object and an MFA property too. |
| J22 | Commit on `0.6.0`: "O04 object form and compare deep link" | |

### O05: Plugins leave the CMDB

Per-instance plugin records move from the CI table `<scope>_cmdb_ci_sn_tracked_plugin` to plain tracked items, the same storage the other categories already use. One CI per plugin returns in v0.7 as *SN Plugin*.

- **Routing:** `install_code.js` adds the property `<scope>.table.plugins = <scope>_tracked_item`, so collections and imports write plugins as plain records from then on. The Plugins list and instance related list follow when `install_ui.js` runs.
- **Copy:** new script include **ConfigNowMigration** and fix script **Driftwood - Move plugins off the CMDB** copy every plugin CI to a plain row, keeping value, version, state, presence, first seen, last changed, source link and Object. If a collection already wrote a plain row after the routing switch, the row is kept, and the older *first seen* and a missing Object are carried over. It is safe to re-run.
- **Delete:** the script **never deletes the CIs**: deleting CMDB records from the app's scope would add a `GlideRecord.deleteRecord` cross-scope privilege to the app. When it reports **SAFE TO DELETE**, an admin deletes them with *Delete All Records* on the plugin CI table. On instances that never stored plugins as CIs (any install from the repository) the fix script finds nothing.
- **Also in this package:**
  - The object form is now two columns.
  - The installer no longer warns "created outside the app (null)" for related list entries.

| Step | Where | Expected |
|---|---|---|
| J23 | `install_code.js`, `UPDATE_EXISTING = true` | `SI ConfigNowMigration CREATE`, `FIX Driftwood - Move plugins off the CMDB CREATE (not run)`, `PROP …table.plugins = …tracked_item CREATE`: `Would create: 3`. Run live. |
| J24 | Elevate, `install_ui.js`, `UPDATE_EXISTING = true` | `Would create: 0, would update: 3`: the object form (2 columns), `MODULE Plugins (…tracked_item) UPDATE (name)`, `REL Plugins UPDATE (basic_query_from)`. Run live. |
| J25 | Scripts - Background, script scope Driftwood: `gs.info(new ConfigNowMigration().movePlugins({ dryRun: true }).text);` | One line per instance; `5482 plugin CI(s); would copy: 5482` (fewer copies, plus merges, if a collection ran after J23); `Routing: plugins -> …tracked_item (plain: OK)`. |
| J26 | Fix script *Driftwood - Move plugins off the CMDB* › Run Fix Script | Script log: `copied: …` and **`SAFE TO DELETE`**. Re-run J25: `would copy: 0`. |
| J27 | *System Definition › Tables* › `x_…_cmdb_ci_sn_tracked_plugin` › related link **Delete All Records**, only after J26 says SAFE TO DELETE | The plugin CI list is empty. Each deleted CI writes a deleted-record audit entry, so it can take a minute or two. Delete on the **plugin** table, not its parent. |
| J28 | `gs.info(new ConfigNowDrift().recompute({ dryRun: true }).text);` | `0 would change`: drift is identical. *Drift Report › All instances* › Plugins shows the same rows as before. |
| J29 | Collect now | Plugins unchanged (no baseline, no new items). *Objects: Plugins* › any plugin › *Driftwood: Observations* lists one row per instance and *Observations (CI)* is empty. Commit on `0.6.0`: "O05 plugins leave the CMDB". |

### O06: Health

**Driftwood › Health** (configuration_admin) runs a read-only self-check. `GET /api/<scope>/driftwood/health` returns the same result as JSON, and the job *Driftwood - Health check* (daily 03:30) writes it to the log: an info line when healthy, a warning listing each problem otherwise. The overall status is the worst check: *ok*, *info* (notes only), *warn* or *fail*.

| Area | Checks |
|---|---|
| App | The 10 script includes are active; the collector version; the 3 fix scripts are present |
| Schema | The v0.6 tables and columns exist; every category is stored as plain records |
| Security | The 5 roles exist; every app table has an active ACL (24 expected); a note for the manual non-admin test (H06) |
| Jobs | The 4 jobs are active; who they run as (a note to use a collector account, H07) |
| REST | `/driftwood` is active with its 7 operations; the old `/configurationnow` is gone or inactive |
| Footprint | Cross-scope privileges against the expected list: the 58 from the v0.5.5 repo plus `sys_scope_privilege` read, which is Health's own read. A privilege not on the list is a *warn*. Any of the 13 removed on 2026-11-07 reappearing is a *fail*. Expected ones not created yet are noted, because the platform only creates a privilege on first use. |
| Data | Instances; last collection age (*warn* past 36 h); tracked objects; drift computed (none *Not compared yet*); observations linked (inherited columns excepted); objects no longer observed anywhere; plugin CIs left (O05); history older than retention (the purge job) |

Health only reads tables the app already reads, plus `sys_scope_privilege`. The job run-as check compares sys_ids rather than reading user names, which would add a `sys_user` privilege.

**Also in this package:**
- The old `/configurationnow` API is deleted: `install_ui.js` with `UPDATE_EXISTING = true` removes it and its operations once it is inactive.
- The migration dry run now says SAFE TO DELETE when every CI already has its copy, and "nothing to copy or delete" when none are left.

| Step | Where | Expected |
|---|---|---|
| J30 | `install_code.js`, `UPDATE_EXISTING = true` | `SI ConfigNowHealth CREATE`, `SI ConfigNowMigration UPDATE`: `Would create: 1, would update: 1` |
| J31 | Elevate, `install_ui.js`, `UPDATE_EXISTING = true` | `Would create: 4, would update: 1`: the Health page, the Health module, the health job, `GET /health`; `REST old API /configurationnow (inactive) DELETE with its 6 operation(s)` |
| J32 | *Driftwood › Health* | *Healthy (notes)*: notes for H06, H07 and the collector version. Footprint `59 privilege(s); expected 59` once Health has run once (its first run creates the `sys_scope_privilege` read). Anything listed as *Not expected* is new footprint to review. |
| J33 | *REST API Explorer* › Driftwood › `GET /health` | The same checks as JSON, `result.status` = `info` |
| J34 | Commit on `0.6.0`: "O06 health". The commit should include `sys_scope_privilege` for `sys_scope_privilege` read and the deletion of the old API. | |

### O06.1: Fix script name too long

The fix script added in O05 was named *Driftwood - Move plugins to plain records*. That is 41 characters, but the fix script name field holds 40, so it was saved as *…plain record*. Health then reported it missing, and each `install_code.js` run added another copy. It is now **Driftwood - Move plugins off the CMDB**. With `UPDATE_EXISTING = true`, `install_code.js` renames the oldest truncated copy, deletes the others and refreshes its script. Without it, the installer only warns. The generator now refuses fix script names longer than 40 characters.

| Step | Where | Expected |
|---|---|---|
| J35 | `install_code.js`, `UPDATE_EXISTING = true`, dry run then live | `FIX "Driftwood - Move plugins to plain record" RENAME …`, one `DELETE duplicate` per extra copy, `FIX Driftwood - Move plugins off the CMDB UPDATE (after the rename)`, plus `SI ConfigNowMigration UPDATE` and `SI ConfigNowHealth UPDATE` (new name in their messages) |
| J36 | *Driftwood › Health* › Run again | No warnings: *Healthy (notes)*. Commit on `0.6.0`: "O06 health; fix script name fix". |

### O12: Security phase 1 (GlideRecordSecure on reads)

From `Security-review-v0.6.md`. Everything a person reads through the REST API or the pages goes through `GlideRecordSecure` (the comparison's secure mode), so Driftwood's ACLs, including field ACLs and any future row rules, decide what comes back. `GET /current` no longer runs the collector for read-only users: they get this instance's stored observations, as their ACLs allow; a live read needs `configuration_admin`. Every REST operation now requires the platform's REST ACL check. Imported link fields are validated, unexpected errors are logged rather than returned, and runs record how they were started (*Started by*: daily job, Collect now, REST, import, script).

| Step | Where | Expected |
|---|---|---|
| J37 | `build_schema.js`, dry run then live | `1 column(s), 5 choice(s)` (`collection_run.run_trigger`) |
| J38 | `install_code.js`, `UPDATE_EXISTING = true` | `SI ConfigNowConfig`, `ConfigNowCompare`, `ConfigNowWriter`, `ConfigNowImporter` UPDATE: `would update: 4` |
| J39 | Elevate, `install_ui.js`, `UPDATE_EXISTING = true` | About `Would create: 0, would update: 11`: the 7 REST operations (`requires_acl_authorization`, and new scripts on 6), the Collect now button, the collect job, the settings page, the Collection Runs list layout |
| J40 | Check as admin | Health: *Healthy (notes)*, still 59 privileges. Collect now: the new run shows *Started by: Collect now*. The Drift Report works as before. |
| J41 | Check as a reader | Impersonate a user with only `configuration_read`: *Current Instance Settings* says "stored data … shown as your access allows" and has no secure hashes; the Drift Report works; Collect now is refused. This is the start of H06. |
| J42 | Commit on `0.6.0` (GitHub Desktop): "Security phase 1: GlideRecordSecure on reads" | |

## 6. Release matrix

| Release | Dry run (A) | Git import (C) | D1 run 1 | D1 run 2 | UI (D4) | Notes |
|---|---|---|---|---|---|---|
| Brazil patch1-hotfix1 | ✔ 0 warnings | n/a (built here) | ✔ 2,449 inserted | ✔ 0 writes | ✔ | `sys_plugins.active` is boolean |
| Zurich patch13 | ✔ (in-scope run, 0 warnings) | ✔ 94/94 identical | ✔ | ✔ 0 writes, 2,345 unchanged, 785 ms | ✔ | `cmdb_ci_appl_now_app` extensible. Plugins 1,330 · apps 730 · props 17 · preservers 226 · exclusions 42 |
| Australia patch7 | ✔ (exporter, global) | not yet | n/a | n/a | n/a | Exported and imported twice (3,313 items, 0 warnings); the app itself isn't installed there |
| Brazil, v0.6 build | n/a | **O07: clean PDI to do** | | | | dev466156 is at v0.6 (Procedure J); the release install from Git is the next test |

---

## 7. Changing the app

1. Edit the files under `project/src/` (script includes, UI action, job, REST, page).
2. Regenerate the installers: `python3 tools_gen_install.py`. `install_code.js` and `install_ui.js` embed the sources byte-for-byte.
3. Run the ES3 check: `node tests/es3_strict_check.js <files>`. It must report OK for every server script.
4. Run every suite: `for t in tests/test_*.js; do node $t; done` (15 suites; jsdom, acorn and acorn-walk must be installed). Add `DRIFTWOOD_SNAPSHOTS=<dir of snapshot JSON>` to replay real snapshots through the writer, objects, drift and plugin move.
5. Retarget and test the deployable copy: `python3 tools_build_for_scope.py x_2160899_driftw_0`, then run the suites inside `build/x_2160899_driftw_0/`.
6. Deploy on the development instance: run the installer live with `UPDATE_EXISTING = true`, then commit through Studio on the working branch. Names of fix scripts must fit their 40-character field (the generator refuses longer ones).

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
| *Delete All Records* stops with "maximum execution time exceeded" | UI transaction quota (~5 minutes) | Run it again until the list is empty, or use a *System Data Management › Delete Jobs* job (background, with rollback) |
| "Internal and Store uploading has been disabled" | Publishing to the application repository is off on PDIs | Install releases with Procedure C (Git import) |
| An installer creates the same fix script on every run | The name was longer than `sys_script_fix.name` (40) and was saved truncated | Fixed in O06.1: `install_code.js` with `UPDATE_EXISTING = true` renames and deduplicates |
| "… was created outside the app (null)" on related list entries | Child records without a scope of their own | Fixed in O05; they are saved inside their parent related list |
| `ALTER TABLE sh$…` lines in an installer's output | The platform creating a history table the first time a record type is updated or deleted | Expected, once per table |
| Health: *Not expected* privileges | Something in the Driftwood scope used a new table or API | Review it; if it is legitimate, add it to `ConfigNowHealth.EXPECTED_PRIVILEGES` |

---

## Appendix: Dependency footprint (cross-scope privileges)

59 privileges as of v0.6, all checked by name by *Driftwood › Health*. The full list, the ones still to appear on first use, and the 13 that must never come back are in `Driftwood-go-no-go.md` (appendix).
