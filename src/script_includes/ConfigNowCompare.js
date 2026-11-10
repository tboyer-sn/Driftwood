/**
 * Script Include: ConfigNowCompare
 * Scope:          x_2160899_driftw_0  (Driftwood)
 * Accessible from: This application scope only
 *
 * Cross-instance drift: compares the stored tracked items of two instance CIs
 * category by category, matching on item_key, and classifies every item as
 *   same      – identical value_hash
 *   changed   – present on both, a compared field differs (fields lists them;
 *               version_only = true when only the version differs, i.e. likely
 *               release/upgrade drift rather than configuration)
 *   only_a    – present on A, absent/not present on B
 *   only_b    – the reverse
 *   ignored   – key is on the expected-difference list (config.compareIgnore)
 *
 * Reads through the configured storage routing, so it works for CI-mode and
 * plain-mode categories alike. Read-only.
 *
 *   var c = new ConfigNowCompare();
 *   c.listInstances();                         // instance CIs available
 *   c.compare('dev465827', 'dev466156');       // by instance_name or sys_id
 *   c.compare(a, b, { categories: ['plugins'] });
 */
var ConfigNowCompare = Class.create();
ConfigNowCompare.prototype = {

    SCHEMA: 'driftwood.compare/0.1',

    /**
     * options.secure = true: read through GlideRecordSecure (ACLs of the
     * current user apply). Every REST resource and page uses it; only the
     * drift engine (system job) reads without it.
     */
    initialize: function (options) {
        this.options = options || {};
        this.config = this.options.config || ConfigNowConfig.get();
        this.T = this.config.tables;
        this.secure = !!this.options.secure;
    },

    _gr: function (table) {
        return ConfigNowConfig.record(table, this.secure);
    },

    listInstances: function () {
        var out = [];
        var gr = this._gr(this.T.instance);
        if (!gr.isValid()) return out;
        gr.orderBy('instance_name');
        gr.query();
        while (gr.next()) out.push(this._instanceInfo(gr));
        return this.orderInstances(out);
    },

    /** ref: instance CI sys_id or instance_name. Returns info or null. */
    resolveInstance: function (ref) {
        if (!ref) return null;
        var gr = this._gr(this.T.instance);
        if (gr.get(ref)) return this._instanceInfo(gr);
        gr = this._gr(this.T.instance);
        gr.addQuery('instance_name', ref);
        gr.setLimit(1);
        gr.query();
        return gr.next() ? this._instanceInfo(gr) : null;
    },

    compare: function (aRef, bRef, opts) {
        opts = opts || {};
        var a = this.resolveInstance(aRef), b = this.resolveInstance(bRef);
        if (!a) throw new Error('Instance not found: ' + aRef);
        if (!b) throw new Error('Instance not found: ' + bRef);

        var ignore = this._buildIgnore([a, b]);
        this._checkSysIds = opts.sysIds === undefined ? !!this.config.compareSysIds : !!opts.sysIds;

        var result = {
            schema: this.SCHEMA,
            sys_id_check: this._checkSysIds,
            generated_at: String(new GlideDateTime().getValue()),
            a: a, b: b,
            summary: { same: 0, changed: 0, version_only: 0, count_only: 0, only_a: 0, only_b: 0, ignored: 0 },
            categories: {}
        };
        var cats = opts.categories || this.config.categories || [];
        if (!this.config.compareIgnore) result.warning = 'ConfigNowConfig is older than ConfigNowCompare – redeploy install_code.js with UPDATE_EXISTING = true';
        for (var c = 0; c < cats.length; c++) {
            var cat = cats[c], table = this.T[cat];
            if (!table) continue;
            if (!this._collected(a, cat) || !this._collected(b, cat)) {
                var nc = [];
                if (!this._collected(a, cat)) nc.push(a.instance_name);
                if (!this._collected(b, cat)) nc.push(b.instance_name);
                result.categories[cat] = { counts: { same: 0, changed: 0, version_only: 0, count_only: 0, only_a: 0, only_b: 0, ignored: 0 }, rows: [], not_collected: nc };
                continue;
            }
            var ma = this._load(table, a.sys_id, cat), mb = this._load(table, b.sys_id, cat);
            var counts = { same: 0, changed: 0, version_only: 0, count_only: 0, only_a: 0, only_b: 0, ignored: 0 };
            var rows = [];
            var key;
            for (key in ma) {
                if (ignore[cat + '|' + key]) { counts.ignored++; continue; }
                if (!mb[key]) { rows.push({ type: 'only_a', key: key, name: ma[key].name, a: ma[key], b: null, fields: [] }); counts.only_a++; }
                else {
                    // Field-level comparison, not the stored hash: hashes from older
                    // collectors (or with since-ignored attributes) still compare correctly
                    var fields = this._diffFields(ma[key], mb[key], cat);
                    if (!fields.length) { counts.same++; continue; }
                    var vOnly = fields.length == 1 && fields[0] == 'version';
                    var kinds = this._kinds(fields, cat);
                    var cOnly = kinds.length == 1 && kinds[0] == 'count';
                    rows.push({ type: 'changed', version_only: vOnly, count_only: cOnly, kinds: kinds, key: key, name: ma[key].name, a: ma[key], b: mb[key], fields: fields });
                    counts.changed++;
                    if (vOnly) counts.version_only++;
                    if (cOnly) counts.count_only++;
                }
            }
            for (key in mb) {
                if (ma[key]) continue;
                if (ignore[cat + '|' + key]) { counts.ignored++; continue; }
                rows.push({ type: 'only_b', key: key, name: mb[key].name, a: null, b: mb[key], fields: [] });
                counts.only_b++;
            }
            var order = { changed: 0, only_a: 1, only_b: 2 };
            rows.sort(function (x, y) { return (order[x.type] - order[y.type]) || (x.key < y.key ? -1 : (x.key > y.key ? 1 : 0)); });
            result.categories[cat] = { counts: counts, rows: rows };
            for (var k in counts) result.summary[k] += counts[k];
        }
        return result;
    },

    /**
     * N-way comparison ("matrix"). refs: array of instance names/sys_ids, or
     * empty for all instance CIs. Columns are ordered by orderInstances(); the
     * first column (the current instance when included) is the baseline every
     * other column is compared against.
     *
     * Row status:  same    – present everywhere, no field differs (counted only)
     *              differs – present everywhere, some column differs from baseline
     *              partial – missing on at least one column
     * version_only – every difference in the row is a version difference
     * count_only   – every difference is a record count (tables: total, customer_*)
     * kinds        – drift kinds present in the row (see config.driftKinds)
     *
     * opts.keys (v0.6, "Compare across instances" on a tracked object): only
     * these item keys, and their rows are returned even when the item is the
     * same everywhere (status 'same').
     */
    compareMany: function (refs, opts) {
        opts = opts || {};
        var insts = [], i, k;
        if (refs && refs.length) {
            for (i = 0; i < refs.length; i++) {
                var inf = this.resolveInstance(refs[i]);
                if (!inf) throw new Error('Instance not found: ' + refs[i]);
                insts.push(inf);
            }
            insts = this.orderInstances(insts);
        } else {
            insts = this.listInstances();
        }
        if (insts.length < 2) throw new Error('Need at least two instances to compare');

        var ignore = this._buildIgnore(insts);
        this._checkSysIds = opts.sysIds === undefined ? !!this.config.compareSysIds : !!opts.sysIds;
        var onlyKeys = null;
        if (opts.keys && opts.keys.length) { onlyKeys = {}; for (i = 0; i < opts.keys.length; i++) onlyKeys[opts.keys[i]] = true; }
        var result = {
            schema: 'driftwood.matrix/0.1',
            sys_id_check: this._checkSysIds,
            generated_at: String(new GlideDateTime().getValue()),
            baseline: insts[0].instance_name,
            instances: insts,
            summary: { same: 0, differs: 0, partial: 0, version_only: 0, count_only: 0, ignored: 0 },
            per_instance: [],
            categories: {}
        };
        var per = [];
        for (i = 0; i < insts.length; i++) per.push({ instance_name: insts[i].instance_name, same: 0, changed: 0, missing: 0, extra: 0 });

        var cats = opts.categories || this.config.categories || [];
        for (var c = 0; c < cats.length; c++) {
            var cat = cats[c], table = this.T[cat];
            if (!table) continue;
            var maps = [], keys = {}, order = [], coll = [], notColl = [], nColl = 0;
            for (i = 0; i < insts.length; i++) {
                coll.push(this._collected(insts[i], cat));
                if (!coll[i]) { notColl.push(insts[i].instance_name); maps.push({}); continue; }
                nColl++;
                maps.push(this._load(table, insts[i].sys_id, cat));
                for (k in maps[i]) if (!keys[k]) { keys[k] = true; order.push(k); }
            }
            if (nColl < 2) {
                result.categories[cat] = { counts: { same: 0, differs: 0, partial: 0, version_only: 0, count_only: 0, ignored: 0 }, rows: [], not_collected: notColl };
                continue;
            }
            order.sort();
            var counts = { same: 0, differs: 0, partial: 0, version_only: 0, count_only: 0, ignored: 0 };
            var rows = [];
            for (var r = 0; r < order.length; r++) {
                var key = order[r];
                if (onlyKeys && !onlyKeys[key]) continue;
                if (ignore[cat + '|' + key] && !onlyKeys) { counts.ignored++; continue; }
                // reference = baseline if it has the item, else the first column that does
                var ref = coll[0] && maps[0][key] ? 0 : -1;
                for (i = 0; ref < 0 && i < maps.length; i++) if (maps[i][key]) ref = i;
                var cells = [], fieldSet = {}, fields = [], missing = false, anyDiff = false;
                for (i = 0; i < maps.length; i++) {
                    if (!coll[i]) { cells.push({ not_collected: true }); continue; }
                    var it = maps[i][key];
                    if (!it) { missing = true; cells.push(null); if (maps[0][key]) per[i].missing++; continue; }
                    var f = i == ref ? [] : this._diffFields(maps[ref][key], it, cat);
                    for (var x = 0; x < f.length; x++) if (!fieldSet[f[x]]) { fieldSet[f[x]] = true; fields.push(f[x]); }
                    if (f.length) anyDiff = true;
                    if (i > 0) {
                        if (!maps[0][key]) per[i].extra++;
                        else if (f.length) per[i].changed++;
                        else per[i].same++;
                    }
                    var cell = { value: it.value, version: it.version, state: it.state, attributes: it.attributes, secure: it.secure, diff: f };
                    if (it.url) cell.url = it.url;
                    if (this._checkSysIds && it.sys_id) cell.sys_id = it.sys_id;
                    if (it.columns) { cell.columns = it.columns; if (it.columns_truncated) cell.columns_truncated = true; }
                    cells.push(cell);
                }
                if (!missing && !anyDiff) {
                    counts.same++;
                    if (!onlyKeys) continue;
                }
                var vOnly = !missing && fields.length == 1 && fields[0] == 'version';
                var mKinds = this._kinds(fields, cat);
                var cOnly = !missing && mKinds.length == 1 && mKinds[0] == 'count';
                var status = missing ? 'partial' : (anyDiff ? 'differs' : 'same');
                if (status != 'same') counts[status]++;
                if (vOnly) counts.version_only++;
                if (cOnly) counts.count_only++;
                var nm = '';
                for (i = 0; i < maps.length && !nm; i++) if (maps[i][key]) nm = maps[i][key].name;
                var mrow = { key: key, name: nm, status: status, version_only: vOnly, count_only: cOnly, kinds: mKinds, reference: ref, fields: fields, cells: cells };
                if (ignore[cat + '|' + key]) mrow.ignored = true;
                rows.push(mrow);
            }
            result.categories[cat] = { counts: counts, rows: rows };
            if (notColl.length) result.categories[cat].not_collected = notColl;
            for (k in counts) result.summary[k] += counts[k];
        }
        per[0].same = null; // baseline is the reference
        result.per_instance = per;
        return result;
    },

    /**
     * Deterministic column order: current instance first; then names listed in
     * config.instanceOrder (<scope>.instance_order); then Environment rank
     * (dev < test < qa < uat < staging < sub-prod < pre-prod < prod < unknown);
     * then instance_name.
     */
    orderInstances: function (list) {
        var local = gs.getProperty('instance_name');
        var explicit = {}, eo = this.config.instanceOrder || [], i;
        for (i = 0; i < eo.length; i++) explicit[eo[i]] = i;
        var envRank = this.config.environmentRank || ['dev', 'test', 'qa', 'uat', 'stag', 'sub', 'preprod', 'prod'];
        var rank = function (inst) {
            var e = String(inst.environment || '').toLowerCase().replace(/[^a-z]/g, '');
            if (!e) return envRank.length + 1;
            var best = envRank.length; // known but unranked environment
            for (var r = 0; r < envRank.length; r++) if (e.indexOf(envRank[r]) == 0) best = r;
            return best;
        };
        var keyed = [];
        for (i = 0; i < list.length; i++) {
            var it = list[i];
            keyed.push({
                inst: it,
                k0: it.instance_name == local ? 0 : 1,
                k1: explicit.hasOwnProperty(it.instance_name) ? explicit[it.instance_name] : 9999,
                k2: rank(it),
                k3: String(it.instance_name || '')
            });
        }
        keyed.sort(function (p, q) {
            return (p.k0 - q.k0) || (p.k1 - q.k1) || (p.k2 - q.k2) || (p.k3 < q.k3 ? -1 : (p.k3 > q.k3 ? 1 : 0));
        });
        var out = [];
        for (i = 0; i < keyed.length; i++) { keyed[i].inst.is_local = keyed[i].k0 == 0; out.push(keyed[i].inst); }
        return out;
    },

    /* ---- helpers ---- */

    /** Categories collectors before v0.3 always gathered (their summaries don't list them). */
    LEGACY_CATEGORIES: ['plugins', 'applications', 'mid_servers', 'system_properties', 'clone_preservers', 'clone_exclusions'],

    /** Did this instance's last collection/import include category cat? */
    _collected: function (inst, cat) {
        var list = inst.categories_collected;
        if (list && list.length) { for (var i = 0; i < list.length; i++) if (list[i] == cat) return true; return false; }
        for (var j = 0; j < this.LEGACY_CATEGORIES.length; j++) if (this.LEGACY_CATEGORIES[j] == cat) return true;
        return false;
    },

    /** Expected differences + the app's own records (this scope and each side's collector scope). */
    _buildIgnore: function (insts) {
        var ignore = {}, i;
        // Tolerate an older ConfigNowConfig without the compare settings
        var ign = this.config.compareIgnore || ['system_properties|glide.servlet.uri'];
        for (i = 0; i < ign.length; i++) ignore[ign[i]] = true;
        var selfScopes = [ConfigNowConfig.SCOPE];
        for (i = 0; i < insts.length; i++) if (insts[i].collector_scope) selfScopes.push(insts[i].collector_scope);
        for (i = 0; i < selfScopes.length; i++) ignore['applications|' + selfScopes[i]] = true;
        this._ignoreAttrs = {};
        var ia = this.config.compareIgnoreAttributes || ['vendor'];
        for (i = 0; i < ia.length; i++) this._ignoreAttrs[ia[i]] = true;
        return ignore;
    },

    _instanceInfo: function (gr) {
        return {
            sys_id: gr.getUniqueValue(),
            instance_name: gr.getValue('instance_name') || gr.getValue('name') || '',
            instance_url: gr.getValue('instance_url') || '',
            family: gr.getValue('family') || '',
            patch: gr.getValue('patch') || '',
            environment: gr.getDisplayValue('environment') || '',
            last_collected: gr.getValue('last_collected') || '',
            collection_status: gr.getValue('collection_status') || '',
            source: this._summaryField(gr.getValue('collection_summary'), 'source', 'local'),
            collector_scope: this._summaryField(gr.getValue('collection_summary'), 'collector_scope', ''),
            categories_collected: this._summaryField(gr.getValue('collection_summary'), 'categories', null)
        };
    },

    _summaryField: function (summary, field, dflt) {
        try { return JSON.parse(summary || '{}')[field] || dflt; } catch (e) { return dflt; }
    },

    _load: function (table, instId, cat) {
        var map = {};
        var gr = this._gr(table);
        if (!gr.isValid()) return map;
        gr.addQuery('instance', instId);
        gr.addQuery('item_category', cat);
        gr.addQuery('present', true);
        gr.query();
        while (gr.next()) {
            var attrs = {};
            try { attrs = JSON.parse(gr.getValue('item_attributes') || '{}'); } catch (e) { attrs = {}; }
            map[gr.getValue('item_key')] = {
                name: gr.getValue('name') || '',
                value: gr.getValue('item_value') || '',
                version: gr.getValue('item_version') || '',
                state: gr.getValue('item_state') || '',
                hash: gr.getValue('value_hash') || '',
                sys_id: gr.getValue('source_sys_id') || '',
                url: gr.isValidField('source_url') ? (gr.getValue('source_url') || '') : '',
                secure: gr.getValue('is_secure') == '1' || gr.getValue('is_secure') == 'true',
                attributes: attrs
            };
            if (cat == 'tables') {
                // column list for drill-in (stored in runtime, not compared directly –
                // attributes.fingerprint carries the schema comparison)
                try {
                    var rt = JSON.parse(gr.getValue('runtime') || '{}');
                    map[gr.getValue('item_key')].columns = rt.columns ? String(rt.columns).split(',') : [];
                    if (rt.columns_truncated) map[gr.getValue('item_key')].columns_truncated = true;
                } catch (e2) { /* ignore */ }
            }
        }
        return map;
    },

    _diffFields: function (a, b, cat) {
        var f = [];
        if (a.value != b.value) f.push('value');
        if (a.version != b.version) f.push('version');
        if (a.state != b.state) f.push('state');
        var seen = {}, k;
        for (k in a.attributes) seen[k] = true;
        for (k in b.attributes) seen[k] = true;
        for (k in seen) {
            if (this._ignoreAttrs && (this._ignoreAttrs[k] || this._ignoreAttrs[cat + '|' + k])) continue;
            // Reported by only one side's collector (e.g. v0.4 table definitions vs
            // a v0.3 snapshot): not comparable, so not drift
            if (a.attributes[k] === undefined || b.attributes[k] === undefined) continue;
            if (JSON.stringify(a.attributes[k]) != JSON.stringify(b.attributes[k])) f.push('attributes.' + k);
        }
        // Secret values are masked, so only the (salted) hash can show a difference
        if (!f.length && (a.secure || b.secure) && a.hash != b.hash) f.push('secure_value');
        // Optional sys_id drift: same item, different source record sys_id (e.g.
        // rebuilt by hand instead of promoted by update set)
        if (this._checkSysIds && a.sys_id && b.sys_id && a.sys_id != b.sys_id && !this._sysIdExcluded(cat)) f.push('sys_id');
        return f;
    },

    _sysIdExcluded: function (cat) {
        var ex = this.config.sysIdExclude || ['mid_servers', 'update_sets', 'plugins', 'tables', 'columns'];
        for (var i = 0; i < ex.length; i++) if (ex[i] == cat) return true;
        return false;
    },

    /** Drift kinds of a row's differing fields, in a fixed order. */
    _kinds: function (fields, cat) {
        var map = (this.config.driftKinds && this.config.driftKinds[cat]) || {};
        var dflt = (cat == 'tables' || cat == 'columns') ? 'schema' : 'config';
        var seen = {}, out = [], order = ['schema', 'config', 'clone', 'sys_id', 'count', 'version'];
        for (var i = 0; i < fields.length; i++) {
            var f = fields[i], k;
            if (f == 'version') k = 'version';
            else if (f == 'sys_id') k = 'sys_id';
            else if (f.indexOf('attributes.') == 0) k = map[f.substring(11)] || dflt;
            else k = dflt;
            seen[k] = true;
        }
        for (var j = 0; j < order.length; j++) if (seen[order[j]]) out.push(order[j]);
        return out;
    },

    /**
     * This instance's STORED observations as a snapshot (security review S1):
     * what GET /current returns to people without configuration_admin, instead
     * of running the collector in their session. Read through this.secure, so
     * only rows and fields the user may read are included (secure_value_hash
     * only with configuration_read_secure). Null when never collected.
     */
    storedSnapshot: function (opts) {
        opts = opts || {};
        var name = String(gs.getProperty('instance_name') || '');
        var ig = this._gr(this.T.instance);
        if (!ig.isValid()) return null;
        ig.addQuery('instance_name', name);
        ig.setLimit(1);
        ig.query();
        if (!ig.next()) return null;
        var summary = {};
        try { summary = JSON.parse(ig.getValue('collection_summary') || '{}'); } catch (e) { summary = {}; }
        var snap = {
            schema: 'driftwood.snapshot/0.1', stored: true,
            collected_at: ig.getValue('last_collected') || '', duration_ms: 0,
            collector_version: summary.collector_version || '', collector_scope: summary.collector_scope || '',
            instance: { instance_name: name, instance_url: ig.getValue('instance_url') || '', family: ig.getValue('family') || '',
                patch: ig.getValue('patch') || '', build_name: ig.getValue('build_name') || '', environment: ig.getDisplayValue('environment') || '' },
            categories: {}, warnings: summary.warnings || []
        };
        var cats = opts.categories || this.config.categories || [];
        for (var c = 0; c < cats.length; c++) {
            var cat = cats[c], table = this.T[cat];
            if (!table) continue;
            var gr = this._gr(table), items = [];
            if (!gr.isValid()) continue;
            gr.addQuery('instance', ig.getUniqueValue());
            gr.addQuery('item_category', cat);
            gr.addQuery('present', true);
            gr.query();
            while (gr.next()) {
                var it = { category: cat, key: gr.getValue('item_key') || '', name: gr.getValue('name') || '',
                    value: gr.getValue('item_value') || '', version: gr.getValue('item_version') || '', state: gr.getValue('item_state') || '',
                    attributes: this._json(gr.getValue('item_attributes')), runtime: this._json(gr.getValue('runtime')),
                    hash: gr.getValue('value_hash') || '', source_sys_id: gr.getValue('source_sys_id') || '',
                    source_table: gr.isValidField('source_table') ? (gr.getValue('source_table') || '') : '',
                    secure: gr.getValue('is_secure') == '1' || gr.getValue('is_secure') == 'true' };
                var sh = gr.getValue('secure_value_hash');
                if (sh) it.secure_value_hash = sh;
                items.push(it);
            }
            snap.categories[cat] = { count: items.length, items: items };
        }
        return snap;
    },

    _json: function (s) {
        try { return JSON.parse(s || '{}'); } catch (e) { return {}; }
    },

    type: 'ConfigNowCompare'
};
