const vm = require('vm'), fs = require('fs'), assert = require('assert');
const APP = 'app0001';
function run(S, o) {
  let src = fs.readFileSync(__dirname + '/../dist/install_ui.js', 'utf8');
  if (o.live) src = src.replace('var DRY_RUN = true;', 'var DRY_RUN = false;');
  if (o.update) src = src.replace('var UPDATE_EXISTING = false;', 'var UPDATE_EXISTING = true;');
  let seq = 0;
  class GlideRecord {
    constructor(t) { this.t = t; this.q = []; }
    isValid() { return true; } isValidField() { return true; }
    addQuery(f, op, v) { if (arguments.length < 3) { v = op; op = '='; } this.q.push(op === 'STARTSWITH' ? (r => String(r[f] || '').startsWith(String(v))) : (r => String(r[f]) === String(v))); } setLimit() {}
    query() { this.rows = (S[this.t] = S[this.t] || []).filter(r => this.q.every(f => f(r))); if (this.ob) this.rows.sort((x, y) => +x[this.ob] - +y[this.ob]); this.i = -1; }
    next() { this.cur = this.rows[++this.i]; return !!this.cur; }
    get(a, b) { const rows = S[this.t] || []; this.cur = b === undefined ? rows.find(r => r.sys_id === a) : rows.find(r => r[a] === b); return !!this.cur; }
    getValue(f) { const v = this.cur[f]; return v === undefined ? null : String(v); } getDisplayValue(f) { return this.getValue(f); }
    getUniqueValue() { return this.cur.sys_id; }
    initialize() { this.cur = { sys_id: this.t + (++seq) }; }
    setValue(f, v) { this.cur[f] = String(v); }
    insert() { assert.ok(o.live, 'write during dry run ' + this.t);
      if (this.t === 'sys_security_acl' && !o.elevated) return null;
      this.cur.sys_scope = APP; if (this.t === 'sys_ws_definition') this.cur.base_uri = '/api/x_2160899_driftw_0/' + this.cur.service_id;
      (S[this.t] = S[this.t] || []).push(this.cur); return this.cur.sys_id; }
    update() { assert.ok(o.live); return this.cur.sys_id; }
    deleteRecord() { assert.ok(o.live); const r = S[this.t], i = r.indexOf(this.cur); if (i > -1) r.splice(i, 1); return true; }
    orderBy(f) { this.ob = f; }
  }
  const out = [];
  const ctx = { GlideRecord, String, gs: { info: s => out.push(s), getCurrentApplicationId: () => APP, getProperty: (n, d) => ((o.props || {})[n] !== undefined ? o.props[n] : d),
    getSession: () => ({ getRoles: () => o.elevated ? 'admin,security_admin' : 'admin' }) } };
  vm.createContext(ctx); vm.runInContext(src, ctx); return out.join('\n');
}
const roles = ['configuration_read', 'configuration_read_secure', 'configuration_admin'].map((r, i) => ({ sys_id: 'role' + i, name: 'x_2160899_driftw_0.' + r }));
const S = { sys_scope: [{ sys_id: APP, scope: 'x_2160899_driftw_0', name: 'Driftwood' }], sys_user_role: roles,
  sys_security_operation: [{ sys_id: 'op_r', name: 'read' }, { sys_id: 'op_w', name: 'write' }], sys_security_type: [{ sys_id: 'ty', name: 'record' }] };
let out;
out = run(S, { elevated: true }); assert.match(out, /Would create: 77,/); assert.strictEqual((S.sys_security_acl || []).length, 0);
// not elevated live: everything except ACLs installs, ACLs warn
out = run(S, { live: true, elevated: false }); assert.match(out, /NOT elevated/); assert.match(out, /ACL insert failed/); assert.match(out, /ACL insert\(s\) above will probably be refused/);
assert.strictEqual((S.sys_ui_page || []).length, 2); assert.strictEqual((S.sys_app_module || []).length, 17); assert.strictEqual((S.sysauto_script || []).length, 2); assert.strictEqual((S.sys_ws_operation || []).length, 6);
// elevated re-run: only ACLs created
out = run(S, { live: true, elevated: true }); assert.match(out, /Created: 21,/); assert.strictEqual(S.sys_security_acl.length, 21); assert.strictEqual(S.sys_security_acl_role.length, 21);
const page = S.sys_ui_page.find(p => p.name === 'current_settings'); assert.strictEqual(page.html, fs.readFileSync(__dirname + '/../src/ui_pages/x_2160899_driftw_0_current_settings.html.xml', 'utf8'));
const op = S.sys_ws_operation.find(o => o.relative_path === '/current'); assert.match(op.operation_script, /response.setStatus\(403\)/); assert.strictEqual(op.http_method, 'GET');
assert.ok(S.sys_app_module.find(m => m.link_type === 'DIRECT' && m.query === 'x_2160899_driftw_0_current_settings.do'));
assert.match(out, /base path: \/api\/x_2160899_driftw_0\/driftwood/);
// idempotent
out = run(S, { live: true, elevated: true }); assert.match(out, /Created: 0, updated: 0/); assert.ok(!/!!/.test(out), out);
// new v0.2 records
const drift = S.sys_ui_page.find(p => p.name === 'drift_report');
assert.strictEqual(drift.html, fs.readFileSync(__dirname + '/../src/ui_pages/x_2160899_driftw_0_drift_report.html.xml', 'utf8'));
assert.strictEqual(drift.client_script, fs.readFileSync(__dirname + '/../src/ui_pages/x_2160899_driftw_0_drift_report.client.js', 'utf8'));
assert.deepStrictEqual(S.sys_ws_operation.map(o => o.http_method + ' ' + o.relative_path).sort(), ['GET /compare', 'GET /current', 'GET /instances', 'GET /matrix', 'POST /collect', 'POST /snapshot']);
assert.match(S.sys_ws_operation.find(o => o.relative_path === '/snapshot').operation_script, /configuration_admin/);
assert.ok(S.sys_app_module.find(m => m.title === 'Drift Report' && m.query === 'x_2160899_driftw_0_drift_report.do'));
const col = S.sys_ws_operation.find(o => o.relative_path === '/collect');
assert.match(col.operation_script, /configuration_admin/); assert.match(col.operation_script, /ConfigNowWriter\(\)\.persist/);
// v0.4.0 -> v0.4.1: /collect is new, both pages changed
{
  const V = JSON.parse(JSON.stringify(S));
  V.sys_ws_operation = V.sys_ws_operation.filter(o => o.relative_path !== '/collect');
  V.sys_ui_page.forEach(p => { p.client_script = p.client_script + '\n// old'; });
  const o3 = run(V, { elevated: true, update: true });
  assert.match(o3, /Would create: 1, would update: 2/);
  console.log('v0.4.0 -> v0.4.1: 1 create, 2 updates');
}
// v0.4.2 -> v0.5.0: 6 history ACLs, purge job, 2 modules; 7 changed scripts/pages
{
  const W = JSON.parse(JSON.stringify(S));
  const hist = n => /collection_run|item_change/.test(n);
  const gone = W.sys_security_acl.filter(a => hist(a.name)).map(a => a.sys_id);
  W.sys_security_acl = W.sys_security_acl.filter(a => !hist(a.name));
  W.sys_security_acl_role = W.sys_security_acl_role.filter(r => !gone.includes(r.sys_security_acl));
  W.sysauto_script = W.sysauto_script.filter(j => j.name !== 'Driftwood - Purge history');
  W.sys_app_module = W.sys_app_module.filter(m => !['Collection Runs', 'Item Changes'].includes(m.title));
  W.sys_ui_action.forEach(x => { x.script += '\n// v0.4.2'; });
  W.sysauto_script.forEach(x => { x.script += '\n// v0.4.2'; });
  W.sys_ws_operation.filter(o => ['/compare', '/matrix', '/collect'].includes(o.relative_path)).forEach(o => { o.operation_script += '\n// v0.4.2'; });
  W.sys_ui_page.forEach(p => { p.client_script += '\n// v0.4.2'; });
  const o5 = run(W, { elevated: true, update: true });
  assert.match(o5, /Would create: 9, would update: 7/);
  console.log('v0.4.2 -> v0.5.0: 9 creates, 7 updates');
}
// G06 (v0.5.2): category list modules + instance-form related lists
{
  const plug = S.sys_app_module.find(m => m.title === 'Plugins');
  assert.strictEqual(plug.name, 'x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin', 'default routing for plugins');
  assert.strictEqual(plug.filter, 'item_category=plugins^present=true'); assert.strictEqual(plug.link_type, 'LIST');
  assert.strictEqual(S.sys_app_module.find(m => m.title === 'Columns').name, 'x_2160899_driftw_0_tracked_item');
  assert.strictEqual(S.sys_relationship.length, 9);
  const rel = S.sys_relationship.find(r => r.name === 'Driftwood: Update Sets');
  assert.strictEqual(rel.basic_apply_to, 'x_2160899_driftw_0_cmdb_ci_sn_instance');
  assert.match(rel.query_with, /addQuery\('item_category', 'update_sets'\)/); assert.match(rel.query_with, /parent\.getUniqueValue\(\)/);
  assert.strictEqual(S.sys_ui_related_list.length, 1); assert.strictEqual(S.sys_ui_related_list[0].view, 'Default view');
  const ents = S.sys_ui_related_list_entry.map(e => e.related_list);
  assert.strictEqual(ents.length, 11);
  assert.ok(ents.includes('x_2160899_driftw_0_collection_run.instance') && ents.includes('x_2160899_driftw_0_item_change.instance'));
  assert.ok(ents.filter(e => e.startsWith('REL:')).length === 9);
  // routing property respected: applications routed to the plain table
  const X = JSON.parse(JSON.stringify(S));
  const ox = run(X, { elevated: true, update: true, props: { 'x_2160899_driftw_0.table.applications': 'x_2160899_driftw_0_tracked_item' } });
  assert.match(ox, /MODULE Applications  \(x_2160899_driftw_0_tracked_item\)  UPDATE \(name\)/);
  // v0.5.1 -> v0.5.2: 30 new records, nothing else changes
  const Y = JSON.parse(JSON.stringify(S));
  Y.sys_relationship = []; Y.sys_ui_related_list = []; Y.sys_ui_related_list_entry = [];
  Y.sys_app_module = Y.sys_app_module.filter(m => !/^(Plugins|Applications|System Properties|Clone Preservers|Clone Exclusions|Tables|Columns|Update Sets|MID Servers)$/.test(m.title));
  const oy = run(Y, { elevated: true, update: true });
  assert.match(oy, /Would create: 30, would update: 0/);
  console.log('G06: 9 modules, 9 relationships, 11 related lists; v0.5.1 -> v0.5.2 = 30 creates');
}
// v0.5.3 rebrand: an install made under the ConfigurationNOW names is renamed in place
{
  const O = JSON.parse(JSON.stringify(S));
  const menu = O.sys_app_application[0]; menu.title = 'ConfigurationNOW';
  O.sysauto_script.forEach(j => { j.name = j.name.replace('Driftwood', 'ConfigurationNOW'); j.script = j.script.replace(/Driftwood/g, 'ConfigurationNOW'); });
  O.sys_ws_definition[0].service_id = 'configurationnow'; O.sys_ws_definition[0].name = 'ConfigurationNOW'; O.sys_ws_definition[0].active = 'true';
  O.sys_user_role.forEach(r => { r.description = 'ConfigurationNOW: role ' + r.name; });
  O.sys_ui_action[0].comments = 'ConfigurationNOW: collect this instance now';
  O.sys_ui_page.forEach(p => { p.description = p.description.replace('Driftwood', 'ConfigurationNOW'); p.client_script = p.client_script.replace(/\/driftwood/g, '/configurationnow'); });
  const nMenus = O.sys_app_application.length, nJobs = O.sysauto_script.length, nMods = O.sys_app_module.length;
  const dry = run(O, { elevated: true, update: true });
  assert.match(dry, /MENU   Driftwood  RENAME from the ConfigurationNOW name/);
  assert.match(dry, /JOB    Driftwood - Collect current instance  RENAME/); assert.match(dry, /JOB    Driftwood - Purge history  RENAME/);
  assert.match(dry, /REST   old API \/configurationnow  DEACTIVATE/);
  assert.match(dry, /ROLE   x_2160899_driftw_0.configuration_read  description -> Driftwood/);
  const live = run(O, { live: true, elevated: true, update: true });
  assert.ok(!/!!/.test(live), live);
  assert.strictEqual(O.sys_app_application.length, nMenus, 'no duplicate menu'); assert.strictEqual(O.sys_app_application[0].title, 'Driftwood');
  assert.strictEqual(O.sysauto_script.length, nJobs, 'no duplicate jobs');
  assert.deepStrictEqual(O.sysauto_script.map(j => j.name).sort(), ['Driftwood - Collect current instance', 'Driftwood - Purge history']);
  assert.ok(O.sysauto_script.every(j => !/ConfigurationNOW/.test(j.script)), 'job scripts updated');
  assert.strictEqual(O.sys_app_module.length, nMods, 'modules stay on the renamed menu');
  const apis = O.sys_ws_definition.map(d => d.service_id + ':' + d.active).sort();
  assert.deepStrictEqual(apis, ['configurationnow:false', 'driftwood:true']);
  const newApi = O.sys_ws_definition.find(d => d.service_id === 'driftwood');
  assert.strictEqual(O.sys_ws_operation.filter(op => op.web_service_definition === newApi.sys_id).length, 6, 'all 6 operations on the new API');
  assert.ok(O.sys_user_role.every(r => /^Driftwood:/.test(r.description)));
  assert.ok(O.sys_ui_page.every(p => !/configurationnow/.test(p.client_script) && /^Driftwood/.test(p.description)));
  assert.match(live, /base path: \/api\/x_2160899_driftw_0\/driftwood/);
  const again = run(O, { live: true, elevated: true, update: true });
  assert.match(again, /Created: 0, updated: 0/);
  console.log('rebrand: menu + 2 jobs renamed in place, /driftwood API created, /configurationnow deactivated, roles relabelled');
}
// G08 (v0.5.4): list layouts
{
  const ids = t => { const l = S.sys_ui_list.find(x => x.name === t && x.view === 'Default view'); return S.sys_ui_list_element.filter(e => e.list_id === l.sys_id).sort((a, b) => a.position - b.position).map(e => e.element); };
  assert.strictEqual(S.sys_ui_list.length, 5);
  assert.deepStrictEqual(ids('x_2160899_driftw_0_item_change'), ['changed_on', 'instance', 'item_category', 'item_key', 'item_name', 'change_type', 'changed_fields', 'run', 'source_url']);
  assert.deepStrictEqual(ids('x_2160899_driftw_0_collection_run').slice(0, 3), ['run_id', 'instance', 'source']);
  // a personalised layout is left alone without UPDATE_EXISTING, replaced with it
  const Z = JSON.parse(JSON.stringify(S));
  const lc = Z.sys_ui_list.find(x => x.name === 'x_2160899_driftw_0_item_change');
  Z.sys_ui_list_element = Z.sys_ui_list_element.filter(e => e.list_id !== lc.sys_id).concat([{ sys_id: 'p1', list_id: lc.sys_id, element: 'change_type', position: '0' }]);
  const z1 = run(Z, { live: true, elevated: true });
  assert.match(z1, /LIST   x_2160899_driftw_0_item_change  \(9 columns\) exists with other columns \(change_type\)/);
  assert.deepStrictEqual(Z.sys_ui_list_element.filter(e => e.list_id === lc.sys_id).map(e => e.element), ['change_type'], 'untouched');
  const z2 = run(Z, { live: true, elevated: true, update: true });
  assert.match(z2, /UPDATE \(was: change_type\)/);
  assert.strictEqual(Z.sys_ui_list_element.filter(e => e.list_id === lc.sys_id).length, 9, 'replaced');
  // v0.5.3 -> v0.5.4: the 5 layouts are the only change (item_change/run lists start with one column on a new table)
  const Y2 = JSON.parse(JSON.stringify(S));
  Y2.sys_ui_list = Y2.sys_ui_list.filter(x => !/item_change|collection_run/.test(x.name)).concat(
    [{ sys_id: 'L1', name: 'x_2160899_driftw_0_item_change', view: 'Default view' }, { sys_id: 'L2', name: 'x_2160899_driftw_0_collection_run', view: 'Default view' }]);
  Y2.sys_ui_list_element = Y2.sys_ui_list_element.filter(e => S.sys_ui_list.find(x => x.sys_id === e.list_id && !/item_change|collection_run/.test(x.name)))
    .concat([{ sys_id: 'e1', list_id: 'L1', element: 'change_type', position: '0' }, { sys_id: 'e2', list_id: 'L2', element: 'run_id', position: '0' }]);
  const y3 = run(Y2, { elevated: true, update: true });
  assert.match(y3, /Would create: 0, would update: 2,/);
  console.log('G08: 5 list layouts; personalised layouts kept unless UPDATE_EXISTING');
}
// upgrade path: an instance with only the v0.1.2 records gets exactly the 5 new ones
{
  const U = JSON.parse(JSON.stringify(S));
  U.sys_ws_operation = U.sys_ws_operation.filter(o => o.relative_path === '/current');
  U.sys_ui_page = U.sys_ui_page.filter(p => p.name === 'current_settings');
  U.sys_app_module = U.sys_app_module.filter(m => m.title !== 'Drift Report');
  const o2 = run(U, { elevated: true }); assert.match(o2, /Would create: 7, would update: 0, unchanged: 70/);
  console.log('upgrade path OK (7 new records)');
}
console.log('SECTION G INSTALLER TESTS PASSED');
