// Every installer, the exporter and every diagnostic refuses to run unless the
// script scope is global, BEFORE touching any table or API (in an app scope each
// touch would add a cross-scope privilege to that app, even in a dry run).
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const scripts = ['dist/install_code.js', 'dist/install_ui.js', 'src/background/build_schema.js', 'dist/export_snapshot.js']
  .concat(fs.readdirSync(path.join(root, 'src/diagnostics')).map(f => 'src/diagnostics/' + f));

function run(file, scope) {
  const out = [], touched = [];
  const Touch = name => function () { touched.push(name); this.isValid = () => true; };
  const ctx = {
    GlideRecord: Touch('GlideRecord'), GlideAggregate: Touch('GlideAggregate'), GlideSysAttachment: Touch('GlideSysAttachment'),
    GlideDateTime: Touch('GlideDateTime'), GlideDigest: Touch('GlideDigest'),
    Class: { create: () => function () { if (this.initialize) this.initialize.apply(this, arguments); } },
    gs: { info: s => out.push(String(s)), print: s => out.push(String(s)), getProperty: (n, d) => d,
      getCurrentApplicationId: () => 'app', getCurrentScopeName: () => scope },
    JSON, Date, String, Object, parseInt
  };
  vm.createContext(ctx);
  let error = null;
  try { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file }); } catch (e) { error = e; }
  return { out: out.join('\n'), touched, error };
}

for (const f of scripts) {
  const r = run(f, 'x_2160899_driftw_0');
  const msg = (r.error ? r.error.message : '') + r.out;
  assert.match(msg, /script scope set to global|set the script scope \(Scripts - Background\) to global/, f + ': no scope refusal: ' + msg.slice(0, 200));
  assert.deepStrictEqual(r.touched, [], f + ' touched ' + r.touched.join(',') + ' before refusing');
}
// In global the guard lets the script proceed (it then touches the platform APIs)
for (const f of scripts) {
  const r = run(f, 'rhino.global');
  assert.ok(r.touched.length > 0 || /ABORT: (application scope|scope )/.test(r.out), f + ' did not proceed in global');
  assert.ok(!/set the script scope|script scope set to global/.test((r.error ? r.error.message : '') + r.out), f + ' refused in global');
}
console.log('SCOPE GUARD TESTS PASSED (' + scripts.length + ' scripts)');
