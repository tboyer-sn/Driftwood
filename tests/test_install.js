const vm = require('vm'), fs = require('fs'), assert = require('assert');
const APP = 'app0001';
function run(S, opts) {
  let src = fs.readFileSync(__dirname + '/../dist/install_code.js', 'utf8');
  if (opts.live) src = src.replace('var DRY_RUN = true;', 'var DRY_RUN = false;');
  if (opts.update) src = src.replace('var UPDATE_EXISTING = false;', 'var UPDATE_EXISTING = true;');
  let seq = 0;
  class GlideRecord {
    constructor(t) { this.t = t; this.q = []; }
    isValid() { return ['sys_scope', 'sys_script_include', 'sys_properties'].includes(this.t) || (S.tables || []).includes(this.t); }
    isValidField(f) { return true; }
    addQuery(f, v) { this.q.push(r => String(r[f]) === String(v)); } setLimit() {}
    query() { this.rows = (S[this.t] = S[this.t] || []).filter(r => this.q.every(f => f(r))); this.i = -1; }
    next() { this.cur = this.rows[++this.i]; return !!this.cur; }
    get(a, b) { const rows = S[this.t] || []; this.cur = b === undefined ? rows.find(r => r.sys_id === a) : rows.find(r => r[a] === b); return !!this.cur; }
    getValue(f) { const v = this.cur[f]; return v === undefined ? null : String(v); } getDisplayValue(f) { return this.getValue(f); }
    getUniqueValue() { return this.cur.sys_id; }
    initialize() { this.cur = { sys_id: 'n' + (++seq) }; }
    setValue(f, v) { this.cur[f] = typeof v === 'boolean' ? String(v) : String(v); }
    insert() { assert.ok(opts.live, 'write during dry run'); this.cur.sys_scope = opts.picker || APP;
      if (this.t === 'sys_script_include') this.cur.api_name = 'x_2160899_driftw_0.' + this.cur.name;
      if (this.t === 'sys_script_fix') this.cur.name = this.cur.name.substring(0, 40); // sys_script_fix.name is 40 characters
      S[this.t].push(this.cur); return this.cur.sys_id; }
    update() { assert.ok(opts.live, 'write during dry run'); if (this.t === 'sys_script_fix') this.cur.name = this.cur.name.substring(0, 40); return this.cur.sys_id; }
    hasNext() { return this.i + 1 < this.rows.length; } orderBy() {}
    deleteRecord() { assert.ok(opts.live, 'delete during dry run'); const r = S[this.t]; r.splice(r.indexOf(this.cur), 1); return true; }
  }
  const out = []; const ctx = { GlideRecord, gs: { info: s => out.push(s), getCurrentApplicationId: () => opts.picker || APP }, String };
  vm.createContext(ctx); vm.runInContext(src, ctx); return out.join('\n');
}
const fresh = () => ({ sys_scope: [{ sys_id: APP, scope: 'x_2160899_driftw_0', name: 'Driftwood' }], sys_script_include: [], sys_properties: [], sys_script_fix: [], tables: ['x_2160899_driftw_0_tracked_item'] });
let S = fresh(), o;
o = run(S, {}); assert.match(o, /Would create: 19, would update: 0/); assert.strictEqual(S.sys_script_include.length, 0);
o = run(S, { live: true, picker: 'global' }); assert.match(o, /ABORT/); assert.strictEqual(S.sys_script_include.length, 0);
o = run(S, { live: true }); assert.match(o, /Created: 19, updated: 0/); assert.ok(!/!!/.test(o), o);
for (const n of ['ConfigNowConfig', 'ConfigNowCollector', 'ConfigNowWriter', 'ConfigNowCompare', 'ConfigNowImporter', 'ConfigNowRetention', 'ConfigNowObjects', 'ConfigNowDrift', 'ConfigNowMigration', 'ConfigNowHealth']) {
  const rec = S.sys_script_include.find(r => r.name === n);
  assert.strictEqual(rec.script, fs.readFileSync(__dirname + '/../src/script_includes/' + n + '.js', 'utf8'), n + ' embedded script must be byte-identical');
  assert.strictEqual(rec.access, 'package_private'); assert.strictEqual(rec.sys_scope, APP);
}
assert.strictEqual(S.sys_properties.length, 6);
assert.strictEqual(S.sys_properties.find(p => p.name === 'x_2160899_driftw_0.table.plugins').value, 'x_2160899_driftw_0_tracked_item', 'O05: plugins routed to the plain table');
assert.strictEqual(S.sys_script_fix.length, 3);
assert.strictEqual(S.sys_script_fix[0].name, 'Driftwood - Backfill tracked objects');
assert.strictEqual(S.sys_script_fix[0].script, fs.readFileSync(__dirname + '/../src/fix_scripts/Driftwood_Backfill_tracked_objects.js', 'utf8'));
assert.strictEqual(S.sys_script_fix[0].sys_scope, APP);
o = run(S, { live: true }); assert.match(o, /Created: 0, updated: 0, unchanged: 19/);
S.sys_script_include[1].script += '\n// edited on instance';
o = run(S, { live: true }); assert.match(o, /differ \(not touched\): 1/); assert.match(S.sys_script_include[1].script, /edited on instance/);
o = run(S, { live: true, update: true }); assert.match(o, /updated: 1/); assert.ok(!/edited on instance/.test(S.sys_script_include[1].script));
// v0.6.1: the truncated "Move plugins to plain record" fix script (and the copies later runs added)
{
  const F = fresh(); run(F, { live: true });
  const good = F.sys_script_fix.find(f => f.name === 'Driftwood - Move plugins off the CMDB');
  assert.ok(good && F.sys_script_fix.every(f => f.name.length <= 40), 'all names fit');
  F.sys_script_fix.splice(F.sys_script_fix.indexOf(good), 1);
  F.sys_script_fix.push({ sys_id: 'T1', name: 'Driftwood - Move plugins to plain record', script: '// old', sys_scope: APP, sys_created_on: '2026-11-07' },
                       { sys_id: 'T2', name: 'Driftwood - Move plugins to plain record', script: '// old', sys_scope: APP, sys_created_on: '2026-11-08' });
  let o2 = run(F, { live: true });
  assert.match(o2, /truncated name\) exists – set UPDATE_EXISTING = true/); assert.strictEqual(F.sys_script_fix.length, 4, 'nothing added without UPDATE_EXISTING');
  o2 = run(F, { update: true });
  assert.match(o2, /RENAME to "Driftwood - Move plugins off the CMDB"/); assert.match(o2, /DELETE duplicate \(T2\)/); assert.match(o2, /Move plugins off the CMDB  UPDATE \(after the rename\)/);
  o2 = run(F, { live: true, update: true });
  assert.deepStrictEqual(F.sys_script_fix.map(f => f.name).sort(), ['Driftwood - Backfill tracked objects', 'Driftwood - Move plugins off the CMDB', 'Driftwood - Recompute all drift']);
  assert.strictEqual(F.sys_script_fix.find(f => f.name === 'Driftwood - Move plugins off the CMDB').sys_id, 'T1', 'the oldest copy is kept and renamed');
  assert.match(F.sys_script_fix.find(f => f.sys_id === 'T1').script, /movePlugins/);
  assert.match(run(F, { live: true, update: true }), /Created: 0, updated: 0/);
  console.log('truncated fix script: renamed once, duplicate deleted, script refreshed; then a no-op');
}
console.log('INSTALLER TESTS PASSED');
