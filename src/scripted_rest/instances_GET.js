/**
 * Scripted REST resource: GET /instances   (API driftwood)
 * Lists the instance CIs available for comparison (local and imported).
 * Requires x_2160899_driftw_0.configuration_read (checked here as well).
 */
(function process(request, response) {
    if (!gs.hasRole('x_2160899_driftw_0.configuration_read')) {
        response.setStatus(403);
        response.setBody({ error: 'Requires role x_2160899_driftw_0.configuration_read' });
        return;
    }
    response.setStatus(200);
    response.setHeader('Cache-Control', 'no-store');
    response.setBody({ local: gs.getProperty('instance_name'), instances: new ConfigNowCompare({ secure: true }).listInstances() });
})(request, response);
