/**
 * Script Include: ConfigNowWriter
 * Scope:          x_2160899_driftw_0  (Driftwood)
 * Accessible from: This application scope only
 *
 * Persists a ConfigNowCollector snapshot into the CMDB:
 *   - one x_2160899_driftw_0_cmdb_ci_sn_instance CI (coalesce: instance_name)
 *   - one tracked item per item in the routed table (CI subclass or plain)
 *     (coalesce: instance + item_category + item_key)
 *
 * Column names avoid cmdb_ci's own `category` and `attributes` fields,
 * which other CMDB tooling uses.
 *
 * Writes are change-only: a record is updated only when its value_hash or
 * presence changes, so daily runs do not generate audit noise. Items that
 * disappear are kept with present=false (the start of drift history).
 *
 * POC note: writes use GlideRecord directly, not the IRE
 * (IdentificationEngineScriptableApi). Moving to IRE + identification rules is
 * a post-POC step once the class model is final.
 */
var ConfigNowWriter = Class.create();
ConfigNowWriter.prototype = {

    initialize: function (options) {
        this.options = options || {};
        this.config = this.options.config || ConfigNowConfig.get();
        this.T = this.config.tables;
    },

    /**
     * options.timestamp – use this GlideDateTime value (UTC 'YYYY-MM-DD HH:MM:SS')
     *                     instead of now; ConfigNowImporter passes the
     *                     snapshot's own collected_at
     * options.source    – 'local' (default) or 'import', recorded in the summary
     *
     * History (v0.5, when the run/change tables exist):
     *   - one collection_run row per call (run_id, source, mode, totals, ...),
     *     with the snapshot JSON attached unless config.keepSnapshots is false
     *   - one item_change row per added / changed / removed / restored item,
     *     except for a category's first (baseline) load on an instance
     * A category marked incremental (snapshot.categories[cat].incremental) only
     * contains what changed, so missing items are NOT marked removed.
     *
     * Tracked objects (v0.6, when tracked_object exists): every observation
     * written or found without one is linked to its object (ConfigNowObjects),
     * created on first sight; inherited columns (Z12) get none. The objects
     * touched by this run are in result.objects.touched / this.touchedObjects,
     * for the drift recompute.
     */
    persist: function (snapshot, options) {
        options = options || {};
        var now = String(options.timestamp || new GlideDateTime().getValue());
        var persistedAt = String(new GlideDateTime().getValue());
        var result = { instance_sys_id: '', run_id: '', changes_logged: 0, baseline: [], categories: {},
            totals: { inserted: 0, updated: 0, unchanged: 0, removed: 0, restored: 0 }, objects: { created: 0, linked: 0, touched: 0 } };

        var instId = this._upsertInstance(snapshot, now);
        result.instance_sys_id = instId;
        var inst = snapshot.instance || {};
        var run = this._startRun(instId, snapshot, options, now, persistedAt);
        var ctx = { run: run, instId: instId, now: now, base: this._baseUrl(inst.instance_url), changes: 0,
            objects: this._objects(), inherited: {}, linked: 0 };
        if (ctx.objects && snapshot.categories && snapshot.categories.columns) {
            var tc = snapshot.categories.tables;
            var parents = tc && tc.items ? ctx.objects.parentsFromItems(tc.items) : ctx.objects.parentsFromStore(instId);
            var colKeys = {}, ci = snapshot.categories.columns.items || [];
            for (var q = 0; q < ci.length; q++) colKeys[ci[q].key] = true;
            ctx.inherited = ctx.objects.inheritedColumns(parents, colKeys);
        }

        var incremental = false, watermarks = {}, cats = [];
        for (var cat in snapshot.categories) {
            var table = this.T[cat];
            if (!table) continue;
            var meta = snapshot.categories[cat];
            if (meta.incremental) incremental = true;
            if (meta.watermark) watermarks[cat] = meta.watermark;
            cats.push(cat);
            var r = this._syncCategory(instId, cat, table, meta.items, now, ctx, !!meta.incremental);
            if (r.baseline) { result.baseline.push(cat); delete r.baseline; }
            result.categories[cat] = r;
            for (var k in r) result.totals[k] += r[k];
        }
        result.changes_logged = ctx.changes;
        this.touchedObjects = ctx.objects ? ctx.objects.touchedIds() : [];
        if (ctx.objects) result.objects = { created: ctx.objects.created, linked: ctx.linked, touched: this.touchedObjects.length };

        if (run) {
            result.run_id = run.run_id;
            var rg = new GlideRecord(this.T.run);
            if (rg.get(run.sys_id)) {
                rg.setValue('mode', incremental ? 'incremental' : 'full');
                rg.setValue('categories', this._clip(cats.join(','), 1000));
                rg.setValue('baseline_categories', this._clip(result.baseline.join(','), 1000));
                rg.setValue('totals', this._clip(JSON.stringify(result.totals), 1000));
                rg.setValue('changes_logged', ctx.changes);
                rg.setValue('watermarks', this._clip(JSON.stringify(watermarks), 1000));
                var attached = false;
                if (this.config.keepSnapshots && typeof GlideSysAttachment != 'undefined') {
                    try {
                        new GlideSysAttachment().write(rg, 'snapshot_' + run.run_id + '.json', 'application/json', JSON.stringify(snapshot));
                        attached = true;
                    } catch (e) { gs.warn('[Driftwood] Snapshot not attached to run ' + run.run_id + ': ' + e); }
                }
                rg.setValue('snapshot_attached', attached);
                rg.update();
            }
        }

        // Final status on the instance CI
        var gr = new GlideRecord(this.T.instance);
        var prevCats = null;
        if (gr.get(instId)) {
            try { prevCats = JSON.parse(gr.getValue('collection_summary') || '{}').categories || null; } catch (e0) { prevCats = null; }
            gr.setValue('collection_status', snapshot.warnings && snapshot.warnings.length ? 'completed_with_warnings' : 'completed');
            gr.setValue('collection_summary', this._clip(JSON.stringify({
                source: options.source || 'local',
                collector_scope: snapshot.collector_scope || '',
                categories: (function (c) { var k = [], x; for (x in c) k.push(x); return k; })(snapshot.categories || {}),
                collected_at: snapshot.collected_at,
                collector_version: snapshot.collector_version,
                duration_ms: snapshot.duration_ms,
                run_id: result.run_id,
                totals: result.totals,
                warnings: snapshot.warnings
            }), 4000));
            gr.update();
        }

        // Stored drift (v0.6), after the summary above (it says which
        // categories this instance reports): the touched objects, plus every
        // object of a category this instance reports for the first time or
        // no longer reports (its instance count changed). Never fails the
        // save; the daily pass catches up.
        if (ctx.objects && options.drift !== false && typeof ConfigNowDrift != 'undefined') {
            var whole = {}, wl = [], b;
            for (b = 0; b < result.baseline.length; b++) whole[result.baseline[b]] = true;
            if (prevCats) {
                var now2 = {}, p2;
                for (b = 0; b < cats.length; b++) now2[cats[b]] = true;
                for (p2 = 0; p2 < prevCats.length; p2++) if (!now2[prevCats[p2]]) whole[prevCats[p2]] = true;
                for (b = 0; b < cats.length; b++) { var was = false; for (p2 = 0; p2 < prevCats.length; p2++) if (prevCats[p2] == cats[b]) was = true; if (!was) whole[cats[b]] = true; }
            }
            for (var wk in whole) wl.push(wk);
            if (this.touchedObjects.length || wl.length) {
                try {
                    var dr = new ConfigNowDrift(this.config).recompute({ objectIds: this.touchedObjects, categories: wl });
                    result.drift = { evaluated: dr.evaluated, changed: dr.changed, status_changed: dr.status_changed, ms: dr.ms };
                } catch (e) {
                    result.drift = { error: String(e && e.message ? e.message : e) };
                    gs.warn('[Driftwood] Drift recompute after save failed (the daily pass will catch up): ' + result.drift.error);
                }
            }
        }
        return result;
    },

    /** ConfigNowObjects when the v0.6 schema is installed, else null. */
    _objects: function () {
        if (this.options.objects === false) return null;
        var o = this.options.objects || (typeof ConfigNowObjects != 'undefined' ? new ConfigNowObjects(this.config) : null);
        return o && o.available() ? o : null;
    },

    /** Object for an observation ('' = none: no v0.6 schema, or an inherited column). */
    _objectFor: function (ctx, cat, key, name) {
        if (!ctx.objects) return '';
        if (cat == 'columns' && ctx.inherited[key]) return '';
        return ctx.objects.resolve(cat, key, name || key, ctx.now);
    },

    /** Creates the collection_run row (null if the history tables aren't installed). */
    _startRun: function (instId, snapshot, options, now, persistedAt) {
        if (!this.T.run) return null;
        var rg = new GlideRecord(this.T.run);
        if (!rg.isValid()) return null;
        var inst = snapshot.instance || {};
        var source = options.source || 'local';
        var digits = function (t) { return String(t || '').replace(/[^0-9]/g, ''); };
        var runId = (inst.instance_name || 'instance') + '-' + digits(now) + (source == 'import' ? '-import' : '') + '-' + digits(persistedAt);
        rg.initialize();
        rg.setValue('run_id', runId);
        rg.setValue('instance', instId);
        rg.setValue('source', source);
        // Security review S9: how the run was started (who: sys_created_by)
        if (rg.isValidField('run_trigger')) rg.setValue('run_trigger', options.trigger || (source == 'import' ? 'import' : 'script'));
        rg.setValue('mode', 'full');
        rg.setValue('collected_at', now);
        rg.setValue('persisted_at', persistedAt);
        rg.setValue('collector_version', snapshot.collector_version || '');
        rg.setValue('collector_scope', snapshot.collector_scope || '');
        rg.setValue('duration_ms', snapshot.duration_ms || 0);
        var w = snapshot.warnings || [];
        rg.setValue('warnings_count', w.length);
        rg.setValue('warnings', this._clip(JSON.stringify(w), 4000));
        var id = rg.insert();
        return id ? { sys_id: id, run_id: runId } : null;
    },

    /** https://host/ – the base for links to an item's source record. */
    _baseUrl: function (url) {
        url = String(url || '');
        if (!/^https?:\/\//i.test(url)) return '';
        return url.charAt(url.length - 1) == '/' ? url : url + '/';
    },

    _sourceUrl: function (base, it) {
        if (!base || !this._table(it.source_table) || !this._sysId(it.source_sys_id)) return '';
        return base + it.source_table + '.do?sys_id=' + it.source_sys_id;
    },

    /* Security review S7: imported snapshots are not trusted. A source table
       name and sys_id are kept only in their platform form; anything else is
       stored empty, so no link is built from it. */
    _table: function (t) { return /^[a-z0-9_]{1,80}$/.test(String(t || '')) ? String(t) : ''; },
    // sys_ids are usually 32 hex characters, but not always (global scope: 'global')
    _sysId: function (id) { return /^[0-9A-Za-z_]{1,32}$/.test(String(id || '')) ? String(id) : ''; },

    _upsertInstance: function (snapshot, now) {
        var inst = snapshot.instance || {};
        var name = inst.instance_name || gs.getProperty('instance_name');
        var gr = new GlideRecord(this.T.instance);
        gr.addQuery('instance_name', name);
        gr.setLimit(1);
        gr.query();
        var isNew = !gr.next();
        if (isNew) gr.initialize();

        gr.setValue('name', name);
        gr.setValue('instance_name', name);
        gr.setValue('instance_id', inst.instance_id || '');
        gr.setValue('instance_url', inst.instance_url || '');
        gr.setValue('build_name', inst.build_name || '');
        gr.setValue('build_tag', inst.build_tag || '');
        gr.setValue('build_date', inst.build_date || '');
        gr.setValue('war', inst.war || '');
        gr.setValue('family', inst.family || '');
        gr.setValue('patch', inst.patch || '');
        // Inherited fields (cmdb_ci_appl / cmdb_ci)
        gr.setValue('version', this._clip([inst.family, inst.patch].join(' ').replace(/^\s+|\s+$/g, ''), 100));
        gr.setValue('fqdn', this._host(inst.instance_url));
        gr.setValue('production_flag', inst.production_flag ? 'true' : 'false');
        // "environment" (inherited from cmdb_ci, CSDM) is admin-maintained –
        // intentionally never written here.
        gr.setValue('timezone', inst.timezone || '');
        gr.setValue('node_count', inst.node_count || 0);
        gr.setValue('nodes', this._clip(JSON.stringify(inst.nodes || []), 4000));
        gr.setValue('last_collected', now);
        gr.setValue('collection_status', 'running');
        return isNew ? gr.insert() : (gr.update(), gr.getUniqueValue());
    },

    _syncCategory: function (instId, cat, table, items, now, ctx, incremental) {
        ctx = ctx || { run: null, changes: 0, base: '' };
        var r = { inserted: 0, updated: 0, unchanged: 0, removed: 0, restored: 0 };
        var hasLink = this._hasFields(table, ['source_table', 'source_url']);
        var hasObj = !!(ctx.objects && this._hasFields(table, ['object']));

        // Load existing state (sys_id, hash, presence, link) for this instance/category
        var existing = {}, nExisting = 0;
        var ex = new GlideRecord(table);
        ex.addQuery('instance', instId);
        ex.addQuery('item_category', cat);
        ex.query();
        while (ex.next()) {
            nExisting++;
            existing[ex.getValue('item_key')] = {
                sys_id: ex.getUniqueValue(),
                hash: ex.getValue('value_hash'),
                present: ex.getValue('present') == '1' || ex.getValue('present') == 'true',
                url: hasLink ? (ex.getValue('source_url') || '') : '',
                obj: hasObj ? (ex.getValue('object') || '') : ''
            };
        }
        // A category's first load on this instance is its baseline: no change rows
        var log = !!(ctx.run && this.config.logChanges && nExisting > 0 && this._hasFields(this.T.change, ['run']));
        if (ctx.run && nExisting == 0 && items.length) r.baseline = true;

        var seen = {};
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (seen[it.key]) continue; // duplicate key in source – first wins
            seen[it.key] = true;
            var cur = existing[it.key];
            var url = this._sourceUrl(ctx.base, it);

            if (!cur) {
                var ins = new GlideRecord(table);
                ins.initialize();
                ins.setValue('instance', instId);
                ins.setValue('item_category', cat);
                ins.setValue('item_key', it.key);
                ins.setValue('first_seen', now);
                this._apply(ins, it, now, hasLink, url);
                var nob = hasObj ? this._objectFor(ctx, cat, it.key, it.name) : '';
                if (nob) { ins.setValue('object', nob); ctx.linked++; ctx.objects.touch(nob); }
                ins.insert();
                r.inserted++;
                if (log) this._logChange(ctx, cat, it.key, it.name, 'added', null, this._data(it), [], url);
                continue;
            }
            if (cur.hash == it.hash && cur.present) {
                r.unchanged++;
                // one-off backfill of the source link and the object (not a change)
                var fixLink = hasLink && url && !cur.url;
                var want = hasObj ? this._objectFor(ctx, cat, it.key, it.name) : '';
                var fixObj = hasObj && want != cur.obj;
                if (fixLink || fixObj) {
                    var bf = new GlideRecord(table);
                    if (bf.get(cur.sys_id)) {
                        if (fixLink) { bf.setValue('source_table', this._table(it.source_table)); bf.setValue('source_url', url); }
                        if (fixObj) { bf.setValue('object', want); if (want) { ctx.linked++; ctx.objects.touch(want); } }
                        bf.update();
                    }
                }
                continue;
            }
            var up = new GlideRecord(table);
            if (up.get(cur.sys_id)) {
                var before = log ? this._recordData(up) : null;
                this._apply(up, it, now, hasLink, url);
                if (hasObj) {
                    var uob = this._objectFor(ctx, cat, it.key, it.name);
                    if (uob != cur.obj) { up.setValue('object', uob); if (uob) ctx.linked++; }
                    if (uob) ctx.objects.touch(uob);
                }
                up.update();
                if (!cur.present) r.restored++; else r.updated++;
                if (log) {
                    var after = this._data(it);
                    this._logChange(ctx, cat, it.key, it.name, cur.present ? 'changed' : 'restored', before, after,
                        cur.present ? this._changedFields(before, after) : [], url);
                }
            }
        }

        // Anything previously present but not seen this run -> present=false
        // (not for incremental categories: they only contain what changed)
        if (!incremental) {
            for (var key in existing) {
                if (seen[key] || !existing[key].present) continue;
                var gone = new GlideRecord(table);
                if (gone.get(existing[key].sys_id)) {
                    var old = log ? this._recordData(gone) : null;
                    gone.setValue('present', false);
                    gone.setValue('last_changed', now);
                    gone.update();
                    if (hasObj && existing[key].obj) ctx.objects.touch(existing[key].obj);
                    r.removed++;
                    if (log) this._logChange(ctx, cat, key, gone.getValue('name'), 'removed', old, null, [], existing[key].url);
                }
            }
        }
        return r;
    },

    _apply: function (gr, it, now, hasLink, url) {
        gr.setValue('name', this._clip(it.name, 255));
        gr.setValue('item_value', it.value);
        gr.setValue('item_version', it.version);
        gr.setValue('item_state', it.state);
        gr.setValue('value_hash', it.hash);
        gr.setValue('item_attributes', this._clip(JSON.stringify(it.attributes || {}), 4000));
        gr.setValue('runtime', this._clip(JSON.stringify(it.runtime || {}), 4000));
        gr.setValue('source_sys_id', this._sysId(it.source_sys_id));
        if (hasLink) {
            gr.setValue('source_table', this._table(it.source_table));
            gr.setValue('source_url', url || '');
        }
        gr.setValue('is_secure', it.secure ? true : false);
        gr.setValue('secure_value_hash', it.secure_value_hash || '');
        gr.setValue('present', true);
        gr.setValue('last_changed', now);
    },

    /* ---- history helpers ---- */

    _data: function (it) {
        return { value: it.value || '', version: it.version || '', state: it.state || '', attributes: it.attributes || {} };
    },

    _recordData: function (gr) {
        var a = {};
        try { a = JSON.parse(gr.getValue('item_attributes') || '{}'); } catch (e) { a = {}; }
        return { value: gr.getValue('item_value') || '', version: gr.getValue('item_version') || '', state: gr.getValue('item_state') || '', attributes: a };
    },

    /** Fields that differ between two _data objects (one-sided attributes count here). */
    _changedFields: function (a, b) {
        var f = [];
        if (!a || !b) return f;
        if (a.value != b.value) f.push('value');
        if (a.version != b.version) f.push('version');
        if (a.state != b.state) f.push('state');
        var seen = {}, k;
        for (k in a.attributes) seen[k] = true;
        for (k in b.attributes) seen[k] = true;
        for (k in seen) if (JSON.stringify(a.attributes[k]) != JSON.stringify(b.attributes[k])) f.push('attributes.' + k);
        return f;
    },

    _logChange: function (ctx, cat, key, name, type, before, after, fields, url) {
        var c = new GlideRecord(this.T.change);
        c.initialize();
        c.setValue('run', ctx.run.sys_id);
        c.setValue('instance', ctx.instId);
        c.setValue('item_category', cat);
        c.setValue('item_key', this._clip(key, 255));
        c.setValue('item_name', this._clip(name || key, 255));
        c.setValue('change_type', type);
        c.setValue('changed_fields', this._clip((fields || []).join(', '), 1000));
        c.setValue('old_data', before ? this._clip(JSON.stringify(before), 4000) : '');
        c.setValue('new_data', after ? this._clip(JSON.stringify(after), 4000) : '');
        c.setValue('changed_on', ctx.now);
        if (url) c.setValue('source_url', url);
        var cob = ctx.objects && !(cat == 'columns' && ctx.inherited[key]) ? ctx.objects.resolve(cat, key, name || key, ctx.now) : '';
        if (cob && this._hasFields(this.T.change, ['object'])) c.setValue('object', cob);
        if (c.insert()) ctx.changes++;
    },

    /** Do all these fields exist on the table? (older schemas lack the v0.5 columns) */
    _hasFields: function (table, fields) {
        if (!table) return false;
        if (!this._fieldCache) this._fieldCache = {};
        var k = table + '|' + fields.join(',');
        if (this._fieldCache.hasOwnProperty(k)) return this._fieldCache[k];
        var gr = new GlideRecord(table), ok = gr.isValid();
        for (var i = 0; ok && i < fields.length; i++) if (!gr.isValidField(fields[i])) ok = false;
        this._fieldCache[k] = ok;
        return ok;
    },

    _host: function (url) {
        var m = /^[a-z]+:\/\/([^\/:]+)/i.exec(url || '');
        return m ? m[1] : '';
    },

    _clip: function (s, n) {
        s = s == null ? '' : String(s);
        return s.length > n ? s.substring(0, n) : s;
    },

    type: 'ConfigNowWriter'
};
