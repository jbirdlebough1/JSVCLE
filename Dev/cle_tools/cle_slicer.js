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
    // If user has specific body selection, prioritize slicing the selected body
    const selSet = (app?.sel && app.sel.length > 0) ? new Set(app.sel) : null;

    if (views && views.size > 0) {
      for (const [id, view] of views) {
        if (selSet && !selSet.has(id)) continue;
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

    const isTopDown = (mode === 'cnc' || mode === 'laser' || mode === 'rotary');

    // --- TwoTrees 4th Axis Rotary (A) & Turning Mode ---
    if (mode === 'rotary') {
      const rot = this.bridge?.rotary;
      const zTop = rot ? rot.getZTop() : (maxZ + 15);
      const zBot = rot ? rot.getZBot() : minZ;
      const angles = rot ? rot.getIndexAngles() : [0, 90, 180, 270];

      lines.push('; === TwoTrees 4th Axis Rotary (A) Index / Turning Toolpath ===');
      lines.push(`; Ratio: ${rot ? rot.gearRatio : 5}:1 (${rot ? rot.motorPulleyMm : 15}mm/${rot ? rot.chuckPulleyMm : 55}mm pulleys)`);
      lines.push(`; Center of Chuck: Y=${rot ? rot.centerY : 250}mm, Z_center=${rot ? rot.getZCenter().toFixed(2) : 45.1}mm (45mm from bed)`);
      lines.push(`; Chuck Assy Height: ${rot ? rot.chuckAssemblyHeightMm : 66}mm (fits under X-axis), Max Stock Dia: ${rot ? rot.getMaxStockDiameter().toFixed(0) : 80}mm`);
      lines.push(`; Safety Floor: Zbot=${zBot.toFixed(2)}mm (-5mm limit), Retract: Ztop=${zTop.toFixed(2)}mm (clears chuck & stock)`);
      lines.push('G21 ; mm mode');
      lines.push('G90 ; Absolute coordinates');
      lines.push(`M3 S${this.spindleRPM} ; Spindle ON`);
      lines.push(`G0 Z${zTop.toFixed(2)} F2000 ; Safe clearance retract`);

      // Top-Down Milling for each indexed face (CNC & Laser only cut top-down)
      const passesPerFace = Math.max(1, Math.ceil((zTop - zBot) / (layerH * 2)));
      let layerCounter = 0;

      for (let fIdx = 0; fIdx < angles.length; fIdx++) {
        const angle = angles[fIdx];
        lines.push(`\n; --- A-AXIS INDEXED FACE ${fIdx + 1}/${angles.length}: A=${angle.toFixed(1)}° ---`);
        lines.push(`G0 Z${zTop.toFixed(2)} ; Clearance retract before rotating A`);
        lines.push(`G0 A${angle.toFixed(3)} F3000 ; Rotate 4th axis to face ${fIdx + 1}`);
        lines.push(`G0 X${minX.toFixed(2)} Y${(rot ? rot.centerY : minY).toFixed(2)}`);

        for (let k = 0; k < passesPerFace; k++) {
          const passZ = Math.max(zBot, (zTop - (k + 1) * layerH * 2));
          lines.push(`; --- LAYER: ${layerCounter++} (Z=${passZ.toFixed(2)}, A=${angle.toFixed(1)}) ---`);
          lines.push(`G1 Z${passZ.toFixed(2)} F300 ; Plunge to pass depth`);
          lines.push(`G1 X${maxX.toFixed(2)} Y${maxY.toFixed(2)} A${angle.toFixed(3)} F${this.feedRate}`);
          lines.push(`G1 X${maxX.toFixed(2)} Y${minY.toFixed(2)} A${angle.toFixed(3)}`);
          lines.push(`G1 X${minX.toFixed(2)} Y${minY.toFixed(2)} A${angle.toFixed(3)}`);
          lines.push(`G1 X${minX.toFixed(2)} Y${maxY.toFixed(2)} A${angle.toFixed(3)}`);
          lines.push(`G0 Z${(passZ + 1.5).toFixed(2)} F1000 ; Step retract`);
        }
      }
      lines.push(`G0 Z${zTop.toFixed(2)}`);
      lines.push('G0 A0.000 F3000');
      lines.push('M5 ; Spindle OFF');
      lines.push('G0 X0 Y0 F3000');
      return lines.join('\n');
    }

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
    let currentLayer = null; // Do not create phantom layer before first LAYER header!
    let curX = null, curY = null, curZ = null, curA = 0;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('; ===') || line.startsWith('; Device')) continue;

      // Spoilboard Breakthrough header
      if (line.includes('SPOILBOARD BREAKTHROUGH') || line.includes('CLEAN CUTOUT PASS')) {
        if (currentLayer && currentLayer.points.length > 0) {
          this.slicedLayers.push(currentLayer);
        }
        const matchZ = line.match(/Z=([-\d.]+)/i);
        const lZ = matchZ ? parseFloat(matchZ[1]) : (curZ ?? 0);
        currentLayer = { index: this.slicedLayers.length, z: lZ, points: [], isCutoutPass: true };
        continue;
      }

      // Layer header detection (; --- LAYER: 0 (Z=8.000) --- or ;LAYER:0 or ;LAYER_CHANGE)
      if (line.match(/^;\s*(?:---)?\s*LAYER(?:_CHANGE)?[:\s]/i)) {
        if (currentLayer && currentLayer.points.length > 0) {
          this.slicedLayers.push(currentLayer);
        }
        const matchZ = line.match(/Z=([-\d.]+)/i);
        const matchA = line.match(/A=([-\d.]+)/i);
        const lZ = matchZ ? parseFloat(matchZ[1]) : (curZ ?? 0);
        if (matchA) curA = parseFloat(matchA[1]);
        currentLayer = { index: this.slicedLayers.length, z: lZ, a: curA, points: [], isCutoutPass: false };
        continue;
      }

      const matchX = line.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = line.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = line.match(/[Zz](-?\d+\.?\d*)/);
      const matchA = line.match(/[Aa](-?\d+\.?\d*)/);

      if (matchX) curX = parseFloat(matchX[1]);
      if (matchY) curY = parseFloat(matchY[1]);
      if (matchZ) curZ = parseFloat(matchZ[1]);
      if (matchA) curA = parseFloat(matchA[1]);

      // Move commands (G0 = Rapid, G1/G2/G3 = Cutting Feed)
      if (line.startsWith('G0') || line.startsWith('G1') || line.startsWith('G2') || line.startsWith('G3')) {
        const isRapid = line.startsWith('G0');
        if (!currentLayer) {
          // Preamble moves before any layer (safe clearance plane, etc.)
          continue;
        }
        // Only record points that specify horizontal coordinates or after coordinates have been established
        if (curX !== null && curY !== null && (matchX || matchY || !isRapid)) {
          const lastPt = currentLayer.points[currentLayer.points.length - 1];
          if (!lastPt || Math.hypot(lastPt.x - curX, lastPt.y - curY) > 0.01) {
            currentLayer.points.push({ x: curX, y: curY, z: curZ ?? currentLayer.z, a: curA, isRapid });
          }
        }
      }
    }

    if (currentLayer && currentLayer.points.length > 0) {
      this.slicedLayers.push(currentLayer);
    }
  }

  // Compute 2D convex perimeter contour loop from slice cutting points
  computeLayerContour(points) {
    if (!points || points.length < 3) return [];
    const cutPts = points.filter(p => !p.isRapid);
    const pts = (cutPts.length >= 3 ? cutPts : points).map(p => ({ x: p.x, y: p.y }));
    if (pts.length < 3) return [];

    // Monotone chain 2D convex hull algorithm
    pts.sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  // Compute exact closed 2D cross-section contour of solid CAD object at elevation Z
  computeObjectCrossSectionAtZ(Z) {
    if (!this.lastGeometry || !this.lastGeometry.triangles || this.lastGeometry.triangles.length < 9) {
      return null;
    }
    if (!this._crossSectionCache) this._crossSectionCache = new Map();
    const zKey = Z.toFixed(3);
    if (this._crossSectionCache.has(zKey)) {
      return this._crossSectionCache.get(zKey);
    }

    const tris = this.lastGeometry.triangles;
    const segments = [];

    for (let i = 0; i < tris.length; i += 9) {
      const az = tris[i+2], bz = tris[i+5], cz = tris[i+8];
      const minZ = Math.min(az, bz, cz);
      const maxZ = Math.max(az, bz, cz);
      if (minZ > Z || maxZ < Z) continue;

      const ax = tris[i], ay = tris[i+1];
      const bx = tris[i+3], by = tris[i+4];
      const cx = tris[i+6], cy = tris[i+7];

      const pts = [];
      // Edge AB
      if ((az <= Z && bz >= Z) || (az >= Z && bz <= Z)) {
        if (Math.abs(bz - az) > 1e-6) {
          const t = (Z - az) / (bz - az);
          pts.push({ x: ax + t * (bx - ax), y: ay + t * (by - ay) });
        }
      }
      // Edge BC
      if ((bz <= Z && cz >= Z) || (bz >= Z && cz <= Z)) {
        if (Math.abs(cz - bz) > 1e-6) {
          const t = (Z - bz) / (cz - bz);
          pts.push({ x: bx + t * (cx - bx), y: by + t * (cy - by) });
        }
      }
      // Edge CA
      if ((cz <= Z && az >= Z) || (cz >= Z && az <= Z)) {
        if (Math.abs(az - cz) > 1e-6) {
          const t = (Z - cz) / (az - cz);
          pts.push({ x: cx + t * (ax - cx), y: cy + t * (ay - cy) });
        }
      }

      if (pts.length >= 2) {
        if (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) > 0.001) {
          segments.push([pts[0], pts[1]]);
        }
      }
    }

    if (segments.length < 3) return null;

    // Chain segments into ordered polygon contour loop
    const chain = [];
    const used = new Uint8Array(segments.length);
    chain.push(segments[0][0], segments[0][1]);
    used[0] = 1;

    for (let iter = 1; iter < segments.length; iter++) {
      const last = chain[chain.length - 1];
      let bestDist = Infinity;
      let bestIdx = -1;
      let flip = false;

      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const d0 = Math.hypot(segments[j][0].x - last.x, segments[j][0].y - last.y);
        const d1 = Math.hypot(segments[j][1].x - last.x, segments[j][1].y - last.y);
        if (d0 < bestDist) { bestDist = d0; bestIdx = j; flip = false; }
        if (d1 < bestDist) { bestDist = d1; bestIdx = j; flip = true; }
      }

      // ONLY chain contiguous segments belonging to the SAME connected boundary loop!
      // Any gap > 2.0mm means another disconnected body - NEVER jump across space!
      if (bestIdx !== -1 && bestDist < 2.0) {
        used[bestIdx] = 1;
        chain.push(flip ? segments[bestIdx][0] : segments[bestIdx][1]);
      } else {
        break;
      }
    }

    const result = chain.length >= 3 ? chain : null;
    this._crossSectionCache.set(zKey, result);
    return result;
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
    texture.channel = 0;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
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
    if (THREE.BufferAttribute && !THREE.BufferAttribute.prototype.updateRanges) {
      Object.defineProperty(THREE.BufferAttribute.prototype, 'updateRanges', {
        get() {
          if (!this._updateRanges) this._updateRanges = [];
          return this._updateRanges;
        },
        set(v) { this._updateRanges = v; }
      });
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

    // Track workpiece bounding envelope (without heavy Float32BufferAttribute allocation)
    this.slicedLayers.forEach((layer) => {
      for (const p of layer.points) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
      }
    });

    // Solid Bright Green Slice Microtome Slabs (Visible from ANY viewing angle)
    this.sharedSolidMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66, // Vivid Bright Neon/Emerald Green Slice Microtome Fill
      transparent: true,
      opacity: 0.80,   // Solid yet translucent, completely filling the contour
      side: THREE.DoubleSide,
      depthTest: false, // Never occluded by CAD bodies in front of slice
      depthWrite: false
    });
    this.sharedFadeSolidMat = new THREE.MeshBasicMaterial({
      color: 0x00e676, // Bright Green for Range and Full Stack Slices
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false
    });
    this.sharedBorderMat = new THREE.LineBasicMaterial({
      color: 0x00ff66, // Bright Green Perimeter Contour Outline Loop
      linewidth: 4.0,
      transparent: true,
      opacity: 1.0,
      depthTest: false
    });
    this.sharedFadeBorderMat = new THREE.LineBasicMaterial({
      color: 0x00e676,
      linewidth: 2.0,
      transparent: true,
      opacity: 0.60,
      depthTest: false
    });

    // Build true 3D microtome slice slabs with physical layer thickness (visible from ALL angles)
    const sliceThickness = Math.max(0.4, this.layerHeight || 1.0);

    this.slicedLayers.forEach((layer, lIdx) => {
      // Find which laminated part contains this layer
      let layerPartIdx = -1;
      if (this.laminatedParts && this.laminatedParts.length > 0) {
        layerPartIdx = this.laminatedParts.findIndex(p => layer.z >= p.minZ - 0.05 && layer.z <= p.maxZ + 0.05);
      }

      // Slice Contour Planar Disc & Vivid Green Perimeter Outline Loop (following 3D object in X, Y, Z and A)
      const exactCross = this.computeObjectCrossSectionAtZ(layer.z);
      const contourPts = (exactCross && exactCross.length >= 3) ? exactCross : this.computeLayerContour(layer.points);
      layer.contourPts = contourPts;

      if (contourPts && contourPts.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(contourPts[0].x, contourPts[0].y);
        for (let k = 1; k < contourPts.length; k++) {
          shape.lineTo(contourPts[k].x, contourPts[k].y);
        }
        shape.closePath();

        // 3D Physical Microtome Slice Slab: extrude along Z so slice is solid and fully visible from ANY angle
        let solidGeo;
        try {
          solidGeo = new THREE.ExtrudeGeometry(shape, { depth: sliceThickness, bevelEnabled: false });
          solidGeo.translate(0, 0, layer.z - sliceThickness / 2);
        } catch (e) {
          solidGeo = new THREE.ShapeGeometry(shape);
          solidGeo.translate(0, 0, layer.z);
        }

        const solidSliceMesh = new THREE.Mesh(solidGeo, this.sharedSolidMat);
        solidSliceMesh.name = `CLE_Solid_Slice_${lIdx}`;
        solidSliceMesh.userData = { layerIndex: lIdx, zElevation: layer.z, partIndex: layerPartIdx, isSolidSlice: true };
        solidSliceMesh.renderOrder = 100000;
        solidSliceMesh.visible = false;
        this.visualizerGroup.add(solidSliceMesh);

        // Vivid Glowing Green Perimeter Contour Outline Loop (User: "bright green slice that is filled to the outside conture")
        const loopPts = contourPts.map(p => new THREE.Vector3(p.x, p.y, layer.z));
        const loopGeo = new THREE.BufferGeometry().setFromPoints(loopPts);
        const contourBorder = new THREE.LineLoop(loopGeo, this.sharedBorderMat);
        contourBorder.name = `CLE_Contour_Border_${lIdx}`;
        contourBorder.userData = { layerIndex: lIdx, zElevation: layer.z, partIndex: layerPartIdx, isContourBorder: true };
        contourBorder.renderOrder = 100001;
        contourBorder.visible = false;
        this.visualizerGroup.add(contourBorder);
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
      this.stockCenter = { x: stockCx, y: stockCy, z: stockCz };

      // 1. Semi-transparent shape outline in transparent orange (User: "outline of the shape in transperent orange")
      if (this.lastGeometry?.isSample) {
        const stockGeo = new THREE.BoxGeometry(stockW, stockD, stockH);
        const stockMat = new THREE.MeshStandardMaterial({
          color: 0xf97316, // Transparent Orange
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

        // Fine wireframe edges around workpiece in transparent orange
        const stockEdgeGeo = new THREE.EdgesGeometry(stockGeo);
        const stockEdgeMat = new THREE.LineBasicMaterial({ color: 0xea580c, transparent: true, opacity: 0.65 });
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

      // 5. 3D Dowel Registration Pins (Only in Lamination Mode through physical sliced sheets)
      if (this.mode === 'lamination' && this.laminationConfig.enabled && this.dowelPoints && this.dowelPoints.length > 0) {
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

    // Default to Single Slice Orange Contour view on slice 0 (clean orange contour, zero green/yellow cube)
    this.sliceViewMode = this.sliceViewMode || 'single';
    this.setPreviewLayer(0);

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

  // Set all workspace CAD bodies to transparent orange with orange wireframe edges
  setWorkspaceBodiesTransparent(transparent = true) {
    const app = window.app || window.xe;
    if (!app || !app.scene) return;
    const THREE = window.THREE;

    const applyMeshTransparency = (obj) => {
      if (!obj || !obj.isMesh || !obj.material || obj.name === 'CLE_Sample_Workpiece_Ghost') return;
      if (obj.name && (obj.name.startsWith('CLE_') || obj.name.startsWith('cle-'))) return;
      if (obj.userData && (obj.userData.isSolidSlice || obj.userData.isContourBorder || obj.userData.isRawToolpath)) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => {
        if (transparent) {
          if (m._cleOrigOpacity === undefined) {
            m._cleOrigOpacity = m.opacity !== undefined ? m.opacity : 1.0;
            m._cleOrigTransparent = m.transparent !== undefined ? m.transparent : false;
            m._cleOrigDepthWrite = m.depthWrite !== undefined ? m.depthWrite : true;
            m._cleOrigColor = (m.color && m.color.getHex) ? m.color.getHex() : null;
          }
          m.transparent = true;
          m.opacity = 0.22;
          m.depthWrite = false;
          if (m.color && m.color.setHex) m.color.setHex(0xf97316); // Vivid Transparent Orange
          m.needsUpdate = true;
        } else if (m._cleOrigOpacity !== undefined) {
          m.opacity = m._cleOrigOpacity;
          m.transparent = m._cleOrigTransparent;
          m.depthWrite = m._cleOrigDepthWrite;
          if (m._cleOrigColor !== null && m.color && m.color.setHex) {
            m.color.setHex(m._cleOrigColor);
          }
          delete m._cleOrigOpacity;
          delete m._cleOrigTransparent;
          delete m._cleOrigDepthWrite;
          delete m._cleOrigColor;
          m.needsUpdate = true;
        }
      });

      // Orange shape outline edges
      if (transparent && THREE && obj.geometry && !obj._cleEdges) {
        try {
          const edgeGeo = new THREE.EdgesGeometry(obj.geometry);
          const edgeMat = new THREE.LineBasicMaterial({ color: 0xea580c, transparent: true, opacity: 0.65 });
          const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
          edgeLines.name = 'CLE_Body_Orange_Edges';
          obj.add(edgeLines);
          obj._cleEdges = edgeLines;
        } catch (e) {}
      } else if (!transparent && obj._cleEdges) {
        obj.remove(obj._cleEdges);
        try { obj._cleEdges.geometry.dispose(); } catch (e) {}
        try { obj._cleEdges.material.dispose(); } catch (e) {}
        delete obj._cleEdges;
      }
    };

    if (app.scene?.views) {
      for (const [id, view] of app.scene.views) {
        if (view.mesh) view.mesh.traverse(applyMeshTransparency);
        if (view.group) view.group.traverse(applyMeshTransparency);
      }
    }

    if (app.scene?.root) {
      app.scene.root.traverse(applyMeshTransparency);
    }

    if (app.vp?.scene) {
      app.vp.scene.traverse(applyMeshTransparency);
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
    if (this.bridge.bed) this.bridge.bed.setRaysVisible(true);

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

    if (this._crossSectionCache) {
      this._crossSectionCache.clear();
    }
    if (this.sharedSolidMat) { try { this.sharedSolidMat.dispose(); } catch (e) {} this.sharedSolidMat = null; }
    if (this.sharedFadeSolidMat) { try { this.sharedFadeSolidMat.dispose(); } catch (e) {} this.sharedFadeSolidMat = null; }
    if (this.sharedBorderMat) { try { this.sharedBorderMat.dispose(); } catch (e) {} this.sharedBorderMat = null; }
    if (this.sharedFadeBorderMat) { try { this.sharedFadeBorderMat.dispose(); } catch (e) {} this.sharedFadeBorderMat = null; }

    // Restore CAD body opacity and depthWrite
    this.setWorkspaceBodiesTransparent(false);

    const hud = document.getElementById('cle-slicer-hud');
    if (hud) hud.style.display = 'none';

    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // Filter layer visibility according to scrubbed layer index (Single Slice Contour vs Range Window vs Full Stack)
  setPreviewLayer(targetIndex = 0) {
    this.currentPreviewLayer = targetIndex;
    if (!this.visualizerGroup) return;

    const mode = this.sliceViewMode || 'single'; // 'single' | 'range' | 'stack'
    const numLayers = this.slicedLayers ? this.slicedLayers.length : 0;
    const rangeWindow = this.rangeWindow || 10;
    const halfWin = Math.floor(rangeWindow / 2);

    let rangeStart = 0;
    let rangeEnd = numLayers - 1;
    if (mode === 'range') {
      const center = (targetIndex === -1) ? Math.floor(numLayers / 2) : targetIndex;
      rangeStart = Math.max(0, center - halfWin);
      rangeEnd = Math.min(numLayers - 1, center + halfWin);
    }

    this.visualizerGroup.children.forEach(mesh => {
      const lIdx = mesh.userData.layerIndex;
      if (lIdx === undefined) return;

      const isSolidSlice = !!mesh.userData.isSolidSlice;
      const isContourBorder = !!mesh.userData.isContourBorder;
      const isRawToolpath = !!mesh.userData.isRawToolpath;

      // Active Part filter (if user isolated a specific laminated part)
      if (this.activePartIndex >= 0 && mesh.userData.partIndex !== undefined && mesh.userData.partIndex !== this.activePartIndex) {
        mesh.visible = false;
        return;
      }

      if (mode === 'single') {
        // --- SINGLE SLICE SOLID GREEN CONTOUR MODE ---
        // Exactly one slice at a time showing solid transparent green contour following the 3D object in X, Y, Z (and A)
        const effectiveTarget = (targetIndex === -1) ? 0 : targetIndex;
        const isTarget = (lIdx === effectiveTarget);

        if (isSolidSlice) {
          mesh.visible = isTarget;
          if (isTarget && this.sharedSolidMat) mesh.material = this.sharedSolidMat;
        } else if (isContourBorder) {
          mesh.visible = isTarget;
          if (isTarget && this.sharedBorderMat) mesh.material = this.sharedBorderMat;
        } else if (isRawToolpath) {
          // Raw toolpath lines: NEVER displayed statically! Only visible for active slice currently being traced
          mesh.visible = (this.isSimulating && this._activeSimLayer === lIdx);
        } else {
          mesh.visible = isTarget;
        }

      } else if (mode === 'range') {
        // --- RANGE OF SLICES SCROLL MODE ---
        // Shows window of slices (e.g. 10 passes) scrolling through the stack in clean green contours
        const inRange = (lIdx >= rangeStart && lIdx <= rangeEnd);
        const center = (targetIndex === -1) ? Math.floor(numLayers / 2) : targetIndex;
        const isCenter = (lIdx === center);

        if (isSolidSlice) {
          mesh.visible = inRange;
          if (inRange && this.sharedSolidMat && this.sharedFadeSolidMat) {
            mesh.material = isCenter ? this.sharedSolidMat : this.sharedFadeSolidMat;
          }
        } else if (isContourBorder) {
          mesh.visible = inRange;
          if (inRange && this.sharedBorderMat && this.sharedFadeBorderMat) {
            mesh.material = isCenter ? this.sharedBorderMat : this.sharedFadeBorderMat;
          }
        } else if (isRawToolpath) {
          mesh.visible = (this.isSimulating && this._activeSimLayer === lIdx);
        } else {
          mesh.visible = inRange;
        }

      } else {
        // --- FULL STACK MODE ---
        // Clean contour stack across the workpiece showing every slice filled in bright green
        if (isSolidSlice) {
          mesh.visible = true;
          const isTarget = (targetIndex !== -1 && lIdx === targetIndex);
          if (this.sharedSolidMat && this.sharedFadeSolidMat) {
            mesh.material = isTarget ? this.sharedSolidMat : this.sharedFadeSolidMat;
          }
        } else if (isContourBorder) {
          mesh.visible = true;
          const isTarget = (targetIndex !== -1 && lIdx === targetIndex);
          if (this.sharedBorderMat && this.sharedFadeBorderMat) {
            mesh.material = isTarget ? this.sharedBorderMat : this.sharedFadeBorderMat;
          }
        } else if (isRawToolpath) {
          mesh.visible = (this.isSimulating && this._activeSimLayer === lIdx);
        } else {
          mesh.visible = (targetIndex === -1 || lIdx <= targetIndex);
        }
      }
    });

    const app = window.app || window.xe;

    // Center camera orbit target on active slice center at elevation Z
    // so rotating via mouse or game joysticks spins directly around that slice from every viewpoint!
    const effectiveTarget = (targetIndex === -1) ? 0 : targetIndex;
    if (mode === 'single' && this.stockCenter && this.slicedLayers && this.slicedLayers[effectiveTarget]) {
      const curL = this.slicedLayers[effectiveTarget];
      if (curL && app?.vp?.view && app.vp.view.target) {
        app.vp.view.target.set(this.stockCenter.x, this.stockCenter.y, curL.z);
      }
    }

    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.updateCamera) app.vp.updateCamera();
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

    if (!this.sliceViewMode) this.sliceViewMode = 'single'; // Default to Single Slice Orange Contour mode

    const numLayers = this.slicedLayers.length;
    const isTopDown = (this.mode === 'cnc' || this.mode === 'laser');
    const modeLabel = isTopDown ? `${this.mode.toUpperCase()}: Top-Down` : '3D: Bottom-Up';

    hud.innerHTML = `
      <div style="font-weight:700; color:var(--accent);">${modeLabel}</div>
      
      <!-- Roll Slices Scrubber Strip -->
      <div style="display:flex; align-items:center; gap:6px;">
        <button class="cle-btn" id="cle-hud-prev" style="padding:2px 8px;" title="Previous Pass">&larr;</button>
        <span id="cle-hud-label" style="font-family:var(--f-mono); min-width:145px; text-align:center; font-weight:600; color:#f97316;">
          Slice 1/${numLayers}
        </span>
        <button class="cle-btn" id="cle-hud-next" style="padding:2px 8px;" title="Next Pass">&rarr;</button>
      </div>
      <input type="range" id="cle-hud-slider" min="0" max="${Math.max(0, numLayers - 1)}" value="0" style="width:130px;" title="Scrub through toolpath passes">
      <button class="cle-btn" id="cle-hud-all" style="padding:2px 8px;">Reset (Top)</button>

      <!-- 3-Way Mode Switcher: Single Slice Contour / Range Window / Full Stack -->
      <div style="display:flex; gap:2px; background:rgba(0,0,0,0.15); padding:2px; border-radius:6px; border:1px solid var(--line);">
        <button class="cle-btn cle-hud-mode-pill ${this.sliceViewMode === 'single' ? 'active' : ''}" data-mode="single" style="padding:2px 8px; font-weight:700; font-size:11px; background:${this.sliceViewMode === 'single' ? 'var(--accent)' : 'transparent'}; color:${this.sliceViewMode === 'single' ? 'var(--on-accent)' : 'var(--ink)'};" title="Single Slice Mode: View exactly one slice orange contour at a time">Single Slice</button>
        <button class="cle-btn cle-hud-mode-pill ${this.sliceViewMode === 'range' ? 'active' : ''}" data-mode="range" style="padding:2px 8px; font-weight:700; font-size:11px; background:${this.sliceViewMode === 'range' ? 'var(--accent)' : 'transparent'}; color:${this.sliceViewMode === 'range' ? 'var(--on-accent)' : 'var(--ink)'};" title="Range Mode: Scroll a window of orange slice contours through the stack">Range (10)</button>
        <button class="cle-btn cle-hud-mode-pill ${this.sliceViewMode === 'stack' ? 'active' : ''}" data-mode="stack" style="padding:2px 8px; font-weight:700; font-size:11px; background:${this.sliceViewMode === 'stack' ? 'var(--accent)' : 'transparent'}; color:${this.sliceViewMode === 'stack' ? 'var(--on-accent)' : 'var(--ink)'};" title="Full Stack Mode: View entire continuous orange contour stack">Full Stack</button>
      </div>

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
      <button class="cle-btn" id="cle-hud-rot-a" style="background:#ea580c; color:#fff; font-weight:600; padding:3px 8px; border-radius:5px;" title="Rotate Object 90° about A-Axis (X) for 4th Axis Rotary Milling">Rot 90° A</button>
      <button class="cle-btn" id="cle-hud-rot-fit" style="background:#d97706; color:#fff; font-weight:600; padding:3px 8px; border-radius:5px;" title="Auto-clamp Chuck and Opposing Center to CAD workpiece ends">Clamp Ends</button>
      <button class="cle-btn" id="cle-hud-center-obj" style="background:#0284c7; color:#fff; font-weight:600; padding:3px 8px; border-radius:5px;" title="Center Chuck & Opposing Center on CAD workpiece">Center Obj</button>
      <button class="cle-btn" id="cle-hud-center-tool" style="background:#0891b2; color:#fff; font-weight:600; padding:3px 8px; border-radius:5px;" title="Toggle Center Point Tool Reticle">Center Tool</button>
      <button class="cle-btn" id="cle-hud-jog-center" style="background:#f59e0b; color:#000; font-weight:700; padding:3px 8px; border-radius:5px;" title="Jog CNC Spindle / Laser to A-Axis Center Point">Jog Center</button>
      <div style="border-left:1px solid var(--line); height:18px;"></div>
      <button class="cle-btn" id="cle-hud-export" style="background:var(--accent); color:var(--on-accent); font-weight:600; padding:3px 8px;">Export .NC</button>
      <button class="cle-btn" id="cle-hud-upload" style="background:var(--ok); color:#fff; font-weight:600; padding:3px 8px;">To SD</button>
      <button class="cle-btn" id="cle-hud-return" style="background:#2563eb; color:#fff; font-weight:700; padding:3px 12px; border-radius:5px;" title="Return to JumpStart CAD Design Workspace">Return</button>
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

    const updateModePills = () => {
      hud.querySelectorAll('.cle-hud-mode-pill').forEach(btn => {
        const m = btn.getAttribute('data-mode');
        const isActive = (m === this.sliceViewMode);
        btn.style.background = isActive ? 'var(--accent)' : 'transparent';
        btn.style.color = isActive ? 'var(--on-accent)' : 'var(--ink)';
      });
    };

    const updateHUD = (val) => {
      slider.value = val;
      const intVal = parseInt(val, 10);
      this.setPreviewLayer(intVal);

      if (this.sliceViewMode === 'single') {
        const idx = (intVal === -1) ? 0 : intVal;
        const curL = this.slicedLayers[idx];
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minA = Infinity, maxA = -Infinity;
        if (curL && curL.points) {
          for (const p of curL.points) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            const deg = (Math.atan2(p.y, p.z) * (180 / Math.PI) + 360) % 360;
            if (deg < minA) minA = deg; if (deg > maxA) maxA = deg;
          }
        }
        const hasRotary = (this.mode === 'rotary' || (this.bridge?.vault?.getActiveMachine()?.type === 'rotary'));
        const aStr = (hasRotary && isFinite(minA)) ? `, A:${minA.toFixed(0)}°..${maxA.toFixed(0)}°` : '';
        const coordStr = isFinite(minX) ? ` | X:${minX.toFixed(0)}..${maxX.toFixed(0)} Y:${minY.toFixed(0)}..${maxY.toFixed(0)}${aStr}` : '';
        label.innerHTML = `Slice ${idx + 1}/${numLayers} (Z=${curL ? curL.z.toFixed(2) : '--'}mm${coordStr}) <span style="color:#22c55e; font-weight:700;">[Green Contour]</span>`;
      } else if (this.sliceViewMode === 'range') {
        const half = 5;
        const center = (intVal === -1) ? Math.floor(numLayers / 2) : intVal;
        const rStart = Math.max(0, center - half);
        const rEnd = Math.min(numLayers - 1, center + half);
        const zS = this.slicedLayers[rStart] ? this.slicedLayers[rStart].z.toFixed(1) : '--';
        const zE = this.slicedLayers[rEnd] ? this.slicedLayers[rEnd].z.toFixed(1) : '--';
        label.innerHTML = `Range ${rStart + 1}-${rEnd + 1}/${numLayers} (Z ${zS}..${zE}mm) <span style="color:#22c55e; font-weight:700;">[Green Contours]</span>`;
      } else {
        if (intVal === -1) {
          label.textContent = `All Contours (${numLayers} passes)`;
        } else {
          const curL = this.slicedLayers[intVal];
          label.textContent = `Contour Stack 1..${intVal + 1}/${numLayers} (Z=${curL ? curL.z.toFixed(2) : '--'}mm)`;
        }
      }
    };

    slider.oninput = (e) => updateHUD(e.target.value);
    document.getElementById('cle-hud-prev').onclick = () => {
      let cur = parseInt(slider.value, 10);
      if (cur > 0) updateHUD(cur - 1);
      else if (cur === -1 || cur === 0) updateHUD(numLayers - 1);
    };
    document.getElementById('cle-hud-next').onclick = () => {
      let cur = parseInt(slider.value, 10);
      if (cur < numLayers - 1) updateHUD(cur + 1);
      else updateHUD(0);
    };
    document.getElementById('cle-hud-all').onclick = () => updateHUD(0);

    // 3-Way Mode Switcher Click Handlers
    hud.querySelectorAll('.cle-hud-mode-pill').forEach(btn => {
      btn.onclick = () => {
        const targetMode = btn.getAttribute('data-mode');
        this.sliceViewMode = targetMode;
        if (targetMode === 'single' && (slider.value === '-1' || !slider.value)) {
          slider.value = 0;
        } else if (targetMode === 'range' && (slider.value === '-1' || !slider.value)) {
          slider.value = Math.floor(numLayers / 2);
        }
        updateModePills();
        updateHUD(slider.value);
      };
    });

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

    // Initialize HUD and Visualizer to Slice 1 in Orange Contour mode
    updateHUD(0);

    // Return to JumpStart Design CAD Workspace
    const returnBtn = document.getElementById('cle-hud-return');
    if (returnBtn) {
      returnBtn.onclick = () => {
        this.clearVisualizer();
        const wsBtn = document.getElementById('ws-design');
        if (wsBtn) wsBtn.click();
        else if (window.app && window.app.setWorkspace) window.app.setWorkspace('design');
        if (this.bridge) this.bridge.notify('Returned to JumpStart Design CAD workspace.', 'info');
      };
    }

    // Rotate Object 90° around A-Axis (X) for 4th Axis Rotary
    const rotABtn = document.getElementById('cle-hud-rot-a');
    if (rotABtn) {
      rotABtn.onclick = async () => {
        if (this.bridge?.bed) {
          this.bridge.bed.rotateWorkpiece('X', 90);
          this.clearVisualizer();
          await this.sliceModel();
        }
      };
    }

    // Auto-Fit Chuck and Opposing Center to Workpiece Ends
    const rotFitBtn = document.getElementById('cle-hud-rot-fit');
    if (rotFitBtn) {
      rotFitBtn.onclick = () => {
        if (this.bridge?.rotary) {
          this.bridge.rotary.fitToObject();
        }
      };
    }

    const centerObjBtn = document.getElementById('cle-hud-center-obj');
    if (centerObjBtn) {
      centerObjBtn.onclick = () => {
        if (this.bridge?.rotary) this.bridge.rotary.centerOnObject();
      };
    }

    const centerToolBtn = document.getElementById('cle-hud-center-tool');
    if (centerToolBtn) {
      centerToolBtn.onclick = () => {
        if (this.bridge?.rotary) {
          const vis = this.bridge.rotary.toggleCenterPointTool();
          centerToolBtn.style.background = vis ? '#0891b2' : 'var(--paper)';
          centerToolBtn.style.color = vis ? '#fff' : 'var(--ink)';
        }
      };
    }

    const jogCenterBtn = document.getElementById('cle-hud-jog-center');
    if (jogCenterBtn) {
      jogCenterBtn.onclick = () => {
        if (this.bridge?.rotary) this.bridge.rotary.jogToolToCenter('workpiece');
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

  // --- 3D Toolpath Trace Simulator (Shows tool path dynamically as it cuts each slice) ---
  // --- 3D Toolpath Trace Simulator (Visibly shows toolhead cutting/tracing the contour in real time) ---
  startTraceSimulation(speedMultiplier = 2) {
    if (!this.slicedLayers || this.slicedLayers.length === 0) {
      this.bridge.notify('Slice a model first to run trace simulator.', 'error');
      return;
    }

    this.stopTraceSimulation();
    this.isSimulating = true;
    this.simSpeed = speedMultiplier;

    // Remove extended crosshair guide rays and tip lines so only the tool moving on the slice is visible
    if (this.bridge.bed) {
      this.bridge.bed.setRaysVisible(false);
    }

    const numLayers = this.slicedLayers.length;
    let curLayerIdx = (this.currentPreviewLayer >= 0 && this.currentPreviewLayer < numLayers)
      ? this.currentPreviewLayer
      : 0;
    let ptIdx = 0;

    const hudLabel = document.getElementById('cle-hud-label');
    const hudSlider = document.getElementById('cle-hud-slider');
    const traceBtn = document.getElementById('cle-hud-trace');
    if (traceBtn) traceBtn.textContent = 'Stop Trace';

    const setupSliceForTrace = (lIdx) => {
      this._activeSimLayer = lIdx;
      this.currentPreviewLayer = lIdx;
      if (hudSlider) hudSlider.value = lIdx;
      this.setPreviewLayer(lIdx);
    };

    setupSliceForTrace(curLayerIdx);

    const step = () => {
      if (!this.isSimulating) return;

      const layer = this.slicedLayers[curLayerIdx];
      const contour = (layer && layer.contourPts && layer.contourPts.length >= 3)
        ? layer.contourPts
        : (layer ? layer.points : null);

      if (!layer || !contour || contour.length === 0) {
        curLayerIdx++;
        ptIdx = 0;
        if (curLayerIdx >= numLayers) {
          finishTrace();
          return;
        }
        setupSliceForTrace(curLayerIdx);
        this._simAnimId = requestAnimationFrame(step);
        return;
      }

      const pt = contour[ptIdx];
      if (pt && this.bridge.bed) {
        this.bridge.bed.updateToolCursor({ X: pt.x, Y: pt.y, Z: layer.z, A: pt.a || 0 });
      }
      if (pt && this.bridge.rotary && pt.a !== undefined) {
        this.bridge.rotary.setAngle(pt.a);
      }

      // Update HUD status label with live coordinates
      if (hudLabel && pt) {
        const hasRotary = (this.mode === 'rotary' || (this.bridge?.vault?.getActiveMachine()?.type === 'rotary'));
        const aStr = hasRotary ? ` A:${(pt.a || 0).toFixed(0)}°` : '';
        hudLabel.innerHTML = `Tracing Slice ${curLayerIdx + 1}/${numLayers} (Z=${layer.z.toFixed(2)}mm | X:${pt.x.toFixed(1)} Y:${pt.y.toFixed(1)}${aStr}) <span style="color:#00ff66; font-weight:700;">[Cutting Contour]</span>`;
      }

      const app = window.app || window.xe;
      if (app?.vp) {
        app.vp.dirty = true;
        if (app.vp.request) app.vp.request();
      }

      ptIdx += Math.max(1, Math.floor(this.simSpeed));

      if (ptIdx >= contour.length) {
        // Advance to next slice
        curLayerIdx++;
        ptIdx = 0;
        if (curLayerIdx >= numLayers) {
          finishTrace();
          return;
        }
        setupSliceForTrace(curLayerIdx);
      }

      this._simAnimId = requestAnimationFrame(step);
    };

    const finishTrace = () => {
      this.isSimulating = false;
      this._activeSimLayer = -1;
      if (this.bridge.bed) this.bridge.bed.setRaysVisible(true);
      this.bridge.notify(`Trace simulation complete: ${numLayers} slices traced.`, 'ok');
      if (traceBtn) traceBtn.textContent = 'Trace 3D';
      this.setPreviewLayer(this.currentPreviewLayer >= 0 ? this.currentPreviewLayer : 0);
    };

    this._simAnimId = requestAnimationFrame(step);
    this.bridge.notify(`Tracing contour slice-by-slice (${this.simSpeed}x speed)...`, 'info');
  }

  stopTraceSimulation() {
    this.isSimulating = false;
    this._activeSimLayer = -1;
    if (this._simAnimId) {
      cancelAnimationFrame(this._simAnimId);
      this._simAnimId = null;
    }
    const traceBtn = document.getElementById('cle-hud-trace');
    if (traceBtn) traceBtn.textContent = 'Trace 3D';

    if (this.bridge.bed) this.bridge.bed.setRaysVisible(true);

    this.setPreviewLayer(this.currentPreviewLayer >= 0 ? this.currentPreviewLayer : 0);

    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
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
