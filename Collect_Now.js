/**
 * UI Action:  Collect now
 * Table:      x_2160899_driftw_0_cmdb_ci_sn_instance
 * Form button: true   Client: false   Action name: x_2160899_driftw_0_collect_now
 * Condition:
 *   gs.hasRole('x_2160899_driftw_0.configuration_admin') && current.instance_name == gs.getProperty('instance_name')
 *
 * POC collects only the instance the app runs on, so the button is shown only
 * on that instance's own CI.
 */
(function () {
    var snapshot = new ConfigNowCollector({ incremental: true }).collect();
    var result = new ConfigNowWriter().persist(snapshot);
    var t = result.totals;
    gs.addInfoMessage('Driftwood: ' + t.inserted + ' new, ' + t.updated + ' changed, ' +
        t.restored + ' restored, ' + t.removed + ' no longer present, ' + t.unchanged + ' unchanged (' +
        snapshot.duration_ms + ' ms)' + (result.run_id ? '. Run ' + result.run_id + ', ' + result.changes_logged + ' change(s) logged' +
        (result.baseline.length ? ', baseline for ' + result.baseline.join(', ') : '') : '') + '.');
    if (snapshot.warnings.length) {
        gs.addErrorMessage('Driftwood: ' + snapshot.warnings.length +
            ' collection warning(s) – see Collection summary.');
    }
    action.setRedirectURL(current);
})();
