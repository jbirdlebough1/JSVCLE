/**
 * CLEJS - Calibration & Machine Verification Subsystem
 * 
 * Test 1: Full-Bed Chassis Squareness & Circle Roundness Test
 *   - Enforces Xmax - 5mm, Ymax - 5mm safety boundary
 *   - Diagonal across both sets of corners intersecting at exact center of bed
 *   - 5 Concentric squares in descending size centered over diagonal
 *   - 5 Inscribed tangent circles within each square (tests chassis squareness & circle roundness)
 * 
 * Test 2: 4-Quadrant 3D Stepped & Relief Workpiece Test (120x120mm Stock, 40mm Spoilboard+Stock)
 *   - 20mm workpiece clamped on 20mm spoilboard (40mm total height)
 *   - Quad 1: Inverted Stepped Cone Hole (16mm total Z, 0.1mm Z inc, 1.0mm step)
 *   - Quad 2: Inverted Stepped Square Hole (16mm total Z, 0.1mm Z inc, 1.0mm step)
 *   - Quad 3: Raised Cone on 4mm ZFloor (area hogged out to 4mm floor, cone rises 4mm -> 18mm peak)
 *   - Quad 4: Raised 4-Sided Square Pyramid on 4mm ZFloor (area hogged out, pyramid rises 4mm -> 18mm peak)
 * 
 * Plus: Steps/mm Calculator ($100-$103), Laser Power/Speed Matrix, Backlash Indicator Routine
 */

export class CLECalibrationEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.previewGroup = null;
    this.activeTestGCode = null;
  }

  // Retrieve active machine bed limits
  getMachineLimits() {
    const defaultX = 600;
    const defaultY = 500;
    const defaultZ = 100;
    const mach = this.bridge?.vault ? this.bridge.vault.getActiveMachine() : null;
    const bedCfg = this.bridge?.bed?.config;

    const travelX = mach?.travelX ? parseFloat(mach.travelX) : (bedCfg?.travelX || defaultX);
    const travelY = mach?.travelY ? parseFloat(mach.travelY) : (bedCfg?.travelY || defaultY);
    const travelZ = mach?.travelZ ? parseFloat(mach.travelZ) : (bedCfg?.travelZ || defaultZ);

    return {
      travelX,
      travelY,
      travelZ,
      minX: 5.0,
      maxX: travelX - 5.0,
      minY: 5.0,
      maxY: travelY - 5.0,
      centerX: travelX / 2.0,
      centerY: travelY / 2.0
    };
  }

  // =========================================================================
  // TEST ONE: FULL-BED CHASSIS SQUARENESS & CIRCLE ROUNDNESS TEST
  // =========================================================================

  generateChassisSquarenessGCode(options = {}) {
    const limits = this.getMachineLimits();
    const xMin = limits.minX; // 5.0mm
    const xMax = limits.maxX; // Xmax - 5.0mm
    const yMin = limits.minY; // 5.0mm
    const yMax = limits.maxY; // Ymax - 5.0mm
    const cx = limits.centerX;
    const cy = limits.centerY;

    const width = xMax - xMin;
    const height = yMax - yMin;
    const maxSquareSide = Math.min(width, height);

    const feed = options.feed || 1800;
    const plungeFeed = options.plungeFeed || 300;
    const spindleRPM = options.spindleRPM || 12000;
    const cutDepthZ = options.cutDepthZ !== undefined ? options.cutDepthZ : -0.20; // 0.20mm scratch/engrave depth
    const safeZ = options.safeZ || 5.0;

    // 5 Concentric squares in descending size
    const numSquares = 5;
    const squareSizes = [];
    for (let i = numSquares; i >= 1; i--) {
      squareSizes.push((maxSquareSide * i) / numSquares);
    }

    const lines = [];
    lines.push('; =================================================================');
    lines.push('; CLEJS CALIBRATION TEST 1: CHASSIS SQUARENESS & ROUNDNESS');
    lines.push('; =================================================================');
    lines.push(`; Machine Envelope: X[${xMin.toFixed(1)} to ${xMax.toFixed(1)}] Y[${yMin.toFixed(1)} to ${yMax.toFixed(1)}] (5mm Safety Insets)`);
    lines.push(`; Exact Bed Center Intersection: X=${cx.toFixed(3)}, Y=${cy.toFixed(3)}`);
    lines.push(`; Diagonal 1: (${xMin.toFixed(1)}, ${yMin.toFixed(1)}) to (${xMax.toFixed(1)}, ${yMax.toFixed(1)}) Length: ${Math.hypot(width, height).toFixed(2)}mm`);
    lines.push(`; Diagonal 2: (${xMin.toFixed(1)}, ${yMax.toFixed(1)}) to (${xMax.toFixed(1)}, ${yMin.toFixed(1)}) Length: ${Math.hypot(width, height).toFixed(2)}mm`);
    lines.push(`; 5 Concentric Squares: ${squareSizes.map(s => s.toFixed(1) + 'mm').join(', ')}`);
    lines.push(`; 5 Tangent Inscribed Circles: ${squareSizes.map(s => '⌀' + s.toFixed(1) + 'mm').join(', ')}`);
    lines.push('; Purpose: Diagonal length equality verifies chassis orthogonality (squareness);');
    lines.push(';          Circle X/Y diameters verify axis roundness and backlash freedom.');
    lines.push('; =================================================================');
    lines.push('G21 ; mm mode');
    lines.push('G90 ; Absolute coordinates');
    lines.push(`M3 S${spindleRPM} ; Spindle ON`);
    lines.push(`G0 Z${safeZ.toFixed(3)} F1000 ; Safe clearance plane`);

    // --- STEP 1: Diagonal 1 (Lower-Left to Upper-Right) ---
    lines.push('\n; --- OPERATION 1: Full-Bed Diagonal 1 (Lower-Left -> Upper-Right) ---');
    lines.push(`G0 X${xMin.toFixed(3)} Y${yMin.toFixed(3)} F3000`);
    lines.push(`G1 Z${cutDepthZ.toFixed(3)} F${plungeFeed}`);
    lines.push(`G1 X${xMax.toFixed(3)} Y${yMax.toFixed(3)} F${feed}`);
    lines.push(`G0 Z${safeZ.toFixed(3)} F1000`);

    // --- STEP 2: Diagonal 2 (Upper-Left to Lower-Right) ---
    lines.push('\n; --- OPERATION 2: Full-Bed Diagonal 2 (Upper-Left -> Lower-Right) ---');
    lines.push(`; Forms true intersection at bed center X=${cx.toFixed(3)}, Y=${cy.toFixed(3)}`);
    lines.push(`G0 X${xMin.toFixed(3)} Y${yMax.toFixed(3)} F3000`);
    lines.push(`G1 Z${cutDepthZ.toFixed(3)} F${plungeFeed}`);
    lines.push(`G1 X${xMax.toFixed(3)} Y${yMin.toFixed(3)} F${feed}`);
    lines.push(`G0 Z${safeZ.toFixed(3)} F1000`);

    // --- STEP 3: 5 Concentric Squares & Inscribed Tangent Circles (Descending Size) ---
    lines.push('\n; --- OPERATION 3: 5 Concentric Squares & Inscribed Tangent Circles ---');
    for (let k = 0; k < squareSizes.length; k++) {
      const side = squareSizes[k];
      const half = side / 2.0;
      const radius = half;
      const sqIdx = k + 1;

      lines.push(`\n; === Square #${sqIdx} & Inscribed Tangent Circle (${side.toFixed(1)}mm x ${side.toFixed(1)}mm) ===`);

      // Mill Concentric Square
      const x0 = cx - half, x1 = cx + half;
      const y0 = cy - half, y1 = cy + half;
      lines.push(`; Square #${sqIdx} Perimeter`);
      lines.push(`G0 X${x0.toFixed(3)} Y${y0.toFixed(3)} F3000`);
      lines.push(`G1 Z${cutDepthZ.toFixed(3)} F${plungeFeed}`);
      lines.push(`G1 X${x1.toFixed(3)} Y${y0.toFixed(3)} F${feed}`);
      lines.push(`G1 X${x1.toFixed(3)} Y${y1.toFixed(3)}`);
      lines.push(`G1 X${x0.toFixed(3)} Y${y1.toFixed(3)}`);
      lines.push(`G1 X${x0.toFixed(3)} Y${y0.toFixed(3)}`);
      lines.push(`G0 Z${safeZ.toFixed(3)} F1000`);

      // Mill Inscribed Tangent Circle (Touches midpoints of the 4 square sides)
      // Tangent point start at bottom: (cx, cy - radius)
      lines.push(`; Tangent Inscribed Circle #${sqIdx} (Radius: ${radius.toFixed(1)}mm, Diameter: ${side.toFixed(1)}mm)`);
      lines.push(`G0 X${cx.toFixed(3)} Y${(cy - radius).toFixed(3)} F3000`);
      lines.push(`G1 Z${cutDepthZ.toFixed(3)} F${plungeFeed}`);
      // Full 360-degree circular arc using G2 clockwise with arc center offset I=0, J=radius
      lines.push(`G2 X${cx.toFixed(3)} Y${(cy - radius).toFixed(3)} I0.000 J${radius.toFixed(3)} F${Math.round(feed * 0.9)}`);
      lines.push(`G0 Z${safeZ.toFixed(3)} F1000`);
    }

    // --- Job End ---
    lines.push('\n; === Job End & Return to Origin ===');
    lines.push('M5 ; Spindle OFF');
    lines.push(`G0 Z${(safeZ + 15).toFixed(3)} F1000 ; Clearance Retract`);
    lines.push('G0 X0.000 Y0.000 F3000 ; Return Home');
    lines.push('M30 ; Program End');

    this.activeTestGCode = lines.join('\n');
    return this.activeTestGCode;
  }

  // 3D Visualizer Preview for Test One (Diagonals, Squares, Tangent Circles on Bed)
  previewChassisSquarenessTest() {
    const app = window.app || window.xe;
    const THREE = window.THREE;
    if (!app?.vp || !THREE) return null;

    this.clearPreview();

    const container = app.vp.scene || app.vp.world;
    if (!container) return null;

    this.previewGroup = new THREE.Group();
    this.previewGroup.name = 'CLE_Calibration_Test_1_Preview';

    const limits = this.getMachineLimits();
    const xMin = limits.minX, xMax = limits.maxX;
    const yMin = limits.minY, yMax = limits.maxY;
    const cx = limits.centerX, cy = limits.centerY;
    const width = xMax - xMin, height = yMax - yMin;
    const maxSquareSide = Math.min(width, height);
    const zElevation = (this.bridge?.bed?.config?.spoilboardThickness || 20.0) + 0.15;

    // 1. Full Bed Diagonals (Bright Electric Cyan)
    const diag1Pts = [new THREE.Vector3(xMin, yMin, zElevation), new THREE.Vector3(xMax, yMax, zElevation)];
    const diag2Pts = [new THREE.Vector3(xMin, yMax, zElevation), new THREE.Vector3(xMax, yMin, zElevation)];
    const diagMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 2.5, depthTest: false });

    this.previewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(diag1Pts), diagMat));
    this.previewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(diag2Pts), diagMat));

    // 2. Center Point Reticle at Exact Bed Center
    const centerRingGeo = new THREE.RingGeometry(2.0, 4.5, 32);
    const centerMat = new THREE.MeshBasicMaterial({ color: 0xff0033, side: THREE.DoubleSide, depthTest: false });
    const centerMesh = new THREE.Mesh(centerRingGeo, centerMat);
    centerMesh.position.set(cx, cy, zElevation + 0.05);
    this.previewGroup.add(centerMesh);

    // 3. 5 Concentric Squares & Inscribed Tangent Circles
    const numSquares = 5;
    const colors = [0x10b981, 0x059669, 0x10b981, 0x34d399, 0x6ee7b7];

    for (let i = numSquares; i >= 1; i--) {
      const side = (maxSquareSide * i) / numSquares;
      const half = side / 2.0;
      const radius = half;
      const k = numSquares - i;

      // Square LineLoop
      const sqPts = [
        new THREE.Vector3(cx - half, cy - half, zElevation),
        new THREE.Vector3(cx + half, cy - half, zElevation),
        new THREE.Vector3(cx + half, cy + half, zElevation),
        new THREE.Vector3(cx - half, cy + half, zElevation)
      ];
      const sqGeo = new THREE.BufferGeometry().setFromPoints(sqPts);
      const sqMat = new THREE.LineBasicMaterial({ color: colors[k % colors.length], linewidth: 2.5, depthTest: false });
      const sqLine = new THREE.LineLoop(sqGeo, sqMat);
      this.previewGroup.add(sqLine);

      // Inscribed Tangent Circle
      const circPts = [];
      const segs = 64;
      for (let s = 0; s <= segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        circPts.push(new THREE.Vector3(cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius, zElevation));
      }
      const circGeo = new THREE.BufferGeometry().setFromPoints(circPts);
      const circMat = new THREE.LineBasicMaterial({ color: 0xfacc15, linewidth: 2.0, depthTest: false });
      const circLine = new THREE.Line(circGeo, circMat);
      this.previewGroup.add(circLine);
    }

    // 4. Test Info Label
    const sprite = this.createLabelSprite(THREE, `Chassis Squareness: 5 Squares + Diagonals (${limits.travelX}x${limits.travelY}mm)`, '#00e5ff');
    sprite.position.set(cx, yMax + 12, zElevation + 5);
    sprite.scale.set(45, 14, 1);
    this.previewGroup.add(sprite);

    container.add(this.previewGroup);

    // Smoothly center camera over bed
    if (app.vp.view) {
      app.vp.view.target.set(cx, cy, zElevation);
      app.vp.view.dist = Math.max(limits.travelX, limits.travelY) * 1.35;
      app.vp.view.az = 0.0;
      app.vp.view.el = 1.1; // top-down perspective
      if (app.vp.updateCamera) app.vp.updateCamera();
    }
    app.vp.dirty = true;
    if (app.vp.request) app.vp.request();

    this.bridge.notify(`Test 1 Preview: Diagonals + 5 Concentric Squares & Tangent Circles mounted on bed.`, 'ok');
    return this.previewGroup;
  }

  // =========================================================================
  // TEST TWO: 4-QUADRANT 3D STEPPED & RELIEF TEST (120x120mm Stock, 40mm Spoilboard+Stock)
  // =========================================================================

  generateQuadrant3DTestGCode(options = {}) {
    const feed = options.feed || 1500;
    const plungeFeed = options.plungeFeed || 350;
    const spindleRPM = options.spindleRPM || 14000;
    const safeZ = options.safeZ || 5.0; // 5mm above workpiece top

    // Workpiece & Spoilboard Dimensions
    const stockW = 120.0;
    const stockD = 120.0;
    const stockH = 20.0; // 20mm workpiece
    const spoilboardH = 20.0; // 20mm spoilboard (40mm total stack)

    // Z Levels referenced to Workpiece Top (Z=0.0):
    // Z = 0.0: Workpiece Top Surface
    // Z = -16.0: 4mm Workpiece Remaining Floor (16mm cut depth)
    // Z = -2.0: 18mm Peak of Raised Features (2mm below original top, 14mm above 4mm floor)
    // Z = -20.0: Spoilboard Top / Workpiece Bottom (Never cut!)
    const zTop = 0.0;
    const zFloor = -16.0; // Leaves 4mm workpiece remaining
    const zPeak = -2.0;   // 18mm from bottom (spoilboard)
    const zInc = options.zInc || 0.10; // 0.1mm Z increment per user spec
    const xyStep = options.xyStep || 1.0; // 1.0mm step X/Y per user spec

    // Quadrant Centers (Workpiece centered at origin X: [0, 120], Y: [0, 120])
    // Clamp clearance: 10mm outside margins; Quadrant zones: 50x50mm active pocket
    const Q1 = { cx: 30.0, cy: 90.0, name: 'Quad 1: Inverted Stepped Cone Hole' };
    const Q2 = { cx: 90.0, cy: 90.0, name: 'Quad 2: Inverted Stepped Square Hole' };
    const Q3 = { cx: 30.0, cy: 30.0, name: 'Quad 3: Raised Cone on 4mm Floor' };
    const Q4 = { cx: 90.0, cy: 30.0, name: 'Quad 4: Raised Square Pyramid on 4mm Floor' };

    const selectedQuad = options.quadrant || 'all'; // 'all', '1', '2', '3', '4'

    const lines = [];
    lines.push('; =================================================================');
    lines.push('; CLEJS CALIBRATION TEST 2: 4-QUADRANT 3D STEPPED & RELIEF TEST');
    lines.push('; =================================================================');
    lines.push(`; Workpiece Dimensions: ${stockW}mm x ${stockD}mm x ${stockH}mm (Must be securely clamped!)`);
    lines.push(`; Spoilboard: ${spoilboardH}mm Thickness (Total Stack: ${stockH + spoilboardH}mm from machine table)`);
    lines.push('; WCS Origin (G54): Lower-Left Corner of Workpiece, Z=0.0 at WORKPIECE TOP');
    lines.push(`; Parameters: Z-Increment = ${zInc.toFixed(2)}mm, Stepover = ${xyStep.toFixed(2)}mm`);
    lines.push('; Quad 1: Inverted Stepped Cone Hole (16mm Z total, 0.1mm Z inc, 1.0mm step)');
    lines.push('; Quad 2: Inverted Stepped Square Hole (16mm Z total, leaves stepped cavity)');
    lines.push('; Quad 3: Raised Cone rising from 4mm ZFloor to 18mm Peak (quad hogged to 4mm)');
    lines.push('; Quad 4: Raised Square 4-Sided Pyramid rising 4mm to 18mm Peak on 4mm ZFloor');
    lines.push('; =================================================================');
    lines.push('G21 ; mm mode');
    lines.push('G90 ; Absolute coordinates');
    lines.push(`M3 S${spindleRPM} ; Spindle ON`);
    lines.push(`G0 Z${safeZ.toFixed(3)} F1000 ; Safe Retract`);

    // --- QUADRANT 1: INVERTED STEPPED CONE HOLE ---
    if (selectedQuad === 'all' || selectedQuad === '1') {
      lines.push('\n; =================================================================');
      lines.push('; QUADRANT 1: Inverted Stepped Cone Hole (16mm Z Total Depth)');
      lines.push('; Concentric circular steps: Top ⌀48mm -> Bottom ⌀16mm at Z=-16.0mm');
      lines.push('; =================================================================');

      const maxR = 24.0; // 48mm top diameter
      const minR = 8.0;  // 16mm bottom diameter
      const totalDepth = Math.abs(zFloor); // 16.0mm
      const passes = Math.round(totalDepth / zInc);

      for (let p = 1; p <= passes; p++) {
        const curZ = -(p * zInc);
        const depthFraction = (p * zInc) / totalDepth;
        const curR = maxR - depthFraction * (maxR - minR);

        lines.push(`; Q1 Pass ${p}/${passes} (Z=${curZ.toFixed(3)}, R=${curR.toFixed(3)}mm)`);
        lines.push(`G0 X${Q1.cx.toFixed(3)} Y${(Q1.cy - curR).toFixed(3)} F3000`);
        lines.push(`G1 Z${curZ.toFixed(3)} F${plungeFeed}`);
        // Full 360-degree circle
        lines.push(`G2 X${Q1.cx.toFixed(3)} Y${(Q1.cy - curR).toFixed(3)} I0.000 J${curR.toFixed(3)} F${feed}`);

        // Pocket clearing raster at step interval if needed
        if (p % Math.round(1.0 / zInc) === 0 || p === passes) {
          lines.push(`G0 Z${(curZ + 1.0).toFixed(3)} F1000`);
        }
      }
      lines.push(`G0 Z${safeZ.toFixed(3)} F1000`);
    }

    // --- QUADRANT 2: INVERTED STEPPED SQUARE PYRAMID HOLE ---
    if (selectedQuad === 'all' || selectedQuad === '2') {
      lines.push('\n; =================================================================');
      lines.push('; QUADRANT 2: Inverted Stepped Square Hole (16mm Z Total Depth)');
      lines.push('; Concentric square steps: Top 48x48mm -> Bottom 16x16mm at Z=-16.0mm');
      lines.push('; =================================================================');

      const maxHalf = 24.0; // 48mm top square
      const minHalf = 8.0;  // 16mm bottom square
      const totalDepth = Math.abs(zFloor);
      const passes = Math.round(totalDepth / zInc);

      for (let p = 1; p <= passes; p++) {
        const curZ = -(p * zInc);
        const depthFraction = (p * zInc) / totalDepth;
        const curHalf = maxHalf - depthFraction * (maxHalf - minHalf);

        const x0 = Q2.cx - curHalf, x1 = Q2.cx + curHalf;
        const y0 = Q2.cy - curHalf, y1 = Q2.cy + curHalf;

        lines.push(`; Q2 Pass ${p}/${passes} (Z=${curZ.toFixed(3)}, Side=${(curHalf * 2).toFixed(2)}mm)`);
        lines.push(`G0 X${x0.toFixed(3)} Y${y0.toFixed(3)} F3000`);
        lines.push(`G1 Z${curZ.toFixed(3)} F${plungeFeed}`);
        lines.push(`G1 X${x1.toFixed(3)} Y${y0.toFixed(3)} F${feed}`);
        lines.push(`G1 X${x1.toFixed(3)} Y${y1.toFixed(3)}`);
        lines.push(`G1 X${x0.toFixed(3)} Y${y1.toFixed(3)}`);
        lines.push(`G1 X${x0.toFixed(3)} Y${y0.toFixed(3)}`);

        if (p % Math.round(1.0 / zInc) === 0 || p === passes) {
          lines.push(`G0 Z${(curZ + 1.0).toFixed(3)} F1000`);
        }
      }
      lines.push(`G0 Z${safeZ.toFixed(3)} F1000`);
    }

    // --- QUADRANT 3: RAISED CONE ON 4mm ZFLOOR ---
    if (selectedQuad === 'all' || selectedQuad === '3') {
      lines.push('\n; =================================================================');
      lines.push('; QUADRANT 3: Raised Cone on 4mm ZFloor (Quad hogged out down to Z=-16.0)');
      lines.push('; Cone rises from 4mm floor (Z=-16.0mm, Base ⌀44mm) to 18mm Peak (Z=-2.0mm, Apex ⌀6mm)');
      lines.push('; =================================================================');

      const qMinX = 5.0, qMaxX = 55.0;
      const qMinY = 5.0, qMaxY = 55.0;
      const baseR = 22.0; // 44mm diameter base
      const peakR = 3.0;  // 6mm diameter peak
      const totalReliefH = 14.0; // 18mm - 4mm = 14mm height above floor

      // Top-down depth passes from Z = -2.0 down to Z = -16.0 (hogging out material outside cone)
      const passes = Math.round(Math.abs(zFloor - zPeak) / zInc);

      for (let p = 1; p <= passes; p++) {
        const curZ = zPeak - (p * zInc);
        const elevationAboveFloor = (zFloor - curZ); // 0 at floor, 14 at peak
        const coneFraction = (curZ - zFloor) / totalReliefH; // 0 at floor, 1 at peak
        const curConeR = baseR - coneFraction * (baseR - peakR);

        lines.push(`; Q3 Hogging Pass ${p}/${passes} (Z=${curZ.toFixed(3)}, Cone R=${curConeR.toFixed(2)}mm)`);
        // Quad perimeter boundary cut
        lines.push(`G0 X${qMinX.toFixed(3)} Y${qMinY.toFixed(3)} F3000`);
        lines.push(`G1 Z${curZ.toFixed(3)} F${plungeFeed}`);
        lines.push(`G1 X${qMaxX.toFixed(3)} Y${qMinY.toFixed(3)} F${feed}`);
        lines.push(`G1 X${qMaxX.toFixed(3)} Y${qMaxY.toFixed(3)}`);
        lines.push(`G1 X${qMinX.toFixed(3)} Y${qMaxY.toFixed(3)}`);
        lines.push(`G1 X${qMinX.toFixed(3)} Y${qMinY.toFixed(3)}`);

        // Circular cone contour finish
        lines.push(`G0 X${Q3.cx.toFixed(3)} Y${(Q3.cy - curConeR).toFixed(3)} F3000`);
        lines.push(`G1 Z${curZ.toFixed(3)} F${plungeFeed}`);
        lines.push(`G2 X${Q3.cx.toFixed(3)} Y${(Q3.cy - curConeR).toFixed(3)} I0.000 J${curConeR.toFixed(3)} F${feed}`);

        if (p % Math.round(1.0 / zInc) === 0 || p === passes) {
          lines.push(`G0 Z${(curZ + 1.0).toFixed(3)} F1000`);
        }
      }
      lines.push(`G0 Z${safeZ.toFixed(3)} F1000`);
    }

    // --- QUADRANT 4: RAISED SQUARE PYRAMID ON 4mm ZFLOOR ---
    if (selectedQuad === 'all' || selectedQuad === '4') {
      lines.push('\n; =================================================================');
      lines.push('; QUADRANT 4: Raised 4-Sided Square Pyramid on 4mm ZFloor');
      lines.push('; Pyramid rises from 4mm floor (Z=-16.0mm, Base 44x44mm) to 18mm Peak (Z=-2.0mm, Peak 6x6mm)');
      lines.push('; =================================================================');

      const qMinX = 65.0, qMaxX = 115.0;
      const qMinY = 5.0, qMaxY = 55.0;
      const baseHalf = 22.0; // 44mm base
      const peakHalf = 3.0;  // 6mm peak
      const totalReliefH = 14.0;
      const passes = Math.round(Math.abs(zFloor - zPeak) / zInc);

      for (let p = 1; p <= passes; p++) {
        const curZ = zPeak - (p * zInc);
        const pyramidFraction = (curZ - zFloor) / totalReliefH; // 0 at floor, 1 at peak
        const curPyrHalf = baseHalf - pyramidFraction * (baseHalf - peakHalf);

        lines.push(`; Q4 Hogging Pass ${p}/${passes} (Z=${curZ.toFixed(3)}, Pyramid Side=${(curPyrHalf * 2).toFixed(2)}mm)`);
        // Quad outer bounding clearing cut
        lines.push(`G0 X${qMinX.toFixed(3)} Y${qMinY.toFixed(3)} F3000`);
        lines.push(`G1 Z${curZ.toFixed(3)} F${plungeFeed}`);
        lines.push(`G1 X${qMaxX.toFixed(3)} Y${qMinY.toFixed(3)} F${feed}`);
        lines.push(`G1 X${qMaxX.toFixed(3)} Y${qMaxY.toFixed(3)}`);
        lines.push(`G1 X${qMinX.toFixed(3)} Y${qMaxY.toFixed(3)}`);
        lines.push(`G1 X${qMinX.toFixed(3)} Y${qMinY.toFixed(3)}`);

        // 4-sided pyramid perimeter pass
        const px0 = Q4.cx - curPyrHalf, px1 = Q4.cx + curPyrHalf;
        const py0 = Q4.cy - curPyrHalf, py1 = Q4.cy + curPyrHalf;
        lines.push(`G0 X${px0.toFixed(3)} Y${py0.toFixed(3)} F3000`);
        lines.push(`G1 Z${curZ.toFixed(3)} F${plungeFeed}`);
        lines.push(`G1 X${px1.toFixed(3)} Y${py0.toFixed(3)} F${feed}`);
        lines.push(`G1 X${px1.toFixed(3)} Y${py1.toFixed(3)}`);
        lines.push(`G1 X${px0.toFixed(3)} Y${py1.toFixed(3)}`);
        lines.push(`G1 X${px0.toFixed(3)} Y${py0.toFixed(3)}`);

        if (p % Math.round(1.0 / zInc) === 0 || p === passes) {
          lines.push(`G0 Z${(curZ + 1.0).toFixed(3)} F1000`);
        }
      }
      lines.push(`G0 Z${safeZ.toFixed(3)} F1000`);
    }

    // --- Job End ---
    lines.push('\n; === Job End & Safe Park ===');
    lines.push('M5 ; Spindle OFF');
    lines.push(`G0 Z${(safeZ + 20).toFixed(3)} F1000 ; Safe Retract`);
    lines.push('G0 X0.000 Y0.000 F3000 ; Return Home');
    lines.push('M30 ; Program End');

    this.activeTestGCode = lines.join('\n');
    return this.activeTestGCode;
  }

  // 3D Visualizer Preview for Test Two (120x120mm Stock, Clamps, 4 Quadrants with 3D Reliefs)
  previewQuadrant3DTest(options = {}) {
    const app = window.app || window.xe;
    const THREE = window.THREE;
    if (!app?.vp || !THREE) return null;

    this.clearPreview();

    const container = app.vp.scene || app.vp.world;
    if (!container) return null;

    this.previewGroup = new THREE.Group();
    this.previewGroup.name = 'CLE_Calibration_Test_2_Preview';

    const bedCfg = this.bridge?.bed?.config || {};
    const spoilboardThickness = bedCfg.spoilboardThickness || 20.0;
    const stockW = 120.0, stockD = 120.0, stockH = 20.0;

    // Center the 120x120mm block on the bed
    const limits = this.getMachineLimits();
    const originX = limits.centerX - stockW / 2;
    const originY = limits.centerY - stockD / 2;
    const zBase = spoilboardThickness + 0.10; // Top of spoilboard

    // 1. Spoilboard Base Plate under Workpiece
    const spoilboardPlateGeo = new THREE.BoxGeometry(stockW + 40, stockD + 40, spoilboardThickness);
    const spoilboardPlateMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a, // Navy Spoilboard
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65
    });
    const spoilboardPlate = new THREE.Mesh(spoilboardPlateGeo, spoilboardPlateMat);
    spoilboardPlate.position.set(originX + stockW / 2, originY + stockD / 2, zBase - spoilboardThickness / 2);
    this.previewGroup.add(spoilboardPlate);

    // 2. 120x120x20mm Translucent Stock Block (Seated on spoilboard)
    const stockGeo = new THREE.BoxGeometry(stockW, stockD, stockH);
    const stockMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Light Slate / Raw Aluminum Stock
      transparent: true,
      opacity: 0.35,
      metalness: 0.4,
      roughness: 0.3
    });
    const stockMesh = new THREE.Mesh(stockGeo, stockMat);
    stockMesh.position.set(originX + stockW / 2, originY + stockD / 2, zBase + stockH / 2);
    this.previewGroup.add(stockMesh);

    // Stock fine wireframe edges
    const stockEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(stockGeo),
      new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 1.5 })
    );
    stockMesh.add(stockEdges);

    // 3. Safety Clamps (4 corners clamping workpiece to spoilboard per user spec: "this must be clamped")
    const clampMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 });
    const clampPositions = [
      { x: originX - 4, y: originY - 4 },
      { x: originX + stockW + 4, y: originY - 4 },
      { x: originX + stockW + 4, y: originY + stockD + 4 },
      { x: originX - 4, y: originY + stockD + 4 }
    ];
    clampPositions.forEach((cp, idx) => {
      const clampGeo = new THREE.BoxGeometry(16, 16, 12);
      const clampMesh = new THREE.Mesh(clampGeo, clampMat);
      clampMesh.position.set(cp.x, cp.y, zBase + stockH);
      this.previewGroup.add(clampMesh);
      const boltMesh = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 8, 12), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9 }));
      boltMesh.position.set(cp.x, cp.y, zBase + stockH + 6);
      boltMesh.rotation.x = Math.PI / 2;
      this.previewGroup.add(boltMesh);
    });

    // 4. Quadrant Geometry Features in 3D:
    const qCenters = [
      { id: 1, cx: originX + 30, cy: originY + 90, type: 'cone_hole', label: 'Q1: Stepped Cone Hole (16mm Z)' },
      { id: 2, cx: originX + 90, cy: originY + 90, type: 'square_hole', label: 'Q2: Stepped Square Hole (16mm Z)' },
      { id: 3, cx: originX + 30, cy: originY + 30, type: 'raised_cone', label: 'Q3: Raised Cone (4mm->18mm)' },
      { id: 4, cx: originX + 90, cy: originY + 30, type: 'raised_pyramid', label: 'Q4: Raised Pyramid (4mm->18mm)' }
    ];

    qCenters.forEach(q => {
      if (q.type === 'cone_hole') {
        // Q1: Inverted Stepped Cone Hole (Top ⌀48mm -> Bottom ⌀16mm, depth 16mm down to 4mm floor)
        // Render 16 concentric circular steps
        const numSteps = 16;
        for (let s = 0; s < numSteps; s++) {
          const depth = (s + 1) * 1.0;
          const radius = 24.0 - (depth / 16.0) * 16.0;
          const circPts = [];
          for (let a = 0; a <= 36; a++) {
            const ang = (a / 36) * Math.PI * 2;
            circPts.push(new THREE.Vector3(q.cx + Math.cos(ang) * radius, q.cy + Math.sin(ang) * radius, zBase + stockH - depth));
          }
          const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(circPts), new THREE.LineBasicMaterial({ color: 0x00e5ff, linewidth: 2 }));
          this.previewGroup.add(ring);
        }
      } else if (q.type === 'square_hole') {
        // Q2: Inverted Stepped Square Hole (Top 48x48mm -> Bottom 16x16mm, depth 16mm down to 4mm floor)
        const numSteps = 16;
        for (let s = 0; s < numSteps; s++) {
          const depth = (s + 1) * 1.0;
          const half = 24.0 - (depth / 16.0) * 16.0;
          const sqPts = [
            new THREE.Vector3(q.cx - half, q.cy - half, zBase + stockH - depth),
            new THREE.Vector3(q.cx + half, q.cy - half, zBase + stockH - depth),
            new THREE.Vector3(q.cx + half, q.cy + half, zBase + stockH - depth),
            new THREE.Vector3(q.cx - half, q.cy + half, zBase + stockH - depth)
          ];
          const sq = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(sqPts), new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 }));
          this.previewGroup.add(sq);
        }
      } else if (q.type === 'raised_cone') {
        // Q3: Raised Cone on 4mm Floor (Base ⌀44mm at Z=4mm -> Peak ⌀6mm at Z=18mm)
        // 4mm Hogged floor plane
        const floorGeo = new THREE.PlaneGeometry(50, 50);
        const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ color: 0x059669, side: THREE.DoubleSide, opacity: 0.35, transparent: true }));
        floorMesh.position.set(q.cx, q.cy, zBase + 4.0);
        this.previewGroup.add(floorMesh);

        // Solid Raised Cone Mesh
        const coneHeight = 14.0; // 18mm - 4mm
        const coneMeshGeo = new THREE.ConeGeometry(22, coneHeight, 32);
        coneMeshGeo.rotateX(Math.PI / 2); // orient upward along Z
        coneMeshGeo.translate(0, 0, coneHeight / 2);
        const coneMesh = new THREE.Mesh(coneMeshGeo, new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3, metalness: 0.6 }));
        coneMesh.position.set(q.cx, q.cy, zBase + 4.0);
        this.previewGroup.add(coneMesh);

        // Circular contour rings along cone height
        for (let h = 0; h <= 14; h += 2) {
          const r = 22.0 - (h / 14.0) * 19.0;
          const ringPts = [];
          for (let a = 0; a <= 36; a++) {
            const ang = (a / 36) * Math.PI * 2;
            ringPts.push(new THREE.Vector3(q.cx + Math.cos(ang) * r, q.cy + Math.sin(ang) * r, zBase + 4.0 + h));
          }
          this.previewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0x34d399 })));
        }
      } else if (q.type === 'raised_pyramid') {
        // Q4: Raised 4-Sided Square Pyramid on 4mm Floor (Base 44x44mm at Z=4mm -> Peak 6x6mm at Z=18mm)
        const floorGeo = new THREE.PlaneGeometry(50, 50);
        const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshBasicMaterial({ color: 0x0284c7, side: THREE.DoubleSide, opacity: 0.35, transparent: true }));
        floorMesh.position.set(q.cx, q.cy, zBase + 4.0);
        this.previewGroup.add(floorMesh);

        // 4-sided pyramid rings
        for (let h = 0; h <= 14; h += 2) {
          const half = 22.0 - (h / 14.0) * 19.0;
          const pyrPts = [
            new THREE.Vector3(q.cx - half, q.cy - half, zBase + 4.0 + h),
            new THREE.Vector3(q.cx + half, q.cy - half, zBase + 4.0 + h),
            new THREE.Vector3(q.cx + half, q.cy + half, zBase + 4.0 + h),
            new THREE.Vector3(q.cx - half, q.cy + half, zBase + 4.0 + h)
          ];
          this.previewGroup.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pyrPts), new THREE.LineBasicMaterial({ color: 0x38bdf8 })));
        }

        // Pyramid 4 ridge corner lines
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const ridgePts = [
            new THREE.Vector3(q.cx + sx * 22, q.cy + sy * 22, zBase + 4.0),
            new THREE.Vector3(q.cx + sx * 3, q.cy + sy * 3, zBase + 18.0)
          ];
          this.previewGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ridgePts), new THREE.LineBasicMaterial({ color: 0x0284c7, linewidth: 2 })));
        }
      }

      // Quadrant Label
      const qSprite = this.createLabelSprite(THREE, q.label, '#ffffff');
      qSprite.position.set(q.cx, q.cy, zBase + stockH + 6);
      qSprite.scale.set(28, 8, 1);
      this.previewGroup.add(qSprite);
    });

    container.add(this.previewGroup);

    // Frame camera on workpiece
    if (app.vp.view) {
      app.vp.view.target.set(originX + stockW / 2, originY + stockD / 2, zBase + stockH / 2);
      app.vp.view.dist = 260;
      app.vp.view.az = 0.55;
      app.vp.view.el = 0.65;
      if (app.vp.updateCamera) app.vp.updateCamera();
    }
    app.vp.dirty = true;
    if (app.vp.request) app.vp.request();

    this.bridge.notify('Test 2 Preview: 120x120mm Stock (40mm stack), Clamps & 4-Quadrant 3D Reliefs mounted.', 'ok');
    return this.previewGroup;
  }

  // Clear 3D preview
  clearPreview() {
    if (this.previewGroup) {
      if (this.previewGroup.parent) {
        this.previewGroup.parent.remove(this.previewGroup);
      }
      this.previewGroup.traverse((obj) => {
        if (obj.geometry) {
          try { obj.geometry.dispose(); } catch (e) {}
        }
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => {
            if (m.map) {
              try { m.map.dispose(); } catch (e) {}
            }
            try { m.dispose(); } catch (e) {}
          });
        }
      });
      this.previewGroup = null;
    }
    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // Export current test G-code to local .nc file
  exportTestGCode(filename = 'CLEJS_Calibration_Test.nc') {
    if (!this.activeTestGCode) {
      this.bridge.notify('Generate a calibration test first before exporting.', 'error');
      return;
    }
    const blob = new Blob([this.activeTestGCode], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    this.bridge.notify(`Exported ${filename} (${(this.activeTestGCode.length / 1024).toFixed(1)} KB)`, 'ok');
  }

  // Upload current test G-code to FluidNC SD Card
  async uploadTestGCodeToSD(filename = 'Calibration_Test.nc') {
    if (!this.activeTestGCode) {
      this.bridge.notify('Generate a calibration test first before uploading.', 'error');
      return;
    }
    if (!this.bridge?.fluidnc) {
      this.bridge.notify('FluidNC connection not available.', 'error');
      return;
    }
    this.bridge.notify(`Uploading ${filename} to FluidNC SD Card...`, 'info');
    await this.bridge.fluidnc.uploadFileToSD(filename, this.activeTestGCode);
  }

  // Stream current test G-code directly to FluidNC
  runTestOnMachine() {
    if (!this.activeTestGCode) {
      this.bridge.notify('Generate a calibration test first before running.', 'error');
      return;
    }
    if (!this.bridge?.fluidnc) {
      this.bridge.notify('FluidNC connection not available.', 'error');
      return;
    }
    this.bridge.notify('Sending calibration test G-code stream to FluidNC...', 'info');
    const lines = this.activeTestGCode.split('\n');
    lines.forEach((l, idx) => {
      const trimmed = l.trim();
      if (trimmed && !trimmed.startsWith(';')) {
        setTimeout(() => this.bridge.fluidnc.sendGCode(trimmed), idx * 25);
      }
    });
  }

  // Sprite label helper
  createLabelSprite(THREE, text, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, 252, 60);

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.channel = 0;
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.renderOrder = 999;
    return sprite;
  }

  // =========================================================================
  // ADDITIONAL CALIBRATION HELPERS (Steps/mm, Laser Matrix, Backlash)
  // =========================================================================

  calculateStepsPerMm(axis, currentSteps, commandedDist, measuredDist) {
    const cSteps = parseFloat(currentSteps);
    const cmd = parseFloat(commandedDist);
    const meas = parseFloat(measuredDist);

    if (!cSteps || !cmd || !meas) {
      throw new Error('All values must be valid positive numbers.');
    }

    const newSteps = (cSteps * (cmd / meas)).toFixed(4);
    const settingMap = { X: '$100', Y: '$101', Z: '$102', A: '$103' };
    const param = settingMap[axis.toUpperCase()] || '$100';
    const gcode = `${param}=${newSteps}`;

    return {
      axis,
      oldSteps: cSteps,
      commanded: cmd,
      measured: meas,
      newSteps: parseFloat(newSteps),
      command: gcode
    };
  }

  generateLaserTestMatrix(options = {}) {
    const minSpeed = options.minSpeed || 500;
    const maxSpeed = options.maxSpeed || 2500;
    const speedSteps = options.speedSteps || 5;
    const minPower = options.minPower || 10;
    const maxPower = options.maxPower || 100;
    const powerSteps = options.powerSteps || 5;
    const squareSize = options.squareSize || 8;
    const spacing = options.spacing || 3;

    const gcode = [];
    gcode.push('; --- CLEJS Laser Calibration Matrix Test Card ---');
    gcode.push('G21 ; mm mode');
    gcode.push('G90 ; Absolute coordinates');
    gcode.push('M5 ; Ensure laser off');

    const dSpeed = (maxSpeed - minSpeed) / (speedSteps - 1 || 1);
    const dPower = (maxPower - minPower) / (powerSteps - 1 || 1);

    for (let row = 0; row < speedSteps; row++) {
      const feed = Math.round(minSpeed + row * dSpeed);
      for (let col = 0; col < powerSteps; col++) {
        const pPct = Math.round(minPower + col * dPower);
        const sVal = Math.round((pPct / 100) * 1000);
        const x = col * (squareSize + spacing);
        const y = row * (squareSize + spacing);

        gcode.push(`; Row ${row} Col ${col}: Speed ${feed}mm/min, Power ${pPct}% (S${sVal})`);
        gcode.push(`G0 X${x} Y${y}`);
        gcode.push(`M3 S${sVal}`);
        gcode.push(`G1 X${x + squareSize} Y${y} F${feed}`);
        gcode.push(`G1 X${x + squareSize} Y${y + squareSize}`);
        gcode.push(`G1 X${x} Y${y + squareSize}`);
        gcode.push(`G1 X${x} Y${y}`);
        gcode.push('M5 ; Laser off');
      }
    }
    gcode.push('G0 X0 Y0 ; Return origin');
    return gcode.join('\n');
  }

  generateBacklashTestGCode(axis = 'X', testDistance = 10, feed = 500) {
    const ax = axis.toUpperCase();
    return [
      '; --- CLEJS Backlash Dial Indicator Test Routine ---',
      'G21 G90',
      `G0 ${ax}0 F${feed}`,
      '; Set dial indicator to 0.000 now',
      'G4 P2',
      `; Moving forward by ${testDistance}mm`,
      `G1 ${ax}${testDistance} F${feed}`,
      'G4 P2',
      '; Moving backward to 0.000',
      `G1 ${ax}0 F${feed}`,
      '; Indicator reading now equals actual mechanical backlash.'
    ].join('\n');
  }
}
