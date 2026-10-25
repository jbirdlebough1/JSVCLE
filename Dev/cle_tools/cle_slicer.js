/**
 * CLEJS - Slicer & Visualizer Subsystem (V3)
 * Device-Type-Aware Slicing (Top-Down for CNC/Laser, Bottom-Up for 3D),
 * Native Three.js Visualizer Stack, Floating Layer HUD, and FluidNC SD Card Export
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
    this.mode = 'cnc';           // 'cnc' (top-down) | 'laser' (top-down) | '3d' (bottom-up)
    
    this.slicedLayers = [];      // Array of layer objects
    this.rawGCode = '';
    this.currentPreviewLayer = -1; // -1 = Show All
    this.visualizerGroup = null;
  }

  init() {
    // Slicer is ready for user-triggered slicing; does not overwrite normal visualizer display on startup
  }

  // Generates high-visibility default sample slices on the TTC6050 bed so slices are immediately visible
  generateDefaultSampleSlices() {
    const minX = 180, maxX = 300;
    const minY = 160, maxY = 260;
    const numPasses = 6;
    const totalDepth = 6.0;
    const passDepth = totalDepth / numPasses;
    const stepover = 15.0;

    this.slicedLayers = [];
    for (let k = 0; k < numPasses; k++) {
      const curZ = -(k + 1) * passDepth;
      const layer = {
        index: k,
        z: curZ,
        toolNumber: k < 3 ? 1 : 2,
        points: []
      };

      // Rapid move to start
      layer.points.push({ x: minX, y: minY, z: curZ + 2.0, isRapid: true });
      layer.points.push({ x: minX, y: minY, z: curZ, isRapid: false });

      // Perimeter contour
      layer.points.push({ x: maxX, y: minY, z: curZ, isRapid: false });
      layer.points.push({ x: maxX, y: maxY, z: curZ, isRapid: false });
      layer.points.push({ x: minX, y: maxY, z: curZ, isRapid: false });
      layer.points.push({ x: minX, y: minY, z: curZ, isRapid: false });

      // Pocket clearing zig-zag
      let goingRight = true;
      for (let y = minY + stepover; y < maxY - stepover / 2; y += stepover) {
        if (goingRight) {
          layer.points.push({ x: maxX - 2, y, z: curZ, isRapid: false });
        } else {
          layer.points.push({ x: minX + 2, y, z: curZ, isRapid: false });
        }
        goingRight = !goingRight;
      }

      // Retract
      layer.points.push({ x: minX + 2, y: maxY - 5, z: curZ + 2.0, isRapid: true });
      this.slicedLayers.push(layer);
    }

    this.renderSlicedStackToVisualizer();
    console.log('[CLE Slicer] Default sample workpiece slices initialized in 3D visualizer.');
  }

  // Extracts active CAD geometry from JumpStart scene or generates realistic sample block
  getActiveBodyGeometry() {
    const app = window.app || window.xe;
    const bodies = app?.doc?.bodies || [];
    
    // 1. Try window.__JS3D_CHISEL__.bodyTris() (built-in JumpStart matrix-transformed world triangles)
    if (window.__JS3D_CHISEL__ && typeof window.__JS3D_CHISEL__.bodyTris === 'function') {
      for (const b of bodies) {
        if (!b.hidden) {
          const tris = window.__JS3D_CHISEL__.bodyTris(b.id);
          if (tris && tris.length >= 9) {
            console.log(`[CLE Slicer] Extracted ${tris.length / 3} world triangles from Body "${b.name}" via bodyTris.`);
            return { name: b.name || 'CAD_Body', triangles: tris };
          }
        }
      }
    }

    // 2. Try extracting from JumpStart scene views with matrixWorld transformation
    if (app?.scene?.views) {
      for (const b of bodies) {
        if (!b.hidden) {
          const view = app.scene.views.get(b.id);
          if (view && view.mesh && view.data) {
            view.mesh.updateMatrixWorld(true);
            const T = view.mesh.matrixWorld;
            const Q = view.data.vertices;
            const idxs = view.data.triangles;
            if (Q && idxs && idxs.length > 0) {
              const THREE = window.THREE;
              const v = new THREE.Vector3();
              const L = new Float32Array(idxs.length * 3);
              for (let i = 0; i < idxs.length; i++) {
                const vi = idxs[i] * 3;
                v.set(Q[vi], Q[vi + 1], Q[vi + 2]).applyMatrix4(T);
                L[i * 3] = v.x;
                L[i * 3 + 1] = v.y;
                L[i * 3 + 2] = v.z;
              }
              console.log(`[CLE Slicer] Transformed ${L.length / 3} vertices from view.data for "${b.name}".`);
              return { name: b.name || 'CAD_Body', triangles: L };
            }
          }
        }
      }
    }

    // 3. Fallback Sample 3D Test Object (50x40x15 mm rectangular billet with chamfer)
    console.log('[CLE Slicer] No active meshed CAD bodies found. Generating 50x40x15 mm test billet.');
    const sampleTris = this.generateSampleBoxTriangles(50, 40, 15);
    return { name: 'Sample_Billet_50x40', triangles: sampleTris };
  }

  generateSampleBoxTriangles(w, d, h) {
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
      x1,y0,z0, x1,y1,z1, x1,y1,z0,  x1,y0,z0, x1,y0,z1, x1,y1,z1
    ];
    return new Float32Array(vertices);
  }

  trianglesToSTL(triangles, solidName = 'CLEJS_Model') {
    let stl = `solid ${solidName}\n`;
    const numTriangles = Math.floor(triangles.length / 9);
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

  // --- Slicing Execution (Device-Type-Aware Order) ---
  async sliceModel(options = {}) {
    this.mode = options.mode || this.mode;
    this.layerHeight = parseFloat(options.layerHeight) || this.layerHeight;
    this.infillPercent = parseInt(options.infill, 10) || this.infillPercent;
    this.feedRate = parseInt(options.feedRate, 10) || this.feedRate;

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
          options: { layerHeight: this.layerHeight, infill: this.infillPercent, mode: this.mode }
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.gcode && !data.warning) {
          gcode = data.gcode;
          usedEngine = 'PrusaSlicer CLI (CL3)';
        }
      }
    } catch (e) {
      // Offline fallback
    }

    // 2. Native Device-Type-Aware Slicing
    if (!gcode) {
      gcode = this.sliceNative(triangles, this.layerHeight, this.mode);
      usedEngine = `Native CLE JS (${this.mode.toUpperCase()})`;
    }

    this.rawGCode = gcode;
    this.parseGCodeIntoLayers(gcode);
    this.renderSlicedStackToVisualizer();
    this.mountLayerHUD();

    const orderDesc = (this.mode === 'cnc' || this.mode === 'laser') ? 'Top-Down passes' : 'Bottom-Up layers';
    this.bridge.notify(`Sliced (${usedEngine}): ${this.slicedLayers.length} ${orderDesc} generated!`, 'ok');
    return gcode;
  }

  // Native In-Browser Slicer with strict Top-Down (CNC/Laser) vs Bottom-Up (3D) ordering
  sliceNative(triangles, layerH, mode) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < triangles.length; i += 3) {
      const x = triangles[i], y = triangles[i+1], z = triangles[i+2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }

    if (!isFinite(minX) || minX === maxX) { minX = -25; maxX = 25; }
    if (!isFinite(minY) || minY === maxY) { minY = -20; maxY = 20; }
    if (!isFinite(minZ) || minZ === maxZ) { minZ = 0; maxZ = 10; }

    const totalHeight = maxZ - minZ;
    const numLayers = Math.max(1, Math.ceil(totalHeight / layerH));
    const lines = [];

    const isTopDown = (mode === 'cnc' || mode === 'laser');

    lines.push(`; === CLEJS Native Slicer Toolpath ===`);
    lines.push(`; Device Mode: ${mode.toUpperCase()} (${isTopDown ? 'Top-Down Cutting Order' : 'Bottom-Up Additive Order'})`);
    lines.push(`; Total Layers/Passes: ${numLayers}, Layer Height: ${layerH}mm`);
    lines.push(`; Workpiece Bounds: X[${minX.toFixed(2)}, ${maxX.toFixed(2)}] Y[${minY.toFixed(2)}, ${maxY.toFixed(2)}] Z[${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`);
    lines.push('G21 ; Millimeters');
    lines.push('G90 ; Absolute coordinates');

    if (mode === 'cnc') {
      lines.push(`M3 S${this.spindleRPM} ; Spindle ON`);
      lines.push('G0 Z5.0 F1000 ; Safe clearance plane');
    } else if (mode === 'laser') {
      lines.push('M5 ; Laser OFF during initial rapid');
      lines.push('G0 Z2.0 F1000 ; Focal offset clearance');
    }

    // Infill raster step
    const stepover = 3.0; // mm

    // --- LOOP OVER LAYERS ---
    for (let k = 0; k < numLayers; k++) {
      let curZ, passZ;
      if (isTopDown) {
        // TOP-DOWN: Pass 0 is just below surface, each pass steps deeper into material
        passZ = (maxZ - (k + 1) * layerH);
        curZ = passZ.toFixed(3);
      } else {
        // BOTTOM-UP: Layer 0 is on the bed, each layer steps higher
        passZ = (minZ + (k + 1) * layerH);
        curZ = passZ.toFixed(3);
      }

      lines.push(`; --- LAYER: ${k} (Z=${curZ}) ---`);

      if (mode === 'cnc') {
        // CNC MILLING (Top-Down): Safe plunge, perimeter contour, then zigzag clearing pocket
        lines.push(`G0 X${minX.toFixed(2)} Y${minY.toFixed(2)} F3000`);
        lines.push(`G1 Z${curZ} F300 ; Plunge to pass depth`);
        
        // Perimeter contour cut
        lines.push(`G1 X${maxX.toFixed(2)} Y${minY.toFixed(2)} F${this.feedRate}`);
        lines.push(`G1 X${maxX.toFixed(2)} Y${maxY.toFixed(2)}`);
        lines.push(`G1 X${minX.toFixed(2)} Y${maxY.toFixed(2)}`);
        lines.push(`G1 X${minX.toFixed(2)} Y${minY.toFixed(2)}`);

        // Zigzag pocket clearing
        let goingRight = true;
        for (let y = minY + stepover; y < maxY - stepover/2; y += stepover) {
          if (goingRight) {
            lines.push(`G1 X${(maxX - 1).toFixed(2)} Y${y.toFixed(2)}`);
          } else {
            lines.push(`G1 X${(minX + 1).toFixed(2)} Y${y.toFixed(2)}`);
          }
          goingRight = !goingRight;
        }

        // Retract slightly between depth passes
        lines.push(`G0 Z${(passZ + 1.5).toFixed(3)} F1000`);

      } else if (mode === 'laser') {
        // LASER (Top-Down): Rapid to origin, Laser ON, perimeter burn, Laser OFF
        lines.push(`G0 X${minX.toFixed(2)} Y${minY.toFixed(2)} Z${curZ} F3000`);
        const pwr = Math.round((this.laserPower / 100) * 1000);
        lines.push(`M3 S${pwr} ; Laser ON`);
        lines.push(`G1 X${maxX.toFixed(2)} Y${minY.toFixed(2)} F${this.feedRate}`);
        lines.push(`G1 X${maxX.toFixed(2)} Y${maxY.toFixed(2)}`);
        lines.push(`G1 X${minX.toFixed(2)} Y${maxY.toFixed(2)}`);
        lines.push(`G1 X${minX.toFixed(2)} Y${minY.toFixed(2)}`);
        lines.push('M5 ; Laser OFF');

      } else {
        // 3D PRINT (Bottom-Up): Additive extrusion perimeter + hatch
        lines.push(`G1 Z${curZ} F1000`);
        const eBase = k * 4.0;
        lines.push(`G1 X${minX.toFixed(2)} Y${minY.toFixed(2)} E${(eBase + 0.5).toFixed(3)} F${this.feedRate}`);
        lines.push(`G1 X${maxX.toFixed(2)} Y${minY.toFixed(2)} E${(eBase + 1.5).toFixed(3)}`);
        lines.push(`G1 X${maxX.toFixed(2)} Y${maxY.toFixed(2)} E${(eBase + 2.5).toFixed(3)}`);
        lines.push(`G1 X${minX.toFixed(2)} Y${maxY.toFixed(2)} E${(eBase + 3.5).toFixed(3)}`);
        lines.push(`G1 X${minX.toFixed(2)} Y${minY.toFixed(2)} E${(eBase + 4.0).toFixed(3)}`);
      }
    }

    // Preamble finish
    lines.push('G0 Z15.0 F1000 ; Safe retract');
    lines.push(mode === 'laser' ? 'M5 ; Laser shutdown' : 'M5 ; Spindle OFF');
    lines.push('G0 X0 Y0 F3000 ; Return to home origin');
    return lines.join('\n');
  }

  parseGCodeIntoLayers(gcodeText) {
    this.slicedLayers = [];
    const lines = gcodeText.split('\n');
    let currentLayer = { index: 0, z: 0, points: [] };
    let curX = 0, curY = 0, curZ = 0;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('; ===') || line.startsWith('; Device')) continue;

      // Layer header detection (; --- LAYER: 0 (Z=8.000) --- or ;LAYER:0 or ;LAYER_CHANGE)
      if (line.match(/^;\s*(?:---)?\s*LAYER(?:_CHANGE)?[:\s]/i)) {
        if (currentLayer.points.length > 0) {
          this.slicedLayers.push(currentLayer);
        }
        const matchIdx = line.match(/LAYER(?:_CHANGE)?[:\s]*(\d+)/i);
        const lIdx = matchIdx ? parseInt(matchIdx[1], 10) : this.slicedLayers.length;
        const matchZ = line.match(/Z=([-\d.]+)/i);
        const lZ = matchZ ? parseFloat(matchZ[1]) : curZ;
        currentLayer = { index: lIdx, z: lZ, points: [] };
        continue;
      }

      const matchX = line.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = line.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = line.match(/[Zz](-?\d+\.?\d*)/);

      if (matchX) curX = parseFloat(matchX[1]);
      if (matchY) curY = parseFloat(matchY[1]);
      if (matchZ) curZ = parseFloat(matchZ[1]);

      // Move commands (G0 = Rapid, G1/G2/G3 = Cutting Feed)
      if (line.startsWith('G0') || line.startsWith('G1') || line.startsWith('G2') || line.startsWith('G3')) {
        const isRapid = line.startsWith('G0');
        // If this is a Z change move that starts a new cut pass without explicit layer comment
        if (matchZ && !matchX && !matchY) {
          if (currentLayer.points.length > 5 && Math.abs(curZ - currentLayer.z) > 0.05) {
            this.slicedLayers.push(currentLayer);
            currentLayer = { index: this.slicedLayers.length, z: curZ, points: [] };
          }
        }
        currentLayer.points.push({ x: curX, y: curY, z: curZ, isRapid });
      }
    }

    if (currentLayer.points.length > 0) {
      this.slicedLayers.push(currentLayer);
    }
  }

  // --- Render Sliced Toolpath Stack in JumpStart's Native Three.js Viewport ---
  renderSlicedStackToVisualizer() {
    const app = window.app || window.xe;
    if (!app || !app.vp) return;

    const THREE = window.THREE;
    if (!THREE) {
      console.warn('[CLE Slicer] window.THREE not found.');
      return;
    }

    if (THREE.Material && !THREE.Material.prototype.onBeforeRender) {
      THREE.Material.prototype.onBeforeRender = function() {};
    }
    if (THREE.Object3D && !THREE.Object3D.prototype.onBeforeRender) {
      THREE.Object3D.prototype.onBeforeRender = function() {};
    }
    if (THREE.Object3D && !THREE.Object3D.prototype.removeFromParent) {
      THREE.Object3D.prototype.removeFromParent = function() {
        if (this.parent) this.parent.remove(this);
        return this;
      };
    }

    // Mount directly to app.vp.scene for guaranteed rendering
    const container = app.vp.scene || app.vp.world;
    if (!container || !container.add) return;

    // Clean up previous visualizer group
    this.clearVisualizer();

    this.visualizerGroup = new THREE.Group();
    this.visualizerGroup.name = 'CLE_Sliced_Toolpath_Stack';

    const numLayers = this.slicedLayers.length;
    const isTopDown = (this.mode === 'cnc' || this.mode === 'laser');

    // Compute entire workpiece toolpath bounding envelope
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    this.slicedLayers.forEach((layer, lIdx) => {
      if (layer.points.length < 2) return;

      const positions = [];
      const colors = [];

      // Color coding:
      // CNC/Laser (top-down): bright neon green at surface -> gold -> deep red at floor
      // 3D (bottom-up): deep blue at bed -> bright cyan -> vivid red at top
      let r, g, b;
      const progress = lIdx / Math.max(1, numLayers - 1);
      if (isTopDown) {
        if (progress < 0.5) {
          // Green to Gold (0 to 0.5)
          const t = progress * 2;
          r = t; g = 1.0; b = 0.2 * (1 - t);
        } else {
          // Gold to Red (0.5 to 1.0)
          const t = (progress - 0.5) * 2;
          r = 1.0; g = 1.0 - t * 0.8; b = 0.0;
        }
      } else {
        r = progress; g = 0.5 + 0.5 * (1 - progress); b = 1.0 - progress;
      }

      for (let i = 0; i < layer.points.length - 1; i++) {
        const p1 = layer.points[i];
        const p2 = layer.points[i + 1];

        // Track overall envelope
        if (p1.x < minX) minX = p1.x; if (p1.x > maxX) maxX = p1.x;
        if (p1.y < minY) minY = p1.y; if (p1.y > maxY) maxY = p1.y;
        if (p1.z < minZ) minZ = p1.z; if (p1.z > maxZ) maxZ = p1.z;
        if (p2.x < minX) minX = p2.x; if (p2.x > maxX) maxX = p2.x;
        if (p2.y < minY) minY = p2.y; if (p2.y > maxY) maxY = p2.y;
        if (p2.z < minZ) minZ = p2.z; if (p2.z > maxZ) maxZ = p2.z;

        positions.push(p1.x, p1.y, p1.z);
        positions.push(p2.x, p2.y, p2.z);

        if (p2.isRapid) {
          // Rapid traverse in distinct bright cyan
          colors.push(0.0, 0.85, 1.0, 0.0, 0.85, 1.0);
        } else {
          colors.push(r, g, b, r, g, b);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        depthWrite: false
      });

      const lineMesh = new THREE.LineSegments(geom, mat);
      lineMesh.renderOrder = 99999;
      lineMesh.userData = { layerIndex: lIdx, zElevation: layer.z };
      this.visualizerGroup.add(lineMesh);

      // Visible waypoint marks (toolpath nodes / plunge points)
      const ptPositions = [];
      const ptColors = [];
      for (const p of layer.points) {
        ptPositions.push(p.x, p.y, p.z);
        if (p.isRapid) {
          ptColors.push(0.0, 0.95, 1.0); // Cyan rapid mark
        } else {
          ptColors.push(r, g, b); // Cut mark
        }
      }
      if (ptPositions.length > 0) {
        const ptGeo = new THREE.BufferGeometry();
        ptGeo.setAttribute('position', new THREE.Float32BufferAttribute(ptPositions, 3));
        ptGeo.setAttribute('color', new THREE.Float32BufferAttribute(ptColors, 3));
        const ptMat = new THREE.PointsMaterial({
          size: 4.5,
          vertexColors: true,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
          depthWrite: false
        });
        const ptMesh = new THREE.Points(ptGeo, ptMat);
        ptMesh.renderOrder = 100000;
        ptMesh.userData = { layerIndex: lIdx, zElevation: layer.z };
        this.visualizerGroup.add(ptMesh);
      }
    });

    // Workpiece Material Stock Box & Safe Retract Plane in Millimeters
    if (isFinite(minX) && isFinite(maxX) && isFinite(minY) && isFinite(maxY)) {
      const stockW = Math.max(10, maxX - minX);
      const stockD = Math.max(10, maxY - minY);
      const stockH = Math.max(2, maxZ - minZ);
      const stockCx = (minX + maxX) / 2;
      const stockCy = (minY + maxY) / 2;
      const stockCz = (minZ + maxZ) / 2;

      // 1. Semi-transparent Stock Billet (Workpiece on Bed)
      const stockGeo = new THREE.BoxGeometry(stockW, stockD, stockH);
      const stockMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.18,
        roughness: 0.7,
        depthWrite: false
      });
      const stockMesh = new THREE.Mesh(stockGeo, stockMat);
      stockMesh.position.set(stockCx, stockCy, stockCz);
      stockMesh.renderOrder = 9990;
      this.visualizerGroup.add(stockMesh);

      // 2. Stock Wireframe Outline
      const stockEdgeGeo = new THREE.EdgesGeometry(stockGeo);
      const stockEdgeMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.65 });
      const stockEdges = new THREE.LineSegments(stockEdgeGeo, stockEdgeMat);
      stockMesh.add(stockEdges);

      // 3. Safe Clearance / Retract Plane wireframe (Z = maxZ + 5.0mm)
      const retractZ = maxZ + 5.0;
      const retVectors = [
        new THREE.Vector3(minX - 5, minY - 5, retractZ),
        new THREE.Vector3(maxX + 5, minY - 5, retractZ),
        new THREE.Vector3(maxX + 5, maxY + 5, retractZ),
        new THREE.Vector3(minX - 5, maxY + 5, retractZ),
        new THREE.Vector3(minX - 5, minY - 5, retractZ)
      ];
      const retGeo = new THREE.BufferGeometry().setFromPoints(retVectors);
      const retMat = new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 4, gapSize: 3, depthTest: false, transparent: true, opacity: 0.7 });
      const retLine = new THREE.Line(retGeo, retMat);
      retLine.computeLineDistances();
      this.visualizerGroup.add(retLine);

      // 4. Translucent Orange Mode Indicator Layer:
      // CNC / Laser (Top-Down): Translucent Orange Cap on TOP layer where milling begins
      // 3D Printing (Bottom-Up): Translucent Orange Base on BOTTOM layer where depositing begins on the bed
      const modePlaneGeo = new THREE.PlaneGeometry(stockW, stockD);
      const modePlaneMat = new THREE.MeshBasicMaterial({
        color: 0xf97316, // Vivid Orange
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const modePlane = new THREE.Mesh(modePlaneGeo, modePlaneMat);
      const modePlaneZ = isTopDown ? maxZ : minZ;
      modePlane.position.set(stockCx, stockCy, modePlaneZ);
      modePlane.name = isTopDown ? 'CLE_CNC_Top_Start_Surface' : 'CLE_3D_Bottom_Bed_Contact';
      this.visualizerGroup.add(modePlane);

      // Distinct orange perimeter outline border around start layer
      const modeBorderGeo = new THREE.EdgesGeometry(modePlaneGeo);
      const modeBorderMat = new THREE.LineBasicMaterial({
        color: 0xea580c,
        linewidth: 3,
        transparent: true,
        opacity: 0.95
      });
      const modeBorder = new THREE.LineSegments(modeBorderGeo, modeBorderMat);
      modeBorder.position.set(stockCx, stockCy, modePlaneZ);
      this.visualizerGroup.add(modeBorder);
    }

    container.add(this.visualizerGroup);

    // Set Gamepad mode to Design so left joystick immediately orbits the 3D scene around the slices!
    if (this.bridge.gamepad) {
      this.bridge.gamepad.setMode('design');
    }

    // Trigger JumpStart viewport redraw
    app.vp.dirty = true;
    if (app.vp.updateCamera) app.vp.updateCamera();
    if (app.vp.request) app.vp.request();

    console.log(`[CLE Slicer] Slices rendered: ${numLayers} toolpath passes visible in 3D viewport.`);
  }

  clearVisualizer() {
    const app = window.app || window.xe;
    if (this.visualizerGroup) {
      this.visualizerGroup.traverse((obj) => {
        if (obj.geometry) {
          try { obj.geometry.dispose(); } catch (e) {}
        }
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (m.map) { try { m.map.dispose(); } catch (e) {} }
            try { m.dispose(); } catch (e) {}
          });
        }
      });
      if (this.visualizerGroup.parent) {
        this.visualizerGroup.parent.remove(this.visualizerGroup);
      }
      this.visualizerGroup = null;
    }

    // Restore CAD body opacity and depthWrite
    if (app?.scene?.views) {
      for (const [id, view] of app.scene.views) {
        if (view.mesh && view.mesh.material) {
          const mats = Array.isArray(view.mesh.material) ? view.mesh.material : [view.mesh.material];
          mats.forEach(m => {
            if (m._cleOrigOpacity !== undefined) {
              m.opacity = m._cleOrigOpacity;
              m.transparent = m._cleOrigTransparent;
              m.depthWrite = m._cleOrigDepthWrite !== undefined ? m._cleOrigDepthWrite : true;
              delete m._cleOrigOpacity;
              delete m._cleOrigTransparent;
              delete m._cleOrigDepthWrite;
              m.needsUpdate = true;
            }
          });
        }
      }
    }

    const hud = document.getElementById('cle-slicer-hud');
    if (hud) hud.style.display = 'none';

    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // Filter layer visibility according to scrubbed layer index
  setPreviewLayer(targetIndex) {
    this.currentPreviewLayer = targetIndex;
    if (!this.visualizerGroup) return;

    const isTopDown = (this.mode === 'cnc' || this.mode === 'laser');

    this.visualizerGroup.children.forEach(mesh => {
      const lIdx = mesh.userData.layerIndex;
      if (targetIndex === -1) {
        mesh.visible = true; // Show all
      } else {
        // Show progression up to current layer
        mesh.visible = (lIdx <= targetIndex);
      }
    });

    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // Floating Layer & Export HUD
  mountLayerHUD() {
    let hud = document.getElementById('cle-slicer-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'cle-slicer-hud';
      hud.style.cssText = `
        position: fixed;
        bottom: 75px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--panel);
        color: var(--ink);
        padding: 8px 16px;
        border-radius: 8px;
        border: 1px solid var(--line);
        box-shadow: 0 8px 24px var(--shadow);
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 1000;
        font-family: var(--f);
        font-size: 12px;
      `;
      document.body.appendChild(hud);
    }

    const numLayers = this.slicedLayers.length;
    const isTopDown = (this.mode === 'cnc' || this.mode === 'laser');
    const modeLabel = isTopDown ? `${this.mode.toUpperCase()}: Top-Down` : '3D: Bottom-Up';

    hud.innerHTML = `
      <div style="font-weight:700; color:var(--accent);">${modeLabel}</div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button class="cle-btn" id="cle-hud-prev" style="padding:2px 8px;">&larr;</button>
        <span id="cle-hud-label" style="font-family:var(--f-mono); min-width:120px; text-align:center;">
          All (${numLayers} passes)
        </span>
        <button class="cle-btn" id="cle-hud-next" style="padding:2px 8px;">&rarr;</button>
      </div>
      <input type="range" id="cle-hud-slider" min="-1" max="${numLayers - 1}" value="-1" style="width:140px;">
      <button class="cle-btn" id="cle-hud-all">Show All</button>
      <button class="cle-btn" id="cle-hud-trace" style="background:#0284c7; color:#fff; font-weight:600;">Trace 3D</button>
      <div style="border-left:1px solid var(--line); height:18px;"></div>
      <button class="cle-btn" id="cle-hud-export" style="background:var(--accent); color:var(--on-accent); font-weight:600;">Export .NC</button>
      <button class="cle-btn" id="cle-hud-upload" style="background:var(--ok); color:#fff; font-weight:600;">To SD Card</button>
      <button class="cle-btn" id="cle-hud-close" style="padding:2px 6px;">&times;</button>
    `;

    hud.style.display = 'flex';

    const slider = document.getElementById('cle-hud-slider');
    const label = document.getElementById('cle-hud-label');

    const updateHUD = (val) => {
      slider.value = val;
      this.setPreviewLayer(parseInt(val, 10));
      if (val == -1) {
        label.textContent = `All (${numLayers} passes)`;
      } else {
        const curL = this.slicedLayers[val];
        label.textContent = `Pass ${parseInt(val, 10) + 1}/${numLayers} (Z=${curL ? curL.z.toFixed(2) : '--'}mm)`;
      }
    };

    slider.oninput = (e) => updateHUD(e.target.value);
    document.getElementById('cle-hud-prev').onclick = () => {
      let cur = parseInt(slider.value, 10);
      if (cur > 0) updateHUD(cur - 1);
      else if (cur === -1) updateHUD(numLayers - 1);
    };
    document.getElementById('cle-hud-next').onclick = () => {
      let cur = parseInt(slider.value, 10);
      if (cur < numLayers - 1) updateHUD(cur + 1);
    };
    document.getElementById('cle-hud-all').onclick = () => updateHUD(-1);
    document.getElementById('cle-hud-export').onclick = () => this.exportGCodeFile();
    document.getElementById('cle-hud-upload').onclick = () => this.uploadGCodeToSD();
    const traceBtn = document.getElementById('cle-hud-trace');
    if (traceBtn) {
      traceBtn.onclick = () => {
        if (this.isSimulating) {
          this.stopTraceSimulation();
          traceBtn.textContent = 'Trace 3D';
        } else {
          this.startTraceSimulation(2);
          traceBtn.textContent = 'Stop Trace';
        }
      };
    }
    document.getElementById('cle-hud-close').onclick = () => { this.clearVisualizer(); };
  }

  // --- Grayscale Heightmap to Slice Conversion (Original CLE Feature) ---
  // Converts 8-bit or 16-bit grayscale images to multi-layer toolpath slices with brightness, contrast, gamma
  async sliceGrayscaleHeightmap(imageSource = null, options = {}) {
    const brightness = options.brightness !== undefined ? options.brightness : 0;
    const contrast = options.contrast !== undefined ? options.contrast : 0;
    const gamma = options.gamma !== undefined ? options.gamma : 1.0;
    const sliceCount = Math.max(2, Math.min(64, options.sliceCount || 16));
    const bitDepth = options.bitDepth === '16bit' ? '16bit' : '8bit';
    const targetW = options.targetWidth || 100.0;
    const targetD = options.targetHeight || 100.0;
    const depthMm = options.depthMm || 4.0;
    const mode = options.mode || this.mode || 'cnc';
    this.mode = mode;

    this.bridge.notify(`Generating ${sliceCount} Grayscale slices (${bitDepth}, ${mode.toUpperCase()})...`, 'info');

    // 1. Render imageSource to offscreen canvas
    const cols = 80;
    const rows = 80;
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');

    if (imageSource instanceof HTMLImageElement || imageSource instanceof HTMLCanvasElement) {
      ctx.drawImage(imageSource, 0, 0, cols, rows);
    } else {
      // Default radial gradient relief pattern for instant visualization
      const grad = ctx.createRadialGradient(cols / 2, rows / 2, 4, cols / 2, rows / 2, cols / 2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#888888');
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cols, rows);
    }

    const imgData = ctx.getImageData(0, 0, cols, rows).data;
    const heightMap = new Float32Array(cols * rows);
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast) || 1);

    for (let i = 0; i < cols * rows; i++) {
      const idx = i * 4;
      let r = imgData[idx];
      let g = imgData[idx + 1];
      let b = imgData[idx + 2];

      let L = 0.299 * r + 0.587 * g + 0.114 * b;
      L = L + (brightness * 2.55);
      L = factor * (L - 128) + 128;
      L = Math.max(0, Math.min(255, L));

      let v = L / 255.0;
      v = Math.pow(v, 1.0 / Math.max(0.1, gamma));

      if (bitDepth === '8bit') {
        v = Math.round(v * 255) / 255.0;
      } else {
        v = Math.round(v * 65535) / 65535.0;
      }
      heightMap[i] = v;
    }

    // 2. Build Slices based on Mode
    this.slicedLayers = [];
    const isTopDown = (mode === 'cnc' || mode === 'laser');
    const xStep = targetW / cols;
    const yStep = targetD / rows;

    for (let s = 0; s < sliceCount; s++) {
      const progress = s / Math.max(1, sliceCount - 1);
      let layerZ;
      if (isTopDown) {
        layerZ = -progress * depthMm;
      } else {
        layerZ = 1.0 + progress * depthMm;
      }

      const layer = {
        index: s,
        z: layerZ,
        toolNumber: s === 0 ? 1 : (s > sliceCount / 2 ? 2 : 1),
        points: []
      };

      for (let r = 0; r < rows; r += 2) {
        const yPos = r * yStep;
        const forward = (r / 2) % 2 === 0;
        const startC = forward ? 0 : cols - 1;
        const endC = forward ? cols : -1;
        const stepC = forward ? 1 : -1;

        let inCut = false;
        for (let c = startC; c !== endC; c += stepC) {
          const val = heightMap[r * cols + c];
          const xPos = c * xStep;

          const shouldCut = isTopDown ? (val >= (1.0 - progress)) : (val >= progress);

          if (shouldCut) {
            if (!inCut) {
              layer.points.push({ x: xPos, y: yPos, z: layerZ, isRapid: true });
              inCut = true;
            }
            layer.points.push({ x: xPos, y: yPos, z: layerZ, isRapid: false });
          } else if (inCut) {
            layer.points.push({ x: xPos, y: yPos, z: layerZ + (isTopDown ? 2.0 : 0.5), isRapid: true });
            inCut = false;
          }
        }
      }

      if (layer.points.length > 1) {
        this.slicedLayers.push(layer);
      }
    }

    // Generate G-code lines for the grayscale slices
    const gcode = [];
    gcode.push(`; === CLEJS Grayscale Slices ===`);
    gcode.push(`; Mode: ${mode.toUpperCase()} | Passes: ${this.slicedLayers.length} | BitDepth: ${bitDepth}`);
    gcode.push(`G21 G90 G17`);
    gcode.push(`G0 Z10.000 F1000`);
    let currentTool = 0;

    for (const l of this.slicedLayers) {
      if (l.toolNumber && l.toolNumber !== currentTool) {
        currentTool = l.toolNumber;
        gcode.push(`; --- Tool Change to Tool #${currentTool} ---`);
        gcode.push(`M5`);
        gcode.push(`G0 Z20.000 F800`);
        gcode.push(`M6 T${currentTool}`);
        gcode.push(mode === 'laser' ? 'M3 S1000' : 'M3 S12000');
        gcode.push(`G4 P2`);
      }
      gcode.push(`; Layer Z = ${l.z.toFixed(3)}`);
      for (const p of l.points) {
        if (p.isRapid) {
          gcode.push(`G0 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} Z${p.z.toFixed(3)} F3000`);
        } else {
          gcode.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} Z${p.z.toFixed(3)} F1200`);
        }
      }
    }
    gcode.push(`M5`);
    gcode.push(`G0 Z20.000 F1000`);
    this.rawGCode = gcode.join('\n');

    this.renderSlicedStackToVisualizer();
    this.mountLayerHUD();
    this.bridge.notify(`Grayscale Sliced: ${this.slicedLayers.length} passes rendered in 3D visualizer!`, 'ok');
    return this.slicedLayers;
  }

  showSlicerHUD() {
    this.mountLayerHUD();
  }

  // --- 3D Toolpath Trace Simulator ---
  startTraceSimulation(speedMultiplier = 2) {
    if (!this.slicedLayers || this.slicedLayers.length === 0) {
      this.bridge.notify('Slice a model first to run trace simulator.', 'error');
      return;
    }

    this.stopTraceSimulation();
    this.isSimulating = true;
    this.simSpeed = speedMultiplier;

    const allPts = [];
    this.slicedLayers.forEach(l => {
      l.points.forEach(p => allPts.push({ ...p, layerIndex: l.index }));
    });

    if (allPts.length === 0) return;

    let ptIdx = 0;
    const step = () => {
      if (!this.isSimulating) return;

      const pt = allPts[ptIdx];
      if (pt && this.bridge.bed) {
        this.bridge.bed.updateToolCursor({ X: pt.x, Y: pt.y, Z: pt.z });
      }

      ptIdx += Math.max(1, Math.floor(this.simSpeed));
      if (ptIdx >= allPts.length) {
        this.isSimulating = false;
        this.bridge.notify('Trace simulation complete.', 'ok');
        const traceBtn = document.getElementById('cle-hud-trace');
        if (traceBtn) traceBtn.textContent = 'Trace 3D';
        return;
      }

      this._simAnimId = requestAnimationFrame(step);
    };

    this._simAnimId = requestAnimationFrame(step);
    this.bridge.notify(`Trace simulation running (${this.simSpeed}x speed)...`, 'info');
  }

  stopTraceSimulation() {
    this.isSimulating = false;
    if (this._simAnimId) {
      cancelAnimationFrame(this._simAnimId);
      this._simAnimId = null;
    }
  }

  exportGCodeFile() {
    if (!this.rawGCode) {
      this.bridge.notify('Slice a model first before exporting.', 'error');
      return;
    }
    const blob = new Blob([this.rawGCode], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const projName = window.xe?.doc?.name || 'JumpStart_Part';
    a.download = `${projName}_${this.mode}.nc`;
    a.click();
    this.bridge.notify(`Exported ${projName}_${this.mode}.nc`, 'ok');
  }

  async uploadGCodeToSD() {
    if (!this.rawGCode) {
      this.bridge.notify('Slice a model first before uploading.', 'error');
      return;
    }
    const projName = window.xe?.doc?.name || 'JumpStart_Part';
    const filename = `${projName}_${this.mode}.nc`;
    this.bridge.notify(`Uploading ${filename} to FluidNC SD Card...`);
    await this.bridge.fluidnc.uploadFileToSD(filename, this.rawGCode);
  }
}
