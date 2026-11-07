/**
 * Driftwood – end-to-end collection test (F01 / F03 / F06)
 * ---------------------------------------------------------------------------
 * Run in: System Definition > Scripts - Background
 *   - Script scope dropdown: the app itself (its scope, e.g. Driftwood)  <-- APP scope, not global
 *   - Application picker: any
 *
 * WRITES to the app's tables: collects the current instance and persists it
 * (change-only). Run it twice:
 *   run 1 on a fresh instance  -> inserts ≈ one row per tracked item
 *   run 2 with nothing changed -> inserted/updated/removed = 0 (F03)
 * The counts at the end check storage routing (F06): plugins in the CI
 * subclass, everything else in tracked_item, exactly one instance CI.
 *
 * First run in a new instance logs "Security restricted ... added to cross
 * scope privileges" lines – expected; they record the app's real
 * cross-scope needs (F02).
 * ES3-safe.
 */
var t0 = new Date().getTime();
var snap = new ConfigNowCollector().collect();
gs.info('COLLECT ' + snap.duration_ms + ' ms, warnings: ' + JSON.stringify(snap.warnings));
for (var c in snap.categories) gs.info('  ' + c + ': ' + snap.categories[c].count);
gs.info('ENV read back: ' + (snap.instance.environment || '(not set on CI)') + '   release: ' + snap.instance.family + ' / ' + snap.instance.patch);
var res = new ConfigNowWriter().persist(snap);
gs.info('PERSIST total ' + (new Date().getTime() - t0) + ' ms');
gs.info('TOTALS ' + JSON.stringify(res.totals));
for (var k in res.categories) gs.info('  ' + k + ': ' + JSON.stringify(res.categories[k]));
gs.info('INSTANCE CI ' + res.instance_sys_id);

function cnt(t, q) { var ga = new GlideAggregate(t); if (q) ga.addEncodedQuery(q); ga.addAggregate('COUNT'); ga.query(); return ga.next() ? ga.getAggregate('COUNT') : '?'; }
gs.info('CI plugins      : ' + cnt('x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin'));
gs.info('CI parent (all) : ' + cnt('x_2160899_driftw_0_cmdb_ci_sn_tracked_table'));
gs.info('Plain items     : ' + cnt('x_2160899_driftw_0_tracked_item'));
gs.info('Plain by cat    : apps=' + cnt('x_2160899_driftw_0_tracked_item', 'item_category=applications') +
        ' props=' + cnt('x_2160899_driftw_0_tracked_item', 'item_category=system_properties') +
        ' pres=' + cnt('x_2160899_driftw_0_tracked_item', 'item_category=clone_preservers') +
        ' excl=' + cnt('x_2160899_driftw_0_tracked_item', 'item_category=clone_exclusions'));
gs.info('Instance CIs    : ' + cnt('x_2160899_driftw_0_cmdb_ci_sn_instance'));
