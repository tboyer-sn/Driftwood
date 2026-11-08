#!/usr/bin/env python3
"""Retarget the whole Driftwood project to a different application scope.

Usage:  python3 tools_build_for_scope.py x_<companycode>_<suffix>  [--out build]

Copies the project to <out>/<scope>/, replaces the source scope token in every
text file and file name, regenerates the installers, and writes the paste-ready
scripts to <out>/<scope>/run-ready/. Then run the tests inside that copy.
"""
import os, re, shutil, subprocess, sys

SOURCE_SCOPE = "x_2160899_driftw_0"
TEXT_EXT = {".js", ".py", ".md", ".xml", ".txt", ".json", ".sh"}
SKIP_DIRS = {"build", "node_modules", ".git"}

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out = "build"
    if "--out" in sys.argv: out = sys.argv[sys.argv.index("--out") + 1]
    if not args: sys.exit(__doc__)
    scope = args[0]
    if not re.fullmatch(r"x_[a-z0-9]+_[a-z0-9_]+", scope) or len(scope) > 18:
        sys.exit(f"'{scope}' doesn't look like a scoped-app namespace (x_<code>_<suffix>, max 18 chars)")
    longest = scope + "_cmdb_ci_sn_tracked_application"
    if len(longest) > 80: sys.exit(f"table name too long ({len(longest)} > 80): {longest}")

    root = os.path.dirname(os.path.abspath(__file__))
    dest = os.path.join(root, out, scope)
    if os.path.exists(dest): shutil.rmtree(dest)
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and os.path.join(d, x) != os.path.join(root, out)]
        rel = os.path.relpath(d, root)
        tgt_dir = os.path.join(dest, rel.replace(SOURCE_SCOPE, scope))
        os.makedirs(tgt_dir, exist_ok=True)
        for f in files:
            src = os.path.join(d, f)
            tgt = os.path.join(tgt_dir, f.replace(SOURCE_SCOPE, scope))
            if os.path.splitext(f)[1] in TEXT_EXT:
                with open(src, encoding="utf-8") as fh: txt = fh.read()
                with open(tgt, "w", encoding="utf-8") as fh: fh.write(txt.replace(SOURCE_SCOPE, scope))
            else:
                shutil.copy2(src, tgt)
    # The copy must now treat the new scope as its own source token
    tool = os.path.join(dest, "tools_build_for_scope.py")
    with open(tool, encoding="utf-8") as fh: t = fh.read()
    with open(tool, "w", encoding="utf-8") as fh: fh.write(re.sub(r'SOURCE_SCOPE = "x_2160899_driftw_0"]+"', f'SOURCE_SCOPE = "x_2160899_driftw_0"', t))

    subprocess.run([sys.executable, "tools_gen_install.py"], cwd=dest, check=True)
    subprocess.run(["sh", "build.sh"], cwd=dest, check=True)
    rr = os.path.join(dest, "run-ready"); os.makedirs(os.path.join(rr, "diagnostics"), exist_ok=True)
    for f in ["dist/background_dry_run.js", "dist/export_snapshot.js", "src/background/build_schema.js", "dist/install_code.js",
              "dist/install_ui.js", "src/background/verify_collect.js"]:
        shutil.copy2(os.path.join(dest, f), rr)
    for f in os.listdir(os.path.join(dest, "src", "diagnostics")):
        shutil.copy2(os.path.join(dest, "src", "diagnostics", f), os.path.join(rr, "diagnostics"))
    left = subprocess.run(["grep", "-rl", SOURCE_SCOPE, dest], capture_output=True, text=True).stdout.strip()
    if left: sys.exit("source scope still present in:\n" + left)
    print(f"Built {dest}\n  run-ready scripts: {rr}")

if __name__ == "__main__":
    main()
