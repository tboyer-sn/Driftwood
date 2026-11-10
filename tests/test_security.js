// Security review phase 1 (docs/Security-review-v0.6.md): GlideRecordSecure on
// every read made for a person, GET /current, error messages, imported link
// fields, how runs were started. The REST scripts run as written, with the
// caller's roles set per call.
const vm = require('vm'), fs = require('fs'), path = require('path'), assert = require('assert');
const { makeEnv, load } = require('./harness');
const P = 'x_2160899_driftw_0_', R = 'x_2160899_driftw_0.';
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: r.sys_id || ('s' + i + Math.random().toString(16).slice(2, 8)) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'source_table', 'source_url', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed', 'object'];
const instFields = ['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary', 'retention_days'];
const runFields = ['run_id', 'instance', 'source', 'run_trigger', 'mode', 'collected_at', 'persisted_at', 'collector_version', 'collector_scope', 'duration_ms', 'categories', 'baseline_categories', 'totals', 'changes_logged', 'warnings_count', 'warnings', 'watermarks', 'snapshot_attached'];

function env() {
  const D = {
    [P + 'cmdb_ci_sn_instance']: T(instFields), [P + 'tracked_item']: T(['name'].concat(tracked)),
    [P + 'cmdb_ci_sn_tracked_plugin']: T(['name'].concat(tracked)), [P + 'collection_run']: T(runFields),
    [P + 'item_change']: T(['run', 'instance', 'item_category', 'item_key', 'item_name', 'change_type', 'changed_fields', 'old_data', 'new_data', 'changed_on', 'source_url', 'object'])
  };
  const props = { instance_name: 'dev1' };
  ['applications', 'mid_servers', 'system_properties', 'clone_preservers', 'clone_exclusions', 'plugins'].forEach(c => props[R + 'table.' + c] = P + 'tracked_item');
  const { ctx, out } = makeEnv(D, props);
  ctx.GlideSysAttachment = class { write() { return 'att'; } };
  ctx.gs.error = s => out.push('ERROR ' + s);
  load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowWriter.js', 'src/script_includes/ConfigNowCompare.js', 'src/script_includes/ConfigNowImporter.js']);
  const R_ = s => { const v = vm.runInContext(s, ctx); return (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; };
  const persist = (snap, opts) => { ctx.__s = snap; ctx.__o = opts || {}; return R_('new ConfigNowWriter().persist(__s, __o)'); };
  // run a REST resource as written, as a caller with these roles
  const rest = (file, roles, query, body) => {
    const res = { status: 0, body: null, headers: {} };
    ctx.gs.hasRole = r => roles.includes(r);
    ctx.request = { queryParams: query || {}, body: { data: body, dataString: body ? JSON.stringify(body) : '' } };
    ctx.response = { setStatus: s => { res.status = s; }, setBody: b => { res.body = JSON.parse(JSON.stringify(b)); }, setHeader: (k, v) => { res.headers[k] = v; } };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src/scripted_rest', file), 'utf8'), ctx, { filename: file });
    return res;
  };
  return { D, ctx, out, R: R_, persist, rest };
}
let h = 0;
const item = (cat, key, value, extra) => Object.assign({ category: cat, key, name: key, value: value || '', version: '', state: 'present', attributes: {}, runtime: {}, hash: 'h' + (++h), source_table: 'sys_properties', source_sys_id: 'a'.repeat(31) + (h % 10) }, extra || {});
const snap = (name, items) => ({ schema: 'driftwood.snapshot/0.1', collected_at: '2026-11-08 02:00:00', collector_version: 't', instance: { instance_name: name, instance_url: 'https://' + name + '.service-now.com' }, categories: { system_properties: { items } }, warnings: [] });
const READ = [R + 'configuration_read'], SECURE = READ.concat(R + 'configuration_read_secure'), ADMIN = READ.concat(R + 'configuration_admin');

const E = env();
E.persist(snap('dev1', [item('system_properties', 'glide.a', '1'), item('system_properties', 'glide.hidden', 'x'),
  item('system_properties', 'glide.secret', '', { secure: true, secure_value_hash: 'HASH1' })]), { trigger: 'job' });
E.persist(snap('dev2', [item('system_properties', 'glide.a', '2'), item('system_properties', 'glide.hidden', 'y')]), { source: 'import', trigger: 'import' });
const TI = E.D[P + 'tracked_item'];

/* S3: every REST read goes through GlideRecordSecure, and the user's ACLs decide */
E.D.__secureReads = 0;
let r = E.rest('instances_GET.js', READ);
assert.strictEqual(r.status, 200); assert.strictEqual(r.body.instances.length, 2); assert.ok(E.D.__secureReads > 0, 'instances read through GlideRecordSecure');
TI.deny = row => row.item_key === 'glide.hidden';            // a row ACL this user fails
r = E.rest('matrix_GET.js', READ);
const keys = r.body.categories.system_properties.rows.map(x => x.key);
assert.deepStrictEqual(keys.sort(), ['glide.a', 'glide.secret'], 'the denied row is not returned: ' + keys);
assert.ok(E.R('new ConfigNowCompare().compareMany([]).categories.system_properties.rows.some(function (x) { return x.key == "glide.hidden"; })'), 'system reads (drift engine) still see it');
r = E.rest('compare_GET.js', READ, { a: ['dev1'], b: ['dev2'] });
assert.strictEqual(r.status, 200); assert.ok(!JSON.stringify(r.body).includes('glide.hidden'));
E.D[P + 'cmdb_ci_sn_instance'].deny = row => row.instance_name === 'dev2';  // an instance this user may not see
r = E.rest('compare_GET.js', READ, { a: ['dev1'], b: ['dev2'] });
assert.strictEqual(r.status, 404); assert.match(r.body.error, /Instance not found: dev2/);
delete E.D[P + 'cmdb_ci_sn_instance'].deny;
console.log('S3: instances, matrix and compare read through GlideRecordSecure; denied rows and instances stay hidden');

/* S1: GET /current – stored data through GlideRecordSecure for readers, live only for admins */
TI.denyFields = ['secure_value_hash'];                         // the field ACL: reader without read_secure
r = E.rest('current_GET.js', READ);
assert.strictEqual(r.status, 200); assert.strictEqual(r.body.stored, true);
const its = r.body.categories.system_properties.items;
assert.deepStrictEqual(its.map(i => i.key).sort(), ['glide.a', 'glide.secret'], 'hidden row excluded');
assert.ok(!('secure_value_hash' in its.find(i => i.key === 'glide.secret')), 'no hash without read_secure');
assert.strictEqual(its.find(i => i.key === 'glide.a').source_table, 'sys_properties');
TI.denyFields = []; delete TI.deny;
r = E.rest('current_GET.js', SECURE);
assert.strictEqual(r.body.categories.system_properties.items.find(i => i.key === 'glide.secret').secure_value_hash, 'HASH1', 'field ACL passes for read_secure');
let ran = 0;
E.ctx.ConfigNowCollector = class { collect() { ran++; return { live: true, categories: { system_properties: { items: [{ key: 's', secure: true, secure_value_hash: 'LIVE' }] } } }; } };
r = E.rest('current_GET.js', READ);
assert.strictEqual(ran, 0, 'a reader never triggers the collector'); assert.strictEqual(r.body.stored, true);
r = E.rest('current_GET.js', ADMIN);
assert.strictEqual(ran, 1); assert.strictEqual(r.body.live, true);
assert.strictEqual(r.body.categories.system_properties.items[0].secure_value_hash, '(restricted)', 'admin without read_secure: hash masked');
r = E.rest('current_GET.js', []);
assert.strictEqual(r.status, 403);
const F = env();
r = F.rest('current_GET.js', READ);
assert.strictEqual(r.status, 404); assert.match(r.body.error, /not been collected yet/);
console.log('S1: readers get stored data (rows and fields by their ACLs); only admins trigger a live read');

/* S8: unexpected errors are logged, not returned */
E.R('ConfigNowCompare.prototype._saved = ConfigNowCompare.prototype.compareMany; ConfigNowCompare.prototype.compareMany = function () { throw new Error("db timeout at node 7 /var/lib"); }');
r = E.rest('matrix_GET.js', READ);
assert.strictEqual(r.status, 500); assert.strictEqual(r.body.error, 'Comparison failed; the details are in the system log');
assert.ok(E.out.some(l => /ERROR \[Driftwood\] GET \/matrix failed: db timeout/.test(l)), 'detail logged');
E.R('ConfigNowCompare.prototype.compareMany = ConfigNowCompare.prototype._saved');
r = E.rest('matrix_GET.js', READ, { instances: ['nope'] });
assert.strictEqual(r.status, 400); assert.match(r.body.error, /Instance not found: nope/, 'expected errors keep their message');
console.log('S8: unexpected errors return a short message and log the detail');

/* S7: imported link fields are kept only in their platform form */
const evil = snap('dev3', [item('system_properties', 'p.bad1', '1', { source_table: 'sys_x/../../logout', source_sys_id: 'a'.repeat(32) }),
  item('system_properties', 'p.bad2', '1', { source_table: 'sys_properties', source_sys_id: 'x?sysparm_view=evil' }),
  item('system_properties', 'p.ok', '1', { source_table: 'sys_properties', source_sys_id: 'global' })]);
E.persist(evil, { source: 'import', trigger: 'import' });
const row = k => TI.rows.find(x => x.item_key === k && x.instance === E.D[P + 'cmdb_ci_sn_instance'].rows.find(i => i.instance_name === 'dev3').sys_id);
assert.strictEqual(row('p.bad1').source_table || '', ''); assert.strictEqual(row('p.bad1').source_url || '', '');
assert.strictEqual(row('p.bad2').source_sys_id || '', ''); assert.strictEqual(row('p.bad2').source_url || '', '');
assert.strictEqual(row('p.ok').source_url, 'https://dev3.service-now.com/sys_properties.do?sys_id=global', 'a non-hex platform sys_id is fine');
console.log('S7: path or query characters in imported table names or sys_ids never reach a link');

/* S9: how each run was started */
const runs = E.D[P + 'collection_run'].rows;
assert.strictEqual(runs.find(x => x.run_id.startsWith('dev1-')).run_trigger, 'job');
assert.ok(runs.filter(x => x.source === 'import').every(x => x.run_trigger === 'import'));
E.persist(snap('dev1', [item('system_properties', 'glide.a', '5')]));
assert.strictEqual(runs[runs.length - 1].run_trigger, 'script', 'no trigger given: script');
for (const [f, t] of [['src/scheduled_jobs/Driftwood_Collect_Current_Instance.js', "'job'"], ['src/ui_actions/Collect_Now.js', "'collect_now'"], ['src/scripted_rest/collect_POST.js', "'rest'"], ['src/script_includes/ConfigNowImporter.js', "'import'"]])
  assert.match(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), new RegExp('trigger: ' + t), f + ' passes its trigger');
console.log('S9: runs record how they were started (job, Collect now, REST, import, script)');

/* Every REST resource reads through the secure mode; only the drift engine reads as the system */
for (const f of fs.readdirSync(path.join(__dirname, '..', 'src/scripted_rest'))) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/scripted_rest', f), 'utf8');
  for (const m of src.match(/new ConfigNowCompare\([^)]*\)/g) || []) assert.match(m, /secure: true/, f + ': ' + m);
  assert.ok(!/new GlideRecord\(/.test(src), f + ' reads no table directly');
}
const drift = fs.readFileSync(path.join(__dirname, '..', 'src/script_includes/ConfigNowDrift.js'), 'utf8');
assert.ok(/new ConfigNowCompare\(\{ config: this\.config \}\)/.test(drift), 'drift engine: system read, by design');
console.log('every REST resource: Compare in secure mode, no direct table reads');
console.log('SECURITY TESTS PASSED');
