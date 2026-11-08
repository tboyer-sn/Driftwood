const vm = require('vm'), assert = require('assert');
const { makeEnv, load } = require('./harness');
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: 't' + i + Math.random().toString(16).slice(2, 6) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed'];
const D = {
  sys_db_object: T(['label', 'super_class', 'scriptable_table'], [
    { name: 'sys_script', label: 'Business Rule' }, { name: 'x_acme_app_orders', label: 'Orders' }, { name: 'u_legacy', label: 'Legacy' },
    { name: 'x_2160899_driftw_0_tracked_item', label: 'own' }, { name: 'x_remote_feed', label: 'Remote', scriptable_table: '1' }, { name: 'u_cmdb_qb_result_abc123', label: 'QB result' }]),
  sys_dictionary: T(['element', 'internal_type', 'max_length'], [
    { name: 'sys_script', element: '' }, { name: 'sys_script', element: 'script', internal_type: 'script', max_length: '8000' }, { name: 'sys_script', element: 'collection', internal_type: 'table_name', max_length: '80' },
    { name: 'x_acme_app_orders', element: 'number', internal_type: 'string', max_length: '40' }]),
  sys_script: T(['sys_package', 'sys_scope', 'sys_scope.scope', 'sys_created_by'], [
    { sys_package: 'com.snc.core', 'sys_scope.scope': 'global' }, { sys_package: 'com.snc.core', 'sys_scope.scope': 'global' },
    { sys_package: 'global', 'sys_scope.scope': 'global', sys_created_by: 'admin' }, { sys_package: 'x_acme_app', 'sys_scope.scope': 'x_acme_app' },
    { sys_package: 'x_2160899_driftw_0', 'sys_scope.scope': 'x_2160899_driftw_0' }, { sys_package: 'global', 'sys_scope.scope': 'global', sys_created_by: 'system' }]),
  x_acme_app_orders: T(['number'], [{ number: '1' }, { number: '2' }, { number: '3' }, { number: '4' }, { number: '5' }]),
  u_legacy: T([], [{}]),
  x_2160899_driftw_0_sn_cmdb_table_config: T(['table_name', 'active', 'description'], [
    { table_name: 'sys_user_group', active: '1' }, { table_name: 'u_legacy', active: '0' }]),
  x_2160899_driftw_0_cmdb_ci_sn_instance: T(['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary']),
  x_2160899_driftw_0_tracked_item: T(tracked)
};
const props = { instance_name: 'dev1', 'glide.war': 'glide-brazil-x__patch1.zip' };
const { ctx } = makeEnv(D, props);
let tick = 0; ctx.GlideDateTime = class { getValue() { return '2026-11-04 12:00:' + String(10 + (tick++ % 40)).padStart(2, '0'); } };
load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowCollector.js', 'src/script_includes/ConfigNowWriter.js', 'src/script_includes/ConfigNowCompare.js', 'src/script_includes/ConfigNowImporter.js']);
const R = s => { const v = vm.runInContext(s, ctx); return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; };
const CFG = 'var c = ConfigNowConfig.get(); c.curatedTables = ["sys_script", "sys_ui_policy"]; c.categories = ["tables"]; ';

const snap = R(CFG + 'new ConfigNowCollector({ config: c }).collect()');
const items = snap.categories.tables.items, by = k => items.find(i => i.key === k);
assert.deepStrictEqual(items.map(i => i.key), ['sys_script', 'sys_ui_policy', 'sys_user_group', 'x_acme_app_orders'], 'curated + custom + manual, minus own/remote/excluded');
assert.strictEqual(by('sys_script').attributes.total, 6);
assert.strictEqual(by('sys_script').attributes.customer_scoped, 1, 'x_ scope, own app excluded'); assert.strictEqual(by('sys_script').attributes.customer_global, 1, 'global, not by system');
assert.strictEqual(by('sys_script').attributes.column_count, 2);
assert.strictEqual(by('sys_script').runtime.columns, 'collection:table_name:80,script:script:8000');
assert.strictEqual(by('sys_script').attributes.fingerprint.length, 16);
assert.strictEqual(by('sys_script').attributes.source, 'curated');
assert.strictEqual(by('x_acme_app_orders').attributes.total, 5); assert.strictEqual(by('x_acme_app_orders').attributes.customer_scoped, null, 'not a metadata table'); assert.strictEqual(by('x_acme_app_orders').attributes.customer_global, null);
assert.strictEqual(by('x_acme_app_orders').attributes.source, 'custom');
assert.strictEqual(by('sys_ui_policy').state, 'absent'); assert.strictEqual(by('sys_user_group').state, 'absent'); assert.strictEqual(by('sys_user_group').attributes.source, 'manual');
assert.ok(!items.some(i => i.key === 'u_legacy'), 'inactive config row excludes the table');
assert.deepStrictEqual(snap.warnings.filter(w => w.area === 'tables'), [], 'no table warnings');
// default routing: tables -> plain table
R(CFG + 'new ConfigNowWriter({ config: c }).persist(new ConfigNowCollector({ config: c }).collect())');
assert.strictEqual(D.x_2160899_driftw_0_tracked_item.rows.filter(r => r.item_category === 'tables').length, 4);

// second instance: one more business rule, one extra column on orders, source label differs
const B = JSON.parse(JSON.stringify(snap));
B.instance.instance_name = 'prod1'; B.collected_at = '2026-11-03 02:00:00';
const bs = B.categories.tables.items;
bs.find(i => i.key === 'sys_script').attributes.total = 5; bs.find(i => i.key === 'sys_script').hash = 'X1';
const bo = bs.find(i => i.key === 'x_acme_app_orders');
bo.attributes.fingerprint = 'ffffffffffffffff'; bo.attributes.column_count = 2; bo.runtime.columns = 'amount:decimal:20,number:string:40'; bo.hash = 'X2';
bs.find(i => i.key === 'sys_ui_policy').attributes.source = 'manual'; bs.find(i => i.key === 'sys_ui_policy').hash = 'X3';
ctx.__B = vm.runInContext('(' + JSON.stringify(B) + ')', ctx);
R(CFG + 'new ConfigNowImporter({ config: c }).importSnapshot(__B)');

const cmp = R(CFG + 'new ConfigNowCompare({ config: c }).compare("dev1", "prod1")');
const tr = cmp.categories.tables, row = k => tr.rows.find(r => r.key === k);
assert.deepStrictEqual(row('sys_script').fields, ['attributes.total'], 'exact count drift');
assert.deepStrictEqual(row('x_acme_app_orders').fields.sort(), ['attributes.column_count', 'attributes.fingerprint']);
assert.deepStrictEqual(row('x_acme_app_orders').b.columns, ['amount:decimal:20', 'number:string:40']);
assert.deepStrictEqual(row('x_acme_app_orders').a.columns, ['number:string:40']);
assert.ok(!row('sys_ui_policy'), 'source label difference is not drift (tables|source ignored)');
assert.strictEqual(tr.counts.same, 2);
const m = R(CFG + 'new ConfigNowCompare({ config: c }).compareMany([])');
const mo = m.categories.tables.rows.find(r => r.key === 'x_acme_app_orders');
assert.deepStrictEqual(mo.cells[1].columns, ['amount:decimal:20', 'number:string:40']);
assert.ok(mo.cells[1].diff.indexOf('attributes.fingerprint') > -1);
// legacy instance (summary without a categories list, no table data) -> "not collected", not "missing"
{
  const L = JSON.parse(JSON.stringify(snap)); L.instance.instance_name = 'legacy1'; L.collected_at = '2026-11-01 01:00:00';
  delete L.categories.tables;
  ctx.__L = vm.runInContext('(' + JSON.stringify(L) + ')', ctx);
  R(CFG + 'new ConfigNowImporter({ config: c }).importSnapshot(__L)');
  // emulate a pre-0.3 summary (no categories list)
  const ci = D.x_2160899_driftw_0_cmdb_ci_sn_instance.rows.find(r => r.instance_name === 'legacy1');
  const sm = JSON.parse(ci.collection_summary); delete sm.categories; ci.collection_summary = JSON.stringify(sm);
  const pc = R(CFG + 'new ConfigNowCompare({ config: c }).compare("dev1", "legacy1")');
  assert.deepStrictEqual(pc.categories.tables.not_collected, ['legacy1']); assert.strictEqual(pc.categories.tables.rows.length, 0);
  const mm = R(CFG + 'new ConfigNowCompare({ config: c }).compareMany([])');
  const t = mm.categories.tables; assert.deepStrictEqual(t.not_collected, ['legacy1']);
  const li = mm.instances.findIndex(i => i.instance_name === 'legacy1');
  assert.ok(t.rows.every(r => r.cells[li].not_collected), 'legacy column marked not collected');
  assert.ok(t.rows.every(r => r.status !== 'partial'), 'no false "missing" rows');
  assert.strictEqual(mm.per_instance[li].missing, 0);
}
console.log('TABLES TESTS PASSED');
