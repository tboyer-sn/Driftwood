/**
 * Scripted REST resource: GET /matrix[?instances=a,b,c][&categories=plugins,applications][&sys_ids=true][&keys=k1,k2]
 * keys (v0.6): only these item keys, returned even when the same everywhere
 * (the tracked object's "Compare across instances").
 * N-way comparison. instances: names or sys_ids (default: all instance CIs).
 * Columns come back in a fixed order (current instance first = baseline, then
 * <scope>.instance_order, then Environment, then name). Read-only.
 * Requires x_2160899_driftw_0.configuration_read (checked here as well).
 */
(function process(request, response) {
    if (!gs.hasRole('x_2160899_driftw_0.configuration_read')) {
        response.setStatus(403);
        response.setBody({ error: 'Requires role x_2160899_driftw_0.configuration_read' });
        return;
    }
    var q = request.queryParams;
    var refs = q.instances && q.instances.length && String(q.instances[0]) ? String(q.instances[0]).split(',') : [];
    var opts = {};
    if (q.sys_ids && q.sys_ids.length) opts.sysIds = String(q.sys_ids[0]) == 'true';
    if (q.categories && q.categories.length) opts.categories = String(q.categories[0]).split(',');
    if (q.keys && q.keys.length && String(q.keys[0])) opts.keys = [String(q.keys[0])]; // one key: keys may contain commas
    try {
        var result = new ConfigNowCompare({ secure: true }).compareMany(refs, opts);
        response.setStatus(200);
        response.setHeader('Cache-Control', 'no-store');
        response.setBody(result);
    } catch (e) {
        var msg = String(e && e.message ? e.message : e);
        if (msg.indexOf('Instance not found') == 0 || msg.indexOf('Need at least') == 0) { response.setStatus(400); response.setBody({ error: msg }); return; }
        gs.error('[Driftwood] GET /matrix failed: ' + msg);
        response.setStatus(500);
        response.setBody({ error: 'Comparison failed; the details are in the system log' });
    }
})(request, response);
