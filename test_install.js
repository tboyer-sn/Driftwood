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
      S[this.t].push(this.cur); return this.cur.sys_id; }
    update() { assert.ok(opts.live, 'write during dry run'); return this.cur.sys_id; }
  }
  const out = []; const ctx = { GlideRecord, gs: { info: s => out.push(s), getCurrentApplicationId: () => opts.picker || APP }, String };
  vm.createContext(ctx); vm.runInContext(src, ctx); return out.join('\n');
}
const fresh = () => ({ sys_scope: [{ sys_id: APP, scope: 'x_2160899_driftw_0', name: 'Driftwood' }], sys_script_include: [], sys_properties: [], tables: ['x_2160899_driftw_0_tracked_item'] });
let S = fresh(), o;
o = run(S, {}); assert.match(o, /Would create: 11, would update: 0/); assert.strictEqual(S.sys_script_include.length, 0);
o = run(S, { live: true, picker: 'global' }); assert.match(o, /ABORT/); assert.strictEqual(S.sys_script_include.length, 0);
o = run(S, { live: true }); assert.match(o, /Created: 11, updated: 0/); assert.ok(!/!!/.test(o), o);
for (const n of ['ConfigNowConfig', 'ConfigNowCollector', 'ConfigNowWriter', 'ConfigNowCompare', 'ConfigNowImporter', 'ConfigNowRetention']) {
  const rec = S.sys_script_include.find(r => r.name === n);
  assert.strictEqual(rec.script, fs.readFileSync(__dirname + '/../src/script_includes/' + n + '.js', 'utf8'), n + ' embedded script must be byte-identical');
  assert.strictEqual(rec.access, 'package_private'); assert.strictEqual(rec.sys_scope, APP);
}
assert.strictEqual(S.sys_properties.length, 5);
o = run(S, { live: true }); assert.match(o, /Created: 0, updated: 0, unchanged: 11/);
S.sys_script_include[1].script += '\n// edited on instance';
o = run(S, { live: true }); assert.match(o, /differ \(not touched\): 1/); assert.match(S.sys_script_include[1].script, /edited on instance/);
o = run(S, { live: true, update: true }); assert.match(o, /updated: 1/); assert.ok(!/edited on instance/.test(S.sys_script_include[1].script));
console.log('INSTALLER TESTS PASSED');
