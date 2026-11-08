# Driftwood: status, decisions and go/no-go (v0.6)

**Updated:** 2026-11-08 · **Primary instance:** dev466156 (Brazil patch1-hotfix1), v0.6 build steps O01–O06 deployed on branch `0.6.0`; Health: *Healthy (notes)* · **Replaces:** the ConfigurationNOW POC go/no-go (v0.1.2, archived)

## Recommendation: release 0.6.0, then v0.7, with two conditions before anyone else installs it

The POC question (can a scoped app reliably record an instance's own platform configuration?) was answered in v0.1–v0.5. v0.6 delivered the adopted data model:

- one **tracked object** per thing across all instances, with its observations linked;
- **stored drift**, identical to the all-instances comparison and kept current after every save and daily;
- the object form, Objects lists and a one-object comparison;
- per-instance plugin records moved **off the CMDB**;
- a **Health** self-check that confirms the install, the data and the exact cross-scope footprint.

Everything was installed by dry-run-first scripts and verified on dev466156. The two conditions before another person installs Driftwood are still the **non-admin role test (H06)** and the **collector service account (H07)**. A **controlled access model** (strict ACLs) is now a design topic of its own.

## v0.6 results on dev466156

| Step | Result |
|---|---|
| O01 schema | 1 table, 19 columns, 14 choices (+1 choice in O03); 18 UI records |
| O02 backfill | 3,619 objects created, 12,540 observations linked, 96 inherited columns left without an object; re-run linked 0 |
| O03 stored drift | 3,623 objects in 3.6 s: differs 888, same 2,289, missing 443, expected differences 3; re-run changed 0. After a save only the touched objects are recomputed. |
| O04 object form | Two-column form, observations / table columns / item changes, *Compare across instances* |
| O05 plugins off the CMDB | 5,482 plugin CIs copied (4 instances) and verified, then removed with *Delete All Records* (two runs, see findings); drift identical afterwards (0 changes) |
| O06 Health | 18 ok, 3 notes (H06, H07, version), 0 warnings; footprint 59 of 59 expected |
| Replay of real snapshots (tests) | Brazil + Australia: 3,611 objects; the 1,184 all-instances comparison rows equal the drifting objects, kinds included; 2,771 plugin CIs moved with identical results |

## Instances and releases tested

| Instance | Release | Role | How |
|---|---|---|---|
| dev466156 | Brazil patch1-hotfix1 | Primary Driftwood instance | Full scripted install, every upgrade v0.2 → v0.6 |
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
- **Fluent.** The local SDK transform worked for the old app and for the committed Driftwood repo: 178 files, build OK, every record kept its sys_id; the two UI page HTML fields are re-serialised (`<input/>` → `<input></input>`). The in-platform IDE sync failed, and an app can't be converted on an instance with a different company prefix (d24, d25). Install test outstanding (J05).
- **Field length limits.** `sys_script_fix.name` holds 40 characters; a longer name is silently truncated, and an installer that looks it up by name then creates a copy on every run. The generator now refuses names over 40.
- **"Delete All Records" stops at 5 minutes.** It is a UI transaction (quota ~298 s): 2,637 of 5,482 CIs went in the first run. Re-run it, or use a *Data Management* delete job (background, rollback).
- **The application repository is disabled on PDIs** ("Internal and Store uploading has been disabled"). On PDIs, Git import is the install path (d38 amended).
- **Scope of child records.** Related list entries and form/list elements have no `sys_scope`; they are captured inside their parent record's update.
- **Health within the footprint.** Every check reads only tables the app already reads, except `sys_scope_privilege` (one read privilege). Reading a user's name would add a `sys_user` privilege, so run-as is compared by sys_id.
- **Deleting CMDB records from the app's scope** would add a `GlideRecord.deleteRecord` privilege; bulk removals are done by an admin instead.

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
- **Deployment (d38, amended 2026-11-08):** releases are built from Git (`main` + a release tag). Company instances install and upgrade through the application repository, with fix scripts for data migrations. PDIs install with *Import from source control*. The scripted installers stay as development tools. Health is the post-install check.
- Every category is stored as plain records (v0.6); drift is stored on the object and written change-only.

## Risks and gaps (conditions)

| # | Item | Why it matters | Where |
|---|---|---|---|
| 1 | **Only tested as admin** | The 5 roles and 24 ACLs, plus the role checks inside the REST scripts, need a test with non-admin users. Health keeps this as a note. | H06 |
| 2 | **Jobs run as admin** | Needs a least-privilege collector service account (the `collector` role exists). Health keeps this as a note. | H07 |
| 2a | **Access model not controlled enough** | Strict ACLs on who can see and change Driftwood data (controlled class) | Open topic (v0.6-plan) |
| 3 | CMDB Health / identification not checked | Needs a configured instance; plugins have left the CMDB, so it applies to the v0.7 classes only | H01, v0.7 |
| 4 | Update set linkage untested | Origin and commit links haven't been seen on an instance with retrieved sets | Z11 |
| 5 | Global customer count is an estimate | Update-history counting is prepared but not validated | M10 |
| 6 | Single node, PDIs only | No long-lived or multi-node instance tested; timing on large `sys_update_xml` / dictionary tables unknown | — |
| 7 | Build tooling | Fluent install test outstanding; decide before the workspace (v1) | J05 |
| 8 | Store certification | Extending `cmdb_ci` / `cmdb_ci_appl_now_app` from scope, and the cross-scope footprint, need review | — |
| 9 | Usability | Dark-mode table contrast (U01), Drift Report sort/filter (U02) | U |

## Next

1. **Release 0.6.0 (O07):** version 0.6.0, pull request `0.6.0` → `main`, tag `v0.6.0`, then a test install from Git on a clean PDI with Health as the check.
2. **O08 acceptance** and the rest of **O09** (secure hash salt, `compare_ignore` local value).
3. **Design topics:** the controlled access model; the architecture design document.
4. **v0.7:** Fluent conversion (if J05 passes); *SN Application*, *SN Table* and *SN Plugin* CI classes, relationships, IRE and the CMDB Health check.
5. **v1:** the workspace on objects and stored drift, Platform Analytics indicators, then drift actions and recommendations (Z14).

## Appendix: cross-scope footprint (dev466156, 2026-11-08)

**59 privileges, all expected** (Health checks them by name on every run):

- **The 58 runtime privileges from v0.5.5:**
  - **Table reads:**
    - Sources: `sys_properties`, `sys_cluster_state`, `sys_plugins`, `sys_store_app`, `sys_app`, `ecc_agent`, `sys_scope`, `sys_package`, `clone_data_preserver`, `clone_data_exclude`.
    - Schema: `sys_db_object`, `sys_dictionary`.
    - Update sets: `sys_update_set`, `sys_remote_update_set`, `sys_update_xml`, `sys_update_preview_problem`.
    - The 30 curated tables that are counted: `sys_script`, `sys_script_include`, `sys_script_client`, `sys_script_fix`, `sys_ui_policy`, `sys_ui_policy_action`, `sys_ui_action`, `sys_ui_page`, `sys_ui_script`, `sys_security_acl`, `sys_user_role`, `sys_user_role_contains`, `sys_choice`, `sysauto_script`, `sys_hub_flow`, `sys_hub_action_type_definition`, `wf_workflow`, `sys_rest_message`, `sys_soap_message`, `sys_ws_definition`, `sys_ws_operation`, `sysevent_email_action`, `sysevent_script_action`, `sys_transform_map`, `sys_data_source`, `sp_widget`, `sp_page`, `sys_app_application`, `sys_app_module`, `sys_report`.
  - **API execute:** `Glide API: properties`, `Glide API: user roles and groups`, `GlideDigest.getSHA256Hex`, `GlideRecord.insert` / `update` / `setValue` (the CI classes inherit from global `cmdb_ci`), `GlideSysAttachment.write`, `RESTAPIRequest`, `RESTAPIRequestBody`, `ScriptableServiceResultBuilder.setStatus` / `setBody` / `setHeader`.
- **v0.6:** `sys_scope_privilege` read (Health's footprint check).
- **Not yet seen:** the retention purge hasn't deleted anything, so `GlideSysAttachment.deleteAttachment` and a read on `sys_attachment` will appear the first time it does. Each auto-discovered `x_`/`u_` table from another app adds one read.
- **Must never return** (Health fails if they do): the 13 installer-only privileges removed on 2026-11-07, which are `sys_ui_list` (read, create), `sys_ui_list_element` (read, create, delete), `GlideRecord.deleteRecord`, `sys_ui_view`, `sys_relationship`, `sys_ui_related_list`, `sys_ui_related_list_entry` (read), `sys_security_acl_role`, `sys_security_type`, `sys_security_operation` (read).
- **Instances that enforce runtime access:** where new cross-scope access is denied rather than auto-granted, the privileges ship with the app (captured in Git).
