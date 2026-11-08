/**
 * Scheduled Script Execution: Driftwood - Purge history
 * Scope:   x_2160899_driftw_0
 * Run:     Daily, 03:15 (instance time zone)
 *
 * Deletes collection runs, item changes and run snapshots older than the
 * retention period (instance CI "History retention (days)", else
 * x_2160899_driftw_0.retention_days, default 180). The latest run of each
 * instance is always kept; current tracked items are never touched.
 */
(function () {
    var res = new ConfigNowRetention().purge();
    gs.info('[Driftwood] History purge: {0} run(s), {1} change(s), {2} snapshot attachment(s) deleted across {3} instance(s).',
        res.runs, res.changes, res.attachments, res.instances.length);
})();
