/* Driftwood - Recompute all drift (v0.6, O03)
 * Fills or refreshes the drift fields of every tracked object from the
 * stored observations (same rules as Drift Report > All instances).
 * Change-only and safe to re-run. Runs automatically when Driftwood is
 * installed or upgraded from the application repository, after the
 * backfill (fix scripts run in name order: "Backfill" before "Recompute").
 *
 * Dry run first: Scripts - Background, script scope Driftwood:
 *   gs.info(new ConfigNowDrift().recompute({ dryRun: true }).text);
 */
gs.info(new ConfigNowDrift().recompute().text);
