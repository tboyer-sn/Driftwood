/**
 * Scheduled Script Execution: Driftwood - Collect current instance
 * Scope:   x_2160899_driftw_0
 * Run:     Daily, 02:15 (instance time zone)
 * Run as:  Driftwood collector service account (role x_2160899_driftw_0.collector)
 *
 * Collects the current instance's settings and writes them to the CMDB.
 */
(function () {
    var collector = new ConfigNowCollector({ incremental: true });
    var snapshot = collector.collect();
    var result = new ConfigNowWriter().persist(snapshot, { trigger: 'job' });

    gs.info('[Driftwood] Collection complete for {0} in {1} ms. totals={2} warnings={3} run={4} changes={5}',
        snapshot.instance.instance_name,
        snapshot.duration_ms,
        JSON.stringify(result.totals),
        snapshot.warnings.length,
        result.run_id || '-',
        result.changes_logged || 0);

    for (var i = 0; i < snapshot.warnings.length; i++) {
        gs.warn('[Driftwood] {0}: {1}', snapshot.warnings[i].area, snapshot.warnings[i].message);
    }
})();
