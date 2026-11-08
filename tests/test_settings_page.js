// Browser-side test of the Current Instance Settings page (jsdom): Collect now,
// per-column sort and filters, light/dark theme. Requires jsdom on NODE_PATH.
const fs = require('fs'), assert = require('assert');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname + '/../src/ui_pages/x_2160899_driftw_0_current_settings.html.xml', 'utf8');
const client = fs.readFileSync(__dirname + '/../src/ui_pages/x_2160899_driftw_0_current_settings.client.js', 'utf8');
const body = html.replace(/^[\s\S]*?<j:jelly[^>]*>/, '').replace(/<\/j:jelly>[\s\S]*$/, '');

const snap = { collector_version: '0.4.1-poc', collected_at: '2026-11-07 12:00:00', duration_ms: 900, warnings: [],
  instance: { instance_name: 'dev1', family: 'Brazil', patch: 'p1' },
  categories: {
    plugins: { count: 4, items: [
      { key: 'com.b', name: 'Beta', version: '10.0', state: 'active', attributes: {}, source_table: 'sys_plugins', source_sys_id: 'PB' },
      { key: 'com.a', name: 'Alpha', version: '9.1', state: 'active', attributes: {} },
      { key: 'com.c', name: 'Gamma', version: '2.0', state: 'inactive', attributes: {} },
      { key: 'com.d', name: '', version: '1.5', state: 'active', attributes: {} }] },
    tables: { count: 2, items: [
      { key: 'sys_script', name: 'Business Rule', state: 'present', attributes: { total: 6097, scope: 'global' } },
      { key: 'sp_page', name: 'Page', state: 'present', attributes: { total: 128, scope: 'global' } }] } } };

function page(opts) {
  opts = opts || {};
  const dom = new JSDOM('<!doctype html><html><head></head><body' + (opts.dark ? ' style="background-color: rgb(20, 22, 26); color: rgb(230,230,230)"' : '') + '>' + body + '</body></html>', { runScripts: 'outside-only', url: 'https://dev1.service-now.com/x.do' });
  const w = dom.window, calls = [];
  w.g_ck = 'tok';
  w.addLoadEvent = fn => fn();
  w.XMLHttpRequest = class {
    open(m, u) { this.m = m; this.u = u; }
    setRequestHeader() {}
    send(b) {
      calls.push(this.m + ' ' + this.u);
      this.readyState = 4;
      if (this.u.endsWith('/collect')) {
        this.status = opts.collectStatus || 200;
        this.responseText = JSON.stringify({ result: this.status == 200 ? { collected_at: '2026-11-07 12:05:00', duration_ms: 812, warnings: 0, totals: { inserted: 0, updated: 1, restored: 0, removed: 0, unchanged: 3306 } } : { error: 'Requires role x' } });
      } else { this.status = 200; this.responseText = JSON.stringify({ result: snap }); }
      this.onreadystatechange();
    }
  };
  w.eval(client);
  return { w, $: id => w.document.getElementById(id), calls };
}
const cells = (p, col) => [...p.$('cfgnow-table').querySelectorAll('tbody tr')].map(tr => tr.children[col].textContent);

// --- load, default order ---
let p = page();
assert.deepStrictEqual(cells(p, 0), ['com.b', 'com.a', 'com.c', 'com.d']);
assert.match(p.$('cfgnow-status').textContent, /4 of 4 shown/);
// --- sort: click Plugin ID, then again for descending; version sorts numerically ---
const th = i => p.$('cfgnow-table').querySelectorAll('thead tr')[0].children[i];
th(0).click(); assert.deepStrictEqual(cells(p, 0), ['com.a', 'com.b', 'com.c', 'com.d']); assert.match(th(0).textContent, /▲/);
th(0).click(); assert.deepStrictEqual(cells(p, 0), ['com.d', 'com.c', 'com.b', 'com.a']); assert.match(th(0).textContent, /▼/);
th(2).click(); assert.deepStrictEqual(cells(p, 2), ['1.5', '2.0', '9.1', '10.0'], 'numeric sort, not 10 < 2');
// --- per-column filters ---
const colf = i => p.$('cfgnow-table').querySelectorAll('input.colf')[i];
const setF = (i, v) => { const x = colf(i); x.value = v; x.oninput.call(x); };
setF(3, 'inactive'); assert.deepStrictEqual(cells(p, 0), ['com.c']);
setF(3, '!inactive'); assert.deepStrictEqual(cells(p, 0).sort(), ['com.a', 'com.b', 'com.d']);
setF(3, ''); setF(2, '>5'); assert.deepStrictEqual(cells(p, 2), ['9.1', '10.0']);
setF(2, ''); setF(1, 'empty'); assert.deepStrictEqual(cells(p, 0), ['com.d']);
setF(1, '=alpha'); assert.deepStrictEqual(cells(p, 0), ['com.a']);
assert.strictEqual(colf(1).value, '=alpha', 'filter input survives redraw (focus kept while typing)');
assert.match(p.$('cfgnow-status').textContent, /1 of 4 shown/);
// filters and sort are kept per tab
[...p.$('cfgnow-tabs').children].find(t => t.getAttribute('data-cat') === 'tables').click();
assert.deepStrictEqual(cells(p, 0), ['sys_script', 'sp_page']);
[...p.$('cfgnow-tabs').children].find(t => t.getAttribute('data-cat') === 'plugins').click();
assert.deepStrictEqual(cells(p, 0), ['com.a'], 'plugins filter kept');
setF(1, '');

// --- open link to the source record ---
{ const links = [...p.$('cfgnow-table').querySelectorAll('a.open')];
  assert.strictEqual(links.length, 1); assert.strictEqual(links[0].getAttribute('href'), '/sys_plugins.do?sys_id=PB'); assert.strictEqual(links[0].target, '_blank'); }
// --- Collect now ---
p.$('cfgnow-collect').click();
assert.ok(p.calls.includes('POST /api/x_2160899_driftw_0/driftwood/collect'));
assert.strictEqual(p.calls[p.calls.length - 1], 'GET /api/x_2160899_driftw_0/driftwood/current', 'reloads after saving');
assert.match(p.$('cfgnow-status').textContent, /Saved 2026-11-07 12:05:00 UTC: 0 new, 1 changed, 0 restored, 0 no longer present, 3306 unchanged \(812 ms\)/);
assert.strictEqual(p.$('cfgnow-collect').disabled, false);
const p403 = page({ collectStatus: 403 });
p403.$('cfgnow-collect').click();
assert.match(p403.$('cfgnow-status').textContent, /needs role x_2160899_driftw_0.configuration_admin/);

// --- theme ---
assert.ok(!/cn-dark/.test(p.$('cfgnow').className), 'light surroundings -> light');
const pd = page({ dark: true });
assert.ok(/cn-dark/.test(pd.$('cfgnow').className), 'dark surroundings -> dark');
assert.strictEqual(pd.$('cfgnow-theme').textContent, 'Light');
pd.$('cfgnow-theme').click();
assert.ok(!/cn-dark/.test(pd.$('cfgnow').className), 'toggle overrides');
assert.ok(/--cn-1f2933: #e4e7eb/.test(html) && /#cfgnow \{ background: var\(--cn-fff\)/.test(html), 'dark tokens + explicit background');
console.log('SETTINGS PAGE (browser) TESTS PASSED');
