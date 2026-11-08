/**
 * Scheduled Script Execution: Driftwood - Health check
 * Scope:   x_2160899_driftw_0
 * Run:     Daily, 03:30 (instance time zone), after collect, drift and purge
 *
 * Runs the Health self-check (Driftwood > Health) and logs the result: one
 * info line when everything is ok, a warning with each warn/fail check
 * otherwise. Read-only.
 */
(function () {
    var h = new ConfigNowHealth();
    var res = h.run();
    if (res.status == 'warn' || res.status == 'fail') gs.warn('[Driftwood] ' + h.summary(res));
    else gs.info('[Driftwood] ' + h.summary(res));
})();
