/* Diagnostic: what the "customer-created" rule is counting (read-only).
 * Script scope: GLOBAL. Runs on any instance, with or without the app.
 *
 * The v0.3 rule  sys_package=global^ORsys_scope.scopeSTARTSWITHx_  counts
 * ~1,400 dictionary entries and ~1,800 ACLs on a fresh Australia PDI, so it
 * picks up out-of-box records (finding d21). This prints, for each table, who
 * created the rows the rule matches, in which scope/package, and in which year,
 * plus how a few candidate rules would count. Paste the whole output back.
 */
if (['rhino.global', 'global'].indexOf(String(typeof gs.getCurrentScopeName == 'function' ? gs.getCurrentScopeName() : 'rhino.global')) == -1) throw new Error('Run this diagnostic with the script scope set to global: it is read-only, but in an app scope it adds cross-scope privileges to that app.');
(function () {
    var RULE = 'sys_package=global^ORsys_scope.scopeSTARTSWITHx_';
    var TABLES = ['sys_dictionary', 'sys_security_acl', 'sys_db_object', 'sys_properties', 'sys_script_include', 'sys_app_module', 'sys_user_role'];
    var TOP = 12;
    var out = [];
    function log(m) { out.push(m); }

    function count(t, q) {
        var ga = new GlideAggregate(t);
        if (q) ga.addEncodedQuery(q);
        ga.addAggregate('COUNT');
        ga.query();
        return ga.next() ? parseInt(ga.getAggregate('COUNT'), 10) : 0;
    }

    function groups(t, q, field, display) {
        var ga = new GlideAggregate(t);
        if (!ga.isValidField(field.split('.')[0])) { log('    (' + field + ': field not found)'); return; }
        if (q) ga.addEncodedQuery(q);
        ga.addAggregate('COUNT');
        ga.groupBy(field);
        ga.query();
        var rows = [], n = 0;
        while (ga.next()) {
            var v = display ? ga.getDisplayValue(field) : ga.getValue(field);
            rows.push({ v: String(v || '(empty)'), c: parseInt(ga.getAggregate('COUNT'), 10) });
        }
        if (!rows.length) { log('    (the grouped query returned no rows on this table)'); return; }
        rows.sort(function (a, b) { return b.c - a.c; });
        for (var i = 0; i < rows.length && i < TOP; i++) log('    ' + rows[i].v + ' : ' + rows[i].c);
        if (rows.length > TOP) {
            for (var j = TOP; j < rows.length; j++) n += rows[j].c;
            log('    (' + (rows.length - TOP) + ' more values, ' + n + ' rows)');
        }
    }

    function years(t, q) {
        var ga = new GlideAggregate(t);
        if (q) ga.addEncodedQuery(q);
        ga.addAggregate('COUNT');
        try { ga.addTrend('sys_created_on', 'Year'); } catch (e) { log('    (addTrend not available)'); return; }
        ga.query();
        var line = [];
        while (ga.next()) line.push(String(ga.getValue('timeref') || '?') + '=' + ga.getAggregate('COUNT'));
        log('    ' + (line.length ? line.join('  ') : '(none)'));
    }

    log('=== Customer-created rule diagnostic: ' + gs.getProperty('instance_name') + ' (' + gs.getProperty('glide.buildname') + ') ===');
    log('Current rule: ' + RULE);
    for (var i = 0; i < TABLES.length; i++) {
        var t = TABLES[i];
        var gr = new GlideRecord(t);
        if (!gr.isValid()) { log('\n' + t + ': table not found'); continue; }
        var total = count(t, ''), matched = count(t, RULE);
        log('\n## ' + t + '  total ' + total + ', matched by rule ' + matched);
        log('  by sys_package:');      groups(t, RULE, 'sys_package', true);
        log('  by sys_scope:');        groups(t, RULE, 'sys_scope', true);
        log('  by sys_created_by:');   groups(t, RULE, 'sys_created_by', false);
        log('  by created year:');     years(t, RULE);
        log('  candidate rules:');
        log('    x_ scope only                                : ' + count(t, 'sys_scope.scopeSTARTSWITHx_'));
        log('    global package, created by admin            : ' + count(t, 'sys_package=global^sys_created_by=admin'));
        log('    global package, not created by system/maint : ' + count(t, 'sys_package=global^sys_created_byNOT INsystem,maint,glide.maint'));
    }
    log('\nNote: a customer update check (record has a row in sys_update_xml) is the most precise test but is');
    log('too slow to count per table here; if the breakdowns above don\'t separate cleanly, we can sample it.');
    gs.print(out.join('\n'));
})();
