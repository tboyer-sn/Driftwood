/* Driftwood - Move plugins off the CMDB (v0.6, O05)
 * Copies every per-instance plugin record stored as a CI to the plain
 * tracked_item table (first seen, last changed, presence, links and the
 * tracked object are kept). Idempotent; it never deletes the CIs. When it
 * reports SAFE TO DELETE, delete them with "Delete All Records" on the
 * x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin table. On an instance that never
 * stored plugins as CIs it does nothing.
 *
 * Dry run first: Scripts - Background, script scope Driftwood:
 *   gs.info(new ConfigNowMigration().movePlugins({ dryRun: true }).text);
 */
gs.info(new ConfigNowMigration().movePlugins().text);
