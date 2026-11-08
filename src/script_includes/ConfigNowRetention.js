/**
 * Script Include: ConfigNowRetention
 * Scope:          x_2160899_driftw_0  (Driftwood)
 * Accessible from: This application scope only
 *
 * Purges history (collection runs, their item changes and attached snapshots)
 * older than the retention period:
 *   - per instance: the instance CI's "History retention (days)" field, if set;
 *   - otherwise the global default (<scope>.retention_days, default 180).
 * The latest run of every instance is always kept, whatever its age.
 * Current tracked items are never touched – only history.
 *
 *   new ConfigNowRetention().purge();                 // delete
 *   new ConfigNowRetention().purge({ dryRun: true }); // count only
 */
var ConfigNowRetention = Class.create();
ConfigNowRetention.prototype = {

    initialize: function (options) {
        this.options = options || {};
        this.config = this.options.config || ConfigNowConfig.get();
        this.T = this.config.tables;
    },

    purge: function (opts) {
        opts = opts || {};
        var dry = !!opts.dryRun;
        var res = { dry_run: dry, instances: [], runs: 0, changes: 0, attachments: 0 };
        if (!this.T.run || !new GlideRecord(this.T.run).isValid()) return res;
        var now = String(new GlideDateTime().getValue());

        var inst = new GlideRecord(this.T.instance);
        inst.query();
        while (inst.next()) {
            var instId = inst.getUniqueValue();
            var own = inst.isValidField('retention_days') ? parseInt(String(inst.getValue('retention_days') || ''), 10) : NaN;
            var days = own > 0 ? own : this.config.retentionDays;
            var cutoff = this._shiftDays(now, -days);
            var latest = this._latestRun(instId);
            var r = { instance: String(inst.getValue('instance_name') || ''), retention_days: days, cutoff: cutoff, runs: 0, changes: 0, attachments: 0 };

            var run = new GlideRecord(this.T.run);
            run.addQuery('instance', instId);
            run.addQuery('collected_at', '<', cutoff);
            run.query();
            while (run.next()) {
                var rid = run.getUniqueValue();
                if (rid == latest) continue;
                r.changes += this._deleteWhere(this.T.change, 'run', rid, dry);
                r.attachments += this._deleteAttachments(rid, dry);
                if (!dry) { var del = new GlideRecord(this.T.run); if (del.get(rid)) del.deleteRecord(); }
                r.runs++;
            }
            // change rows left without a run (e.g. a run deleted by hand)
            if (this.T.change && new GlideRecord(this.T.change).isValid()) {
                var orphan = new GlideRecord(this.T.change);
                orphan.addQuery('instance', instId);
                orphan.addQuery('changed_on', '<', cutoff);
                orphan.query();
                while (orphan.next()) {
                    if (!dry) orphan.deleteRecord();
                    r.changes++;
                }
            }
            res.runs += r.runs; res.changes += r.changes; res.attachments += r.attachments;
            res.instances.push(r);
        }
        return res;
    },

    _latestRun: function (instId) {
        var gr = new GlideRecord(this.T.run);
        gr.addQuery('instance', instId);
        gr.orderByDesc('collected_at');
        gr.setLimit(1);
        gr.query();
        return gr.next() ? gr.getUniqueValue() : '';
    },

    _deleteWhere: function (table, field, value, dry) {
        if (!table || !new GlideRecord(table).isValid()) return 0;
        var gr = new GlideRecord(table), n = 0;
        gr.addQuery(field, value);
        gr.query();
        while (gr.next()) { if (!dry) gr.deleteRecord(); n++; }
        return n;
    },

    _deleteAttachments: function (runId, dry) {
        var gr = new GlideRecord('sys_attachment'), n = 0;
        if (!gr.isValid()) return 0;
        gr.addQuery('table_name', this.T.run);
        gr.addQuery('table_sys_id', runId);
        gr.query();
        while (gr.next()) {
            if (!dry) {
                if (typeof GlideSysAttachment != 'undefined') new GlideSysAttachment().deleteAttachment(gr.getUniqueValue());
                else gr.deleteRecord();
            }
            n++;
        }
        return n;
    },

    /** 'YYYY-MM-DD HH:MM:SS' (UTC) shifted by whole days, without GlideDateTime maths. */
    _shiftDays: function (ts, days) {
        var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(ts || ''));
        if (!m) return ts;
        var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) + days * 86400000);
        var p = function (n) { return (n < 10 ? '0' : '') + n; };
        return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' +
            p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
    },

    type: 'ConfigNowRetention'
};
