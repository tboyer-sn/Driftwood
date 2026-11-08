/* Diagnostic: CMDB class info (read-only). Script scope: GLOBAL.
 * Prints hierarchy, extensibility, package, row count and identification rules. */
if (['rhino.global', 'global'].indexOf(String(typeof gs.getCurrentScopeName == 'function' ? gs.getCurrentScopeName() : 'rhino.global')) == -1) throw new Error('Run this diagnostic with the script scope set to global: it is read-only, but in an app scope it adds cross-scope privileges to that app.');
function info(t) {
  var o = new GlideRecord('sys_db_object');
  if (!o.get('name', t)) { gs.info(t + ': NOT FOUND'); return; }
  var chain = [], c = o, guard = 0;
  while (c && c.super_class && !c.super_class.nil() && guard++ < 15) { c = c.super_class.getRefRecord(); chain.push(c.getValue('name')); }
  var cnt = new GlideAggregate(t); cnt.addAggregate('COUNT'); cnt.query();
  var n = cnt.next() ? cnt.getAggregate('COUNT') : '?';
  var ids = new GlideRecord('cmdb_identifier'); var idn = 0;
  if (ids.isValid()) { ids.addQuery('applies_to', t); ids.query(); while (ids.next()) idn++; }
  gs.info(t + ' | label=' + o.getValue('label') + ' | extends=' + chain.join(' > ') +
    ' | extensible=' + o.getValue('is_extendable') + ' | package=' + o.getDisplayValue('sys_package') +
    ' | rows=' + n + ' | ident rules=' + idn);
}
var tables = ['cmdb_ci_appl_now_app', 'cmdb_ci_appl_now_app_comp', 'cmdb_ci_appl_now_mid',
              'cmdb_ci_appl_now_connector', 'instance', 'cmdb_ci_appl'];
for (var i = 0; i < tables.length; i++) info(tables[i]);
