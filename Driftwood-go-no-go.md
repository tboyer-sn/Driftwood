# Driftwood: status and go/no-go (v0.5.4)

**Date:** 2026-11-08 · **Primary instance:** dev466156 (Brazil patch1-hotfix1), Driftwood v0.5.3 deployed, v0.5.4 (list layouts) packaged · **Replaces:** the ConfigurationNOW POC go/no-go (v0.1.2, 2026-11-01)

## Recommendation: Go to v0.6 (the adopted data model), with conditions

The POC question was whether a scoped app can reliably record an instance's own platform configuration in the CMDB. That is answered. Since then the app has gained:

- cross-instance and cross-release drift;
- export from instances without the app;
- table, column and update-set tracking;
- history with retention.

All of it is installed and upgraded by scripts and verified on real instances. The conditions are the open risks in the table at the end. The two that matter before wider use are a **non-admin role test** and a **collector service account**.

## Instances and releases tested

| Instance | Release | Role | How |
|---|---|---|---|
| dev466156 | Brazil patch1-hotfix1 | Primary Driftwood instance | Full scripted install, every upgrade v0.2 → v0.5.3 |
| dev465827 | Brazil patch1-hotfix1 | Original POC instance (to retire) | Old app; v0.5 export imported; Fluent trial |
| dev431461 | Australia patch7 | Release comparison | Exporter only (global scope); v0.3 and v0.5 exports imported |
| dev432226 | Zurich patch13 | Release comparison (PDI since released) | Git import of the app; v0.2 snapshot only |

## What is proven

| Area | Result |
|---|---|
| Scripted build and upgrades | Every version installs and upgrades with dry-run-first scripts. Predicted dry-run counts matched the instance every time. Re-runs change nothing. The rebrand renamed the menu and jobs in place, with no duplicates. |
| Change-only writes | A second run writes 0. The first real change log matched an install item by item (5 changes, d36). |
| Collection cost | ~3,300 items on dev466156 in 2.5–6.8 s. Exporter 6–10 s. Grouped update-set counts take milliseconds. |
| Export without the app | Global scope, read-only, one attachment. 3,313 items (Australia) / 3,658 (old Brazil), 0 warnings. |
| Import compatibility | A newer snapshot imports into an older app (unknown categories are skipped); a re-import changes nothing; a newer app fills missing categories. Pre-rename `configurationnow.*` files still import. |
| Cross-release drift | Brazil vs Australia:<br>• 817 of 822 curated-table columns are identical; 5 real schema differences<br>• tables: 30 count-only differences, 1 schema difference<br>• plugins and apps: version-only differences<br>• real config drift: MFA, `no_blank_password`, clone preservers that differ by release |
| History | Runs, change log, baselines, snapshot attachment and retention all work. The live purge deleted nothing, correctly. |
| Source links, sys_id drift | Links open the real record on each instance. The sys_id check is limited to categories where sys_ids are shared across instances (d32). |

## Findings worth keeping

- **Global scope gives Java strings.** `GlideDateTime.getValue()` and `gs.getProperty` return Java strings in global scope, so wrap them in `String()` before calling `.replace(RegExp)`. The test harness now emulates this (d20).
- **ES3 in global background scripts.** Reserved words used as bare keys are compile errors. All server code passes a strict ES3 check.
- **`sys_plugins.active` and `v_plugin`.** The `active` field is boolean on Brazil. Querying `v_plugin` rebuilds a cache (~17 s); never use it.
- **Per-instance sys_ids.** `sys_plugins`, `sys_db_object` and `sys_dictionary` sys_ids differ for out-of-box records between instances; store apps, custom apps and clone rules keep theirs (d32).
- **The "customer-created" rule.** The Global-package rule counts mostly out-of-box records (PDI build, plugin activations as admin, ServiceNow staff accounts). There are now two counts: x_ scope (exact) and a Global estimate. Update-history counting is prepared but off (d27, d28).
- **Inherited columns on CMDB classes.** The dictionary repeats inherited fields under each class, so CMDB classes report inflated "own" columns (Z12).
- **Cross-scope privileges.** Running in app scope auto-creates cross-scope privileges; run the exporter and diagnostics in global.
- **Fluent.** The local SDK transform of the old app worked, with CMDB `extends` intact and the build succeeding. The in-platform IDE sync failed, and an app can't be converted on an instance with a different company prefix (d24, d25).

## Decisions in force

- Storage routing per category.
- `environment` is admin-only.
- Change-only writer.
- Count drift and schema drift are separate.
- History with a 180-day default retention, overridable globally or per instance.
- Update sets keyed by originating set.
- Optional sys_id drift.
- UI pages get fixes only; list views next; workspace for v1 (d26).
- **Three-layer data model** (instance → tracked object → observations; applications, tables and plugins as CIs; plugin observations leave the CMDB; drift stored on the object, list-only for now) (d34).
- Driftwood rebrand of names and identifiers (d35).

## Risks and gaps (conditions)

| # | Item | Why it matters | Where |
|---|---|---|---|
| 1 | **Only tested as admin** | The 5 roles and 21 ACLs, plus the role checks inside the REST scripts, need a test with non-admin users | New H06 |
| 2 | **Job runs as the default user** | Needs a least-privilege collector service account (the `collector` role exists) | New H07 |
| 3 | CMDB Health / identification not checked | Needs a configured instance; much smaller once plugins leave the CMDB (v0.6) | H01, v0.7 |
| 4 | Update set linkage untested | Origin and commit links haven't been seen on an instance with retrieved sets | Z11 |
| 5 | Global customer count is an estimate | Update-history counting is prepared but not validated | M10 |
| 6 | Single node, PDIs only | No long-lived or multi-node instance tested; timing on large `sys_update_xml` / dictionary tables unknown | — |
| 7 | Build tooling | Fluent install test outstanding; decide before the workspace (v1) | J05 |
| 8 | Store certification | Extending `cmdb_ci` / `cmdb_ci_appl_now_app` from scope, and the cross-scope footprint, need review | — |
| 9 | Usability | Dark-mode table contrast (U01), Drift Report sort/filter (U02) | U |

## Next

1. Close v0.5: deploy v0.5.4 list layouts, finish the page checks, do the non-admin test (H06) and set up the service account (H07).
2. **v0.6:**
   - tracked objects with stored drift status;
   - object form and lists;
   - backfill;
   - plugin migration off the CMDB.
3. **v0.7:** *SN Application*, *SN Table* and *SN Plugin* CI classes, with relationships, IRE and the CMDB Health check.
4. **v1:** the workspace on objects and stored drift, plus Platform Analytics indicators. Then drift actions and recommendations (Z14).

## Appendix: cross-scope footprint (dev466156, 2026-11-08)

71 cross-scope privileges were recorded on dev466156. **58 are needed at runtime** and form the app's real footprint. **13 were created only because installers or diagnostics ran in the app's scope instead of global**; they can be deleted.

**Runtime (58)**

- **Table reads:**
  - Sources: `sys_properties`, `sys_cluster_state`, `sys_plugins`, `sys_store_app`, `sys_app`, `ecc_agent`, `sys_scope`, `sys_package`, `clone_data_preserver`, `clone_data_exclude`.
  - Schema: `sys_db_object`, `sys_dictionary`.
  - Update sets: `sys_update_set`, `sys_remote_update_set`, `sys_update_xml`, `sys_update_preview_problem`.
  - The 30 curated tables that are counted: `sys_script`, `sys_script_include`, `sys_script_client`, `sys_script_fix`, `sys_ui_policy`, `sys_ui_policy_action`, `sys_ui_action`, `sys_ui_page`, `sys_ui_script`, `sys_security_acl`, `sys_user_role`, `sys_user_role_contains`, `sys_choice`, `sysauto_script`, `sys_hub_flow`, `sys_hub_action_type_definition`, `wf_workflow`, `sys_rest_message`, `sys_soap_message`, `sys_ws_definition`, `sys_ws_operation`, `sysevent_email_action`, `sysevent_script_action`, `sys_transform_map`, `sys_data_source`, `sp_widget`, `sp_page`, `sys_app_application`, `sys_app_module`, `sys_report`.
  - Each auto-discovered `x_`/`u_` table from another app adds one more read.
- **API execute:** `Glide API: properties`, `Glide API: user roles and groups`, `GlideDigest.getSHA256Hex`, `GlideRecord.insert` / `update` / `setValue` (the CI classes inherit from global `cmdb_ci`), `GlideSysAttachment.write` (run snapshots), `RESTAPIRequest`, `RESTAPIRequestBody`, `ScriptableServiceResultBuilder.setStatus` / `setBody` / `setHeader`.
- **Not seen yet:** the retention purge hasn't deleted anything, so `GlideSysAttachment.deleteAttachment` and a read on `sys_attachment` will appear the first time it does.
- **Instances that enforce runtime access:** where new cross-scope access is denied rather than auto-granted, ship these privileges with the app (they are captured in Git and the update set), or the first purge will fail.

**Installer-only (13), safe to delete:** `sys_ui_list` (read, create), `sys_ui_list_element` (read, create, delete), `GlideRecord.deleteRecord`, `sys_ui_view`, `sys_relationship`, `sys_ui_related_list`, `sys_ui_related_list_entry` (read), `sys_security_acl_role`, `sys_security_type`, `sys_security_operation` (read).
