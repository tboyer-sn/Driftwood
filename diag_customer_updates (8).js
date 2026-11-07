/* Diagnostic: is "customer update history" a usable customer count? (read-only)
 * Script scope: GLOBAL. Runs on any instance, with or without the app.
 *
 * Option 2 for the customer count (finding d27): count records whose CURRENT
 * version (sys_update_version) came from a customer update set, instead of
 * guessing from package or creator. Before turning it on
 * (<scope>.customer_history = true) this checks, on THIS instance:
 *   1. that sys_update_version has the fields and values the method relies on
 *      (state = current, source_table = sys_update_set / sys_remote_update_set);
 *   2. what the count gives per tracked table, next to the v0.4.2 counts;
 *   3. how long it takes (sys_update_version is large on long-lived instances).
 * Paste the whole output back. Run it on a PDI AND, if you can, on a real
 * long-lived non-production instance: that's where the timing matters.
 */
if (['rhino.global', 'global'].indexOf(String(typeof gs.getCurrentScopeName == 'function' ? gs.getCurrentScopeName() : 'rhino.global')) == -1) throw new Error('Run this diagnostic with the script scope set to global: it is read-only, but in an app scope it adds cross-scope privileges to that app.');
(function () {
    var SOURCES = ['sys_update_set', 'sys_remote_update_set'];
    var TABLES = [
        'sys_script', 'sys_script_include', 'sys_script_client', 'sys_script_fix',
        'sys_ui_policy', 'sys_ui_policy_action', 'sys_ui_action', 'sys_ui_page', 'sys_ui_script',
        'sys_security_acl', 'sys_user_role', 'sys_user_role_contains',
        'sys_dictionary', 'sys_db_object', 'sys_choice', 'sys_properties',
        'sysauto_script', 'sys_hub_flow', 'sys_hub_action_type_definition', 'wf_workflow',
        'sys_rest_message', 'sys_soap_message', 'sys_ws_definition', 'sys_ws_operation',
        'sysevent_email_action', 'sysevent_script_action', 'sys_transform_map', 'sys_data_source',
        'sp_widget', 'sp_page', 'sys_app_application', 'sys_app_module', 'sys_report',
        'sys_app', 'sys_store_app'
    ];
    var SCOPED = 'sys_scope.scopeSTARTSWITHx_';
    var GLOBAL_EST = 'sys_package=global^sys_created_byNOT INsystem,maint,glide.maint,guest^sys_created_byNOT LIKE@snc^sys_created_byNOT LIKE.maint';
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
        if (q) ga.addEncodedQuery(q);
        ga.addAggregate('COUNT');
        ga.groupBy(field);
        ga.query();
        var parts = [];
        while (ga.next()) parts.push(String(ga.getValue(field) || '(empty)') + '=' + ga.getAggregate('COUNT'));
        return parts.join('  ') || '(none)';
    }
    function siblings(table) {
        var out2 = [];
        var db = new GlideRecord('sys_db_object');
        db.addQuery('name', 'STARTSWITH', table + '_');
        db.query();
        while (db.next()) out2.push(String(db.getValue('name')));
        return out2;
    }

    var T0 = now();
    log('=== Customer update history diagnostic: ' + gs.getProperty('instance_name') + ' (' + gs.getProperty('glide.buildname') + ') ===');
    var v = new GlideRecord('sys_update_version');
    if (!v.isValid()) { gs.print(out.join('\n') + '\nsys_update_version is not readable here – option 2 is not possible.'); return; }
    var need = ['name', 'state', 'source_table'], missing = [];
    for (var n = 0; n < need.length; n++) if (!v.isValidField(need[n])) missing.push(need[n]);
    if (missing.length) { gs.print(out.join('\n') + '\nsys_update_version is missing field(s): ' + missing.join(', ') + ' – option 2 needs a different method on this release.'); return; }

    var t = now();
    log('sys_update_version rows: ' + count('sys_update_version', '') + '  (' + (now() - t) + ' ms)');
    t = now(); log('  by state       : ' + dist('sys_update_version', 'state', '') + '  (' + (now() - t) + ' ms)');
    t = now(); log('  by source_table: ' + dist('sys_update_version', 'source_table', '') + '  (' + (now() - t) + ' ms)');
    t = now(); log('  current, customer sources: ' + count('sys_update_version', 'state=current^source_tableIN' + SOURCES.join(',')) + '  (' + (now() - t) + ' ms)');

    log('\ntable | total | scoped (x_) | global est. | customer updates (current, update sets) | ms');
    var slow = [], sum = 0;
    for (var i = 0; i < TABLES.length; i++) {
        var tb = TABLES[i];
        var gr = new GlideRecord(tb);
        if (!gr.isValid()) { log(tb + ' | (table not found)'); continue; }
        var meta = gr.isValidField('sys_package') && gr.isValidField('sys_scope');
        var q = 'nameSTARTSWITH' + tb + '_^state=current^source_tableIN' + SOURCES.join(',');
        var sib = siblings(tb);
        for (var s = 0; s < sib.length; s++) q += '^nameNOT LIKE' + sib[s] + '_';
        t = now();
        var upd = count('sys_update_version', q);
        var ms = now() - t;
        sum += ms;
        slow.push({ t: tb, ms: ms });
        log(tb + ' | ' + count(tb, '') + ' | ' + (meta ? count(tb, SCOPED) : '-') + ' | ' + (meta ? count(tb, GLOBAL_EST) : '-') +
            ' | ' + upd + (sib.length ? ' (excl. ' + sib.length + ' sibling prefixes)' : '') + ' | ' + ms);
    }
    slow.sort(function (a, b) { return b.ms - a.ms; });
    var top = [];
    for (var k = 0; k < slow.length && k < 5; k++) top.push(slow[k].t + ' ' + slow[k].ms + ' ms');
    log('\nHistory counts took ' + sum + ' ms in total. Slowest: ' + top.join(', '));
    log('Total diagnostic time: ' + (now() - T0) + ' ms');
    log('\nSamples (current versions from customer update sets, sys_dictionary):');
    var smp = new GlideRecord('sys_update_version');
    smp.addEncodedQuery('nameSTARTSWITHsys_dictionary_^state=current^source_tableIN' + SOURCES.join(','));
    smp.orderByDesc('sys_recorded_at');
    smp.setLimit(8);
    smp.query();
    while (smp.next()) log('  ' + smp.getValue('name') + '  source=' + smp.getDisplayValue('source') + '  recorded=' + smp.getValue('sys_recorded_at'));
    gs.print(out.join('\n'));
})();
