/* Diagnostic: does this instance's update set data fit the v0.5 model? (read-only)
 * Script scope: GLOBAL. Runs on any instance, with or without the app.
 *
 * The update_sets category keys each set by the set it was BUILT in
 * (sys_remote_update_set.origin_sys_id on retrieving instances), folds the
 * local copy created by a commit into its retrieved set (remote.update_set),
 * and counts updates and preview problems with grouped aggregates. This checks
 * the fields and links that relies on, and how long the counts take.
 * Paste the whole output back. Best run on an instance that has retrieved and
 * committed update sets from another instance.
 */
if (['rhino.global', 'global'].indexOf(String(typeof gs.getCurrentScopeName == 'function' ? gs.getCurrentScopeName() : 'rhino.global')) == -1) throw new Error('Run this diagnostic with the script scope set to global: it is read-only, but in an app scope it adds cross-scope privileges to that app.');
(function () {
    var out = [];
    function log(m) { out.push(m); }
    function now() { return new Date().getTime(); }
    function count(t, q) {
        var ga = new GlideAggregate(t);
        if (q) ga.addEncodedQuery(q);
        ga.addAggregate('COUNT');
        ga.query();
        return ga.next() ? parseInt(ga.getAggregate('COUNT'), 10) : 0;
    }
    function dist(t, field, q) {
        var ga = new GlideAggregate(t);
        if (!ga.isValidField(field)) return '(no field ' + field + ')';
        if (q) ga.addEncodedQuery(q);
        ga.addAggregate('COUNT');
        ga.groupBy(field);
        ga.query();
        var p = [];
        while (ga.next()) p.push(String(ga.getValue(field) || '(empty)') + '=' + ga.getAggregate('COUNT'));
        return p.join('  ') || '(none)';
    }
    function fields(t, list) {
        var gr = new GlideRecord(t);
        if (!gr.isValid()) return t + ': NOT READABLE';
        var have = [], miss = [];
        for (var i = 0; i < list.length; i++) (gr.isValidField(list[i]) ? have : miss).push(list[i]);
        return t + ': has ' + have.join(', ') + (miss.length ? '  |  MISSING ' + miss.join(', ') : '');
    }

    var T0 = now();
    log('=== Update set model diagnostic: ' + gs.getProperty('instance_name') + ' (' + gs.getProperty('glide.buildname') + ') ===');
    log(fields('sys_update_set', ['name', 'state', 'application', 'is_default', 'parent', 'base_update_set', 'origin_sys_id', 'release_date', 'sys_updated_on']));
    log(fields('sys_remote_update_set', ['name', 'state', 'application', 'application_name', 'origin_sys_id', 'remote_sys_id', 'update_set', 'parent', 'commit_date', 'sys_updated_on']));
    log(fields('sys_update_xml', ['update_set', 'remote_update_set', 'name']));
    log(fields('sys_update_preview_problem', ['remote_update_set', 'type', 'status']));

    log('\nLocal sets: ' + count('sys_update_set', '') + '   by state: ' + dist('sys_update_set', 'state', ''));
    log('  default sets: ' + count('sys_update_set', 'is_default=true') + '   with origin_sys_id: ' + count('sys_update_set', 'origin_sys_idISNOTEMPTY'));
    var hasRemote = new GlideRecord('sys_remote_update_set').isValid();
    if (hasRemote) {
        log('Retrieved sets: ' + count('sys_remote_update_set', '') + '   by state: ' + dist('sys_remote_update_set', 'state', ''));
        log('  with origin_sys_id: ' + count('sys_remote_update_set', 'origin_sys_idISNOTEMPTY') +
            '   with update_set (committed copy): ' + count('sys_remote_update_set', 'update_setISNOTEMPTY'));
        log('\nCommitted samples (remote -> local copy):');
        var r = new GlideRecord('sys_remote_update_set');
        r.addEncodedQuery('update_setISNOTEMPTY');
        r.orderByDesc('sys_updated_on');
        r.setLimit(6);
        r.query();
        while (r.next()) {
            var l = new GlideRecord('sys_update_set');
            var lOrigin = l.get(r.getValue('update_set')) ? (l.isValidField('origin_sys_id') ? String(l.getValue('origin_sys_id') || '(empty)') : '(no field)') : '(local copy not found)';
            log('  ' + r.getValue('name') + ' | remote.origin=' + (r.getValue('origin_sys_id') || '(empty)') + ' | local copy ' + r.getValue('update_set') +
                ' origin=' + lOrigin + ' state=' + (l.isValidRecord() ? l.getValue('state') : '-'));
        }
    }

    var t = now();
    log('\nsys_update_xml rows: ' + count('sys_update_xml', '') + '  (' + (now() - t) + ' ms)');
    t = now();
    var ga = new GlideAggregate('sys_update_xml');
    ga.addQuery('update_set', '!=', '');
    ga.addAggregate('COUNT');
    ga.groupBy('update_set');
    ga.query();
    var g1 = 0; while (ga.next()) g1++;
    log('  grouped by update_set: ' + g1 + ' groups in ' + (now() - t) + ' ms');
    if (hasRemote) {
        t = now();
        var gb = new GlideAggregate('sys_update_xml');
        gb.addQuery('remote_update_set', '!=', '');
        gb.addAggregate('COUNT');
        gb.groupBy('remote_update_set');
        gb.query();
        var g2 = 0; while (gb.next()) g2++;
        log('  grouped by remote_update_set: ' + g2 + ' groups in ' + (now() - t) + ' ms');
    }
    if (new GlideRecord('sys_update_preview_problem').isValid()) {
        log('Preview problems: ' + count('sys_update_preview_problem', '') + '   by type: ' + dist('sys_update_preview_problem', 'type', '') +
            '   by status: ' + dist('sys_update_preview_problem', 'status', ''));
    }
    var est = count('sys_update_set', '') + (hasRemote ? count('sys_remote_update_set', '') - count('sys_remote_update_set', 'update_setISNOTEMPTY') : 0);
    log('\nEstimated update_sets items on the first (full) run: about ' + est);
    log('Total diagnostic time: ' + (now() - T0) + ' ms');
    gs.print(out.join('\n'));
})();
