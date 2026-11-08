// v0.4: table definitions, column items, clone flags, drift kinds, customer counts (v0.4.2)
const vm = require('vm'), assert = require('assert');
const { makeEnv, load } = require('./harness');
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: r.sys_id || ('r' + i + Math.random().toString(16).slice(2, 8)) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed'];

function makeDb() {
  return {
    sys_scope: T(['scope'], [{ sys_id: 'SCG', scope: 'global' }, { sys_id: 'SCX', scope: 'x_acme_app' }]),
    sys_db_object: T(['label', 'super_class', 'sys_scope', 'sys_package', 'is_extendable', 'access', 'ws_access', 'number_ref', 'scriptable_table'], [
      { sys_id: 'META', name: 'sys_metadata', label: 'Application File' },
      { name: 'sys_script', label: 'Business Rule', super_class: 'META', sys_scope: 'SCG', sys_package: 'PK1', 'sys_package$display': 'Core', is_extendable: 'true', access: 'public', ws_access: '1', number_ref: '' },
      { name: 'x_acme_app_orders', label: 'Orders', sys_scope: 'SCX', sys_package: 'PK2', 'sys_package$display': 'Acme App', is_extendable: 'false', access: 'package_private', ws_access: '0', number_ref: 'NUM1' }]),
    sys_dictionary: T(['element', 'internal_type', 'max_length', 'reference', 'mandatory', 'active', 'column_label', 'sys_scope', 'default_value'], [
      { name: 'sys_script', element: '' },
      { name: 'sys_script', element: 'script', internal_type: 'script', max_length: '8000', mandatory: 'false', active: 'true', column_label: 'Script', sys_scope: 'SCG', default_value: 'x'.repeat(900) },
      { name: 'sys_script', element: 'collection', internal_type: 'table_name', max_length: '80', mandatory: 'true', active: 'true', column_label: 'Table', sys_scope: 'SCG' },
      { name: 'x_acme_app_orders', element: 'number', internal_type: 'string', max_length: '40', mandatory: 'false', active: 'true', column_label: 'Number', sys_scope: 'SCX' },
      { name: 'x_acme_app_orders', element: 'old_flag', internal_type: 'boolean', max_length: '40', mandatory: 'false', active: 'false', column_label: 'Old flag', sys_scope: 'SCX' }]),
    sys_script: T(['sys_package', 'sys_scope', 'sys_created_by'], [
      { sys_package: 'com.snc.core', sys_created_by: 'system' }, { sys_package: 'global', sys_created_by: 'admin' }, { sys_package: 'global', sys_created_by: 'system' }]),
    x_acme_app_orders: T(['number'], [{ number: '1' }, { number: '2' }]),
    clone_data_exclude: T(['table', 'active'], [{ table: 'x_acme_app_orders', active: 'true' }, { table: 'sys_script', active: 'false' }]),
    clone_data_preserver: T(['name', 'table', 'active'], [{ name: 'Keep orders', table: 'x_acme_app_orders', active: 'true' }, { name: 'Keep orders 2', table: 'x_acme_app_orders', active: 'true' }]),
    x_2160899_driftw_0_sn_cmdb_table_config: T(['table_name', 'active', 'description']),
    x_2160899_driftw_0_cmdb_ci_sn_instance: T(['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary']),
    x_2160899_driftw_0_tracked_item: T(tracked)
  };
}

function env(props, opts) {
  const D = makeDb();
  const { ctx } = makeEnv(D, Object.assign({ instance_name: 'dev1', 'glide.war': 'glide-brazil-x__patch1.zip' }, props || {}), opts);
  let tick = 0; ctx.GlideDateTime = class { getValue() { return '2026-11-06 12:00:' + String(10 + (tick++ % 40)).padStart(2, '0'); } };
  load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowCollector.js', 'src/script_includes/ConfigNowWriter.js', 'src/script_includes/ConfigNowCompare.js', 'src/script_includes/ConfigNowImporter.js']);
  const R = s => { const v = vm.runInContext(s, ctx); return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; };
  return { D, ctx, R };
}
const CFG = 'var c = ConfigNowConfig.get(); c.curatedTables = ["sys_script"]; c.categories = ["tables", "columns"]; ';

/* ---- collection ---- */
const { D, ctx, R } = env();
const snap = R(CFG + 'new ConfigNowCollector({ config: c }).collect()');
assert.deepStrictEqual(snap.warnings.filter(w => w.area !== 'instance.nodes'), [], 'no warnings');
const tb = k => snap.categories.tables.items.find(i => i.key === k);
const sc = tb('sys_script').attributes, xo = tb('x_acme_app_orders').attributes;
assert.strictEqual(sc.parent, 'sys_metadata', 'parent resolved by sys_id');
assert.strictEqual(sc.scope, 'global'); assert.strictEqual(xo.scope, 'x_acme_app');
assert.strictEqual(sc.package, 'Core');
assert.strictEqual(sc.extensible, true); assert.strictEqual(xo.extensible, false);
assert.strictEqual(sc.accessible_from, 'public'); assert.strictEqual(sc.web_service_access, true); assert.strictEqual(xo.web_service_access, false);
assert.strictEqual(sc.auto_number, false); assert.strictEqual(xo.auto_number, true, 'number_ref -> boolean, no sys_id');
assert.ok(!('can_read' in sc), 'fields this release lacks are left out');
assert.strictEqual(sc.clone_exclusion_rules, 0, 'inactive exclusion ignored');
assert.strictEqual(xo.clone_exclusion_rules, 1); assert.strictEqual(xo.clone_preserver_rules, 2);
assert.strictEqual(sc.customer_global, 1, 'global, admin-created only'); assert.strictEqual(sc.customer_scoped, 0); assert.ok(!('customer_updates' in sc));
assert.strictEqual(sc.column_count, 2); assert.strictEqual(sc.fingerprint.length, 16);

const cols = snap.categories.columns.items, col = k => cols.find(i => i.key === k);
assert.deepStrictEqual(cols.map(i => i.key), ['sys_script.collection', 'sys_script.script', 'x_acme_app_orders.number', 'x_acme_app_orders.old_flag']);
assert.strictEqual(col('sys_script.collection').name, 'Table', 'label is the name');
assert.deepStrictEqual(col('sys_script.collection').attributes, { type: 'table_name', max_length: '80', reference: '', mandatory: true, active: true, default_value: '', scope: 'global', table: 'sys_script' });
assert.strictEqual(col('x_acme_app_orders.old_flag').state, 'inactive');
const dv = col('sys_script.script').attributes.default_value;
assert.ok(dv.length < 300 && /\[900 chars, sha256 [0-9A-F]{16}\]$/.test(dv), 'long text clipped but still comparable');
assert.strictEqual(col('sys_script.collection').source_sys_id.length > 0, true);

/* ---- persist + idempotent ---- */
const r1 = R(CFG + 'new ConfigNowWriter({ config: c }).persist(new ConfigNowCollector({ config: c }).collect())');
assert.strictEqual(r1.categories.columns.inserted, 4);
assert.strictEqual(D.x_2160899_driftw_0_tracked_item.rows.filter(r => r.item_category === 'columns').length, 4, 'columns routed to the plain table');
const r2 = R(CFG + 'new ConfigNowWriter({ config: c }).persist(new ConfigNowCollector({ config: c }).collect())');
assert.strictEqual(r2.totals.inserted + r2.totals.updated, 0, 'second run writes nothing');

/* ---- compare: kinds, count_only, one-sided attributes ---- */
const B = JSON.parse(JSON.stringify(snap));
B.instance.instance_name = 'prod1'; B.collected_at = '2026-11-05 02:00:00';
const bt = k => B.categories.tables.items.find(i => i.key === k);
bt('sys_script').attributes.total = 99; bt('sys_script').hash = 'H1';                       // count only
bt('x_acme_app_orders').attributes.extensible = true; bt('x_acme_app_orders').attributes.total = 7; bt('x_acme_app_orders').hash = 'H2'; // schema + count
const bc = B.categories.columns.items.find(i => i.key === 'sys_script.collection');
bc.attributes.max_length = '100'; bc.name = 'Table name (translated)'; bc.hash = 'H3';      // column schema drift, label ignored
const lbl = B.categories.columns.items.find(i => i.key === 'sys_script.script');
lbl.name = 'Skript'; lbl.hash = 'H4';                                                      // label only -> not drift
ctx.__B = vm.runInContext('(' + JSON.stringify(B) + ')', ctx);
R(CFG + 'new ConfigNowImporter({ config: c }).importSnapshot(__B)');
const cmp = R(CFG + 'new ConfigNowCompare({ config: c }).compare("dev1", "prod1")');
const row = (cat, k) => cmp.categories[cat].rows.find(r => r.key === k);
assert.deepStrictEqual(row('tables', 'sys_script').kinds, ['count']); assert.strictEqual(row('tables', 'sys_script').count_only, true);
assert.deepStrictEqual(row('tables', 'x_acme_app_orders').kinds, ['schema', 'count']); assert.strictEqual(row('tables', 'x_acme_app_orders').count_only, false);
assert.strictEqual(cmp.categories.tables.counts.count_only, 1);
assert.deepStrictEqual(row('columns', 'sys_script.collection').fields, ['attributes.max_length']);
assert.deepStrictEqual(row('columns', 'sys_script.collection').kinds, ['schema']);
assert.ok(!row('columns', 'sys_script.script'), 'label difference is not drift');
assert.strictEqual(cmp.summary.count_only, 1);
const mx = R(CFG + 'new ConfigNowCompare({ config: c }).compareMany([])');
const mr = mx.categories.tables.rows.find(r => r.key === 'sys_script');
assert.strictEqual(mr.count_only, true); assert.deepStrictEqual(mr.kinds, ['count']);
assert.strictEqual(mx.summary.count_only, 1);

/* ---- v0.3 snapshot (no definition attributes, no columns) ---- */
const O = JSON.parse(JSON.stringify(snap));
O.instance.instance_name = 'old1'; O.collected_at = '2026-11-04 01:00:00'; O.collector_version = '0.3.0-poc';
delete O.categories.columns;
O.categories.tables.items.forEach(i => { ['scope', 'package', 'extensible', 'accessible_from', 'web_service_access', 'auto_number', 'clone_exclusion_rules', 'clone_preserver_rules'].forEach(k => delete i.attributes[k]); i.hash = 'OLD' + i.key; });
ctx.__O = vm.runInContext('(' + JSON.stringify(O) + ')', ctx);
R(CFG + 'new ConfigNowImporter({ config: c }).importSnapshot(__O)');
const oc = R(CFG + 'new ConfigNowCompare({ config: c }).compare("dev1", "old1")');
assert.strictEqual(oc.categories.tables.rows.length, 0, 'attributes missing on the older side are not drift');
assert.deepStrictEqual(oc.categories.columns.not_collected, ['old1'], 'columns not collected on a v0.3 snapshot');

/* ---- customer query properties ---- */
{
  const e3 = env({ 'x_2160899_driftw_0.customer_global_query': 'sys_created_by=system', 'x_2160899_driftw_0.customer_scoped_query': 'sys_package=com.snc.core' });
  const s3 = e3.R(CFG + 'new ConfigNowCollector({ config: c }).collect()');
  const a3 = s3.categories.tables.items.find(i => i.key === 'sys_script').attributes;
  assert.strictEqual(a3.customer_global, 2, 'global property overrides'); assert.strictEqual(a3.customer_scoped, 1, 'scoped property overrides');
}

/* ---- option 2: customer update history (off by default) ---- */
{
  const e4 = env({ 'x_2160899_driftw_0.customer_history': 'true' });
  e4.D.sys_db_object.rows.push({ sys_id: 'SI', name: 'sys_script_include', label: 'Script Include' });
  e4.D.sys_update_version = T(['name', 'state', 'source_table'], [
    { name: 'sys_script_aaa', state: 'current', source_table: 'sys_update_set' },          // counted
    { name: 'sys_script_bbb', state: 'current', source_table: 'sys_remote_update_set' },   // counted
    { name: 'sys_script_aaa', state: 'previous', source_table: 'sys_update_set' },         // not current
    { name: 'sys_script_ccc', state: 'current', source_table: 'sys_upgrade_history' },     // platform upgrade
    { name: 'sys_script_include_ddd', state: 'current', source_table: 'sys_update_set' }   // other table, same prefix
  ]);
  const s4 = e4.R(CFG + 'new ConfigNowCollector({ config: c }).collect()');
  const a4 = s4.categories.tables.items.find(i => i.key === 'sys_script').attributes;
  assert.strictEqual(a4.customer_updates, 2, 'current versions from customer update sets, siblings excluded');
  assert.strictEqual(s4.categories.tables.items.find(i => i.key === 'x_acme_app_orders').attributes.customer_updates, null, 'data table');
  assert.strictEqual(e4.R('ConfigNowConfig.get().customerHistory'), true);
}

/* ---- global scope (Java strings) ---- */
{
  const ej = env({}, { javaStrings: true });
  const sj = ej.R(CFG + 'new ConfigNowCollector({ config: c }).collect()');
  assert.deepStrictEqual(sj.warnings.filter(w => w.area !== 'instance.nodes'), [], 'no Java-string failures');
  assert.strictEqual(sj.categories.columns.items.length, 4);
}
console.log('V0.4 TESTS PASSED');
