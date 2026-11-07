/**
 * Scripted REST API:  Driftwood   (API ID: driftwood)
 * Base path:          /api/x_2160899_driftw_0/driftwood
 * Resource:           GET /current
 * Requires authentication: true
 * ACLs / roles:       restrict to x_2160899_driftw_0.configuration_read (see README)
 *
 * Returns a live snapshot of the current instance's settings. Nothing is
 * written. Optional query params:
 *   categories=plugins,applications   limit the categories collected
 *
 * IMPORTANT: the collector uses GlideRecord, which does not enforce ACLs, so
 * this resource MUST be role-restricted. Secure-property hashes are removed
 * unless the caller has x_2160899_driftw_0.configuration_read_secure.
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
