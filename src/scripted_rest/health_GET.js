/**
 * Scripted REST resource: GET /health
 * Driftwood's read-only self-check (ConfigNowHealth): schema, roles, ACLs,
 * jobs, REST, fix scripts, cross-scope privileges, collection freshness,
 * tracked objects and drift, retention. status = the worst check
 * (ok | info | warn | fail). Always HTTP 200 when it ran; monitors read
 * result.status.
 * Requires x_2160899_driftw_0.configuration_admin (checked here as well).
 */
(function process(request, response) {
    if (!gs.hasRole('x_2160899_driftw_0.configuration_admin')) {
        response.setStatus(403);
        response.setBody({ error: 'Requires role x_2160899_driftw_0.configuration_admin' });
        return;
    }
    try {
        var res = new ConfigNowHealth().run();
        response.setStatus(200);
        response.setHeader('Cache-Control', 'no-store');
        response.setBody(res);
    } catch (e) {
        gs.error('[Driftwood] GET /health failed: ' + String(e && e.message ? e.message : e));
        response.setStatus(500);
        response.setBody({ error: 'Health check failed; the details are in the system log' });
    }
})(request, response);
