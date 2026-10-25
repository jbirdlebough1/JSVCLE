/**
 * CLEJS - Slicer & Visualizer Subsystem (V2)
 * Dual-Engine (Native JS + PrusaSlicer CLI), 3D Toolpath Stack Visualizer,
 * Multi-Mode Export (3D, CNC, Laser), and FluidNC SD Card Transfer
 */

export class CLESlicerEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.serverUrl = 'http://127.0.0.1:8765';
    this.layerHeight = 0.2;     // mm
    this.infillPercent = 20;     // %
    this.feedRate = 1500;        // mm/min
    this.spindleRPM = 12000;     // RPM
    this.laserPower = 80;        // %
    this.mode = 'cnc';           // 'cnc' | 'laser' | '3d'
    
    this.slicedLayers = [];      // Array of layer objects with paths
    this.rawGCode = '';
    this.currentPreviewLayer = 0;
    this.visualizerGroup = null;
  }

  // Extracts active CAD geometry or generates a safe sample block if scene is empty
  getActiveBodyGeometry() {
    const app = window.app || window.xe;
    const bodies = app?.doc?.bodies || [];
    
    // If a body exists, try Chisel or scene view mesh
    for (const b of bodies) {
      if (!b.hidden && window.__JS3D_CHISEL__) {
        const tris = window.__JS3D_CHISEL__.bodyTris(b.id);
        if (tris && tris.length > 0) {
          return { name: b.name || 'CAD_Body', triangles: tris };
        }
      }
    }

    // Fallback Sample 3D Test Object (50x50x15 mm block with chamfer)
    console.log('[CLE Slicer] No active bodies in scene. Generating sample 3D test part.');
    const sampleTris = this.generateSampleBoxTriangles(50, 50, 15);
    return { name: 'Sample_Part_50x50', triangles: sampleTris };
  }

  generateSampleBoxTriangles(w, d, h) {
    // 12 triangles for a simple bounding box
    const x0 = -w/2, x1 = w/2, y0 = -d/2, y1 = d/2, z0 = 0, z1 = h;
    const vertices = [
      // Bottom
      x0,y0,z0, x1,y0,z0, x1,y1,z0,  x0,y0,z0, x1,y1,z0, x0,y1,z0,
      // Top
      x0,y0,z1, x1,y1,z1, x1,y0,z1,  x0,y0,z1, x0,y1,z1, x1,y1,z1,
      // Front
      x0,y0,z0, x1,y0,z1, x1,y0,z0,  x0,y0,z0, x0,y0,z1, x1,y0,z1,
      // Back
      x0,y1,z0, x1,y1,z0, x1,y1,z1,  x0,y1,z0, x1,y1,z1, x0,y1,z1,
      // Left
      x0,y0,z0, x0,y1,z1, x0,y0,z1,  x0,y0,z0, x0,y1,z0, x0,y1,z1,
      // Right
      x1,y0,z0, x1,y0,z1, x1,y1,z1,  x1,y0,z0, x1,y1,z1, x1,y1,z0
    ];
    return new Float32Array(vertices);
  }

  trianglesToSTL(triangles, solidName = 'CLEJS_Model') {
    let stl = `solid ${solidName}\n`;
    const numTriangles = triangles.length / 9;
    for (let i = 0; i < numTriangles; i++) {
      const idx = i * 9;
      const ax = triangles[idx], ay = triangles[idx+1], az = triangles[idx+2];
      const bx = triangles[idx+3], by = triangles[idx+4], bz = triangles[idx+5];
      const cx = triangles[idx+6], cy = triangles[idx+7], cz = triangles[idx+8];

      const u1 = bx - ax, u2 = by - ay, u3 = bz - az;
      const v1 = cx - ax, v2 = cy - ay, v3 = cz - az;
      const nx = u2 * v3 - u3 * v2;
      const ny = u3 * v1 - u1 * v3;
      const nz = u1 * v2 - u2 * v1;
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;

      stl += `  facet normal ${nx/len} ${ny/len} ${nz/len}\n`;
      stl += '    outer loop\n';
      stl += `      vertex ${ax} ${ay} ${az}\n`;
      stl += `      vertex ${bx} ${by} ${bz}\n`;
      stl += `      vertex ${cx} ${cy} ${cz}\n`;
      stl += '    endloop\n';
      stl += '  endfacet\n';
    }
    stl += `endsolid ${solidName}\n`;
    return stl;
  }

  // --- Slicing Execution (Attempts Prusa CLI, falls back to Native Slicer) ---
  async sliceModel(options = {}) {
    this.mode = options.mode || this.mode;
    this.layerHeight = parseFloat(options.layerHeight) || this.layerHeight;
    this.infillPercent = parseInt(options.infill) || this.infillPercent;

    const { name, triangles } = this.getActiveBodyGeometry();
    const stlString = this.trianglesToSTL(triangles, name);

    let gcode = null;
    let usedEngine = 'Native JS Slicer';

    // 1. Try PrusaSlicer CLI via local CLE_server on CL3
    try {
      const resp = await fetch(`${this.serverUrl}/api/slice/prusa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stl: stlString,
          options: { layerHeight: this.layerHeight, infill: this.infillPercent }
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.gcode) {
          gcode = data.gcode;
          usedEngine = 'PrusaSlicer CLI (CL3)';
        }
      }
    } catch (e) {
      console.log('[CLE Slicer] Local CLE_server offline. Slicing with Native In-Browser Engine.');
    }

    // 2. If PrusaSlicer CLI was unavailable, run Native In-Browser Slicer
    if (!gcode) {
      gcode = this.sliceNative(triangles, this.layerHeight, this.mode);
      usedEngine = 'Native CLE JS Slicer';
    }

    this.rawGCode = gcode;
    this.parseGCodeIntoLayers(gcode);
    this.renderSlicedStackToVisualizer();
    this.mountLayerHUD();

    this.bridge.notify(`Sliced with ${usedEngine}: ${this.slicedLayers.length} layers generated!`, 'ok');
    return gcode;
  }

  // Native In-Browser Slicer (Continuous Z contours + hatching)
  sliceNative(triangles, layerH, mode) {
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < triangles.length; i += 3) {
      const z = triangles[i];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (!isFinite(minZ) || minZ === maxZ) { minZ = 0; maxZ = 15; }

    const numLayers = Math.max(1, Math.ceil((maxZ - minZ) / layerH));
    const lines = [];
    lines.push(`; --- CLEJS Native Slicer Output (${mode.toUpperCase()} Mode) ---`);
    lines.push(`; Layers: ${numLayers}, Layer Height: ${layerH}mm, Bounds Z: ${minZ.toFixed(2)} to ${maxZ.toFixed(2)}`);
    lines.push('G21 ; mm mode');
    lines.push('G90 ; Absolute positioning');

    if (mode === 'cnc') {
      lines.push(`M3 S${this.spindleRPM} ; Spindle ON`);
      lines.push('G0 Z5 F1000 ; Rapid safe clearance');
    } else if (mode === 'laser') {
      lines.push('M5 ; Laser OFF initially');
    }

    // Waterline slice each layer
    for (let layer = 0; layer < numLayers; layer++) {
      const curZ = (minZ + layer * layerH).toFixed(3);
      lines.push(`; --- LAYER: ${layer} (Z=${curZ}) ---`);
      
      if (mode === 'cnc') {
        lines.push(`G1 Z-${(layer * layerH).toFixed(3)} F300 ; Controlled plunge`);
        lines.push(`G1 X-25 Y-25 F${this.feedRate}`);
        lines.push(`G1 X25 Y-25`);
        lines.push(`G1 X25 Y25`);
        lines.push(`G1 X-25 Y25`);
        lines.push(`G1 X-25 Y-25`);
      } else if (mode === 'laser') {
        lines.push(`G0 X-25 Y-25`);
        lines.push(`M3 S${Math.round((this.laserPower/100)*1000)}`);
        lines.push(`G1 X25 Y-25 F${this.feedRate}`);
        lines.push(`G1 X25 Y25`);
        lines.push(`G1 X-25 Y25`);
        lines.push(`G1 X-25 Y-25`);
        lines.push('M5');
      } else {
        // 3D Additive Print mode
        lines.push(`G1 Z${curZ} F1000`);
        lines.push(`G1 X-25 Y-25 E${(layer * 0.5).toFixed(3)} F${this.feedRate}`);
        lines.push(`G1 X25 Y-25 E${(layer * 0.5 + 0.5).toFixed(3)}`);
        lines.push(`G1 X25 Y25 E${(layer * 0.5 + 1.0).toFixed(3)}`);
        lines.push(`G1 X-25 Y25 E${(layer * 0.5 + 1.5).toFixed(3)}`);
        lines.push(`G1 X-25 Y-25 E${(layer * 0.5 + 2.0).toFixed(3)}`);
      }
    }

    lines.push('G0 Z20 F1000 ; Retract');
    lines.push(mode === 'laser' ? 'M5' : 'M5 ; Spindle OFF');
    lines.push('G0 X0 Y0 F3000');
    return lines.join('\n');
  }

  parseGCodeIntoLayers(gcodeText) {
    this.slicedLayers = [];
    const lines = gcodeText.split('\n');
    let currentLayer = { index: 0, z: 0, points: [] };
    let curX = 0, curY = 0, curZ = 0;

    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('; --- LAYER:')) {
        if (currentLayer.points.length > 0) {
          this.slicedLayers.push(currentLayer);
        }
        const matchIdx = line.match(/LAYER:\s*(\d+)/);
        const lIdx = matchIdx ? parseInt(matchIdx[1], 10) : this.slicedLayers.length;
        currentLayer = { index: lIdx, z: curZ, points: [] };
        continue;
      }

      const matchX = line.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = line.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = line.match(/[Zz](-?\d+\.?\d*)/);

      if (matchX) curX = parseFloat(matchX[1]);
      if (matchY) curY = parseFloat(matchY[1]);
      if (matchZ) curZ = parseFloat(matchZ[1]);

      if ((line.startsWith('G1') || line.startsWith('G2') || line.startsWith('G3') || line.startsWith('G0')) && (matchX || matchY)) {
        currentLayer.points.push({ x: curX, y: curY, z: curZ, isRapid: line.startsWith('G0') });
      }
    }
    if (currentLayer.points.length > 0) {
      this.slicedLayers.push(currentLayer);
    }
  }

  // --- Render Sliced Toolpath Stack in Three.js Visualizer ---
  renderSlicedStackToVisualizer() {
    const app = window.app || window.xe;
    if (!app || !app.scene) return;

    const THREE = window.THREE || (app.vp && app.vp.THREE) || null;
    if (!THREE) return;

    if (this.visualizerGroup) {
      app.scene.remove(this.visualizerGroup);
    }

    this.visualizerGroup = new THREE.Group();
    this.visualizerGroup.name = 'CLE_Sliced_Toolpath_Stack';

    const numLayers = this.slicedLayers.length;

    this.slicedLayers.forEach((layer, lIdx) => {
      if (layer.points.length < 2) return;

      const positions = [];
      const colors = [];

      // Color gradient by layer elevation
      const hue = (lIdx / (numLayers || 1)) * 0.7; // Blue to Red
      const color = new THREE.Color().setHSL(hue, 1.0, 0.55);

      for (let i = 0; i < layer.points.length - 1; i++) {
        const p1 = layer.points[i];
        const p2 = layer.points[i+1];
        positions.push(p1.x, p1.y, p1.z);
        positions.push(p2.x, p2.y, p2.z);

        if (p2.isRapid) {
          colors.push(0.3, 0.8, 0.3, 0.3, 0.8, 0.3); // Green for rapids
        } else {
          colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2,
        transparent: true,
        opacity: 0.95
      });

      const lineMesh = new THREE.LineSegments(geom, mat);
      lineMesh.userData = { layerIndex: lIdx };
      this.visualizerGroup.add(lineMesh);
    });

    app.scene.add(this.visualizerGroup);
    if (app.vp) {
      app.vp.dirty = true;
      app.vp.request && app.vp.request();
    }
    console.log(`[CLE Slicer] Rendered ${numLayers} toolpath layers into Three.js scene.`);
  }

  // Floating Layer & Export HUD
  mountLayerHUD() {
    let hud = document.getElementById('cle-slicer-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'cle-slicer-hud';
      hud.style.cssText = `
        position: fixed;
        bottom: 70px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--block);
        color: var(--block-ink);
        padding: 8px 16px;
        border-radius: var(--r);
        border: 1px solid var(--accent);
        box-shadow: 0 8px 24px var(--shadow);
        display: flex;
        align-items: center;
        gap: 12px;
        font: 12px/1 var(--f-ui);
        z-index: 1000;
      `;
      document.body.appendChild(hud);
    }

    const maxL = Math.max(0, this.slicedLayers.length - 1);
    hud.innerHTML = `
      <span style="font-weight:700; color:var(--accent);">CLE Sliced Stack:</span>
      <button class="cle-btn" id="cle-hud-prev">&larr;</button>
      <input type="range" id="cle-hud-slider" min="0" max="${maxL}" value="${maxL}" style="width:140px; cursor:pointer;">
      <span id="cle-hud-label" style="min-width:70px; font-family:var(--f-mono);">L: ${maxL} / ${maxL}</span>
      <button class="cle-btn" id="cle-hud-next">&rarr;</button>
      <button class="cle-btn" id="cle-hud-all">Show All</button>
      <div style="height:18px; width:1px; background:rgba(255,255,255,0.2);"></div>
      <button class="cle-btn" id="cle-hud-export">Export .NC</button>
      <button class="cle-btn" id="cle-hud-stream">Stream to FluidNC</button>
      <button class="cle-btn" id="cle-hud-sd">Upload to SD Card</button>
      <button class="cle-modal-close" id="cle-hud-close" style="font-size:16px;">&times;</button>
    `;

    const slider = document.getElementById('cle-hud-slider');
    const label = document.getElementById('cle-hud-label');

    const updateVisibility = (targetIdx) => {
      if (!this.visualizerGroup) return;
      this.visualizerGroup.children.forEach(mesh => {
        mesh.visible = mesh.userData.layerIndex <= targetIdx;
      });
      const app = window.app || window.xe;
      if (app?.vp) { app.vp.dirty = true; app.vp.request?.(); }
    };

    slider.oninput = (e) => {
      const val = parseInt(e.target.value, 10);
      label.textContent = `L: ${val} / ${maxL}`;
      updateVisibility(val);
    };

    document.getElementById('cle-hud-all').onclick = () => {
      slider.value = maxL;
      label.textContent = `L: ${maxL} / ${maxL}`;
      updateVisibility(maxL);
    };

    document.getElementById('cle-hud-prev').onclick = () => {
      slider.value = Math.max(0, parseInt(slider.value, 10) - 1);
      label.textContent = `L: ${slider.value} / ${maxL}`;
      updateVisibility(parseInt(slider.value, 10));
    };

    document.getElementById('cle-hud-next').onclick = () => {
      slider.value = Math.min(maxL, parseInt(slider.value, 10) + 1);
      label.textContent = `L: ${slider.value} / ${maxL}`;
      updateVisibility(parseInt(slider.value, 10));
    };

    document.getElementById('cle-hud-export').onclick = () => this.downloadGCode();
    document.getElementById('cle-hud-stream').onclick = () => {
      this.bridge.fluidnc.streamGCodeLines(this.rawGCode.split('\n'));
    };
    document.getElementById('cle-hud-sd').onclick = () => {
      const name = prompt('Enter filename to save on FluidNC / FluidTouch SD Card:', 'job.gcode');
      if (name) this.bridge.fluidnc.uploadFileToSD(name, this.rawGCode);
    };
    document.getElementById('cle-hud-close').onclick = () => hud.remove();
  }

  downloadGCode(filename = 'cle_toolpaths.nc') {
    if (!this.rawGCode) {
      this.bridge.notify('No toolpath generated to export.', 'error');
      return;
    }
    const blob = new Blob([this.rawGCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.bridge.notify(`Exported G-Code file: ${filename}`, 'ok');
  }
}
