// Mock of sys_db_object / sys_dictionary / sys_choice semantics for build_schema.js
const vm = require('vm'), fs = require('fs'), assert = require('assert');
const APP = 'app0001';
function run(dry, state, picker = APP) {
  let seq = 0; const id = () => 'id' + (++seq) + Math.random().toString(16).slice(2, 6);
  const S = state;
  const rowsOf = t => S[t] || (S[t] = []);
  const fieldsOf = name => { // all dictionary elements incl. inherited
    const out = new Set(); let cur = S.sys_db_object.find(r => r.name === name), g = 0;
    while (cur && g++ < 20) { S.sys_dictionary.filter(d => d.name === cur.name).forEach(d => out.add(d.element)); cur = S.sys_db_object.find(r => r.sys_id === cur.super_class); }
    return out;
  };
  class GE { constructor(rec, f) { this.rec = rec; this.f = f; } nil() { return !this.rec[this.f]; }
    getRefRecord() { const g = new GlideRecord('sys_db_object'); g.get(this.rec[this.f]); return g; } }
  class GlideRecord {
    constructor(t) { this.t = t; this.q = []; this.cur = null; this.lim = 1e9; }
    isValid() { return ['sys_db_object', 'sys_dictionary', 'sys_choice', 'sys_scope', 'sys_security_acl', 'sys_user_role', 'sys_user_role_contains'].includes(this.t) || !!S.sys_db_object.find(r => r.name === this.t); }
    isValidField(f) { if (['sys_db_object', 'sys_dictionary', 'sys_choice', 'sys_scope', 'sys_user_role', 'sys_user_role_contains'].includes(this.t)) return f !== 'create_mobile_module'; return f === 'sys_id' || fieldsOf(this.t).has(f); }
    isValidRecord() { return !!this.cur; }
    addQuery(f, v) { this.q.push(r => String(r[f] ?? '') === String(v)); }
    setLimit(n) { this.lim = n; }
    query() { this.rows = rowsOf(this.t).filter(r => this.q.every(f => f(r))).slice(0, this.lim); this.i = -1; }
    next() { this.i++; this.cur = this.rows[this.i]; if (this.cur) this._wrap(); return !!this.cur; }
    _wrap() { if (this.t === 'sys_db_object') this.super_class = new GE(this.cur, 'super_class'); }
    get(a, b) { const r = b === undefined ? rowsOf(this.t).find(x => x.sys_id === a) : rowsOf(this.t).find(x => String(x[a]) === String(b)); this.cur = r || null; if (r) this._wrap(); return !!r; }
    getValue(f) { const v = this.cur[f]; return v === undefined || v === '' ? null : String(v); }
    getDisplayValue(f) { return this.getValue(f); }
    getUniqueValue() { return this.cur.sys_id; }
    initialize() { this.cur = { sys_id: id() }; }
    setValue(f, v) { this.cur[f] = typeof v === 'boolean' ? (v ? '1' : '0') : String(v); }
    insert() {
      if (dry) throw new Error('WRITE DURING DRY RUN: ' + this.t);
      if (['sys_db_object', 'sys_dictionary', 'sys_choice', 'sys_user_role', 'sys_user_role_contains'].includes(this.t)) this.cur.sys_scope = picker;
      if (this.t === 'sys_dictionary') { assert.ok(S.sys_db_object.find(r => r.name === this.cur.name), 'dict for unknown table ' + this.cur.name);
        assert.ok(!fieldsOf(this.cur.name).has(this.cur.element), 'duplicate/inherited column ' + this.cur.name + '.' + this.cur.element); }
      rowsOf(this.t).push(this.cur); return this.cur.sys_id; }
  }
  class GlideAggregate extends GlideRecord { addAggregate() {} getAggregate() { return String(this.rows.length); } query() { super.query(); this.i = -1; } next() { if (this.done) return false; this.done = true; return true; } }
  const out = [];
  const ctx = { GlideRecord, GlideAggregate, gs: { info: s => out.push(s), getCurrentApplicationId: () => picker }, parseInt, String };
  vm.createContext(ctx);
  let src = fs.readFileSync(__dirname + '/../src/background/build_schema.js', 'utf8');
  src = src.replace('var DRY_RUN = true;', 'var DRY_RUN = ' + dry + ';');
  vm.runInContext(src, ctx);
  return out.join('\n');
}
function fresh(withInstance = true) {
  const S = { sys_db_object: [], sys_dictionary: [], sys_choice: [], sys_user_role: [], sys_user_role_contains: [], sys_scope: [{ sys_id: APP, scope: 'x_2160899_driftw_0', name: 'Driftwood' }], sys_security_acl: [] };
  const T = (name, sup, fields) => { const r = { sys_id: 't_' + name, name, super_class: sup ? 't_' + sup : '', is_extendable: '1' }; S.sys_db_object.push(r); fields.forEach(f => S.sys_dictionary.push({ name, element: f, internal_type: 'string', max_length: '40' })); };
  T('cmdb', '', ['sys_id', 'name']); T('cmdb_ci', 'cmdb', ['category', 'attributes', 'fqdn']); T('cmdb_ci_appl', 'cmdb_ci', ['version', 'environment']);
  T('cmdb_ci_appl_now_app', 'cmdb_ci_appl', []);
  if (withInstance) { T('x_2160899_driftw_0_cmdb_ci_sn_instance', 'cmdb_ci_appl_now_app', []);
    ['configuration_read', 'configuration_read_secure', 'configuration_admin', 'admin', 'collector'].forEach((r, i) => S.sys_user_role.push({ sys_id: 'r' + i, name: 'x_2160899_driftw_0.' + r }));
    [['r2', 'r0'], ['r3', 'r2'], ['r3', 'r1']].forEach(([p, c]) => S.sys_user_role_contains.push({ sys_id: 'l' + p + c, role: p, contains: c })); }
  return S;
}
// 1. dry run writes nothing
let S = fresh(); const before = JSON.stringify(S);
let o = run(true, S); assert.strictEqual(JSON.stringify(S), before); assert.match(o, /Would create: 0 role record\(s\), 7 table\(s\), 103 column\(s\), 58 choice\(s\)/); console.log(o.split('\n').slice(-4).join('\n'));
// 2. wrong picker live => abort, nothing written
o = run(false, S, 'global'); assert.match(o, /ABORT/); assert.strictEqual(JSON.stringify(S), before);
// 3. live run
o = run(false, S); assert.match(o, /Created: 0 role record\(s\), 7 table\(s\), 103 column\(s\), 58 choice\(s\)/); assert.ok(!/!!/.test(o), o);
assert.ok(S.sys_dictionary.every(d => !d.name.startsWith('x_') || d.sys_scope === APP));
const pl = S.sys_db_object.find(t => t.name.endsWith('tracked_plugin')); assert.strictEqual(pl.super_class, S.sys_db_object.find(t => t.name.endsWith('tracked_table')).sys_id);
console.log(o.split('\n').filter(l => /VERIFY|Created/.test(l)).join('\n'));
// 4. re-run is a no-op
const after = JSON.stringify(S); o = run(false, S); assert.strictEqual(JSON.stringify(S), after); assert.match(o, /Created: 0 role record\(s\), 0 table\(s\), 0 column\(s\), 0 choice\(s\)/);
// 5. Completely fresh instance (empty app): roles + all 4 tables scripted
{
  const F = fresh(false);
  let o2 = run(true, F); assert.match(o2, /Would create: 8 role record\(s\), 8 table\(s\), 103 column\(s\), 58 choice\(s\)/);
  o2 = run(false, F); assert.match(o2, /Created: 8 role record\(s\), 8 table\(s\), 103 column\(s\), 58 choice\(s\)/); assert.ok(!/!!/.test(o2), o2);
  assert.strictEqual(F.sys_user_role.length, 5); assert.strictEqual(F.sys_user_role_contains.length, 3);
  const inst = F.sys_db_object.find(t => t.name === 'x_2160899_driftw_0_cmdb_ci_sn_instance');
  assert.strictEqual(inst.super_class, 't_cmdb_ci_appl_now_app'); assert.strictEqual(inst.is_extendable, '1');
  const adm = F.sys_user_role.find(r => r.name === 'x_2160899_driftw_0.admin');
  assert.deepStrictEqual(F.sys_user_role_contains.filter(l => l.role === adm.sys_id).length, 2);
  o2 = run(false, F); assert.match(o2, /Created: 0 role record\(s\), 0 table\(s\), 0 column\(s\), 0 choice\(s\)/);
  console.log('fresh-instance build OK');
  // 6. upgrade from v0.3 (no 'columns' choices yet): only the 2 new choices
  F.sys_choice = F.sys_choice.filter(c => c.value !== 'columns' || c.name.endsWith('item_change') || c.name.endsWith('tracked_object'));
  o2 = run(true, F); assert.match(o2, /Would create: 0 role record\(s\), 0 table\(s\), 0 column\(s\), 2 choice\(s\)/);
  console.log('v0.3 -> v0.4 upgrade: 2 choices');
  // 7. upgrade v0.4.x -> v0.5: 2 history tables, their 28 columns, retention + 2 link columns x2 tables, choices
  run(false, F); // back to a complete install
  const T05 = ['x_2160899_driftw_0_collection_run', 'x_2160899_driftw_0_item_change'];
  F.sys_db_object = F.sys_db_object.filter(t => !T05.includes(t.name));
  F.sys_dictionary = F.sys_dictionary.filter(d => !T05.includes(d.name) && !['source_table', 'source_url', 'retention_days'].includes(d.element));
  F.sys_choice = F.sys_choice.filter(c => !T05.includes(c.name) && c.value !== 'update_sets');
  o2 = run(true, F); assert.match(o2, /Would create: 0 role record\(s\), 2 table\(s\), 35 column\(s\), 25 choice\(s\)/);
  const ur = F.sys_db_object.length; o2 = run(false, F); assert.ok(!/!!/.test(o2), o2); assert.strictEqual(F.sys_db_object.length, ur + 2);
  const url = F.sys_dictionary.find(d => d.name === 'x_2160899_driftw_0_tracked_item' && d.element === 'source_url');
  assert.strictEqual(url.internal_type, 'url'); assert.strictEqual(String(url.max_length), '1024');
  console.log('v0.4 -> v0.5 upgrade: 2 tables, 35 columns, 25 choices');
  // 8. upgrade v0.5 -> v0.6: tracked_object (16 columns, 14 choices) + Object reference on 3 tables
  const OBJ = 'x_2160899_driftw_0_tracked_object';
  F.sys_db_object = F.sys_db_object.filter(t => t.name !== OBJ);
  F.sys_dictionary = F.sys_dictionary.filter(d => d.name !== OBJ && d.element !== 'object');
  F.sys_choice = F.sys_choice.filter(c => c.name !== OBJ);
  o2 = run(true, F); assert.match(o2, /Would create: 0 role record\(s\), 1 table\(s\), 19 column\(s\), 15 choice\(s\)/);
  o2 = run(false, F); assert.ok(!/!!/.test(o2), o2);
  const ok = F.sys_dictionary.find(d => d.name === OBJ && d.element === 'object_key'); assert.strictEqual(ok.unique, '1');
  const po = F.sys_dictionary.find(d => d.name === OBJ && d.element === 'parent_object'); assert.strictEqual(po.reference, OBJ);
  ['x_2160899_driftw_0_tracked_item', 'x_2160899_driftw_0_cmdb_ci_sn_tracked_table', 'x_2160899_driftw_0_item_change'].forEach(t =>
    assert.strictEqual(F.sys_dictionary.find(d => d.name === t && d.element === 'object').reference, OBJ, t));
  assert.ok(!F.sys_dictionary.find(d => d.name === 'x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin' && d.element === 'object'), 'plugin inherits object');
  o2 = run(false, F); assert.match(o2, /Created: 0 role record\(s\), 0 table\(s\), 0 column\(s\), 0 choice\(s\)/);
  console.log('v0.5 -> v0.6 upgrade: 1 table, 19 columns, 15 choices');
  // O03: an O01 install gains only the "ignored" status choice
  F.sys_choice = F.sys_choice.filter(c => !(c.name === OBJ && c.value === 'ignored'));
  o2 = run(true, F); assert.match(o2, /Would create: 0 role record\(s\), 0 table\(s\), 0 column\(s\), 1 choice\(s\)/);
  console.log('O01 -> O03: 1 choice');
  // security phase 1: collection_run.run_trigger (Started by), 5 choices
  F.sys_dictionary = F.sys_dictionary.filter(d => d.element !== 'run_trigger');
  F.sys_choice = F.sys_choice.filter(c => c.element !== 'run_trigger');
  o2 = run(true, F); assert.match(o2, /Would create: 0 role record\(s\), 0 table\(s\), 1 column\(s\), 6 choice\(s\)/); // + the O03 choice the step above left out
  console.log('security phase 1: 1 column, 5 choices (+1 left from the step above)');
}
console.log('SCHEMA BUILDER TESTS PASSED');
