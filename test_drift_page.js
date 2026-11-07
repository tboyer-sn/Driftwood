// Browser-side test of the Drift Report page: real HTML + client script in jsdom,
// API responses produced by the real engine (via the mock harness).
// Requires jsdom: run with NODE_PATH pointing at a node_modules that has it.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const { JSDOM } = require('jsdom');
const { makeEnv, load } = require('./harness');

// --- build engine data: 3 instances ---
const T = (fields, rows = []) => ({ fields, rows: rows.map((r, i) => Object.assign({ sys_id: 's' + i + Math.random().toString(16).slice(2, 6) }, r)) });
const tracked = ['instance', 'item_category', 'item_key', 'item_value', 'item_version', 'item_state', 'value_hash', 'item_attributes', 'runtime', 'source_sys_id', 'is_secure', 'secure_value_hash', 'present', 'first_seen', 'last_changed'];
const D = {
  sys_plugins: T(['source', 'version', 'active'], [{ source: 'com.a', name: 'A', version: '1', active: '1' }, { source: 'com.b', name: 'B', version: '2', active: '1' }]),
  sys_properties: T(['value', 'type', 'is_private', 'sys_scope'], [{ name: 'glide.ui.session_timeout', value: '30', type: 'integer' }]),
  x_2160899_driftw_0_cmdb_ci_sn_instance: T(['instance_name', 'instance_id', 'instance_url', 'build_name', 'build_tag', 'build_date', 'war', 'family', 'patch', 'production_flag', 'environment', 'version', 'fqdn', 'timezone', 'node_count', 'nodes', 'last_collected', 'collection_status', 'collection_summary']),
  x_2160899_driftw_0_cmdb_ci_sn_tracked_plugin: T(tracked), x_2160899_driftw_0_tracked_item: T(tracked)
};
const props = { instance_name: 'dev1', 'glide.war': 'glide-brazil-x__patch1.zip' };
['applications', 'mid_servers', 'system_properties', 'clone_preservers', 'clone_exclusions'].forEach(c => props['x_2160899_driftw_0.table.' + c] = 'x_2160899_driftw_0_tracked_item');
props['x_2160899_driftw_0.categories'] = 'plugins,applications,mid_servers,system_properties,clone_preservers,clone_exclusions'; // pin pre-tables categories
const { ctx } = makeEnv(D, props);
ctx.GlideDateTime = class { getValue() { return '2026-11-04 12:00:00'; } };
load(ctx, ['src/script_includes/ConfigNowConfig.js', 'src/script_includes/ConfigNowCollector.js', 'src/script_includes/ConfigNowWriter.js', 'src/script_includes/ConfigNowCompare.js', 'src/script_includes/ConfigNowImporter.js']);
const R = s => JSON.parse(JSON.stringify(vm.runInContext(s, ctx)));
const A = R('var s = new ConfigNowCollector().collect(); new ConfigNowWriter().persist(s); s');
const mk = (name, env, mut) => { const x = JSON.parse(JSON.stringify(A)); x.instance.instance_name = name; x.collected_at = '2026-11-01 01:00:00'; mut(x); ctx.__X = vm.runInContext('(' + JSON.stringify(x) + ')', ctx); R('new ConfigNowImporter().importSnapshot(__X)'); D.x_2160899_driftw_0_cmdb_ci_sn_instance.rows.find(r => r.instance_name === name).environment = env; };
mk('prod1', 'Production', x => { x.categories.plugins.items[0].version = '9'; x.categories.system_properties.items.find(i => i.key === 'glide.ui.session_timeout').value = '60'; });
mk('test1', 'Test', x => { x.categories.plugins.items = x.categories.plugins.items.filter(i => i.key !== 'com.b'); });

// --- page ---
const html = fs.readFileSync(__dirname + '/../src/ui_pages/x_2160899_driftw_0_drift_report.html.xml', 'utf8');
const body = html.replace(/^[\s\S]*?<j:jelly[^>]*>/, '').replace(/<\/j:jelly>\s*$/, '');
const dom = new JSDOM('<!doctype html><html><body>' + body + '</body></html>', { runScripts: 'outside-only', url: 'https://dev1.example/' });
const w = dom.window, calls = [];
let loadFns = [];
w.addLoadEvent = fn => loadFns.push(fn);
w.g_ck = 'tok';
w.URL.createObjectURL = () => 'blob:x';
class XHR {
  open(m, u) { this.m = m; this.u = u; } setRequestHeader() {}
  send(body) {
    calls.push(this.m + ' ' + this.u);
    const u = new URL(this.u, 'https://dev1.example');
    let res;
    if (u.pathname.endsWith('/instances')) res = R('({ local: "dev1", instances: new ConfigNowCompare().listInstances() })');
    else if (u.pathname.endsWith('/matrix')) { ctx.__IDS = u.searchParams.get('instances'); res = R('new ConfigNowCompare().compareMany(String(__IDS).split(","))'); }
    else if (u.pathname.endsWith('/compare')) { ctx.__A = u.searchParams.get('a'); ctx.__B = u.searchParams.get('b'); res = R('new ConfigNowCompare().compare(__A, __B)'); }
    this.readyState = 4; this.status = 200; this.responseText = JSON.stringify({ result: res });
    this.onreadystatechange();
  }
}
w.XMLHttpRequest = XHR;
w.eval(fs.readFileSync(__dirname + '/../src/ui_pages/x_2160899_driftw_0_drift_report.client.js', 'utf8'));
loadFns.forEach(f => f());
const $ = id => w.document.getElementById(id);

// pair dropdown order: local first, then Test, then Production
assert.deepStrictEqual([...$('dr-a').options].map(o => o.text.split(' ')[0]), ['dev1', 'test1', 'prod1']);
// chips: local locked on
const chips = $('dr-insts').getElementsByTagName('input');
assert.strictEqual(chips.length, 3); assert.strictEqual(chips[0].disabled, true); assert.strictEqual(chips[0].checked, true);
// switch to All instances and compare
$('dr-mode-all').click();
assert.strictEqual($('dr-pairbar').style.display, 'none'); assert.strictEqual($('dr-allbar').style.display, '');
$('dr-compare-all').click();
assert.ok(calls.some(c => c.indexOf('/matrix?instances=') > -1));
const ths = [...$('dr-result').querySelectorAll('thead th')].map(t => t.childNodes[0].textContent);
assert.deepStrictEqual(ths, ['Item', 'dev1 (baseline)', 'test1', 'prod1'], 'column order fixed, baseline first');
assert.ok($('dr-result').querySelector('thead th.k2'), 'baseline column is sticky');
const rowKeys = () => [...$('dr-result').querySelectorAll('tbody tr td.k1 div.mono')].map(d => d.textContent);
assert.deepStrictEqual(rowKeys().sort(), ['com.a', 'com.b', 'glide.ui.session_timeout']);
assert.ok($('dr-result').textContent.includes('— missing'));
// hide version-only removes com.a (version-only on prod1)
$('dr-hidever').checked = true; $('dr-hidever').onchange.call($('dr-hidever'));
assert.deepStrictEqual(rowKeys().sort(), ['com.b', 'glide.ui.session_timeout']);
// status card filter: Missing somewhere -> only com.b
[...$('dr-result').querySelectorAll('.card')].find(c => c.textContent.indexOf('Missing somewhere') > -1).click();
assert.deepStrictEqual(rowKeys(), ['com.b']);
// unticking an instance excludes its column
$('dr-mode-pair').click(); $('dr-mode-all').click();
chips[2].checked = false; $('dr-compare-all').click();
assert.deepStrictEqual([...$('dr-result').querySelectorAll('thead th')].map(t => t.childNodes[0].textContent), ['Item', 'dev1 (baseline)', 'test1']);
// pair mode still works
$('dr-mode-pair').click(); $('dr-compare').click();
assert.ok($('dr-result').querySelector('.pair'), 'pair view renders');
// tables category: column drill-in in the matrix (handcrafted response)
{
  const inst = (n, local) => ({ sys_id: n, instance_name: n, family: 'Brazil', patch: 'p1', environment: '', source: local ? 'local' : 'import', is_local: !!local, last_collected: '2026-11-04 12:00:00' });
  const fake = { schema: 'driftwood.matrix/0.1', generated_at: '2026-11-04 12:00:00', baseline: 'dev1',
    instances: [inst('dev1', true), inst('prod1')], summary: { same: 0, differs: 1, partial: 0, version_only: 0, ignored: 0 },
    per_instance: [{ instance_name: 'dev1', same: null, changed: 0, missing: 0, extra: 0 }, { instance_name: 'prod1', same: 0, changed: 1, missing: 0, extra: 0 }],
    categories: { tables: { counts: { same: 0, differs: 1, partial: 0, version_only: 0, ignored: 0 }, rows: [{ key: 'x_acme_orders', name: 'Orders', status: 'differs', version_only: false, reference: 0,
      fields: ['attributes.total', 'attributes.fingerprint'],
      cells: [{ value: '', version: '', state: 'present', attributes: { total: 5, fingerprint: 'aaaa' }, columns: ['number:string:40'], diff: [] },
              { value: '', version: '', state: 'present', attributes: { total: 7, fingerprint: 'bbbb' }, columns: ['amount:decimal:20', 'number:string:40'], diff: ['attributes.total', 'attributes.fingerprint'] }] }] } } };
  w.XMLHttpRequest = class { open(m, u) { this.u = u; } setRequestHeader() {} send() { this.readyState = 4; this.status = 200; this.responseText = JSON.stringify({ result: this.u.indexOf('/matrix') > -1 ? fake : { local: 'dev1', instances: fake.instances } }); this.onreadystatechange(); } };
  $('dr-mode-all').click(); $('dr-compare-all').click();
  const txt = $('dr-result').textContent;
  assert.ok(txt.includes('Tables'), 'Tables tab label');
  assert.ok(txt.includes('columns + ') && txt.includes('amount:decimal:20'), 'added column shown: ' + txt.slice(0, 400));
  assert.ok(txt.includes('7') && txt.includes('5'), 'counts shown');
}
// v0.4: count-only toggle and Schema label
{
  const inst = (n, local) => ({ sys_id: n, instance_name: n, family: 'Brazil', patch: 'p1', environment: '', source: local ? 'local' : 'import', is_local: !!local, last_collected: '2026-11-06 12:00:00' });
  const c = (t) => ({ value: '', version: '', state: 'present', attributes: { total: t }, diff: [] });
  const fake = { schema: 'driftwood.matrix/0.1', generated_at: '2026-11-06 12:00:00', baseline: 'dev1',
    instances: [inst('dev1', true), inst('prod1')], summary: { same: 0, differs: 2, partial: 0, version_only: 0, count_only: 1, ignored: 0 },
    per_instance: [{ instance_name: 'dev1', same: null, changed: 0, missing: 0, extra: 0 }, { instance_name: 'prod1', same: 0, changed: 2, missing: 0, extra: 0 }],
    categories: {
      tables: { counts: { same: 0, differs: 1, partial: 0, version_only: 0, count_only: 1, ignored: 0 }, rows: [
        { key: 'sys_script', name: 'Business Rule', status: 'differs', version_only: false, count_only: true, kinds: ['count'], reference: 0, fields: ['attributes.total'], cells: [c(5), c(9)] }] },
      columns: { counts: { same: 0, differs: 1, partial: 0, version_only: 0, count_only: 0, ignored: 0 }, rows: [
        { key: 'sys_script.collection', name: 'Table', status: 'differs', version_only: false, count_only: false, kinds: ['schema'], reference: 0, fields: ['attributes.max_length'],
          cells: [{ value: '', version: '', state: 'present', attributes: { max_length: '80' }, diff: [] }, { value: '', version: '', state: 'present', attributes: { max_length: '100' }, diff: ['attributes.max_length'] }] }] } } };
  w.XMLHttpRequest = class { open(m, u) { this.u = u; } setRequestHeader() {} send() { this.readyState = 4; this.status = 200; this.responseText = JSON.stringify({ result: this.u.indexOf('/matrix') > -1 ? fake : { local: 'dev1', instances: fake.instances } }); this.onreadystatechange(); } };
  $('dr-hidever').checked = false; $('dr-hidever').onchange.call($('dr-hidever'));
  $('dr-mode-pair').click(); $('dr-mode-all').click(); $('dr-compare-all').click();
  const keys = () => [...$('dr-result').querySelectorAll('tbody tr td.k1 div.mono')].map(d => d.textContent).sort();
  const t0 = $('dr-result').textContent;
  assert.deepStrictEqual(keys(), ['sys_script', 'sys_script.collection']);
  assert.ok(t0.includes('Count only') && t0.includes('Schema') && t0.includes('Columns'), 'pills + Columns tab');
  assert.ok(t0.includes('1 count-only'), 'card note');
  $('dr-hidecount').checked = true; $('dr-hidecount').onchange.call($('dr-hidecount'));
  assert.deepStrictEqual(keys(), ['sys_script.collection'], 'count-only row hidden');
  assert.ok($('dr-result').textContent.includes('1 count-only (hidden)'));
  // sys_id drift toggle re-runs the comparison with sys_ids=true; links render
  const seen = [];
  const Prev = w.XMLHttpRequest;
  w.XMLHttpRequest = class extends Prev { open(m, u) { seen.push(u); super.open(m, u); } };
  fake.categories.columns.rows[0].cells[1].url = 'https://prod1.example/sys_dictionary.do?sys_id=D1';
  $('dr-sysids').checked = true; $('dr-sysids').onchange.call($('dr-sysids'));
  assert.ok(seen.some(u => /\/matrix\?instances=.*&sys_ids=true/.test(u)), 'matrix re-requested with sys_ids=true');
  $('dr-hidecount').checked = false; $('dr-hidecount').onchange.call($('dr-hidecount'));
  const lk = [...$('dr-result').querySelectorAll('a.open')];
  assert.ok(lk.some(a => a.getAttribute('href') === 'https://prod1.example/sys_dictionary.do?sys_id=D1'), 'open link in matrix cell');
  console.log('count-only toggle OK');
}
console.log('DRIFT PAGE (browser) TESTS PASSED');
