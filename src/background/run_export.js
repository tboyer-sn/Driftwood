/* ---- Snapshot exporter runner (appended by build.sh) --------------------
 * Runs the Driftwood collector on ANY instance – the app does not need
 * to be installed – and saves the snapshot JSON as an attachment on your own
 * user record, ready to download and import into the Drift Report.
 *
 * Run in: System Definition > Scripts - Background, scope: global.
 * Writes exactly one record: the sys_attachment (delete it when done).
 * Includes every category the app collects, tables included.
 * ---------------------------------------------------------------------- */
(function () {
    var CATEGORIES = null;     // e.g. ['tables'] to narrow; null = all
    var ATTACH = true;         // false = collect and report only, write nothing
    // Script scope guard: in an app scope, every table and API this script
    // touches is added to that app's cross-scope privileges, even in a dry run.
    var curScope = String(typeof gs.getCurrentScopeName == 'function' ? gs.getCurrentScopeName() : 'rhino.global');
    if (curScope != 'rhino.global' && curScope != 'global') {
        gs.info('ABORT: set the script scope (Scripts - Background) to global and run again. Current script scope: ' + curScope + '. Nothing was read or written.');
        return;
    }

    var cfg = ConfigNowConfig.get();
    if (CATEGORIES) cfg.categories = CATEGORIES;
    var snap = new ConfigNowCollector({ config: cfg }).collect();
    snap.collector_version = ConfigNowConfig.COLLECTOR_VERSION + '-exporter';
    snap.collector_scope = '';              // no app on this instance
    snap.exported_by = String(gs.getUserName());

    var i = snap.instance, total = 0;
    gs.info('=== Driftwood snapshot exporter ===');
    gs.info('Instance : ' + i.instance_name + '  (' + (i.family || i.build_name) + ' / ' + i.patch + ')   collected ' + snap.collected_at + ' UTC in ' + snap.duration_ms + ' ms');
    for (var c in snap.categories) { total += snap.categories[c].count; gs.info('  ' + c + ': ' + snap.categories[c].count); }
    gs.info('Warnings : ' + snap.warnings.length);
    for (var w = 0; w < snap.warnings.length; w++) gs.info('  - ' + snap.warnings[w].area + ': ' + snap.warnings[w].message);

    if (!ATTACH) { gs.info('ATTACH = false – nothing written.'); return; }
    var user = new GlideRecord('sys_user');
    if (!user.get(gs.getUserID())) { gs.info('ABORT: could not load your sys_user record to attach the file to.'); return; }
    var name = 'driftwood_' + i.instance_name + '_' + String(snap.collected_at).replace(/[: ]/g, '-') + '.json';
    var json = JSON.stringify(snap);
    var attId = new GlideSysAttachment().write(user, name, 'application/json', json);
    if (!attId) { gs.info('ABORT: attachment write failed.'); return; }
    gs.info('Saved    : ' + name + '  (' + Math.round(json.length / 1024) + ' KB, ' + total + ' items)');
    gs.info('Download : ' + gs.getProperty('glide.servlet.uri') + 'sys_attachment.do?sys_id=' + attId);
    gs.info('Then: Drift Report > Import snapshots… on the comparing instance. Delete the attachment afterwards (sys_attachment ' + attId + ').');
})();
