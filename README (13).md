# Driftwood

**Version:** v0.5.4 · **Scope:** `x_2160899_driftw_0` (Driftwood), built from source scope `x_2160899_driftw_0` · **Formerly:** ConfigurationNOW

Driftwood records a ServiceNow instance's own platform configuration, keeps its history, and shows how instances differ: Dev against Test against Prod, or one release against another. It is a scoped app. Instances that don't have the app can still be compared by exporting a snapshot from them with a background script.

> **Procedures:** `RUNBOOK.md` (install, upgrade, verification, troubleshooting). **Status:** `Driftwood-go-no-go.md`. **Direction:** `Data-model-proposal.md` (adopted) and `UI-roadmap.md`.

## What it collects

| Category | Source | Item key | Notes |
|---|---|---|---|
| Instance | `sys_properties`, `sys_cluster_state` | instance name | Release family and patch, nodes, time zone. `environment` is set by an admin, never by the collector. |
| Plugins | `sys_plugins` | plugin ID | Active only by default. Never reads `v_plugin` (it triggers a ~17 s cache rebuild). |
| Applications | `sys_store_app`, `sys_app` | scope | Vendor is shown but not compared |
| MID servers | `ecc_agent` | name | Status is shown but not compared (an up/down flap isn't drift) |
| System properties | `sys_properties` | name | Tracked list plus prefixes. Secure values are never stored; only a salted hash. |
| Clone preservers / exclusions | `clone_data_preserver`, `clone_data_exclude` | rule | |
| Tables | `sys_db_object` + counts | table name | 35 curated tables, custom `x_`/`u_` tables and the Tracked Tables list. Records:<br>• row count, plus two customer counts (`x_` app records, exact; Global records not created by platform accounts, an estimate)<br>• schema fingerprint and table definition<br>• the active clone rules naming the table |
| Columns | `sys_dictionary` | `table.column` | One item per column of each tracked table. Type, length, reference, flags, default value, attributes, scope. |
| Update sets | `sys_update_set`, `sys_remote_update_set` | originating set | Local and retrieved sets keyed by the set they were built in, so promotions line up. Records state, update counts and preview problems. |

Every item stores a hash (change detection) and a **link to its source record** on its own instance.

## How it fits together

```
Collector (read-only) ──► snapshot JSON ──► Writer (change-only) ──► tracked records + run + changes
        ▲                       │
        │                       └─► Download JSON / export_snapshot.js ──► Importer on another instance
 daily job · Collect now · /collect
Compare (pair or all instances) ◄── tracked records ──► Drift Report page · REST /compare /matrix
```

| Part | What it does |
|---|---|
| `ConfigNowCollector` | Reads the instance into a snapshot. Update sets are incremental after the first run, with a full sweep every 7 days. |
| `ConfigNowWriter` | Writes only what changed. Records a **collection run** (with the snapshot attached) and an **item change** row per added, changed, removed or restored item. A category's first load is a baseline. |
| `ConfigNowImporter` | Imports a snapshot from another instance as its own instance CI. It refuses older snapshots and this instance's own unless asked. |
| `ConfigNowCompare` | Pair and all-instances comparison. Rows carry drift kinds (schema, config, clone, count, version, optional sys_id); version-only and count-only rows can be hidden. |
| `ConfigNowRetention` | A daily purge of runs, changes and snapshots past retention (180 days by default; settable globally or per instance). It always keeps each instance's latest run. |
| REST `/api/x_2160899_driftw_0/driftwood` | `GET /current`, `/instances`, `/compare`, `/matrix`; `POST /snapshot` (import), `/collect`. Every resource checks its role in the script. |
| Pages | *Current Instance Settings* (live read, Collect now, per-column sort and filter, dark mode) and *Drift Report* (pair / all instances, imports, toggles, open links) |
| Navigation | One list module per category. Related lists per category on the instance form, plus Collection Runs and Item Changes. List layouts for each. |

## Storage today and next

Today the **instance is a CI**. **Plugins are CIs**, one per plugin per instance, in `cmdb_ci_sn_tracked_plugin`. Every other category is a plain `tracked_item` record. Routing is set per category with `<scope>.table.<category>`.

**Adopted for v0.6/v0.7** (`Data-model-proposal.md`) is a three-layer model:

1. **Instance:** a CI, as today.
2. **Tracked object:** one per thing across all instances, carrying a stored drift status. Applications, tables and plugins become CIs (*SN Application*, *SN Table*, *SN Plugin*).
3. **Per-instance observations:** plain records under each object.

## Install and upgrade

All of it is installed by idempotent, dry-run-first background scripts. Run them with the script scope set to global and the application picker on Driftwood:

| Script | Installs |
|---|---|
| `build_schema.js` | Roles, the 7 tables, columns, choices |
| `install_code.js` | The 6 script includes, routing properties |
| `install_ui.js` (elevated) | ACLs, UI action, 2 jobs, REST API, pages, menu, modules, relationships, related lists, list layouts |
| `export_snapshot.js` | (any instance, no app needed) one snapshot JSON as an attachment on your user record |
| `diagnostics/*.js` | Read-only checks: class info, inherited columns, plugin flag, customer rule, customer updates, update sets |

`tools_build_for_scope.py <scope>` retargets the whole project (source, tests, run-ready scripts) to another app scope. The tests run in Node against a GlideRecord mock and jsdom: `node tests/test_*.js` (12 suites). An ES3 checker guards every server script, because global background scripts run at ES level 0.

## Properties

| Property | Default | Purpose |
|---|---|---|
| `<scope>.categories` | all 9 | Categories to collect |
| `<scope>.table.<category>` | see Config | Storage routing |
| `<scope>.tracked_properties`, `tracked_property_prefixes` | Config list | Properties to track |
| `<scope>.secure_hash_salt` | `cfgnow-poc` | **Use the same value on every instance** |
| `<scope>.compare_ignore` | `glide.servlet.uri` | Expected differences (`category\|key`) |
| `<scope>.instance_order` | — | Column order in comparisons |
| `<scope>.customer_scoped_query`, `customer_global_query` | see Config | Customer count rules |
| `<scope>.customer_history` | false | Count from customer update history instead (validate first) |
| `<scope>.retention_days` | 180 | History retention; the instance CI field overrides it |
| `<scope>.keep_snapshots`, `log_changes` | true | History detail |
| `<scope>.update_sets_full_days` | 7 | Full update set sweep interval |
| `<scope>.compare_sys_ids`, `sys_id_exclude` | false; MID, update sets, plugins, tables, columns | Optional sys_id drift |
