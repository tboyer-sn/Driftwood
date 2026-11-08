const vm = require('vm'), fs = require('fs'), assert = require('assert');
const { makeEnv, load } = require('./harness');
// reuse the db() fixture from test_poc by requiring it indirectly: build a minimal one here
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: 's' + i + Math.random().toString(16).slice(2, 6) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed'];
const D = {
  sys_plugins: T(['source', 'version', 'active'], [{ source: 'com.a', name: 'A', version: '1', active: '1' }]),
  sys_properties: T(['value', 'type', 'is_private', 'sys_scope'], [{ name: 'glide.ui.session_timeout', value: '30', type: 'integer' }]),
  x_2160899_driftw_0_cmdb_ci_sn_instance: T(['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary']),
  x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin: T(tracked), x_2160899_driftw_0_cmdb_ci_sn_tracked_table: T(tracked), x_2160899_driftw_0_tracked_item: T(tracked)
};
const props = { instance_name: 'zurich1', 'glide.war': 'glide-zurich-01-01-2026__patch2.zip' };
['applications', 'mid_servers', 'system_properties', 'clone_preservers', 'clone_exclusions'].forEach(c => props['x_2160899_driftw_0.table.' + c] = 'x_2160899_driftw_0_tracked_item');
props['x_2160899_driftw_0.categories'] = 'plugins,applications,mid_servers,system_properties,clone_preservers,clone_exclusions'; // pin pre-tables categories
const { ctx, out } = makeEnv(D, props);
class GlideAggregate extends ctx.GlideRecord { addAggregate() {} query() { super.query(); this.done = false; } next() { if (this.done) return false; this.done = true; return true; } getAggregate() { return String(this.rows.length); } }
ctx.GlideAggregate = GlideAggregate;
load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowCollector.js', 'src/script_includes/ConfigNowWriter.js']);
const src = fs.readFileSync(__dirname + '/../src/background/verify_collect.js', 'utf8');
vm.runInContext('(function(){' + src + '})()', ctx); const run1 = out.splice(0).join('\n');
vm.runInContext('(function(){' + src + '})()', ctx); const run2 = out.splice(0).join('\n');
assert.match(run1, /TOTALS \{"inserted":18/); assert.match(run1, /release: Zurich \/ patch2/);
assert.match(run2, /TOTALS \{"inserted":0,"updated":0,"unchanged":18/);
assert.match(run2, /CI plugins      : 1/); assert.match(run2, /Instance CIs    : 1/);
console.log(run2.split('\n').filter(l => /TOTALS|CI plugins|Plain items|Instance CIs/.test(l)).join('\n'));
console.log('VERIFY_COLLECT TEST PASSED');
