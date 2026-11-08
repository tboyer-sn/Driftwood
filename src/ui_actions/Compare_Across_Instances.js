/**
 * UI Action:  Compare across instances
 * Table:      x_2160899_driftw_0_tracked_object
 * Form button: true   Client: false   Action name: x_2160899_driftw_0_compare_across
 * Condition:  gs.hasRole('x_2160899_driftw_0.configuration_read')
 *
 * Opens Drift Report > All instances on this one object: every instance's
 * value side by side, differing fields highlighted, even when it is the same
 * everywhere.
 */
(function () {
    action.setRedirectURL('x_2160899_driftw_0_drift_report.do?category=' + encodeURIComponent(current.getValue('item_category')) +
        '&key=' + encodeURIComponent(current.getValue('item_key')));
})();
