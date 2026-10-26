/**
 * CLEJS - 4th Axis Rotary (A-Axis) Engine & Three.js Visualizer
 * TwoTrees TTC6050 / TTC450 4th Axis Kit Integration
 * Turning Mode (RPM & deg/s), Settable Gear Ratio (5:1 default), Center Y & Z=45mm Mounting,
 * -5mm Safety Floor Boundary, Radial 3D Rotation, and Top-Down Index Mode (CNC & Laser)
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
    this.startX = 20.0;              // Chuck face position along X-axis

    // --- Stock Workpiece Dimensions ---
    this.stockDiameter = 50.0;       // mm
    this.stockLength = 150.0;        // mm

    // --- Safety Boundaries ---
    this.zSafetyLimit = -5.0;        // -5mm safety boundary below rotation axis (never plunge below this!)
    this.zClearance = 10.0;          // mm safe retract clearance height above top of stock

    // --- Live Motion State ---
    this.currentAngle = 0.0;         // Current A-axis angle in degrees [0..360)
    this.mode = 'index';             // 'index' | 'turning' | 'continuous'

    // Turning Mode (Lathe Spindle Rotation)
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
    this.chuckJawsGroup = null;
    this.cylinderMesh = null;
    this.headstockMesh = null;
    this.tailstockMesh = null;
    this.axisLine = null;
    this.safetyBoundaryMesh = null;
    this.retractPlaneMesh = null;
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

  // Safe retract clearance plane (Top of stock + clearance)
  getZTop() {
    const radius = this.stockDiameter / 2;
    return this.getZCenter() + radius + this.zClearance;
  }

  // Lowest allowable cutting depth (-5mm safety boundary from centerline)
  getZBot() {
    return this.getZCenter() + this.zSafetyLimit; // 45.10 - 5.0 = 40.10mm
  }

  getWorldContainer() {
    const app = window.app || window.xe;
    if (!app) return null;
    return (app.vp && (app.vp.scene || app.vp.world)) || (app.scene && app.scene.root ? app.scene.root.parent : null);
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
    const startX = this.startX;
    const radius = this.stockDiameter / 2;

    // 1. TwoTrees Aluminum Headstock Mounting Bracket (Clamped to aluminum bed table @ Z=0.10mm)
    const baseW = 60.0;  // along X
    const baseD = 110.0; // along Y
    const baseH = this.centerHeightMm; // 45mm tall
    const headstockBaseGeo = new THREE.BoxGeometry(baseW, baseD, baseH);
    const headstockMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark anodized industrial slate aluminum
      metalness: 0.85,
      roughness: 0.35
    });
    const headstockBase = new THREE.Mesh(headstockBaseGeo, headstockMat);
    headstockBase.position.set(startX - 30, yCenter, 0.10 + baseH / 2);
    this.rotaryGroup.add(headstockBase);

    // 2. Stepper Motor Housing (NEMA 17: 42x42x40mm) with 15mm Pulley
    const motorGeo = new THREE.BoxGeometry(40, 42, 42);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.4 });
    const motorMesh = new THREE.Mesh(motorGeo, motorMat);
    motorMesh.position.set(startX - 35, yCenter - 32, 0.10 + 22);
    this.rotaryGroup.add(motorMesh);

    // Motor 15mm timing pulley
    const motorPulleyGeo = new THREE.CylinderGeometry(this.motorPulleyMm / 2, this.motorPulleyMm / 2, 12, 24);
    motorPulleyGeo.rotateZ(Math.PI / 2);
    const pulleyMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
    const motorPulley = new THREE.Mesh(motorPulleyGeo, pulleyMat);
    motorPulley.position.set(startX - 10, yCenter - 32, 0.10 + 22);
    this.rotaryGroup.add(motorPulley);

    // 3. Spindle 55mm Timing Pulley & Enclosed Timing Belt
    const chuckPulleyGeo = new THREE.CylinderGeometry(this.chuckPulleyMm / 2, this.chuckPulleyMm / 2, 10, 36);
    chuckPulleyGeo.rotateZ(Math.PI / 2);
    const chuckPulley = new THREE.Mesh(chuckPulleyGeo, pulleyMat);
    chuckPulley.position.set(startX - 10, yCenter, zCenter);
    this.rotaryGroup.add(chuckPulley);

    // 4. Rotating 3-Jaw Self-Centering Chuck Assembly (Rotates with A-axis)
    this.chuckJawsGroup = new THREE.Group();
    this.chuckJawsGroup.position.set(startX, yCenter, zCenter);

    // Chuck Main Body (Ø65mm steel cylinder, 25mm thick)
    const chuckBodyGeo = new THREE.CylinderGeometry(32.5, 32.5, 25, 36);
    chuckBodyGeo.rotateZ(Math.PI / 2);
    chuckBodyGeo.translate(12.5, 0, 0);
    const chuckSteelMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Polished high-carbon lathe steel
      metalness: 0.92,
      roughness: 0.25
    });
    const chuckBody = new THREE.Mesh(chuckBodyGeo, chuckSteelMat);
    this.chuckJawsGroup.add(chuckBody);

    // Chuck Front Face Ring & Bore Hole (16mm through-bore)
    const boreGeo = new THREE.CylinderGeometry(8, 8, 26, 24);
    boreGeo.rotateZ(Math.PI / 2);
    boreGeo.translate(13, 0, 0);
    const boreMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const boreMesh = new THREE.Mesh(boreGeo, boreMat);
    this.chuckJawsGroup.add(boreMesh);

    // 3 Stepped Hardened Steel Jaws (120° apart)
    const jawGeo = new THREE.BoxGeometry(16, 10, 14);
    const jawMat = new THREE.MeshStandardMaterial({ color: 0xcfd8dc, metalness: 0.95, roughness: 0.2 });
    for (let j = 0; j < 3; j++) {
      const angle = (j * 120 * Math.PI) / 180;
      const jaw = new THREE.Mesh(jawGeo, jawMat);
      const rJaw = radius * 0.75;
      jaw.position.set(28, Math.sin(angle) * rJaw, Math.cos(angle) * rJaw);
      jaw.rotation.x = angle;
      this.chuckJawsGroup.add(jaw);
    }
    this.rotaryGroup.add(this.chuckJawsGroup);

    // 5. Cylindrical Stock Workpiece (Rotates with A-axis)
    const stockGeo = new THREE.CylinderGeometry(radius, radius, this.stockLength, 36, 1);
    stockGeo.rotateZ(Math.PI / 2);
    stockGeo.translate(startX + 25 + this.stockLength / 2, yCenter, zCenter);
    const stockMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Amber hardwood / brass stock appearance
      roughness: 0.55,
      metalness: 0.15,
      transparent: true,
      opacity: 0.45
    });
    this.cylinderMesh = new THREE.Mesh(stockGeo, stockMat);
    this.cylinderMesh.name = 'CLE_Rotary_Stock';
    this.rotaryGroup.add(this.cylinderMesh);

    // 6. Tailstock Assembly with 60° Rotating Live Center Point
    const tailstockX = startX + 25 + this.stockLength;
    const tailBaseGeo = new THREE.BoxGeometry(45, 90, baseH);
    const tailBase = new THREE.Mesh(tailBaseGeo, headstockMat);
    tailBase.position.set(tailstockX + 30, yCenter, 0.10 + baseH / 2);
    this.rotaryGroup.add(tailBase);

    // Live Center Quill & Conical Point
    const centerConeGeo = new THREE.ConeGeometry(radius * 0.6, 20, 24);
    centerConeGeo.rotateZ(Math.PI / 2);
    centerConeGeo.translate(tailstockX + 5, yCenter, zCenter);
    const centerCone = new THREE.Mesh(centerConeGeo, jawMat);
    this.rotaryGroup.add(centerCone);

    // 7. Center of Rotation Cyan Line (X-Axis through Y=centerY, Z=zCenter)
    const lineVectors = [
      new THREE.Vector3(startX - 20, yCenter, zCenter),
      new THREE.Vector3(tailstockX + 45, yCenter, zCenter)
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

    // 8. Safety Floor Boundary Mesh at Zbot = zCenter - 5mm (-5mm Core Safety Limit)
    const zBot = this.getZBot();
    const safetyLimitGeo = new THREE.PlaneGeometry(this.stockLength + 40, this.stockDiameter + 20);
    const safetyLimitMat = new THREE.MeshBasicMaterial({
      color: 0xef4444, // Bright red/amber safety boundary
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.safetyBoundaryMesh = new THREE.Mesh(safetyLimitGeo, safetyLimitMat);
    this.safetyBoundaryMesh.position.set(startX + 25 + this.stockLength / 2, yCenter, zBot);
    this.safetyBoundaryMesh.name = 'CLE_Rotary_Safety_Floor';
    this.rotaryGroup.add(this.safetyBoundaryMesh);

    // Safety boundary border wireframe
    const boundEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(safetyLimitGeo),
      new THREE.LineBasicMaterial({ color: 0xdc2626, depthTest: false })
    );
    this.safetyBoundaryMesh.add(boundEdges);

    // 9. Safe Retract Clearance Plane Wireframe at Ztop
    const zTop = this.getZTop();
    const retractGeo = new THREE.PlaneGeometry(this.stockLength + 40, this.stockDiameter + 30);
    const retractMat = new THREE.MeshBasicMaterial({
      color: 0x10b981, // Emerald green clearance plane
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.retractPlaneMesh = new THREE.Mesh(retractGeo, retractMat);
    this.retractPlaneMesh.position.set(startX + 25 + this.stockLength / 2, yCenter, zTop);
    this.rotaryGroup.add(this.retractPlaneMesh);

    this.rotaryGroup.visible = this.enabled;
    if (container && container.add) {
      container.add(this.rotaryGroup);
    }

    console.log(`[CLE Rotary] TwoTrees 4th-Axis visualizer mounted: Center Y=${yCenter}mm, Z=${zCenter.toFixed(2)}mm (45mm above bed), Zbot=${zBot.toFixed(2)}mm, Ztop=${zTop.toFixed(2)}mm.`);
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
      `4th Axis Rotary (A): ${this.enabled ? 'ACTIVE (Spoilboard replaced; center Y=' + this.centerY + 'mm, Z=' + this.centerHeightMm + 'mm)' : 'DISABLED (Spoilboard restored)'}`,
      this.enabled ? 'ok' : 'info'
    );

    const app = window.app || window.xe;
    if (app?.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }

  // --- Configure Mounting Position & Center of Chuck ---
  setMountingPosition(centerY, centerHeight = 45.0, startX = 20.0) {
    if (isFinite(centerY)) this.centerY = parseFloat(centerY);
    if (isFinite(centerHeight)) this.centerHeightMm = parseFloat(centerHeight);
    if (isFinite(startX)) this.startX = parseFloat(startX);

    if (this.enabled) {
      this.initVisualizer();
      if (this.bridge?.bed) this.bridge.bed.sitWorkpieceOnSpoilboard();
    }
    this.bridge.notify(`Rotary Mounted at Y=${this.centerY}mm, Center Height=${this.centerHeightMm}mm, X=${this.startX}mm.`, 'ok');
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
    this.stockDiameter = parseFloat(diameter) || 50.0;
    this.stockLength = parseFloat(length) || 150.0;
    if (this.enabled) {
      this.initVisualizer();
    }
    this.bridge.notify(`Rotary Stock: Ø${this.stockDiameter}mm × ${this.stockLength}mm (Ztop=${this.getZTop().toFixed(1)}mm, Zbot=${this.getZBot().toFixed(1)}mm).`);
  }

  // --- Radial Object Rotation in 3D Scene ---
  // Rotates the workpiece CAD bodies radially around the A-axis centerline (Y=centerY, Z=zCenter)
  rotateWorkpieceRadially(rad) {
    const app = window.app || window.xe;
    if (!app || !app.scene) return;

    if (app.scene.views && app.scene.views.size > 0) {
      for (const [id, view] of app.scene.views) {
        if (view.group) {
          view.group.rotation.x = rad;
          view.group.updateMatrixWorld(true);
        } else if (view.mesh) {
          view.mesh.rotation.x = rad;
          view.mesh.updateMatrixWorld(true);
        }
      }
    } else if (app.scene.root) {
      app.scene.root.rotation.x = rad;
      app.scene.root.updateMatrixWorld(true);
    }
  }

  // Set absolute angle of A axis [0..360)
  setAngle(angleDeg) {
    this.currentAngle = ((angleDeg % 360) + 360) % 360;
    const rad = (this.currentAngle * Math.PI) / 180;

    // 1. Rotate chuck and stock mesh in rotary visualizer
    if (this.chuckJawsGroup) {
      this.chuckJawsGroup.rotation.x = rad;
    }
    if (this.cylinderMesh) {
      this.cylinderMesh.rotation.x = rad;
    }

    // 2. Rotate workpiece CAD bodies radially around A-axis centerline
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
    out.push(`; Mount: Y=${this.centerY}mm, Center Height=${this.centerHeightMm}mm from bed`);
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

  // Generates complete Multi-Sided Index Mode G-Code from sliced layers
  generateIndexedGCode(slicedLayers, options = {}) {
    const angles = this.getIndexAngles();
    const zTop = this.getZTop();
    const zBot = this.getZBot();
    const feed = options.feedRate || 1800;
    const plunge = options.plungeRate || 350;
    const rpm = options.rpm || 12000;

    const out = [];
    out.push('; === CLEJS A-AXIS MULTI-SIDED INDEXED TOOLPATH ===');
    out.push(`; Index Mode: ${this.indexMode} (${angles.length} Facets: ${angles.join('°, ')}°)`);
    out.push(`; Center of Chuck: Y=${this.centerY.toFixed(2)}mm, Z_center=${this.getZCenter().toFixed(2)}mm (45mm above bed)`);
    out.push(`; Safety Clearance: Ztop=${zTop.toFixed(2)}mm, Safety Floor Limit: Zbot=${zBot.toFixed(2)}mm (-5mm core limit)`);
    out.push(`; Stepper: 200 steps/rev, 16x microstep, ${this.gearRatio}:1 ratio &rarr; ${this.getStepsPerDegree().toFixed(3)} steps/deg`);
    out.push('G21 ; mm mode');
    out.push('G90 ; Absolute coordinates');
    out.push(`M3 S${rpm} ; Spindle ON`);
    out.push(`G0 Z${zTop.toFixed(2)} F2000 ; Rapid to safe clearance plane`);

    for (let fIdx = 0; fIdx < angles.length; fIdx++) {
      const angle = angles[fIdx];
      out.push(`\n; ======================================================`);
      out.push(`; --- FACET ${fIdx + 1}/${angles.length}: A = ${angle.toFixed(1)}° (Top-Down CNC Milling) ---`);
      out.push(`; ======================================================`);
      out.push(`G0 Z${zTop.toFixed(2)} ; Ensure tool is at safe clearance before rotating A`);
      out.push(`G0 A${angle.toFixed(3)} F3000 ; Rotate 4th axis to face ${fIdx + 1}`);

      // Generate top-down carving passes for this face
      const faceLayers = slicedLayers || [];
      for (let l = 0; l < faceLayers.length; l++) {
        const layer = faceLayers[l];
        const passZ = Math.max(zBot, layer.z !== undefined ? layer.z : zBot);
        out.push(`; Pass ${l + 1}/${faceLayers.length} (Z=${passZ.toFixed(2)}mm)`);
        out.push(`G0 X${(layer.points && layer.points[0] ? layer.points[0].x : this.startX).toFixed(2)} Y${this.centerY.toFixed(2)}`);
        out.push(`G1 Z${passZ.toFixed(2)} F${plunge} ; Plunge to pass depth`);

        if (layer.points && layer.points.length > 0) {
          for (const pt of layer.points) {
            out.push(`G1 X${pt.x.toFixed(2)} Y${pt.y.toFixed(2)} F${feed}`);
          }
        }
      }
      out.push(`G0 Z${zTop.toFixed(2)} ; Retract to safe clearance`);
    }

    out.push('\n; === FINISH JOB ===');
    out.push(`G0 Z${zTop.toFixed(2)}`);
    out.push('G0 A0.000 F3000 ; Return A to 0');
    out.push('M5 ; Spindle OFF');
    out.push('M2 ; Program End');

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
    this.chuckJawsGroup = null;
    this.cylinderMesh = null;
  }
}
