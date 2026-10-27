import sys
sys.stdout.reconfigure(encoding="utf-8")

with open("Dev/cle_tools/cle_boot.js", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update Ribbon
ribbon_target = '''      { id: "cle-r-index", label: "Index Next", title: "Index A-Axis to Next Facet (Top-Down Milling)", icon: "revolve", fn: () => this.rotary.nextIndex() },
      { id: "cle-r-slicer", label: "Slice & 3D Stack", title: "Slice Model (Top-Down for CNC/Laser, Bottom-Up for 3D) & Display in Visualizer", icon: "printer3d", fn: () => this.openModal("slicer") }'''

ribbon_replacement = '''      { id: "cle-r-index", label: "Index Next", title: "Index A-Axis to Next Facet (Top-Down Milling)", icon: "revolve", fn: () => this.rotary.nextIndex() },
      { id: "cle-r-slicer", label: "Slice & 3D Stack", title: "Slice Model (Top-Down for CNC/Laser, Bottom-Up for 3D) & Display in Visualizer", icon: "printer3d", fn: () => this.openModal("slicer") },
      { id: "cle-r-grayscale", label: "Grayscale 3D", title: "Grayscale Image to Continuous 3D Depth / Relief & Slice (Z)", icon: "dim", fn: () => this.openModal("grayscale") }'''

if ribbon_target not in content:
    print("ERROR: ribbon_target not found!")
    sys.exit(1)

content = content.replace(ribbon_target, ribbon_replacement, 1)

# 2. Update Modal HTML section
# Find from `} else if (type === 'slicer') {` up to `} else if (type === 'rotary') {`
start_tag = "} else if (type === 'slicer') {"
end_tag = "} else if (type === 'rotary') {"

idx_html_start = content.find(start_tag)
idx_html_end = content.find(end_tag, idx_html_start)

if idx_html_start == -1 or idx_html_end == -1:
    print("ERROR: HTML section bounds not found!")
    sys.exit(1)

original_html_block = content[idx_html_start:idx_html_end]

# Extract CAD inner body from original_html_block:
# original starts with:
# } else if (type === 'slicer') {
#   title = 'Continuous Slicing & 3D Toolpath Stack';
#   ...
#   bodyHtml = `
#     ...
#   `;
# We will wrap bodyHtml with tabs and both panels.

new_html_block = '''} else if (type === 'slicer' || type === 'grayscale') {
      const isGrayscale = (type === 'grayscale');
      title = isGrayscale ? 'Grayscale Image to 3D Depth Relief & Continuous Slices' : 'Continuous Slicing & 3D Toolpath Stack';

      const toolsList = (this.toolLibrary && this.toolLibrary.tools && this.toolLibrary.tools.length > 0)
        ? this.toolLibrary.tools
        : [
            { number: 1, name: '1/4" Flat Endmill', type: 'flat', diameter: 6.35 },
            { number: 2, name: '1/8" Flat Endmill / Drill', type: 'flat', diameter: 3.175 },
            { number: 3, name: '1/8" Ball Nose Carver', type: 'ball', diameter: 3.175 }
          ];

      const renderToolOpts = (defaultNum) => toolsList.map(t =>
        `<option value="${t.number}" ${t.number === defaultNum ? 'selected' : ''}>T${t.number}: ${t.name} (${t.diameter}mm)</option>`
      ).join('');

      const toolOptionsDrill = renderToolOpts(this.slicer.laminationConfig.toolMapping?.drillingToolNumber || 2);
      const toolOptionsRough = renderToolOpts(this.slicer.laminationConfig.toolMapping?.roughingToolNumber || 1);
      const toolOptionsFinish = renderToolOpts(this.slicer.laminationConfig.toolMapping?.finishingToolNumber || 3);
      const toolOptionsCutout = renderToolOpts(this.slicer.laminationConfig.toolMapping?.cutoutToolNumber || 1);

      bodyHtml = `
        <div style="display:flex; border-bottom:2px solid var(--line); margin-bottom:14px; gap:8px;">
          <button type="button" id="cle-slicer-tab-cad" class="cle-btn" style="border:none; border-bottom:3px solid ${isGrayscale ? 'transparent' : '#2563eb'}; background:none; padding:8px 14px; font-weight:700; color:${isGrayscale ? 'var(--ink-2)' : '#2563eb'}; cursor:pointer; font-size:13px;">📦 3D Solid Model Slicer</button>
          <button type="button" id="cle-slicer-tab-gray" class="cle-btn" style="border:none; border-bottom:3px solid ${isGrayscale ? '#2563eb' : 'transparent'}; background:none; padding:8px 14px; font-weight:700; color:${isGrayscale ? '#2563eb' : 'var(--ink-2)'}; cursor:pointer; font-size:13px;">🖼️ Grayscale to 3D Relief & Slices</button>
        </div>

        <div id="cle-slicer-panel-cad" style="display:${isGrayscale ? 'none' : 'block'};">
          <p>Slice JumpStart 3D models with strict device-type awareness. View the continuous layer stack in Three.js and transfer to FluidNC SD Card.</p>
          
          <div class="cle-form-row" style="margin-top:10px;">
            <label>Target Machine & Slicing Order:</label>
            <select class="cle-select" id="slice-mode">
              <option value="cnc" ${this.slicer.mode==='cnc'?'selected':''}>CNC Milling / Carving (${this.machineName}) &mdash; TOP-DOWN passes</option>
              <option value="rotary" ${this.slicer.mode==='rotary'?'selected':''}>TwoTrees 4th Axis Rotary (A) & Turning &mdash; TOP-DOWN Multi-Sided Index / Lathe</option>
              <option value="laser" ${this.slicer.mode==='laser'?'selected':''}>Diode Laser Vector & Engraving &mdash; TOP-DOWN passes</option>
              <option value="3d" ${this.slicer.mode==='3d'?'selected':''}>3D Additive Print Sim &mdash; BOTTOM-UP layers</option>
            </select>
          </div>

          <div class="cle-form-row">
            <label>Layer Height (mm):</label>
            <input class="cle-input" id="slice-layer-h" type="number" value="${this.slicer.layerHeight}" step="0.05">
          </div>
          <div class="cle-form-row">
            <label>Infill Density (%):</label>
            <input class="cle-input" id="slice-infill" type="number" value="${this.slicer.infillPercent}" step="5">
          </div>
          <div class="cle-form-row">
            <label>Feed Rate (mm/min):</label>
            <input class="cle-input" id="slice-feed" type="number" value="${this.slicer.feedRate}">
          </div>

          <!-- Spoilboard Clean Cutout Breakthrough Option -->
          <div class="cle-form-row" style="margin-top:12px; background:rgba(37,99,235,0.08); padding:10px 12px; border-radius:6px; border:1px solid rgba(37,99,235,0.25);">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="slice-enable-cutout" checked style="width:16px; height:16px;">
              <span style="font-weight:700;">Spoilboard Clean Cutout (Breakthrough Pass)</span>
            </label>
            <div style="font-size:11px; color:var(--ink-2); margin-top:4px;">
              Mills 0.20mm into the spoilboard for a clean cutout without tabs. Zero risk of touching aluminum bed table (>19mm safe MDF buffer).
            </div>
            <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
              <label style="font-size:12px;">Cutout Depth into Spoilboard (mm):</label>
              <input class="cle-input" id="slice-cutout-depth" type="number" step="0.05" value="${this.bed ? (this.bed.config.cutoutOvercut || 0.20) : 0.20}" style="width:90px;">
            </div>
          </div>

          <!-- Laminated Multi-Part Slicing (Biradial Horns & Stacks) -->
          <div class="cle-form-row" style="margin-top:12px; background:rgba(250,204,21,0.08); padding:10px 12px; border-radius:6px; border:1px solid rgba(250,204,21,0.35);">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="slice-enable-lamination" ${this.slicer.laminationConfig.enabled ? 'checked' : ''} style="width:16px; height:16px;">
              <span style="font-weight:700; color:var(--ink);">🪵 Laminated Multi-Part Slicing (Biradial Horns & Stacks)</span>
            </label>
            <div style="font-size:11px; color:var(--ink-2); margin-top:4px;">
              Partitions tall complex designs (e.g. Biradial audio horns, Altec 511B style acoustic stacks) into manageable 30mm glued/doweled slabs with alignment pin holes and per-slab G-code export.
            </div>

            <div id="slice-lam-panel" style="margin-top:10px; display:${this.slicer.laminationConfig.enabled ? 'block' : 'none'};">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div class="cle-form-row">
                  <label style="font-size:12px;">Slab Thickness (mm):</label>
                  <input class="cle-input" id="slice-slab-thick" type="number" step="1.0" value="${this.slicer.laminationConfig.slabThickness || 30.0}">
                </div>
                <div class="cle-form-row">
                  <label style="font-size:12px;">Dowel Margin from Edge (mm):</label>
                  <input class="cle-input" id="slice-dowel-margin" type="number" step="1.0" value="${this.slicer.laminationConfig.dowelMargin || 25.0}">
                </div>
              </div>

              <!-- Slab Presets -->
              <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; align-items:center;">
                <span style="font-size:11px; color:var(--ink-2);">Slab Presets:</span>
                <button type="button" class="cle-btn cle-slab-preset" data-val="18.0" style="padding:2px 8px; font-size:11px;">18mm Baltic Birch</button>
                <button type="button" class="cle-btn cle-slab-preset" data-val="25.4" style="padding:2px 8px; font-size:11px;">1" Hardwood</button>
                <button type="button" class="cle-btn cle-slab-preset" data-val="30.0" style="padding:2px 8px; font-size:11px;">30mm Slab (Default)</button>
                <button type="button" class="cle-btn cle-slab-preset" data-val="38.1" style="padding:2px 8px; font-size:11px;">1.5" Butcher Block</button>
                <button type="button" class="cle-btn cle-slab-preset" data-val="50.0" style="padding:2px 8px; font-size:11px;">50mm Heavy Blank</button>
              </div>

              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px;">
                <div class="cle-form-row">
                  <label style="font-size:12px;">Dowel Hole Dia (mm):</label>
                  <input class="cle-input" id="slice-dowel-dia" type="number" step="0.5" value="${this.slicer.laminationConfig.dowelDiameter || 8.0}">
                </div>
                <div class="cle-form-row">
                  <label style="font-size:12px;">Holes per Slab:</label>
                  <select class="cle-select" id="slice-dowel-count">
                    <option value="4" ${(this.slicer.laminationConfig.dowelHoleCount||4)===4?'selected':''}>4 Corner Alignment Pins</option>
                    <option value="2" ${(this.slicer.laminationConfig.dowelHoleCount||4)===2?'selected':''}>2 Diagonal Alignment Pins</option>
                  </select>
                </div>
              </div>

              <!-- Dedicated Tool Mapping -->
              <div style="margin-top:10px; background:var(--paper); padding:8px 10px; border-radius:4px; border:1px solid var(--line);">
                <div style="font-size:11px; font-weight:700; color:var(--ink); margin-bottom:6px;">🛠️ Slicing Tool Mapping (Manual / ATC Tool Changes)</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                  <div class="cle-form-row">
                    <label style="font-size:11px;">Drill Tool (Pins):</label>
                    <select class="cle-select" id="slice-tool-drill" style="font-size:11px; padding:3px 6px;">
                      ${toolOptionsDrill}
                    </select>
                  </div>
                  <div class="cle-form-row">
                    <label style="font-size:11px;">Roughing Endmill:</label>
                    <select class="cle-select" id="slice-tool-rough" style="font-size:11px; padding:3px 6px;">
                      ${toolOptionsRough}
                    </select>
                  </div>
                  <div class="cle-form-row">
                    <label style="font-size:11px;">Finishing Ballnose:</label>
                    <select class="cle-select" id="slice-tool-finish" style="font-size:11px; padding:3px 6px;">
                      ${toolOptionsFinish}
                    </select>
                  </div>
                  <div class="cle-form-row">
                    <label style="font-size:11px;">Cutout Endmill:</label>
                    <select class="cle-select" id="slice-tool-cutout" style="font-size:11px; padding:3px 6px;">
                      ${toolOptionsCutout}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style="margin-top:14px; display:flex; gap:10px;">
            <button class="cle-btn" id="slice-run-btn" style="background:var(--accent); color:var(--on-accent); padding:8px 18px; font-weight:700;">Slice & Display in 3D Viewport</button>
            <button class="cle-btn" id="slice-return-btn" style="background:#2563eb; color:#fff; padding:8px 18px; font-weight:700;" title="Return to JumpStart CAD Design Workspace">Return to Design</button>
          </div>
        </div>

        <div id="cle-slicer-panel-gray" style="display:${isGrayscale ? 'block' : 'none'};">
          <div style="background:rgba(37,99,235,0.08); border-left:4px solid #2563eb; padding:8px 12px; border-radius:4px; margin-bottom:12px; font-size:12px; color:var(--ink);">
            <strong>Grayscale Continuous Z Engine (Original CLE Feature):</strong> Convert 2D grayscale images or sketches into watertight 3D solid relief meshes or continuous multi-axis toolpaths with live real-time simulation.
          </div>

          <!-- Image Loader Row -->
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            <input type="file" id="cle-gray-file" accept="image/*" style="display:none;">
            <button type="button" class="cle-btn" id="cle-gray-browse-btn" style="padding:6px 14px; background:var(--accent); color:var(--on-accent); font-weight:600;">📁 Load Image File...</button>
            <button type="button" class="cle-btn" id="cle-gray-ws-btn" style="padding:6px 14px; background:rgba(37,99,235,0.12); border:1px solid #2563eb; color:#2563eb; font-weight:600;">🎨 Use Workspace Sketch Image</button>
            <button type="button" class="cle-btn" id="cle-gray-test-pattern-btn" style="padding:6px 12px; background:rgba(16,185,129,0.12); border:1px solid #10b981; color:#10b981; font-weight:600;">✨ Dome Test Pattern</button>
            <span id="cle-gray-status" style="font-size:12px; color:var(--ink-2); margin-left:4px;">No image selected (demo pattern ready)</span>
          </div>

          <!-- Preview & Modulation Grid -->
          <div style="display:grid; grid-template-columns:180px 1fr; gap:14px; background:var(--paper); padding:10px 12px; border-radius:6px; border:1px solid var(--line); margin-bottom:12px;">
            <div>
              <div style="font-size:11px; font-weight:700; color:var(--ink); margin-bottom:4px;">Grayscale Preview:</div>
              <canvas id="cle-gray-preview-canvas" width="160" height="160" style="background:#111; border:1px solid var(--line); border-radius:4px; display:block; width:160px; height:160px; object-fit:contain;"></canvas>
              <div id="cle-gray-img-dim" style="font-size:10px; color:var(--ink-2); margin-top:4px; font-family:var(--f-mono);">Size: 160x160 px</div>
            </div>

            <div style="display:flex; flex-direction:column; justify-content:space-around;">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:600; font-size:12px; margin-bottom:6px;">
                <input type="checkbox" id="cle-gray-invert" style="width:15px; height:15px;"> Invert Grayscale (Bright = Peak / Dark = Bed Floor)
              </label>

              <div class="cle-form-row" style="margin-bottom:4px;">
                <label style="font-size:11px; display:flex; justify-content:space-between;">
                  <span>Brightness:</span><span id="lbl-cle-bright" style="font-family:var(--f-mono); font-weight:700;">0</span>
                </label>
                <input type="range" id="cle-gray-bright" min="-100" max="100" value="0" style="width:100%;">
              </div>

              <div class="cle-form-row" style="margin-bottom:4px;">
                <label style="font-size:11px; display:flex; justify-content:space-between;">
                  <span>Contrast:</span><span id="lbl-cle-contrast" style="font-family:var(--f-mono); font-weight:700;">0</span>
                </label>
                <input type="range" id="cle-gray-contrast" min="-100" max="100" value="0" style="width:100%;">
              </div>

              <div class="cle-form-row" style="margin-bottom:2px;">
                <label style="font-size:11px; display:flex; justify-content:space-between;">
                  <span>Gamma Curve:</span><span id="lbl-cle-gamma" style="font-family:var(--f-mono); font-weight:700;">1.0</span>
                </label>
                <input type="range" id="cle-gray-gamma" min="20" max="300" value="100" style="width:100%;">
              </div>
            </div>
          </div>

          <!-- Physical Dimensions & Relief Depth -->
          <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:8px; margin-bottom:10px;">
            <div class="cle-form-row">
              <label style="font-size:11px;">Width X (mm):</label>
              <input class="cle-input" id="cle-gray-w" type="number" step="1.0" value="100.0">
            </div>
            <div class="cle-form-row">
              <label style="font-size:11px;">Height Y (mm):</label>
              <input class="cle-input" id="cle-gray-h" type="number" step="1.0" value="100.0">
            </div>
            <div class="cle-form-row">
              <label style="font-size:11px;">Relief Depth (mm):</label>
              <input class="cle-input" id="cle-gray-depth" type="number" step="0.5" value="5.0">
            </div>
            <div class="cle-form-row">
              <label style="font-size:11px;">Base Floor (mm):</label>
              <input class="cle-input" id="cle-gray-floor" type="number" step="0.5" value="2.0">
            </div>
          </div>

          <!-- Continuous Toolpath Parameters -->
          <div style="background:var(--paper); padding:10px 12px; border-radius:6px; border:1px solid var(--line); margin-bottom:12px;">
            <div style="font-size:11px; font-weight:700; color:var(--ink); margin-bottom:6px;">⚙️ Slicing & Machine Toolpath Options</div>
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
              <div class="cle-form-row">
                <label style="font-size:11px;">Strategy:</label>
                <select class="cle-select" id="cle-gray-strategy" style="font-size:11px;">
                  <option value="continuous" selected>Continuous Dynamic Z Surface</option>
                  <option value="waterline">Stepped Waterline Roughing</option>
                </select>
              </div>
              <div class="cle-form-row">
                <label style="font-size:11px;">Z Passes / Slices:</label>
                <input class="cle-input" id="cle-gray-passes" type="number" min="2" max="64" value="16" style="font-size:11px;">
              </div>
              <div class="cle-form-row">
                <label style="font-size:11px;">Mesh Grid Res:</label>
                <select class="cle-select" id="cle-gray-res" style="font-size:11px;">
                  <option value="40">40x40 (Fast)</option>
                  <option value="60">60x60 (Standard)</option>
                  <option value="80" selected>80x80 (High Detail)</option>
                  <option value="120">120x120 (Ultra Detailed)</option>
                </select>
              </div>
              <div class="cle-form-row">
                <label style="font-size:11px;">Feed Rate (mm/min):</label>
                <input class="cle-input" id="cle-gray-feed" type="number" value="${this.slicer.feedRate || 1500}" style="font-size:11px;">
              </div>
              <div class="cle-form-row">
                <label style="font-size:11px;">Spindle RPM:</label>
                <input class="cle-input" id="cle-gray-rpm" type="number" value="14000" style="font-size:11px;">
              </div>
              <div class="cle-form-row">
                <label style="font-size:11px;">Mode:</label>
                <select class="cle-select" id="cle-gray-mode" style="font-size:11px;">
                  <option value="cnc" selected>CNC Milling (Top-Down)</option>
                  <option value="laser">Laser Engraving (Top-Down)</option>
                  <option value="3d">3D Additive Relief</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Dual Primary Action Buttons -->
          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
            <button class="cle-btn" id="cle-gray-create-3d-btn" style="background:#10b981; color:#fff; padding:9px 18px; font-weight:700;" title="Generate Watertight 3D Solid Relief Mesh centered on Spoilboard in Workspace">📦 Create 3D Object in Workspace</button>
            <button class="cle-btn" id="cle-gray-slice-run-btn" style="background:var(--accent); color:var(--on-accent); padding:9px 18px; font-weight:700;" title="Slice Image into Continuous Z Toolpath Passes and open 3D Layer HUD">⚡ Slice to Continuous Z</button>
            <button class="cle-btn" id="cle-gray-return-btn" style="background:#64748b; color:#fff; padding:9px 16px; font-weight:600;">Return to Design</button>
          </div>
        </div>
      `;
    '''

content = content[:idx_html_start] + new_html_block + content[idx_html_end:]

# 3. Update Modal Listeners section
# Find from `} else if (type === 'slicer') {` up to `} else if (type === 'rotary') {` in the second half of the file
idx_listen_start = content.find("} else if (type === 'slicer') {", idx_html_start + len(new_html_block))
idx_listen_end = content.find("} else if (type === 'rotary') {", idx_listen_start)

if idx_listen_start == -1 or idx_listen_end == -1:
    print("ERROR: Listener section bounds not found!")
    sys.exit(1)

new_listen_block = '''} else if (type === 'slicer' || type === 'grayscale') {
      // Tab switching between CAD Slicer and Grayscale 3D Relief
      const cadTab = document.getElementById('cle-slicer-tab-cad');
      const grayTab = document.getElementById('cle-slicer-tab-gray');
      const cadPanel = document.getElementById('cle-slicer-panel-cad');
      const grayPanel = document.getElementById('cle-slicer-panel-gray');

      if (cadTab && grayTab) {
        cadTab.onclick = () => {
          cadPanel.style.display = 'block';
          grayPanel.style.display = 'none';
          cadTab.style.borderBottom = '3px solid #2563eb';
          cadTab.style.color = '#2563eb';
          grayTab.style.borderBottom = '3px solid transparent';
          grayTab.style.color = 'var(--ink-2)';
        };
        grayTab.onclick = () => {
          cadPanel.style.display = 'none';
          grayPanel.style.display = 'block';
          grayTab.style.borderBottom = '3px solid #2563eb';
          grayTab.style.color = '#2563eb';
          cadTab.style.borderBottom = '3px solid transparent';
          cadTab.style.color = 'var(--ink-2)';
        };
      }

      // CAD Slicer Listeners
      const returnBtn = document.getElementById('slice-return-btn');
      if (returnBtn) {
        returnBtn.onclick = () => {
          this.closeModal();
          const wsBtn = document.getElementById('ws-design');
          if (wsBtn) wsBtn.click();
          this.notify('Returned to JumpStart Design CAD workspace.', 'info');
        };
      }
      const lamCheck = document.getElementById('slice-enable-lamination');
      const lamPanel = document.getElementById('slice-lam-panel');
      if (lamCheck && lamPanel) {
        lamCheck.onchange = (e) => {
          lamPanel.style.display = e.target.checked ? 'block' : 'none';
          this.slicer.laminationConfig.enabled = e.target.checked;
        };
      }

      // Slab preset buttons
      const presetBtns = document.querySelectorAll('.cle-slab-preset');
      presetBtns.forEach(btn => {
        btn.onclick = () => {
          const val = parseFloat(btn.getAttribute('data-val'));
          const thickInput = document.getElementById('slice-slab-thick');
          if (thickInput) thickInput.value = val;
        };
      });

      const sliceRunBtn = document.getElementById('slice-run-btn');
      if (sliceRunBtn) {
        sliceRunBtn.onclick = async () => {
          const mode = document.getElementById('slice-mode').value;
          const layerH = document.getElementById('slice-layer-h').value;
          const infill = document.getElementById('slice-infill').value;
          const feed = document.getElementById('slice-feed').value;
          const enableCutout = document.getElementById('slice-enable-cutout') ? document.getElementById('slice-enable-cutout').checked : true;
          const cutoutOvercut = document.getElementById('slice-cutout-depth') ? (parseFloat(document.getElementById('slice-cutout-depth').value) || 0.20) : 0.20;

          const enableLamination = document.getElementById('slice-enable-lamination') ? document.getElementById('slice-enable-lamination').checked : false;
          const slabThickness = document.getElementById('slice-slab-thick') ? (parseFloat(document.getElementById('slice-slab-thick').value) || 30.0) : 30.0;
          const dowelHolesEnabled = true;
          const dowelDiameter = document.getElementById('slice-dowel-dia') ? (parseFloat(document.getElementById('slice-dowel-dia').value) || 8.0) : 8.0;
          const dowelMargin = document.getElementById('slice-dowel-margin') ? (parseFloat(document.getElementById('slice-dowel-margin').value) || 25.0) : 25.0;
          const dowelHoleCount = document.getElementById('slice-dowel-count') ? (parseInt(document.getElementById('slice-dowel-count').value, 10) || 4) : 4;
          const toolMapping = {
            drillingToolNumber: parseInt(document.getElementById('slice-tool-drill')?.value || 2, 10),
            roughingToolNumber: parseInt(document.getElementById('slice-tool-rough')?.value || 1, 10),
            finishingToolNumber: parseInt(document.getElementById('slice-tool-finish')?.value || 3, 10),
            cutoutToolNumber: parseInt(document.getElementById('slice-tool-cutout')?.value || 1, 10)
          };

          this.slicer.feedRate = parseFloat(feed) || 1500;
          await this.slicer.sliceModel({
            mode,
            layerHeight: layerH,
            infill,
            feedRate: feed,
            enableCutout,
            cutoutOvercut,
            enableLamination,
            slabThickness,
            dowelHolesEnabled,
            dowelDiameter,
            dowelMargin,
            dowelHoleCount,
            toolMapping
          });
          this.closeModal();
        };
      }

      // --- Grayscale 3D Relief & Slicer Listeners ---
      let loadedImg = null;
      const previewCanvas = document.getElementById('cle-gray-preview-canvas');
      const bSlider = document.getElementById('cle-gray-bright');
      const cSlider = document.getElementById('cle-gray-contrast');
      const gSlider = document.getElementById('cle-gray-gamma');
      const invertBox = document.getElementById('cle-gray-invert');
      const statusLbl = document.getElementById('cle-gray-status');
      const dimLbl = document.getElementById('cle-gray-img-dim');

      const redrawPreview = () => {
        if (!previewCanvas) return;
        const ctx = previewCanvas.getContext('2d');
        const cw = previewCanvas.width;
        const ch = previewCanvas.height;
        ctx.clearRect(0, 0, cw, ch);

        if (loadedImg) {
          ctx.drawImage(loadedImg, 0, 0, cw, ch);
        } else {
          // Draw a handsome procedural dome gradient pattern
          const grad = ctx.createRadialGradient(cw/2, ch/2, 4, cw/2, ch/2, cw/2);
          grad.addColorStop(0, '#ffffff');
          grad.addColorStop(0.5, '#888888');
          grad.addColorStop(0.85, '#333333');
          grad.addColorStop(1, '#000000');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, cw, ch);
          // Add crosshair concentric rings
          ctx.strokeStyle = '#aaaaaa';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cw/2, ch/2, cw/4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Apply visual modulation to preview canvas
        const imgData = ctx.getImageData(0, 0, cw, ch);
        const data = imgData.data;
        const b = parseInt(bSlider?.value || 0, 10);
        const c = parseInt(cSlider?.value || 0, 10);
        const g = (parseInt(gSlider?.value || 100, 10)) / 100.0;
        const inv = invertBox ? invertBox.checked : false;

        const factor = (259 * (c + 255)) / (255 * (259 - c));
        const gammaInv = 1.0 / Math.max(0.01, g);

        for (let i = 0; i < data.length; i += 4) {
          let lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
          if (b !== 0) lum += b;
          if (c !== 0) lum = factor * (lum - 128) + 128;
          lum = Math.max(0, Math.min(255, lum));
          if (g !== 1.0) lum = 255.0 * Math.pow(lum / 255.0, gammaInv);
          if (inv) lum = 255.0 - lum;
          lum = Math.max(0, Math.min(255, Math.round(lum)));
          data[i] = lum;
          data[i+1] = lum;
          data[i+2] = lum;
        }
        ctx.putImageData(imgData, 0, 0);
      };

      if (bSlider) {
        bSlider.oninput = (e) => {
          document.getElementById('lbl-cle-bright').textContent = e.target.value;
          redrawPreview();
        };
      }
      if (cSlider) {
        cSlider.oninput = (e) => {
          document.getElementById('lbl-cle-contrast').textContent = e.target.value;
          redrawPreview();
        };
      }
      if (gSlider) {
        gSlider.oninput = (e) => {
          document.getElementById('lbl-cle-gamma').textContent = (e.target.value / 100).toFixed(1);
          redrawPreview();
        };
      }
      if (invertBox) {
        invertBox.onchange = () => redrawPreview();
      }

      // Initial preview render
      redrawPreview();

      // Browse file input
      const fileInput = document.getElementById('cle-gray-file');
      const browseBtn = document.getElementById('cle-gray-browse-btn');
      if (browseBtn && fileInput) {
        browseBtn.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
              const img = new Image();
              img.onload = () => {
                loadedImg = img;
                if (statusLbl) statusLbl.textContent = `${file.name} (${img.width}x${img.height})`;
                if (dimLbl) dimLbl.textContent = `Size: ${img.width}x${img.height} px`;
                redrawPreview();
                this.notify(`Loaded grayscale image: ${file.name}`, 'ok');
              };
              img.src = re.target.result;
            };
            reader.readAsDataURL(file);
          }
        };
      }

      // Procedural dome pattern button
      const domeBtn = document.getElementById('cle-gray-test-pattern-btn');
      if (domeBtn) {
        domeBtn.onclick = () => {
          loadedImg = null;
          if (statusLbl) statusLbl.textContent = 'Dome relief test pattern active';
          if (dimLbl) dimLbl.textContent = 'Size: 160x160 px (procedural)';
          redrawPreview();
          this.notify('Loaded procedural 3D dome pattern', 'info');
        };
      }

      // Use Workspace Sketch Image Button
      const wsImgBtn = document.getElementById('cle-gray-ws-btn');
      if (wsImgBtn) {
        wsImgBtn.onclick = () => {
          // Look for any image element or canvas in the workspace or Vellum
          let foundSrc = null;
          try {
            const iframe = document.getElementById('cle-vellum-iframe');
            if (iframe && iframe.contentWindow) {
              const vImg = iframe.contentWindow.document.querySelector('image, img');
              if (vImg && (vImg.href?.baseVal || vImg.src)) {
                foundSrc = vImg.href?.baseVal || vImg.src;
              }
            }
            if (!foundSrc) {
              const wsImgs = document.querySelectorAll('#viewport img, canvas');
              for (const el of wsImgs) {
                if (el.tagName === 'IMG' && el.src) {
                  foundSrc = el.src;
                  break;
                } else if (el.tagName === 'CANVAS' && el !== previewCanvas && el.width > 50) {
                  foundSrc = el.toDataURL();
                  break;
                }
              }
            }
          } catch (err) {
            console.warn('[CLE] Workspace image search error:', err);
          }

          if (foundSrc) {
            const img = new Image();
            img.onload = () => {
              loadedImg = img;
              if (statusLbl) statusLbl.textContent = `Workspace Image (${img.width}x${img.height})`;
              if (dimLbl) dimLbl.textContent = `Size: ${img.width}x${img.height} px`;
              redrawPreview();
              this.notify('Loaded image from active workspace!', 'ok');
            };
            img.src = foundSrc;
          } else {
            this.notify('No raster image found in active sketch; procedural test pattern selected.', 'info');
            loadedImg = null;
            redrawPreview();
          }
        };
      }

      const getGrayscaleOptions = () => {
        return {
          targetWidth: parseFloat(document.getElementById('cle-gray-w')?.value) || 100.0,
          targetHeight: parseFloat(document.getElementById('cle-gray-h')?.value) || 100.0,
          depthMm: parseFloat(document.getElementById('cle-gray-depth')?.value) || 5.0,
          baseFloorMm: parseFloat(document.getElementById('cle-gray-floor')?.value) || 2.0,
          resolution: parseInt(document.getElementById('cle-gray-res')?.value, 10) || 80,
          invert: !!(invertBox && invertBox.checked),
          brightness: parseInt(bSlider?.value || 0, 10),
          contrast: parseInt(cSlider?.value || 0, 10),
          gamma: (parseInt(gSlider?.value || 100, 10)) / 100.0,
          strategy: document.getElementById('cle-gray-strategy')?.value || 'continuous',
          sliceCount: parseInt(document.getElementById('cle-gray-passes')?.value, 10) || 16,
          feedRate: parseFloat(document.getElementById('cle-gray-feed')?.value) || 1500,
          spindleRPM: parseInt(document.getElementById('cle-gray-rpm')?.value, 10) || 14000,
          mode: document.getElementById('cle-gray-mode')?.value || 'cnc'
        };
      };

      // Button: Create 3D Object in Workspace
      const create3DBtn = document.getElementById('cle-gray-create-3d-btn');
      if (create3DBtn) {
        create3DBtn.onclick = async () => {
          const opts = getGrayscaleOptions();
          const imgSource = loadedImg || previewCanvas;
          this.closeModal();
          const wsBtn = document.getElementById('ws-design');
          if (wsBtn) wsBtn.click();
          await this.slicer.create3DReliefObjectFromGrayscale(imgSource, opts);
        };
      }

      // Button: Slice to Continuous Z
      const sliceGrayBtn = document.getElementById('cle-gray-slice-run-btn');
      if (sliceGrayBtn) {
        sliceGrayBtn.onclick = async () => {
          const opts = getGrayscaleOptions();
          const imgSource = loadedImg || previewCanvas;
          this.closeModal();
          await this.slicer.sliceGrayscaleHeightmap(imgSource, opts);
        };
      }

      // Button: Return to Design
      const grayReturnBtn = document.getElementById('cle-gray-return-btn');
      if (grayReturnBtn) {
        grayReturnBtn.onclick = () => {
          this.closeModal();
          const wsBtn = document.getElementById('ws-design');
          if (wsBtn) wsBtn.click();
        };
      }
    '''

content = content[:idx_listen_start] + new_listen_block + content[idx_listen_end:]

with open("Dev/cle_tools/cle_boot.js", "w", encoding="utf-8") as f:
    f.write(content)

print("Updated Dev/cle_tools/cle_boot.js successfully!")

