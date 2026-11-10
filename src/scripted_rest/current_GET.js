/**
 * Scripted REST API:  Driftwood   (API ID: driftwood)
 * Base path:          /api/x_2160899_driftw_0/driftwood
 * Resource:           GET /current
 * Requires authentication: true
 * ACLs / roles:       restrict to x_2160899_driftw_0.configuration_read (see README)
 *
 * Returns this instance's settings as a snapshot. Nothing is written.
 * Optional query params:
 *   categories=plugins,applications   limit the categories
 *
 * Security review S1:
 *   - x_2160899_driftw_0.configuration_admin gets a LIVE read: the collector
 *     reads platform tables with GlideRecord (no ACLs), so only admins may
 *     trigger it. Secure-property hashes are removed unless the caller also
 *     has x_2160899_driftw_0.configuration_read_secure.
 *   - Everyone else with configuration_read gets the STORED observations of
 *     this instance, read through GlideRecordSecure: their own ACLs decide
 *     which rows and fields they see (snapshot.stored = true).
 *
 * This endpoint is also the future contract for cross-instance collection:
 * a central instance calls GET /current on each Dev/Test/Sub-Prod/Prod node.
 */
(function process(request, response) {
    // Defence in depth: enforce the role here as well as via REST ACLs, because
    // the collector reads system tables with GlideRecord (no ACL checks).
    if (!gs.hasRole('x_2160899_driftw_0.configuration_read')) {
        response.setStatus(403);
        response.setBody({ error: 'Requires role x_2160899_driftw_0.configuration_read' });
        return;
    }
    var opts = {};
    var cats = request.queryParams.categories;
    if (cats && cats.length) opts.categories = String(cats[0]).split(',');

    if (!gs.hasRole('x_2160899_driftw_0.configuration_admin')) {
        var stored = new ConfigNowCompare({ secure: true }).storedSnapshot(opts);
        if (!stored) {
            response.setStatus(404);
            response.setBody({ error: 'This instance has not been collected yet' });
            return;
        }
        response.setStatus(200);
        response.setHeader('Cache-Control', 'no-store');
        response.setBody(stored);
        return;
    }

    var snapshot = new ConfigNowCollector(opts).collect();

    if (!gs.hasRole('x_2160899_driftw_0.configuration_read_secure')) {
        var props = snapshot.categories.system_properties;
        if (props) {
            for (var i = 0; i < props.items.length; i++) {
                if (props.items[i].secure) props.items[i].secure_value_hash = '(restricted)';
            }
        }
    }
    response.setStatus(200);
    response.setHeader('Cache-Control', 'no-store');
    response.setBody(snapshot);
})(request, response);
