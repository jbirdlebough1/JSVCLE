import sys
sys.stdout.reconfigure(encoding="utf-8")

with open("Dev/cle_tools/cle_boot.js", "r", encoding="utf-8") as f:
    boot_code = f.read()

# 1. Add "Select Object" ribbon button
ribbon_target = '{ id: "cle-r-slicer", label: "Slice & 3D Stack", title: "Slice Model (Top-Down for CNC/Laser, Bottom-Up for 3D) & Display in Visualizer", icon: "printer3d", fn: () => this.openModal("slicer") },'
ribbon_repl = '''{ id: "cle-r-bed-select", label: "Select Object", title: "Select & Move Object on Bed (Photo, 3D Body, or Relief Mesh)", icon: "box", fn: () => this.promptSelectBedObject() },
      { id: "cle-r-slicer", label: "Slice & 3D Stack", title: "Slice Model (Top-Down for CNC/Laser, Bottom-Up for 3D) & Display in Visualizer", icon: "printer3d", fn: () => this.openModal("slicer") },'''

if ribbon_target not in boot_code:
    print("ERROR: ribbon_target not found!")
    sys.exit(1)

boot_code = boot_code.replace(ribbon_target, ribbon_repl, 1)

# 2. Add promptSelectBedObject method to CLEBoot
prompt_target = "  openModal(type) {"
prompt_method = '''  promptSelectBedObject() {
    const objs = this.bed ? this.bed.getBedObjects() : [];
    if (!objs || objs.length === 0) {
      this.notify('No objects found on the bed.', 'info');
      return;
    }
    const curIdx = this.bed.selectedObject ? objs.findIndex(o => o.id === this.bed.selectedObject.id) : -1;
    const nextIdx = (curIdx + 1) % objs.length;
    this.bed.selectBedObject(objs[nextIdx].type, objs[nextIdx].id);
  }

  openModal(type) {'''

boot_code = boot_code.replace(prompt_target, prompt_method, 1)

# 3. Update CAD Slicer panel HTML with Target Object to Slice selector
cad_target = '''          <div class="cle-form-row" style="margin-top:10px;">
            <label>Target Machine & Slicing Order:</label>'''

cad_repl = '''          <div class="cle-form-row" style="margin-top:10px;">
            <label>Target Object to Slice:</label>
            <select class="cle-select" id="slice-target-body">
              <option value="all">🌐 All Bodies on Bed</option>
            </select>
          </div>

          <div class="cle-form-row">
            <label>Target Machine & Slicing Order:</label>'''

boot_code = boot_code.replace(cad_target, cad_repl, 1)

# 4. Update Grayscale HTML with dynamic Source Image dropdown
gray_html_target = '''          <!-- Image Loader Row -->
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            <input type="file" id="cle-gray-file" accept="image/*" style="display:none;">
            <button type="button" class="cle-btn" id="cle-gray-browse-btn" style="padding:6px 14px; background:var(--accent); color:var(--on-accent); font-weight:600;">📁 Load Image File...</button>
            <button type="button" class="cle-btn" id="cle-gray-ws-btn" style="padding:6px 14px; background:rgba(37,99,235,0.12); border:1px solid #2563eb; color:#2563eb; font-weight:600;">🎨 Use Workspace Sketch Image</button>
            <button type="button" class="cle-btn" id="cle-gray-test-pattern-btn" style="padding:6px 12px; background:rgba(16,185,129,0.12); border:1px solid #10b981; color:#10b981; font-weight:600;">✨ Dome Test Pattern</button>
            <span id="cle-gray-status" style="font-size:12px; color:var(--ink-2); margin-left:4px;">No image selected (demo pattern ready)</span>
          </div>'''

gray_html_repl = '''          <!-- Image Loader & Workspace Object Selector -->
          <div style="background:var(--paper); padding:10px 12px; border-radius:6px; border:1px solid var(--line); margin-bottom:12px;">
            <div class="cle-form-row" style="margin-bottom:8px;">
              <label style="font-weight:700;">Select Image Source to Slice:</label>
              <select class="cle-select" id="cle-gray-source-select" style="font-weight:600;">
                <option value="loading">Searching workspace...</option>
              </select>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <input type="file" id="cle-gray-file" accept="image/*" style="display:none;">
              <button type="button" class="cle-btn" id="cle-gray-browse-btn" style="padding:5px 12px; background:var(--accent); color:var(--on-accent); font-weight:600; font-size:11px;">📁 Browse File...</button>
              <button type="button" class="cle-btn" id="cle-gray-ws-btn" style="padding:5px 12px; background:rgba(37,99,235,0.12); border:1px solid #2563eb; color:#2563eb; font-weight:600; font-size:11px;">🔄 Refresh Workspace Photos</button>
              <span id="cle-gray-status" style="font-size:11px; color:var(--ink-2); margin-left:4px;">Ready</span>
            </div>
          </div>'''

boot_code = boot_code.replace(gray_html_target, gray_html_repl, 1)

# 5. Update CAD Slicer event listener to populate bodies dropdown and pass targetBodyId
cad_listen_target = '''      const sliceRunBtn = document.getElementById('slice-run-btn');
      if (sliceRunBtn) {
        sliceRunBtn.onclick = async () => {'''

cad_listen_repl = '''      // Populate target bodies dropdown
      const targetBodySelect = document.getElementById('slice-target-body');
      if (targetBodySelect) {
        const bodies = (window.Se?.doc?.bodies || window.app?.doc?.bodies || []).filter(b => !b.hidden && !b.hole);
        const selObjId = this.bed?.selectedObject?.id;
        let opts = `<option value="all">🌐 All Bodies on Bed (${bodies.length})</option>`;
        bodies.forEach(b => {
          const isSelected = selObjId === b.id;
          opts += `<option value="${b.id}" ${isSelected ? 'selected' : ''}>📦 ${b.name || 'Body'}</option>`;
        });
        targetBodySelect.innerHTML = opts;
      }

      const sliceRunBtn = document.getElementById('slice-run-btn');
      if (sliceRunBtn) {
        sliceRunBtn.onclick = async () => {
          const targetBodyId = document.getElementById('slice-target-body')?.value || 'all';'''

boot_code = boot_code.replace(cad_listen_target, cad_listen_repl, 1)

# Pass targetBodyId into this.slicer.sliceModel
slice_model_target = "this.slicer.feedRate = parseFloat(feed) || 1500;\n          await this.slicer.sliceModel({"
slice_model_repl = "this.slicer.feedRate = parseFloat(feed) || 1500;\n          await this.slicer.sliceModel({\n            targetBodyId,"
boot_code = boot_code.replace(slice_model_target, slice_model_repl, 1)

# 6. Update Grayscale modal listeners with workspace photo detection & dropdown
gray_listen_target = '''      // Initial preview render
      redrawPreview();

      // Browse file input'''

gray_listen_repl = '''      // Populate Workspace Photo Dropdown
      const sourceSelect = document.getElementById('cle-gray-source-select');
      const wInp = document.getElementById('cle-gray-w');
      const hInp = document.getElementById('cle-gray-h');

      const populateSources = () => {
        if (!sourceSelect) return;
        const objs = this.bed ? this.bed.getBedObjects() : [];
        const photos = objs.filter(o => o.isImage);
        let html = '';

        photos.forEach((p, idx) => {
          html += `<option value="${p.id}">🖼️ Workspace Photo: ${p.name} (${p.w.toFixed(1)}x${p.h.toFixed(1)}mm)</option>`;
        });
        html += `<option value="file">📁 Upload New Image File from Disk...</option>`;
        html += `<option value="demo">✨ Procedural Dome Test Pattern</option>`;
        sourceSelect.innerHTML = html;

        // Auto-select active photo or first workspace photo
        const selectedId = this.bed?.selectedObject?.isImage ? this.bed.selectedObject.id : (photos.length > 0 ? photos[0].id : null);
        if (selectedId) {
          sourceSelect.value = selectedId;
          loadSelectedSource();
        } else {
          sourceSelect.value = 'demo';
          redrawPreview();
        }
      };

      const loadSelectedSource = () => {
        const val = sourceSelect ? sourceSelect.value : 'demo';
        if (val === 'file') {
          if (fileInput) fileInput.click();
          return;
        }
        if (val === 'demo') {
          loadedImg = null;
          if (statusLbl) statusLbl.textContent = 'Dome relief test pattern active';
          if (dimLbl) dimLbl.textContent = 'Size: 160x160 px (procedural)';
          redrawPreview();
          return;
        }

        // Workspace photo ID
        const objs = this.bed ? this.bed.getBedObjects() : [];
        const photo = objs.find(o => o.id === val);
        if (photo && photo.imageSrc) {
          const img = new Image();
          img.onload = () => {
            loadedImg = img;
            if (wInp) wInp.value = photo.w.toFixed(1);
            if (hInp) hInp.value = photo.h.toFixed(1);
            if (statusLbl) statusLbl.textContent = `Workspace Photo: ${photo.name} (${img.width}x${img.height} px)`;
            if (dimLbl) dimLbl.textContent = `Size: ${img.width}x${img.height} px`;
            redrawPreview();
            this.notify(`Selected workspace photo: ${photo.name}`, 'ok');
          };
          img.src = photo.imageSrc;
        }
      };

      if (sourceSelect) {
        sourceSelect.onchange = loadSelectedSource;
      }

      populateSources();

      // Initial preview render
      redrawPreview();

      // Browse file input'''

boot_code = boot_code.replace(gray_listen_target, gray_listen_repl, 1)

# Update wsImgBtn to re-run populateSources
ws_btn_target = '''      // Use Workspace Sketch Image Button
      const wsImgBtn = document.getElementById('cle-gray-ws-btn');
      if (wsImgBtn) {
        wsImgBtn.onclick = () => {'''

ws_btn_repl = '''      // Use Workspace Sketch Image Button
      const wsImgBtn = document.getElementById('cle-gray-ws-btn');
      if (wsImgBtn) {
        wsImgBtn.onclick = () => {
          populateSources();
          loadSelectedSource();
          this.notify('Refreshed photos from active workspace!', 'ok');
          return;'''

boot_code = boot_code.replace(ws_btn_target, ws_btn_repl, 1)

with open("Dev/cle_tools/cle_boot.js", "w", encoding="utf-8") as f:
    f.write(boot_code)

print("Updated Dev/cle_tools/cle_boot.js successfully!")

