import json, re
def src(p): return open(p, encoding='utf-8').read()
SI = [
 ("ConfigNowConfig", "Configuration defaults and property overrides for the Driftwood collector.", src("src/script_includes/ConfigNowConfig.js")),
 ("ConfigNowCollector", "Reads the current instance's configuration into a JSON snapshot (read-only).", src("src/script_includes/ConfigNowCollector.js")),
 ("ConfigNowWriter", "Persists a ConfigNowCollector snapshot into the CI / plain tracking tables (change-only).", src("src/script_includes/ConfigNowWriter.js")),
 ("ConfigNowCompare", "Cross-instance drift: compares two instance CIs' tracked items (read-only).", src("src/script_includes/ConfigNowCompare.js")),
 ("ConfigNowImporter", "Imports a snapshot JSON from another instance as its own instance CI.", src("src/script_includes/ConfigNowImporter.js")),
 ("ConfigNowRetention", "Purges collection history (runs, item changes, snapshots) past the retention period.", src("src/script_includes/ConfigNowRetention.js")),
 ("ConfigNowObjects", "Tracked objects (v0.6): one object per category + key across instances; links observations, backfill.", src("src/script_includes/ConfigNowObjects.js")),
 ("ConfigNowDrift", "Stored drift (v0.6): writes each tracked object's drift status, kinds and instance lists (matrix rules, change-only).", src("src/script_includes/ConfigNowDrift.js")),
 ("ConfigNowHealth", "Driftwood self-check (v0.6): schema, roles, ACLs, jobs, REST, privileges, data freshness, objects and drift (read-only).", src("src/script_includes/ConfigNowHealth.js")),
 ("ConfigNowMigration", "v0.6 migrations: moves per-instance plugin records from the CMDB to plain tracked items (copy + verify, never deletes).", src("src/script_includes/ConfigNowMigration.js")),
]
FIX = [
 ("Driftwood - Backfill tracked objects", "v0.6 (O02): links every observation to its tracked object, creating missing objects. Idempotent; runs on install/upgrade.", src("src/fix_scripts/Driftwood_Backfill_tracked_objects.js")),
 ("Driftwood - Move plugins off the CMDB", "v0.6 (O05): copies per-instance plugin CIs to plain tracked items and verifies; never deletes. Idempotent.", src("src/fix_scripts/Driftwood_Move_plugins_off_the_CMDB.js")),
 ("Driftwood - Recompute all drift", "v0.6 (O03): fills every tracked object's drift fields from the stored observations. Change-only; runs on install/upgrade.", src("src/fix_scripts/Driftwood_Recompute_all_drift.js")),
]
PROPS = [(f"x_2160899_driftw_0.table.{c}", "x_2160899_driftw_0_tracked_item", f"Storage routing for category '{c}': target table (CI subclass or plain tracked_item).")
         for c in ["applications","mid_servers","system_properties","clone_preservers","clone_exclusions","plugins"]]
si_js = ",\n".join("        { name: %s, description: %s, script: %s }" % (json.dumps(n), json.dumps(d), json.dumps(s)) for n,d,s in SI)
pr_js = ",\n".join("        { name: %s, value: %s, description: %s }" % (json.dumps(n), json.dumps(v), json.dumps(d)) for n,v,d in PROPS)
for n,d,_ in FIX:
    assert len(n) <= 40, "fix script name longer than sys_script_fix.name (40): " + n
fx_js = ",\n".join("        { name: %s, description: %s, script: %s }" % (json.dumps(n), json.dumps(d), json.dumps(s)) for n,d,s in FIX)
tpl = src("src/background/install_code.template.js")
out = tpl.replace("/*@@SCRIPT_INCLUDES@@*/", si_js).replace("/*@@PROPERTIES@@*/", pr_js).replace("/*@@FIX_SCRIPTS@@*/", fx_js)
open("dist/install_code.js","w",encoding='utf-8').write(out)
print("dist/install_code.js", len(out), "bytes")

UI = [("ui_action","src/ui_actions/Collect_Now.js"),("ui_action_compare","src/ui_actions/Compare_Across_Instances.js"),("job","src/scheduled_jobs/Driftwood_Collect_Current_Instance.js"),("job_purge","src/scheduled_jobs/Driftwood_Purge_History.js"),("job_drift","src/scheduled_jobs/Driftwood_Recompute_Drift.js"),("job_health","src/scheduled_jobs/Driftwood_Health_Check.js"),("rest_health","src/scripted_rest/health_GET.js"),
      ("health_html","src/ui_pages/x_2160899_driftw_0_health.html.xml"),("health_client","src/ui_pages/x_2160899_driftw_0_health.client.js"),
      ("rest_current","src/scripted_rest/current_GET.js"),("rest_instances","src/scripted_rest/instances_GET.js"),
      ("rest_compare","src/scripted_rest/compare_GET.js"),("rest_matrix","src/scripted_rest/matrix_GET.js"),("rest_snapshot","src/scripted_rest/snapshot_POST.js"),("rest_collect","src/scripted_rest/collect_POST.js"),
      ("drift_html","src/ui_pages/x_2160899_driftw_0_drift_report.html.xml"),("drift_client","src/ui_pages/x_2160899_driftw_0_drift_report.client.js"),("page_html","src/ui_pages/x_2160899_driftw_0_current_settings.html.xml"),
      ("page_client","src/ui_pages/x_2160899_driftw_0_current_settings.client.js")]
src_js = ",\n".join("        %s: %s" % (k, json.dumps(src(f))) for k,f in UI)
out2 = src("src/background/install_ui.template.js").replace("/*@@SOURCES@@*/", src_js)
open("dist/install_ui.js","w",encoding="utf-8").write(out2)
print("dist/install_ui.js", len(out2), "bytes")
