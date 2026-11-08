const vm = require('vm'), assert = require('assert');
const { makeEnv, load } = require('./harness');
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: 's' + i + Math.random().toString(16).slice(2, 6) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed'];
const D = {
  sys_plugins: T(['source', 'version', 'active'], [{ source: 'com.a', name: 'A', version: '1', active: '1' }, { source: 'com.b', name: 'B', version: '2', active: '1' }]),
  sys_store_app: T(['scope', 'version', 'active', 'vendor'], [{ scope: 'sn_x', name: 'X', version: '1.0', active: 'true', vendor: 'SN' }]),
  sys_properties: T(['value', 'type', 'is_private', 'sys_scope'], [
    { name: 'glide.servlet.uri', value: 'https://a.example/', type: 'string' },
    { name: 'glide.ui.session_timeout', value: '30', type: 'integer' },
    { name: 'glide.authenticate.sso.redirect.idp', value: 'secretA', type: 'password2' }]),
  x_2160899_driftw_0_cmdb_ci_sn_instance: T(['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary']),
  x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin: T(tracked), x_2160899_driftw_0_tracked_item: T(tracked)
};
const props = { instance_name: 'deva', 'glide.war': 'glide-brazil-x__patch1.zip' };
['applications', 'mid_servers', 'system_properties', 'clone_preservers', 'clone_exclusions'].forEach(c => props['x_2160899_driftw_0.table.' + c] = 'x_2160899_driftw_0_tracked_item');
props['x_2160899_driftw_0.categories'] = 'plugins,applications,mid_servers,system_properties,clone_preservers,clone_exclusions'; // pin pre-tables categories
const { ctx } = makeEnv(D, props);
let tick = 0; ctx.GlideDateTime = class { getValue() { return '2026-11-04 10:00:' + String(10 + (tick++ % 40)).padStart(2, '0'); } };
load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowCollector.js', 'src/script_includes/ConfigNowWriter.js', 'src/script_includes/ConfigNowCompare.js', 'src/script_includes/ConfigNowImporter.js']);
const R = s => { const v = vm.runInContext(s, ctx); return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; };

// A = local collection
const snapA = R('var s = new ConfigNowCollector().collect(); new ConfigNowWriter().persist(s); s');
// B = a different instance: one plugin missing, one extra, a changed property, changed secret, different URL
const snapB = JSON.parse(JSON.stringify(snapA));
snapB.instance.instance_name = 'prodb'; snapB.collected_at = '2026-11-03 02:15:00';
const P = snapB.categories.plugins.items;
snapB.categories.plugins.items = P.filter(i => i.key !== 'com.b').concat([Object.assign({}, P[0], { key: 'com.c', name: 'C', hash: 'HC' })]);
const sp = snapB.categories.system_properties.items;
sp.find(i => i.key === 'glide.ui.session_timeout').value = '60'; sp.find(i => i.key === 'glide.ui.session_timeout').hash = 'H60';
sp.find(i => i.key === 'glide.servlet.uri').value = 'https://b.example/'; sp.find(i => i.key === 'glide.servlet.uri').hash = 'HURI';
sp.find(i => i.key === 'glide.authenticate.sso.redirect.idp').hash = 'HSECRET';
ctx.__B = vm.runInContext('(' + JSON.stringify(snapB) + ')', ctx);

// import B
let imp = R('new ConfigNowImporter().importSnapshot(__B)');
assert.strictEqual(imp.instance_name, 'prodb'); assert.ok(imp.totals.inserted > 0); assert.strictEqual(imp.local, false);
const ciB = D.x_2160899_driftw_0_cmdb_ci_sn_instance.rows.find(r => r.instance_name === 'prodb');
assert.strictEqual(ciB.last_collected, '2026-11-03 02:15:00', 'import uses snapshot time');
assert.match(ciB.collection_summary, /"source":"import"/);
// re-import identical: no writes
imp = R('new ConfigNowImporter().importSnapshot(__B)'); assert.strictEqual(imp.totals.inserted + imp.totals.updated + imp.totals.removed, 0);
// older snapshot refused, force allowed
ctx.__OLD = vm.runInContext('(' + JSON.stringify(Object.assign({}, snapB, { collected_at: '2026-10-01 00:00:00' })) + ')', ctx);
assert.throws(() => R('new ConfigNowImporter().importSnapshot(__OLD)'), /older than the stored data/);
R('new ConfigNowImporter().importSnapshot(__OLD, { force: true })');
// validation
assert.match(R('new ConfigNowImporter().validate({schema:"x"})'), /Unsupported snapshot schema/);
assert.match(R('new ConfigNowImporter().validate({result:{schema:"driftwood.snapshot/0.1"}})'), /REST response/);

// compare
const inst = R('new ConfigNowCompare().listInstances()'); assert.deepStrictEqual(inst.map(i => i.instance_name), ['deva', 'prodb']);
assert.strictEqual(inst.find(i => i.instance_name === 'prodb').source, 'import');
const cmp = R('new ConfigNowCompare().compare("deva", "prodb")');
const pl = cmp.categories.plugins;
assert.deepStrictEqual(pl.counts, { same: 1, changed: 0, version_only: 0, count_only: 0, only_a: 1, only_b: 1, ignored: 0 });
assert.strictEqual(pl.rows.find(r => r.type === 'only_a').key, 'com.b'); assert.strictEqual(pl.rows.find(r => r.type === 'only_b').key, 'com.c');
const pr = cmp.categories.system_properties;
assert.strictEqual(pr.counts.ignored, 1, 'servlet.uri ignored');
const st = pr.rows.find(r => r.key === 'glide.ui.session_timeout'); assert.deepStrictEqual(st.fields, ['value']); assert.strictEqual(st.a.value, '30'); assert.strictEqual(st.b.value, '60');
const sec = pr.rows.find(r => r.key === 'glide.authenticate.sso.redirect.idp'); assert.deepStrictEqual(sec.fields, ['secure_value']);
assert.strictEqual(pr.counts.changed, 2);
assert.ok(!JSON.stringify(cmp).includes('secretA'), 'no secret in compare output');
assert.strictEqual(cmp.categories.applications.counts.same, 1);
// by sys_id too, and symmetric
const rev = R('new ConfigNowCompare().compare("' + inst[1].sys_id + '", "' + inst[0].sys_id + '")');
assert.strictEqual(rev.categories.plugins.rows.find(r => r.type === 'only_a').key, 'com.c');
assert.throws(() => R('new ConfigNowCompare().compare("deva", "nope")'), /Instance not found: nope/);
// older ConfigNowConfig (no compareIgnore) must not crash
const legacy = R('var cfg = ConfigNowConfig.get(); delete cfg.compareIgnore; new ConfigNowCompare({ config: cfg }).compare("deva", "prodb")');
assert.match(legacy.warning, /redeploy install_code/); assert.strictEqual(legacy.categories.system_properties.counts.ignored, 1);
// (a) own-instance snapshot refused unless allowLocal
ctx.__SELF = vm.runInContext('(' + JSON.stringify(snapA) + ')', ctx);
assert.throws(() => R('new ConfigNowImporter().importSnapshot(__SELF)'), /Snapshot is of THIS instance/);
const selfImp = R('new ConfigNowImporter().importSnapshot(__SELF, { allowLocal: true, force: true })'); assert.strictEqual(selfImp.local, true);

// (b) self-scope ignore, (c) vendor not drift + old-format snapshot, (d) version-only
{
  const C = JSON.parse(JSON.stringify(snapA));
  C.instance.instance_name = 'oldc'; C.collected_at = '2026-11-02 02:15:00'; C.collector_scope = 'x_9999999_other';
  const apps = C.categories.applications.items;
  const base = apps[0];
  // old collector format: vendor inside attributes and a different hash
  apps[0] = Object.assign({}, base, { attributes: { source: base.attributes.source, vendor: 'ServiceNow' }, hash: 'OLDFORMAT' });
  apps.push(Object.assign({}, base, { key: 'x_9999999_other', name: 'Other collector app', hash: 'O1' }));
  C.categories.plugins.items[0] = Object.assign({}, C.categories.plugins.items[0], { version: '9.9', hash: 'V99' });
  delete C.categories.plugins.items[0].runtime;
  ctx.__C = vm.runInContext('(' + JSON.stringify(C) + ')', ctx);
  R('new ConfigNowImporter().importSnapshot(__C)');
  // local app record for this app's own scope on A
  const own = D.x_2160899_driftw_0_tracked_item;
  const ci = D.x_2160899_driftw_0_cmdb_ci_sn_instance.rows.find(r => r.instance_name === 'deva');
  own.rows.push({ sys_id: 'own1', instance: ci.sys_id, item_category: 'applications', item_key: 'x_2160899_driftw_0', name: 'Driftwood', item_value: '', item_version: '0.2', item_state: 'active', value_hash: 'X', item_attributes: '{}', present: 'true' });
  const r2 = R('new ConfigNowCompare().compare("deva", "oldc")');
  const ac = r2.categories.applications;
  assert.strictEqual(ac.counts.same, 1, 'old-format/vendor-only difference counts as same: ' + JSON.stringify(ac));
  assert.strictEqual(ac.counts.ignored, 2, 'own scope and the other collector scope ignored');
  assert.strictEqual(ac.rows.length, 0);
  const pc = r2.categories.plugins;
  assert.strictEqual(pc.counts.version_only, 1); assert.strictEqual(pc.rows[0].version_only, true); assert.deepStrictEqual(pc.rows[0].fields, ['version']);
  assert.strictEqual(r2.b.collector_scope, 'x_9999999_other');
  console.log('a/b/c/d OK');
}
// ---- matrix (compareMany) + ordering ----
{
  const I = D.x_2160899_driftw_0_cmdb_ci_sn_instance.rows;
  I.find(r => r.instance_name === 'prodb').environment = 'Production';
  I.find(r => r.instance_name === 'oldc').environment = 'Development';
  let m = R('new ConfigNowCompare().compareMany([])');
  assert.deepStrictEqual(m.instances.map(i => i.instance_name), ['deva', 'oldc', 'prodb'], 'local first, then dev before prod');
  assert.strictEqual(m.baseline, 'deva'); assert.strictEqual(m.instances[0].is_local, true);
  // listInstances uses the same order
  assert.deepStrictEqual(R('new ConfigNowCompare().listInstances()').map(i => i.instance_name), ['deva', 'oldc', 'prodb']);
  // explicit order property wins over environment (current instance stays first)
  props['x_2160899_driftw_0.instance_order'] = 'prodb,oldc';
  assert.deepStrictEqual(R('new ConfigNowCompare().compareMany([])').instances.map(i => i.instance_name), ['deva', 'prodb', 'oldc']);
  delete props['x_2160899_driftw_0.instance_order'];
  // subset, given in any order, comes back ordered
  assert.deepStrictEqual(R('new ConfigNowCompare().compareMany(["prodb","deva"])').instances.map(i => i.instance_name), ['deva', 'prodb']);
  assert.throws(() => R('new ConfigNowCompare().compareMany(["deva"])'), /at least two/);

  m = R('new ConfigNowCompare().compareMany([])');
  const P = m.categories.plugins, rowsBy = k => P.rows.find(r => r.key === k);
  // com.a: deva 1, oldc 9.9 (version-only), prodb 1 -> differs, version_only
  assert.strictEqual(rowsBy('com.a').status, 'differs'); assert.strictEqual(rowsBy('com.a').version_only, true);
  assert.deepStrictEqual(rowsBy('com.a').cells.map(c => c && c.version), ['1', '9.9', '1']);
  assert.deepStrictEqual(rowsBy('com.a').cells[1].diff, ['version']); assert.deepStrictEqual(rowsBy('com.a').cells[2].diff, []);
  // com.b missing on prodb -> partial ; com.c only on prodb -> partial, reference column 2
  assert.strictEqual(rowsBy('com.b').status, 'partial'); assert.strictEqual(rowsBy('com.b').cells[2], null);
  assert.strictEqual(rowsBy('com.c').status, 'partial'); assert.strictEqual(rowsBy('com.c').reference, 2);
  assert.strictEqual(P.counts.version_only, 1);
  // properties: session_timeout differs only on prodb; servlet.uri ignored
  const st = m.categories.system_properties.rows.find(r => r.key === 'glide.ui.session_timeout');
  assert.deepStrictEqual(st.cells.map(c => c.value), ['30', '30', '60']); assert.deepStrictEqual(st.fields, ['value']);
  assert.ok(m.categories.system_properties.counts.ignored >= 1);
  // app records of both collector scopes ignored; vendor/old-format app counts as same
  assert.strictEqual(m.categories.applications.rows.length, 0, JSON.stringify(m.categories.applications.rows.map(r => r.key)));
  // per-instance tallies vs baseline
  const pp = m.per_instance.find(p => p.instance_name === 'prodb');
  assert.ok(pp.changed >= 2 && pp.missing >= 1 && pp.extra >= 1, JSON.stringify(pp));
  assert.strictEqual(m.per_instance[0].same, null);
  assert.ok(!JSON.stringify(m).includes('secretA'));
  console.log('matrix OK', JSON.stringify(m.summary));
}
console.log('summary', JSON.stringify(cmp.summary));
console.log('COMPARE + IMPORT TESTS PASSED');
