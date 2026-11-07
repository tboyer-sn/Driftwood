/* ---- Runner (appended by build) ---------------------------------------
 * Paste this whole file into System Definition > Scripts - Background
 * (scope: global) on a NON-PRODUCTION instance and click "Run script".
 * Nothing is written – it only reads and prints a JSON snapshot + summary.
 * ---------------------------------------------------------------------- */
(function () {
    var CATEGORIES = null; // e.g. ['plugins','system_properties'] to narrow
    var PRINT_FULL_JSON = false; // true = print entire snapshot (can be large)

    var opts = CATEGORIES ? { categories: CATEGORIES } : {};
    var snap = new ConfigNowCollector(opts).collect();
    var i = snap.instance;
    gs.info('=== Driftwood dry run ===');
    gs.info('Instance : ' + i.instance_name + '  (' + i.instance_url + ')');
    gs.info('Release  : ' + (i.family || i.build_name) + ' / ' + i.patch + '  build ' + i.build_date);
    gs.info('War      : ' + i.war);
    gs.info('Env      : ' + (i.environment || '(not set on CI)') + '   prod flag: ' + i.production_flag + '   Nodes: ' + i.node_count + '   TZ: ' + i.timezone);
    for (var c in snap.categories) gs.info('  ' + c + ': ' + snap.categories[c].count + ' item(s)');
    gs.info('Duration : ' + snap.duration_ms + ' ms');
    gs.info('Warnings : ' + snap.warnings.length);
    for (var w = 0; w < snap.warnings.length; w++) gs.info('  - ' + snap.warnings[w].area + ': ' + snap.warnings[w].message);
    if (PRINT_FULL_JSON) gs.info(JSON.stringify(snap, null, 2));
    else gs.info('Sample   : ' + JSON.stringify(snap.categories.system_properties ? snap.categories.system_properties.items.slice(0, 3) : [], null, 2));
})();
