# Driftwood

**Version:** 0.6.0 (release in progress, branch `0.6.0`) · **Scope:** `x_2160899_driftw_0`, built from source scope `x_1327441_config_0` by `tools_build_for_scope.py` · **Formerly:** ConfigurationNOW

Driftwood records a ServiceNow instance's own platform configuration, keeps its history, and shows how instances differ: Dev against Test against Prod, or one release against another. Every tracked thing (a table, a property, a plugin…) is **one object across all instances**, with each instance's observation underneath it and its drift status stored on it. Instances that don't have the app can still be compared by exporting a snapshot from them with a background script.

> **Procedures:** `RUNBOOK.md` · **Security:** `Security-review-v0.6.md` · **Status and decisions:** `Driftwood-go-no-go.md` · **Current plan:** `v0.6-plan.md` · **Model:** `Data-model-proposal.md` · **UI direction:** `UI-roadmap.md` · Superseded ConfigurationNOW POC documents are in `archive/`.

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
| Columns | `sys_dictionary` | `table.column` | One item per column of each tracked table. Type, length, reference, flags, default value, attributes, scope. A column repeated from a tracked parent table is *inherited* and gets no object of its own. |
| Update sets | `sys_update_set`, `sys_remote_update_set` | originating set | Local and retrieved sets keyed by the set they were built in, so promotions line up. Records state, update counts and preview problems. |

Every observation stores a hash (change detection) and a **link to its source record** on its own instance.

## Data model

| Layer | Table | What it is |
|---|---|---|
| Instance | `…_cmdb_ci_sn_instance` (CI, extends *Now Platform application*) | One per instance, local or imported |
| Tracked object | `…_tracked_object` | One per category + key across all instances (`object_key` = `<category>\|<key>`, unique). Drift status, kinds, present on / compared, differs on, missing on, differs on Prod, reference instance. Columns point at their table (*Parent object*). |
| Observation | `…_tracked_item` | What one instance has: value, version, state, attributes, hash, source link, first seen, last changed, presence, Object reference |
| History | `…_collection_run`, `…_item_change` | One row per collection or import (snapshot attached); one row per added, changed, removed or restored item, with its Object |

Every category is stored as plain records (`<scope>.table.<category>` = `…_tracked_item`). The per-instance plugin CIs were moved off the CMDB in v0.6. One CI per application, table and plugin returns in v0.7 as CI classes.

## How it fits together

```
Collector (read-only) ──► snapshot JSON ──► Writer (change-only) ──► observations + objects + run + changes ──► Drift engine (stored drift)
        ▲                       │
        │                       └─► Download JSON / export_snapshot.js ──► Importer on another instance
 daily job · Collect now · /collect
Compare (pair / all instances) ◄── observations ──► Drift Report · REST /compare /matrix
Objects lists · object form · Compare across instances (deep link) · Health page · REST /health
```

| Part | What it does |
|---|---|
| `ConfigNowCollector` | Reads the instance into a snapshot. Update sets are incremental after the first run, with a full sweep every 7 days. |
| `ConfigNowWriter` | Writes only what changed, links every observation to its object, records a **collection run** and an **item change** per change (a category's first load is a baseline), then recomputes the drift of the objects it touched. |
| `ConfigNowObjects` | Finds or creates the object for a category + key; inherited columns; the backfill. |
| `ConfigNowDrift` | Stored drift with the all-instances comparison's rules. Change-only. Runs after each save and daily. |
| `ConfigNowImporter` | Imports a snapshot from another instance as its own instance CI. It refuses older snapshots and this instance's own unless asked. |
| `ConfigNowCompare` | Pair and all-instances comparison, drift kinds (schema, config, clone, count, version, optional sys_id); one-object comparison for the deep link. |
| `ConfigNowRetention` | A daily purge of runs, changes and snapshots past retention (180 days by default; settable globally or per instance). It always keeps each instance's latest run. |
| `ConfigNowMigration` | The v0.6 move of plugin CIs to plain records (copy and verify; never deletes). |
| `ConfigNowHealth` | The read-only self-check behind *Driftwood › Health* and `GET /health`. |
| REST `/api/x_2160899_driftw_0/driftwood` | `GET /current`, `/instances`, `/compare`, `/matrix` (`&keys=` for one object), `/health`; `POST /snapshot` (import), `/collect`. Every resource checks its role in the script. |
| Jobs | Collect 02:15 · Recompute drift 02:45 · Purge history 03:15 · Health check 03:30 |
| Fix scripts | *Backfill tracked objects*, *Move plugins off the CMDB*, *Recompute all drift*: idempotent, for upgrades of existing data |
| Screens | *Current Instance Settings*, *Drift Report*, *Health* pages; the **Objects** section (all, differs, count-only, missing, differs on Prod, one list per category); the object form (two columns, observations, table columns, item changes, **Compare across instances**); per-category observation lists and instance-form related lists |

## Roles (today)

| Role | Gives |
|---|---|
| `configuration_read` | Read every Driftwood table, the pages and the read APIs |
| `configuration_read_secure` | Read secure-value hashes |
| `configuration_admin` | Contains `configuration_read`. Collect now, imports, Health, edit Environment on instance CIs, maintain the tracked-table list, delete history and objects |
| `admin` (app) | Contains `configuration_admin` and `configuration_read_secure` |
| `collector` | For the collector service account (H07, not yet in use) |

Every read made for a person (REST API, pages) goes through `GlideRecordSecure`, so these roles' ACLs, and any later row or field rules, decide what is returned. `GET /current` gives read-only users the stored observations; only `configuration_admin` triggers a live read. A stricter, controlled access model is being designed: only the collector account will write Driftwood data (`Security-review-v0.6.md`, phase 2).

## Install and upgrade

| Where | How |
|---|---|
| A company instance (with an application repository) | Publish from the development instance; install and upgrade through *My Company Applications*. Fix scripts run automatically. |
| Personal developer instances | Publishing to the application repository is disabled on PDIs. Install with *Studio › Import from source control* (`main` or a release tag). Fix scripts don't run on their own; on a fresh instance none are needed. |
| Development (dev466156) | Idempotent, dry-run-first background scripts (global scope, app picker on Driftwood), then commit through Studio source control |

| Script | Installs |
|---|---|
| `build_schema.js` | Roles, the 8 tables, columns, choices |
| `install_code.js` | The 10 script includes, 3 fix scripts, 6 routing properties |
| `install_ui.js` (elevated) | ACLs, UI actions, 4 jobs, REST API, 3 pages, menu, modules, relationships, related lists, list and form layouts |
| `export_snapshot.js` | (any instance, no app needed) one snapshot JSON as an attachment on your user record |
| `diagnostics/*.js` | Read-only checks: class info, inherited columns, plugin flag, customer rule, customer updates, update sets |

`tools_build_for_scope.py <scope>` retargets the whole project (source, tests, run-ready scripts) to another app scope. The tests run in Node against a GlideRecord mock and jsdom: `node tests/test_*.js` (15 suites; `DRIFTWOOD_SNAPSHOTS=<dir>` adds a replay of real snapshots). An ES3 checker guards every server script, because global background scripts run at ES level 0.

## Properties

| Property | Default | Purpose |
|---|---|---|
| `<scope>.categories` | all 9 | Categories to collect |
| `<scope>.table.<category>` | `…_tracked_item` for all | Storage routing |
| `<scope>.tracked_properties`, `tracked_property_prefixes` | Config list | Properties to track |
| `<scope>.secure_hash_salt` | `cfgnow-poc` | **Use the same value on every instance** |
| `<scope>.compare_ignore` | `glide.servlet.uri` | Expected differences (`category\|key`); objects get *Expected difference* |
| `<scope>.instance_order` | — | Column order in comparisons, and the reference instance for stored drift |
| `<scope>.customer_scoped_query`, `customer_global_query` | see Config | Customer count rules |
| `<scope>.customer_history` | false | Count from customer update history instead (validate first) |
| `<scope>.retention_days` | 180 | History retention; the instance CI field overrides it |
| `<scope>.keep_snapshots`, `log_changes` | true | History detail |
| `<scope>.update_sets_full_days` | 7 | Full update set sweep interval |
| `<scope>.compare_sys_ids`, `sys_id_exclude` | false; MID, update sets, plugins, tables, columns | Optional sys_id drift |
