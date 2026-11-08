const assert = require('assert');
const { makeEnv, load } = require('./harness');

const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed'];
function db() {
  const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => ({ sys_id: 'src' + Math.random().toString(16).slice(2), ...r })) });
  return {
    sys_cluster_state: T(['system_id', 'status', 'schedulers'], [{ system_id: 'app1:node1', status: 'online', schedulers: 'any' }, { system_id: 'app2:node2', status: 'online', schedulers: 'any' }]),
    sys_plugins: T(['source', 'version', 'active'], [{ source: 'com.snc.incident', name: 'Incident', version: '1.0', active: '1' }, { source: 'com.glide.foo', name: 'Foo', version: '2', active: '0' }, { source: 'com.snc.change', name: 'Change', version: '3.1', active: 'true' }]),
    sys_store_app: T(['scope', 'version', 'active', 'vendor'], [{ scope: 'sn_hr_core', name: 'HR Core', version: '5.0.1', active: 'true', vendor: 'ServiceNow' }]),
    sys_app: T(['scope', 'version', 'active', 'vendor_prefix'], [{ scope: 'x_2160899_driftw_0', name: 'Driftwood', version: '0.1.0', active: 'true', vendor_prefix: 'x' }]),
    ecc_agent: T(['version', 'status', 'validated', 'host_name', 'ip_address', 'last_refreshed'], [{ name: 'mid01', version: 'xanadu-07-02-2024__patch3', status: 'Up', validated: 'true', host_name: 'h1', ip_address: '10.0.0.1', last_refreshed: 'x' }]),
    sys_properties: T(['value', 'type', 'is_private', 'sys_scope'], [
      { name: 'glide.servlet.uri', value: 'https://dev1.service-now.com/', type: 'string', is_private: 'false', sys_scope: 'g', 'sys_scope$display': 'Global' },
      { name: 'glide.ui.session_timeout', value: '30', type: 'integer', is_private: 'false', sys_scope: 'g', 'sys_scope$display': 'Global' },
      { name: 'glide.email.smtp.active', value: 'false', type: 'boolean', is_private: 'false', sys_scope: 'g' },
      { name: 'glide.authenticate.sso.redirect.idp', value: 's3cret', type: 'password2', is_private: 'true', sys_scope: 'g' }]),
    clone_data_preserver: T(['table', 'condition', 'active'], [{ name: 'Keep integrations', table: 'sys_rest_message', condition: 'active=true', active: 'true' }]),
    clone_data_exclude: T(['table'], [{ table: 'sys_email' }, { table: 'syslog' }]),
    // NOTE: clone_data_exclude here deliberately lacks "active" to exercise field fallback
    x_2160899_driftw_0_cmdb_ci_sn_instance: T(['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary']),
    x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin: T(tracked),
    x_2160899_driftw_0_cmdb_ci_sn_tracked_application: T(tracked),
    x_2160899_driftw_0_cmdb_ci_sn_tracked_mid_server: T(tracked),
    x_2160899_driftw_0_cmdb_ci_sn_tracked_property: T(tracked),
    x_2160899_driftw_0_cmdb_ci_sn_tracked_clone_rule: T(tracked),
    x_2160899_driftw_0_tracked_item: T(tracked)
  };
}
const props = { instance_name: 'dev12345', instance_id: 'abc', 'glide.servlet.uri': 'https://dev1.service-now.com/', 'glide.war': 'glide-xanadu-07-02-2024__patch3-hotfix1-10-17-2024_10-23-2024_1048.zip', 'glide.buildname': 'Xanadu', 'glide.builddate': '10-23-2024_1048', 'glide.installation.production': 'false', 'glide.sys.default.tz': 'America/Toronto' };
props['x_2160899_driftw_0.categories'] = 'plugins,applications,mid_servers,system_properties,clone_preservers,clone_exclusions'; // pin pre-tables categories

const D = db();
const { ctx, out } = makeEnv(D, props);
load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowCollector.js', 'src/script_includes/ConfigNowWriter.js']);
const run = s => vm_run(ctx, s);
function vm_run(c, s) { return require('vm').runInContext(s, c); }

// 1. Collect
const snap = run('new ConfigNowCollector().collect()');
assert.strictEqual(snap.instance.family, 'Xanadu');
assert.strictEqual(snap.instance.patch, 'patch3-hotfix1');
assert.strictEqual(snap.instance.node_count, 2);
assert.strictEqual(snap.instance.timezone, 'America/Toronto');
assert.strictEqual(snap.instance.environment, '', 'no CI yet');
assert.strictEqual(snap.categories.plugins.count, 2, 'inactive plugin filtered');
assert.strictEqual(snap.categories.applications.count, 2);
assert.strictEqual(snap.categories.mid_servers.items[0].runtime.status, 'Up');
const sp = snap.categories.system_properties.items;
const sec = sp.find(i => i.key === 'glide.authenticate.sso.redirect.idp');
assert.strictEqual(sec.value, '********'); assert.ok(sec.secure_value_hash.length === 64);
assert.ok(!JSON.stringify(snap).includes('s3cret'), 'secret never in snapshot');
assert.strictEqual(sp.find(i => i.key === 'glide.db.max_view_records').state, 'not_set');
assert.strictEqual(snap.categories.clone_preservers.count, 1);
assert.strictEqual(snap.categories.clone_exclusions.count, 2);
console.log('warnings:', snap.warnings);

// 2. Persist (first run => inserts)
let r1 = run('new ConfigNowWriter().persist(new ConfigNowCollector().collect())');
console.log('run1', r1.totals);
assert.strictEqual(r1.totals.updated + r1.totals.removed, 0);
assert.ok(r1.totals.inserted > 20);

// environment is admin-set on the CI and read back, never overwritten
D.x_2160899_driftw_0_cmdb_ci_sn_instance.rows[0].environment = 'dev';
assert.strictEqual(run('new ConfigNowCollector().collect()').instance.environment, 'dev');

// 3. Second run unchanged => no item writes
const before = D.x_2160899_driftw_0_cmdb_ci_sn_tracked_property.writes;
let r2 = run('new ConfigNowWriter().persist(new ConfigNowCollector().collect())');
console.log('run2', r2.totals);
assert.strictEqual(r2.totals.inserted + r2.totals.updated + r2.totals.removed, 0);
assert.strictEqual(D.x_2160899_driftw_0_cmdb_ci_sn_tracked_property.writes, before);
assert.strictEqual(D.x_2160899_driftw_0_cmdb_ci_sn_instance.rows.length, 1, 'instance CI coalesced');

// 4. Change a property, change a secret, remove a plugin, MID status flap
D.sys_properties.rows.find(r => r.name === 'glide.ui.session_timeout').value = '60';
D.sys_properties.rows.find(r => r.name === 'glide.authenticate.sso.redirect.idp').value = 'rotated';
D.sys_plugins.rows = D.sys_plugins.rows.filter(r => r.source !== 'com.snc.change');
D.ecc_agent.rows[0].status = 'Down';
let r3 = run('new ConfigNowWriter().persist(new ConfigNowCollector().collect())');
console.log('run3', r3.categories);
assert.strictEqual(r3.categories.system_properties.updated, 2);
assert.strictEqual(r3.categories.plugins.removed, 1);
assert.strictEqual(r3.categories.mid_servers.updated, 0, 'runtime status not drift');

// 5. Plugin returns => restored
D.sys_plugins.rows.push({ sys_id: 'p9', source: 'com.snc.change', name: 'Change', version: '3.1', active: '1' });
let r4 = run('new ConfigNowWriter().persist(new ConfigNowCollector().collect())');
assert.strictEqual(r4.categories.plugins.restored, 1);

// 5b. Hybrid storage: route properties + clone rules to the plain table
{
  const D2 = db();
  const p2 = Object.assign({}, props, {
    'x_2160899_driftw_0.table.system_properties': 'x_2160899_driftw_0_tracked_item',
    'x_2160899_driftw_0.table.clone_preservers': 'x_2160899_driftw_0_tracked_item',
    'x_2160899_driftw_0.table.clone_exclusions': 'x_2160899_driftw_0_tracked_item' });
  const e2 = makeEnv(D2, p2);
  load(e2.ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowCollector.js', 'src/script_includes/ConfigNowWriter.js']);
  const rr = require('vm').runInContext('new ConfigNowWriter().persist(new ConfigNowCollector().collect())', e2.ctx);
  assert.strictEqual(D2.x_2160899_driftw_0_tracked_item.rows.length, 17 + 1 + 2, 'plain table holds props+clone rules');
  assert.strictEqual(D2.x_2160899_driftw_0_cmdb_ci_sn_tracked_property.rows.length, 0);
  assert.strictEqual(D2.x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin.rows.length, 2, 'plugins still CI');
  const rr2 = require('vm').runInContext('new ConfigNowWriter().persist(new ConfigNowCollector().collect())', e2.ctx);
  assert.strictEqual(rr2.totals.inserted + rr2.totals.updated + rr2.totals.removed, 0, 'hybrid idempotent');
  console.log('hybrid storage OK');
}

// 6. Missing table => warning, not exception
delete D.ecc_agent;
const s5 = run('new ConfigNowCollector().collect()');
assert.ok(s5.warnings.some(w => w.area === 'mid_servers'));
assert.strictEqual(s5.categories.mid_servers.count, 0);
assert.strictEqual(D.x_2160899_driftw_0_cmdb_ci_sn_instance.rows[0].environment, 'dev', 'writer kept environment');
const ic = D.x_2160899_driftw_0_cmdb_ci_sn_instance.rows[0];
assert.strictEqual(ic.version, 'Xanadu patch3-hotfix1');
assert.strictEqual(ic.fqdn, 'dev1.service-now.com');
console.log('ALL TESTS PASSED');
