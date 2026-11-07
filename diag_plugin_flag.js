/* Diagnostic: how sys_plugins stores "active" on this release (read-only). Script scope: GLOBAL.
 * Deliberately does NOT query v_plugin (it triggers a ~17 s catalog cache rebuild). */
if (['rhino.global', 'global'].indexOf(String(typeof gs.getCurrentScopeName == 'function' ? gs.getCurrentScopeName() : 'rhino.global')) == -1) throw new Error('Run this diagnostic with the script scope set to global: it is read-only, but in an app scope it adds cross-scope privileges to that app.');
function dist(t, f) {
  var ga = new GlideAggregate(t);
  if (!ga.isValid()) { gs.info(t + ': table not found'); return; }
  if (f && !ga.isValidField(f)) { gs.info(t + '.' + f + ': field not found'); f = null; }
  ga.addAggregate('COUNT');
  if (f) ga.groupBy(f);
  ga.query();
  while (ga.next()) gs.info(t + (f ? ' [' + f + '=' + ga.getValue(f) + ']' : '') + ' : ' + ga.getAggregate('COUNT'));
}
dist('sys_plugins', 'active');
dist('sys_store_app', 'active');
var gr = new GlideRecord('sys_plugins'); gr.setLimit(3); gr.query();
while (gr.next()) gs.info('sample: source=' + gr.getValue('source') + ' name=' + gr.getValue('name') + ' active=' + gr.getValue('active') + ' version=' + gr.getValue('version'));
