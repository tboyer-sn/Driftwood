/* Driftwood - Backfill tracked objects (v0.6, O02)
 * Links every stored observation (tracked items, tracked CIs) to its tracked
 * object, creating the objects that don't exist yet. Inherited columns (Z12)
 * get no object. Idempotent: it only creates objects and fills empty Object
 * references, so it is safe to re-run. Runs automatically when Driftwood is
 * installed or upgraded from the application repository.
 *
 * Dry run first: Scripts - Background, script scope Driftwood:
 *   gs.info(new ConfigNowObjects().backfill({ dryRun: true }).text);
 */
gs.info(new ConfigNowObjects().backfill({ dryRun: false }).text);
