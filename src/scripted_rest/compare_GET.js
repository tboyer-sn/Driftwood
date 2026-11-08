/**
 * Scripted REST resource: GET /compare?a=<instance>&b=<instance>[&categories=plugins,applications][&sys_ids=true]
 * a / b: instance CI sys_id or instance_name. Returns the drift result
 * (schema driftwood.compare/0.1). Read-only.
 * Requires x_2160899_driftw_0.configuration_read (checked here as well).
 */
(function process(request, response) {
    if (!gs.hasRole('x_2160899_driftw_0.configuration_read')) {
        response.setStatus(403);
        response.setBody({ error: 'Requires role x_2160899_driftw_0.configuration_read' });
        return;
    }
    var q = request.queryParams;
    var a = q.a ? String(q.a[0]) : '', b = q.b ? String(q.b[0]) : '';
    if (!a || !b) {
        response.setStatus(400);
        response.setBody({ error: 'Query parameters a and b (instance name or sys_id) are required' });
        return;
    }
    var opts = {};
    if (q.categories && q.categories.length) opts.categories = String(q.categories[0]).split(',');
    if (q.sys_ids && q.sys_ids.length) opts.sysIds = String(q.sys_ids[0]) == 'true';
    try {
        var result = new ConfigNowCompare().compare(a, b, opts);
        response.setStatus(200);
        response.setHeader('Cache-Control', 'no-store');
        response.setBody(result);
    } catch (e) {
        var msg = String(e && e.message ? e.message : e);
        response.setStatus(msg.indexOf('Instance not found') == 0 ? 404 : 500);
        response.setBody({ error: msg });
    }
})(request, response);
