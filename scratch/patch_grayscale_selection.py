import sys
sys.stdout.reconfigure(encoding="utf-8")

# 1. Patch Dev/cle_tools/cle_slicer.js
with open("Dev/cle_tools/cle_slicer.js", "r", encoding="utf-8") as f:
    slicer_code = f.read()

# Update getActiveBodyGeometry signature and selSet check
target_slicer_1 = """getActiveBodyGeometry() {
    const app = window.app || window.xe;
    const doc = app?.scene?.doc || app?.doc;
    const bodies = (doc?.bodies || []);
    const views = app?.scene?.views;

    const allTriangles = [];
    const extractedNames = [];

    // 1. Extract from JumpStart scene views with exact matrixWorld transformation
    // If user has specific body selection, prioritize slicing the selected body
    const selSet = (app?.sel && app.sel.length > 0) ? new Set(app.sel) : null;"""

repl_slicer_1 = """getActiveBodyGeometry(targetBodyId = null) {
    const app = window.app || window.xe;
    const doc = app?.scene?.doc || app?.doc;
    const bodies = (doc?.bodies || []);
    const views = app?.scene?.views;

    const allTriangles = [];
    const extractedNames = [];

    // 1. Extract from JumpStart scene views with exact matrixWorld transformation
    // If targetBodyId is specified, slice only that body. Otherwise fall back to user selection
    const selSet = (targetBodyId && targetBodyId !== 'all')
      ? new Set([targetBodyId])
      : ((app?.sel && app.sel.length > 0) ? new Set(app.sel) : null);"""

if target_slicer_1 not in slicer_code:
    print("ERROR: target_slicer_1 not found in cle_slicer.js")
    sys.exit(1)

slicer_code = slicer_code.replace(target_slicer_1, repl_slicer_1, 1)

# Pass targetBodyId into getActiveBodyGeometry inside sliceModel
target_slicer_2 = "const geom = this.getActiveBodyGeometry();"
repl_slicer_2 = "const geom = this.getActiveBodyGeometry(options.targetBodyId);"

slicer_code = slicer_code.replace(target_slicer_2, repl_slicer_2, 1)

with open("Dev/cle_tools/cle_slicer.js", "w", encoding="utf-8") as f:
    f.write(slicer_code)

print("Updated cle_slicer.js successfully!")
