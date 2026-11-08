// v0.5: run history + change log, update sets (local/retrieved, incremental),
// source links, optional sys_id drift, retention purge.
const vm = require('vm'), assert = require('assert');
const { makeEnv, load } = require('./harness');
const P = 'x_2160899_driftw_0_';
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: r.sys_id || ('r' + i + Math.random().toString(16).slice(2, 8)) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'source_table', 'source_url', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed'];
const instFields = ['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary', 'retention_days'];
const runFields = ['run_id', 'instance', 'source', 'mode', 'collected_at', 'persisted_at', 'collector_version', 'collector_scope', 'duration_ms', 'categories', 'baseline_categories', 'totals', 'changes_logged', 'warnings_count', 'warnings', 'watermarks', 'snapshot_attached'];
const changeFields = ['run', 'instance', 'item_category', 'item_key', 'item_name', 'change_type', 'changed_fields', 'old_data', 'new_data', 'changed_on', 'source_url'];
const usFields = ['name', 'state', 'application', 'is_default', 'parent', 'base_update_set', 'origin_sys_id', 'release_date', 'sys_created_by', 'sys_created_on', 'sys_updated_on'];
const rusFields = ['name', 'state', 'application', 'origin_sys_id', 'remote_sys_id', 'update_set', 'parent', 'commit_date', 'sys_created_by', 'sys_created_on', 'sys_updated_on'];

function env(name, url, extra, props) {
  const D = Object.assign({
    sys_properties: T(['value', 'type', 'is_private', 'sys_scope'], [
      { sys_id: 'P1', name: 'glide.ui.session_timeout', value: '30', type: 'integer' },
      { sys_id: 'P2', name: 'glide.sys.date_format', value: 'yyyy-MM-dd', type: 'string' }]),
    sys_scope: T(['scope'], [{ sys_id: 'SCG', scope: 'global' }, { sys_id: 'SCA', scope: 'x_acme_app' }]),
    sys_update_set: T(usFields), sys_remote_update_set: T(rusFields),
    sys_update_xml: T(['update_set', 'remote_update_set', 'name']),
    sys_update_preview_problem: T(['remote_update_set', 'type', 'status']),
    sys_attachment: T(['table_name', 'table_sys_id', 'file_name']),
    [P + 'cmdb_ci_sn_instance']: T(instFields), [P + 'tracked_item']: T(['name'].concat(tracked)),
    [P + 'collection_run']: T(runFields), [P + 'item_change']: T(changeFields)
  }, extra || {});
  const p = Object.assign({ instance_name: name, 'glide.servlet.uri': url, 'glide.war': 'glide-brazil-x__patch1.zip',
    'x_2160899_driftw_0.categories': 'system_properties,update_sets' }, props || {});
  ['system_properties', 'update_sets'].forEach(c => p['x_2160899_driftw_0.table.' + c] = P + 'tracked_item');
  const { ctx } = makeEnv(D, p);
  const clock = { now: '2026-11-08 02:15:00' };
  ctx.GlideDateTime = class { getValue() { return clock.now; } };
  ctx.GlideSysAttachment = class {
    write(gr, file, type, data) { const id = 'att' + D.sys_attachment.rows.length + Math.random().toString(16).slice(2, 6); D.sys_attachment.rows.push({ sys_id: id, table_name: gr.t, table_sys_id: gr.cur.sys_id, file_name: file, size: data.length }); return id; }
    deleteAttachment(id) { const i = D.sys_attachment.rows.findIndex(r => r.sys_id === id); if (i > -1) D.sys_attachment.rows.splice(i, 1); }
  };
  load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowCollector.js', 'src/script_includes/ConfigNowWriter.js',
    'src/script_includes/ConfigNowCompare.js', 'src/script_includes/ConfigNowImporter.js', 'src/script_includes/ConfigNowRetention.js']);
  const R = s => { const v = vm.runInContext(s, ctx); return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; };
  const collect = (inc) => R('var s = new ConfigNowCollector({ incremental: ' + !!inc + ' }).collect(); var w = new ConfigNowWriter().persist(s); ({ snap: s, res: w })');
  return { D, ctx, R, clock, collect };
}
const rows = (D, t) => D[P + t].rows;

/* ================= Dev: builds update sets ================= */
const dev = env('dev1', 'https://dev1.service-now.com/');
const us = dev.D.sys_update_set.rows, xml = dev.D.sys_update_xml.rows;
us.push({ sys_id: 'USX', name: 'STRY001 Login tweaks', state: 'complete', application: 'SCG', is_default: 'false', sys_created_by: 'thomas', sys_created_on: '2026-10-01 10:00:00', sys_updated_on: '2026-10-02 10:00:00' });
us.push({ sys_id: 'USY', name: 'STRY002 Work in progress', state: 'in progress', application: 'SCA', is_default: 'false', sys_created_on: '2026-11-01 10:00:00', sys_updated_on: '2026-11-01 10:00:00' });
us.push({ sys_id: 'USD', name: 'Default', state: 'in progress', application: 'SCG', is_default: 'true', sys_created_on: '2026-01-01 00:00:00', sys_updated_on: '2026-11-07 09:00:00' });
for (let i = 0; i < 3; i++) xml.push({ update_set: 'USX', name: 'sys_script_' + i });
xml.push({ update_set: 'USY', name: 'sys_ui_page_1' });
for (let i = 0; i < 5; i++) xml.push({ update_set: 'USD', name: 'sys_properties_' + i });

let d1 = dev.collect(true);
const uitems = d1.snap.categories.update_sets.items, ui = k => uitems.find(i => i.key === k);
assert.deepStrictEqual(uitems.map(i => i.key).sort(), ['default:global', 'origin:USX', 'origin:USY']);
assert.strictEqual(ui('origin:USX').state, 'complete');
assert.deepStrictEqual(ui('origin:USX').attributes, { application: 'global', local_state: 'complete', update_count: 3, is_default: false, parent: '', base_update_set: '' });
assert.strictEqual(ui('origin:USX').runtime.origin, 'built here');
assert.strictEqual(ui('default:global').attributes.update_count, 5);
assert.strictEqual(ui('origin:USY').attributes.application, 'x_acme_app');
assert.strictEqual(d1.snap.categories.update_sets.incremental, false, 'first run is full');
assert.deepStrictEqual(d1.snap.categories.update_sets.watermark, { since: '2026-11-08 02:15:00', full: '2026-11-08 02:15:00' });
assert.strictEqual(ui('origin:USX').source_table, 'sys_update_set');
assert.strictEqual(d1.snap.categories.system_properties.items[0].source_table, 'sys_properties');

/* ---- history: first run is the baseline ---- */
let runs = rows(dev.D, 'collection_run');
assert.strictEqual(runs.length, 1);
assert.strictEqual(runs[0].run_id, 'dev1-20261108021500-20261108021500');
assert.strictEqual(runs[0].mode, 'full'); assert.strictEqual(runs[0].source, 'local');
assert.deepStrictEqual(d1.res.baseline.sort(), ['system_properties', 'update_sets']);
assert.strictEqual(rows(dev.D, 'item_change').length, 0, 'baseline: no change rows');
assert.strictEqual(runs[0].snapshot_attached, 'true');
assert.strictEqual(dev.D.sys_attachment.rows.length, 1); assert.match(dev.D.sys_attachment.rows[0].file_name, /^snapshot_dev1-.*\.json$/);
assert.strictEqual(JSON.parse(runs[0].watermarks).update_sets.full, '2026-11-08 02:15:00');
const tiX = rows(dev.D, 'tracked_item').find(r => r.item_key === 'origin:USX');
assert.strictEqual(tiX.source_url, 'https://dev1.service-now.com/sys_update_set.do?sys_id=USX', 'direct link stored');
assert.strictEqual(rows(dev.D, 'tracked_item').find(r => r.item_key === 'glide.ui.session_timeout').source_url, 'https://dev1.service-now.com/sys_properties.do?sys_id=P1');
assert.match(JSON.parse(rows(dev.D, 'cmdb_ci_sn_instance')[0].collection_summary).run_id, /^dev1-/);

/* ---- second run: incremental; a property change, a removal, a new set ---- */
dev.clock.now = '2026-11-09 02:15:00';
dev.D.sys_properties.rows[0].value = '60';
dev.D.sys_properties.rows.splice(1, 1);                       // date_format deleted -> reported as not_set
us.push({ sys_id: 'USZ', name: 'STRY003 New', state: 'in progress', application: 'SCG', is_default: 'false', sys_updated_on: '2026-11-08 15:00:00' });
xml.push({ update_set: 'USY', name: 'sys_ui_page_2' });      // open set grows (its own updated_on doesn't move)
let d2 = dev.collect(true);
const us2 = d2.snap.categories.update_sets;
assert.strictEqual(us2.incremental, true);
assert.deepStrictEqual(us2.items.map(i => i.key).sort(), ['default:global', 'origin:USY', 'origin:USZ'], 'only changed + open sets (USX untouched)');
assert.strictEqual(us2.items.find(i => i.key === 'origin:USY').attributes.update_count, 2);
assert.deepStrictEqual(us2.watermark, { since: '2026-11-09 02:15:00', full: '2026-11-08 02:15:00' });
assert.strictEqual(d2.res.totals.removed, 0, 'incremental update sets are never marked removed');
assert.ok(rows(dev.D, 'tracked_item').find(r => r.item_key === 'origin:USX').present !== 'false', 'USX still present');
const ch = rows(dev.D, 'item_change');
assert.deepStrictEqual(ch.map(c => c.item_key + ':' + c.change_type).sort(),
  ['glide.sys.date_format:changed', 'glide.ui.session_timeout:changed', 'origin:USY:changed', 'origin:USZ:added']);
const c1 = ch.find(c => c.item_key === 'glide.ui.session_timeout');
assert.strictEqual(c1.changed_fields, 'value'); assert.strictEqual(JSON.parse(c1.old_data).value, '30'); assert.strictEqual(JSON.parse(c1.new_data).value, '60');
assert.strictEqual(c1.source_url, 'https://dev1.service-now.com/sys_properties.do?sys_id=P1');
assert.strictEqual(ch.find(c => c.item_key === 'origin:USY').changed_fields, 'attributes.update_count');
assert.match(ch.find(c => c.item_key === 'glide.sys.date_format').changed_fields, /state/);
const run2 = rows(dev.D, 'collection_run').find(r => r.run_id.startsWith('dev1-20261109'));
assert.strictEqual(run2.mode, 'incremental'); assert.strictEqual(run2.changes_logged, '4'); assert.strictEqual(run2.baseline_categories, '');
assert.ok(ch.every(c => c.run === run2.sys_id));

/* ---- unchanged run writes nothing, logs nothing ---- */
dev.clock.now = '2026-11-09 03:00:00';
let d3 = dev.collect(true);
assert.strictEqual(d3.res.totals.inserted + d3.res.totals.updated + d3.res.totals.removed, 0);
assert.strictEqual(rows(dev.D, 'item_change').length, 4);

/* ---- after updateSetsFullDays a full sweep runs and notices a deleted set ---- */
dev.clock.now = '2026-11-16 02:15:00';
us.splice(us.findIndex(u => u.sys_id === 'USZ'), 1);
let d4 = dev.collect(true);
assert.strictEqual(d4.snap.categories.update_sets.incremental, false, 'full after 7 days');
assert.ok(rows(dev.D, 'item_change').some(c => c.item_key === 'origin:USZ' && c.change_type === 'removed'));

/* ---- link backfill on older rows is silent ---- */
rows(dev.D, 'tracked_item').find(r => r.item_key === 'glide.ui.session_timeout').source_url = ''; // (update sets backfill on the next full sweep)
dev.clock.now = '2026-11-16 03:00:00';
const before = rows(dev.D, 'item_change').length;
let d5 = dev.collect(true);
assert.strictEqual(d5.res.totals.updated, 0);
assert.strictEqual(rows(dev.D, 'tracked_item').find(r => r.item_key === 'glide.ui.session_timeout').source_url, 'https://dev1.service-now.com/sys_properties.do?sys_id=P1');
assert.strictEqual(rows(dev.D, 'item_change').length, before, 'backfill is not a change');

/* ================= Test: retrieved Dev's sets ================= */
const test = env('test1', 'https://test1.service-now.com');
const tus = test.D.sys_update_set.rows, rus = test.D.sys_remote_update_set.rows, txml = test.D.sys_update_xml.rows;
rus.push({ sys_id: 'RX', name: 'STRY001 Login tweaks', state: 'committed', application: 'SCG', origin_sys_id: 'USX', update_set: 'LX', commit_date: '2026-11-03 09:00:00', sys_created_on: '2026-11-03 08:00:00', sys_updated_on: '2026-11-03 09:00:00' });
tus.push({ sys_id: 'LX', name: 'STRY001 Login tweaks', state: 'complete', application: 'SCG', is_default: 'false', sys_updated_on: '2026-11-03 09:00:00' });
rus.push({ sys_id: 'RY', name: 'STRY002 Work in progress', state: 'previewed', application: 'SCA', origin_sys_id: 'USY', sys_updated_on: '2026-11-04 09:00:00' });
tus.push({ sys_id: 'TD', name: 'Default', state: 'in progress', application: 'SCG', is_default: 'true', sys_updated_on: '2026-11-07 09:00:00' });
for (let i = 0; i < 3; i++) { txml.push({ update_set: 'LX', name: 'sys_script_' + i }); txml.push({ remote_update_set: 'RX', name: 'sys_script_' + i }); }
txml.push({ remote_update_set: 'RY', name: 'sys_ui_page_1' });
for (let i = 0; i < 6; i++) txml.push({ update_set: 'TD', name: 'sys_properties_' + i });
test.D.sys_update_preview_problem.rows.push({ remote_update_set: 'RY', type: 'error', status: '' }, { remote_update_set: 'RY', type: 'warning', status: 'ignored' });
const t1 = test.R('new ConfigNowCollector().collect()');
const ti = k => t1.categories.update_sets.items.find(i => i.key === k);
assert.deepStrictEqual(t1.categories.update_sets.items.map(i => i.key).sort(), ['default:global', 'origin:USX', 'origin:USY'], 'committed copy folded in; keys match Dev');
assert.strictEqual(ti('origin:USX').state, 'complete', 'local state of the committed copy');
assert.deepStrictEqual(ti('origin:USX').attributes, { application: 'global', local_state: 'complete', update_count: 3, is_default: false, parent: '', base_update_set: '',
  remote_state: 'committed', remote_update_count: 3, preview_errors: 0, preview_warnings: 0, preview_unresolved: 0 });
assert.strictEqual(ti('origin:USX').runtime.committed_on, '2026-11-03 09:00:00');
assert.strictEqual(ti('origin:USY').state, 'previewed');
assert.strictEqual(ti('origin:USY').attributes.preview_errors, 1); assert.strictEqual(ti('origin:USY').attributes.preview_warnings, 1);
assert.strictEqual(ti('origin:USY').attributes.preview_unresolved, 1, 'the ignored warning is resolved');
assert.strictEqual(ti('origin:USY').source_table, 'sys_remote_update_set');

/* ---- import Test into Dev and compare ---- */
dev.ctx.__T = vm.runInContext('(' + JSON.stringify(t1) + ')', dev.ctx);
const imp = dev.R('new ConfigNowImporter().importSnapshot(__T)');
const impRun = rows(dev.D, 'collection_run').find(r => r.source === 'import');
assert.ok(impRun && /^test1-.*-import-/.test(impRun.run_id), 'import gets its own run');
assert.strictEqual(rows(dev.D, 'tracked_item').find(r => r.item_key === 'origin:USY' && r.instance !== rows(dev.D, 'cmdb_ci_sn_instance')[0].sys_id).source_url,
  'https://test1.service-now.com/sys_remote_update_set.do?sys_id=RY', 'imported items link to their own instance');
const cmp = dev.R('new ConfigNowCompare().compare("dev1", "test1")');
const ur = k => cmp.categories.update_sets.rows.find(r => r.key === k);
assert.ok(!ur('origin:USX'), 'built on Dev + committed on Test = no drift (one-sided attributes are not compared)');
assert.deepStrictEqual(ur('origin:USY').fields, ['state'], 'in progress on Dev, previewed on Test');
{ const dr = cmp.categories.update_sets.rows.find(r => r.key === 'default:global');
  assert.ok(dr, 'Default sets compare by application'); assert.deepStrictEqual(dr.fields, ['attributes.update_count']); assert.strictEqual(dr.count_only, true); }
assert.strictEqual(ur('origin:USY').a.url, 'https://dev1.service-now.com/sys_update_set.do?sys_id=USY');

/* ---- optional sys_id drift ---- */
const off = dev.R('new ConfigNowCompare().compare("dev1", "test1")');
assert.strictEqual(off.sys_id_check, false);
assert.ok(!off.categories.system_properties.rows.some(r => r.fields.indexOf('sys_id') > -1), 'off by default');
// make Test's property records differ only by sys_id
const tp = rows(dev.D, 'tracked_item').filter(r => r.item_category === 'system_properties' && r.instance === impRun.instance);
const dp = rows(dev.D, 'tracked_item').filter(r => r.item_category === 'system_properties' && r.instance !== impRun.instance);
tp.forEach(r => { const d = dp.find(x => x.item_key === r.item_key); if (d) { r.item_value = d.item_value; r.item_state = d.item_state; r.item_attributes = d.item_attributes; r.value_hash = d.value_hash; } r.source_sys_id = 'T-' + r.source_sys_id; });
const on = dev.R('new ConfigNowCompare().compare("dev1", "test1", { sysIds: true })');
assert.strictEqual(on.sys_id_check, true);
const sp = on.categories.system_properties.rows.find(r => r.key === 'glide.ui.session_timeout');
assert.ok(sp, 'same value, different sys_id is flagged');
assert.deepStrictEqual(sp.fields, ['sys_id']); assert.deepStrictEqual(sp.kinds, ['sys_id']);
assert.ok(!on.categories.update_sets.rows.some(r => r.fields.indexOf('sys_id') > -1), 'update sets are excluded from sys_id drift');
{ const ex = dev.R('ConfigNowConfig.get().sysIdExclude');
  assert.deepStrictEqual(ex, ['mid_servers', 'update_sets', 'plugins', 'tables', 'columns'], 'per-instance sys_id categories excluded by default'); }
const mx = dev.R('new ConfigNowCompare().compareMany([], { sysIds: true })');
const ms = mx.categories.system_properties.rows.find(r => r.key === 'glide.ui.session_timeout');
assert.ok(ms.cells.every(c => !c || c.sys_id), 'matrix cells carry sys_ids when checking');
assert.ok(ms.cells.some(c => c && c.url), 'matrix cells carry links');

/* ================= retention ================= */
{
  const allRuns = rows(dev.D, 'collection_run');
  const devInst = rows(dev.D, 'cmdb_ci_sn_instance').find(i => i.instance_name === 'dev1');
  const devRuns = allRuns.filter(r => r.instance === devInst.sys_id);
  const nDev = devRuns.length, nChanges = rows(dev.D, 'item_change').length;
  dev.clock.now = '2026-11-20 00:00:00';
  // 10-day retention for dev1 only: runs before 2026-11-10 go, except the latest
  devInst.retention_days = '10';
  const dry = dev.R('new ConfigNowRetention().purge({ dryRun: true })');
  assert.strictEqual(rows(dev.D, 'collection_run').length, allRuns.length, 'dry run deletes nothing');
  const dd = dry.instances.find(i => i.instance === 'dev1');
  assert.strictEqual(dd.retention_days, 10); assert.strictEqual(dd.cutoff, '2026-11-10 00:00:00');
  assert.strictEqual(dd.runs, 3, 'runs of 08 Nov, 09 Nov 02:15 and 03:00');
  const res = dev.R('new ConfigNowRetention().purge()');
  const left = rows(dev.D, 'collection_run').filter(r => r.instance === devInst.sys_id);
  assert.strictEqual(left.length, nDev - 3);
  assert.ok(left.every(r => r.collected_at >= '2026-11-10 00:00:00'));
  assert.strictEqual(rows(dev.D, 'item_change').length, nChanges - 4, 'the 09 Nov changes went with their run');
  assert.ok(dev.D.sys_attachment.rows.every(a => rows(dev.D, 'collection_run').some(r => r.sys_id === a.table_sys_id)), 'snapshots deleted with their runs');
  const tr = res.instances.find(i => i.instance === 'test1');
  assert.strictEqual(tr.retention_days, 180, 'global default for test1'); assert.strictEqual(tr.runs, 0);
  // the latest run is always kept, even past retention
  devInst.retention_days = '1'; dev.clock.now = '2027-06-01 00:00:00';
  dev.R('new ConfigNowRetention().purge()');
  assert.strictEqual(rows(dev.D, 'collection_run').filter(r => r.instance === devInst.sys_id).length, 1);
  // global property override
  const g = env('g1', 'https://g1.example/', null, { 'x_2160899_driftw_0.retention_days': '30' });
  assert.strictEqual(g.R('ConfigNowConfig.get().retentionDays'), 30);
}

/* ================= older schema: no history tables ================= */
{
  const o = env('old1', 'https://old1.example/');
  delete o.D[P + 'collection_run']; delete o.D[P + 'item_change'];
  const r = o.collect(false);
  assert.strictEqual(r.res.run_id, ''); assert.ok(rows(o.D, 'tracked_item').length > 0, 'still persists');
  assert.strictEqual(o.D.sys_attachment.rows.length, 0);
}
/* ================= keep_snapshots / log_changes off ================= */
{
  const o = env('cfg1', 'https://cfg1.example/', null, { 'x_2160899_driftw_0.keep_snapshots': 'false', 'x_2160899_driftw_0.log_changes': 'false' });
  o.collect(false); o.D.sys_properties.rows[0].value = '99'; o.clock.now = '2026-11-08 03:00:00'; o.collect(false);
  assert.strictEqual(o.D.sys_attachment.rows.length, 0); assert.strictEqual(rows(o.D, 'item_change').length, 0);
  assert.strictEqual(rows(o.D, 'collection_run').length, 2, 'runs are still recorded');
}
/* ================= files exported before the rename still import ================= */
{
  const o = env('legacy-src', 'https://legacy.example/');
  const snap = o.R('new ConfigNowCollector().collect()');
  assert.strictEqual(snap.schema, 'driftwood.snapshot/0.1');
  snap.schema = 'configurationnow.snapshot/0.1'; snap.instance.instance_name = 'legacy1';
  dev.ctx.__L = vm.runInContext('(' + JSON.stringify(snap) + ')', dev.ctx);
  dev.R('new ConfigNowImporter().importSnapshot(__L)');
  assert.ok(rows(dev.D, 'cmdb_ci_sn_instance').some(i => i.instance_name === 'legacy1'), 'configurationnow.snapshot/0.1 accepted');
}
console.log('V0.5 TESTS PASSED');
