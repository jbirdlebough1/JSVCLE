/**
 * CLEJS - 4th Axis Rotary (A-Axis) Engine & Three.js Visualizer
 * TwoTrees TTC6050 / TTC450 4th Axis Kit Integration
 * Turning Mode (RPM & deg/s), Settable Gear Ratio (5:1 default), Center Y & Z=45mm Mounting,
 * -5mm Safety Floor Boundary, Radial 3D Rotation, and Top-Down Index Mode (CNC & Laser)
 * 
 * Auto-fits Chuck (headstock) and Opposing Center (tailstock live center) to clamp at each end of the object.
 * Pure on-axis radial rotation with zero orbital wobble and zero dummy stock clutter.
 */

export class CLERotaryEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.enabled = false;

    // --- Hardware & Pulley Specifications ---
    // TwoTrees A-Axis Kit: NEMA17 (200 steps/rev, 1.8°), 15mm motor pulley, 55mm chuck pulley, 5:1 ratio default
    this.gearRatio = 5.0;            // Settable reduction ratio (default 5:1; supports 4:1, 5:1, or custom)
    this.motorPulleyMm = 15.0;       // Motor timing pulley diameter / pitch (15mm)
    this.chuckPulleyMm = 55.0;       // Chuck spindle timing pulley diameter / pitch (55mm)
    this.stepsPerRev = 200;          // NEMA17 standard full steps (1.8°/step)
    this.microsteps = 16;            // FluidNC standard microstepping subdivision (16x)

    // --- Mounting Dimensions & Centers ---
    // A-Axis replaces the spoilboard and sits directly on the aluminum machine bed table (Z = +0.10mm)
    this.centerHeightMm = 45.0;      // Center of A-axis rotation is 45.0mm from bed surface
    this.centerY = 250.0;            // Center of chuck in Y (center of 500mm machine travel, settable)

    // --- Chuck Physical Geometry & Machine Z Clearances ---
    this.chuckAssemblyHeightMm = 66.0; // TwoTrees chuck assembly is 66mm tall (fits under X-axis gantry)
    this.bedSafetyMarginMm = 5.0;      // 5mm minimum clearance between rotating material bottom and aluminum bed
    this.machineMaxZ = 100.0;          // Max Z travel of machine (from active machine config or 100mm default)

    // Chuck & Opposing Center X clamping positions
    this.chuckX = 20.0;              // Headstock chuck face position along X-axis
    this.tailstockX = 170.0;         // Opposing live center tip position along X-axis
    this.stockLength = 150.0;        // mm clamped distance (tailstockX - chuckX)
    this.stockDiameter = 50.0;       // mm stock diameter

    // --- Safety Boundaries ---
    this.zSafetyLimit = -5.0;        // -5mm safety boundary below rotation axis (never plunge below this!)
    this.zClearance = 10.0;          // mm safe retract clearance height above top of stock / chuck

    // --- Live Motion State ---
    this.currentAngle = 0.0;         // Current A-axis angle in degrees [0..360)
    this.mode = 'index';             // 'index' | 'turning' | 'continuous'

    // Turning Mode (Lathe Spindle Continuous Rotation)
    this.isTurning = false;
    this.turningRPM = 60.0;          // Rotations per minute
    this.turningDegPerSec = 360.0;   // Degrees per second (RPM * 6)
    this.turningDir = 1;             // +1 (CW) or -1 (CCW)
    this._turningAnimId = null;

    // Index Mode (Top-Down Multi-Sided Milling)
    this.indexMode = '4-sided';      // '2-sided' | '4-sided' | '6-sided' | '8-sided' | 'custom'
    this.customIndexStep = 15.0;     // degrees step for custom indexing
    this.currentIndexIdx = 0;        // Active indexed facet index

    // Three.js Subsystems
    this.rotaryGroup = null;
    this.headstockGroup = null;
    this.tailstockGroup = null;
    this.chuckJawsGroup = null;
    this.liveCenterCone = null;
    this.axisLine = null;
    this.safetyBoundaryMesh = null;
    this.retractPlaneMesh = null;

    // Center Point Tool Subsystems
    this.centerPointVisible = true;   // Visible by default when A-axis rotary is mounted
    this.centerPointGroup = null;
    this.chuckCenterTool = null;
    this.tailstockCenterTool = null;
    this.centerVerticalGuide = null;

    this._cachedCenterYZ = null;
  }

  // --- Calculations ---

  // Steps per degree formula: (stepsPerRev * microsteps * gearRatio) / 360
  getStepsPerDegree() {
    return (this.stepsPerRev * this.microsteps * this.gearRatio) / 360.0;
  }

  // Center of rotation in World Z (Aluminum bed is at Z = +0.10mm)
  getZCenter() {
    return 0.10 + this.centerHeightMm; // 45.10mm from world origin Z=0
  }

  // Maximum safe stock diameter permitted by bed clearance (distance from centerline to aluminum bed)
  getMaxStockDiameter(safetyMargin = this.bedSafetyMarginMm) {
    const maxRadius = Math.max(5.0, this.centerHeightMm - safetyMargin);
    return maxRadius * 2.0; // (45.0 - 5.0) * 2 = 80.0mm safe limit (90mm absolute bed contact)
  }

  // Check physical clearances against aluminum bed and 66mm chuck height
  checkClearances(diameter = this.stockDiameter) {
    const dia = parseFloat(diameter) || 0;
    const radius = dia / 2;
    const bedMargin = this.centerHeightMm - radius; // mm clearance between bottom of rotating material and bed
    const matTop = this.centerHeightMm + radius;    // mm height from bed to top of material
    const chuckTop = this.chuckAssemblyHeightMm;    // 66mm from bed (fits under X-axis)
    const zTop = this.getZTop();
    const maxSafeDia = this.getMaxStockDiameter(this.bedSafetyMarginMm); // 80mm
    const absoluteMaxDia = this.centerHeightMm * 2.0; // 90mm

    let status = 'ok';
    let message = `Material clears bed by ${bedMargin.toFixed(1)}mm. Top is at ${matTop.toFixed(1)}mm.`;

    if (dia > absoluteMaxDia) {
      status = 'collision';
      message = `CRITICAL COLLISION: Material (Ø${dia.toFixed(1)}mm) strikes the aluminum bed table! Exceeds 90mm physical limit by ${(dia - absoluteMaxDia).toFixed(1)}mm.`;
    } else if (dia > maxSafeDia) {
      status = 'warning';
      message = `WARNING: Material (Ø${dia.toFixed(1)}mm) leaves only ${bedMargin.toFixed(1)}mm clearance to bed (safe limit is Ø${maxSafeDia.toFixed(0)}mm).`;
    } else if (matTop > chuckTop) {
      status = 'notice';
      message = `Material top (${matTop.toFixed(1)}mm) extends ${(matTop - chuckTop).toFixed(1)}mm above 66mm chuck. Verify X-axis gantry clearance.`;
    } else {
      status = 'shielded';
      message = `Material fits within 66mm chuck profile (${(chuckTop - matTop).toFixed(1)}mm below chuck top). Full X-axis gantry clearance.`;
    }

    return {
      status,
      message,
      diameter: dia,
      bedMargin,
      matTop,
      chuckTop,
      zTop,
      maxSafeDia,
      absoluteMaxDia
    };
  }

  // Safe retract clearance plane (must clear both top of material and 66mm chuck assembly)
  getZTop() {
    const matRadius = this.stockDiameter / 2;
    const matTop = this.getZCenter() + matRadius;
    const chuckTop = 0.10 + this.chuckAssemblyHeightMm; // 0.10 + 66.0 = 66.10mm
    const highestObstacle = Math.max(matTop, chuckTop);
    return highestObstacle + this.zClearance;
  }

  // Lowest allowable cutting depth (-5mm safety boundary from centerline)
  getZBot() {
    const zCenter = this.getZCenter();
    const floorLimit = 0.10 + this.bedSafetyMarginMm; // 5.10mm above bed
    const nominalBot = zCenter + this.zSafetyLimit;   // 45.10 - 5.0 = 40.10mm
    return Math.max(floorLimit, nominalBot);
  }

  getWorldContainer() {
    const app = window.app || window.xe;
    if (!app) return null;
    return (app.vp && (app.vp.scene || app.vp.world)) || (app.scene && app.scene.root ? app.scene.root.parent : null);
  }

  // --- CAD Object Bounds Detection ---
  getObjectBounds() {
    const app = window.app || window.xe;
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    let hasObject = false;

    // 1. Try JumpStart allBox()
    if (app?.scene?.allBox) {
      try {
        const box = app.scene.allBox();
        if (box && isFinite(box.min.x) && Math.abs(box.min.x) < 1e7) {
          minX = box.min.x; maxX = box.max.x;
          minY = box.min.y; maxY = box.max.y;
          minZ = box.min.z; maxZ = box.max.z;
          hasObject = true;
        }
      } catch (e) {}
    }

    // 2. Try scene views
    if (!hasObject && app?.scene?.views && app.scene.views.size > 0) {
      try {
        for (const [id, view] of app.scene.views) {
          if (view.data?.bbox) {
            const b = view.data.bbox;
            if (b.min && b.max) {
              minX = Math.min(minX, b.min[0]); maxX = Math.max(maxX, b.max[0]);
              minY = Math.min(minY, b.min[1]); maxY = Math.max(maxY, b.max[1]);
              minZ = Math.min(minZ, b.min[2]); maxZ = Math.max(maxZ, b.max[2]);
              hasObject = true;
            }
          }
        }
      } catch (e) {}
    }

    // 3. Fallback to slicer's active or sample geometry
    if (!hasObject && this.bridge?.slicer) {
      const geom = this.bridge.slicer.lastGeometry || (typeof this.bridge.slicer.getActiveBodyGeometry === 'function' ? this.bridge.slicer.getActiveBodyGeometry() : null);
      if (geom && geom.triangles && geom.triangles.length >= 9) {
        const tris = geom.triangles;
        for (let i = 0; i < tris.length; i += 3) {
          const x = tris[i], y = tris[i+1], z = tris[i+2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        hasObject = !geom.isSample;
      }
    }

    if (!isFinite(minX) || minX === maxX) { minX = 20; maxX = 170; }
    if (!isFinite(minY) || minY === maxY) { minY = this.centerY - 25; maxY = this.centerY + 25; }
    if (!isFinite(minZ) || minZ === maxZ) { minZ = this.centerHeightMm - 25; maxZ = this.centerHeightMm + 25; }

    return {
      hasObject,
      minX, maxX,
      minY, maxY,
      minZ, maxZ,
      length: maxX - minX,
      width: maxY - minY,
      height: maxZ - minZ,
      centerY: (minY + maxY) / 2,
      centerZ: (minZ + maxZ) / 2
    };
  }

  // Get CAD object center in Y and Z for mathematically pure on-axis rotation
  getObjectCenterYZ() {
    const b = this.getObjectBounds();
    return { cy: b.centerY, cz: b.centerZ };
  }

  // --- Auto-Fit Chuck & Opposing Center to Object Ends ---
  fitToObject() {
    const b = this.getObjectBounds();
    this.chuckX = Math.round(b.minX);
    this.tailstockX = Math.round(b.maxX);
    this.stockLength = Math.max(10, Math.round(b.length));
    const maxDim = Math.max(b.width, b.height);
    const rawDia = Math.max(10, Math.round(maxDim));
    const maxSafe = this.getMaxStockDiameter();

    if (rawDia > maxSafe) {
      this.stockDiameter = maxSafe;
      this.bridge.notify(`Object diameter exceeds 80mm bed clearance limit! Clamped to Ø${maxSafe}mm to prevent hitting machine bed.`, 'warn');
    } else {
      this.stockDiameter = rawDia;
    }

    if (!this.enabled) this.toggle(true);
    else this.updateAssemblyPositions();

    if (this.bridge?.bed) {
      this.bridge.bed.sitWorkpieceOnSpoilboard();
    }

    this.bridge.notify(`A-Axis clamped to object: Chuck at X=${this.chuckX}mm, Opposing Center at X=${this.tailstockX}mm (Length=${this.stockLength}mm, Ø${this.stockDiameter}mm).`, 'ok');
  }

  // --- Visualizer Initialization (Three.js Mechanical Assembly) ---
  initVisualizer() {
    const app = window.app || window.xe;
    const container = this.getWorldContainer();
    if (!container) {
      console.warn('[CLE Rotary] Three.js container not ready yet.');
      return;
    }

    const THREE = window.THREE || (app.vp && app.vp.THREE) || null;
    if (!THREE) {
      console.warn('[CLE Rotary] THREE instance not found.');
      return;
    }

    if (this.rotaryGroup) {
      if (this.rotaryGroup.parent) this.rotaryGroup.parent.remove(this.rotaryGroup);
      this.disposeRotaryGroup();
    }

    this.rotaryGroup = new THREE.Group();
    this.rotaryGroup.name = 'CLE_Rotary_Subsystem';

    const zCenter = this.getZCenter();
    const yCenter = this.centerY;
    const radius = this.stockDiameter / 2;
    const baseH = this.centerHeightMm; // 45mm tall

    // Common materials
    const headstockMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Industrial slate aluminum bracket
      metalness: 0.85,
      roughness: 0.35
    });
    const pulleyMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
    const chuckSteelMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // High-carbon polished lathe steel
      metalness: 0.92,
      roughness: 0.25
    });
    const jawMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.95, roughness: 0.2 });

    // =========================================================================
    // 1. HEADSTOCK CHUCK ASSEMBLY (Clamps at X = this.chuckX)
    // =========================================================================
    this.headstockGroup = new THREE.Group();
    this.headstockGroup.name = 'CLE_Headstock_Assembly';

    // A. Headstock Mounting Base (Sits at Z = 0.10mm, extends into -X behind the chuck face)
    const baseW = 55.0;  // along X
    const baseD = 110.0; // along Y
    const headstockBaseGeo = new THREE.BoxGeometry(baseW, baseD, baseH);
    const headstockBase = new THREE.Mesh(headstockBaseGeo, headstockMat);
    // Position base center at x = -40, so front face is at -12.5 (clearing the chuck)
    headstockBase.position.set(-35, 0, 0.10 + baseH / 2 - zCenter);
    this.headstockGroup.add(headstockBase);

    // B. Stepper Motor Housing (NEMA 17: 42x42x40mm)
    const motorGeo = new THREE.BoxGeometry(40, 42, 42);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.4 });
    const motorMesh = new THREE.Mesh(motorGeo, motorMat);
    motorMesh.position.set(-35, -32, 0.10 + 22 - zCenter);
    this.headstockGroup.add(motorMesh);

    // Motor 15mm timing pulley
    const motorPulleyGeo = new THREE.CylinderGeometry(this.motorPulleyMm / 2, this.motorPulleyMm / 2, 10, 24);
    motorPulleyGeo.rotateZ(Math.PI / 2);
    const motorPulley = new THREE.Mesh(motorPulleyGeo, pulleyMat);
    motorPulley.position.set(-10, -32, 0.10 + 22 - zCenter);
    this.headstockGroup.add(motorPulley);

    // Spindle 55mm timing pulley
    const chuckPulleyGeo = new THREE.CylinderGeometry(this.chuckPulleyMm / 2, this.chuckPulleyMm / 2, 8, 36);
    chuckPulleyGeo.rotateZ(Math.PI / 2);
    const chuckPulley = new THREE.Mesh(chuckPulleyGeo, pulleyMat);
    chuckPulley.position.set(-12, 0, 0);
    this.headstockGroup.add(chuckPulley);

    // C. Rotating Chuck Body & Jaws (Front face of jaws meets workpiece at x = 0)
    this.chuckJawsGroup = new THREE.Group();
    this.chuckJawsGroup.name = 'CLE_Chuck_Rotating_Jaws';

    // Chuck Cylinder Body (Ø65mm, 22mm deep, extends from x = -22 to 0)
    const chuckBodyGeo = new THREE.CylinderGeometry(32.5, 32.5, 22, 36);
    chuckBodyGeo.rotateZ(Math.PI / 2);
    chuckBodyGeo.translate(-11, 0, 0);
    const chuckBody = new THREE.Mesh(chuckBodyGeo, chuckSteelMat);
    this.chuckJawsGroup.add(chuckBody);

    // Chuck Through-Bore (16mm bore)
    const boreGeo = new THREE.CylinderGeometry(8, 8, 24, 24);
    boreGeo.rotateZ(Math.PI / 2);
    boreGeo.translate(-11, 0, 0);
    const boreMesh = new THREE.Mesh(boreGeo, new THREE.MeshBasicMaterial({ color: 0x050505 }));
    this.chuckJawsGroup.add(boreMesh);

    // 3 Stepped Steel Jaws (120° apart, gripping the object right at x = 0)
    const jawGeo = new THREE.BoxGeometry(12, 9, 13);
    for (let j = 0; j < 3; j++) {
      const angle = (j * 120 * Math.PI) / 180;
      const jaw = new THREE.Mesh(jawGeo, jawMat);
      const rJaw = Math.max(12, radius * 0.7);
      jaw.position.set(-4, Math.sin(angle) * rJaw, Math.cos(angle) * rJaw);
      jaw.rotation.x = angle;
      this.chuckJawsGroup.add(jaw);
    }
    this.headstockGroup.add(this.chuckJawsGroup);

    this.headstockGroup.position.set(this.chuckX, yCenter, zCenter);
    this.rotaryGroup.add(this.headstockGroup);

    // =========================================================================
    // 2. TAILSTOCK OPPOSING CENTER ASSEMBLY (Clamps at X = this.tailstockX)
    // =========================================================================
    this.tailstockGroup = new THREE.Group();
    this.tailstockGroup.name = 'CLE_Tailstock_Assembly';

    // A. 60° Rotating Live Center Cone (Tip touches workpiece precisely at x = 0, pointing towards -X)
    const coneLen = 22.0;
    const centerConeGeo = new THREE.ConeGeometry(Math.min(18, radius * 0.6), coneLen, 24);
    // Tip at x = 0, base at x = +22
    centerConeGeo.rotateZ(-Math.PI / 2);
    centerConeGeo.translate(coneLen / 2, 0, 0);
    this.liveCenterCone = new THREE.Mesh(centerConeGeo, jawMat);
    this.tailstockGroup.add(this.liveCenterCone);

    // B. Live Center Quill Shaft (Ø20mm cylinder from x = +18 to +45)
    const quillGeo = new THREE.CylinderGeometry(10, 10, 28, 24);
    quillGeo.rotateZ(Math.PI / 2);
    quillGeo.translate(32, 0, 0);
    const quillMesh = new THREE.Mesh(quillGeo, pulleyMat);
    this.tailstockGroup.add(quillMesh);

    // C. Tailstock Base (Sits at Z = 0.10mm, extends from x = +30 to +80)
    const tailBaseGeo = new THREE.BoxGeometry(50, 90, baseH);
    const tailBase = new THREE.Mesh(tailBaseGeo, headstockMat);
    tailBase.position.set(55, 0, 0.10 + baseH / 2 - zCenter);
    this.tailstockGroup.add(tailBase);

    this.tailstockGroup.position.set(this.tailstockX, yCenter, zCenter);
    this.rotaryGroup.add(this.tailstockGroup);

    // =========================================================================
    // 3. CENTERLINE & SAFETY BOUNDARIES (Spanning exactly between Chuck & Tailstock)
    // =========================================================================

    // Cyan Rotation Centerline
    const lineVectors = [
      new THREE.Vector3(this.chuckX - 45, yCenter, zCenter),
      new THREE.Vector3(this.tailstockX + 55, yCenter, zCenter)
    ];
    const axisGeo = new THREE.BufferGeometry().setFromPoints(lineVectors);
    const axisMat = new THREE.LineDashedMaterial({
      color: 0x06b6d4, // Cyan rotation centerline
      dashSize: 6,
      gapSize: 4,
      depthTest: false
    });
    this.axisLine = new THREE.Line(axisGeo, axisMat);
    this.axisLine.computeLineDistances();
    this.rotaryGroup.add(this.axisLine);

    // Floor Safety Limit at Zbot = zCenter - 5mm (-5mm Core Safety Boundary)
    const spanLen = Math.max(20, this.tailstockX - this.chuckX);
    const midX = (this.chuckX + this.tailstockX) / 2;
    const zBot = this.getZBot();

    const safetyLimitGeo = new THREE.PlaneGeometry(spanLen + 10, this.stockDiameter + 20);
    const safetyLimitMat = new THREE.MeshBasicMaterial({
      color: 0xef4444, // Red safety warning plane
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.safetyBoundaryMesh = new THREE.Mesh(safetyLimitGeo, safetyLimitMat);
    this.safetyBoundaryMesh.position.set(midX, yCenter, zBot);
    this.safetyBoundaryMesh.name = 'CLE_Rotary_Safety_Floor';
    this.rotaryGroup.add(this.safetyBoundaryMesh);

    // Safety boundary wireframe border
    const boundEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(safetyLimitGeo),
      new THREE.LineBasicMaterial({ color: 0xdc2626, depthTest: false })
    );
    this.safetyBoundaryMesh.add(boundEdges);

    // Safe Retract Clearance Plane at Ztop
    const zTop = this.getZTop();
    const retractGeo = new THREE.PlaneGeometry(spanLen + 10, this.stockDiameter + 30);
    const retractMat = new THREE.MeshBasicMaterial({
      color: 0x10b981, // Emerald green clearance plane
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.retractPlaneMesh = new THREE.Mesh(retractGeo, retractMat);
    this.retractPlaneMesh.position.set(midX, yCenter, zTop);
    this.rotaryGroup.add(this.retractPlaneMesh);

    // =========================================================================
    // 4. PRECISION CENTER POINT TOOL & ALIGNMENT RETICLES
    // =========================================================================
    this.centerPointGroup = new THREE.Group();
    this.centerPointGroup.name = 'CLE_Center_Point_Tool_Group';

    // A. Chuck Face Center Point Reticle & Bullseye Target
    this.chuckCenterTool = new THREE.Group();
    this.chuckCenterTool.name = 'CLE_Chuck_Center_Point';
    
    // Glowing Bullseye Target Ring at (0, 0, 0) of chuck face
    const chuckReticleGeo = new THREE.RingGeometry(1.5, 5.0, 32);
    chuckReticleGeo.rotateY(Math.PI / 2); // face along X axis
    const chuckReticleMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4, // Vivid Cyan
      side: THREE.DoubleSide,
      depthTest: false,
      transparent: true,
      opacity: 0.95
    });
    const chuckRing = new THREE.Mesh(chuckReticleGeo, chuckReticleMat);
    this.chuckCenterTool.add(chuckRing);

    // Crosshair Lines in Y & Z
    const chCrossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -10, 0), new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, 0, -10), new THREE.Vector3(0, 0, 10)
    ]);
    const chCrossMat = new THREE.LineBasicMaterial({ color: 0x06b6d4, linewidth: 2.5, depthTest: false });
    this.chuckCenterTool.add(new THREE.LineSegments(chCrossGeo, chCrossMat));

    // Center Point Pin (Sharp center marker pointing into workpiece)
    const pinGeo = new THREE.ConeGeometry(1.5, 6.0, 16);
    pinGeo.rotateZ(-Math.PI / 2); // points along +X into workpiece
    pinGeo.translate(3.0, 0, 0);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.9, roughness: 0.2 });
    this.chuckCenterTool.add(new THREE.Mesh(pinGeo, pinMat));
    this.chuckCenterTool.position.set(this.chuckX, yCenter, zCenter);
    this.centerPointGroup.add(this.chuckCenterTool);

    // B. Tailstock Live Center Point Tool & Bullseye Reticle
    this.tailstockCenterTool = new THREE.Group();
    this.tailstockCenterTool.name = 'CLE_Tailstock_Center_Point';

    const tailReticleGeo = new THREE.RingGeometry(1.5, 5.0, 32);
    tailReticleGeo.rotateY(Math.PI / 2);
    const tailRing = new THREE.Mesh(tailReticleGeo, chuckReticleMat);
    this.tailstockCenterTool.add(tailRing);

    const tailCrossGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -10, 0), new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, 0, -10), new THREE.Vector3(0, 0, 10)
    ]);
    this.tailstockCenterTool.add(new THREE.LineSegments(tailCrossGeo, chCrossMat));

    // Precision 60-degree Ground Center Point Tool Tip
    const liveTipGeo = new THREE.ConeGeometry(1.8, 8.0, 16);
    liveTipGeo.rotateZ(Math.PI / 2); // points along -X into workpiece center
    liveTipGeo.translate(-4.0, 0, 0);
    const liveTipMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.1 });
    this.tailstockCenterTool.add(new THREE.Mesh(liveTipGeo, liveTipMat));
    this.tailstockCenterTool.position.set(this.tailstockX, yCenter, zCenter);
    this.centerPointGroup.add(this.tailstockCenterTool);

    // C. Vertical Spindle / Laser Alignment Guide Ray (Perpendicular from Centerline to Safe Retract)
    const guideZPoints = [
      new THREE.Vector3(midX, yCenter, zCenter),
      new THREE.Vector3(midX, yCenter, zTop + 15)
    ];
    const guideZGeo = new THREE.BufferGeometry().setFromPoints(guideZPoints);
    const guideZMat = new THREE.LineDashedMaterial({
      color: 0xfacc15, // Bright Gold
      dashSize: 4,
      gapSize: 3,
      depthTest: false
    });
    this.centerVerticalGuide = new THREE.Line(guideZGeo, guideZMat);
    this.centerVerticalGuide.computeLineDistances();
    this.centerPointGroup.add(this.centerVerticalGuide);

    this.centerPointGroup.visible = this.centerPointVisible;
    this.rotaryGroup.add(this.centerPointGroup);

    this.rotaryGroup.visible = this.enabled;
    container.add(this.rotaryGroup);

    console.log(`[CLE Rotary] TwoTrees 4th-Axis mounted: Chuck at X=${this.chuckX}mm, Opposing Center at X=${this.tailstockX}mm (Span=${spanLen}mm), Center Y=${yCenter}mm, Z=${zCenter.toFixed(2)}mm, Zbot=${zBot.toFixed(2)}mm, Ztop=${zTop.toFixed(2)}mm.`);
  }

  // --- Dynamic Assembly Repositioning (Live Chuck & Tailstock Sliding) ---
  updateAssemblyPositions() {
    if (!this.rotaryGroup) {
      if (this.enabled) this.initVisualizer();
      return;
    }

    const zCenter = this.getZCenter();
    const yCenter = this.centerY;
    const spanLen = Math.max(10, this.tailstockX - this.chuckX);
    const midX = (this.chuckX + this.tailstockX) / 2;
    const zBot = this.getZBot();
    const zTop = this.getZTop();

    // 1. Slide Headstock & Chuck
    if (this.headstockGroup) {
      this.headstockGroup.position.set(this.chuckX, yCenter, zCenter);
    }

    // 2. Slide Tailstock & Opposing Center
    if (this.tailstockGroup) {
      this.tailstockGroup.position.set(this.tailstockX, yCenter, zCenter);
    }

    // 3. Update Centerline
    if (this.axisLine && this.axisLine.geometry) {
      const posAttr = this.axisLine.geometry.attributes.position;
      posAttr.setXYZ(0, this.chuckX - 45, yCenter, zCenter);
      posAttr.setXYZ(1, this.tailstockX + 55, yCenter, zCenter);
      posAttr.needsUpdate = true;
      this.axisLine.computeLineDistances();
    }

    // 4. Update Safety Boundaries
    if (this.safetyBoundaryMesh) {
      this.safetyBoundaryMesh.position.set(midX, yCenter, zBot);
      this.safetyBoundaryMesh.scale.set(spanLen / Math.max(1, this.stockLength), 1, 1);
    }
    if (this.retractPlaneMesh) {
      this.retractPlaneMesh.position.set(midX, yCenter, zTop);
      this.retractPlaneMesh.scale.set(spanLen / Math.max(1, this.stockLength), 1, 1);
    }

    // 5. Update Center Point Tools & Guides
    if (this.chuckCenterTool) {
      this.chuckCenterTool.position.set(this.chuckX, yCenter, zCenter);
    }
    if (this.tailstockCenterTool) {
      this.tailstockCenterTool.position.set(this.tailstockX, yCenter, zCenter);
    }
    if (this.centerVerticalGuide && this.centerVerticalGuide.geometry) {
      const pos = this.centerVerticalGuide.geometry.attributes.position;
      pos.setXYZ(0, midX, yCenter, zCenter);
      pos.setXYZ(1, midX, yCenter, zTop + 15);
      pos.needsUpdate = true;
      this.centerVerticalGuide.computeLineDistances();
    }

    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // --- Toggle 4th Axis On / Off ---
  toggle(enabled) {
    this.enabled = (enabled !== undefined) ? enabled : !this.enabled;

    if (!this.rotaryGroup && this.enabled) {
      this.initVisualizer();
    }
    if (this.rotaryGroup) {
      this.rotaryGroup.visible = this.enabled;
    }

    // In A-Axis Mode: Spoilboard is NOT used and is unmounted/hidden!
    if (this.bridge?.bed) {
      if (this.enabled) {
        if (this.bridge.bed.spoilboardMesh) this.bridge.bed.spoilboardMesh.visible = false;
        if (this.bridge.bed.bedTopPlane) this.bridge.bed.bedTopPlane.visible = false;
      } else {
        if (this.bridge.bed.spoilboardMesh) this.bridge.bed.spoilboardMesh.visible = true;
        if (this.bridge.bed.bedTopPlane) this.bridge.bed.bedTopPlane.visible = true;
      }
      this.bridge.bed.sitWorkpieceOnSpoilboard();
    }

    const btn = document.getElementById('cle-r-rotary');
    if (btn) btn.classList.toggle('pressed', this.enabled);

    this.bridge.notify(
      `4th Axis Rotary (A): ${this.enabled ? 'ACTIVE (Chuck at X=' + this.chuckX + 'mm, Opposing Center at X=' + this.tailstockX + 'mm)' : 'DISABLED (Spoilboard restored)'}`,
      this.enabled ? 'ok' : 'info'
    );

    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // --- Configure Mounting Position & Chuck/Tailstock Endpoints ---
  setMountingPosition(centerY, centerHeight = 45.0, chuckX = 20.0, tailstockX = 170.0) {
    if (isFinite(centerY)) this.centerY = parseFloat(centerY);
    if (isFinite(centerHeight)) this.centerHeightMm = parseFloat(centerHeight);
    if (isFinite(chuckX)) this.chuckX = parseFloat(chuckX);
    if (isFinite(tailstockX)) this.tailstockX = parseFloat(tailstockX);
    this.stockLength = Math.max(10, this.tailstockX - this.chuckX);

    if (this.enabled) {
      this.updateAssemblyPositions();
      if (this.bridge?.bed) this.bridge.bed.sitWorkpieceOnSpoilboard();
    }
    this.bridge.notify(`Rotary Mounted: Chuck at X=${this.chuckX}mm, Opposing Center at X=${this.tailstockX}mm, Center Y=${this.centerY}mm, Height=${this.centerHeightMm}mm.`, 'ok');
  }

  setChuckPosition(x) {
    if (isFinite(x)) {
      this.chuckX = parseFloat(x);
      this.stockLength = Math.max(10, this.tailstockX - this.chuckX);
      this.updateAssemblyPositions();
    }
  }

  setTailstockPosition(x) {
    if (isFinite(x)) {
      this.tailstockX = parseFloat(x);
      this.stockLength = Math.max(10, this.tailstockX - this.chuckX);
      this.updateAssemblyPositions();
    }
  }

  // --- Center A-Axis Chuck and Center on CAD Object ---
  centerOnObject() {
    const b = this.getObjectBounds();
    const objMidX = (b.minX + b.maxX) / 2;
    const span = Math.max(10, this.stockLength);
    this.chuckX = Math.round(objMidX - span / 2);
    this.tailstockX = Math.round(objMidX + span / 2);

    if (!this.enabled) this.toggle(true);
    else this.updateAssemblyPositions();

    if (this.bridge?.bed) {
      this.bridge.bed.sitWorkpieceOnSpoilboard();
    }

    this.bridge.notify(`A-Axis centered on object: Midpoint X=${objMidX.toFixed(1)}mm, Chuck at X=${this.chuckX}mm, Center at X=${this.tailstockX}mm (Span=${span}mm).`, 'ok');
  }

  // --- Nudge Chuck Position along X ---
  nudgeChuck(deltaMm) {
    this.setChuckPosition(this.chuckX + deltaMm);
    this.bridge.notify(`Chuck X: ${this.chuckX}mm`, 'info');
  }

  // --- Nudge Opposing Center Position along X ---
  nudgeTailstock(deltaMm) {
    this.setTailstockPosition(this.tailstockX + deltaMm);
    this.bridge.notify(`Opposing Center X: ${this.tailstockX}mm (Span: ${this.stockLength}mm)`, 'info');
  }

  // --- Toggle Center Point Tool Visibility ---
  toggleCenterPointTool(visible) {
    this.centerPointVisible = (visible !== undefined) ? visible : !this.centerPointVisible;
    if (this.centerPointGroup) {
      this.centerPointGroup.visible = this.centerPointVisible;
    }
    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
    const stateStr = this.centerPointVisible ? 'VISIBLE' : 'HIDDEN';
    this.bridge.notify(`Center Point Tool: ${stateStr} (Chuck Center & Live Center Point at Y=${this.centerY}mm Z=${this.getZCenter().toFixed(2)}mm).`, 'info');
    return this.centerPointVisible;
  }

  // --- Jog CNC Spindle / Laser Toolhead Directly to Center Point ---
  jogToolToCenter(which = 'workpiece') {
    const yCenter = this.centerY;
    const zCenter = this.getZCenter();
    const zTop = this.getZTop();
    const midX = (this.chuckX + this.tailstockX) / 2;

    let targetX = midX;
    let targetY = yCenter;
    let targetZ = zTop;

    if (which === 'chuck') {
      targetX = this.chuckX;
      targetZ = zCenter;
    } else if (which === 'tailstock') {
      targetX = this.tailstockX;
      targetZ = zCenter;
    } else {
      // 'workpiece' top dead center (perpendicular touch-off point)
      targetX = midX;
      targetZ = zCenter + (this.stockDiameter / 2);
    }

    // Update 3D virtual toolhead cursor in JumpStart viewport
    if (this.bridge?.bed) {
      this.bridge.bed.updateToolCursor({ X: targetX, Y: targetY, Z: targetZ, A: this.currentAngle });
    }

    // If FluidNC controller is connected, send jog command
    if (this.bridge?.fluidnc && this.bridge.fluidnc.isConnected) {
      this.bridge.fluidnc.sendImmediate(`$J=G90 G21 X${targetX.toFixed(2)} Y${targetY.toFixed(2)} Z${targetZ.toFixed(2)} F1500`);
    }

    this.bridge.notify(`Toolhead positioned at Center Point: X=${targetX.toFixed(1)}mm, Y=${targetY.toFixed(1)}mm, Z=${targetZ.toFixed(1)}mm (${which}).`, 'ok');
  }

  setTailstockPosition(x) {
    if (isFinite(x)) {
      this.tailstockX = parseFloat(x);
      this.stockLength = Math.max(10, this.tailstockX - this.chuckX);
      this.updateAssemblyPositions();
    }
  }

  // --- Configure Gear / Pulley Ratio ---
  setGearRatio(ratio, motorPulley = 15.0, chuckPulley = 55.0) {
    this.gearRatio = parseFloat(ratio) || 5.0;
    this.motorPulleyMm = parseFloat(motorPulley) || 15.0;
    this.chuckPulleyMm = parseFloat(chuckPulley) || 55.0;

    const spd = this.getStepsPerDegree();
    this.bridge.notify(`Rotary Ratio: ${this.gearRatio}:1 (${this.motorPulleyMm}mm/${this.chuckPulleyMm}mm pulleys) &rarr; ${spd.toFixed(3)} steps/degree.`, 'ok');
  }

  // --- Stock Dimensions ---
  setStockDimensions(diameter, length) {
    const dia = parseFloat(diameter) || 50.0;
    this.stockDiameter = dia;
    if (length && isFinite(length)) {
      this.stockLength = parseFloat(length);
      this.tailstockX = this.chuckX + this.stockLength;
    }
    if (this.enabled) {
      this.updateAssemblyPositions();
    }
    const clr = this.checkClearances(this.stockDiameter);
    this.bridge.notify(`Rotary Stock: Ø${this.stockDiameter}mm × ${this.stockLength}mm (Ztop=${this.getZTop().toFixed(1)}mm). ${clr.message}`, (clr.status === 'ok' || clr.status === 'shielded') ? 'ok' : 'warn');
    return;
    this.bridge.notify(`Rotary Stock: Ø${this.stockDiameter}mm × ${this.stockLength}mm (Ztop=${this.getZTop().toFixed(1)}mm, Zbot=${this.getZBot().toFixed(1)}mm).`);
  }

  // --- Mathematically Pure On-Axis Radial Workpiece Rotation ---
  // Rotates the CAD design object around the A-axis centerline (Y=centerY, Z=zCenter) with ZERO orbital wobble
  rotateWorkpieceRadially(rad) {
    const app = window.app || window.xe;
    if (!app || !app.scene || !app.scene.root) return;

    const yCenter = this.centerY;
    const zCenter = this.getZCenter();

    // Get CAD object center in Y and Z (the rotation pivot)
    const { cy, cz } = this.getObjectCenterYZ();

    // Exact on-axis pivot transformation:
    // When root is positioned at (0, posY, posZ) and rotated by rad:
    // Every vertex (x, y, z) rotates purely around (X, yCenter, zCenter) with zero orbital translation!
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const posY = yCenter - (cy * cosR - cz * sinR);
    const posZ = zCenter - (cy * sinR + cz * cosR);

    app.scene.root.position.set(0, posY, posZ);
    app.scene.root.rotation.x = rad;
    app.scene.root.updateMatrixWorld(true);
  }

  // Set absolute angle of A axis [0..360)
  setAngle(angleDeg) {
    this.currentAngle = ((angleDeg % 360) + 360) % 360;
    const rad = (this.currentAngle * Math.PI) / 180;

    // 1. Rotate chuck jaws in headstock
    if (this.chuckJawsGroup) {
      this.chuckJawsGroup.rotation.x = rad;
    }

    // 2. Rotate CAD design workpiece on-axis around (yCenter, zCenter)
    this.rotateWorkpieceRadially(rad);

    // 3. Update DRO in UI
    const droA = document.getElementById('cle-dro-a');
    if (droA) droA.textContent = this.currentAngle.toFixed(1);
    const manDroA = document.getElementById('cle-man-dro-a');
    if (manDroA) manDroA.textContent = this.currentAngle.toFixed(1);

    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // --- Turning Mode (Lathe Continuous Spindle Rotation) ---
  toggleTurning(rpm) {
    if (this.isTurning) this.stopTurning();
    else this.startTurning(rpm || this.turningRPM);
  }

  startTurning(rpm = 60.0, dir = 1) {
    if (!this.enabled) this.toggle(true);

    this.isTurning = true;
    this.mode = 'turning';
    this.turningRPM = parseFloat(rpm) || 60.0;
    this.turningDegPerSec = this.turningRPM * 6.0; // 360 deg in (60/RPM) sec -> RPM * 6 deg/s
    this.turningDir = dir >= 0 ? 1 : -1;
    let lastTime = performance.now();

    const loop = (now) => {
      if (!this.isTurning) return;
      const dt = (now - lastTime) / 1000.0;
      lastTime = now;
      const deltaDeg = this.turningDegPerSec * dt * this.turningDir;
      this.setAngle(this.currentAngle + deltaDeg);
      this._turningAnimId = requestAnimationFrame(loop);
    };

    if (this._turningAnimId) cancelAnimationFrame(this._turningAnimId);
    this._turningAnimId = requestAnimationFrame(loop);

    // If connected to FluidNC, start continuous rotary rotation
    if (this.bridge?.fluidnc?.isConnected) {
      const feed = Math.round(this.turningRPM * 360); // deg/min
      const targetA = this.turningDir > 0 ? 999999 : -999999;
      this.bridge.fluidnc.sendImmediate(`$J=G91 G21 A${targetA} F${feed}`);
    }

    const tBtn = document.getElementById('cle-r-turning');
    if (tBtn) tBtn.classList.add('pressed');

    this.bridge.notify(`Turning Mode: RUNNING (${this.turningRPM} RPM | ${this.turningDegPerSec.toFixed(0)}°/s)`, 'ok');
  }

  stopTurning() {
    this.isTurning = false;
    if (this._turningAnimId) {
      cancelAnimationFrame(this._turningAnimId);
      this._turningAnimId = null;
    }

    if (this.bridge?.fluidnc?.isConnected) {
      this.bridge.fluidnc.sendImmediate('\x85'); // FluidNC Jog Cancel
    }

    const tBtn = document.getElementById('cle-r-turning');
    if (tBtn) tBtn.classList.remove('pressed');

    this.bridge.notify('Turning Mode: STOPPED', 'info');
  }

  // --- Index Mode (Top-Down Multi-Sided Milling) ---
  getIndexAngles() {
    switch (this.indexMode) {
      case '2-sided': return [0, 180];
      case '4-sided': return [0, 90, 180, 270];
      case '6-sided': return [0, 60, 120, 180, 240, 300];
      case '8-sided': return [0, 45, 90, 135, 180, 225, 270, 315];
      case 'custom': {
        const step = Math.max(1, this.customIndexStep || 15);
        const angles = [];
        for (let a = 0; a < 360; a += step) angles.push(a);
        return angles;
      }
      default: return [0, 90, 180, 270];
    }
  }

  setIndexMode(mode, customStep = 15.0) {
    if (!this.enabled) this.toggle(true);
    this.mode = 'index';
    this.indexMode = mode;
    if (customStep) this.customIndexStep = parseFloat(customStep);
    this.currentIndexIdx = 0;
    const angles = this.getIndexAngles();
    this.setIndexAngle(angles[0]);
    this.bridge.notify(`A-Axis Index Mode: ${mode.toUpperCase()} (${angles.length} facets: ${angles.join('°, ')}°)`, 'info');
  }

  setIndexAngle(angleDeg) {
    this.setAngle(angleDeg);
    if (this.bridge?.fluidnc?.isConnected) {
      this.bridge.fluidnc.sendGCode(`G90 G0 A${angleDeg.toFixed(3)}`);
    }
  }

  nextIndex() {
    if (!this.enabled) this.toggle(true);
    const angles = this.getIndexAngles();
    this.currentIndexIdx = (this.currentIndexIdx + 1) % angles.length;
    this.setIndexAngle(angles[this.currentIndexIdx]);
    this.bridge.notify(`Indexed to Facet ${this.currentIndexIdx + 1}/${angles.length} (A=${angles[this.currentIndexIdx]}°) [Top-Down Cut]`, 'ok');
  }

  prevIndex() {
    if (!this.enabled) this.toggle(true);
    const angles = this.getIndexAngles();
    this.currentIndexIdx = (this.currentIndexIdx - 1 + angles.length) % angles.length;
    this.setIndexAngle(angles[this.currentIndexIdx]);
    this.bridge.notify(`Indexed to Facet ${this.currentIndexIdx + 1}/${angles.length} (A=${angles[this.currentIndexIdx]}°) [Top-Down Cut]`, 'ok');
  }

  // --- Coordinate Transformation & G-Code Helpers ---

  // Converts flat Y mm into A rotational degrees based on stock diameter
  yToRotaryDegrees(yMm) {
    const circumference = Math.PI * this.stockDiameter;
    return (yMm / circumference) * 360.0;
  }

  rotaryDegreesToY(aDeg) {
    const circumference = Math.PI * this.stockDiameter;
    return (aDeg / 360.0) * circumference;
  }

  // Wraps planar G-Code into 4th Axis Rotary G-Code (Y &rarr; A)
  wrapPlanarGCodeToRotary(gcodeText) {
    const lines = gcodeText.split('\n');
    const out = [];
    out.push(`; --- CLEJS TwoTrees 4th Axis Rotary (A) Wrapped Toolpath ---`);
    out.push(`; Ratio: ${this.gearRatio}:1, Steps/deg: ${this.getStepsPerDegree().toFixed(3)}`);
    out.push(`; Clamped: Chuck at X=${this.chuckX}mm, Opposing Center at X=${this.tailstockX}mm, Center Y=${this.centerY}mm, Z=${this.centerHeightMm}mm`);
    out.push(`; Safety: Ztop=${this.getZTop().toFixed(2)}mm, Zbot=${this.getZBot().toFixed(2)}mm (-5mm limit)`);
    out.push('G90 G21 ; Absolute programming, millimeters');
    out.push('G92 A0 ; Set A0 at chuck reference');

    const yPattern = /([Yy])(-?\d+\.?\d*)/;

    for (const line of lines) {
      const match = line.match(yPattern);
      if (match && !line.startsWith(';')) {
        const yVal = parseFloat(match[2]);
        const aVal = this.yToRotaryDegrees(yVal).toFixed(3);
        const replaced = line.replace(match[0], `A${aVal}`);
        out.push(replaced);
      } else {
        out.push(line);
      }
    }
    return out.join('\n');
  }

  // Safely dispose Three.js geometries & materials
  disposeRotaryGroup() {
    if (!this.rotaryGroup) return;
    this.rotaryGroup.traverse(obj => {
      if (obj.geometry) {
        try { obj.geometry.dispose(); } catch (e) {}
      }
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          try { m.dispose(); } catch (e) {}
        });
      }
    });
    this.rotaryGroup = null;
    this.headstockGroup = null;
    this.tailstockGroup = null;
    this.chuckJawsGroup = null;
    this.liveCenterCone = null;
  }
}
