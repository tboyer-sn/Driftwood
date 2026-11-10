/**
 * Script Include: ConfigNowConfig
 * Scope:          x_2160899_driftw_0  (Driftwood)
 * Accessible from: This application scope only
 *
 * Central configuration for the POC. Defaults live here; each value can be
 * overridden with an application system property (see README "Properties").
 *
 * POC note: the v4.0 design puts tracked-table configuration in
 * sn_cmdb_table_config. For the POC that table is NOT used yet – the same
 * knobs are exposed as properties so the collector can be proven first.
 */
var ConfigNowConfig = Class.create();

ConfigNowConfig.SCOPE = 'x_2160899_driftw_0';
ConfigNowConfig.COLLECTOR_VERSION = '0.6.0-dev';

/**
 * Data access (security review S3): every read made on behalf of a person
 * goes through GlideRecordSecure, so Driftwood's ACLs (rows and fields) apply.
 * secure = false is for system work only, and each such caller says why:
 * the collector reading platform tables (a least-privilege account can't read
 * them through ACLs; dropped rows would look like removals), the writer, the
 * drift engine, retention, migration and Health (an admin-only diagnostic).
 */
ConfigNowConfig.record = function (table, secure) {
    return secure ? new GlideRecordSecure(table) : new GlideRecord(table);
};

ConfigNowConfig.DEFAULTS = {
    /* Logical table names -> physical names in the scoped app.
       A table created as "cmdb_ci_sn_instance" inside scope x_2160899_driftw_0 is
       stored as "x_2160899_driftw_0_cmdb_ci_sn_instance". Adjust if your scope differs. */
    tables: {
        instance:           'x_2160899_driftw_0_cmdb_ci_sn_instance',
        tracked:            'x_2160899_driftw_0_cmdb_ci_sn_tracked_table',
        plugins:            'x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin',
        applications:       'x_2160899_driftw_0_cmdb_ci_sn_tracked_application',
        mid_servers:        'x_2160899_driftw_0_cmdb_ci_sn_tracked_mid_server',
        system_properties:  'x_2160899_driftw_0_cmdb_ci_sn_tracked_property',
        clone_preservers:   'x_2160899_driftw_0_cmdb_ci_sn_tracked_clone_rule',
        clone_exclusions:   'x_2160899_driftw_0_cmdb_ci_sn_tracked_clone_rule',
        tables:             'x_2160899_driftw_0_tracked_item',
        columns:            'x_2160899_driftw_0_tracked_item',
        update_sets:        'x_2160899_driftw_0_tracked_item',
        /* history (v0.5) */
        run:                'x_2160899_driftw_0_collection_run',
        change:             'x_2160899_driftw_0_item_change',
        object:             'x_2160899_driftw_0_tracked_object', // v0.6: one row per category + key across instances
        /* admin list of extra / excluded tables for the "tables" category */
        tableConfig:        'x_2160899_driftw_0_sn_cmdb_table_config'
    },
    /* Plain (non-CMDB) storage option – same columns as the tracked CI parent,
       one table for all categories. Route a category here with the
       <scope>.table.<category> property. */
    plainTable: 'x_2160899_driftw_0_tracked_item',

    /* Categories collected, in report order. */
    categories: ['plugins', 'applications', 'mid_servers', 'system_properties',
                 'clone_preservers', 'clone_exclusions', 'tables', 'columns', 'update_sets'],

    /* Update sets (v0.5): local sys_update_set + retrieved sys_remote_update_set,
       one item per ORIGINATING set (a set built on Dev and committed on Test has
       the same key on both). The first run collects all; later runs collected
       through the writer only read sets changed since the last run's watermark
       (minus updateSetsOverlapMinutes) plus every open set, and a full sweep
       runs every updateSetsFullDays days so deleted sets are noticed. */
    updateSetsFullDays: 7,
    updateSetsOverlapMinutes: 60,
    maxUpdateSets: 20000,

    /* History (v0.5): change log + snapshot attachment per run; retention in
       days (global property <scope>.retention_days, or the instance CI's
       "History retention (days)" field, which wins). The latest run per
       instance is always kept. */
    logChanges: true,
    keepSnapshots: true,
    retentionDays: 180,

    /* "tables" category: record counts + column fingerprint per table.
       Tracked = curatedTables + (autoCustomTables ? every x_/u_ table : none)
                 + active rows in tableConfig, minus inactive rows in tableConfig.
       The app's own tables and remote (scriptable) tables are never auto-added. */
    curatedTables: [
        'sys_script', 'sys_script_include', 'sys_script_client', 'sys_script_fix',
        'sys_ui_policy', 'sys_ui_policy_action', 'sys_ui_action', 'sys_ui_page', 'sys_ui_script',
        'sys_security_acl', 'sys_user_role', 'sys_user_role_contains',
        'sys_dictionary', 'sys_db_object', 'sys_choice', 'sys_properties',
        'sysauto_script', 'sys_hub_flow', 'sys_hub_action_type_definition', 'wf_workflow',
        'sys_rest_message', 'sys_soap_message', 'sys_ws_definition', 'sys_ws_operation',
        'sysevent_email_action', 'sysevent_script_action', 'sys_transform_map', 'sys_data_source',
        'sp_widget', 'sp_page', 'sys_app_application', 'sys_app_module', 'sys_report',
        'sys_app', 'sys_store_app'
    ],
    autoCustomTables: true,
    /* Never auto-discover tables with these prefixes (platform-generated).
       u_cmdb_qb_result_<hash>: one table per CMDB Query Builder result. */
    autoExcludePrefixes: ['u_cmdb_qb_result_'],
    maxAutoTables: 500,
    /* "Customer" rows of a metadata table, in two counts (finding d27):
       customer_scoped  – rows in an x_ application scope (exact). The app's
                          own scope is always excluded.
       customer_global  – rows in the Global package NOT created by platform or
                          ServiceNow accounts. A HEURISTIC: plugin activations
                          run as admin and some ServiceNow staff accounts still
                          count, so treat it as an estimate.
       Override with <scope>.customer_scoped_query / customer_global_query. */
    customerScopedQuery: 'sys_scope.scopeSTARTSWITHx_',
    customerGlobalQuery: 'sys_package=global^sys_created_byNOT INsystem,maint,glide.maint,guest^sys_created_byNOT LIKE@snc^sys_created_byNOT LIKE.maint',

    /* Option 2 (prepared, off by default): count records whose current version
       came from a customer update set (sys_update_version). Precise but heavier;
       validate with diag_customer_updates.js first, then turn on with
       <scope>.customer_history = true. */
    customerHistory: false,
    customerHistorySources: ['sys_update_set', 'sys_remote_update_set'],

    includeInactivePlugins: false,

    /* System properties to report. Missing ones are reported as "not_set". */
    trackedProperties: [
        
        'glide.servlet.uri',
        'glide.sys.default.tz',
        'glide.sys.date_format',
        'glide.sys.time_format',
        'glide.email.smtp.active',
        'glide.email.read.active',
        'glide.email.test.user',
        'glide.ui.session_timeout',
        'glide.ui.polaris.experience',
        'glide.security.use_csrf_token',
        'glide.login.no_blank_password',
        'glide.authenticate.multifactor',
        'glide.authenticate.sso.redirect.idp',
        'glide.ui.escape_text',
        'glide.script.use.sandbox',
        'glide.basicauth.required.scriptedprocessor',
        'glide.db.max_view_records'
    ],
    /* Prefix patterns, e.g. ['glide.email.']. Keep these narrow. */
    trackedPropertyPrefixes: [],

    /* Secure property handling: 'hash' stores a salted SHA-256 so drift can be
       detected without storing the secret; 'omit' stores nothing. */
    secureValueMode: 'hash',
    secureHashSalt: 'cfgnow-poc',

    maxRowsPerCategory: 5000,
    maxValueLength: 4000,

    /* Comparison: "category|item_key" pairs that are EXPECTED to differ between
       instances and are counted as ignored rather than drift. Extend with the
       <scope>.compare_ignore property (comma-separated). */
    compareIgnore: [
        'system_properties|glide.servlet.uri'
    ],
    /* Attribute keys never treated as drift (still shown). vendor is ''
       vs 'ServiceNow' for the same app across releases. */
    compareIgnoreAttributes: ['vendor', 'tables|source'],
    /* Instance column order for comparisons (after the current instance, which
       is always first): explicit instance names from <scope>.instance_order,
       then by Environment using this ranking, then by name. */
    instanceOrder: [],
    environmentRank: ['dev', 'test', 'qa', 'uat', 'stag', 'sub', 'preprod', 'prod'],
    /* Drift kind per attribute (comparison rows list their kinds; a row whose
       only differences are 'count' is flagged count_only so the page can hide
       it). Attributes not listed are 'schema' for tables/columns and 'config'
       elsewhere; a version difference is 'version'. */
    driftKinds: {
        tables: { total: 'count', customer: 'count', customer_scoped: 'count', customer_global: 'count', customer_updates: 'count',
                  clone_exclusion_rules: 'clone', clone_preserver_rules: 'clone' },
        update_sets: { update_count: 'count', remote_update_count: 'count' }
    },
    maxImportItems: 40000,
    /* sys_id drift (optional): compare each item's source record sys_id across
       instances. Off by default (<scope>.compare_sys_ids, or sys_ids=true on the
       compare/matrix API). Categories whose records get a new sys_id on every
       instance are not checked (override with <scope>.sys_id_exclude):
       measured on Brazil vs Australia PDIs, sys_plugins, sys_db_object and
       sys_dictionary sys_ids differ for ~all out-of-box records, while store
       apps, custom apps and clone rules match. */
    compareSysIds: false,
    sysIdExclude: ['mid_servers', 'update_sets', 'plugins', 'tables', 'columns']
};

/** Returns DEFAULTS merged with any property overrides. */
ConfigNowConfig.get = function () {
    var d = ConfigNowConfig.DEFAULTS;
    var p = ConfigNowConfig.SCOPE + '.';
    var cfg = JSON.parse(JSON.stringify(d));

    var list = function (name, fallback) {
        var v = gs.getProperty(p + name, '');
        if (!v) return fallback;
        var out = [];
        var parts = String(v).split(',');
        for (var i = 0; i < parts.length; i++) {
            var s = parts[i].replace(/^\s+|\s+$/g, '');
            if (s) out.push(s);
        }
        return out;
    };

    cfg.categories = list('categories', cfg.categories);
    cfg.trackedProperties = list('tracked_properties', cfg.trackedProperties);
    cfg.trackedPropertyPrefixes = list('tracked_property_prefixes', cfg.trackedPropertyPrefixes);
    cfg.includeInactivePlugins = gs.getProperty(p + 'include_inactive_plugins', 'false') == 'true';
    cfg.secureValueMode = gs.getProperty(p + 'secure_value_mode', cfg.secureValueMode);
    cfg.secureHashSalt = gs.getProperty(p + 'secure_hash_salt', '') || cfg.secureHashSalt;
    cfg.compareIgnore = cfg.compareIgnore.concat(list('compare_ignore', []));
    cfg.instanceOrder = list('instance_order', cfg.instanceOrder);
    cfg.customerScopedQuery = String(gs.getProperty(p + 'customer_scoped_query', '') || '') || cfg.customerScopedQuery;
    cfg.customerGlobalQuery = String(gs.getProperty(p + 'customer_global_query', '') || '') || cfg.customerGlobalQuery;
    cfg.customerHistory = String(gs.getProperty(p + 'customer_history', 'false')) == 'true';
    cfg.logChanges = String(gs.getProperty(p + 'log_changes', 'true')) != 'false';
    cfg.keepSnapshots = String(gs.getProperty(p + 'keep_snapshots', 'true')) != 'false';
    var rd = parseInt(String(gs.getProperty(p + 'retention_days', '') || ''), 10);
    if (rd > 0) cfg.retentionDays = rd;
    var fd = parseInt(String(gs.getProperty(p + 'update_sets_full_days', '') || ''), 10);
    if (fd > 0) cfg.updateSetsFullDays = fd;
    cfg.compareSysIds = String(gs.getProperty(p + 'compare_sys_ids', 'false')) == 'true';
    cfg.sysIdExclude = list('sys_id_exclude', cfg.sysIdExclude);
    // Storage routing: <scope>.table.<category> overrides the target table,
    // e.g. x_..._config_0.table.system_properties = x_..._config_0_tracked_item
    // routes that category to the plain (non-CI) table. Post-POC this moves
    // into sn_cmdb_table_config (one row per category).
    for (var c in cfg.tables) {
        var t = gs.getProperty(p + 'table.' + c, '');
        if (t) cfg.tables[c] = t;
    }
    var max = parseInt(gs.getProperty(p + 'max_rows_per_category', ''), 10);
    if (max > 0) cfg.maxRowsPerCategory = max;
    return cfg;
};

ConfigNowConfig.prototype = {
    initialize: function () {},
    type: 'ConfigNowConfig'
};
