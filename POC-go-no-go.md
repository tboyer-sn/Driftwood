# Driftwood: POC go/no-go

**POC version:** v0.1.2 · **Date:** 2026-11-01
**Environment:** PDI `dev465827`, Brazil patch1-hotfix1 (build 10-12-2026_0745), single node
**App scope:** `x_2160899_driftw_0`. Source is in Git through Studio source control.

## Recommendation: Go, with conditions

The core question was whether a scoped app can reliably record a ServiceNow instance's own platform configuration in the CMDB, using the v4.0 data model. **The answer is yes.** Every part of the app was built and runs on Brazil:

- collection, and change-only writes to the CMDB
- both storage modes
- the report page, REST API, on-demand collection and the daily job

The conditions before v0.2 are the open items under **Risks and gaps**. The main ones are the CMDB Health check (H01), testing with a non-admin user, and the IRE.

## What was proven

| Question | Result |
|---|---|
| Can a scoped app read platform config from global tables? | Yes. 9 tables read with **0 warnings**. Cross-scope access was auto-granted and captured (see the footprint below). |
| Can a scoped class extend `cmdb_ci_appl_now_app`? | **Yes.** It's in the base CMDB package, extensible, and the subclass works. |
| Can scoped CI classes be created under `cmdb_ci`? | Yes. They're stored in CMDB flat storage (`cmdb$par1`, flex columns). |
| Do CI mode and plain-table mode work side by side? | Yes. Plugins → CI subclass (1,381); everything else → `tracked_item` (1,068). Routing is config only. |
| Is the writer idempotent and change-only? | Yes. The second run wrote **0** of 2,449 items. A property change was detected (1 updated), and so was the revert. |
| Is the admin-set `environment` preserved? | Yes. The collector reads it and never writes it. |
| Do secure property values stay out of storage? | Yes. They're masked, with only a salted hash stored, readable via a field ACL by `configuration_read_secure`. |
| UI, API, on-demand and scheduled collection? | The report page and Collect now button work. The daily job is scheduled. `GET /current` works with session auth and enforces its role in the script. |

## Results and timings (Brazil PDI)

| Measure | Value |
|---|---|
| Items collected | 2,449: plugins 1,381 · apps 765 · props 17 · clone preservers 244 · clone exclusions 42 · MID 0 |
| Collection time | 0.47–1.0 s |
| First persist (all inserts) | 16.4 s total, including CMDB business rules on 1,381 CIs |
| Steady-state run (no changes) | **0.875 s total**, 0 writes, no audit noise |
| Change detection | 1 changed property → exactly 1 update |
| Duplicate instance CIs | 0. Coalescing on `instance_name` works. |

## Decisions made during the POC

1. **The instance CI extends `cmdb_ci_appl_now_app`.** It's in the base CMDB package and CSDM-aligned, and avoids extending `cmdb_ci` directly.
2. **Environment is the OOTB `environment` field (on `cmdb_ci_appl`).** An admin sets it and the collector never writes it. `glide.installation.production` can't be trusted: it's `true` even on a PDI.
3. **Storage mode is chosen per category: a CI subclass or the plain `tracked_item` table.** This lets each org decide. Routing moves to `sn_cmdb_table_config` after the POC. Switching a category is a migration, not a setting change.
4. **Tracked columns are named `item_category` and `item_attributes`.** `cmdb_ci` already has `category` (40) and `attributes` (65,000).
5. **Diagnostics run in global scope.** Scoped runs auto-create cross-scope privileges.
6. **Fluent conversion is deferred to after the POC (H05).** It's admin-only to develop, and reversibility isn't documented.
7. **The composite index goes on `tracked_item` only.** An index on the CI class would land on the shared CMDB partition table.

## Platform findings worth keeping

- **`sys_plugins.active` is boolean on Brazil.** Older releases use the string `active`/`inactive`, so the collector normalises both.
- **Querying `v_plugin` triggers a full catalog cache rebuild (~17 s).** Never use it.
- **Global background scripts run at ES Level 0 (ES3).** Reserved words (`private`, `boolean`, …) are compile errors as bare object keys or `.member` names. All server code now passes a strict ES3 check.
- **Every `sys_properties` insert or update flushes the whole platform cache (1–7 s each).** Don't use properties for anything that changes at runtime. Create app properties that change with `ignore_cache = true`.
- **`cmdb_ci_appl_now_mid` and `_connector` don't exist without Event Management.** The app doesn't depend on them.
- **The `instance` table (High Availability Cloning) is the clone-target list, not a CI.** It's a candidate source for the instance inventory.
- **A bare browser URL to a scripted REST API is refused on Brazil ("User is not authenticated").** Calls with session plus `X-UserToken`, or basic/OAuth auth, work.
- **Plugin and app overlap.** The PDI has 1,381 `sys_plugins` rows and 763 active `sys_store_app` rows, and some features appear in both. Category ownership needs a rule before drift reporting.

## Dependency footprint (cross-scope privileges captured in the app)

- **Table read (9):** `sys_properties`, `sys_cluster_state`, `sys_plugins`, `sys_store_app`, `sys_app`, `ecc_agent`, `sys_scope`, `clone_data_preserver`, `clone_data_exclude`
- **API execute (5):** Glide properties API, `GlideDigest.getSHA256Hex`, `GlideRecord.setValue` / `insert` / `update` (likely because the CI tables inherit from global `cmdb_ci`)

This is the list a Store review, or any instance's security team, will want to see.

## Risks and gaps (conditions for v0.2)

| # | Item | Why it matters |
|---|---|---|
| 1 | **CMDB Health / Data Manager not yet checked (H01)** | 1,381 CIs were inserted without the IRE, which could show as duplicates or missing identification. |
| 2 | **No IRE / identification rules** | Needed for CMDB hygiene and for coexisting with other CMDB data sources. |
| 3 | **Only tested as admin** | The `configuration_read` / `_secure` / `_admin` roles and the 10 ACLs need a test with a non-admin user. |
| 4 | **Single instance, single release** | Cross-instance collection and older release families are untested. |
| 5 | **Scheduled job runs as the default user** | Needs a dedicated collector service account with the least privilege. |
| 6 | **Routing lives in properties** | A cache flush on every change. Move it to `sn_cmdb_table_config`, plus a migration script. |
| 7 | **Plugin/app overlap** | Drift reports could double-count without an ownership rule. |
| 8 | **Store certification** | Confirm that extending `cmdb_ci_appl_now_app` and creating classes under `cmdb_ci` from scope are acceptable. |

## Recommended next steps (v0.2)

1. **Close the POC conditions:** run the CMDB Health check (H01), and test with a non-admin user for each role.
2. **Cross-instance collection.** A central instance calls `GET /current` on each Dev/Test/Sub-Prod/Prod instance, with a REST message, credential and collector account per target, and writes through the same writer.
3. **Drift detection.** Compare `value_hash` by `item_key` across instances and over time, and show it in a drift view on the report page.
4. **IRE and identification rules** for the instance class and tracked CI classes.
5. **`sn_cmdb_table_config`-driven routing**, a storage-mode migration script, and an ownership rule for plugins and apps.
6. **A release matrix:** run the dry run on at least one older family to confirm the collector's field fallbacks.
7. **Fluent trial (H05)** to decide whether tables, roles and ACLs become code for v0.2.

## How it was built

Apart from the instance table, the 5 roles and one index, the whole app was installed by three scripted, dry-run-first, idempotent installers, each mock-tested before it ran on the instance:

| Installer | Creates |
|---|---|
| `build_schema.js` | 3 tables, 47 columns, 15 choices |
| `install_code.js` | 3 script includes (byte-identical to source), 5 properties |
| `install_ui.js` | 10 ACLs, UI action, scheduled job, REST API plus operation, UI page, menu, 4 modules |

**93 platform records went in by script, with 0 warnings on every live run.** Round trips caused by issues the mocks couldn't catch:

- **2 ES3 reserved-word compile errors.** Now prevented by a strict key and member check.
- **1 release difference.** The Brazil plugin flag returned 0 plugins until it was fixed.
- **1 scope-picker mistake** during a diagnostic.
- **The `category` and `attributes` collisions with `cmdb_ci`.** A pre-check caught these before any column was created.

Everything needed to rebuild the app on a fresh instance is in the POC package: the installers, source, tests, ES3 checker and README. The live build record is the POC Checklist artifact.
