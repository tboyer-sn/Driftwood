# Driftwood: UI roadmap (UI pages → lists → workspace)

**Status:** proposal, 2026-11-07 · **Applies to:** Driftwood v0.4.x and later

The POC UI is two UI pages: *Current Instance Settings* and *Drift Report*. They were the fastest way to prove the data model. This note sets out what stays on those pages, what moves to standard list views, and what a workspace would add.

## Tier 1: UI pages (now, v0.4.x)

These pages are kept for the POC and for quick checks.

| Page | Does | Added in |
|---|---|---|
| Current Instance Settings | Live read of this instance by category, Collect now, Download JSON, per-column sort and filter, light/dark | v0.1 – v0.4.1 |
| Drift Report | Compare two or all instances, imports, version-only and count-only toggles, table column drill-in, light/dark | v0.2 – v0.4.1 |

**Limits, by design:**

- Everything is loaded as one JSON response and filtered in the browser. Rendering is capped at 2,000 rows.
- Filters and sorts aren't saved, and you can't share a view.
- There's no personalisation, export to Excel/CSV or group-by.
- You can't drill from a row into a record (instance, table, column).
- Access is controlled by the REST role checks, not by list ACLs or views.

**What we'll still do here:**

- Keep the pages working.
- Small usability fixes.
- Per-column filters on the Drift Report pair table, if they're needed before the workspace.

## Tier 2: Standard list views (low effort, next)

The stored data already lives in real tables: the instance CI, tracked CIs and `tracked_item`. Platform list views already provide everything asked for:

- column sort, filter and search;
- group-by and personalised columns;
- saved filters;
- export.

**To add:**

- **Modules** that open filtered lists, for example:
  - *Tracked Tables* (`item_category=tables`);
  - *Tracked Columns* (`item_category=columns`);
  - *Plugins*;
  - *Properties*;
  - *Clone rules*.
- **List layouts** that put the useful attributes first.
- **Related lists on the instance CI** for each category (Z01), so an instance's form shows its components.
- **Form layouts** for the instance CI and `tracked_item`.

**Effort and limits:**

- Effort is small. It could be done by the installer (`sys_app_module`, `sys_ui_list`, related lists).
- `item_attributes` is a JSON string. To filter on a single attribute (for example `type` or `scope`), the attributes most worth filtering would need promoting to real columns. That's a schema decision for v0.5.

## Tier 3: Workspace (v1 direction)

This would be a configurable workspace built in UI Builder (Next Experience).

| Area | What it gives |
|---|---|
| Landing page | Instance cards (release, environment, last collected), drift counts by kind (schema / config / clone / count / version), production-data alerts (Z09) |
| Lists | Native list component: sort, filter, saved views, export, with record pages behind every row |
| Record pages | Instance, table and column pages with related lists and relationships: the object explorer (Z07), App → Tables → Columns, built on `cmdb_rel_ci` (Z10) |
| Drift matrix | A custom component (Now Experience / SDK) for the N-instance grid, sticky baseline, column drill-in and count-only toggles. The existing `/matrix` REST API is its data source. |
| Actions | Collect now, import snapshots, retire or acknowledge a difference, export a comparison |
| Access | Workspace roles and ACLs instead of checks in the REST scripts |

**Prerequisites and decisions:**

- **Build method.** This is the natural point to move to Fluent and the SDK (J05). Custom components and workspace pages are code, and the Fluent install test should be closed first.
- **Data shape.** Promote key attributes to columns (Tier 2 note), and add relationships (Z10) so record pages can use standard related lists.
- **Scope.** Decide which UI pages are retired when the workspace ships. Probably both, keeping the exporter and REST APIs.
- **Effort.** Much larger than Tiers 1 and 2: UI Builder pages, data resources, and one custom component for the matrix.

## Recommendation

1. **Stop adding features to the UI pages** after v0.4.1, apart from fixes.
2. **Do Tier 2 next.** Add modules, list layouts and instance related lists for each category. It gives list-view sort, filter and search on stored data almost for free.
3. **Plan Tier 3 with v1.** Design it after the Fluent install test (J05) and the relationship model (Z10).
