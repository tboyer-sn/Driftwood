/**
 * Driftwood – schema builder (tables, columns, choices)
 * ---------------------------------------------------------------------------
 * Run in: System Definition > Scripts - Background
 *   - Script scope dropdown: global
 *   - Application picker (top banner): Driftwood  <-- records land in the app
 *
 * DRY_RUN = true  (default) prints what it WOULD do and changes nothing.
 * DRY_RUN = false creates what is missing. Safe to re-run: existing tables,
 *                 columns and choices are skipped (and type/length differences
 *                 reported). It never alters or deletes anything existing.
 *
 * Creates (when missing):
 *   5 roles (configuration_read, _read_secure, configuration_admin, admin,
 *     collector) and their containment
 *   x_2160899_driftw_0_cmdb_ci_sn_instance        extends cmdb_ci_appl_now_app
 *   x_2160899_driftw_0_cmdb_ci_sn_tracked_table   extends cmdb_ci, extensible
 *   x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin  extends tracked_table
 *   x_2160899_driftw_0_tracked_item               plain table (no parent)
 *   x_2160899_driftw_0_sn_cmdb_table_config       admin list for the tables category
 *   x_2160899_driftw_0_collection_run             one row per collection / import (v0.5)
 *   x_2160899_driftw_0_item_change                one row per item change (v0.5)
 *   x_2160899_driftw_0_tracked_object             one row per category + key across instances (v0.6)
 * and (v0.6) an Object reference on the observation tables and item_change.
 * Adds their columns and choices. On an instance where the app was built by
 * hand, existing roles/tables are simply skipped.
 *
 * Not done by this script (do by hand):
 *   - Composite indexes (D07): Tables > <table> > Database Indexes
 *   - ACLs (G01)
 * ES3-safe (global background scripts run at ES level 0).
 */
(function () {
    var DRY_RUN = true;
    // Script scope guard: in an app scope, every table and API this script
    // touches is added to that app's cross-scope privileges, even in a dry run.
    var curScope = String(typeof gs.getCurrentScopeName == 'function' ? gs.getCurrentScopeName() : 'rhino.global');
    if (curScope != 'rhino.global' && curScope != 'global') {
        gs.info('ABORT: set the script scope (Scripts - Background) to global and run again. Current script scope: ' + curScope + '. Nothing was read or written.');
        return;
    }
    var CREATE_ALL_SUBCLASSES = false; // true = also application/mid_server/property/clone_rule subclasses

    var SCOPE = 'x_2160899_driftw_0';
    var P = SCOPE + '_';
    var T_INSTANCE = P + 'cmdb_ci_sn_instance';
    var T_TRACKED = P + 'cmdb_ci_sn_tracked_table';
    var T_PLAIN = P + 'tracked_item';
    var T_TABLECFG = P + 'sn_cmdb_table_config';
    var T_RUN = P + 'collection_run';
    var T_CHANGE = P + 'item_change';
    var T_OBJECT = P + 'tracked_object';

    var CATEGORIES = [
        ['plugins', 'Plugins'], ['applications', 'Applications'], ['mid_servers', 'MID Servers'],
        ['system_properties', 'System Properties'], ['clone_preservers', 'Clone Preservers'],
        ['clone_exclusions', 'Clone Exclusions'], ['tables', 'Tables'], ['columns', 'Columns'],
        ['update_sets', 'Update Sets']
    ];

    /* ---- Definitions ----------------------------------------------------- */
    // col: [element, label, kind, maxLength, options]
    // kind: string | choice | boolean | integer | datetime | reference
    // options: { unique, def, ref, choices, display }
    var TRACKED_COLUMNS = [
        ['instance', 'Instance', 'reference', 32, { ref: T_INSTANCE }],
        ['item_category', 'Item category', 'choice', 40, { choices: CATEGORIES }],
        ['item_key', 'Item key', 'string', 255],
        ['item_value', 'Item value', 'string', 4000],
        ['item_version', 'Item version', 'string', 100],
        ['item_state', 'Item state', 'string', 100],
        ['value_hash', 'Value hash', 'string', 64],
        ['secure_value_hash', 'Secure value hash', 'string', 64],
        ['item_attributes', 'Item attributes', 'string', 4000],
        ['runtime', 'Runtime', 'string', 4000],
        ['source_sys_id', 'Source sys ID', 'string', 32],
        ['source_table', 'Source table', 'string', 80],
        ['source_url', 'Source record', 'url', 1024],
        ['object', 'Object', 'reference', 32, { ref: T_OBJECT }],
        ['is_secure', 'Is secure', 'boolean', 40, { def: 'false' }],
        ['present', 'Present', 'boolean', 40, { def: 'true' }],
        ['first_seen', 'First seen', 'datetime', 40],
        ['last_changed', 'Last changed', 'datetime', 40]
    ];

    // Roles (suffix, description) and containment (parent contains child)
    var ROLES = [
        ['configuration_read', 'Driftwood: read instance and tracked-item data'],
        ['configuration_read_secure', 'Driftwood: read secure value hashes'],
        ['configuration_admin', 'Driftwood: run collection, maintain configuration'],
        ['admin', 'Driftwood: application administrator'],
        ['collector', 'Driftwood: collector service account']
    ];
    var CONTAINS = [
        ['configuration_admin', 'configuration_read'],
        ['admin', 'configuration_admin'],
        ['admin', 'configuration_read_secure']
    ];

    var TABLES = [
        { name: T_INSTANCE, label: 'SN Instance', parent: 'cmdb_ci_appl_now_app', extensible: true,
          columns: [
            ['instance_name', 'Instance name', 'string', 100, { unique: true }],
            ['instance_id', 'Instance ID', 'string', 255],
            ['instance_url', 'Instance URL', 'string', 255],
            ['build_name', 'Build name', 'string', 255],
            ['build_tag', 'Build tag', 'string', 255],
            ['build_date', 'Build date', 'string', 255],
            ['war', 'WAR', 'string', 255],
            ['family', 'Family', 'string', 255],
            ['patch', 'Patch', 'string', 255],
            ['timezone', 'Timezone', 'string', 255],
            ['production_flag', 'Production flag', 'boolean', 40, { def: 'false' }],
            ['node_count', 'Node count', 'integer', 40],
            ['nodes', 'Nodes', 'string', 4000],
            ['last_collected', 'Last collected', 'datetime', 40],
            ['collection_status', 'Collection status', 'choice', 40, { choices: [
                ['running', 'Running'], ['completed', 'Completed'], ['completed_with_warnings', 'Completed with warnings']] }],
            ['collection_summary', 'Collection summary', 'string', 4000],
            ['retention_days', 'History retention (days)', 'integer', 40]
          ] },
        { name: T_TRACKED, label: 'SN Tracked Item (CI)', parent: 'cmdb_ci', extensible: true, columns: TRACKED_COLUMNS },
        { name: P + 'cmdb_ci_sn_tracked_plugin', label: 'SN Tracked Plugin', parent: T_TRACKED, extensible: true, columns: [] },
        { name: T_PLAIN, label: 'SN Tracked Item', parent: '', extensible: false,
          columns: [['name', 'Name', 'string', 255, { display: true }]].concat(TRACKED_COLUMNS) },
        // Admin list for the "tables" category: active = track this table,
        // inactive = never track it (overrides the curated list / auto-discovery)
        { name: T_TABLECFG, label: 'Tracked Table', parent: '', extensible: false,
          columns: [
            ['table_name', 'Table name', 'string', 80, { unique: true, display: true }],
            ['active', 'Active', 'boolean', 40, { def: 'true' }],
            ['description', 'Description', 'string', 255]
          ] },
        // History (v0.5): one row per collection/import, one row per item change
        { name: T_RUN, label: 'Collection Run', parent: '', extensible: false,
          columns: [
            ['run_id', 'Run ID', 'string', 100, { unique: true, display: true }],
            ['instance', 'Instance', 'reference', 32, { ref: T_INSTANCE }],
            ['source', 'Source', 'choice', 40, { choices: [['local', 'Local collection'], ['import', 'Imported snapshot']] }],
            ['mode', 'Mode', 'choice', 40, { choices: [['full', 'Full'], ['incremental', 'Incremental']] }],
            ['collected_at', 'Collected at', 'datetime', 40],
            ['persisted_at', 'Saved at', 'datetime', 40],
            ['collector_version', 'Collector version', 'string', 60],
            ['collector_scope', 'Collector scope', 'string', 60],
            ['duration_ms', 'Collection time (ms)', 'integer', 40],
            ['categories', 'Categories', 'string', 1000],
            ['baseline_categories', 'Baseline categories', 'string', 1000],
            ['totals', 'Totals', 'string', 1000],
            ['changes_logged', 'Changes logged', 'integer', 40],
            ['warnings_count', 'Warnings', 'integer', 40],
            ['warnings', 'Warning details', 'string', 4000],
            ['watermarks', 'Watermarks', 'string', 1000],
            ['snapshot_attached', 'Snapshot attached', 'boolean', 40, { def: 'false' }]
          ] },
        { name: T_CHANGE, label: 'Item Change', parent: '', extensible: false,
          columns: [
            ['run', 'Run', 'reference', 32, { ref: T_RUN }],
            ['instance', 'Instance', 'reference', 32, { ref: T_INSTANCE }],
            ['item_category', 'Item category', 'choice', 40, { choices: CATEGORIES }],
            ['item_key', 'Item key', 'string', 255],
            ['item_name', 'Item name', 'string', 255, { display: true }],
            ['change_type', 'Change', 'choice', 40, { choices: [['added', 'Added'], ['changed', 'Changed'], ['removed', 'No longer present'], ['restored', 'Restored']] }],
            ['changed_fields', 'Changed fields', 'string', 1000],
            ['old_data', 'Before', 'string', 4000],
            ['new_data', 'After', 'string', 4000],
            ['changed_on', 'Changed on', 'datetime', 40],
            ['source_url', 'Source record', 'url', 1024],
            ['object', 'Object', 'reference', 32, { ref: T_OBJECT }]
          ] },
        // v0.6: one logical object per category + key, observed on every instance.
        // object_key = '<category>|<key>' is unique, so a backfill or a race can
        // never create a second object for the same thing. Drift fields are
        // written by ConfigNowDrift (change-only); nothing else writes them.
        { name: T_OBJECT, label: 'Tracked Object', parent: '', extensible: false,
          columns: [
            ['name', 'Name', 'string', 255, { display: true }],
            ['object_key', 'Object key', 'string', 300, { unique: true }],
            ['item_category', 'Item category', 'choice', 40, { choices: CATEGORIES }],
            ['item_key', 'Item key', 'string', 255],
            ['parent_object', 'Parent object', 'reference', 32, { ref: T_OBJECT }],
            ['drift_status', 'Drift status', 'choice', 40, { choices: [
                ['same', 'Same everywhere'], ['differs', 'Differs'], ['missing', 'Missing somewhere'],
                ['single', 'Single instance'], ['not_compared', 'Not compared yet'], ['ignored', 'Expected difference']] }],
            ['drift_kinds', 'Drift kinds', 'string', 255],
            ['present_count', 'Present on', 'integer', 40],
            ['instance_count', 'Instances compared', 'integer', 40],
            ['differs_on', 'Differs on', 'string', 1000],
            ['missing_on', 'Missing on', 'string', 1000],
            ['differs_on_prod', 'Differs on Prod', 'boolean', 40, { def: 'false' }],
            ['baseline_instance', 'Baseline instance', 'reference', 32, { ref: T_INSTANCE }],
            ['last_compared', 'Last compared', 'datetime', 40],
            ['drift_changed', 'Drift status changed', 'datetime', 40],
            ['first_seen', 'First seen', 'datetime', 40]
          ] }
    ];
    if (CREATE_ALL_SUBCLASSES) {
        var subs = [['application', 'Application'], ['mid_server', 'MID Server'], ['property', 'Property'], ['clone_rule', 'Clone Rule']];
        for (var s = 0; s < subs.length; s++) {
            TABLES.push({ name: P + 'cmdb_ci_sn_tracked_' + subs[s][0], label: 'SN Tracked ' + subs[s][1], parent: T_TRACKED, extensible: true, columns: [] });
        }
    }

    // kind -> sys_dictionary internal_type. Keys are quoted: "boolean" is an
    // ES3 reserved word and a compile error as a bare key at ES level 0.
    var KIND = {
        'string': 'string', 'choice': 'string', 'boolean': 'boolean', 'integer': 'integer',
        'datetime': 'glide_date_time', 'reference': 'reference', 'url': 'url'
    };

    /* ---- Helpers --------------------------------------------------------- */
    var counts = { roles: 0, tables: 0, columns: 0, choices: 0, skipped: 0, warnings: 0 };
    var out = [];
    function log(m) { out.push(m); }
    function warn(m) { counts.warnings++; out.push('  !! ' + m); }

    function tableRec(name) {
        var t = new GlideRecord('sys_db_object');
        t.addQuery('name', name);
        t.setLimit(1);
        t.query();
        return t.next() ? t : null;
    }

    function dictRec(table, element) {
        var d = new GlideRecord('sys_dictionary');
        d.addQuery('name', table);
        d.addQuery('element', element);
        d.setLimit(1);
        d.query();
        return d.next() ? d : null;
    }

    function inheritedFrom(table, element) {
        // Walk up super_class looking for a dictionary entry for element
        var t = tableRec(table), guard = 0;
        while (t && !t.super_class.nil() && guard++ < 20) {
            t = t.super_class.getRefRecord();
            if (t && t.isValidRecord() && dictRec(t.getValue('name'), element)) return t.getValue('name');
        }
        return '';
    }

    function checkScope(rec, what) {
        if (DRY_RUN || !rec) return;
        if (rec.getValue('sys_scope') != appId) warn(what + ' was created outside the app (sys_scope=' + rec.getDisplayValue('sys_scope') + ')');
    }

    /* ---- Pre-flight ------------------------------------------------------ */
    var app = new GlideRecord('sys_scope');
    if (!app.get('scope', SCOPE)) { gs.info('ABORT: application scope ' + SCOPE + ' not found.'); return; }
    var appId = app.getUniqueValue();
    var current = gs.getCurrentApplicationId();
    log('=== Driftwood schema builder  (' + (DRY_RUN ? 'DRY RUN – nothing will change' : 'LIVE') + ') ===');
    log('App: ' + app.getValue('name') + ' [' + SCOPE + ']   Application picker: ' + (current == appId ? 'OK' : 'NOT Driftwood'));
    if (current != appId) {
        if (!DRY_RUN) { gs.info(out.join('\n') + '\nABORT: set the application picker to Driftwood, then re-run.'); return; }
        warn('Application picker is not Driftwood – a live run would abort.');
    }

    /* ---- Roles ----------------------------------------------------------- */
    function roleRec(fullName) {
        var r = new GlideRecord('sys_user_role');
        r.addQuery('name', fullName);
        r.setLimit(1);
        r.query();
        return r.next() ? r : null;
    }
    for (var ri = 0; ri < ROLES.length; ri++) {
        var full = SCOPE + '.' + ROLES[ri][0];
        if (roleRec(full)) { log('ROLE   ' + full + '  exists'); counts.skipped++; continue; }
        log('ROLE   ' + full + '  CREATE');
        counts.roles++;
        if (DRY_RUN) continue;
        var nr = new GlideRecord('sys_user_role');
        nr.initialize();
        if (nr.isValidField('suffix')) nr.setValue('suffix', ROLES[ri][0]);
        nr.setValue('name', full);
        nr.setValue('description', ROLES[ri][1]);
        var rid = nr.insert();
        if (!rid) { warn('Insert failed for role ' + full); counts.roles--; continue; }
        var chkRole = new GlideRecord('sys_user_role');
        if (chkRole.get(rid)) {
            if (chkRole.getValue('name') != full) warn('Role saved as "' + chkRole.getValue('name') + '" (expected ' + full + ')');
            checkScope(chkRole, 'Role ' + full);
        }
    }
    for (var ci = 0; ci < CONTAINS.length; ci++) {
        var pName = SCOPE + '.' + CONTAINS[ci][0], cName = SCOPE + '.' + CONTAINS[ci][1];
        var pr = roleRec(pName), cr = roleRec(cName);
        var label = 'ROLE   ' + pName + '  contains  ' + cName;
        if (pr && cr) {
            var link = new GlideRecord('sys_user_role_contains');
            link.addQuery('role', pr.getUniqueValue());
            link.addQuery('contains', cr.getUniqueValue());
            link.setLimit(1);
            link.query();
            if (link.next()) { log(label + '  exists'); counts.skipped++; continue; }
        }
        log(label + '  CREATE');
        counts.roles++;
        if (DRY_RUN) continue;
        if (!pr || !cr) { warn('Roles missing for containment ' + pName + ' > ' + cName); counts.roles--; continue; }
        var nl = new GlideRecord('sys_user_role_contains');
        nl.initialize();
        nl.setValue('role', pr.getUniqueValue());
        nl.setValue('contains', cr.getUniqueValue());
        if (!nl.insert()) { warn('Insert failed for containment ' + pName + ' > ' + cName); counts.roles--; }
    }

    /* ---- Tables ---------------------------------------------------------- */
    for (var i = 0; i < TABLES.length; i++) {
        var def = TABLES[i];
        var existing = tableRec(def.name);
        if (existing) {
            log('TABLE  ' + def.name + '  exists' + (existing.getValue('is_extendable') == '1' || existing.getValue('is_extendable') == 'true' ? ' (extensible)' : '') );
            if (def.extensible && !(existing.getValue('is_extendable') == '1' || existing.getValue('is_extendable') == 'true')) warn(def.name + ' should be Extensible');
            counts.skipped++;
            continue;
        }
        var parentId = '';
        if (def.parent) {
            var pr = tableRec(def.parent);
            if (!pr && !DRY_RUN) { warn('Parent ' + def.parent + ' not found – skipped ' + def.name); continue; }
            parentId = pr ? pr.getUniqueValue() : '(created earlier in this run)';
        }
        log('TABLE  ' + def.name + '  CREATE  label="' + def.label + '"  extends=' + (def.parent || '(none)') + '  extensible=' + def.extensible);
        if (!DRY_RUN) {
            var t = new GlideRecord('sys_db_object');
            t.initialize();
            t.setValue('name', def.name);
            t.setValue('label', def.label);
            if (parentId) t.setValue('super_class', parentId);
            t.setValue('is_extendable', def.extensible);
            if (t.isValidField('create_access_controls')) t.setValue('create_access_controls', false);
            if (t.isValidField('create_module')) t.setValue('create_module', false);
            if (t.isValidField('create_mobile_module')) t.setValue('create_mobile_module', false);
            // Accessible from: all application scopes, read only from other scopes
            if (t.isValidField('access')) t.setValue('access', 'public');
            if (t.isValidField('read_access')) t.setValue('read_access', true);
            if (t.isValidField('create_access')) t.setValue('create_access', false);
            if (t.isValidField('update_access')) t.setValue('update_access', false);
            if (t.isValidField('delete_access')) t.setValue('delete_access', false);
            var tid = t.insert();
            if (!tid) { warn('Insert failed for table ' + def.name); continue; }
            checkScope(tableRec(def.name), 'Table ' + def.name);
        }
        counts.tables++;
    }

    /* ---- Columns & choices ---------------------------------------------- */
    for (var j = 0; j < TABLES.length; j++) {
        var td = TABLES[j];
        var tableExists = !!tableRec(td.name);
        for (var c = 0; c < td.columns.length; c++) {
            var col = td.columns[c];
            var el = col[0], label = col[1], kind = col[2], len = col[3], opt = col[4] || {};
            var itype = KIND[kind];
            var d = tableExists ? dictRec(td.name, el) : null;
            var inh = tableExists && !d ? inheritedFrom(td.name, el) : '';
            if (inh) { warn(td.name + '.' + el + ' is inherited from ' + inh + ' – not created'); counts.skipped++; continue; }
            if (d) {
                var diff = [];
                if (d.getValue('internal_type') != itype) diff.push('type ' + d.getValue('internal_type') + ' (want ' + itype + ')');
                if ((kind == 'string' || kind == 'choice' || kind == 'url') && parseInt(d.getValue('max_length'), 10) < len) diff.push('length ' + d.getValue('max_length') + ' (want ' + len + ')');
                if (diff.length) warn(td.name + '.' + el + ' exists but differs: ' + diff.join(', '));
                counts.skipped++;
            } else {
                log('COLUMN ' + td.name + '.' + el + '  CREATE  ' + itype + (kind == 'choice' ? ' (choice)' : '') +
                    ((kind == 'string' || kind == 'choice' || kind == 'url') ? ' len ' + len : '') + (opt.ref ? ' -> ' + opt.ref : '') +
                    (opt.unique ? ' UNIQUE' : '') + (opt.def ? ' default=' + opt.def : '') + (opt.display ? ' DISPLAY' : ''));
                if (!DRY_RUN) {
                    if (!tableExists) { warn('Table ' + td.name + ' not ready – re-run to add its columns'); break; }
                    var nd = new GlideRecord('sys_dictionary');
                    nd.initialize();
                    nd.setValue('name', td.name);
                    nd.setValue('element', el);
                    nd.setValue('column_label', label);
                    nd.setValue('internal_type', itype);
                    if (kind == 'string' || kind == 'choice' || kind == 'url') nd.setValue('max_length', len);
                    if (kind == 'reference') nd.setValue('reference', opt.ref);
                    if (kind == 'choice') nd.setValue('choice', 1); // dropdown with --None--
                    if (opt.def) nd.setValue('default_value', opt.def);
                    if (opt.unique) nd.setValue('unique', true);
                    if (opt.display) nd.setValue('display', true);
                    nd.setValue('active', true);
                    if (!nd.insert()) { warn('Insert failed for ' + td.name + '.' + el); continue; }
                    checkScope(dictRec(td.name, el), 'Column ' + td.name + '.' + el);
                }
                counts.columns++;
            }
            if (kind == 'choice') {
                for (var k = 0; k < opt.choices.length; k++) {
                    var ch = new GlideRecord('sys_choice');
                    ch.addQuery('name', td.name);
                    ch.addQuery('element', el);
                    ch.addQuery('value', opt.choices[k][0]);
                    ch.setLimit(1);
                    ch.query();
                    if (ch.next()) continue;
                    if (!DRY_RUN) {
                        ch.initialize();
                        ch.setValue('name', td.name);
                        ch.setValue('element', el);
                        ch.setValue('value', opt.choices[k][0]);
                        ch.setValue('label', opt.choices[k][1]);
                        ch.setValue('sequence', (k + 1) * 10);
                        ch.setValue('language', 'en');
                        ch.setValue('inactive', false);
                        ch.insert();
                    }
                    counts.choices++;
                }
            }
        }
    }

    /* ---- Verify (live runs) ---------------------------------------------- */
    if (!DRY_RUN) {
        log('--- Verification ---');
        for (var v = 0; v < TABLES.length; v++) {
            var vt = TABLES[v];
            var g = new GlideRecord(vt.name);
            if (!g.isValid()) { warn('VERIFY ' + vt.name + ' is not queryable yet – re-run in a minute'); continue; }
            var missing = [];
            for (var m = 0; m < vt.columns.length; m++) if (!g.isValidField(vt.columns[m][0])) missing.push(vt.columns[m][0]);
            if (missing.length) warn('VERIFY ' + vt.name + ' missing: ' + missing.join(', '));
            else log('VERIFY ' + vt.name + '  OK (' + vt.columns.length + ' columns checked)');
            var acl = new GlideAggregate('sys_security_acl');
            acl.addQuery('name', 'STARTSWITH', vt.name);
            acl.addAggregate('COUNT');
            acl.query();
            if (acl.next() && parseInt(acl.getAggregate('COUNT'), 10) > 0) log('       note: ' + acl.getAggregate('COUNT') + ' ACL(s) exist on ' + vt.name);
        }
    }

    log('--- Summary ---');
    log((DRY_RUN ? 'Would create: ' : 'Created: ') + counts.roles + ' role record(s), ' + counts.tables + ' table(s), ' + counts.columns + ' column(s), ' + counts.choices + ' choice(s).  Skipped (already there): ' + counts.skipped + '.  Warnings: ' + counts.warnings);
    if (DRY_RUN) log('Set DRY_RUN = false and run again to apply.');
    log('Manual next: D07 composite indexes on (instance, item_category, item_key) for ' + T_TRACKED + ' and ' + T_PLAIN + ', and an index on ' + T_OBJECT + ' (item_category, drift_status).');
    gs.info(out.join('\n'));
})();
