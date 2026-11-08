// v0.6 O02: tracked objects – resolution on persist, inherited columns (Z12),
// backfill fix script (dry run, live, idempotent), and a replay of real
// snapshots (DRIFTWOOD_SNAPSHOTS=dir of *.json; skipped when not set).
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const { makeEnv, load } = require('./harness');
const P = 'x_2160899_driftw_0_';
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: r.sys_id || ('r' + i + Math.random().toString(16).slice(2, 8)) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'source_table', 'source_url', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed'];
const instFields = ['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary', 'retention_days'];
const runFields = ['run_id', 'instance', 'source', 'mode', 'collected_at', 'persisted_at', 'collector_version', 'collector_scope', 'duration_ms', 'categories', 'baseline_categories', 'totals', 'changes_logged', 'warnings_count', 'warnings', 'watermarks', 'snapshot_attached'];
const changeFields = ['run', 'instance', 'item_category', 'item_key', 'item_name', 'change_type', 'changed_fields', 'old_data', 'new_data', 'changed_on', 'source_url'];
const objFields = ['object_key', 'item_category', 'item_key', 'parent_object', 'drift_status', 'drift_kinds', 'present_count', 'instance_count', 'differs_on', 'missing_on', 'differs_on_prod', 'baseline_instance', 'last_compared', 'drift_changed', 'first_seen'];

// v06 = false: a v0.5 schema (no tracked_object, no Object column)
function env(v06) {
  const obj = v06 ? ['object'] : [];
  const D = {
    [P + 'cmdb_ci_sn_instance']: T(instFields),
    [P + 'tracked_item']: T(['name'].concat(tracked, obj)),
    [P + 'cmdb_ci_sn_tracked_plugin']: T(['name'].concat(tracked, obj)),
    [P + 'collection_run']: T(runFields), [P + 'item_change']: T(changeFields.concat(obj)),
    sys_attachment: T(['table_name', 'table_sys_id', 'file_name'])
  };
  if (v06) { D[P + 'tracked_object'] = T(objFields); D[P + 'tracked_object'].unique = ['object_key']; }
  const props = { instance_name: 'dev1' };
  ['applications', 'mid_servers', 'system_properties', 'clone_preservers', 'clone_exclusions'].forEach(c => props['x_2160899_driftw_0.table.' + c] = P + 'tracked_item');
  const { ctx } = makeEnv(D, props);
  ctx.GlideSysAttachment = class { write() { return 'att'; } };
  load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowWriter.js', 'src/script_includes/ConfigNowObjects.js',
    'src/script_includes/ConfigNowCompare.js', 'src/script_includes/ConfigNowDrift.js', 'src/script_includes/ConfigNowMigration.js']);
  ctx.__snap = null;
  const R = s => { const v = vm.runInContext(s, ctx); return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; };
  const persist = (snap, ts) => { ctx.__snap = snap; return R('new ConfigNowWriter().persist(__snap, { timestamp: "' + (ts || '2026-11-08 02:15:00') + '", source: "import" })'); };
  return { D, ctx, R, persist, props };
}
const rows = (E, t) => E.D[P + t].rows;
let h = 0;
const item = (cat, key, value, attrs) => ({ category: cat, key, name: key, value: value || '', version: '', state: 'present', attributes: attrs || {}, runtime: {}, hash: 'h' + (++h), source_table: 'sys_x', source_sys_id: 's' + h });
const snap = (name, cats) => ({ collected_at: '2026-11-08 02:00:00', collector_version: 't', instance: { instance_name: name, instance_url: 'https://' + name + '.service-now.com' }, categories: cats, warnings: [] });

/* 1. Persist on a v0.6 schema creates and links objects */
{
  const E = env(true);
  const tables = [item('tables', 'cmdb_ci', '', { parent: '' }), item('tables', 'cmdb_ci_server', '', { parent: 'cmdb_ci' }), item('tables', 'incident', '', { parent: 'task' })];
  const cols = [item('columns', 'cmdb_ci.name'), item('columns', 'cmdb_ci_server.name'), item('columns', 'cmdb_ci_server.ram'), item('columns', 'incident.state')];
  const props = [item('system_properties', 'glide.a', '1'), item('system_properties', 'glide.b', '2')];
  const plugins = [item('plugins', 'com.snc.incident', 'active')];
  const r1 = E.persist(snap('dev1', { tables: { items: tables }, columns: { items: cols }, system_properties: { items: props }, plugins: { items: plugins } }));
  const objs = rows(E, 'tracked_object');
  // 3 tables + 3 columns (cmdb_ci_server.name is inherited) + 2 props + 1 plugin
  assert.strictEqual(objs.length, 9, objs.map(o => o.object_key).join(' '));
  assert.ok(!objs.find(o => o.object_key === 'columns|cmdb_ci_server.name'), 'inherited column gets no object');
  assert.deepStrictEqual(r1.objects, { created: 9, linked: 9, touched: 9 });
  const inh = rows(E, 'tracked_item').find(r => r.item_key === 'cmdb_ci_server.name'); assert.ok(!inh.object);
  assert.ok(rows(E, 'tracked_item').filter(r => r.item_key !== 'cmdb_ci_server.name').every(r => r.object), 'every other observation linked');
  assert.ok(rows(E, 'cmdb_ci_sn_tracked_plugin')[0].object, 'plugin CI linked');
  const ram = objs.find(o => o.object_key === 'columns|cmdb_ci_server.ram');
  assert.strictEqual(ram.parent_object, objs.find(o => o.object_key === 'tables|cmdb_ci_server').sys_id, 'column -> table parent');
  assert.strictEqual(ram.drift_status, 'single', 'one instance so far'); assert.ok(r1.drift.evaluated >= 9); assert.strictEqual(ram.item_category, 'columns'); assert.strictEqual(ram.item_key, 'cmdb_ci_server.ram');
  assert.strictEqual(ram.first_seen, '2026-11-08 02:15:00');

  // 2. a second instance reuses the same objects; one new property
  const r2 = E.persist(snap('dev2', { system_properties: { items: [item('system_properties', 'glide.a', '9'), item('system_properties', 'glide.c', '3')] } }));
  assert.strictEqual(rows(E, 'tracked_object').length, 10);
  assert.deepStrictEqual(r2.objects, { created: 1, linked: 2, touched: 2 });
  const a = rows(E, 'tracked_item').filter(r => r.item_key === 'glide.a'); assert.strictEqual(a.length, 2); assert.strictEqual(a[0].object, a[1].object);

  // 3. unchanged re-persist: no objects, no writes to observations
  const w0 = E.D[P + 'tracked_item'].writes;
  const r3 = E.persist(snap('dev2', { system_properties: { items: [item('system_properties', 'glide.a', '9'), item('system_properties', 'glide.c', '3')].map((it, i) => Object.assign(it, { hash: rows(E, 'tracked_item').find(r => r.item_key === it.key && r.instance === a[1].instance).value_hash })) } }));
  assert.strictEqual(E.D[P + 'tracked_item'].writes, w0, 'change-only');
  assert.deepStrictEqual(r3.objects, { created: 0, linked: 0, touched: 0 });

  // 4. a change and a removal touch their objects; the change row carries the object
  const dev2 = rows(E, 'tracked_item').find(r => r.item_key === 'glide.a' && r.instance === a[1].instance);
  const r4 = E.persist(snap('dev2', { system_properties: { items: [item('system_properties', 'glide.a', '10')] } }));
  assert.strictEqual(r4.objects.touched, 2, 'changed glide.a + removed glide.c');
  const ch = rows(E, 'item_change').filter(c => c.item_key === 'glide.a' || c.item_key === 'glide.c');
  assert.strictEqual(ch.length, 2); assert.ok(ch.every(c => c.object), 'change rows linked to objects');
  assert.strictEqual(ch.find(c => c.item_key === 'glide.a').object, dev2.object);

  // 5. unique key: a second resolver (no cache) that loses the insert race reuses the winner
  const id = E.R('var o = new ConfigNowObjects(); o.loaded.system_properties = true; o.resolve("system_properties", "glide.a", "glide.a")');
  assert.strictEqual(id, dev2.object); assert.strictEqual(rows(E, 'tracked_object').length, 10);
  console.log('persist: objects created on first sight, shared across instances, change-only, inherited columns skipped');
}

/* 6. v0.5 data -> schema upgrade -> backfill (dry run, live, re-run) */
{
  const E = env(false);
  const tables = [item('tables', 'cmdb_ci', '', { parent: '' }), item('tables', 'x_tracked_plugin', '', { parent: 'cmdb_ci' })];
  const cols = [item('columns', 'cmdb_ci.name'), item('columns', 'x_tracked_plugin.name'), item('columns', 'x_tracked_plugin.own')];
  E.persist(snap('dev1', { tables: { items: tables }, columns: { items: cols }, system_properties: { items: [item('system_properties', 'glide.a', '1')] }, plugins: { items: [item('plugins', 'com.x', 'active')] } }));
  E.persist(snap('dev2', { system_properties: { items: [item('system_properties', 'glide.a', '2'), item('system_properties', 'glide.z', '1')] } }));
  const nObs = rows(E, 'tracked_item').length + rows(E, 'cmdb_ci_sn_tracked_plugin').length;
  assert.strictEqual(nObs, 9);
  // upgrade the schema (build_schema.js for v0.6)
  E.D[P + 'tracked_object'] = T(objFields); E.D[P + 'tracked_object'].unique = ['object_key'];
  ['tracked_item', 'cmdb_ci_sn_tracked_plugin', 'item_change'].forEach(t => E.D[P + t].fields.push('object'));
  const snapAll = JSON.stringify(E.D);
  const dry = E.R('new ConfigNowObjects().backfill({ dryRun: true })');
  assert.strictEqual(JSON.stringify(E.D), snapAll, 'dry run writes nothing');
  // objects: 2 tables + 2 columns (x_tracked_plugin.name inherited) + glide.a + glide.z + com.x = 7
  assert.strictEqual(dry.objects_created, 7); assert.strictEqual(dry.linked, 8); assert.strictEqual(dry.inherited, 1);
  assert.match(dry.text, /Would create: 7 object\(s\); would link: 8; already linked: 0; inherited columns: 1\./);
  assert.match(dry.text, /Instance dev1: would link 6 observation\(s\), 1 inherited column\(s\) left without an object/);
  const live = E.R('new ConfigNowObjects().backfill({ dryRun: false })');
  assert.strictEqual(live.objects_created, 7); assert.strictEqual(live.linked, 8);
  assert.strictEqual(rows(E, 'tracked_object').length, 7);
  assert.ok(rows(E, 'cmdb_ci_sn_tracked_plugin').every(r => r.object));
  const ga = rows(E, 'tracked_item').filter(r => r.item_key === 'glide.a'); assert.strictEqual(ga[0].object, ga[1].object);
  const again = E.R('new ConfigNowObjects().backfill({ dryRun: false })');
  assert.strictEqual(again.objects_created, 0); assert.strictEqual(again.linked, 0); assert.strictEqual(again.already_linked, 8);
  assert.strictEqual(rows(E, 'tracked_object').length, 7, 're-run creates nothing');
  // after the backfill a normal persist links nothing new
  const keep = rows(E, 'tracked_item').filter(r => r.instance === ga[1].instance).map(r => Object.assign(item('system_properties', r.item_key), { hash: r.value_hash }));
  assert.deepStrictEqual(E.persist(snap('dev2', { system_properties: { items: keep } })).objects, { created: 0, linked: 0, touched: 0 });
  // without the v0.6 schema the backfill refuses
  const old = env(false); assert.match(old.R('new ConfigNowObjects().backfill({ dryRun: true }).text'), /ABORT: .*tracked_object is not installed/);
  console.log('backfill: dry run writes nothing; live run links everything once; re-run is a no-op');
}

/* 7. A v0.5 persist (no tracked_object) is unchanged */
{
  const E = env(false);
  const r = E.persist(snap('dev1', { system_properties: { items: [item('system_properties', 'glide.a', '1')] } }));
  assert.deepStrictEqual(r.objects, { created: 0, linked: 0, touched: 0 });
  assert.ok(!('object' in rows(E, 'tracked_item')[0]));
  console.log('v0.5 schema: writer behaves as before');
}

/* 9. Stored drift (O03) */
{
  const E = env(true);
  const inst = n => rows(E, 'cmdb_ci_sn_instance').find(r => r.instance_name === n);
  const O = k => rows(E, 'tracked_object').find(o => o.object_key === k);
  const props = vals => ({ system_properties: { items: Object.keys(vals).map(k => item('system_properties', k, vals[k])) } });
  const tbl = (total, cust) => ({ tables: { items: [item('tables', 'sys_script', '', { parent: 'sys_metadata', fingerprint: 'f1', total, customer_scoped: cust })] } });
  // dev1 is the baseline (instance_name), test1 and prod1 follow
  E.persist(snap('dev1', Object.assign(props({ 'glide.a': '1', 'glide.b': '1', 'glide.c': '1', 'glide.servlet.uri': 'https://dev1/' }), tbl(100, 5), { update_sets: { items: [item('update_sets', 'origin:US1')] } })));
  E.persist(snap('test1', Object.assign(props({ 'glide.a': '1', 'glide.b': '1', 'glide.servlet.uri': 'https://test1/' }), tbl(120, 5))));
  E.persist(snap('prod1', Object.assign(props({ 'glide.a': '1', 'glide.b': '2', 'glide.c': '1', 'glide.servlet.uri': 'https://prod1/' }), tbl(130, 5))));
  inst('prod1').environment = 'Production'; inst('test1').environment = 'Test'; inst('dev1').environment = 'Development';
  const full = E.R('new ConfigNowDrift().recompute()');
  assert.strictEqual(O('system_properties|glide.a').drift_status, 'same');
  // O04: the matrix for one key returns the row even when it is the same everywhere
  const one = E.R('new ConfigNowCompare().compareMany([], { categories: ["system_properties"], keys: ["glide.a"] })');
  assert.deepStrictEqual(one.categories.system_properties.rows.map(r => r.key + ':' + r.status), ['glide.a:same']);
  assert.strictEqual(one.categories.system_properties.rows[0].cells.length, 3);
  const ig = E.R('new ConfigNowCompare().compareMany([], { categories: ["system_properties"], keys: ["glide.servlet.uri"] })').categories.system_properties.rows[0];
  assert.strictEqual(ig.ignored, true); assert.strictEqual(ig.status, 'differs');
  const full0 = E.R('new ConfigNowCompare().compareMany([])');
  assert.ok(!full0.categories.system_properties.rows.some(r => r.status === 'same' || r.key === 'glide.servlet.uri'), 'without keys: unchanged behaviour');
  const b = O('system_properties|glide.b');
  assert.strictEqual(b.drift_status, 'differs'); assert.strictEqual(b.drift_kinds, 'config'); assert.strictEqual(b.differs_on, 'prod1');
  assert.strictEqual(b.differs_on_prod, 'true'); assert.strictEqual(b.baseline_instance, inst('dev1').sys_id);
  assert.strictEqual(String(b.present_count), '3'); assert.strictEqual(String(b.instance_count), '3');
  const c = O('system_properties|glide.c');
  assert.strictEqual(c.drift_status, 'missing'); assert.strictEqual(c.missing_on, 'test1'); assert.strictEqual(c.differs_on_prod, 'false');
  assert.strictEqual(O('system_properties|glide.servlet.uri').drift_status, 'ignored');
  const t = O('tables|sys_script'); assert.strictEqual(t.drift_status, 'differs'); assert.strictEqual(t.drift_kinds, 'count', 'count-only');
  assert.strictEqual(t.differs_on, 'test1, prod1');
  assert.strictEqual(O('update_sets|origin:US1').drift_status, 'single', 'only dev1 collects update sets');
  assert.ok(O('system_properties|glide.b').drift_changed && O('system_properties|glide.b').last_compared);
  // change-only: a second pass writes nothing
  const w = E.D[P + 'tracked_object'].writes;
  const again = E.R('new ConfigNowDrift().recompute()');
  assert.strictEqual(again.changed, 0); assert.strictEqual(E.D[P + 'tracked_object'].writes, w);
  // Environment changes are picked up by the daily pass; dry run writes nothing
  inst('test1').environment = 'Production';
  const dry = E.R('new ConfigNowDrift().recompute({ dryRun: true })');
  assert.strictEqual(dry.changed, 2, 'glide.c (missing) and sys_script (count) now on a Prod instance'); assert.strictEqual(O('system_properties|glide.c').differs_on_prod, 'false');
  E.R('new ConfigNowDrift().recompute()'); assert.strictEqual(O('system_properties|glide.c').differs_on_prod, 'true', 'missing on a Prod instance');
  inst('test1').environment = 'Test'; E.R('new ConfigNowDrift().recompute()');
  // a save recomputes what it touched: glide.a changes on test1, glide.c appears there
  const keepT = rows(E, 'tracked_item').filter(r => r.instance === inst('test1').sys_id && r.item_category === 'system_properties')
    .map(r => Object.assign(item('system_properties', r.item_key, r.item_value), { hash: r.value_hash }));
  keepT.find(i => i.key === 'glide.a').hash = 'changed'; keepT.find(i => i.key === 'glide.a').value = '9';
  keepT.push(item('system_properties', 'glide.c', '1'));
  O('system_properties|glide.c').drift_changed = 'before'; const st = 'before'; // the mock clock is fixed
  const r = E.persist(snap('test1', { system_properties: { items: keepT } }), '2026-11-09 02:15:00');
  assert.strictEqual(r.drift.evaluated, 3, 'the 2 touched objects + tables, which test1 no longer reports'); assert.strictEqual(r.drift.changed, 3);
  assert.strictEqual(String(O('tables|sys_script').instance_count), '2');
  assert.strictEqual(O('system_properties|glide.a').drift_status, 'differs'); assert.strictEqual(O('system_properties|glide.a').differs_on, 'test1');
  assert.strictEqual(O('system_properties|glide.c').drift_status, 'same'); assert.notStrictEqual(O('system_properties|glide.c').drift_changed, st);
  assert.strictEqual(E.R('new ConfigNowDrift().recompute()').changed, 0, 'the daily pass then finds nothing');
  // a new instance's first load recomputes the whole category (instance counts change)
  const r4 = E.persist(snap('qa1', props({ 'glide.a': '1' })));
  assert.ok(r4.drift.evaluated >= 4, 'whole system_properties category');
  assert.strictEqual(String(O('system_properties|glide.b').instance_count), '4'); assert.strictEqual(O('system_properties|glide.b').missing_on, 'qa1');
  assert.strictEqual(E.R('new ConfigNowDrift().recompute()').changed, 0);
  // a failing drift engine never fails the save
  E.R('ConfigNowDrift.prototype._saved = ConfigNowDrift.prototype.recompute; ConfigNowDrift.prototype.recompute = function () { throw new Error("boom"); }');
  const r5 = E.persist(snap('qa1', props({ 'glide.a': '2' })));
  assert.strictEqual(r5.drift.error, 'boom'); assert.strictEqual(r5.totals.updated, 1);
  E.R('ConfigNowDrift.prototype.recompute = ConfigNowDrift.prototype._saved');
  console.log('drift: matrix statuses and kinds, ignored, count-only, single, Prod flag; change-only; touched-only after a save; first load = whole category');
}

/* 10. Plugins leave the CMDB (O05) */
{
  const E = env(true);
  const plug = (key, ver) => Object.assign(item('plugins', key, 'active'), { version: ver });
  const ciRows = () => rows(E, 'cmdb_ci_sn_tracked_plugin'), plain = () => rows(E, 'tracked_item').filter(r => r.item_category === 'plugins');
  E.persist(snap('dev1', { plugins: { items: [plug('com.a', '1'), plug('com.b', '1'), plug('com.gone', '1')] } }), '2026-11-01 02:15:00');
  E.persist(snap('dev2', { plugins: { items: [plug('com.a', '2'), plug('com.b', '1')] } }), '2026-11-01 02:15:00');
  E.persist(snap('dev1', { plugins: { items: [plug('com.a', '1'), plug('com.b', '1')].map(i => Object.assign(i, { hash: ciRows().find(r => r.item_key === i.key && r.instance === rows(E, 'cmdb_ci_sn_instance').find(x => x.instance_name === 'dev1').sys_id).value_hash })) } }), '2026-11-02 02:15:00');
  assert.strictEqual(ciRows().length, 5); assert.strictEqual(plain().length, 0);
  assert.strictEqual(ciRows().find(r => r.item_key === 'com.gone').present, 'false', 'removed plugin kept with present=false');
  E.R('new ConfigNowDrift().recompute()');
  const mxBefore = JSON.stringify(E.R('new ConfigNowCompare().compareMany([], { categories: ["plugins"] })').categories.plugins.rows.map(r => [r.key, r.status, r.kinds]));
  const objBefore = JSON.stringify(rows(E, 'tracked_object').map(o => [o.object_key, o.drift_status, o.drift_kinds, o.differs_on, o.missing_on]));
  // dry run
  const all0 = JSON.stringify(E.D);
  const dry = E.R('new ConfigNowMigration().movePlugins({ dryRun: true })');
  assert.strictEqual(JSON.stringify(E.D), all0, 'dry run writes nothing');
  assert.strictEqual(dry.cis, 5); assert.strictEqual(dry.copied, 5); assert.strictEqual(dry.safe_to_delete, false);
  assert.match(dry.text, /Instance dev1: 3 plugin CI\(s\) – would copy 3/); assert.match(dry.text, /still the CI table/);
  // live copy (routing not yet switched)
  const live = E.R('new ConfigNowMigration().movePlugins()');
  assert.strictEqual(live.copied, 5); assert.strictEqual(live.safe_to_delete, true); assert.match(live.text, /SAFE TO DELETE/);
  assert.strictEqual(plain().length, 5);
  for (const c of ciRows()) {
    const p = plain().find(r => r.instance === c.instance && r.item_key === c.item_key);
    for (const f of ['item_version', 'value_hash', 'present', 'first_seen', 'last_changed', 'object', 'source_url', 'name']) assert.strictEqual(String(p[f]), String(c[f]), f + ' kept for ' + c.item_key);
  }
  assert.strictEqual(plain().find(r => r.item_key === 'com.gone').present, 'false');
  // re-run: nothing more
  const dry2 = E.R('new ConfigNowMigration().movePlugins({ dryRun: true })');
  assert.strictEqual(dry2.safe_to_delete, true); assert.match(dry2.text, /Every plugin CI already has a plain copy\. SAFE TO DELETE/);
  const again = E.R('new ConfigNowMigration().movePlugins()');
  assert.strictEqual(again.copied, 0); assert.strictEqual(again.already, 5); assert.strictEqual(plain().length, 5);
  // switch the routing (install_code.js), delete the CIs ("Delete All Records")
  E.props['x_2160899_driftw_0.table.plugins'] = P + 'tracked_item';
  E.D[P + 'cmdb_ci_sn_tracked_plugin'].rows = [];
  assert.match(E.R('new ConfigNowMigration().movePlugins({ dryRun: true }).text'), /0 plugin CI\(s\).*\n?.*/);
  // the comparison and the stored drift are unchanged; a collection writes nothing new
  assert.strictEqual(JSON.stringify(E.R('new ConfigNowCompare().compareMany([], { categories: ["plugins"] })').categories.plugins.rows.map(r => [r.key, r.status, r.kinds])), mxBefore, 'matrix unchanged');
  assert.strictEqual(E.R('new ConfigNowDrift().recompute()').changed, 0, 'stored drift unchanged');
  assert.strictEqual(JSON.stringify(rows(E, 'tracked_object').map(o => [o.object_key, o.drift_status, o.drift_kinds, o.differs_on, o.missing_on])), objBefore);
  const d1 = rows(E, 'cmdb_ci_sn_instance').find(x => x.instance_name === 'dev1').sys_id;
  const keep = plain().filter(r => r.instance === d1 && r.present === 'true').map(r => Object.assign(plug(r.item_key, r.item_version), { hash: r.value_hash }));
  const r = E.persist(snap('dev1', { plugins: { items: keep } }), '2026-11-03 02:15:00');
  assert.deepStrictEqual(r.totals, { inserted: 0, updated: 0, unchanged: 2, removed: 0, restored: 0 }); assert.deepStrictEqual(r.baseline, [], 'not a baseline');
  console.log('plugins: dry run writes nothing; copy keeps every field; re-run no-op; after the switch and the delete, matrix + drift unchanged and collections carry on');
}
/* 11. Routing switched before the copy: a collection already wrote plain rows */
{
  const E = env(true);
  E.persist(snap('dev1', { plugins: { items: [item('plugins', 'com.a', 'active')] } }), '2026-10-01 02:15:00');
  E.props['x_2160899_driftw_0.table.plugins'] = P + 'tracked_item';
  E.persist(snap('dev1', { plugins: { items: [item('plugins', 'com.a', 'active')] } }), '2026-11-05 02:15:00');
  const pr = rows(E, 'tracked_item').filter(r => r.item_category === 'plugins');
  assert.strictEqual(pr.length, 1); assert.strictEqual(pr[0].first_seen, '2026-11-05 02:15:00');
  const m = E.R('new ConfigNowMigration().movePlugins()');
  assert.strictEqual(m.copied, 0); assert.strictEqual(m.merged, 1); assert.strictEqual(m.safe_to_delete, true);
  assert.strictEqual(rows(E, 'tracked_item').filter(r => r.item_category === 'plugins').length, 1, 'no duplicate');
  assert.strictEqual(pr[0].first_seen, '2026-10-01 02:15:00', 'older first_seen carried over');
  // nothing to do where plugins were never CIs
  const F = env(true); F.props['x_2160899_driftw_0.table.plugins'] = P + 'tracked_item';
  F.persist(snap('dev1', { plugins: { items: [item('plugins', 'com.a', 'active')] } }));
  const n = F.R('new ConfigNowMigration().movePlugins()');
  assert.strictEqual(n.cis, 0); assert.match(n.text, /No plugin CIs: nothing to copy or delete/);
  console.log('plugins: switch-before-copy merges (older first_seen kept, no duplicates); fresh installs: nothing to do');
}

/* 8. Replay of real snapshots */
const dir = process.env.DRIFTWOOD_SNAPSHOTS;
if (dir && fs.existsSync(dir)) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f))
    .map(f => JSON.parse(fs.readFileSync(f, 'utf8'))).filter(s => s.categories && s.categories.columns && s.instance);
  const E = env(true);
  const expect = new Set(); let inh = 0;
  for (const s of files) {
    const parents = {}; (s.categories.tables ? s.categories.tables.items : []).forEach(i => parents[i.key] = (i.attributes || {}).parent || '');
    const cols = new Set(s.categories.columns.items.map(i => i.key));
    for (const c in s.categories) for (const it of s.categories[c].items) {
      if (c === 'columns') {
        const [t, ...rest] = it.key.split('.'); const el = rest.join('.'); let p = parents[t], g = 0, isInh = false;
        while (p && g++ < 20) { if (cols.has(p + '.' + el)) { isInh = true; break; } p = parents[p]; }
        if (isInh) { inh++; continue; }
        expect.add('tables|' + t);
      }
      expect.add(c + '|' + it.key);
    }
    const r = E.persist(s, s.collected_at);
    console.log('  replay ' + s.instance.instance_name + ': ' + JSON.stringify(r.totals) + ' objects ' + JSON.stringify(r.objects));
  }
  const objs = rows(E, 'tracked_object');
  assert.strictEqual(new Set(objs.map(o => o.object_key)).size, objs.length, 'no duplicate objects');
  assert.deepStrictEqual(objs.map(o => o.object_key).sort(), [...expect].sort(), 'one object per category + key across all snapshots');
  const obs = rows(E, 'tracked_item').concat(rows(E, 'cmdb_ci_sn_tracked_plugin'));
  assert.strictEqual(obs.filter(o => !o.object).length, inh, 'only inherited columns are unlinked');
  const byCat = {}; objs.forEach(o => byCat[o.item_category] = (byCat[o.item_category] || 0) + 1);
  console.log('  replay: ' + files.length + ' snapshots, ' + obs.length + ' observations, ' + objs.length + ' objects ' + JSON.stringify(byCat) + ', inherited columns ' + inh);
  // stored drift agrees with the all-instances matrix (inherited columns have no object)
  const dr = E.R('new ConfigNowDrift().recompute()');
  const mx = E.R('new ConfigNowCompare().compareMany()');
  const byKey = {}; rows(E, 'tracked_object').forEach(o => byKey[o.object_key] = o);
  let nRows = 0;
  for (const cat in mx.categories) for (const row of mx.categories[cat].rows) {
    const o = byKey[cat + '|' + row.key];
    if (!o) { assert.strictEqual(cat, 'columns', 'only inherited columns lack an object: ' + row.key); continue; }
    nRows++;
    assert.strictEqual(o.drift_status, row.status === 'partial' ? 'missing' : 'differs', cat + '|' + row.key);
    assert.strictEqual(o.drift_kinds, row.kinds.join(','), 'kinds ' + cat + '|' + row.key);
  }
  const nDrift = rows(E, 'tracked_object').filter(o => ['missing', 'differs'].includes(o.drift_status) && Number(o.present_count) > 0).length;
  assert.strictEqual(nDrift, nRows, 'every drifting object is a matrix row and vice versa');
  assert.strictEqual(E.R('new ConfigNowDrift().recompute()').changed, 0);
  console.log('  drift parity: ' + nRows + ' matrix rows = drifting objects; ' + dr.text);
  // O05 on the real data: move the plugins, switch routing, delete the CIs; nothing changes
  const nCI = rows(E, 'cmdb_ci_sn_tracked_plugin').length;
  const mxP = JSON.stringify(E.R('new ConfigNowCompare().compareMany([], { categories: ["plugins"] })').categories.plugins);
  const mv = E.R('new ConfigNowMigration().movePlugins()');
  assert.strictEqual(mv.copied, nCI); assert.strictEqual(mv.safe_to_delete, true);
  E.props['x_2160899_driftw_0.table.plugins'] = P + 'tracked_item';
  E.D[P + 'cmdb_ci_sn_tracked_plugin'].rows = [];
  assert.strictEqual(JSON.stringify(E.R('new ConfigNowCompare().compareMany([], { categories: ["plugins"] })').categories.plugins), mxP, 'plugins matrix identical after the move');
  assert.strictEqual(E.R('new ConfigNowDrift().recompute()').changed, 0, 'stored drift identical after the move');
  console.log('  plugin move: ' + nCI + ' CIs copied, matrix and drift identical after the switch and delete');
  // the same data saved under v0.5, then upgraded and backfilled, gives the same objects
  const B = env(false);
  for (const s of files) B.persist(s, s.collected_at);
  B.D[P + 'tracked_object'] = T(objFields); B.D[P + 'tracked_object'].unique = ['object_key'];
  ['tracked_item', 'cmdb_ci_sn_tracked_plugin', 'item_change'].forEach(t => B.D[P + t].fields.push('object'));
  const t0 = Date.now(), bf = B.R('new ConfigNowObjects().backfill({ dryRun: false })');
  assert.deepStrictEqual(rows(B, 'tracked_object').map(o => o.object_key).sort(), objs.map(o => o.object_key).sort(), 'backfill = writer');
  assert.strictEqual(bf.inherited, inh); assert.strictEqual(bf.linked, obs.length - inh);
  assert.strictEqual(B.R('new ConfigNowObjects().backfill({ dryRun: false }).linked'), 0);
  console.log('  backfill replay: ' + bf.objects_created + ' objects, ' + bf.linked + ' links (' + (Date.now() - t0) + ' ms in the mock); re-run links 0');
}
console.log('V0.6 OBJECT TESTS PASSED');
