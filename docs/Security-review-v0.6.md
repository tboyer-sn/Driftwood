# Driftwood: security review (v0.6)

**Date:** 2026-11-09 · **Scope:** every server script, REST resource, UI page and installer in v0.6 (O06.1) · **Asked for:** compare the code with security best practice and enforce `GlideRecordSecure` · **Status:** phase 1 built and tested (checklist O12, RUNBOOK O12); phase 2 decided in principle (only the collector account writes), waits for the access model (O13, O10)

## Summary

The client side is clean, and secrets are handled well. The main gap is on the server: **no code uses `GlideRecordSecure`**, so every read and write bypasses ACLs. Each REST resource compensates with a role check in its script. That holds for today's all-or-nothing roles. It would silently ignore any row or field rule added under the controlled access model (O10), and one resource, `GET /current`, runs a full platform read with system rights for any user with read access.

`GlideRecordSecure` is right for **reads made on behalf of a person** and wrong for the **collector's reads of platform tables**. Writes can only move to it once a collector principal with write ACLs exists, which is the O10 decision.

## Findings

| # | Severity | Finding | Where | Fix |
|---|---|---|---|---|
| S1 | High | `GET /current` runs the collector in the caller's session. A user with only `configuration_read` triggers a read of `sys_properties`, update sets, ACL counts and more, with system rights, beyond what their own ACLs would allow. | `scripted_rest/current_GET.js` | Read-only users get this instance's **stored** observations through `GlideRecordSecure`; a live collection needs `configuration_admin` (phase 1) |
| S2 | High (before others install) | All four jobs run as `admin` | Jobs (H07) | A collector service account with the `collector` role (phase 2) |
| S3 | Medium | Every user-facing read uses `GlideRecord`: compare, matrix, instances, the Drift Report, the deep link. Driftwood's own ACLs, including the field ACL on `secure_value_hash` and any future row or field rule, are not applied to what the REST API returns. | `ConfigNowCompare` via the REST resources | A `secure` mode in `ConfigNowCompare` reading through `GlideRecordSecure`, used by every REST resource (phase 1) |
| S4 | Medium | The secure-value hash salt is a constant in the code (`cfgnow-poc`). Anyone with `configuration_read_secure` can brute-force weak secrets offline. | `ConfigNowConfig.secureHashSalt` | A per-installation salt in a `password2` property; one-time "changed" wave on secure properties (O09) |
| S5 | Medium | The REST API relies on in-script role checks; *Requires ACL authorization* is off on every operation | `sys_ws_operation` | Phase 1: *Requires ACL authorization* on every operation (the platform's default REST ACL: internal users only), script checks kept. Phase 2: role-based REST endpoint ACLs per resource from the access model |
| S6 | Medium | Writes are not tied to a principal: observations, runs, item changes and objects are written as whoever triggered the save (the clicking user, the job user). No create or write ACLs exist, so `GlideRecordSecure` writes would all be refused today. | `ConfigNowWriter`, `ConfigNowObjects`, `ConfigNowDrift` | Phase 2: create/write ACLs for the `collector` role only; Collect now and imports hand the work to the collector principal instead of writing as the person |
| S7 | Low | Imported snapshots' `source_table` and `source_sys_id` are not validated before they become a link (the base URL is checked for `https://`) | `ConfigNowWriter._sourceUrl` | Accept only a table name (`^[a-z0-9_]{1,80}$`) and a sys_id of letters, digits and `_` (up to 32: most are hex, but not all, e.g. `global`) (phase 1) |
| S8 | Low | Error responses return raw exception text | REST resources | Log the detail, return a short message (phase 1) |
| S9 | Low | Who started a collection or an import is only implicit (`sys_created_by` on the run) | `collection_run` | Record the initiating user and the method on the run (phase 1) |

## Already in line with best practice

| Area | How |
|---|---|
| Secrets | Secure property values are never stored or returned; only a salted hash, behind a field ACL |
| Admin-only fields | Environment is set by an admin and never written by the collector |
| Browser | Pages build every element with `textContent` (no `innerHTML`, `eval` or `document.write`); links come only from `https://` instance URLs and open with `rel=noopener` |
| CSRF | Every page request sends the session's `X-UserToken`; scripted REST refuses a bare session cookie |
| Tampering | No create or write ACLs on observations, runs, changes or objects: nobody can edit them in a list |
| Input | Imports check the schema, size (`maxImportItems`), age, and refuse this instance's own snapshot unless asked; category parameters are matched against the configured list; no user input reaches an encoded query |
| Footprint | Installers and diagnostics refuse to run outside global scope; Health checks the 59 cross-scope privileges by name |
| Least data | Read-only collector; change-only writes; retention purge |

## Where `GlideRecordSecure` applies

| Code path | Runs as | Today | Target |
|---|---|---|---|
| REST reads (`/compare`, `/matrix`, `/instances`), pages, deep link | The person | `GlideRecord` | **`GlideRecordSecure`** (phase 1) |
| `GET /current` | The person | Collector, `GlideRecord` on platform tables | **Stored observations via `GlideRecordSecure`**; live collection for `configuration_admin` only (phase 1) |
| Health | The person (`configuration_admin`) | `GlideRecord` and counts | Kept: an admin-only diagnostic of the installation, mostly counts (`GlideAggregate`); a secure read adds nothing there |
| Collector reading platform tables | Collector principal | `GlideRecord` | `GlideRecord`, kept and documented. A least-privilege account can't read `sys_properties` and similar through ACLs; `GlideRecordSecure` would silently drop rows and record them as removed, which is false drift. |
| Writer, objects, drift, retention, migration, backfill | Today the clicking user or the job user | `GlideRecord` | **`GlideRecordSecure` under the collector principal**, with create/write ACLs for `collector` only (phase 2, needs O10) |
| Installers and diagnostics | Admin, global scope | `GlideRecord` | Kept: development tools, not part of the app |

## Plan

**Phase 1 (built):** S1, S3, S5, S7, S8, S9. One helper, `ConfigNowConfig.record(table, secure)`, chooses between `GlideRecordSecure` and `GlideRecord`; `ConfigNowCompare({ secure: true })` is what every REST resource uses, and a test fails if a REST script reads a table directly or uses the comparison without it. Expected effect on the footprint: none for reads of Driftwood's own tables; Health will show anything new. New suite: `tests/test_security.js`.

**Phase 2, with the O10 decision (write model agreed 2026-11-09: only the collector account writes):** S2, S6, S4.
- A collector service account.
- Write ACLs for `collector` only.
- *Collect now* and imports hand their work to that account instead of writing as the person.
- `GlideRecordSecure` on every Driftwood write.
- The per-installation salt.
- Row and field rules from the access model.
