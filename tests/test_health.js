// v0.6 O06: ConfigNowHealth checks (engine, mock platform) and the Health page (jsdom).
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const { makeEnv, load } = require('./harness');
const S = 'x_2160899_driftw_0', P = S + '_';
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: r.sys_id || ('h' + i + Math.random().toString(16).slice(2, 8)) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'source_table', 'source_url', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed', 'object'];

function healthy() {
  const sis = ['ConfigNowConfig', 'ConfigNowCollector', 'ConfigNowWriter', 'ConfigNowCompare', 'ConfigNowImporter', 'ConfigNowRetention', 'ConfigNowObjects', 'ConfigNowDrift', 'ConfigNowMigration', 'ConfigNowHealth'];
  const acls = [];
  ['cmdb_ci_sn_instance', 'cmdb_ci_sn_instance.*', 'cmdb_ci_sn_instance', 'cmdb_ci_sn_instance.*', 'cmdb_ci_sn_tracked_table', 'cmdb_ci_sn_tracked_table.*', 'cmdb_ci_sn_tracked_table.secure_value_hash',
   'tracked_item', 'tracked_item.*', 'tracked_item.secure_value_hash', 'sn_cmdb_table_config', 'sn_cmdb_table_config.*', 'sn_cmdb_table_config', 'sn_cmdb_table_config', 'sn_cmdb_table_config',
   'collection_run', 'collection_run.*', 'collection_run', 'item_change', 'item_change.*', 'item_change', 'tracked_object', 'tracked_object.*', 'tracked_object'].forEach(n => acls.push({ name: P + n, active: 'true' }));
  const D = {
    sys_scope: T(['scope', 'name'], [{ sys_id: 'APP', scope: S, name: 'Driftwood' }]),
    sys_script_include: T(['api_name', 'active'], sis.map(n => ({ api_name: S + '.' + n, active: 'true' }))),
    sys_user_role: T(['name'], ['configuration_read', 'configuration_read_secure', 'configuration_admin', 'admin', 'collector'].map(r => ({ name: S + '.' + r }))),
    sys_security_acl: T(['name', 'active'], acls),
    sysauto_script: T(['name', 'active', 'run_as'], ['Driftwood - Collect current instance', 'Driftwood - Recompute drift', 'Driftwood - Purge history', 'Driftwood - Health check'].map(n => ({ name: n, active: 'true', run_as: '6816f79cc0a8016401c5a33be04be441' }))),
    sys_ws_definition: T(['service_id', 'active', 'base_uri'], [{ sys_id: 'API', service_id: 'driftwood', active: 'true', base_uri: '/api/' + S + '/driftwood' }, { sys_id: 'OLD', service_id: 'configurationnow', active: 'false' }]),
    sys_ws_operation: T(['web_service_definition', 'http_method', 'relative_path', 'active'], ['GET /current', 'GET /instances', 'GET /compare', 'GET /matrix', 'POST /snapshot', 'POST /collect', 'GET /health'].map(o => ({ web_service_definition: 'API', http_method: o.split(' ')[0], relative_path: o.split(' ')[1], active: 'true' }))),
    sys_script_fix: T(['name'], ['Driftwood - Backfill tracked objects', 'Driftwood - Move plugins off the CMDB', 'Driftwood - Recompute all drift'].map(n => ({ name: n }))),
    sys_scope_privilege: T(['source_scope', 'target_name', 'target_type', 'operation', 'status'], []),
    [P + 'cmdb_ci_sn_instance']: T(['instance_name', 'last_collected', 'collection_status', 'collection_summary', 'retention_days'], [{ sys_id: 'I1', instance_name: 'dev1', last_collected: '2026-11-08 02:15:00', collection_status: 'completed' }, { sys_id: 'I2', instance_name: 'prod1', last_collected: '2026-11-01 01:00:00', collection_status: 'completed' }]),
    [P + 'tracked_item']: T(['name'].concat(tracked), [
      { instance: 'I1', item_category: 'system_properties', item_key: 'a', object: 'O1', present: 'true' }, { instance: 'I2', item_category: 'system_properties', item_key: 'a', object: 'O1', present: 'true' },
      { instance: 'I1', item_category: 'columns', item_key: 'x_t.name', object: '', present: 'true' }]),
    [P + 'cmdb_ci_sn_tracked_plugin']: T(tracked, []),
    [P + 'collection_run']: T(['run_id', 'instance', 'changes_logged', 'collected_at'], [{ run_id: 'r1', instance: 'I1', collected_at: '2026-10-01 02:15:00' }]),
    [P + 'item_change']: T(['run', 'item_key', 'change_type', 'object'], []),
    [P + 'tracked_object']: T(['object_key', 'item_category', 'item_key', 'drift_status', 'drift_kinds', 'differs_on_prod', 'parent_object'], [{ sys_id: 'O1', object_key: 'system_properties|a', item_category: 'system_properties', item_key: 'a', drift_status: 'same' }])
  };
  const props = { instance_name: 'dev1' };
  ['applications', 'mid_servers', 'system_properties', 'clone_preservers', 'clone_exclusions', 'plugins'].forEach(c => props[S + '.table.' + c] = P + 'tracked_item');
  const { ctx } = makeEnv(D, props);
  ctx.GlideDateTime = class { getValue() { return '2026-11-08 12:00:00'; } };
  load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowHealth.js']);
  const exp = vm.runInContext('ConfigNowHealth.prototype.EXPECTED_PRIVILEGES', ctx);
  exp.forEach(e => D.sys_scope_privilege.rows.push({ sys_id: 'p' + D.sys_scope_privilege.rows.length, source_scope: 'APP', target_name: e[0], target_type: e[1], operation: e[2], status: 'allowed' }));
  const R = () => JSON.parse(JSON.stringify(vm.runInContext('new ConfigNowHealth().run()', ctx)));
  return { D, ctx, R, props };
}
const chk = (res, name) => res.checks.find(c => c.name === name);

// 1. a healthy install: no warn/fail; notes for H06/H07
let E = healthy(), r = E.R();
assert.strictEqual(r.schema, 'driftwood.health/0.1');
const bad = r.checks.filter(c => c.status === 'warn' || c.status === 'fail');
assert.deepStrictEqual(bad, [], JSON.stringify(bad, null, 1));
assert.strictEqual(r.status, 'info');
assert.strictEqual(chk(r, 'Cross-scope privileges').status, 'ok'); assert.match(chk(r, 'Cross-scope privileges').detail, /^59 privilege\(s\); expected 59/);
assert.strictEqual(chk(r, 'Run as (H07)').status, 'info'); assert.match(chk(r, 'Run as (H07)').detail, /collector service account/);
assert.match(chk(r, 'Observations linked').detail, /All linked \(1 inherited column\(s\) have none, as designed\)/);
assert.strictEqual(chk(r, 'Storage routing').status, 'ok');
assert.match(vm.runInContext('var h = new ConfigNowHealth(); h.summary(h.run())', E.ctx), /^Driftwood health: INFO/);
E.D.sysauto_script.rows.forEach(j => j.run_as = 'COLLECTOR1');
r = E.R(); assert.strictEqual(chk(r, 'Run as (H07)').status, 'ok'); assert.match(chk(r, 'Run as (H07)').detail, /user COLLECTOR1/); E = healthy(); r = E.R();
console.log('healthy install: ' + r.counts.ok + ' ok, ' + r.counts.info + ' info');

// 2. each problem shows up
E = healthy();
E.D.sys_scope_privilege.rows.push({ sys_id: 'px', source_scope: 'APP', target_name: 'GlideRecord.deleteRecord', target_type: 'scriptable', operation: 'execute', status: 'allowed' });
r = E.R(); assert.strictEqual(r.status, 'fail'); assert.match(chk(r, 'Cross-scope privileges').detail, /REMOVED ONES CAME BACK.*GlideRecord\.deleteRecord/);
E = healthy();
E.D.sys_scope_privilege.rows.push({ sys_id: 'py', source_scope: 'APP', target_name: 'sys_user', target_type: 'sys_db_object', operation: 'read', status: 'allowed' });
E.D.sys_scope_privilege.rows.push({ sys_id: 'pz', source_scope: 'OTHER', target_name: 'sys_user', target_type: 'sys_db_object', operation: 'write', status: 'allowed' });
r = E.R(); assert.strictEqual(chk(r, 'Cross-scope privileges').status, 'warn'); assert.match(chk(r, 'Cross-scope privileges').detail, /^60 privilege\(s\).*Not expected: sys_user read$/);
E = healthy(); E.D.sys_scope_privilege.rows.splice(0, 3);
r = E.R(); assert.strictEqual(chk(r, 'Cross-scope privileges').status, 'ok'); assert.match(chk(r, 'Cross-scope privileges').detail, /3 expected one\(s\) not created yet/);
E = healthy(); E.D[P + 'cmdb_ci_sn_tracked_plugin'].rows.push({ item_category: 'plugins' });
r = E.R(); assert.strictEqual(chk(r, 'Plugin CIs (O05)').status, 'warn');
E = healthy(); delete E.props[S + '.table.plugins'];
r = E.R(); assert.strictEqual(chk(r, 'Storage routing').status, 'warn'); assert.match(chk(r, 'Storage routing').detail, /plugins/);
E = healthy(); E.D.sysauto_script.rows[1].active = 'false'; E.D.sysauto_script.rows.pop();
r = E.R(); assert.strictEqual(chk(r, 'Scheduled jobs').status, 'warn'); assert.match(chk(r, 'Scheduled jobs').detail, /Recompute drift inactive.*Health check missing/);
E = healthy(); E.D.sys_ws_definition.rows[1].active = 'true'; E.D.sys_ws_operation.rows.pop();
r = E.R(); assert.strictEqual(chk(r, 'Old API /configurationnow').status, 'warn'); assert.strictEqual(chk(r, 'API /driftwood').status, 'fail'); assert.match(chk(r, 'API /driftwood').detail, /GET \/health/);
E = healthy(); E.D.sys_security_acl.rows = E.D.sys_security_acl.rows.filter(a => !/tracked_object/.test(a.name));
r = E.R(); assert.strictEqual(chk(r, 'ACLs').status, 'fail'); assert.match(chk(r, 'ACLs').detail, /tracked_object, tracked_object\.\*/);
E = healthy(); E.D.sys_user_role.rows.pop(); E.D.sys_script_include.rows.pop();
r = E.R(); assert.strictEqual(chk(r, 'Roles').status, 'fail'); assert.strictEqual(chk(r, 'Script includes').status, 'fail'); assert.match(chk(r, 'Script includes').detail, /ConfigNowHealth/);
E = healthy(); E.D[P + 'tracked_object'].rows.push({ sys_id: 'O2', object_key: 'x|y', item_category: 'x', item_key: 'y', drift_status: 'not_compared' });
E.D[P + 'tracked_item'].rows.push({ instance: 'I1', item_category: 'plugins', item_key: 'com.z', object: '' });
r = E.R(); assert.strictEqual(chk(r, 'Drift computed').status, 'warn'); assert.strictEqual(chk(r, 'Observations linked').status, 'warn');
assert.match(chk(r, 'Objects without observations').detail, /^1 object/);
E = healthy(); E.D[P + 'cmdb_ci_sn_instance'].rows[0].last_collected = '2026-11-01 02:15:00';
r = E.R(); assert.strictEqual(chk(r, 'Last collection').status, 'warn'); assert.match(chk(r, 'Last collection').detail, /daily collection job may not be running/);
E = healthy(); E.D[P + 'collection_run'].rows[0].collected_at = '2026-01-01 00:00:00';
r = E.R(); assert.strictEqual(chk(r, 'History retention').status, 'warn');
E = healthy(); E.D[P + 'tracked_object'].fields = E.D[P + 'tracked_object'].fields.filter(f => f !== 'drift_status');
r = E.R(); assert.strictEqual(chk(r, 'Tables and columns').status, 'fail'); assert.match(chk(r, 'Tables and columns').detail, /tracked_object: drift_status/);
// a check that throws is reported, not fatal
E = healthy(); vm.runInContext('ConfigNowHealth.prototype._roles = function () { throw new Error("boom"); }', E.ctx);
r = E.R(); assert.ok(r.checks.find(c => c.name === 'roles' && c.status === 'warn' && /boom/.test(c.detail)));
console.log('problems: footprint (back/extra/not yet), plugin CIs, routing, jobs, REST, ACLs, roles, script includes, drift, links, orphans, freshness, retention, schema, a failing check');

// 3. Health page in a browser
const { JSDOM } = require('jsdom');
E = healthy(); E.D.sys_ws_definition.rows[1].active = 'true';
const res = E.R();
const html = fs.readFileSync(__dirname + '/../src/ui_pages/x_2160899_driftw_0_health.html.xml', 'utf8');
const body = html.replace(/^[\s\S]*?<j:jelly[^>]*>/, '').replace(/<\/j:jelly>\s*$/, '');
const dom = new JSDOM('<!doctype html><html><body>' + body + '</body></html>', { runScripts: 'outside-only', url: 'https://dev1.example/' });
const w = dom.window, fns = [], urls = [];
w.addLoadEvent = f => fns.push(f); w.g_ck = 'tok';
let status = 200;
w.XMLHttpRequest = class { open(m, u) { this.u = u; urls.push(u); } setRequestHeader() {} send() { this.readyState = 4; this.status = status; this.responseText = JSON.stringify(status == 200 ? { result: res } : { result: { error: 'x' } }); this.onreadystatechange(); } };
w.eval(fs.readFileSync(__dirname + '/../src/ui_pages/x_2160899_driftw_0_health.client.js', 'utf8'));
fns.forEach(f => f());
const $ = id => w.document.getElementById(id);
assert.strictEqual(urls[0], '/api/' + S + '/driftwood/health');
assert.strictEqual($('hl-overall').textContent, 'Needs attention'); assert.match($('hl-overall').className, /warn/);
const firstRow = $('hl-result').querySelector('tbody tr');
assert.match(firstRow.textContent, /Old API \/configurationnow.*warn/, 'problems sorted first');
assert.strictEqual($('hl-result').querySelectorAll('tbody tr').length, res.checks.length);
status = 403; $('hl-refresh').click();
assert.match($('hl-overall').textContent, /configuration_admin/);
console.log('Health page: overall status, problems first, refresh, 403 message');
console.log('HEALTH TESTS PASSED');
