/**
 * Scheduled Script Execution: Driftwood - Recompute drift
 * Scope:   x_2160899_driftw_0
 * Run:     Daily, 02:45 (instance time zone), after the daily collection
 *
 * Full pass over every tracked object (v0.6). Each collection or import
 * already recomputes the objects it touched; this catches everything else,
 * such as an instance's Environment being changed or an instance CI being
 * deleted. Change-only: on a quiet day it writes nothing.
 */
(function () {
    var res = new ConfigNowDrift().recompute();
    gs.info('[Driftwood] ' + res.text);
})();
