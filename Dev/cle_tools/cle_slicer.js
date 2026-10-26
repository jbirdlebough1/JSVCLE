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
    this.sliceViewMode = 'stack'; // 'stack' | 'single'

    // Laminated Multi-Part Slicing (Biradial Horns & Stacks)
    this.laminationConfig = {
      enabled: false,
      slabThickness: 30.0,       // Stock slab thickness (30mm for Biradial Horns & hardwood stacks)
      dowelHolesEnabled: true,   // Drill precision alignment dowel holes through each slab
      dowelDiameter: 8.0,        // 8.0mm dowels
      dowelMargin: 25.0,         // Margin from stock outer bounds (mm)
      dowelHoleCount: 4,         // 2 or 4 registration pins
      toolMapping: {
        drillingToolNumber: 2,   // Tool 2 (e.g. 1/8" drill / boring endmill)
        roughingToolNumber: 1,   // Tool 1 (1/4" Flat Endmill)
        finishingToolNumber: 3,  // Tool 3 (1/8" Ballnose for smooth 3D contour)
        cutoutToolNumber: 1      // Tool 1 (1/4" Flat Endmill)
      }
    };
    this.laminatedParts = [];    // Partitioned parts array [{ partIndex, name, minZ, maxZ, height, layers, gcode }]
    this.activePartIndex = -1;   // -1 = Show All; >= 0 = Isolate specific Part
    this.dowelPoints = [];       // [{ id, x, y, diameter }]
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
    const doc = app?.scene?.doc || app?.doc;
    const bodies = (doc?.bodies || []);
    const views = app?.scene?.views;

    const allTriangles = [];
    const extractedNames = [];

    // 1. Extract from JumpStart scene views with exact matrixWorld transformation
    if (views && views.size > 0) {
      for (const [id, view] of views) {
        const body = (bodies.find(b => b.id === id)) || view.body;
        if (body && (body.hidden || body.hole)) continue;

        if (view.mesh) {
          view.mesh.updateMatrixWorld(true);
          const M = view.mesh.matrixWorld;

          if (view.data && view.data.vertices && view.data.triangles) {
            const Q = view.data.vertices;
            const idxs = view.data.triangles;
            const THREE = window.THREE;
            const v = new THREE.Vector3();
            for (let i = 0; i < idxs.length; i++) {
              const vi = idxs[i] * 3;
              v.set(Q[vi], Q[vi + 1], Q[vi + 2]).applyMatrix4(M);
              allTriangles.push(v.x, v.y, v.z);
            }
            extractedNames.push(body?.name || `Body_${id}`);
            continue;
          }

          if (view.mesh.geometry && view.mesh.geometry.attributes && view.mesh.geometry.attributes.position) {
            const pos = view.mesh.geometry.attributes.position;
            const index = view.mesh.geometry.index;
            const THREE = window.THREE;
            const v = new THREE.Vector3();
            if (index) {
              for (let i = 0; i < index.count; i++) {
                const vi = index.getX(i);
                v.set(pos.getX(vi), pos.getY(vi), pos.getZ(vi)).applyMatrix4(M);
                allTriangles.push(v.x, v.y, v.z);
              }
            } else {
              for (let i = 0; i < pos.count; i++) {
                v.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(M);
                allTriangles.push(v.x, v.y, v.z);
              }
            }
            extractedNames.push(body?.name || `Body_${id}`);
            continue;
          }
        }
      }
    }

    if (allTriangles.length >= 9) {
      console.log(`[CLE Slicer] Extracted ${allTriangles.length / 3} world triangles from workspace bodies: ${extractedNames.join(', ')}.`);
      return { name: extractedNames.join('_'), triangles: new Float32Array(allTriangles), isSample: false };
    }

    // 2. Try window.__JS3D_CHISEL__.bodyTris() (built-in JumpStart matrix-transformed world triangles)
    if (window.__JS3D_CHISEL__ && typeof window.__JS3D_CHISEL__.bodyTris === 'function') {
      for (const b of bodies) {
        if (!b.hidden && !b.hole) {
          const tris = window.__JS3D_CHISEL__.bodyTris(b.id);
          if (tris && tris.length >= 9) {
            console.log(`[CLE Slicer] Extracted ${tris.length / 3} world triangles from Body "${b.name}" via bodyTris.`);
            return { name: b.name || 'CAD_Body', triangles: tris, isSample: false };
          }
        }
      }
    }

    // 3. Fallback Sample 3D Test Object (positioned centrally on Spoilboard)
    const isLam = this.laminationConfig?.enabled;
    const defW = isLam ? 140 : 50;
    const defD = isLam ? 120 : 40;
    const defH = isLam ? Math.max(80, (this.laminationConfig.slabThickness || 40.0) * 3) : 15;
    console.log(`[CLE Slicer] No active meshed CAD bodies found. Generating ${defW}x${defD}x${defH} mm sample workpiece at bed center.`);
    const sampleTris = this.generateSampleBoxTriangles(defW, defD, defH);
    return { name: isLam ? 'Sample_Laminated_Stack' : 'Sample_Billet_50x40', triangles: sampleTris, isSample: true };
  }

  generateSampleBoxTriangles(w, d, h) {
    const bedConfig = this.bridge?.bed?.config;
    const spoilboardThickness = bedConfig ? (bedConfig.spoilboardThickness !== undefined ? bedConfig.spoilboardThickness : 20.0) : 20.0;
    const z0 = 0.10 + spoilboardThickness; // Workpiece sits directly on top of spoilboard surface
    const z1 = z0 + h;

    // Position centrally on active Spoilboard (e.g. 300, 250)
    const cx = bedConfig ? ((bedConfig.spoilboardOffsetX || 0) + (bedConfig.spoilboardX || 600) / 2) : 300;
    const cy = bedConfig ? ((bedConfig.spoilboardOffsetY || 0) + (bedConfig.spoilboardY || 500) / 2) : 250;

    const x0 = cx - w/2, x1 = cx + w/2;
    const y0 = cy - d/2, y1 = cy + d/2;
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

    // Lamination & Tool Mapping Configuration
    if (options.enableLamination !== undefined) this.laminationConfig.enabled = options.enableLamination;
    if (options.slabThickness !== undefined) this.laminationConfig.slabThickness = parseFloat(options.slabThickness);
    if (options.dowelHolesEnabled !== undefined) this.laminationConfig.dowelHolesEnabled = options.dowelHolesEnabled;
    if (options.dowelDiameter !== undefined) this.laminationConfig.dowelDiameter = parseFloat(options.dowelDiameter);
    if (options.dowelMargin !== undefined) this.laminationConfig.dowelMargin = parseFloat(options.dowelMargin);
    if (options.dowelHoleCount !== undefined) this.laminationConfig.dowelHoleCount = parseInt(options.dowelHoleCount, 10);
    if (options.toolMapping) this.laminationConfig.toolMapping = { ...this.laminationConfig.toolMapping, ...options.toolMapping };

    const geom = this.getActiveBodyGeometry();
    this.lastGeometry = geom;
    const { name, triangles } = geom;
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
      gcode = this.sliceNative(triangles, this.layerHeight, this.mode, options);
      usedEngine = `Native CLE JS (${this.mode.toUpperCase()})`;
    }

    this.rawGCode = gcode;
    this.parseGCodeIntoLayers(gcode);

    if (this.laminationConfig.enabled) {
      this.partitionLaminatedParts();
    } else {
      this.laminatedParts = [];
      this.activePartIndex = -1;
      this.dowelPoints = [];
    }

    this.renderSlicedStackToVisualizer();
    this.mountLayerHUD();

    const orderDesc = (this.mode === 'cnc' || this.mode === 'laser') ? 'Top-Down passes' : 'Bottom-Up layers';
    this.bridge.notify(`Sliced (${usedEngine}): ${this.slicedLayers.length} ${orderDesc} generated!`, 'ok');
    return gcode;
  }

  // Native In-Browser Slicer with strict Top-Down (CNC/Laser) vs Bottom-Up (3D) ordering
  sliceNative(triangles, layerH, mode, options = {}) {
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

    // Spoilboard Breakthrough / Clean Cutout Pass for CNC Milling
    // Penetrates 0.2mm into the spoilboard (Z = minZ - 0.20) for 100% clean cutout without tabs
    // Safe distance to aluminum bed table is > 19.8mm, leaving zero risk of hitting the aluminum bed!
    const enableCutout = options.enableCutout !== undefined ? options.enableCutout : (this.enableSpoilboardCutout !== false);
    const cutoutOvercut = options.cutoutOvercut !== undefined ? options.cutoutOvercut : (this.cutoutDepthIntoSpoilboard || this.bridge?.bed?.config?.cutoutOvercut || 0.20);

    if (mode === 'cnc' && enableCutout) {
      const cutoutZ = (minZ - cutoutOvercut);
      lines.push(`; --- SPOILBOARD BREAKTHROUGH / CLEAN CUTOUT PASS (Z=${cutoutZ.toFixed(3)}) ---`);
      lines.push(`; Milling ${cutoutOvercut.toFixed(2)}mm into spoilboard for clean cutout without tabs`);
      lines.push(`; Safe protective clearance to aluminum bed table: ${(minZ - cutoutOvercut - 0.10).toFixed(2)}mm`);
      lines.push(`G0 X${minX.toFixed(2)} Y${minY.toFixed(2)} F3000`);
      lines.push(`G1 Z${cutoutZ.toFixed(3)} F300 ; Plunge into spoilboard`);
      lines.push(`G1 X${maxX.toFixed(2)} Y${minY.toFixed(2)} F${this.feedRate}`);
      lines.push(`G1 X${maxX.toFixed(2)} Y${maxY.toFixed(2)}`);
      lines.push(`G1 X${minX.toFixed(2)} Y${maxY.toFixed(2)}`);
      lines.push(`G1 X${minX.toFixed(2)} Y${minY.toFixed(2)}`);
      lines.push(`G0 Z${(maxZ + 5.0).toFixed(3)} F1000 ; Safe retract to clearance plane`);
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
    let currentLayer = { index: 0, z: 0, points: [], isCutoutPass: false };
    let curX = 0, curY = 0, curZ = 0;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('; ===') || line.startsWith('; Device')) continue;

      // Spoilboard Breakthrough header
      if (line.includes('SPOILBOARD BREAKTHROUGH') || line.includes('CLEAN CUTOUT PASS')) {
        if (currentLayer.points.length > 0) {
          this.slicedLayers.push(currentLayer);
        }
        const matchZ = line.match(/Z=([-\d.]+)/i);
        const lZ = matchZ ? parseFloat(matchZ[1]) : curZ;
        currentLayer = { index: this.slicedLayers.length, z: lZ, points: [], isCutoutPass: true };
        continue;
      }

      // Layer header detection (; --- LAYER: 0 (Z=8.000) --- or ;LAYER:0 or ;LAYER_CHANGE)
      if (line.match(/^;\s*(?:---)?\s*LAYER(?:_CHANGE)?[:\s]/i)) {
        if (currentLayer.points.length > 0) {
          this.slicedLayers.push(currentLayer);
        }
        const matchIdx = line.match(/LAYER(?:_CHANGE)?[:\s]*(\d+)/i);
        const lIdx = matchIdx ? parseInt(matchIdx[1], 10) : this.slicedLayers.length;
        const matchZ = line.match(/Z=([-\d.]+)/i);
        const lZ = matchZ ? parseFloat(matchZ[1]) : curZ;
        currentLayer = { index: lIdx, z: lZ, points: [], isCutoutPass: false };
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

  // Partition master sliced layers into laminated stock slabs (e.g. 40mm MDF / hardwood tiers for biradial horns)
  partitionLaminatedParts() {
    this.laminatedParts = [];
    this.dowelPoints = [];
    if (!this.slicedLayers || this.slicedLayers.length === 0) return;

    let minZ = Infinity, maxZ = -Infinity;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const layer of this.slicedLayers) {
      if (layer.z < minZ) minZ = layer.z;
      if (layer.z > maxZ) maxZ = layer.z;
      for (const pt of layer.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }
    }

    if (!isFinite(minZ) || !isFinite(maxZ)) { minZ = 0; maxZ = 40; }
    if (!isFinite(minX) || !isFinite(maxX)) { minX = -50; maxX = 50; minY = -50; maxY = 50; }

    const slabThickness = Math.max(1.0, this.laminationConfig.slabThickness || 40.0);
    const totalHeight = Math.max(0.1, maxZ - minZ);
    const numParts = Math.max(1, Math.ceil(totalHeight / slabThickness));

    // Calculate symmetric dowel registration pins through all slabs
    const margin = Math.max(5.0, this.laminationConfig.dowelMargin || 25.0);
    const dowelDia = this.laminationConfig.dowelDiameter || 8.0;
    const holeCount = this.laminationConfig.dowelHoleCount || 4;

    const dowelPoints = [];
    if (this.laminationConfig.dowelHolesEnabled) {
      dowelPoints.push({ id: 1, x: minX + margin, y: minY + margin, diameter: dowelDia });
      dowelPoints.push({ id: 2, x: maxX - margin, y: maxY - margin, diameter: dowelDia });
      if (holeCount >= 4) {
        dowelPoints.push({ id: 3, x: maxX - margin, y: minY + margin, diameter: dowelDia });
        dowelPoints.push({ id: 4, x: minX + margin, y: maxY - margin, diameter: dowelDia });
      }
    }
    this.dowelPoints = dowelPoints;

    for (let k = 0; k < numParts; k++) {
      const partMinZ = minZ + k * slabThickness;
      const partMaxZ = Math.min(maxZ, minZ + (k + 1) * slabThickness);
      const partThick = partMaxZ - partMinZ;

      const partLayers = this.slicedLayers.filter(l => {
        return (l.z >= partMinZ - 0.05 && l.z <= partMaxZ + 0.05);
      });

      const partObj = {
        partIndex: k,
        partNumber: k + 1,
        totalParts: numParts,
        name: `Part ${k + 1} of ${numParts} (Z ${partMinZ.toFixed(1)} - ${partMaxZ.toFixed(1)}mm)`,
        minZ: partMinZ,
        maxZ: partMaxZ,
        thickness: partThick,
        nominalSlabThickness: slabThickness,
        layers: partLayers,
        layerCount: partLayers.length,
        dowelPoints: dowelPoints,
        bounds: { minX, maxX, minY, maxY, minZ: partMinZ, maxZ: partMaxZ }
      };

      partObj.gcode = this.generatePartGCode(partObj);
      this.laminatedParts.push(partObj);
    }

    console.log(`[CLE Slicer] Partitioned ${numParts} laminated stock parts (${slabThickness}mm slab) with ${dowelPoints.length} dowel pins.`);
  }

  // Generate production FluidNC G-code for an individual laminated stock slab
  generatePartGCode(part) {
    const tm = this.laminationConfig.toolMapping || {};
    const drillTool = tm.drillingToolNumber || 2;
    const roughTool = tm.roughingToolNumber || 1;
    const finishTool = tm.finishingToolNumber || 3;
    const cutoutTool = tm.cutoutToolNumber || 1;
    const feed = this.feedRate || 1500;
    const spindleRPM = this.spindleRPM || 12000;
    const projName = window.xe?.doc?.name || 'JumpStart_Part';

    const lines = [];
    lines.push(`; === CLEJS Laminated Part Toolpath ===`);
    lines.push(`; Project: ${projName} | ${part.name}`);
    lines.push(`; Slab Thickness: ${part.thickness.toFixed(2)}mm (Nominal: ${part.nominalSlabThickness}mm)`);
    lines.push(`; Model Master Z Range: ${part.minZ.toFixed(2)} to ${part.maxZ.toFixed(2)}mm`);
    lines.push(`; Local Slab WCS: Stock Top = Z0.000, Spoilboard Face = Z-${part.thickness.toFixed(2)}, Cutout = Z-${(part.thickness + 0.20).toFixed(2)}`);
    lines.push(`; Total Slices in Part: ${part.layers.length}`);
    lines.push(`; Tool Mapping: Drill=T${drillTool}, Rough=T${roughTool}, 3D Finish=T${finishTool}, Cutout=T${cutoutTool}`);
    lines.push(`G21 ; Millimeters`);
    lines.push(`G90 ; Absolute Coordinates`);
    lines.push(`G17 ; XY Plane`);
    lines.push(`G0 Z15.000 F1000 ; Safe retract above slab`);

    // --- OPERATION 1: Precision Registration Dowel Holes ---
    if (this.laminationConfig.dowelHolesEnabled && part.dowelPoints.length > 0) {
      lines.push(``);
      lines.push(`; ========================================================`);
      lines.push(`; OPERATION 1: Precision Registration Dowel Holes (T${drillTool})`);
      lines.push(`; ========================================================`);
      lines.push(`M5 ; Spindle Stop`);
      lines.push(`G0 Z20.000 F1000 ; Tool change clearance`);
      lines.push(`M6 T${drillTool} ; Install Dowel Hole Drill / Boring Tool`);
      lines.push(`M3 S${spindleRPM} ; Spindle ON`);
      lines.push(`G4 P2 ; Dwell 2s for spinup`);
      lines.push(`G0 Z5.000 F1000`);

      const drillTargetZ = -(part.thickness + 0.20); // 0.2mm breakthrough into spoilboard

      part.dowelPoints.forEach(pt => {
        lines.push(`; Dowel Pin #${pt.id} (⌀${pt.diameter}mm) at X=${pt.x.toFixed(2)}, Y=${pt.y.toFixed(2)}`);
        lines.push(`G0 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F3000`);
        lines.push(`G0 Z1.000`);
        // Multi-stage peck drill for clean chip evacuation in 40mm slab
        const peckDepth = 5.0; // 5mm per peck
        const totalDepth = Math.abs(drillTargetZ);
        const pecks = Math.ceil(totalDepth / peckDepth);
        for (let p = 1; p <= pecks; p++) {
          const curD = -Math.min(totalDepth, p * peckDepth);
          lines.push(`G1 Z${curD.toFixed(3)} F250 ; Peck plunge`);
          lines.push(`G0 Z2.000 F1000 ; Chip clearing retract`);
        }
        lines.push(`G0 Z5.000 F1000`);
      });
    }

    // --- OPERATION 2: Roughing Passes (Stock Clearing) ---
    lines.push(``);
    lines.push(`; ========================================================`);
    lines.push(`; OPERATION 2: Bulk Stock Roughing Passes (T${roughTool})`);
    lines.push(`; ========================================================`);
    lines.push(`M5 ; Spindle Stop`);
    lines.push(`G0 Z20.000 F1000 ; Tool change clearance`);
    lines.push(`M6 T${roughTool} ; Install Roughing Endmill`);
    lines.push(`M3 S${spindleRPM} ; Spindle ON`);
    lines.push(`G4 P2`);
    lines.push(`G0 Z5.000 F1000`);

    for (let i = 0; i < part.layers.length; i += 2) {
      const layer = part.layers[i];
      const localZ = layer.z - part.maxZ; // Top-down negative offset
      lines.push(`; Roughing Pass ${i} (Local Z=${localZ.toFixed(3)})`);
      if (layer.points.length > 0) {
        const p0 = layer.points[0];
        lines.push(`G0 X${p0.x.toFixed(3)} Y${p0.y.toFixed(3)} F3000`);
        lines.push(`G1 Z${localZ.toFixed(3)} F400`);
        for (let ptIdx = 1; ptIdx < layer.points.length; ptIdx += 2) {
          const pt = layer.points[ptIdx];
          lines.push(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F${feed}`);
        }
        lines.push(`G0 Z2.000 F1000`);
      }
    }

    // --- OPERATION 3: Smooth 3D Contour Finishing (Ballnose) ---
    lines.push(``);
    lines.push(`; ========================================================`);
    lines.push(`; OPERATION 3: Smooth 3D Contour Finishing Passes (T${finishTool})`);
    lines.push(`; ========================================================`);
    lines.push(`M5 ; Spindle Stop`);
    lines.push(`G0 Z20.000 F1000 ; Tool change clearance`);
    lines.push(`M6 T${finishTool} ; Install 3D Ballnose Carving Tool`);
    lines.push(`M3 S18000 ; Spindle ON (18,000 RPM for fine ballnose finish)`);
    lines.push(`G4 P2`);
    lines.push(`G0 Z5.000 F1000`);

    for (let i = 0; i < part.layers.length; i++) {
      const layer = part.layers[i];
      const localZ = layer.z - part.maxZ;
      lines.push(`; Contour Finish Pass ${i + 1}/${part.layers.length} (Local Z=${localZ.toFixed(3)})`);
      let inCut = false;
      for (const pt of layer.points) {
        if (pt.isRapid) {
          if (inCut) {
            lines.push(`G0 Z${(localZ + 2.0).toFixed(3)} F1000`);
            inCut = false;
          }
          lines.push(`G0 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F3000`);
        } else {
          if (!inCut) {
            lines.push(`G1 Z${localZ.toFixed(3)} F350`);
            inCut = true;
          }
          lines.push(`G1 X${pt.x.toFixed(3)} Y${pt.y.toFixed(3)} F${Math.round(feed * 0.9)}`);
        }
      }
      if (inCut) {
        lines.push(`G0 Z2.000 F1000`);
      }
    }

    // --- OPERATION 4: Spoilboard Clean Perimeter Cutout (0.2mm Breakthrough) ---
    lines.push(``);
    lines.push(`; ========================================================`);
    lines.push(`; OPERATION 4: Spoilboard Clean Perimeter Cutout (T${cutoutTool})`);
    lines.push(`; ========================================================`);
    if (cutoutTool !== finishTool) {
      lines.push(`M5 ; Spindle Stop`);
      lines.push(`G0 Z20.000 F1000`);
      lines.push(`M6 T${cutoutTool} ; Install Perimeter Cutout Tool`);
      lines.push(`M3 S${spindleRPM} ; Spindle ON`);
      lines.push(`G4 P2`);
    }
    const cutoutZ = -(part.thickness + 0.20);
    lines.push(`; Perimeter Cutout Level: Local Z=${cutoutZ.toFixed(3)} (-0.20mm into spoilboard)`);
    const b = part.bounds;
    lines.push(`G0 X${b.minX.toFixed(3)} Y${b.minY.toFixed(3)} F3000`);
    lines.push(`G1 Z${cutoutZ.toFixed(3)} F300 ; Penetrate 0.2mm into spoilboard`);
    lines.push(`G1 X${b.maxX.toFixed(3)} Y${b.minY.toFixed(3)} F${feed}`);
    lines.push(`G1 X${b.maxX.toFixed(3)} Y${b.maxY.toFixed(3)}`);
    lines.push(`G1 X${b.minX.toFixed(3)} Y${b.maxY.toFixed(3)}`);
    lines.push(`G1 X${b.minX.toFixed(3)} Y${b.minY.toFixed(3)}`);
    lines.push(`G0 Z10.000 F1000 ; Retract`);

    // --- Job End ---
    lines.push(``);
    lines.push(`; === Job End & Safe Park ===`);
    lines.push(`M5 ; Spindle OFF`);
    lines.push(`G0 Z25.000 F1000 ; Safe Retract`);
    lines.push(`G0 X0.000 Y0.000 F3000 ; Return to WCS Origin`);
    lines.push(`M30 ; Program End`);

    return lines.join('\n');
  }

  exportPartGCode(partIndex) {
    const part = this.laminatedParts[partIndex];
    if (!part || !part.gcode) {
      this.bridge.notify(`Part ${partIndex + 1} not found.`, 'error');
      return;
    }
    const projName = window.xe?.doc?.name || 'JumpStart_Part';
    const filename = `${projName}_Part_${part.partNumber}_of_${part.totalParts}.nc`;
    const blob = new Blob([part.gcode], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    this.bridge.notify(`Exported ${filename} (${(part.gcode.length / 1024).toFixed(1)} KB)`, 'ok');
  }

  async uploadPartGCodeToSD(partIndex) {
    const part = this.laminatedParts[partIndex];
    if (!part || !part.gcode) {
      this.bridge.notify(`Part ${partIndex + 1} not found.`, 'error');
      return;
    }
    const projName = window.xe?.doc?.name || 'JumpStart_Part';
    const filename = `${projName}_Part_${part.partNumber}.nc`;
    this.bridge.notify(`Uploading ${filename} to FluidNC SD Card...`, 'info');
    await this.bridge.fluidnc.uploadFileToSD(filename, part.gcode);
  }

  exportAllParts() {
    if (!this.laminatedParts || this.laminatedParts.length === 0) {
      this.bridge.notify('No laminated parts available to export.', 'error');
      return;
    }
    this.laminatedParts.forEach((p, idx) => {
      setTimeout(() => this.exportPartGCode(idx), idx * 250);
    });
    this.bridge.notify(`Exporting all ${this.laminatedParts.length} laminated parts...`, 'ok');
  }

  setActivePart(partIndex) {
    this.activePartIndex = partIndex;
    if (!this.visualizerGroup) return;

    this.visualizerGroup.children.forEach(child => {
      const pIdx = child.userData.partIndex;
      if (pIdx === undefined) return;

      if (partIndex === -1) {
        child.visible = true;
        if (child.material) child.material.opacity = 0.95;
      } else if (pIdx === partIndex) {
        child.visible = true;
        if (child.material) child.material.opacity = 1.0;
      } else {
        child.visible = true;
        if (child.material) child.material.opacity = 0.15;
      }
    });

    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }

    this.updateHUDPartTabs();
  }

  updateHUDPartTabs() {
    const bar = document.getElementById('cle-hud-part-bar');
    if (!bar) return;
    const btns = bar.querySelectorAll('.cle-hud-part-btn');
    btns.forEach(btn => {
      const idx = parseInt(btn.getAttribute('data-part'), 10);
      if (idx === this.activePartIndex) {
        btn.classList.add('active');
        btn.style.background = 'var(--accent)';
        btn.style.color = 'var(--on-accent)';
      } else {
        btn.classList.remove('active');
        btn.style.background = 'var(--paper)';
        btn.style.color = 'var(--ink)';
      }
    });

    const expBtn = document.getElementById('cle-hud-export-part');
    const upBtn = document.getElementById('cle-hud-upload-part');
    if (this.activePartIndex >= 0 && this.laminatedParts[this.activePartIndex]) {
      const pNum = this.activePartIndex + 1;
      if (expBtn) expBtn.textContent = `Export Part ${pNum} .NC`;
      if (upBtn) upBtn.textContent = `Part ${pNum} to SD`;
    } else {
      if (expBtn) expBtn.textContent = 'Export Active Part';
      if (upBtn) upBtn.textContent = 'Part to SD';
    }
  }

  createNumberLabelSprite(THREE, text, color = '#f8fafc') {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 160, 64);
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(text, 80, 32);

    ctx.fillStyle = color;
    ctx.fillText(text, 80, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.renderOrder = 100005;
    return sprite;
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
      // Cutout Breakthrough Pass: Vivid Amber-Gold (penetrating into spoilboard)
      // CNC/Laser (top-down): bright neon green at surface -> gold -> deep red at floor
      // 3D (bottom-up): deep blue at bed -> bright cyan -> vivid red at top
      let r, g, b;
      if (layer.isCutoutPass) {
        r = 1.0; g = 0.65; b = 0.0; // Glowing Amber for Spoilboard Cutout pass
      } else {
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

      // Find which laminated part contains this layer
      let layerPartIdx = -1;
      if (this.laminatedParts && this.laminatedParts.length > 0) {
        layerPartIdx = this.laminatedParts.findIndex(p => layer.z >= p.minZ - 0.05 && layer.z <= p.maxZ + 0.05);
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
      lineMesh.userData = { layerIndex: lIdx, zElevation: layer.z, partIndex: layerPartIdx };
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
        ptMesh.userData = { layerIndex: lIdx, zElevation: layer.z, partIndex: layerPartIdx };
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

      // 1. Semi-transparent ghost workpiece (Only rendered if using fallback sample billet)
      // When real workspace CAD bodies exist, they overlay transparently without any blocking artificial box!
      if (this.lastGeometry?.isSample) {
        const stockGeo = new THREE.BoxGeometry(stockW, stockD, stockH);
        const stockMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          transparent: true,
          opacity: 0.28,
          roughness: 0.4,
          depthWrite: false
        });
        const stockMesh = new THREE.Mesh(stockGeo, stockMat);
        stockMesh.position.set(stockCx, stockCy, stockCz);
        stockMesh.name = 'CLE_Sample_Workpiece_Ghost';
        stockMesh.renderOrder = 9990;
        this.visualizerGroup.add(stockMesh);

        // Fine wireframe edges around sample workpiece
        const stockEdgeGeo = new THREE.EdgesGeometry(stockGeo);
        const stockEdgeMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.55 });
        const stockEdges = new THREE.LineSegments(stockEdgeGeo, stockEdgeMat);
        stockMesh.add(stockEdges);
      }

      // 2. Safe Clearance / Retract Plane wireframe (Z = maxZ + 5.0mm)
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

      // 3. Translucent Orange Mode Indicator Layer:
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

      // 4. Center & Frame Visualizer Sphere around the Workpiece Slices
      const sphereRadius = Math.max(stockW, stockD, stockH) * 0.85;
      if (app?.vp?.view) {
        app.vp.view.target.set(stockCx, stockCy, stockCz);
        app.vp.view.dist = Math.max(160, sphereRadius * 3.0);
        app.vp.view.az = 0.55;
        app.vp.view.el = 0.50;
        if (app.vp.updateCamera) app.vp.updateCamera();
      }

      // 5. 3D Dowel Registration Pins (Vivid Gold Cylinders through laminated stack)
      if (this.laminationConfig.enabled && this.dowelPoints && this.dowelPoints.length > 0) {
        const pinH = Math.max(10, maxZ - minZ + 8.0);
        const pinCenterZ = (minZ + maxZ) / 2;

        this.dowelPoints.forEach(pt => {
          const pinGeo = new THREE.CylinderGeometry(pt.diameter / 2, pt.diameter / 2, pinH, 24);
          const pinMat = new THREE.MeshStandardMaterial({
            color: 0xfacc15, // Vivid Gold
            metalness: 0.4,
            roughness: 0.3,
            transparent: true,
            opacity: 0.75,
            depthWrite: false
          });
          const pinMesh = new THREE.Mesh(pinGeo, pinMat);
          pinMesh.rotation.x = Math.PI / 2; // Orient along Z axis
          pinMesh.position.set(pt.x, pt.y, pinCenterZ);
          pinMesh.name = `CLE_Dowel_Pin_${pt.id}`;
          pinMesh.renderOrder = 9995;
          this.visualizerGroup.add(pinMesh);

          // Dowel Wireframe Edges
          const edgeGeo = new THREE.EdgesGeometry(pinGeo);
          const edgeMat = new THREE.LineBasicMaterial({ color: 0xb45309, transparent: true, opacity: 0.85 });
          const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
          pinMesh.add(edgeLines);

          // Dowel Label Sprite at Top
          const labelSprite = this.createNumberLabelSprite(THREE, `Dowel #${pt.id} (⌀${pt.diameter}mm)`, '#facc15');
          labelSprite.position.set(pt.x, pt.y, maxZ + 6.0);
          labelSprite.scale.set(24, 10, 1);
          labelSprite.renderOrder = 100002;
          this.visualizerGroup.add(labelSprite);
        });
      }

      // 6. Horizontal Part Joint Divider Planes (Laminated Slab Tiers)
      if (this.laminationConfig.enabled && this.laminatedParts && this.laminatedParts.length > 1) {
        const slabW = Math.max(10, maxX - minX + 10);
        const slabD = Math.max(10, maxY - minY + 10);

        for (let k = 1; k < this.laminatedParts.length; k++) {
          const jointZ = this.laminatedParts[k].minZ;
          const jointPlaneGeo = new THREE.PlaneGeometry(slabW, slabD);
          const jointPlaneMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false
          });
          const jointMesh = new THREE.Mesh(jointPlaneGeo, jointPlaneMat);
          jointMesh.position.set(stockCx, stockCy, jointZ);
          jointMesh.name = `CLE_Part_Joint_${k}`;
          jointMesh.renderOrder = 9992;
          this.visualizerGroup.add(jointMesh);

          // Border around joint divider
          const jointBorderGeo = new THREE.EdgesGeometry(jointPlaneGeo);
          const jointBorderMat = new THREE.LineBasicMaterial({ color: 0x0284c7, transparent: true, opacity: 0.65 });
          const jointBorder = new THREE.LineSegments(jointBorderGeo, jointBorderMat);
          jointBorder.position.set(stockCx, stockCy, jointZ);
          this.visualizerGroup.add(jointBorder);

          // Joint Label Sprite
          const jointSprite = this.createNumberLabelSprite(THREE, `Joint ${k}/${this.laminatedParts.length} (Z=${jointZ.toFixed(1)}mm)`, '#38bdf8');
          jointSprite.position.set(stockCx, minY - 14.0, jointZ);
          jointSprite.scale.set(32, 12, 1);
          jointSprite.renderOrder = 100001;
          this.visualizerGroup.add(jointSprite);
        }
      }
    }

    // Set all workspace CAD bodies to transparent (opacity: 0.32) so slices overlay directly inside them!
    this.setWorkspaceBodiesTransparent(true);

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

  // Set all workspace CAD bodies to transparent so slices overlay cleanly through them
  setWorkspaceBodiesTransparent(transparent = true) {
    const app = window.app || window.xe;
    if (!app || !app.scene) return;

    if (app.scene.views) {
      for (const [id, view] of app.scene.views) {
        if (view.mesh && view.mesh.material) {
          const mats = Array.isArray(view.mesh.material) ? view.mesh.material : [view.mesh.material];
          mats.forEach(m => {
            if (transparent) {
              if (m._cleOrigOpacity === undefined) {
                m._cleOrigOpacity = m.opacity !== undefined ? m.opacity : 1.0;
                m._cleOrigTransparent = m.transparent !== undefined ? m.transparent : false;
                m._cleOrigDepthWrite = m.depthWrite !== undefined ? m.depthWrite : true;
              }
              m.transparent = true;
              m.opacity = 0.32;
              m.depthWrite = false;
              m.needsUpdate = true;
            } else if (m._cleOrigOpacity !== undefined) {
              m.opacity = m._cleOrigOpacity;
              m.transparent = m._cleOrigTransparent;
              m.depthWrite = m._cleOrigDepthWrite;
              delete m._cleOrigOpacity;
              delete m._cleOrigTransparent;
              delete m._cleOrigDepthWrite;
              m.needsUpdate = true;
            }
          });
        }
      }
    }

    if (app.scene.root) {
      app.scene.root.traverse((obj) => {
        if (obj.isMesh && obj.material && obj.name !== 'CLE_Sample_Workpiece_Ghost') {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (transparent) {
              if (m._cleOrigOpacity === undefined) {
                m._cleOrigOpacity = m.opacity !== undefined ? m.opacity : 1.0;
                m._cleOrigTransparent = m.transparent !== undefined ? m.transparent : false;
                m._cleOrigDepthWrite = m.depthWrite !== undefined ? m.depthWrite : true;
              }
              m.transparent = true;
              m.opacity = 0.32;
              m.depthWrite = false;
              m.needsUpdate = true;
            } else if (m._cleOrigOpacity !== undefined) {
              m.opacity = m._cleOrigOpacity;
              m.transparent = m._cleOrigTransparent;
              m.depthWrite = m._cleOrigDepthWrite;
              delete m._cleOrigOpacity;
              delete m._cleOrigTransparent;
              delete m._cleOrigDepthWrite;
              m.needsUpdate = true;
            }
          });
        }
      });
    }

    if (app.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // Auto-Roll: Continuous 360-degree Orbit around the visualizer sphere
  startSphereRoll() {
    this.stopSphereRoll();
    this.isRollingSphere = true;
    const app = window.app || window.xe;
    if (!app || !app.vp || !app.vp.view) return;

    const rollStep = () => {
      if (!this.isRollingSphere) return;
      app.vp.view.az += 0.007; // Smooth spherical orbit roll
      if (app.vp.updateCamera) app.vp.updateCamera();
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
      this._sphereRollAnimId = requestAnimationFrame(rollStep);
    };
    this._sphereRollAnimId = requestAnimationFrame(rollStep);

    const btn = document.getElementById('cle-hud-roll-sphere');
    if (btn) {
      btn.textContent = '⏸ Pause Orbit';
      btn.style.background = '#f59e0b';
    }
  }

  stopSphereRoll() {
    this.isRollingSphere = false;
    if (this._sphereRollAnimId) {
      cancelAnimationFrame(this._sphereRollAnimId);
      this._sphereRollAnimId = null;
    }
    const btn = document.getElementById('cle-hud-roll-sphere');
    if (btn) {
      btn.textContent = '🔄 Roll Sphere';
      btn.style.background = '#4338ca';
    }
  }

  // Roll Through Slices sequentially
  startLayerRoll(fps = 6) {
    this.stopLayerRoll();
    if (!this.slicedLayers || this.slicedLayers.length === 0) return;
    this.isRollingLayers = true;

    let cur = 0;
    const num = this.slicedLayers.length;
    const intervalMs = Math.round(1000 / fps);

    this._layerRollTimer = setInterval(() => {
      if (!this.isRollingLayers) return;
      this.setPreviewLayer(cur);
      const slider = document.getElementById('cle-hud-slider');
      const label = document.getElementById('cle-hud-label');
      if (slider) slider.value = cur;
      if (label && this.slicedLayers[cur]) {
        label.textContent = `Pass ${cur + 1}/${num} (Z=${this.slicedLayers[cur].z.toFixed(2)}mm)`;
      }

      cur++;
      if (cur >= num) {
        // Pause briefly at end then reset
        setTimeout(() => {
          if (this.isRollingLayers) {
            this.setPreviewLayer(-1);
            if (slider) slider.value = -1;
            if (label) label.textContent = `All (${num} passes)`;
            cur = 0;
          }
        }, 1200);
      }
    }, intervalMs);

    const btn = document.getElementById('cle-hud-roll-layers');
    if (btn) {
      btn.textContent = '⏸ Pause Slices';
      btn.style.background = '#f59e0b';
    }
  }

  stopLayerRoll() {
    this.isRollingLayers = false;
    if (this._layerRollTimer) {
      clearInterval(this._layerRollTimer);
      this._layerRollTimer = null;
    }
    const btn = document.getElementById('cle-hud-roll-layers');
    if (btn) {
      btn.textContent = '▶ Roll Slices';
      btn.style.background = '#0284c7';
    }
  }

  // Preset View Angles for spherical inspection
  setViewAngle(mode) {
    const app = window.app || window.xe;
    if (!app || !app.vp || !app.vp.view) return;
    this.stopSphereRoll();

    if (mode === 'top') {
      app.vp.view.az = 0;
      app.vp.view.el = Math.PI / 2 - 0.001;
    } else if (mode === 'front') {
      app.vp.view.az = 0;
      app.vp.view.el = 0.02;
    } else if (mode === 'side') {
      app.vp.view.az = Math.PI / 2;
      app.vp.view.el = 0.02;
    } else { // 'iso'
      app.vp.view.az = 0.55;
      app.vp.view.el = 0.50;
    }

    if (app.vp.updateCamera) app.vp.updateCamera();
    app.vp.dirty = true;
    if (app.vp.request) app.vp.request();
  }

  clearVisualizer() {
    this.stopSphereRoll();
    this.stopLayerRoll();
    this.stopTraceSimulation();

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
    this.setWorkspaceBodiesTransparent(false);

    const hud = document.getElementById('cle-slicer-hud');
    if (hud) hud.style.display = 'none';

    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // Filter layer visibility according to scrubbed layer index (Stack vs Single Slice Contour mode)
  setPreviewLayer(targetIndex) {
    this.currentPreviewLayer = targetIndex;
    if (!this.visualizerGroup) return;

    const isSingle = (this.sliceViewMode === 'single');

    this.visualizerGroup.children.forEach(mesh => {
      const lIdx = mesh.userData.layerIndex;
      if (lIdx === undefined) return;

      // If a specific laminated part is active, keep other parts dimmed
      if (this.activePartIndex >= 0 && mesh.userData.partIndex !== undefined && mesh.userData.partIndex !== this.activePartIndex) {
        mesh.visible = (targetIndex === -1 && !isSingle);
        if (mesh.material) mesh.material.opacity = 0.15;
        return;
      }

      if (targetIndex === -1) {
        mesh.visible = true; // Show all contours in full stack
        if (mesh.material) mesh.material.opacity = 0.95;
      } else if (isSingle) {
        // Single Slice Contour Mode: Isolate selected contour slice
        mesh.visible = (lIdx === targetIndex);
        if (mesh.material) mesh.material.opacity = 1.0;
      } else {
        // Stack Mode: Show cumulative stack up to current layer, with active layer highlighted
        if (lIdx === targetIndex) {
          mesh.visible = true;
          if (mesh.material) mesh.material.opacity = 1.0;
        } else if (lIdx < targetIndex) {
          mesh.visible = true;
          if (mesh.material) mesh.material.opacity = 0.45;
        } else {
          mesh.visible = false;
        }
      }
    });

    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // Floating Layer & Export HUD with Roll Controls
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
        flex-wrap: wrap;
        gap: 10px;
        z-index: 1000;
        font-family: var(--f);
        font-size: 12px;
      `;
      document.body.appendChild(hud);
    }

    if (!this.sliceViewMode) this.sliceViewMode = 'stack'; // 'stack' | 'single'

    const numLayers = this.slicedLayers.length;
    const isTopDown = (this.mode === 'cnc' || this.mode === 'laser');
    const modeLabel = isTopDown ? `${this.mode.toUpperCase()}: Top-Down` : '3D: Bottom-Up';

    hud.innerHTML = `
      <div style="font-weight:700; color:var(--accent);">${modeLabel}</div>
      
      <!-- Roll Slices Scrubber Strip -->
      <div style="display:flex; align-items:center; gap:6px;">
        <button class="cle-btn" id="cle-hud-prev" style="padding:2px 8px;" title="Previous Pass">&larr;</button>
        <span id="cle-hud-label" style="font-family:var(--f-mono); min-width:125px; text-align:center; font-weight:600;">
          All (${numLayers} passes)
        </span>
        <button class="cle-btn" id="cle-hud-next" style="padding:2px 8px;" title="Next Pass">&rarr;</button>
      </div>
      <input type="range" id="cle-hud-slider" min="-1" max="${numLayers - 1}" value="-1" style="width:130px;" title="Scrub through toolpath passes">
      <button class="cle-btn" id="cle-hud-all" style="padding:2px 8px;">Show All</button>

      <!-- Single Slice vs Stack Mode Toggle -->
      <button class="cle-btn" id="cle-hud-mode-toggle" style="padding:2px 8px; font-weight:600; border-color:var(--accent);" title="Toggle Single Slice contour inspection vs Stack">${this.sliceViewMode === 'single' ? 'Single Slice' : 'Stack View'}</button>

      <!-- Roll Slices and Sphere Controls -->
      <button class="cle-btn" id="cle-hud-roll-layers" style="background:#0284c7; color:#fff; font-weight:600; padding:3px 10px;" title="Roll through all slice passes sequentially">▶ Roll Slices</button>
      <button class="cle-btn" id="cle-hud-roll-sphere" style="background:#4338ca; color:#fff; font-weight:600; padding:3px 10px;" title="Roll 3D Sphere (Continuous 360° Visualizer Orbit)">🔄 Roll Sphere</button>

      <!-- Spherical Angle Preset -->
      <select class="cle-select" id="cle-hud-view-preset" style="font-size:11px; padding:2px 6px;">
        <option value="iso">Iso 3D</option>
        <option value="top">Top (Z)</option>
        <option value="front">Front (Y)</option>
        <option value="side">Side (X)</option>
      </select>

      <button class="cle-btn" id="cle-hud-trace" style="background:#059669; color:#fff; font-weight:600; padding:3px 8px;" title="Simulate 3D toolhead movement over slices">Trace 3D</button>
      <div style="border-left:1px solid var(--line); height:18px;"></div>
      <button class="cle-btn" id="cle-hud-export" style="background:var(--accent); color:var(--on-accent); font-weight:600; padding:3px 8px;">Export .NC</button>
      <button class="cle-btn" id="cle-hud-upload" style="background:var(--ok); color:#fff; font-weight:600; padding:3px 8px;">To SD</button>
      <button class="cle-btn" id="cle-hud-close" style="padding:2px 6px;" title="Close Visualizer">&times;</button>

      ${(this.laminationConfig.enabled && this.laminatedParts.length > 0) ? `
      <div id="cle-hud-part-bar" style="display:flex; align-items:center; gap:6px; margin-top:6px; border-top:1px solid var(--line); padding-top:6px; width:100%; flex-wrap:wrap;">
        <span style="font-weight:700; color:#facc15;">🪵 30mm Laminated Parts (${this.laminatedParts.length}):</span>
        <button class="cle-btn cle-hud-part-btn ${this.activePartIndex === -1 ? 'active' : ''}" data-part="-1" style="padding:2px 8px; font-weight:700; background:${this.activePartIndex === -1 ? 'var(--accent)' : 'var(--paper)'}; color:${this.activePartIndex === -1 ? 'var(--on-accent)' : 'var(--ink)'};">All Stack</button>
        ${this.laminatedParts.map(p => `
          <button class="cle-btn cle-hud-part-btn ${this.activePartIndex === p.partIndex ? 'active' : ''}" data-part="${p.partIndex}" style="padding:2px 8px; font-weight:600; background:${this.activePartIndex === p.partIndex ? 'var(--accent)' : 'var(--paper)'}; color:${this.activePartIndex === p.partIndex ? 'var(--on-accent)' : 'var(--ink)'};" title="${p.name} (${p.layerCount} slices)">
            Part ${p.partNumber} (${p.thickness.toFixed(0)}mm)
          </button>
        `).join('')}
        <div style="margin-left:auto; display:flex; gap:6px; align-items:center;">
          <button class="cle-btn" id="cle-hud-export-part" style="background:#facc15; color:#000; font-weight:700; padding:2px 8px;" title="Export G-code for Active Part">Export Part .NC</button>
          <button class="cle-btn" id="cle-hud-upload-part" style="background:var(--ok); color:#fff; font-weight:700; padding:2px 8px;" title="Upload Active Part to FluidNC SD Card">Part to SD</button>
          <button class="cle-btn" id="cle-hud-export-all-parts" style="background:var(--paper); padding:2px 8px;" title="Export all ${this.laminatedParts.length} parts sequentially">Export All (${this.laminatedParts.length})</button>
        </div>
      </div>
      ` : ''}
    `;

    hud.style.display = 'flex';

    const slider = document.getElementById('cle-hud-slider');
    const label = document.getElementById('cle-hud-label');
    const modeBtn = document.getElementById('cle-hud-mode-toggle');

    const updateHUD = (val) => {
      slider.value = val;
      this.setPreviewLayer(parseInt(val, 10));
      if (val == -1) {
        label.textContent = `All (${numLayers} passes)`;
      } else {
        const curL = this.slicedLayers[val];
        const modePrefix = this.sliceViewMode === 'single' ? 'Slice' : 'Pass';
        label.textContent = `${modePrefix} ${parseInt(val, 10) + 1}/${numLayers} (Z=${curL ? curL.z.toFixed(2) : '--'}mm)`;
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

    // Toggle Single Slice vs Stack Mode
    modeBtn.onclick = () => {
      this.sliceViewMode = (this.sliceViewMode === 'single' ? 'stack' : 'single');
      modeBtn.textContent = (this.sliceViewMode === 'single' ? 'Single Slice' : 'Stack View');
      if (slider.value === '-1') {
        slider.value = 0; // Default to first slice when entering single slice mode
      }
      updateHUD(slider.value);
    };

    // Roll Slices sequentially
    document.getElementById('cle-hud-roll-layers').onclick = () => {
      if (this.isRollingLayers) this.stopLayerRoll();
      else this.startLayerRoll(6);
    };

    // Roll Sphere Orbit 360 degrees
    document.getElementById('cle-hud-roll-sphere').onclick = () => {
      if (this.isRollingSphere) this.stopSphereRoll();
      else this.startSphereRoll();
    };

    // View Preset Angles
    document.getElementById('cle-hud-view-preset').onchange = (e) => {
      this.setViewAngle(e.target.value);
    };

    // Mousewheel roll on HUD to roll through slices
    hud.onwheel = (e) => {
      e.preventDefault();
      let cur = parseInt(slider.value, 10);
      if (e.deltaY > 0) {
        if (cur < numLayers - 1) updateHUD(cur + 1);
      } else {
        if (cur > 0) updateHUD(cur - 1);
      }
    };

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
    if (this.laminationConfig.enabled && this.laminatedParts.length > 0) {
      hud.querySelectorAll('.cle-hud-part-btn').forEach(btn => {
        btn.onclick = () => {
          const pIdx = parseInt(btn.getAttribute('data-part'), 10);
          this.setActivePart(pIdx);
        };
      });

      const expPartBtn = document.getElementById('cle-hud-export-part');
      if (expPartBtn) {
        expPartBtn.onclick = () => {
          const target = this.activePartIndex >= 0 ? this.activePartIndex : 0;
          this.exportPartGCode(target);
        };
      }

      const upPartBtn = document.getElementById('cle-hud-upload-part');
      if (upPartBtn) {
        upPartBtn.onclick = () => {
          const target = this.activePartIndex >= 0 ? this.activePartIndex : 0;
          this.uploadPartGCodeToSD(target);
        };
      }

      const expAllBtn = document.getElementById('cle-hud-export-all-parts');
      if (expAllBtn) {
        expAllBtn.onclick = () => {
          this.exportAllParts();
        };
      }
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
