/* Diagnostic: which planned column names are already inherited (read-only). Script scope: GLOBAL.
 * Run before adding columns to a CMDB subclass. */
if (['rhino.global', 'global'].indexOf(String(typeof gs.getCurrentScopeName == 'function' ? gs.getCurrentScopeName() : 'rhino.global')) == -1) throw new Error('Run this diagnostic with the script scope set to global: it is read-only, but in an app scope it adds cross-scope privileges to that app.');
var planned = {
  'cmdb_ci_appl_now_app': ['instance_name','instance_id','instance_url','build_name','build_tag','build_date','war','family','patch','timezone','production_flag','node_count','nodes','last_collected','collection_status','collection_summary','environment','version','fqdn'],
  'cmdb_ci': ['instance','item_category','item_key','item_value','item_version','item_state','value_hash','item_attributes','runtime','source_sys_id','is_secure','secure_value_hash','present','first_seen','last_changed','category','attributes']
};
for (var t in planned) {
  var gr = new GlideRecord(t);
  for (var i = 0; i < planned[t].length; i++) {
    var f = planned[t][i];
    if (!gr.isValidField(f)) continue;
    var d = new GlideRecord('sys_dictionary');
    d.addQuery('element', f);
    d.addQuery('name', 'IN', 'cmdb,cmdb_ci,cmdb_ci_appl,cmdb_ci_appl_now_app');
    d.query();
    var info = d.next() ? (d.getValue('name') + ' / ' + d.getValue('internal_type') + ' / len ' + d.getValue('max_length')) : '?';
    gs.info('INHERITED  ' + t + '.' + f + '  ->  ' + info);
  }
}
gs.info('done');
