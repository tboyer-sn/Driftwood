/**
 * Scripted REST resource: POST /snapshot[?force=true][&allow_local=true]
 * Body: a snapshot JSON (driftwood.snapshot/0.1), as downloaded from
 * the Current Instance Settings page. Imports it as its own instance CI.
 * Requires x_2160899_driftw_0.configuration_admin (checked here as well).
 */
(function process(request, response) {
    if (!gs.hasRole('x_2160899_driftw_0.configuration_admin')) {
        response.setStatus(403);
        response.setBody({ error: 'Requires role x_2160899_driftw_0.configuration_admin' });
        return;
    }
    var snap;
    try {
        snap = request.body.data;
        if (!snap || typeof snap != 'object') snap = JSON.parse(request.body.dataString);
    } catch (e) {
        response.setStatus(400);
        response.setBody({ error: 'Body is not valid JSON' });
        return;
    }
    var qp = request.queryParams;
    var force = qp.force && String(qp.force[0]) == 'true';
    var allowLocal = qp.allow_local && String(qp.allow_local[0]) == 'true';
    try {
        var res = new ConfigNowImporter().importSnapshot(snap, { force: force, allowLocal: allowLocal });
        response.setStatus(200);
        response.setBody(res);
    } catch (e2) {
        response.setStatus(422);
        response.setBody({ error: String(e2 && e2.message ? e2.message : e2) });
    }
})(request, response);
