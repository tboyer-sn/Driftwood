/**
 * Scripted REST resource: POST /collect
 * Collects this instance's configuration and saves it (same as the Collect now
 * UI action on the instance CI). Used by the Current Instance Settings page.
 * Requires x_2160899_driftw_0.configuration_admin (checked here as well).
 */
(function process(request, response) {
    if (!gs.hasRole('x_2160899_driftw_0.configuration_admin')) {
        response.setStatus(403);
        response.setBody({ error: 'Requires role x_2160899_driftw_0.configuration_admin' });
        return;
    }
    try {
        var snapshot = new ConfigNowCollector({ incremental: true }).collect();
        var res = new ConfigNowWriter().persist(snapshot);
        response.setStatus(200);
        response.setBody({
            instance_name: snapshot.instance ? snapshot.instance.instance_name : '',
            collected_at: snapshot.collected_at,
            duration_ms: snapshot.duration_ms,
            totals: res.totals,
            run_id: res.run_id || '',
            changes_logged: res.changes_logged || 0,
            baseline: res.baseline || [],
            warnings: snapshot.warnings ? snapshot.warnings.length : 0
        });
    } catch (e) {
        response.setStatus(500);
        response.setBody({ error: String(e && e.message ? e.message : e) });
    }
})(request, response);
