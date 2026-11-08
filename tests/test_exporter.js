// Exporter: run dist/export_snapshot.js on an instance WITHOUT the app, then
// import the attached JSON into an instance WITH the app and compare.
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const { makeEnv, load } = require('./harness');
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: 'r' + i + Math.random().toString(16).slice(2, 6) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed'];

// --- remote instance: no app tables at all ---
const R1 = {
  sys_user: T(['user_name'], [{ sys_id: 'u1', user_name: 'admin' }]),
  sys_plugins: T(['source', 'version', 'active'], [{ source: 'com.a', name: 'A', version: '1', active: '1' }]),
  sys_properties: T(['value', 'type', 'is_private', 'sys_scope'], [{ name: 'glide.ui.session_timeout', value: '45', type: 'integer' }]),
  sys_db_object: T(['label', 'super_class'], [{ name: 'sys_script', label: 'Business Rule' }]),
  sys_dictionary: T(['element', 'internal_type', 'max_length'], [{ name: 'sys_script', element: 'script', internal_type: 'script', max_length: '8000' }]),
  sys_script: T(['sys_package', 'sys_scope', 'sys_scope.scope'], [{ sys_package: 'global', 'sys_scope.scope': 'global' }, { sys_package: 'com.snc.core', 'sys_scope.scope': 'global' }])
};
const p1 = { instance_name: 'remote1', 'glide.war': 'glide-australia-01-01-2026__patch2.zip', 'glide.servlet.uri': 'https://remote1.example/' };
const e1 = makeEnv(R1, p1, { javaStrings: true }); // global scope: Java strings
const attachments = [];
e1.ctx.GlideSysAttachment = class { write(rec, name, type, data) { attachments.push({ table: rec.t, rec: rec.getUniqueValue(), name, type, data }); return 'att1'; } };
e1.ctx.gs.getUserID = () => 'u1'; e1.ctx.gs.getUserName = () => 'admin';
const writesBefore = JSON.stringify(R1);
vm.runInContext(fs.readFileSync(__dirname + '/../dist/export_snapshot.js', 'utf8'), e1.ctx);
assert.strictEqual(JSON.stringify(R1), writesBefore, 'exporter writes no records besides the attachment');
assert.strictEqual(attachments.length, 1); const att = attachments[0];
assert.strictEqual(att.table, 'sys_user'); assert.strictEqual(att.rec, 'u1'); assert.strictEqual(att.type, 'application/json');
assert.match(att.name, /^driftwood_remote1_\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
const out = e1.out.join('\n');
assert.match(out, /Download : https:\/\/remote1\.example\/sys_attachment\.do\?sys_id=att1/);
const snap = JSON.parse(att.data);
assert.strictEqual(snap.schema, 'driftwood.snapshot/0.1'); assert.match(snap.collector_version, /-exporter$/); assert.strictEqual(snap.collector_scope, '');
assert.strictEqual(snap.instance.family, 'Australia');
assert.ok(snap.categories.tables, 'tables category included');
{ const at = snap.categories.tables.items.find(i => i.key === 'sys_script').attributes;
  assert.strictEqual(at.customer_global, 1); assert.strictEqual(at.customer_scoped, 0); assert.ok(!('customer' in at)); assert.ok(!('customer_updates' in at), 'history off by default'); }

// --- comparing instance WITH the app ---
const D = {
  sys_plugins: T(['source', 'version', 'active'], [{ source: 'com.a', name: 'A', version: '1', active: '1' }]),
  sys_properties: T(['value', 'type', 'is_private', 'sys_scope'], [{ name: 'glide.ui.session_timeout', value: '30', type: 'integer' }]),
  x_2160899_driftw_0_cmdb_ci_sn_instance: T(['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary']),
  x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin: T(tracked), x_2160899_driftw_0_tracked_item: T(tracked)
};
const p2 = { instance_name: 'home1', 'glide.war': 'glide-brazil-x__patch1.zip' };
['applications', 'mid_servers', 'system_properties', 'clone_preservers', 'clone_exclusions'].forEach(c => p2['x_2160899_driftw_0.table.' + c] = 'x_2160899_driftw_0_tracked_item');
const e2 = makeEnv(D, p2);
load(e2.ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowCollector.js', 'src/script_includes/ConfigNowWriter.js', 'src/script_includes/ConfigNowCompare.js', 'src/script_includes/ConfigNowImporter.js']);
const R = s => JSON.parse(JSON.stringify(vm.runInContext(s, e2.ctx)));
assert.strictEqual(R('({ e: new ConfigNowImporter().validate(' + att.data + ') })').e, '', 'exported file passes import validation');
e2.ctx.__S = vm.runInContext('(' + att.data + ')', e2.ctx);
const imp = R('new ConfigNowImporter().importSnapshot(__S)');
assert.strictEqual(imp.instance_name, 'remote1'); assert.ok(imp.totals.inserted > 0);
R('var s = new ConfigNowCollector().collect(); new ConfigNowWriter().persist(s); ({})');
const cmp = R('new ConfigNowCompare().compare("home1", "remote1")');
assert.deepStrictEqual(cmp.categories.system_properties.rows.find(r => r.key === 'glide.ui.session_timeout').fields, ['value']);
assert.strictEqual(cmp.categories.plugins.counts.same, 1);
console.log('EXPORTER TESTS PASSED');
