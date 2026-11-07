/**
 * Script Include: ConfigNowCollector
 * Scope:          x_2160899_driftw_0  (Driftwood)
 * Accessible from: This application scope only
 *
 * Reads the CURRENT instance's configuration and returns a plain JSON
 * snapshot. It writes nothing – persistence is ConfigNowWriter's job – so the
 * same code backs the background dry run, the REST API and the scheduled job.
 *
 * Usage:
 *   var snap = new ConfigNowCollector().collect();
 *   var snap = new ConfigNowCollector({ categories: ['plugins'] }).collect();
 *
 * Every source table and field is resolved defensively (isValid /
 * isValidField) so a missing table or renamed field becomes a warning in the
 * snapshot instead of an exception. That makes the warnings list itself a
 * feasibility report for each instance/release.
 */
var ConfigNowCollector = Class.create();
ConfigNowCollector.prototype = {

    initialize: function (options) {
        this.options = options || {};
        this.config = this.options.config || ConfigNowConfig.get();
        if (this.options.categories) this.config.categories = this.options.categories;
        // incremental: true lets incremental categories (update_sets) read only
        // what changed since the last saved run. Writer-driven paths (job,
        // Collect now) pass it; live reads and the exporter collect everything.
        this.incremental = !!this.options.incremental;
        this.warnings = [];
        this._catMeta = {};
    },

    /* ------------------------------------------------------------------ */
    /* Public                                                              */
    /* ------------------------------------------------------------------ */

    collect: function () {
        var t0 = new Date().getTime();
        var snapshot = {
            schema: 'driftwood.snapshot/0.1',
            collector_version: ConfigNowConfig.COLLECTOR_VERSION,
            collector_scope: ConfigNowConfig.SCOPE, // lets comparisons ignore the app's own record
            collected_at: String(new GlideDateTime().getValue()), // String(): global scope returns a Java string // UTC
            instance: this._safe('instance', this.collectInstance, {}),
            categories: {},
            warnings: this.warnings
        };

        var cats = this.config.categories;
        for (var i = 0; i < cats.length; i++) {
            var cat = cats[i];
            var fn = this.COLLECTORS[cat];
            if (!fn) {
                this._warn(cat, 'Unknown category – skipped');
                continue;
            }
            this._collectedAt = snapshot.collected_at;
            var items = this._safe(cat, this[fn], []);
            for (var s = 0; s < items.length; s++) {
                if (!items[s].source_table) items[s].source_table = this._sourceTable(cat, items[s]);
            }
            snapshot.categories[cat] = { count: items.length, items: items };
            var meta = this._catMeta[cat];
            if (meta) for (var mk in meta) snapshot.categories[cat][mk] = meta[mk];
        }
        snapshot.duration_ms = new Date().getTime() - t0;
        return snapshot;
    },

    COLLECTORS: {
        plugins: 'collectPlugins',
        applications: 'collectApplications',
        mid_servers: 'collectMidServers',
        system_properties: 'collectSystemProperties',
        clone_preservers: 'collectClonePreservers',
        clone_exclusions: 'collectCloneExclusions',
        tables: 'collectTables',
        columns: 'collectColumns',
        update_sets: 'collectUpdateSets'
    },

    /** Table holding each item's source record (for links and sys_id drift). */
    SOURCE_TABLES: {
        plugins: 'sys_plugins', mid_servers: 'ecc_agent', system_properties: 'sys_properties',
        clone_preservers: 'clone_data_preserver', clone_exclusions: 'clone_data_exclude',
        tables: 'sys_db_object', columns: 'sys_dictionary'
    },

    _sourceTable: function (cat, item) {
        if (!item.source_sys_id) return '';
        if (cat == 'applications') return item.attributes && item.attributes.source == 'custom' ? 'sys_app' : 'sys_store_app';
        return this.SOURCE_TABLES[cat] || '';
    },

    /* ------------------------------------------------------------------ */
    /* Instance basics                                                     */
    /* ------------------------------------------------------------------ */

    collectInstance: function () {
        var war = this._prop('glide.war');
        var inst = {
            instance_name: this._prop('instance_name'),
            instance_id: this._prop('instance_id'),
            instance_url: this._prop('glide.servlet.uri'),
            build_name: this._prop('glide.buildname'),
            build_tag: this._prop('glide.buildtag'),
            build_date: this._prop('glide.builddate'),
            war: war,
            family: this._parseFamily(war),
            patch: this._parsePatch(war),
            // NB: glide.installation.production is 'true' even on PDIs, so it
            // is reported for information only. Use "environment" instead.
            production_flag: this._prop('glide.installation.production') == 'true',
            environment: this._environment(),
            timezone: this._prop('glide.sys.default.tz') || 'not set (platform default)',
            nodes: []
        };

        var nodes = this._rows('sys_cluster_state', {
            fields: {
                system_id: ['system_id'],
                status: ['status'],
                node_type: ['node_type'],
                schedulers: ['schedulers'],
                ready_to_failover: ['ready_to_failover']
            },
            optional: { node_type: true, schedulers: true, ready_to_failover: true },
            orderBy: 'system_id',
            label: 'instance.nodes'
        });
        for (var i = 0; i < nodes.length; i++) {
            delete nodes[i].sys_id;
            inst.nodes.push(nodes[i]);
        }
        inst.node_count = inst.nodes.length;
        return inst;
    },

    /* ------------------------------------------------------------------ */
    /* Categories                                                          */
    /* ------------------------------------------------------------------ */

    collectPlugins: function () {
        var rows = this._rows('sys_plugins', {
            fields: {
                id: ['source', 'id'],
                name: ['name'],
                version: ['version'],
                active: ['active']
            },
            // No value filter: "active" is a string choice in older releases
            // ('active'/'inactive') and a boolean from Brazil ('1'/'0').
            // Normalised below. Do NOT use v_plugin – it rebuilds a large
            // cache on query (~17 s observed on a Brazil PDI).
            orderBy: 'source',
            label: 'plugins'
        });
        var items = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (!r.id) continue;
            var state = this._activeState(r.active);
            if (state != 'active' && !this.config.includeInactivePlugins) continue;
            items.push(this._item('plugins', r.id, r.name, '', r.version, state, {}, null, r.sys_id));
        }
        return items;
    },

    collectApplications: function () {
        var items = [];
        var sources = [
            { table: 'sys_store_app', source: 'store', filters: { active: 'true' } },
            { table: 'sys_app', source: 'custom', filters: null }
        ];
        for (var s = 0; s < sources.length; s++) {
            var src = sources[s];
            var rows = this._rows(src.table, {
                fields: {
                    scope: ['scope'],
                    name: ['name'],
                    version: ['version'],
                    active: ['active'],
                    vendor: ['vendor'],
                    vendor_prefix: ['vendor_prefix']
                },
                optional: { vendor: true, vendor_prefix: true },
                filters: src.filters,
                orderBy: 'scope',
                label: 'applications.' + src.source
            });
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                if (!r.scope) continue;
                var state = this._activeState(r.active);
                items.push(this._item('applications', r.scope, r.name, '', r.version, state,
                    { source: src.source },
                    // vendor is unreliable across releases ('' vs 'ServiceNow' for the
                    // same app), so it is reported but not hashed
                    { vendor: r.vendor || r.vendor_prefix || '' }, r.sys_id));
            }
        }
        return items;
    },

    collectMidServers: function () {
        var rows = this._rows('ecc_agent', {
            fields: {
                name: ['name'],
                version: ['version'],
                status: ['status'],
                validated: ['validated'],
                host_name: ['host_name'],
                ip_address: ['ip_address'],
                last_refreshed: ['last_refreshed']
            },
            optional: { validated: true, host_name: true, ip_address: true, last_refreshed: true },
            orderBy: 'name',
            label: 'mid_servers'
        });
        var items = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (!r.name) continue;
            // status/last_refreshed are operational, not configuration: kept in
            // "runtime" so they never trigger drift.
            items.push(this._item('mid_servers', r.name, r.name, '', r.version, r.validated == 'true' ? 'validated' : (r.validated || ''),
                { host_name: r.host_name, ip_address: r.ip_address },
                { status: r.status, last_refreshed: r.last_refreshed }, r.sys_id));
        }
        return items;
    },

    collectSystemProperties: function () {
        var names = this.config.trackedProperties || [];
        var prefixes = this.config.trackedPropertyPrefixes || [];
        if (!names.length && !prefixes.length) return [];

        var q = [];
        if (names.length) q.push('nameIN' + names.join(','));
        for (var p = 0; p < prefixes.length; p++) q.push('nameSTARTSWITH' + prefixes[p]);

        var rows = this._rows('sys_properties', {
            fields: {
                name: ['name'],
                value: ['value'],
                type: ['type'],
                is_private: ['is_private'],
                scope: ['sys_scope']
            },
            display: { scope: true },
            encodedQuery: q.join('^OR'),
            orderBy: 'name',
            label: 'system_properties'
        });

        var items = [];
        var seen = {};
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            seen[r.name] = true;
            var secure = (r.type == 'password' || r.type == 'password2');
            var value = r.value;
            var hashOverride = null;
            if (secure) {
                hashOverride = this.config.secureValueMode == 'hash'
                    ? this._hash(this.config.secureHashSalt + '|' + value) : '';
                value = '********';
            }
            var item = this._item('system_properties', r.name, r.name, value, '', secure ? 'secure' : 'set',
                { type: r.type, is_private: r.is_private == 'true', scope: r.scope }, null, r.sys_id);
            if (secure) {
                item.secure = true;
                item.secure_value_hash = hashOverride;
                item.hash = this._hash(item.hash + '|' + hashOverride);
            }
            items.push(item);
        }
        for (var n = 0; n < names.length; n++) {
            if (!seen[names[n]]) {
                items.push(this._item('system_properties', names[n], names[n], '', '', 'not_set', {}, null, ''));
            }
        }
        return items;
    },

    collectClonePreservers: function () {
        var rows = this._rows('clone_data_preserver', {
            fields: {
                name: ['name'],
                table: ['table', 'table_name'],
                condition: ['condition'],
                active: ['active']
            },
            optional: { condition: true, active: true },
            orderBy: 'name',
            label: 'clone_preservers'
        });
        var items = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var key = 'preserver:' + (r.name || r.table);
            items.push(this._item('clone_preservers', key, r.name, r.condition, '',
                r.active == 'false' ? 'inactive' : 'active',
                { rule_type: 'preserver', table: r.table }, null, r.sys_id));
        }
        return items;
    },

    collectCloneExclusions: function () {
        var rows = this._rows('clone_data_exclude', {
            fields: {
                table: ['table', 'table_name', 'name'],
                active: ['active']
            },
            optional: { active: true },
            orderBy: null,
            label: 'clone_exclusions'
        });
        var items = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (!r.table) continue;
            items.push(this._item('clone_exclusions', 'exclude:' + r.table, r.table, '', '',
                r.active == 'false' ? 'inactive' : 'active',
                { rule_type: 'exclusion', table: r.table }, null, r.sys_id));
        }
        return items;
    },

    /**
     * Table configuration drift: one item per tracked table with
     *   attributes.total        – row count (includes rows of extending tables)
     *   attributes.customer_scoped – rows in an x_ app scope other than this
     *                             app's (exact; metadata tables only, else null)
     *   attributes.customer_global – Global-package rows not created by platform
     *                             or ServiceNow accounts (estimate; same rule)
     *   attributes.customer_updates – rows whose current version came from a
     *                             customer update set (only if customerHistory)
     *   attributes.column_count / parent / fingerprint – schema of the table's
     *                             own columns (name:type:length, sorted)
     *   attributes.<definition> – the sys_db_object settings (scope, package,
     *                             extensible, application access, ...), v0.4+
     *   attributes.clone_exclusion_rules / clone_preserver_rules – active clone
     *                             rules naming this table, v0.4+
     *   runtime.columns         – the column list itself (for drill-in, not hashed)
     * A tracked table that doesn't exist here is reported with state 'absent'.
     */
    collectTables: function () {
        var list = this._trackedTables();
        var clone = this._cloneRules();
        var items = [];
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            var gr = new GlideRecord(t.name);
            if (!gr.isValid()) {
                items.push(this._item('tables', t.name, t.name, '', '', 'absent', { source: t.source }, {}, ''));
                continue;
            }
            try {
                var total = this._count(t.name, '');
                var cust = this._customerCounts(t.name, gr);
                var schema = this._schema(t.name);
                var colStr = schema.columns.join(',');
                var attrs = {
                    source: t.source,
                    total: total,
                    customer_scoped: cust.scoped,
                    customer_global: cust.global_est,
                    column_count: schema.columns.length,
                    parent: schema.parent,
                    fingerprint: this._hash(schema.parent + '|' + colStr).substring(0, 16),
                    clone_exclusion_rules: clone.exclusions[t.name] || 0,
                    clone_preserver_rules: clone.preservers[t.name] || 0
                };
                if (this.config.customerHistory) attrs.customer_updates = cust.updates;
                for (var d in schema.definition) attrs[d] = schema.definition[d];
                var rt = { columns: colStr.length > 3900 ? colStr.substring(0, 3900) : colStr };
                if (colStr.length > 3900) rt.columns_truncated = true;
                items.push(this._item('tables', t.name, schema.label || t.name, '', '', 'present', attrs, rt, schema.sys_id));
            } catch (e) {
                this._warn('tables', t.name + ': ' + (e && e.message ? e.message : e));
            }
        }
        return items;
    },

    /**
     * Column definitions: one item per sys_dictionary entry of each tracked
     * table (the table's own columns; inherited ones belong to the parent).
     * key = <table>.<column>; the label is the item name (not compared, since
     * labels are translated); the definition is in attributes.
     */
    collectColumns: function () {
        var list = this._trackedTables();
        var items = [];
        for (var i = 0; i < list.length; i++) {
            var t = list[i];
            if (!new GlideRecord(t.name).isValid()) continue;
            try {
                var schema = this._schema(t.name);
                for (var c = 0; c < schema.dictionary.length; c++) {
                    var col = schema.dictionary[c];
                    items.push(this._item('columns', t.name + '.' + col.element, col.label || col.element, '', '',
                        col.attributes.active === false ? 'inactive' : 'present', col.attributes, {}, col.sys_id));
                }
            } catch (e) {
                this._warn('columns', t.name + ': ' + (e && e.message ? e.message : e));
            }
        }
        return items;
    },

    /**
     * Customer counts for a metadata table (one with sys_package and sys_scope);
     * all null for data tables. scoped is exact; global_est is a heuristic.
     */
    _customerCounts: function (table, gr) {
        var res = { scoped: null, global_est: null, updates: null };
        if (!(gr.isValidField('sys_package') && gr.isValidField('sys_scope'))) return res;
        res.scoped = this._count(table, this.config.customerScopedQuery + '^sys_scope.scope!=' + ConfigNowConfig.SCOPE);
        res.global_est = this._count(table, this.config.customerGlobalQuery);
        if (this.config.customerHistory) res.updates = this._historyCount(table);
        return res;
    },

    /**
     * Option 2: records of `table` whose CURRENT version came from a customer
     * update set. Update names are "<table>_<id or key>", so names of longer
     * tables sharing the prefix (sys_script_include_... for sys_script) are
     * excluded explicitly. Returns null if sys_update_version isn't readable.
     */
    _historyCount: function (table) {
        if (!new GlideRecord('sys_update_version').isValid()) return null;
        var q = 'nameSTARTSWITH' + table + '_^state=current^source_tableIN' + this.config.customerHistorySources.join(',');
        var sib = this._prefixSiblings(table);
        for (var i = 0; i < sib.length; i++) q += '^nameNOT LIKE' + sib[i] + '_';
        return this._count('sys_update_version', q);
    },

    /** Other tables whose name starts with "<table>_" (their update names share the prefix). */
    _prefixSiblings: function (table) {
        var out = [];
        var db = new GlideRecord('sys_db_object');
        db.addQuery('name', 'STARTSWITH', table + '_');
        db.query();
        while (db.next()) out.push(String(db.getValue('name')));
        return out;
    },

    /* ------------------------------------------------------------------ */
    /* Update sets (v0.5)                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * One item per ORIGINATING update set:
     *   key 'origin:<sys_id of the set where it was built>' – the same on the
     *       instance that built it (local set) and on every instance it was
     *       retrieved into (remote set's origin_sys_id), so promotion lines up;
     *   key 'default:<scope>' for each application's Default set.
     * A local set created by committing a retrieved set is folded into that
     * retrieved set's item (local_state + local update_count).
     * item.state = local state when there is a local set, else the retrieved
     * set's state (loaded / previewed / ...), so "complete on Dev, previewed on
     * Test" shows as a difference and "complete / committed" does not.
     */
    collectUpdateSets: function () {
        var L = 'sys_update_set', RM = 'sys_remote_update_set';
        if (!new GlideRecord(L).isValid()) { this._warn('update_sets', 'sys_update_set not readable from this scope'); return []; }
        var hasRemote = new GlideRecord(RM).isValid();
        var plan = this._updateSetPlan();
        this._catMeta.update_sets = {
            incremental: !plan.full,
            watermark: { since: this._collectedAt, full: plan.full ? this._collectedAt : plan.lastFull }
        };

        var locals = {}, remotes = {}, id;
        var addAll = function (map, rows) { for (var i = 0; i < rows.length; i++) map[rows[i].sys_id] = rows[i]; };
        if (plan.full) {
            addAll(locals, this._usRows(L, null));
            if (hasRemote) addAll(remotes, this._usRows(RM, null));
        } else {
            addAll(locals, this._usRows(L, { since: plan.since }));
            addAll(locals, this._usRows(L, { open: true }));
            if (hasRemote) addAll(remotes, this._usRows(RM, { since: plan.since }));
            // counterparts: retrieved sets whose committed copy changed, and copies of changed retrieved sets
            if (hasRemote) {
                var lids = []; for (id in locals) lids.push(id);
                addAll(remotes, this._usRows(RM, { field: 'update_set', ids: lids }));
            }
            var need = [];
            for (id in remotes) if (remotes[id].update_set && !locals[remotes[id].update_set]) need.push(remotes[id].update_set);
            addAll(locals, this._usRows(L, { field: 'sys_id', ids: need }));
        }

        var localIds = [], remoteIds = [];
        for (id in locals) localIds.push(id);
        for (id in remotes) remoteIds.push(id);
        var lCount = this._groupCount('sys_update_xml', 'update_set', plan.full ? null : localIds);
        var rCount = hasRemote ? this._groupCount('sys_update_xml', 'remote_update_set', plan.full ? null : remoteIds) : {};
        var problems = hasRemote ? this._previewProblems(plan.full ? null : remoteIds) : {};

        var items = [], consumed = {}, r, l;
        for (id in remotes) {
            r = remotes[id];
            l = r.update_set ? locals[r.update_set] : null;
            if (l) consumed[l.sys_id] = true;
            items.push(this._usItem(l, r, lCount, rCount, problems));
        }
        for (id in locals) if (!consumed[id]) items.push(this._usItem(locals[id], null, lCount, rCount, problems));
        items.sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
        return items;
    },

    _usItem: function (l, r, lCount, rCount, problems) {
        var attrs = {}, rt = {}, key;
        var base = l || r;
        attrs.application = base.application || '';
        if (l) {
            attrs.local_state = l.state;
            attrs.update_count = lCount[l.sys_id] || 0;
            if (l.is_default !== undefined) attrs.is_default = l.is_default;
            if (l.parent !== undefined) attrs.parent = l.parent;
            if (l.base_update_set !== undefined) attrs.base_update_set = l.base_update_set;
            rt.local_sys_id = l.sys_id; rt.created_by = l.sys_created_by; rt.created_on = l.sys_created_on; rt.updated_on = l.sys_updated_on;
            if (l.release_date) rt.release_date = l.release_date;
        }
        if (r) {
            attrs.remote_state = r.state;
            attrs.remote_update_count = rCount[r.sys_id] || 0;
            var p = problems[r.sys_id] || { errors: 0, warnings: 0, unresolved: 0 };
            attrs.preview_errors = p.errors; attrs.preview_warnings = p.warnings; attrs.preview_unresolved = p.unresolved;
            if (!l && r.parent !== undefined) attrs.parent = r.parent;
            rt.remote_sys_id = r.sys_id; rt.retrieved_on = r.sys_created_on;
            if (r.commit_date) rt.committed_on = r.commit_date;
            if (r.remote_sys_id) rt.remote_source_sys_id = r.remote_sys_id;
        }
        rt.origin = l && !r ? 'built here' : 'retrieved';
        if (l && !r && (l.is_default === true)) key = 'default:' + (l.application || 'global');
        else key = 'origin:' + ((r && r.origin_sys_id) || (l && l.origin_sys_id) || (r ? r.sys_id : l.sys_id));
        var state = l ? l.state : r.state;
        var item = this._item('update_sets', key, base.name, '', '', state, attrs, rt, base.sys_id);
        item.source_table = l ? 'sys_update_set' : 'sys_remote_update_set';
        return item;
    },

    /* field spec for sys_update_set / sys_remote_update_set: [out, field, kind] */
    US_FIELDS: [
        ['name', 'name', 'str'], ['state', 'state', 'str'], ['application', 'application', 'scope'],
        ['application_name', 'application_name', 'str'], ['is_default', 'is_default', 'bool'],
        ['parent', 'parent', 'refname'], ['base_update_set', 'base_update_set', 'refname'],
        ['origin_sys_id', 'origin_sys_id', 'str'], ['remote_sys_id', 'remote_sys_id', 'str'],
        ['update_set', 'update_set', 'str'], ['commit_date', 'commit_date', 'str'], ['release_date', 'release_date', 'str'],
        ['sys_created_by', 'sys_created_by', 'str'], ['sys_created_on', 'sys_created_on', 'str'], ['sys_updated_on', 'sys_updated_on', 'str']
    ],

    /**
     * Reads update set rows. sel: null = all; {since} = updated since;
     * {open: true} = local sets in progress; {field, ids} = these records.
     */
    _usRows: function (table, sel) {
        var rows = [];
        if (sel && sel.ids) {
            for (var c = 0; c < sel.ids.length; c += 100) {
                var chunk = sel.ids.slice(c, c + 100);
                if (!chunk.length) continue;
                rows = rows.concat(this._usQuery(table, function (gr) { gr.addQuery(sel.field, 'IN', chunk.join(',')); }));
            }
            return rows;
        }
        return this._usQuery(table, function (gr) {
            if (sel && sel.since) gr.addQuery('sys_updated_on', '>=', sel.since);
            if (sel && sel.open) gr.addQuery('state', 'in progress');
        });
    },

    _usQuery: function (table, filter) {
        var gr = new GlideRecord(table);
        filter(gr);
        gr.setLimit(this.config.maxUpdateSets + 1);
        gr.query();
        var rows = [], n = 0, spec = this.US_FIELDS;
        while (gr.next()) {
            if (++n > this.config.maxUpdateSets) { this._warn('update_sets', table + ': more than ' + this.config.maxUpdateSets + ' rows – the rest were skipped'); break; }
            var row = { sys_id: gr.getUniqueValue() };
            for (var i = 0; i < spec.length; i++) {
                var f = spec[i][1];
                if (!gr.isValidField(f)) continue;
                var v = gr.getValue(f);
                v = v == null ? '' : String(v);
                if (spec[i][2] == 'bool') row[spec[i][0]] = (v == '1' || v == 'true');
                else if (spec[i][2] == 'scope') row[spec[i][0]] = v ? this._refField('sys_scope', v, 'scope') : '';
                else if (spec[i][2] == 'refname') row[spec[i][0]] = v ? this._refField(table, v, 'name') : '';
                else row[spec[i][0]] = v;
            }
            if (!row.application && row.application_name) row.application = row.application_name;
            delete row.application_name;
            rows.push(row);
        }
        return rows;
    },

    /** COUNT grouped by `field` (optionally only for these ids): { id: count }. */
    _groupCount: function (table, field, ids) {
        var out = {};
        if (!new GlideRecord(table).isValid()) return out;
        var run = function (chunk) {
            var ga = new GlideAggregate(table);
            if (!ga.isValidField(field)) return;
            if (chunk) ga.addQuery(field, 'IN', chunk.join(','));
            else ga.addQuery(field, '!=', '');
            ga.addAggregate('COUNT');
            ga.groupBy(field);
            ga.query();
            while (ga.next()) out[String(ga.getValue(field))] = parseInt(ga.getAggregate('COUNT'), 10);
        };
        if (!ids) { run(null); return out; }
        for (var c = 0; c < ids.length; c += 100) if (ids.slice(c, c + 100).length) run(ids.slice(c, c + 100));
        return out;
    },

    /** Preview problems per retrieved set: { id: {errors, warnings, unresolved} }. */
    _previewProblems: function (ids) {
        var out = {}, T = 'sys_update_preview_problem';
        var gr = new GlideRecord(T);
        if (!gr.isValid() || !gr.isValidField('remote_update_set')) return out;
        var hasType = gr.isValidField('type'), hasStatus = gr.isValidField('status');
        var run = function (chunk) {
            var ga = new GlideAggregate(T);
            if (chunk) ga.addQuery('remote_update_set', 'IN', chunk.join(','));
            else ga.addQuery('remote_update_set', '!=', '');
            ga.addAggregate('COUNT');
            ga.groupBy('remote_update_set');
            if (hasType) ga.groupBy('type');
            if (hasStatus) ga.groupBy('status');
            ga.query();
            while (ga.next()) {
                var id = String(ga.getValue('remote_update_set')), n = parseInt(ga.getAggregate('COUNT'), 10);
                var o = out[id] || (out[id] = { errors: 0, warnings: 0, unresolved: 0 });
                var type = hasType ? String(ga.getValue('type') || '') : 'error';
                if (type == 'error') o.errors += n; else o.warnings += n;
                if (!hasStatus || !ga.getValue('status')) o.unresolved += n;
            }
        };
        if (!ids) { run(null); return out; }
        for (var c = 0; c < ids.length; c += 100) if (ids.slice(c, c + 100).length) run(ids.slice(c, c + 100));
        return out;
    },

    /**
     * Full or incremental? Incremental only when asked (this.incremental), a
     * previous local run of this instance recorded an update_sets watermark,
     * and its last full sweep is younger than updateSetsFullDays.
     */
    _updateSetPlan: function () {
        var plan = { full: true, since: '', lastFull: '' };
        if (!this.incremental) return plan;
        var T = this.config.tables;
        if (!T.run || !new GlideRecord(T.run).isValid()) return plan;
        var inst = new GlideRecord(T.instance);
        if (!inst.isValid()) return plan;
        inst.addQuery('instance_name', this._prop('instance_name'));
        inst.setLimit(1);
        inst.query();
        if (!inst.next()) return plan;
        var run = new GlideRecord(T.run);
        run.addQuery('instance', inst.getUniqueValue());
        run.addQuery('source', 'local');
        run.orderByDesc('collected_at');
        run.setLimit(10);
        run.query();
        while (run.next()) {
            var wm = null;
            try { wm = JSON.parse(run.getValue('watermarks') || '{}').update_sets; } catch (e) { wm = null; }
            if (!wm || !wm.since || !wm.full) continue;
            var age = (this._toMs(this._collectedAt) - this._toMs(wm.full)) / 86400000;
            if (!(age < this.config.updateSetsFullDays)) return plan; // time for a full sweep
            plan.full = false;
            plan.since = this._shiftTime(wm.since, -this.config.updateSetsOverlapMinutes);
            plan.lastFull = wm.full;
            return plan;
        }
        return plan;
    },

    /** 'YYYY-MM-DD HH:MM:SS' (UTC) <-> epoch ms, without GlideDateTime. */
    _toMs: function (ts) {
        var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(ts || ''));
        return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN;
    },

    _shiftTime: function (ts, minutes) {
        var ms = this._toMs(ts);
        if (isNaN(ms)) return ts;
        var d = new Date(ms + minutes * 60000);
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' +
            p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
    },

    /** Tracked table list, computed once per collection (tables + columns share it). */
    _trackedTables: function () {
        if (!this._tableListCache) this._tableListCache = this._tableList();
        return this._tableListCache;
    },

    /** Active clone exclusion / preserver rules per table name. */
    _cloneRules: function () {
        var res = { exclusions: {}, preservers: {} };
        var specs = [['clone_data_exclude', 'exclusions'], ['clone_data_preserver', 'preservers']];
        for (var s = 0; s < specs.length; s++) {
            if (!new GlideRecord(specs[s][0]).isValid()) continue;
            var rows = this._rows(specs[s][0], {
                fields: { table: ['table', 'table_name'], active: ['active'] },
                optional: { table: true, active: true },
                orderBy: null,
                label: 'tables'
            });
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                if (!r.table || r.active == 'false' || r.active == '0') continue;
                var m = res[specs[s][1]];
                m[r.table] = (m[r.table] || 0) + 1;
            }
        }
        return res;
    },

    _tableList: function () {
        var seen = {}, out = [], i, n;
        var add = function (name, source) {
            if (!name) return;
            if (seen[name]) { if (source == 'manual') seen[name].source = 'manual'; return; }
            seen[name] = { name: name, source: source };
            out.push(seen[name]);
        };
        var cur = this.config.curatedTables || [];
        for (i = 0; i < cur.length; i++) add(cur[i], 'curated');

        var dbChk = new GlideRecord('sys_db_object');
        if (this.config.autoCustomTables && dbChk.isValid()) {
            var own = ConfigNowConfig.SCOPE + '_';
            var db = new GlideRecord('sys_db_object');
            db.addEncodedQuery('nameSTARTSWITHx_^ORnameSTARTSWITHu_');
            db.orderBy('name');
            db.setLimit(this.config.maxAutoTables + 1);
            db.query();
            n = 0;
            while (db.next()) {
                var nm = db.getValue('name');
                if (nm.indexOf(own) == 0) continue;
                var skip = false, ex = this.config.autoExcludePrefixes || [];
                for (var xp = 0; xp < ex.length; xp++) if (nm.indexOf(ex[xp]) == 0) skip = true;
                if (skip) continue;
                if (db.isValidField('scriptable_table') && db.getValue('scriptable_table') == '1') continue; // remote table
                if (++n > this.config.maxAutoTables) { this._warn('tables', 'More than ' + this.config.maxAutoTables + ' custom tables – the rest were skipped'); break; }
                add(nm, 'custom');
            }
        }

        var excluded = {};
        var tc = new GlideRecord(this.config.tables.tableConfig);
        if (tc.isValid()) {
            tc.query();
            while (tc.next()) {
                var tn = String(tc.getValue('table_name') || '').replace(/^\s+|\s+$/g, '');
                if (!tn) continue;
                if (tc.getValue('active') == '1' || tc.getValue('active') == 'true') add(tn, 'manual');
                else excluded[tn] = true;
            }
        }
        var res = [];
        for (i = 0; i < out.length; i++) if (!excluded[out[i].name]) res.push(out[i]);
        res.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
        return res;
    },

    _count: function (table, encodedQuery) {
        var ga = new GlideAggregate(table);
        if (encodedQuery) ga.addEncodedQuery(encodedQuery);
        ga.addAggregate('COUNT');
        ga.query();
        return ga.next() ? parseInt(ga.getAggregate('COUNT'), 10) : 0;
    },

    /* sys_db_object fields reported per table: [attribute, field, kind] */
    TABLE_FIELDS: [
        ['scope', 'sys_scope', 'scope'], ['package', 'sys_package', 'display'],
        ['extensible', 'is_extendable', 'bool'], ['extension_model', 'extension_model', 'str'],
        ['accessible_from', 'access', 'str'], ['caller_access', 'caller_access', 'str'],
        ['can_read', 'read_access', 'bool'], ['can_create', 'create_access', 'bool'],
        ['can_update', 'update_access', 'bool'], ['can_delete', 'delete_access', 'bool'],
        ['web_service_access', 'ws_access', 'bool'], ['allow_configuration', 'configuration_access', 'bool'],
        ['allow_new_fields', 'alter_access', 'bool'], ['create_access_controls', 'create_access_controls', 'bool'],
        ['live_feed', 'live_feed_enabled', 'bool'], ['remote_table', 'scriptable_table', 'bool'],
        ['auto_number', 'number_ref', 'present'], ['user_role', 'user_role', 'display']
    ],

    /* sys_dictionary fields reported per column: [attribute, field, kind] */
    COLUMN_FIELDS: [
        ['type', 'internal_type', 'str'], ['max_length', 'max_length', 'str'], ['reference', 'reference', 'str'],
        ['mandatory', 'mandatory', 'bool'], ['read_only', 'read_only', 'bool'], ['unique', 'unique', 'bool'],
        ['active', 'active', 'bool'], ['display', 'display', 'bool'], ['calculated', 'virtual', 'bool'],
        ['function_field', 'function_field', 'bool'], ['choice', 'choice', 'str'], ['dependent', 'dependent', 'str'],
        ['default_value', 'default_value', 'long'], ['dictionary_attributes', 'attributes', 'long'],
        ['scope', 'sys_scope', 'scope']
    ],

    /**
     * Schema of one table, read once per collection: label, parent, the
     * fingerprint column list, the table definition and full column records.
     */
    _schema: function (table) {
        if (!this._schemaCache) this._schemaCache = {};
        if (this._schemaCache[table]) return this._schemaCache[table];
        var res = { sys_id: '', label: '', parent: '', columns: [], definition: {}, dictionary: [] };
        var o = new GlideRecord('sys_db_object');
        o.addQuery('name', table);
        o.setLimit(1);
        o.query();
        if (o.next()) {
            res.sys_id = o.getUniqueValue();
            res.label = o.getValue('label') || '';
            var sc = o.getValue('super_class');
            res.parent = sc ? this._refField('sys_db_object', sc, 'name') : '';
            res.definition = this._fieldSet(o, this.TABLE_FIELDS);
        }
        var d = new GlideRecord('sys_dictionary');
        d.addQuery('name', table);
        d.addQuery('element', '!=', '');
        d.query();
        while (d.next()) {
            var el = d.getValue('element');
            if (!el) continue;
            res.columns.push(el + ':' + (d.getValue('internal_type') || '') + ':' + (d.getValue('max_length') || ''));
            var attrs = this._fieldSet(d, this.COLUMN_FIELDS);
            attrs.table = table;
            res.dictionary.push({
                element: el,
                sys_id: d.getUniqueValue(),
                label: d.isValidField('column_label') ? String(d.getValue('column_label') || '') : '',
                attributes: attrs
            });
        }
        res.columns.sort();
        res.dictionary.sort(function (a, b) { return a.element < b.element ? -1 : (a.element > b.element ? 1 : 0); });
        this._schemaCache[table] = res;
        return res;
    },

    /**
     * Reads the listed fields of the current record into a plain object.
     * Fields this release doesn't have are left out (not reported as drift).
     * Reference values are converted to names so they compare across instances.
     */
    _fieldSet: function (gr, spec) {
        var out = {};
        for (var i = 0; i < spec.length; i++) {
            var attr = spec[i][0], f = spec[i][1], kind = spec[i][2];
            if (!gr.isValidField(f)) continue;
            var v = gr.getValue(f);
            v = v == null ? '' : String(v);
            if (kind == 'bool') out[attr] = (v == '1' || v == 'true');
            else if (kind == 'present') out[attr] = v !== '';
            else if (kind == 'scope') out[attr] = v ? this._refField('sys_scope', v, 'scope') : '';
            else if (kind == 'display') out[attr] = v ? String(gr.getDisplayValue(f) || '') : '';
            else if (kind == 'long') out[attr] = this._clipLong(v);
            else out[attr] = v;
        }
        return out;
    },

    /** Long text (scripts, attribute strings): keep it comparable but bounded. */
    _clipLong: function (v) {
        if (v.length <= 500) return v;
        return v.substring(0, 200) + ' ...[' + v.length + ' chars, sha256 ' + this._hash(v).substring(0, 16) + ']';
    },

    /** One field of a referenced record, cached (scope names, parent table names). */
    _refField: function (table, sysId, field) {
        if (!this._refCache) this._refCache = {};
        var k = table + '|' + sysId + '|' + field;
        if (this._refCache.hasOwnProperty(k)) return this._refCache[k];
        var v = '';
        var gr = new GlideRecord(table);
        if (gr.isValid() && gr.get(sysId)) v = String(gr.getValue(field) || '');
        this._refCache[k] = v;
        return v;
    },

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    /**
     * Builds one normalised tracked item. `hash` covers everything that counts
     * as configuration (key, value, version, state, attributes) and is what
     * drift detection will compare later. `runtime` is reported but not hashed.
     */
    _item: function (category, key, name, value, version, state, attributes, runtime, sourceSysId) {
        value = value == null ? '' : String(value);
        var item = {
            category: category,
            key: String(key),
            name: name || String(key),
            value: value,
            version: version || '',
            state: state || '',
            attributes: attributes || {},
            runtime: runtime || {},
            source_sys_id: sourceSysId || ''
        };
        item.hash = this._hash([item.key, value, item.version, item.state,
            this._canon(item.attributes)].join('|'));
        if (value.length > this.config.maxValueLength) {
            item.value = value.substring(0, this.config.maxValueLength);
            item.value_truncated = true;
        }
        return item;
    },

    /**
     * Defensive GlideRecord reader.
     * spec.fields   { outName: [candidateField, ...] } – first valid wins
     * spec.display  { outName: true } – use getDisplayValue
     * spec.optional { outName: true } – no warning if the field is missing
     * spec.filters  { field: value } – applied only if the field exists
     * spec.encodedQuery, spec.orderBy, spec.label
     */
    _rows: function (table, spec) {
        var label = spec.label || table;
        var gr = new GlideRecord(table);
        if (!gr.isValid()) {
            this._warn(label, 'Table ' + table + ' not found or not readable from this scope');
            return [];
        }
        var resolved = {};
        for (var out in spec.fields) {
            var cands = spec.fields[out];
            for (var c = 0; c < cands.length; c++) {
                if (gr.isValidField(cands[c])) { resolved[out] = cands[c]; break; }
            }
            if (!resolved[out] && !(spec.optional && spec.optional[out])) this._warn(label, 'No field found for "' + out + '" (tried ' + cands.join(', ') + ')');
        }
        if (spec.filters) {
            for (var f in spec.filters) {
                if (gr.isValidField(f)) gr.addQuery(f, spec.filters[f]);
                else this._warn(label, 'Filter field ' + f + ' missing – filter not applied');
            }
        }
        if (spec.encodedQuery) gr.addEncodedQuery(spec.encodedQuery);
        if (spec.orderBy && gr.isValidField(spec.orderBy)) gr.orderBy(spec.orderBy);
        var limit = this.config.maxRowsPerCategory;
        gr.setLimit(limit);
        gr.query();

        var rows = [];
        var display = spec.display || {};
        while (gr.next()) {
            var row = { sys_id: gr.getUniqueValue() };
            for (var o in resolved) {
                var v = display[o] ? gr.getDisplayValue(resolved[o]) : gr.getValue(resolved[o]);
                row[o] = v == null ? '' : String(v);
            }
            rows.push(row);
        }
        if (rows.length >= limit) this._warn(label, 'Row limit ' + limit + ' reached – results truncated');
        return rows;
    },

    _prop: function (name) {
        var v = gs.getProperty(name, '');
        if (v) return String(v);
        // Fallback for properties not exposed to this scope through gs.getProperty
        var gr = new GlideRecord('sys_properties');
        if (gr.isValid()) {
            gr.addQuery('name', name);
            gr.setLimit(1);
            gr.query();
            if (gr.next()) return String(gr.getValue('value') || '');
        }
        return '';
    },

    /** 'active'/'true'/'1' -> 'active', anything else -> 'inactive'. */
    _activeState: function (v) {
        v = String(v == null ? '' : v).toLowerCase();
        return (v == 'active' || v == 'true' || v == '1') ? 'active' : 'inactive';
    },

    /**
     * Environment is the OOTB cmdb_ci.environment field (CSDM), set by an
     * admin on this instance's own CI and never written by the collector, so
     * a clone cannot carry Prod's classification into Dev.
     */
    _environment: function () {
        var t = this.config.tables && this.config.tables.instance;
        if (!t) return '';
        var gr = new GlideRecord(t);
        if (!gr.isValid() || !gr.isValidField('environment')) return '';
        gr.addQuery('instance_name', this._prop('instance_name'));
        gr.setLimit(1);
        gr.query();
        return gr.next() ? String(gr.getValue('environment') || '') : '';
    },

    _parseFamily: function (war) {
        var m = /^glide-([a-z]+)-/i.exec(war || '');
        return m ? m[1].charAt(0).toUpperCase() + m[1].substring(1).toLowerCase() : '';
    },

    _parsePatch: function (war) {
        var m = /__(patch\d+(?:[-_]hotfix\d+[a-z]?)?)/i.exec(war || '');
        return m ? m[1] : (war ? 'GA' : '');
    },

    _hash: function (s) {
        return new GlideDigest().getSHA256Hex(String(s));
    },

    /** Stable JSON (sorted keys) so the hash does not depend on key order. */
    _canon: function (obj) {
        if (obj === null || typeof obj != 'object') return JSON.stringify(obj);
        if (Object.prototype.toString.call(obj) == '[object Array]') {
            var a = [];
            for (var i = 0; i < obj.length; i++) a.push(this._canon(obj[i]));
            return '[' + a.join(',') + ']';
        }
        var keys = [];
        for (var k in obj) if (obj.hasOwnProperty(k)) keys.push(k);
        keys.sort();
        var parts = [];
        for (var j = 0; j < keys.length; j++) parts.push(JSON.stringify(keys[j]) + ':' + this._canon(obj[keys[j]]));
        return '{' + parts.join(',') + '}';
    },

    _safe: function (label, fn, fallback) {
        try {
            return fn.call(this);
        } catch (e) {
            this._warn(label, 'Collection failed: ' + (e && e.message ? e.message : e));
            return fallback;
        }
    },

    _warn: function (area, message) {
        this.warnings.push({ area: area, message: message });
    },

    type: 'ConfigNowCollector'
};
