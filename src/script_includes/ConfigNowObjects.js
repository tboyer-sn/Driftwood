/**
 * Script Include: ConfigNowObjects
 * Scope:          x_2160899_driftw_0  (Driftwood)
 * Accessible from: This application scope only
 *
 * v0.6 tracked objects: one x_2160899_driftw_0_tracked_object row per
 * category + key across all instances. Observations (tracked_item rows and
 * tracked CIs) point at their object through the "object" reference.
 *
 *   resolve(cat, key, name)  -> object sys_id (created on first sight)
 *   inheritedColumns(tables, columnKeys) -> { 'table.element': parentTable }
 *   backfill({ dryRun })     -> links every existing observation (fix script)
 *
 * object_key = '<category>|<key>' is unique on the table, so a re-run or two
 * writers racing never create a second object for the same thing.
 *
 * Inherited columns (Z12): the dictionary repeats a parent's columns under a
 * CMDB subclass. A column 'T.e' whose element also exists on a tracked
 * ancestor of T (from the tables category: attributes.parent) is inherited.
 * It gets no object: the parent's column object stands for it. Decided from
 * the observations alone, so imported snapshots work and no hash changes.
 *
 * Writes nothing but tracked_object rows and observation.object. ES3-safe.
 */
var ConfigNowObjects = Class.create();
ConfigNowObjects.prototype = {

    initialize: function (config) {
        this.config = config || ConfigNowConfig.get();
        this.T = this.config.tables;
        this.cache = {};      // object_key -> sys_id
        this.loaded = {};     // category -> true once its objects are cached
        this.created = 0;
        this.dryRun = false;  // backfill dry run: count, don't insert
        this.touched = {};    // object sys_ids touched this run (drift recompute)
        this._ok = null;
    },

    /** Is the tracked_object table installed (v0.6 schema)? */
    available: function () {
        if (this._ok === null) {
            var g = this.T.object ? new GlideRecord(this.T.object) : null;
            this._ok = !!(g && g.isValid() && g.isValidField('object_key'));
        }
        return this._ok;
    },

    /** Does this observation table have the Object reference? */
    linkable: function (table) {
        if (!this.available() || !table) return false;
        var g = new GlideRecord(table);
        return g.isValid() && g.isValidField('object');
    },

    objectKey: function (cat, key) {
        return this._clip(cat + '|' + key, 300);
    },

    /** The object for category + key, created when missing. '' if unavailable. */
    resolve: function (cat, key, name, now) {
        if (!this.available()) return '';
        var ok = this.objectKey(cat, key);
        this._load(cat);
        if (this.cache[ok]) return this.cache[ok];
        if (this.dryRun) { this.created++; this.cache[ok] = 'dry-run:' + ok; return this.cache[ok]; }
        var parent = '';
        if (cat == 'columns') {
            var t = String(key).split('.')[0];
            if (t) parent = this.resolve('tables', t, t, now);
        }
        var g = new GlideRecord(this.T.object);
        g.initialize();
        g.setValue('name', this._clip(name || key, 255));
        g.setValue('object_key', ok);
        g.setValue('item_category', cat);
        g.setValue('item_key', this._clip(key, 255));
        g.setValue('drift_status', 'not_compared');
        if (parent) g.setValue('parent_object', parent);
        if (now) g.setValue('first_seen', now);
        var id = g.insert();
        if (!id) {
            // lost a race on the unique key: use the row that won
            var w = new GlideRecord(this.T.object);
            if (w.get('object_key', ok)) id = w.getUniqueValue();
        } else this.created++;
        if (id) this.cache[ok] = id;
        return id || '';
    },

    _load: function (cat) {
        if (this.loaded[cat]) return;
        this.loaded[cat] = true;
        var g = new GlideRecord(this.T.object);
        g.addQuery('item_category', cat);
        g.query();
        while (g.next()) this.cache[g.getValue('object_key')] = g.getUniqueValue();
    },

    touch: function (id) {
        if (id && String(id).indexOf('dry-run:') != 0) this.touched[id] = true;
    },

    touchedIds: function () {
        var out = [];
        for (var k in this.touched) out.push(k);
        return out;
    },

    /**
     * tables: { tableName: parentTableName } for one instance
     * columnKeys: { 'table.element': true } for the same instance
     * Returns { 'table.element': 'ancestorTable' } for inherited columns.
     */
    inheritedColumns: function (tables, columnKeys) {
        var out = {};
        for (var ck in columnKeys) {
            var dot = ck.indexOf('.');
            if (dot < 1) continue;
            var t = ck.substring(0, dot), el = ck.substring(dot + 1);
            var p = tables[t], guard = 0;
            while (p && guard++ < 20) {
                if (columnKeys[p + '.' + el]) { out[ck] = p; break; }
                p = tables[p];
            }
        }
        return out;
    },

    /** { table: parent } from snapshot items of the tables category. */
    parentsFromItems: function (items) {
        var m = {};
        for (var i = 0; i < (items || []).length; i++) {
            var a = items[i].attributes || {};
            m[items[i].key] = a.parent || '';
        }
        return m;
    },

    /** { table: parent } from stored tables observations of one instance. */
    parentsFromStore: function (instId) {
        var m = {}, t = this.T.tables;
        if (!t) return m;
        var g = new GlideRecord(t);
        if (!g.isValid()) return m;
        g.addQuery('instance', instId);
        g.addQuery('item_category', 'tables');
        g.query();
        while (g.next()) {
            var a = {};
            try { a = JSON.parse(g.getValue('item_attributes') || '{}'); } catch (e) { a = {}; }
            m[g.getValue('item_key')] = a.parent || '';
        }
        return m;
    },

    /**
     * Fix script "Driftwood - Backfill tracked objects" (O02). Idempotent:
     * creates missing objects and fills empty Object references, nothing else.
     * opts.dryRun = true counts only. Returns { text, objects_created,
     * linked, already_linked, inherited, unlinked_inherited, by_category }.
     */
    backfill: function (opts) {
        opts = opts || {};
        var res = { dry_run: !!opts.dryRun, objects_created: 0, linked: 0, already_linked: 0, inherited: 0,
            unlinked_inherited: 0, by_category: {}, text: '' };
        var lines = ['=== Driftwood: backfill tracked objects (' + (opts.dryRun ? 'DRY RUN – nothing will change' : 'LIVE') + ') ==='];
        if (!this.available()) { res.text = lines.concat(['ABORT: ' + this.T.object + ' is not installed (run build_schema.js for v0.6).']).join('\n'); return res; }
        this.dryRun = !!opts.dryRun;
        var now = String(new GlideDateTime().getValue());

        // one pass per observation table, grouped by instance
        var tables = {}, cats = this.config.categories || [];
        for (var c = 0; c < cats.length; c++) if (this.T[cats[c]]) tables[this.T[cats[c]]] = true;
        var insts = [];
        var ig = new GlideRecord(this.T.instance);
        ig.query();
        while (ig.next()) insts.push({ id: ig.getUniqueValue(), name: String(ig.getValue('instance_name') || ig.getValue('name')) });

        for (var ii = 0; ii < insts.length; ii++) {
            var inst = insts[ii];
            var inherited = this._inheritedForInstance(inst.id);
            var nLinked = 0;
            for (var table in tables) {
                if (!this.linkable(table)) { lines.push('  !! ' + table + ' has no Object column – run build_schema.js for v0.6'); continue; }
                var g = new GlideRecord(table);
                g.addQuery('instance', inst.id);
                g.orderBy('item_category');
                g.query();
                while (g.next()) {
                    var cat = String(g.getValue('item_category')), key = String(g.getValue('item_key'));
                    var bc = res.by_category[cat] || (res.by_category[cat] = { observations: 0, linked: 0 });
                    bc.observations++;
                    var cur = g.getValue('object');
                    if (cat == 'columns' && inherited[key]) {
                        res.inherited++;
                        if (cur) { res.unlinked_inherited++; if (!this.dryRun) { g.setValue('object', ''); g.update(); } }
                        continue;
                    }
                    if (cur) { res.already_linked++; continue; }
                    var id = this.resolve(cat, key, g.getValue('name') || key, g.getValue('first_seen') || now);
                    if (!id) { lines.push('  !! could not create the object for ' + cat + '|' + key); continue; }
                    res.linked++; bc.linked++; nLinked++;
                    if (!this.dryRun) { g.setValue('object', id); g.update(); }
                    this.touch(id);
                }
            }
            lines.push('Instance ' + inst.name + ': ' + (this.dryRun ? 'would link ' : 'linked ') + nLinked + ' observation(s)' +
                (this._count(inherited) ? ', ' + this._count(inherited) + ' inherited column(s) left without an object' : ''));
        }
        res.objects_created = this.created;
        lines.push('By category:');
        for (var bk in res.by_category) lines.push('  ' + bk + ': ' + res.by_category[bk].observations + ' observation(s), ' + (this.dryRun ? 'would link ' : 'linked ') + res.by_category[bk].linked);
        lines.push('--- Summary ---');
        lines.push((this.dryRun ? 'Would create: ' : 'Created: ') + res.objects_created + ' object(s); ' + (this.dryRun ? 'would link: ' : 'linked: ') + res.linked +
            '; already linked: ' + res.already_linked + '; inherited columns: ' + res.inherited + (res.unlinked_inherited ? ' (' + res.unlinked_inherited + ' unlinked)' : '') + '.');
        if (this.dryRun) lines.push('Run with { dryRun: false } (or the fix script) to apply. Safe to re-run.');
        res.text = lines.join('\n');
        this.dryRun = false;
        return res;
    },

    _inheritedForInstance: function (instId) {
        var cols = {}, t = this.T.columns;
        if (!t) return {};
        var g = new GlideRecord(t);
        if (!g.isValid()) return {};
        g.addQuery('instance', instId);
        g.addQuery('item_category', 'columns');
        g.query();
        while (g.next()) cols[g.getValue('item_key')] = true;
        return this.inheritedColumns(this.parentsFromStore(instId), cols);
    },

    _count: function (o) { var n = 0; for (var k in o) n++; return n; },

    _clip: function (s, n) {
        s = s == null ? '' : String(s);
        return s.length > n ? s.substring(0, n) : s;
    },

    type: 'ConfigNowObjects'
};
