> **Archived 2026-11-08.** This is the ConfigurationNOW POC document (v0.1.2), kept for history. It is superseded by `README.md`, `RUNBOOK.md` and `Driftwood-go-no-go.md`. Names, scopes and counts in it are out of date.

# ConfigurationNOW: POC (v0.1.2)

> **Procedures:** see `docs/RUNBOOK.md` for the script inventory, fresh build, Git deploy and verification, functional tests (F01–F06), release matrix, maintenance and troubleshooting. Go/no-go: `docs/POC-go-no-go.md`.

**Goal:** prove that a scoped app can reliably read and record the **current instance's** platform configuration in the CMDB, using the v4.0 data model. Cross-instance collection, drift comparison and `sn_cmdb_table_config` are out of scope for this POC.

## What it reports

| Category | Source table(s) | Item key | Notes |
|---|---|---|---|
| Instance basics | `sys_properties` (`instance_name`, `glide.war`, `glide.buildname`, …), `sys_cluster_state` | `instance_name` | Family and patch are parsed from `glide.war`. Node list is stored as JSON. |
| Plugins | `sys_plugins` | plugin ID (`source`) | Active plugins only by default. `active` is normalised: it is a string in older releases and a boolean in Brazil. **Do not use `v_plugin`.** Querying it rebuilds a cache (~17 s on a Brazil PDI). |
| Applications | `sys_store_app` (store), `sys_app` (custom) | scope | `attributes.source` = store / custom |
| MID Servers | `ecc_agent` | name | `status` / `last_refreshed` go in `runtime` and are not hashed, so an Up/Down flap is not counted as drift |
| System properties | `sys_properties` | property name | A tracked list plus optional prefixes. Missing properties are reported as `not_set`. **Secure (password/password2) values are never stored.** A salted SHA-256 is stored instead. |
| Clone preservers | `clone_data_preserver` | `preserver:<name>` | Condition is stored as the value |
| Clone exclusions | `clone_data_exclude` | `exclude:<table>` | |

Each item carries a `value_hash` (SHA-256 of key, value, version, state and attributes). This is the hook for drift detection later.

## Repository layout

```
src/script_includes/ConfigNowConfig.js      defaults + property overrides
src/script_includes/ConfigNowCollector.js   read-only snapshot (no writes)
src/script_includes/ConfigNowWriter.js      change-only upsert into CMDB
src/scheduled_jobs/…Collect_Current_Instance.js
src/ui_actions/Collect_Now.js               button on the instance CI
src/scripted_rest/current_GET.js            GET /api/x_2160899_driftw_0/configurationnow/current
src/ui_pages/x_2160899_driftw_0_current_settings.*    report page (HTML/Jelly + client script)
dist/background_dry_run.js                  self-contained; paste into Scripts - Background
tests/                                      Node mock harness (node tests/test_poc.js)
build.sh                                    regenerates dist/
```

---

## Step 0: Feasibility check with no install (5 minutes)

On a **sub-prod** instance, open *System Definition > Scripts - Background*, paste `dist/background_dry_run.js` and run it. It writes nothing and prints a summary, any warnings and a sample. **Every warning is a feasibility finding**, for example a table that isn't readable or a field that was renamed in your release. Record them before you build the app.

## Step 1: Create the application

Studio / App Engine Studio → new custom app **ConfigurationNOW**, scope **`x_2160899_driftw_0`**. If your scope is different, update `ConfigNowConfig.DEFAULTS.tables`, the role names below and the REST path in the UI page client script.

> **Naming:** the design's `cmdb_ci_sn_instance` becomes `x_2160899_driftw_0_cmdb_ci_sn_instance` in a scoped app. If you build in global instead, set the table map to the design names.

## Step 2: Create the tables

**Fast path:** create only the instance table by hand (D01). Then run `src/background/build_schema.js` in Scripts - Background, with the script scope on **global** and the **application picker on ConfigurationNOW**. Run it first with `DRY_RUN = true`, then with `false`. It creates the tracked tables and all the columns and choices below, skips anything that exists, refuses to run live if the picker is on another app, and verifies the result. Indexes (D07) and ACLs stay manual.

The manual specs follow for reference.

**`x_2160899_driftw_0_cmdb_ci_sn_instance`** extends **`cmdb_ci_appl_now_app`** (ServiceNow Application, base CMDB package, extensible). This was confirmed on Brazil.

Inherited fields used by the app:

| Field | Source | Set by |
|---|---|---|
| `name` | cmdb_ci | collector (instance name) |
| `version` | cmdb_ci_appl | collector ("Brazil patch1-hotfix1") |
| `fqdn` | cmdb_ci | collector (host from instance URL) |
| `environment` | cmdb_ci (CSDM) | **admin only; the collector never writes it**, so a clone can't carry Prod's value into Dev |

Custom columns:

| Column | Type | Len |
|---|---|---|
| instance_name | String | 100, unique |
| instance_id, instance_url, build_name, build_tag, build_date, family, patch, timezone | String | 255 |
| war | String | 255 |
| production_flag | True/False (copy of `glide.installation.production`, informational: it is `true` even on PDIs) | |
| node_count | Integer | |
| nodes | String | 4000 |
| last_collected | Date/Time | |
| collection_status | Choice: running, completed, completed_with_warnings | |
| collection_summary | String | 4000 |

**`x_2160899_driftw_0_cmdb_ci_sn_tracked_table`** extends `cmdb_ci` (*Extensible = true*). This is the parent for all tracked items.

| Column | Type | Len |
|---|---|---|
| instance | Reference → x_2160899_driftw_0_cmdb_ci_sn_instance | |
| item_category | Choice: plugins, applications, mid_servers, system_properties, clone_preservers, clone_exclusions (not `category`, which is inherited from cmdb_ci) | |
| item_key | String | 255 |
| item_value | String | 4000 |
| item_version, item_state | String | 100 |
| value_hash | String | 64 |
| item_attributes, runtime | String | 4000 (JSON). Not `attributes`, which is inherited from cmdb_ci (65000). |
| source_sys_id | String | 32 |
| is_secure | True/False | |
| secure_value_hash | String | 64 (field ACL, see Step 4) |
| present | True/False (default true) | |
| first_seen, last_changed | Date/Time | |

Add a **database index** on (`instance`, `item_category`, `item_key`).

**Subclasses** extend `x_2160899_driftw_0_cmdb_ci_sn_tracked_table`. They have no extra columns for the POC.
`…_tracked_plugin`, `…_tracked_application`, `…_tracked_mid_server`, `…_tracked_property`, `…_tracked_clone_rule` (shared by preservers and exclusions).

Typed columns per subclass (for example `plugin_id` or `mid_host`) can come later. The POC keeps extras in `attributes` so the model can settle first.

## Storage modes: CI or plain table, per category

The larger design lets each organization choose how tracked items are stored. The **instance is always a CI**. Each category (plugins, applications, …) is routed to either:

| Mode | Table | Good for | Trade-offs |
|---|---|---|---|
| **CI** | typed subclass of `…_cmdb_ci_sn_tracked_table` | orgs that want CMDB relationships, CI-based reporting and CSDM linkage (for example app → Business Application) | volume in the CMDB (~2.5k+ items per instance), CMDB Health / Data Manager scope, IRE rules, possible licensing review |
| **Plain** | `x_2160899_driftw_0_tracked_item` (one table, `category` column) | orgs that keep the CMDB for infrastructure and services only | no CI relationships. Per-category read roles need ACL conditions on `category` |

Both modes use the **same column set**, so the collector and writer don't change. Routing is config only: in the POC it's the `x_2160899_driftw_0.table.<category>` property, and later it becomes a row per category in `sn_cmdb_table_config`.

Design rules for the full build:
- All reads (report page, REST API, future drift engine) go through the configured table map. Nothing hard-codes a table name.
- Switching a category's mode is a **migration** (copy rows, keep `first_seen` and `last_changed`, retire the old rows), not just a property flip. That needs a migration script and a guard against flipping a category while a collection is running.
- One table can hold several categories (as `clone_rule` does), so queries must always filter on `instance` + `item_category`.
- For Store packaging, consider a core app (plain tables) plus an optional "CMDB classes" app, so orgs that never use CI mode don't get the classes installed.
- The test matrix doubles. Every category must be tested in both modes.

### What to build in the POC (proves both modes with 4 tables, not 7)

1. `cmdb_ci_sn_instance` extends `cmdb_ci_appl_now_app`
2. `cmdb_ci_sn_tracked_table` extends `cmdb_ci` (Extensible), with all tracked columns
3. `cmdb_ci_sn_tracked_plugin` extends 2 (**CI mode**: plugins, and applications if you also build `…_tracked_application`)
4. `tracked_item`, a plain table (extends nothing) with the **same columns as 2 plus `name` (String 255)** (**plain mode**)

Then set:
```
x_2160899_driftw_0.table.applications      = x_2160899_driftw_0_tracked_item   (unless you built …_tracked_application)
x_2160899_driftw_0.table.mid_servers       = x_2160899_driftw_0_tracked_item
x_2160899_driftw_0.table.system_properties = x_2160899_driftw_0_tracked_item
x_2160899_driftw_0.table.clone_preservers  = x_2160899_driftw_0_tracked_item
x_2160899_driftw_0.table.clone_exclusions  = x_2160899_driftw_0_tracked_item
```
Subclasses 5–7 can be added later to test switching a category to CI mode.

## Step 3: Script includes, job, UI action

**Fast path for the script includes and routing properties:** run `dist/install_code.js` the same way as the schema builder (script scope global, application picker ConfigurationNOW, dry run first). It embeds the three script includes byte-for-byte from `src/script_includes/`, so regenerate it with `python3 tools_gen_install.py` after any source change. Re-run it with `UPDATE_EXISTING = true` to redeploy changed code.


1. Create the three script includes from `src/script_includes/`. Set *Accessible from* to **This application scope only**.
2. Create the scheduled script execution from `src/scheduled_jobs/` (Daily, Run as = collector account).
3. Create the UI action from `src/ui_actions/Collect_Now.js` on the instance table. Set it as a form button, server-side, with the condition from the file header.

## Fast path for Steps 4–5: `dist/install_ui.js`

This installs the ACLs, the Collect now UI action, the daily job, the Scripted REST API, the UI page, and the application menu with 4 modules. Run it the same way as the other installers, and **elevate to security_admin first** for the ACLs. Without elevation, everything except the ACLs installs, and a re-run after elevating adds them.

## Step 4: Roles and ACLs (POC subset of the v4.0 model)

| Role | Contains | Purpose |
|---|---|---|
| `x_2160899_driftw_0.admin` | configuration_admin, configuration_read_secure | App administration |
| `x_2160899_driftw_0.configuration_admin` | configuration_read | Run *Collect now*, maintain config |
| `x_2160899_driftw_0.configuration_read` | | Read the instance CI and tracked items, the report page and the REST API |
| `x_2160899_driftw_0.configuration_read_secure` | | Read `secure_value_hash` |
| `x_2160899_driftw_0.collector` | | Service account for the scheduled job / future remote calls |

ACLs:
* `read` on the instance table and `…_tracked_table` (inherited by subclasses) → `configuration_read`
* `write/create/delete` on the same → `configuration_admin`
* field `read` on `…_tracked_table.secure_value_hash` → `configuration_read_secure`
* Per-subclass read roles (for example a plugins-only reader) are in the design but **deferred**. Add them as subclass-level read ACLs once the base works.

## Step 5: REST API and report page

1. Scripted REST API **ConfigurationNOW**, API ID `configurationnow`. Resource `GET /current` uses the script from `src/scripted_rest/current_GET.js`. Set *Requires authentication* = true and restrict it with an ACL to `x_2160899_driftw_0.configuration_read`.
   **This is mandatory.** The collector uses `GlideRecord`, which bypasses ACLs, so the API itself must enforce the role.
2. UI page **`current_settings`**: paste the `.html.xml` into *HTML* and the `.client.js` into *Client script*.
3. Module *ConfigurationNOW > Current Instance Settings* → URL `x_2160899_driftw_0_current_settings.do`, role `configuration_read`. Add list modules for the instance and tracked-item tables.

## Step 6: Properties (optional overrides)

| Property | Default |
|---|---|
| `x_2160899_driftw_0.categories` | all six |
| `x_2160899_driftw_0.tracked_properties` | list in `ConfigNowConfig.DEFAULTS` |
| `x_2160899_driftw_0.tracked_property_prefixes` | (none). Keep these narrow. |
| `x_2160899_driftw_0.include_inactive_plugins` | false |
| `x_2160899_driftw_0.secure_value_mode` | `hash` (or `omit`) |
| `x_2160899_driftw_0.secure_hash_salt` | type password2. **Set the same value on every instance** so hashes are comparable for drift. |
| `x_2160899_driftw_0.max_rows_per_category` | 5000 |

---

## Feasibility checkpoints (what the POC should answer)

1. **Cross-scope access.** On first run, Dev creates *Cross scope privilege* records (read on `sys_plugins`, `sys_properties`, `ecc_agent`, `sys_cluster_state`, `clone_data_*`, `sys_store_app`, `sys_app`). Confirm that they are created, then capture them in the update set. Restricted tables show up as warnings rather than failures.
2. **Extending `cmdb_ci` from scope.** Confirm that CI Class Manager allows the classes in `x_2160899_driftw_0`. For a Store release, check this against certification rules.
3. **CMDB writes without IRE.** The POC inserts directly. Check CMDB Health / Data Manager for noise, then decide on IRE identification rules for v0.2.
4. **Volume and audit.** Typical totals are around 1–3k items. After the first run the writer only touches changed rows. Check that run 2 reports ~0 updates.
5. **Release variance.** Run the dry run on each family you support (for example Xanadu, Yokohama, Zurich) and compare the warnings.

## PDI findings (Brazil patch1-hotfix1, dev465827)

- Dry run in global: 0 warnings, 293 ms.
- `sys_plugins.active` is boolean in Brazil. The v0.1 filter `active=active` returned 0 rows. Fixed in v0.1.1.
- `v_plugin` triggers a full catalog cache flush (~17 s) and must be avoided. Its counts (964 active / 458 inactive) differ from `sys_plugins` (1381, all active).
- `sys_store_app` returned 763 active rows, so many platform features ship as store apps.
- `glide.installation.production` = true on a PDI, so it can't be used for classification. Added an admin-set `environment` field.
- `glide.sys.default.tz` is unset on the PDI (platform default).
- `cmdb_ci_appl_now_app` is in the base CMDB package, extensible, empty, and has no identification rules of its own. It inherits 1 rule from `cmdb_ci_appl`. Chosen as the parent of the instance class.
- `cmdb_ci_appl_now_app_comp` is a *child* of `_app` and can't be extended. It's a candidate for nodes after the POC.
- `cmdb_ci_appl_now_mid` and `_connector` don't exist without Event Management. Don't depend on them.
- `instance` is the clone targets table (High Availability Cloning), not a CI. It's a future source for the instance inventory.
- The OOTB `environment` field (on `cmdb_ci_appl`, String 40) is used instead of a custom column.
- `cmdb_ci` already has `category` (String 40) and `attributes` (String 65000), used by other CMDB tooling. The tracked columns are named `item_category` and `item_attributes` instead.
- Running a script with the app scope selected auto-creates cross-scope privilege records. Run diagnostics in global.
- Background scripts in global run at ES Level 0 (ES3), so reserved words such as `private` can't be used as object keys. All server scripts are now checked with an ES3 parser.

## Validation already done

The collector and writer were run against a Node mock of GlideRecord, GlideDigest and gs (`node tests/test_poc.js`):

- First run inserts all items.
- A second run with no changes writes 0 rows.
- A changed property and a rotated secret are detected.
- A removed plugin is set to `present=false` and is restored when it comes back.
- A MID Server status flap does not count as drift.
- A missing source table produces a warning, not an exception.
- The secret value never appears in the snapshot.

This proves the logic only. Table and field names on a real instance still need the Step 0 dry run.

## Deferred to after the POC

Storage-mode migration script, `sn_cmdb_table_config`-driven routing, cross-instance collection (central instance calls `GET /current` on each node), drift comparison UI, `sn_cmdb_table_config`-driven tracking, IRE, per-subclass read roles, typed subclass columns, clone cleanup scripts, Store packaging.
