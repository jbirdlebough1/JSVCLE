with open('Vellum/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()

# Replace the modal and script in Vellum/index.htm with enhanced version
old_modal_start = '<!-- JumpStart 3D Bridge Export Modal -->'
old_modal_end = '</script>\n\n</body>'

idx1 = content.find(old_modal_start)
idx2 = content.find(old_modal_end)

if idx1 != -1 and idx2 != -1:
    before = content[:idx1]
    after = content[idx2 + len(old_modal_end) - 7:] # keep </body>
    
    new_modal_and_script = '''<!-- JumpStart 3D Bridge Export Modal -->
<div id="jsExportModal" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.65); z-index:999999; align-items:center; justify-content:center; font-family:system-ui,-apple-system,sans-serif;">
  <div style="background:#ffffff; border-radius:12px; box-shadow:0 20px 40px rgba(0,0,0,0.3); width:480px; max-width:92vw; padding:24px; color:#1e293b; border:1px solid #cbd5e1;">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
      <h3 style="margin:0; font-size:17px; font-weight:800; display:flex; align-items:center; gap:8px; color:#0284c7;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Save to JumpStart 3D Workspace
      </h3>
      <button id="closeJsModalBtn" style="border:none; background:none; font-size:24px; line-height:1; cursor:pointer; color:#64748b;" title="Close">&times;</button>
    </div>
    
    <p style="margin:0 0 12px 0; font-size:13px; color:#64748b; line-height:1.4;">
      Transfer vector outlines or reference pictures from Vellum directly into your active JumpStart 3D design.
    </p>

    <!-- Raster image notice banner -->
    <div id="jsRasterTipBanner" style="display:none; margin-bottom:14px; background:#f0f9ff; border:1px solid #7dd3fc; padding:10px 12px; border-radius:8px; font-size:12px; color:#0369a1; line-height:1.4;">
      <strong style="display:block; margin-bottom:2px;">Bitmap / Picture Detected (PNG/JPG)</strong>
      To turn this image into a <strong>3D cut/extrusion</strong>, select it and click <strong>Trace</strong> in Vellum's toolbar to generate vector curves! You can also place it as a <strong>3D Workplane Picture</strong> below to model over it.
    </div>

    <div style="margin-bottom:14px;">
      <label style="font-weight:700; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; color:#475569; display:block; margin-bottom:8px;">Transfer Mode</label>
      
      <div style="display:flex; flex-direction:column; gap:8px;">
        <label id="lblModeSketch" style="display:flex; align-items:flex-start; gap:10px; padding:10px; border:2px solid #0284c7; background:#f0f9ff; border-radius:8px; cursor:pointer;">
          <input type="radio" name="jsExportMode" id="optModeSketch" value="sketch" checked style="margin-top:3px;">
          <div>
            <div style="font-weight:700; font-size:13px; color:#0369a1;">Option A: 2D Editable Sketch</div>
            <div style="font-size:12px; color:#475569; margin-top:2px;">Imports curves onto the selected workplane. Profiles shade blue, ready for editing, dimensioning, or manual extruding.</div>
          </div>
        </label>

        <label id="lblModeExtrude" style="display:flex; align-items:flex-start; gap:10px; padding:10px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; cursor:pointer;">
          <input type="radio" name="jsExportMode" id="optModeExtrude" value="extrude" style="margin-top:3px;">
          <div>
            <div style="font-weight:700; font-size:13px; color:#0f172a;">Option B: Direct 3D Extruded Body</div>
            <div style="font-size:12px; color:#475569; margin-top:2px;">Creates a solid 3D CAD body directly from closed vector outlines with specified extrusion height.</div>
          </div>
        </label>

        <label id="lblModeImage" style="display:flex; align-items:flex-start; gap:10px; padding:10px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:8px; cursor:pointer;">
          <input type="radio" name="jsExportMode" id="optModeImage" value="image" style="margin-top:3px;">
          <div>
            <div style="font-weight:700; font-size:13px; color:#0f172a;">Workplane Reference Picture (3D Canvas)</div>
            <div style="font-size:12px; color:#475569; margin-top:2px;">Places the bitmap picture (PNG/JPG) onto the 3D workplane with transparency so you can view, scale, or model over it.</div>
          </div>
        </label>
      </div>
    </div>

    <!-- Extrude Thickness Options (visible when extrude mode is selected) -->
    <div id="extrudeOptionsPanel" style="display:none; margin-bottom:14px; background:#f1f5f9; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
      <label style="font-size:13px; font-weight:700; color:#1e293b; display:flex; justify-content:space-between; align-items:center;">
        <span>Extrusion Thickness (Z Height):</span>
        <div style="display:inline-flex; align-items:center; gap:4px;">
          <input type="number" id="jsExtrudeThickness" value="5.0" step="0.5" min="0.1" max="500" style="width:75px; padding:5px 8px; font-weight:700; border:1px solid #94a3b8; border-radius:4px; text-align:right;">
          <span style="font-size:12px; color:#64748b; font-weight:700;">mm</span>
        </div>
      </label>
    </div>

    <!-- Target Workplane -->
    <div style="margin-bottom:14px;">
      <label style="font-size:12px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Target Workplane</label>
      <select id="jsTargetPlane" style="width:100%; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; font-weight:600; background:#fff;">
        <option value="XY" selected>Top Plane (XY &middot; Standard CNC / Laser Machine Bed)</option>
        <option value="XZ">Front Plane (XZ &middot; Vertical Upright)</option>
        <option value="YZ">Right Side Plane (YZ)</option>
      </select>
    </div>

    <!-- Part Name -->
    <div style="margin-bottom:18px;">
      <label style="font-size:12px; font-weight:700; color:#475569; display:block; margin-bottom:4px;">Part / Sketch Name</label>
      <input type="text" id="jsPartName" value="Vellum Design" style="width:100%; box-sizing:border-box; padding:6px 8px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px;">
    </div>

    <div style="display:flex; justify-content:flex-end; gap:8px;">
      <button id="cancelJsModalBtn" style="padding:8px 14px; border:1px solid #cbd5e1; background:#f8fafc; color:#334155; font-weight:600; border-radius:6px; cursor:pointer;">Cancel</button>
      <button id="confirmJsModalBtn" style="padding:8px 18px; border:none; background:#0284c7; color:#fff; font-weight:700; border-radius:6px; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        Send to JumpStart 3D
      </button>
    </div>
  </div>
</div>

<script>
// Vellum to JumpStart 3D Bridge Script
(function(){
  function initJSBridge() {
    const btnSave = document.getElementById('btnSaveToJS');
    const optSave = document.getElementById('exportOptJS');
    const modal = document.getElementById('jsExportModal');
    const closeBtn = document.getElementById('closeJsModalBtn');
    const cancelBtn = document.getElementById('cancelJsModalBtn');
    const confirmBtn = document.getElementById('confirmJsModalBtn');
    const radSketch = document.getElementById('optModeSketch');
    const radExtrude = document.getElementById('optModeExtrude');
    const radImage = document.getElementById('optModeImage');
    const extrudePanel = document.getElementById('extrudeOptionsPanel');
    const lblSketch = document.getElementById('lblModeSketch');
    const lblExtrude = document.getElementById('lblModeExtrude');
    const lblImage = document.getElementById('lblModeImage');
    const tipBanner = document.getElementById('jsRasterTipBanner');

    function openModal() {
      if (!modal) return;
      const objs = (typeof state !== 'undefined' && state.objects) ? state.objects : [];
      const hasVectors = objs.some(o => o.visible !== false && o.type !== 'image' && o.segments && o.segments.length > 0);
      const hasImages = objs.some(o => o.visible !== false && o.type === 'image');

      if (tipBanner) tipBanner.style.display = hasImages ? 'block' : 'none';

      if (hasImages && !hasVectors) {
        // Only images present: default to image mode
        if (radImage) radImage.checked = true;
      } else {
        if (radSketch && !radExtrude.checked) radSketch.checked = true;
      }
      updateModeUI();
      modal.style.display = 'flex';
    }

    function closeModal() {
      if (modal) modal.style.display = 'none';
    }

    if (btnSave) btnSave.addEventListener('click', openModal);
    if (optSave) optSave.addEventListener('click', () => {
      if (typeof closeAllMenus === 'function') closeAllMenus();
      openModal();
    });
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    function updateModeUI() {
      const mode = radExtrude && radExtrude.checked ? 'extrude' : radImage && radImage.checked ? 'image' : 'sketch';
      if (extrudePanel) extrudePanel.style.display = (mode === 'extrude') ? 'block' : 'none';

      [lblSketch, lblExtrude, lblImage].forEach(lbl => {
        if (!lbl) return;
        lbl.style.border = '1px solid #cbd5e1';
        lbl.style.background = '#f8fafc';
      });

      const activeLbl = mode === 'extrude' ? lblExtrude : mode === 'image' ? lblImage : lblSketch;
      if (activeLbl) {
        activeLbl.style.border = '2px solid #0284c7';
        activeLbl.style.background = '#f0f9ff';
      }
    }

    if (radSketch) radSketch.addEventListener('change', updateModeUI);
    if (radExtrude) radExtrude.addEventListener('change', updateModeUI);
    if (radImage) radImage.addEventListener('change', updateModeUI);

    async function buildSvgData() {
      try {
        if (typeof ensureTextFontsLoaded === 'function') await ensureTextFontsLoaded();
        const bboxes = (typeof state !== 'undefined' && state.objects) ? state.objects.map(objBBox) : [];
        const bb = bboxes.length ? unionBBox(bboxes) : { x: (typeof PAGE !== 'undefined' ? PAGE.x : 0), y: (typeof PAGE !== 'undefined' ? PAGE.y : 0), w: 300, h: 200 };
        const pad = 0;
        const vb = `${bb.x} ${bb.y} ${bb.w} ${bb.h}`;
        let body = '';
        const defs = []; const idCounter = { n: 1 };
        if (typeof state !== 'undefined' && state.objects) {
          for (const o of state.objects) {
            if (o.visible === false) continue;
            if (o.type === 'image') {
              const rot = o.angle ? ` transform="rotate(${o.angle} ${o.x + o.w / 2} ${o.y + o.h / 2})"` : '';
              body += `<image x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" opacity="${o.opacity === undefined ? 1 : o.opacity}" href="${o.src}"${rot}/>\\n`;
            } else if (o.type === 'text') {
              const fillAttr = o.fill && o.fill !== 'none' ? svgFillAttr(o.fill, defs, idCounter) : 'none';
              const hasStroke = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0;
              const strokeAttrs = hasStroke ? ` stroke="${o.stroke}" stroke-width="${svgStrokeW(o)}"` : '';
              body += svgPlainTextBlock(o, fillAttr, strokeAttrs);
            } else {
              const d = segmentsToPathD(o.segments);
              const fillAttr = svgFillAttr(o.fill, defs, idCounter, o);
              body += `<path d="${d}" fill="${fillAttr}" stroke="${o.stroke === 'none' ? 'none' : o.stroke}" stroke-width="${svgStrokeW(o)}"/>\\n`;
            }
          }
        }
        return `<?xml version="1.0" encoding="UTF-8"?>\\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${bb.w}" height="${bb.h}">\\n${defs.length ? '<defs>' + defs.join('\\n') + '</defs>\\n' : ''}${body}</svg>`;
      } catch (err) {
        console.warn('Error building SVG:', err);
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"></svg>';
      }
    }

    if (confirmBtn) {
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Transferring...';
        try {
          const svgData = await buildSvgData();
          const mode = radExtrude && radExtrude.checked ? 'extrude' : radImage && radImage.checked ? 'image' : 'sketch';
          const thickness = parseFloat(document.getElementById('jsExtrudeThickness')?.value) || 5.0;
          const plane = document.getElementById('jsTargetPlane')?.value || 'XY';
          const name = document.getElementById('jsPartName')?.value.trim() || 'Vellum Design';
          const objectsList = (typeof state !== 'undefined' && state.objects) ? state.objects : [];

          // Collect images if any
          const imagesList = [];
          for (const o of objectsList) {
            if (o.visible !== false && o.type === 'image' && o.src) {
              imagesList.push({
                src: o.src,
                x: o.x,
                y: o.y,
                w: o.w,
                h: o.h,
                angle: o.angle || 0,
                opacity: o.opacity !== undefined ? o.opacity : 0.75
              });
            }
          }

          const payload = {
            type: 'CLE_VELLUM_EXPORT',
            format: 'svg',
            svg: svgData,
            objects: objectsList,
            images: imagesList,
            mode: mode,
            thickness: thickness,
            plane: plane,
            name: name
          };

          if (window.parent && window.parent !== window) {
            window.parent.postMessage(payload, '*');
          } else {
            // Standalone fallback: download SVG file
            const blob = new Blob([svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name.replace(/[\\\\/:*?"<>|]+/g, '_')}.svg`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            alert(`Vector saved as ${a.download}.`);
          }
          closeModal();
        } catch (e) {
          alert('Export error: ' + e.message);
        } finally {
          confirmBtn.disabled = false;
          confirmBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Send to JumpStart 3D';
        }
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initJSBridge);
  } else {
    initJSBridge();
  }
})();
</script>
'''
    new_content = before + new_modal_and_script + '\n</body></html>'
    with open('Vellum/index.htm', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Vellum/index.htm successfully updated with Image Support!")
else:
    print(f"Indices not found: idx1={idx1}, idx2={idx2}")
