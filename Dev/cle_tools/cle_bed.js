/**
 * CLEJS - Device Bed, Spoilboard, Millimeter Rulers & Live Toolhead Cursor Subsystem
 * Renders physical machine envelope, spoilboard slab with grid, millimeter ruler graduations,
 * and live 3D toolhead cursor with projected shadow and DRO coordinates in JumpStart viewport.
 */

export class CLEBedVisualizer {
  constructor(bridge) {
    this.bridge = bridge;
    this.visible = true;
    this.bedGroup = null;
    this.cursorGroup = null;
    this.shadowCrosshair = null;
    this.coordTag = null;
    this.rulerSprites = [];
    this.lastPos = { X: 0, Y: 0, Z: 0, A: 0 };
    this.activeMachineId = null;

    // Default Spoilboard & Travel Config
    this.config = {
      travelX: 600,
      travelY: 500,
      travelZ: 100,
      spoilboardX: 600,
      spoilboardY: 500,
      spoilboardThickness: 20.0,
      spoilboardOffsetX: 0.0,
      spoilboardOffsetY: 0.0,
      cutoutOvercut: 0.2, // 0.2mm breakthrough into spoilboard for clean cutouts without tabs
      safeLimitZ: 0.1,    // 0.1mm above aluminum bed table hard limit
      gridPitch: 10.0,
      majorGridPitch: 50.0
    };
    this.workpieceZ = 20.1;
  }

  // Initializes bed visualizer once JumpStart Three.js viewport is ready
  init() {
    this.syncWithActiveMachine();
    this.mountToScene();
  }

  // Sync dimensions from active machine vault profile
  syncWithActiveMachine() {
    if (!this.bridge.vault) return;
    const mach = this.bridge.vault.getActiveMachine();
    if (!mach) return;

    this.activeMachineId = mach.id;
    this.config.travelX = parseFloat(mach.travelX) || 600;
    this.config.travelY = parseFloat(mach.travelY) || 500;
    this.config.travelZ = parseFloat(mach.travelZ) || 100;

    this.config.spoilboardX = parseFloat(mach.spoilboardX) || this.config.travelX;
    this.config.spoilboardY = parseFloat(mach.spoilboardY) || this.config.travelY;
    this.config.spoilboardThickness = mach.spoilboardThickness !== undefined ? parseFloat(mach.spoilboardThickness) : 20.0;
    this.config.spoilboardOffsetX = mach.spoilboardOffsetX !== undefined ? parseFloat(mach.spoilboardOffsetX) : 0.0;
    this.config.spoilboardOffsetY = mach.spoilboardOffsetY !== undefined ? parseFloat(mach.spoilboardOffsetY) : 0.0;
    this.config.cutoutOvercut = mach.cutoutOvercut !== undefined ? parseFloat(mach.cutoutOvercut) : 0.2;
    this.config.safeLimitZ = mach.safeLimitZ !== undefined ? parseFloat(mach.safeLimitZ) : 0.1;
  }

  // Get Three.js root scene/world container
  getWorldContainer() {
    const app = window.app || window.xe;
    if (!app || !app.vp) return null;
    // Mount directly to app.vp.scene for guaranteed rendering
    return app.vp.scene || app.vp.world || null;
  }

  // Mount bed and cursor to JumpStart Three.js viewport
  mountToScene() {
    const container = this.getWorldContainer();
    const THREE = window.THREE;
    if (!container || !THREE) {
      setTimeout(() => this.mountToScene(), 300);
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

    this.disposeBedGroup();

    this.bedGroup = new THREE.Group();
    this.bedGroup.name = 'CLE_Device_Bed_Visualizer';
    this.bedGroup.visible = this.visible;

    this.buildAluminumBedTable(THREE);
    this.buildSpoilboardSlab(THREE);
    this.buildGridAndExtrusionFrame(THREE);
    this.buildMMLBKeepOutToolLines(THREE);
    this.buildMachineOriginToolLines(THREE);
    this.buildMillimeterRulers(THREE);
    this.buildToolheadCursor(THREE);

    container.add(this.bedGroup);

    // If visible, seat workpiece on the spoilboard surface
    if (this.visible) {
      this.sitWorkpieceOnSpoilboard();
    }

    this.requestRender();
    console.log('[CLE Bed] Mounted MM/LB tool line overlay, aluminum bed table, medium blue spoilboard and seated workpiece.');
  }

  // Centering & Framing: Centers camera on bed center (300, 250, Z_mid) - only on explicit user request (Fit Bed)
  fitBedView() {
    const app = window.app || window.xe;
    if (!app || !app.vp || !app.vp.view) return;
    const cx = (this.config.travelX || 600) / 2;
    const cy = (this.config.travelY || 500) / 2;
    const cz = 0.1 + (this.config.spoilboardThickness || 20) / 2;
    app.vp.view.target.set(cx, cy, cz);
    app.vp.view.dist = 780;
    app.vp.view.az = 0.45;
    app.vp.view.el = 0.55;
    if (app.vp.updateCamera) app.vp.updateCamera();
    this.requestRender();
  }

  // 0. Aluminum Machine Bed Table: Heavy Base Plate underneath Spoilboard (Floor safety limit at Z = +0.10mm)
  buildAluminumBedTable(THREE) {
    const { travelX, travelY, spoilboardX, spoilboardY, spoilboardOffsetX, spoilboardOffsetY } = this.config;
    const tableW = Math.max(travelX, spoilboardX) + 24;
    const tableD = Math.max(travelY, spoilboardY) + 24;
    const tableThick = 15.0; // 15mm heavy aluminum bed plate

    // Aluminum Bed Table Plate - sits from Z = -14.90mm up to Z = +0.10mm
    const tableGeo = new THREE.BoxGeometry(tableW, tableD, tableThick);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Dark Slate Metallic Aluminum
      roughness: 0.35,
      metalness: 0.80,
      depthWrite: false
    });
    const tableMesh = new THREE.Mesh(tableGeo, tableMat);
    tableMesh.position.set(
      spoilboardOffsetX + (travelX / 2),
      spoilboardOffsetY + (travelY / 2),
      0.10 - (tableThick / 2) // top face sits precisely at Z = +0.10mm
    );
    tableMesh.renderOrder = -25;
    tableMesh.name = 'CLE_Aluminum_Bed_Table';
    this.bedGroup.add(tableMesh);

    // Subtle chamfered wireframe around aluminum table border
    const edgeGeo = new THREE.EdgesGeometry(tableGeo);
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.45, depthWrite: false });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    tableMesh.add(edgeLines);
  }

  // 1. Spoilboard Slab: Medium Blue Translucent Bed Underlay sitting on top of Aluminum Bed (+0.1mm to 0.1 + Thickness)
  buildSpoilboardSlab(THREE) {
    const { spoilboardX, spoilboardY, spoilboardThickness, spoilboardOffsetX, spoilboardOffsetY } = this.config;

    // Spoilboard Slab sits directly on top of aluminum bed:
    // Bottom sits at Z = +0.10mm; Top surface sits at Z = 0.10 + spoilboardThickness
    const slabGeo = new THREE.BoxGeometry(spoilboardX, spoilboardY, spoilboardThickness);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8, // Medium Royal Blue
      roughness: 0.25,
      metalness: 0.15,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const slab = new THREE.Mesh(slabGeo, slabMat);
    // Center Z = 0.10 + (spoilboardThickness / 2)
    slab.position.set(
      spoilboardOffsetX + spoilboardX / 2,
      spoilboardOffsetY + spoilboardY / 2,
      0.10 + (spoilboardThickness / 2)
    );
    slab.renderOrder = -20;
    slab.name = 'CLE_Spoilboard_Slab';
    this.bedGroup.add(slab);

    // Polished top bed plane surface placed right at Z = 0.10 + spoilboardThickness
    const topPlaneGeo = new THREE.PlaneGeometry(spoilboardX, spoilboardY);
    const topPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb, // Vibrant medium blue top face
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const topPlaneMesh = new THREE.Mesh(topPlaneGeo, topPlaneMat);
    topPlaneMesh.position.set(
      spoilboardOffsetX + spoilboardX / 2,
      spoilboardOffsetY + spoilboardY / 2,
      0.10 + spoilboardThickness
    );
    topPlaneMesh.renderOrder = -20;
    topPlaneMesh.name = 'CLE_Bed_Top_Plane';
    this.bedGroup.add(topPlaneMesh);
  }

  // 2. Light Green Squares Surface Grid & Machine Travel Limits Volume on Spoilboard Surface
  buildGridAndExtrusionFrame(THREE) {
    const { travelX, travelY, travelZ, spoilboardX, spoilboardY, spoilboardThickness, spoilboardOffsetX, spoilboardOffsetY, gridPitch, majorGridPitch } = this.config;

    const minorPts = [];
    const majorPts = [];
    const zSurface = 0.10 + spoilboardThickness;
    const zMinor = zSurface + 0.02;
    const zMajor = zSurface + 0.03;

    const x0 = spoilboardOffsetX;
    const x1 = spoilboardOffsetX + spoilboardX;
    const y0 = spoilboardOffsetY;
    const y1 = spoilboardOffsetY + spoilboardY;

    // Grid lines along X (running in Y direction)
    for (let x = x0; x <= x1 + 0.1; x += gridPitch) {
      const relX = Math.round(x - x0);
      const isMajor = (relX % majorGridPitch === 0);
      if (isMajor) {
        majorPts.push(x, y0, zMajor, x, y1, zMajor);
      } else {
        minorPts.push(x, y0, zMinor, x, y1, zMinor);
      }
    }

    // Grid lines along Y (running in X direction)
    for (let y = y0; y <= y1 + 0.1; y += gridPitch) {
      const relY = Math.round(y - y0);
      const isMajor = (relY % majorGridPitch === 0);
      if (isMajor) {
        majorPts.push(x0, y, zMajor, x1, y, zMajor);
      } else {
        minorPts.push(x0, y, zMinor, x1, y, zMinor);
      }
    }

    // Minor grid lines (10mm pitch) in bright light green
    if (minorPts.length > 0) {
      const minGeo = new THREE.BufferGeometry();
      minGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorPts, 3));
      const minMat = new THREE.LineBasicMaterial({
        color: 0x4ade80, // Bright Light Green
        transparent: true,
        opacity: 0.50,
        depthWrite: false
      });
      const minLines = new THREE.LineSegments(minGeo, minMat);
      minLines.renderOrder = -15;
      minLines.name = 'CLE_Bed_Grid_Minor_Green';
      this.bedGroup.add(minLines);
    }

    // Major grid lines (50mm pitch forming 50x50mm light green squares)
    if (majorPts.length > 0) {
      const majGeo = new THREE.BufferGeometry();
      majGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorPts, 3));
      const majMat = new THREE.LineBasicMaterial({
        color: 0x22c55e, // Vibrant Green Squares
        transparent: true,
        opacity: 0.85,
        linewidth: 2,
        depthWrite: false
      });
      const majLines = new THREE.LineSegments(majGeo, majMat);
      majLines.renderOrder = -15;
      majLines.name = 'CLE_Bed_Grid_Major_Green_Squares';
      this.bedGroup.add(majLines);
    }
  }

  // 3. MillMage / LightBurn Tool Lines (T1 Bed Boundary, T2 Soft-Limit Keep-Out Margins & Clamp Keepouts)
  buildMMLBKeepOutToolLines(THREE) {
    const { travelX, travelY, travelZ, spoilboardThickness } = this.config;
    const tz = travelZ || 100;
    const zToolLine = 0.10 + spoilboardThickness + 0.05;

    const toolLayerGroup = new THREE.Group();
    toolLayerGroup.name = 'CLE_MM_LB_Tool_Lines_Overlay';

    // --- T1: Work Area Perimeter Tool Line (600x500mm Boundary) ---
    const t1Pts = [
      0, 0, zToolLine,  travelX, 0, zToolLine,
      travelX, 0, zToolLine,  travelX, travelY, zToolLine,
      travelX, travelY, zToolLine,  0, travelY, zToolLine,
      0, travelY, zToolLine,  0, 0, zToolLine
    ];
    const t1Geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(t1Pts, 3));
    const t1Mat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, depthTest: false, transparent: true, opacity: 0.95 });
    const t1Line = new THREE.LineSegments(t1Geo, t1Mat);
    t1Line.renderOrder = 50;
    t1Line.name = 'CLE_T1_Bed_Boundary';
    toolLayerGroup.add(t1Line);

    // --- T2: Soft-Limit Keep-Out Margin (5mm Inset around Perimeter) ---
    const margin = 5.0;
    const t2Pts = [
      margin, margin, zToolLine,  travelX - margin, margin, zToolLine,
      travelX - margin, margin, zToolLine,  travelX - margin, travelY - margin, zToolLine,
      travelX - margin, travelY - margin, zToolLine,  margin, travelY - margin, zToolLine,
      margin, travelY - margin, zToolLine,  margin, margin, zToolLine
    ];
    const t2Geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(t2Pts, 3));
    const t2Mat = new THREE.LineDashedMaterial({
      color: 0xf59e0b, // Amber Warning Tool Line
      dashSize: 6,
      gapSize: 4,
      depthTest: false,
      transparent: true,
      opacity: 0.90
    });
    const t2Line = new THREE.LineSegments(t2Geo, t2Mat);
    t2Line.computeLineDistances();
    t2Line.renderOrder = 55;
    t2Line.name = 'CLE_T2_Keepout_Buffer';
    toolLayerGroup.add(t2Line);

    // --- Hold-Down Clamp Keep-Out Zones (4 Corners: 40x40mm) ---
    const clampSize = 40.0;
    const corners = [
      { x0: 0, y0: 0, x1: clampSize, y1: clampSize, labelPos: [20, 20] },
      { x0: travelX - clampSize, y0: 0, x1: travelX, y1: clampSize, labelPos: [travelX - 20, 20] },
      { x0: 0, y0: travelY - clampSize, x1: clampSize, y1: travelY, labelPos: [20, travelY - 20] },
      { x0: travelX - clampSize, y0: travelY - clampSize, x1: travelX, y1: travelY, labelPos: [travelX - 20, travelY - 20] }
    ];

    const clampPts = [];
    corners.forEach(c => {
      // Box outline
      clampPts.push(c.x0, c.y0, zToolLine,  c.x1, c.y0, zToolLine);
      clampPts.push(c.x1, c.y0, zToolLine,  c.x1, c.y1, zToolLine);
      clampPts.push(c.x1, c.y1, zToolLine,  c.x0, c.y1, zToolLine);
      clampPts.push(c.x0, c.y1, zToolLine,  c.x0, c.y0, zToolLine);
      // Diagonal cross-hatch
      clampPts.push(c.x0, c.y0, zToolLine,  c.x1, c.y1, zToolLine);
      clampPts.push(c.x1, c.y0, zToolLine,  c.x0, c.y1, zToolLine);
    });

    const clampGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(clampPts, 3));
    const clampMat = new THREE.LineDashedMaterial({
      color: 0xef4444, // Red Clamp Keepout
      dashSize: 4,
      gapSize: 3,
      depthTest: false,
      transparent: true,
      opacity: 0.85
    });
    const clampSegments = new THREE.LineSegments(clampGeo, clampMat);
    clampSegments.computeLineDistances();
    clampSegments.renderOrder = 60;
    clampSegments.name = 'CLE_Clamp_Keepout_Zones';
    toolLayerGroup.add(clampSegments);

    // Corner Keep-Out Badge Sprite
    const clampBadge = this.createNumberLabelSprite(THREE, 'CLAMP KEEPOUT', '#ef4444');
    clampBadge.position.set(22, 22, zToolLine + 1.0);
    clampBadge.scale.set(24, 10, 1);
    clampBadge.renderOrder = 65;
    toolLayerGroup.add(clampBadge);

    // 3D Travel Volume Frame (600x500x100mm)
    const travelBoxPts = [
      0, 0, zToolLine,  travelX, 0, zToolLine,
      travelX, 0, zToolLine,  travelX, travelY, zToolLine,
      travelX, travelY, zToolLine,  0, travelY, zToolLine,
      0, travelY, zToolLine,  0, 0, zToolLine,
      0, 0, zToolLine + tz,  travelX, 0, zToolLine + tz,
      travelX, 0, zToolLine + tz,  travelX, travelY, zToolLine + tz,
      travelX, travelY, zToolLine + tz,  0, travelY, zToolLine + tz,
      0, travelY, zToolLine + tz,  0, 0, zToolLine + tz,
      0, 0, zToolLine,  0, 0, zToolLine + tz,
      travelX, 0, zToolLine,  travelX, 0, zToolLine + tz,
      travelX, travelY, zToolLine,  travelX, travelY, zToolLine + tz,
      0, travelY, zToolLine,  0, travelY, zToolLine + tz
    ];
    const travelGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(travelBoxPts, 3));
    const travelMat = new THREE.LineBasicMaterial({ color: 0xd946ef, linewidth: 2, transparent: true, opacity: 0.70 });
    const travelFrame = new THREE.LineSegments(travelGeo, travelMat);
    travelFrame.name = 'CLE_Machine_Travel_Volume_Box';
    toolLayerGroup.add(travelFrame);

    this.bedGroup.add(toolLayerGroup);
  }

  // 3. Machine Tool Lines (X, Y, Z Axes Marker at Spoilboard Surface Origin)
  buildMachineOriginToolLines(THREE) {
    const { travelX, travelY, travelZ, spoilboardThickness } = this.config;
    const tz = travelZ || 100;
    const zOrigin = 0.10 + spoilboardThickness + 0.08;

    const toolLinesGroup = new THREE.Group();
    toolLinesGroup.name = 'CLE_Machine_Tool_Lines_XYZ';

    // --- Red X Axis Tool Line (Across front edge 0..travelX) ---
    const xPts = [0, 0, zOrigin,  travelX, 0, zOrigin];
    const xGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(xPts, 3));
    const xMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 4, depthTest: false });
    const xLine = new THREE.Line(xGeo, xMat);
    toolLinesGroup.add(xLine);

    // Thick 3D X Tool Rod
    const xRodGeo = new THREE.CylinderGeometry(1.2, 1.2, travelX, 12);
    const xRodMat = new THREE.MeshBasicMaterial({ color: 0xef4444, depthTest: false });
    const xRod = new THREE.Mesh(xRodGeo, xRodMat);
    xRod.position.set(travelX / 2, 0, zOrigin);
    xRod.rotation.z = -Math.PI / 2;
    toolLinesGroup.add(xRod);

    // X Arrow Head & Sprite Label
    const xConeGeo = new THREE.ConeGeometry(3.5, 12, 16);
    const xCone = new THREE.Mesh(xConeGeo, xRodMat);
    xCone.position.set(travelX + 6, 0, zOrigin);
    xCone.rotation.z = -Math.PI / 2;
    toolLinesGroup.add(xCone);

    const xLabel = this.createNumberLabelSprite(THREE, `X (${travelX}mm)`, '#ef4444');
    xLabel.position.set(travelX + 28, 0, zOrigin + 2);
    xLabel.scale.set(32, 16, 1);
    toolLinesGroup.add(xLabel);

    // --- Green Y Axis Tool Line (Along left edge 0..travelY) ---
    const yPts = [0, 0, zOrigin,  0, travelY, zOrigin];
    const yGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(yPts, 3));
    const yMat = new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 4, depthTest: false });
    const yLine = new THREE.Line(yGeo, yMat);
    toolLinesGroup.add(yLine);

    // Thick 3D Y Tool Rod
    const yRodGeo = new THREE.CylinderGeometry(1.2, 1.2, travelY, 12);
    const yRodMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, depthTest: false });
    const yRod = new THREE.Mesh(yRodGeo, yRodMat);
    yRod.position.set(0, travelY / 2, zOrigin);
    toolLinesGroup.add(yRod);

    // Y Arrow Head & Sprite Label
    const yConeGeo = new THREE.ConeGeometry(3.5, 12, 16);
    const yCone = new THREE.Mesh(yConeGeo, yRodMat);
    yCone.position.set(0, travelY + 6, zOrigin);
    toolLinesGroup.add(yCone);

    const yLabel = this.createNumberLabelSprite(THREE, `Y (${travelY}mm)`, '#22c55e');
    yLabel.position.set(0, travelY + 26, zOrigin + 2);
    yLabel.scale.set(32, 16, 1);
    toolLinesGroup.add(yLabel);

    // --- Blue Z Axis Tool Line (Vertical corner post zOrigin .. zOrigin + tz) ---
    const zPts = [0, 0, zOrigin,  0, 0, zOrigin + tz];
    const zGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(zPts, 3));
    const zMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 4, depthTest: false });
    const zLine = new THREE.Line(zGeo, zMat);
    toolLinesGroup.add(zLine);

    // Thick 3D Z Tool Rod
    const zRodGeo = new THREE.CylinderGeometry(1.2, 1.2, tz, 12);
    const zRodMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, depthTest: false });
    const zRod = new THREE.Mesh(zRodGeo, zRodMat);
    zRod.position.set(0, 0, zOrigin + tz / 2);
    zRod.rotation.x = Math.PI / 2;
    toolLinesGroup.add(zRod);

    // Z Arrow Head & Sprite Label
    const zConeGeo = new THREE.ConeGeometry(3.5, 12, 16);
    const zCone = new THREE.Mesh(zConeGeo, zRodMat);
    zCone.position.set(0, 0, zOrigin + tz + 6);
    zCone.rotation.x = Math.PI;
    toolLinesGroup.add(zCone);

    const zLabel = this.createNumberLabelSprite(THREE, `Z (${tz}mm)`, '#3b82f6');
    zLabel.position.set(0, 0, zOrigin + tz + 20);
    zLabel.scale.set(32, 16, 1);
    toolLinesGroup.add(zLabel);

    // Origin WCS Badge at (0, 0, zOrigin)
    const wcsTag = this.createNumberLabelSprite(THREE, `WCS (0,0) Z+${(0.10 + spoilboardThickness).toFixed(1)}mm`, '#f59e0b');
    wcsTag.position.set(-16, -16, zOrigin + 2);
    wcsTag.scale.set(32, 14, 1);
    toolLinesGroup.add(wcsTag);

    this.bedGroup.add(toolLinesGroup);
  }

  // 3. Millimeter Rulers along X and Y axes with Tick Marks and Numerical Labels on Spoilboard Surface
  buildMillimeterRulers(THREE) {
    const { travelX, travelY, spoilboardThickness, spoilboardOffsetX, spoilboardOffsetY } = this.config;
    const zSurface = 0.10 + spoilboardThickness + 0.06;

    const tickPts = [];
    const rulerColor = 0x94a3b8;

    // Dispose old label sprites
    this.rulerSprites.forEach(s => {
      if (s.material && s.material.map) s.material.map.dispose();
      if (s.material) s.material.dispose();
    });
    this.rulerSprites = [];

    // --- X-Axis Ruler (Front edge, Y = spoilboardOffsetY) ---
    const baseY = spoilboardOffsetY;
    for (let x = 0; x <= travelX + 0.1; x += 10) {
      const is100 = (Math.round(x) % 100 === 0);
      const is50 = (Math.round(x) % 50 === 0);
      const tickLen = is100 ? 8.0 : (is50 ? 5.5 : 3.0);

      tickPts.push(x, baseY, zSurface, x, baseY - tickLen, zSurface);

      // Create Number Label at 50mm and 100mm marks
      if (is50 || is100) {
        const sprite = this.createNumberLabelSprite(THREE, `${Math.round(x)}`);
        sprite.position.set(x, baseY - tickLen - 6.0, zSurface + 1.0);
        sprite.scale.set(16, 8, 1);
        this.bedGroup.add(sprite);
        this.rulerSprites.push(sprite);
      }
    }

    // --- Y-Axis Ruler (Left edge, X = spoilboardOffsetX) ---
    const baseX = spoilboardOffsetX;
    for (let y = 0; y <= travelY + 0.1; y += 10) {
      const is100 = (Math.round(y) % 100 === 0);
      const is50 = (Math.round(y) % 50 === 0);
      const tickLen = is100 ? 8.0 : (is50 ? 5.5 : 3.0);

      tickPts.push(baseX, y, zSurface, baseX - tickLen, y, zSurface);

      // Create Number Label at 50mm and 100mm marks
      if (is50 || is100) {
        const sprite = this.createNumberLabelSprite(THREE, `${Math.round(y)}`);
        sprite.position.set(baseX - tickLen - 9.0, y, zSurface + 1.0);
        sprite.scale.set(16, 8, 1);
        this.bedGroup.add(sprite);
        this.rulerSprites.push(sprite);
      }
    }

    // --- Z-Axis Millimeter Ruler (Vertical Post, from Spoilboard Surface Z+0 up to Travel Z) ---
    const tz = this.config.travelZ || 100;
    for (let z = 0; z <= tz + 0.1; z += 5) {
      const is50 = (Math.round(z) % 50 === 0);
      const is20 = (Math.round(z) % 20 === 0);
      const is10 = (Math.round(z) % 10 === 0);
      const tickLen = is50 ? 8.0 : (is20 ? 6.0 : (is10 ? 4.5 : 2.5));
      const curZ = zSurface + z;

      // Tick line projecting out towards negative X
      tickPts.push(baseX, baseY, curZ, baseX - tickLen, baseY, curZ);

      // Number labels every 20mm and 50mm (e.g. Z0, Z20, Z40, Z60, Z80, Z100)
      if (is20 || is50) {
        const sprite = this.createNumberLabelSprite(THREE, `Z${Math.round(z)}`, '#38bdf8');
        sprite.position.set(baseX - tickLen - 8.0, baseY, curZ);
        sprite.scale.set(18, 9, 1);
        this.bedGroup.add(sprite);
        this.rulerSprites.push(sprite);
      }
    }

    // Add tick line segments
    const tickGeo = new THREE.BufferGeometry();
    tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickPts, 3));
    const tickMat = new THREE.LineBasicMaterial({ color: rulerColor, transparent: true, opacity: 0.85 });
    const tickSegments = new THREE.LineSegments(tickGeo, tickMat);
    this.bedGroup.add(tickSegments);

    // Origin Badge (0,0) Marker
    const originSprite = this.createNumberLabelSprite(THREE, 'X0 Y0 (Origin)', '#38bdf8');
    originSprite.position.set(baseX - 6.0, baseY - 6.0, zSurface + 1.5);
    originSprite.scale.set(24, 10, 1);
    this.bedGroup.add(originSprite);
    this.rulerSprites.push(originSprite);
  }

  // Generates high-DPI canvas texture sprite for crisp ruler numbers
  createNumberLabelSprite(THREE, text, color = '#f8fafc') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 128, 64);
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow for high contrast against any 3D viewport background
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0f172a';
    ctx.strokeText(text, 64, 32);

    ctx.fillStyle = color;
    ctx.fillText(text, 64, 32);

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

  // 4. Live 3D Toolhead Cursor, Projected Spoilboard Crosshair & Live DRO Coordinates
  buildToolheadCursor(THREE) {
    if (this.cursorGroup && this.cursorGroup.parent) {
      this.cursorGroup.parent.remove(this.cursorGroup);
    }

    this.cursorGroup = new THREE.Group();
    this.cursorGroup.name = 'CLE_Live_Toolhead_Cursor';

    const activeHead = this.bridge.vault ? this.bridge.vault.getActiveHead() : { type: 'spindle' };

    if (activeHead.type === 'laser') {
      // LASER HEAD: Anodized Heatsink Body + Laser Cone Beam in Vivid Bright Red
      const headMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.7, roughness: 0.25 });
      const headMesh = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 26), headMat);
      headMesh.position.set(0, 0, 15);
      this.cursorGroup.add(headMesh);

      // Laser focal cone beam (Bright Red)
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xff0033,
        transparent: true,
        opacity: 0.75,
        depthWrite: false
      });
      const beamCone = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 16, 1, true), beamMat);
      beamCone.position.set(0, 0, 6);
      beamCone.rotation.x = Math.PI;
      this.cursorGroup.add(beamCone);
    } else {
      // SPINDLE HEAD: ER11/ER16 Collet Nut + Carbide Endmill Bit in Bright Red for high-contrast surface contact
      const colletMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.8, roughness: 0.2 }); // Vivid Crimson/Red
      const colletMesh = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.5, 12, 16), colletMat);
      colletMesh.position.set(0, 0, 10);
      colletMesh.rotation.x = Math.PI / 2;
      this.cursorGroup.add(colletMesh);

      // Bit shank & flutes pointing down to (0,0,0) in Bright Vivid Red
      const bitMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.85, roughness: 0.15 }); // Bright Electric Red
      const bitMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 12), bitMat);
      bitMesh.position.set(0, 0, 4);
      bitMesh.rotation.x = Math.PI / 2;
      this.cursorGroup.add(bitMesh);

      // Glowing Neon Red Contact Reticle at Cutting Tip (Z=0) so tool contact surface is instantly visible
      const tipRingGeo = new THREE.RingGeometry(0.6, 3.6, 24);
      const tipRingMat = new THREE.MeshBasicMaterial({
        color: 0xff0033, // Vivid Glowing Neon Red
        side: THREE.DoubleSide,
        depthTest: false,
        transparent: true,
        opacity: 0.95
      });
      const tipRing = new THREE.Mesh(tipRingGeo, tipRingMat);
      tipRing.position.set(0, 0, 0.05);
      this.cursorGroup.add(tipRing);

      // Pinpoint White Center Contact Dot at (0,0,0) inside the Red Reticle
      const tipDotGeo = new THREE.CircleGeometry(0.8, 16);
      const tipDotMat = new THREE.MeshBasicMaterial({
        color: 0xffffff, // Pure white center dot
        side: THREE.DoubleSide,
        depthTest: false
      });
      const tipDot = new THREE.Mesh(tipDotGeo, tipDotMat);
      tipDot.position.set(0, 0, 0.06);
      this.cursorGroup.add(tipDot);
    }

    // 3D Tool Lines at Cursor Tip (think of tool lines X, Y, Z)
    const tipAxisGroup = new THREE.Group();
    tipAxisGroup.name = 'CLE_Tool_Tip_Lines_XYZ';

    // X Tool Line (Red: -35mm to +35mm)
    const txPts = [-35, 0, 0,  35, 0, 0];
    const txGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(txPts, 3));
    const txMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 3, depthTest: false });
    tipAxisGroup.add(new THREE.LineSegments(txGeo, txMat));

    // Y Tool Line (Green: -35mm to +35mm)
    const tyPts = [0, -35, 0,  0, 35, 0];
    const tyGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tyPts, 3));
    const tyMat = new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 3, depthTest: false });
    tipAxisGroup.add(new THREE.LineSegments(tyGeo, tyMat));

    // Z Tool Line (Blue: 0 to +45mm)
    const tzPts = [0, 0, 0,  0, 0, 45];
    const tzGeo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tzPts, 3));
    const tzMat = new THREE.LineBasicMaterial({ color: 0x3b82f6, linewidth: 3, depthTest: false });
    tipAxisGroup.add(new THREE.LineSegments(tzGeo, tzMat));

    this.tipAxisGroup = tipAxisGroup;
    this.cursorGroup.add(tipAxisGroup);

    // Floating 3D DRO Coordinate Badge
    this.coordTag = this.createNumberLabelSprite(THREE, 'X0.00 Y0.00 Z0.00', '#ef4444');
    this.coordTag.position.set(0, 0, 32);
    this.coordTag.scale.set(28, 12, 1);
    this.cursorGroup.add(this.coordTag);

    // Initial position
    this.cursorGroup.position.set(this.lastPos.X, this.lastPos.Y, this.lastPos.Z);
    this.bedGroup.add(this.cursorGroup);

    // Projected Crosshair on Spoilboard Surface
    this.buildShadowCrosshair(THREE);
  }

  // Projected Shadow Crosshair & Guide Lines to Rulers on Spoilboard Surface
  buildShadowCrosshair(THREE) {
    if (this.shadowCrosshair && this.shadowCrosshair.parent) {
      this.shadowCrosshair.parent.remove(this.shadowCrosshair);
    }

    const { spoilboardThickness } = this.config;
    const zCrosshair = 0.10 + spoilboardThickness + 0.04;

    this.shadowCrosshair = new THREE.Group();
    this.shadowCrosshair.name = 'CLE_Spoilboard_Crosshair_Shadow';

    // Concentric Target Ring on Spoilboard Surface
    const ringGeo = new THREE.RingGeometry(3.0, 4.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(0, 0, zCrosshair);
    this.shadowCrosshair.add(ringMesh);

    // Dynamic Guide Line Segments to X and Y rulers
    const guideGeo = new THREE.BufferGeometry();
    const guidePositions = new Float32Array(12); // 2 lines = 4 points = 12 floats
    guideGeo.setAttribute('position', new THREE.BufferAttribute(guidePositions, 3));
    const guideMat = new THREE.LineDashedMaterial({
      color: 0x0284c7,
      dashSize: 4,
      gapSize: 3,
      transparent: true,
      opacity: 0.65,
      depthTest: false
    });
    this.guideLines = new THREE.LineSegments(guideGeo, guideMat);
    this.guideLines.computeLineDistances();
    this.shadowCrosshair.add(this.guideLines);

    this.bedGroup.add(this.shadowCrosshair);
    this.updateCrosshairShadow(this.lastPos.X, this.lastPos.Y);
  }

  // Toggle extended guide rays and tip lines on/off (clean tool view during slicing/trace)
  setRaysVisible(visible) {
    this._raysHidden = !visible;
    if (this.guideLines) this.guideLines.visible = visible;
    if (this.tipAxisGroup) this.tipAxisGroup.visible = visible;
    if (this.shadowCrosshair) this.shadowCrosshair.visible = visible;
    this.requestRender();
  }

  // Update Crosshair Position & Projection Lines
  updateCrosshairShadow(x, y) {
    if (!this.shadowCrosshair || !this.guideLines) return;
    if (this._raysHidden) {
      this.shadowCrosshair.visible = false;
      this.guideLines.visible = false;
      return;
    }

    this.shadowCrosshair.position.set(x, y, 0);

    const posAttr = this.guideLines.geometry.attributes.position;
    const baseY = this.config.spoilboardOffsetY;
    const baseX = this.config.spoilboardOffsetX;
    const zCrosshair = 0.10 + this.config.spoilboardThickness + 0.04;

    // Line 1: from (x, y) down to front X-axis ruler at (x, baseY)
    posAttr.setXYZ(0, 0, 0, zCrosshair);
    posAttr.setXYZ(1, 0, baseY - y, zCrosshair);

    // Line 2: from (x, y) left to Y-axis ruler at (baseX, y)
    posAttr.setXYZ(2, 0, 0, zCrosshair);
    posAttr.setXYZ(3, baseX - x, 0, zCrosshair);

    posAttr.needsUpdate = true;
    this.guideLines.computeLineDistances();
  }

  // Live Toolhead Cursor Position & DRO Update
  updateToolCursor(pos) {
    if (!pos) return;
    const x = pos.X !== undefined ? pos.X : (pos.x !== undefined ? pos.x : this.lastPos.X);
    const y = pos.Y !== undefined ? pos.Y : (pos.y !== undefined ? pos.y : this.lastPos.Y);
    const z = pos.Z !== undefined ? pos.Z : (pos.z !== undefined ? pos.z : this.lastPos.Z);
    const a = pos.A !== undefined ? pos.A : (pos.a !== undefined ? pos.a : this.lastPos.A);
    this.lastPos = { X: x, Y: y, Z: z, A: a };

    if (this.cursorGroup) {
      this.cursorGroup.position.set(x, y, z);
      this.cursorGroup.visible = true;
      if (this._raysHidden && this.tipAxisGroup) {
        this.tipAxisGroup.visible = false;
      }
    }
    this.updateCrosshairShadow(x, y);

    if (this.coordTag) {
      const aText = (a !== undefined && a !== 0) ? ` A${a.toFixed(1)}°` : '';
      const textStr = `X${x.toFixed(1)} Y${y.toFixed(1)} Z${z.toFixed(1)}${aText}`;
      if (textStr !== this._lastCoordText) {
        this._lastCoordText = textStr;
        if (!this._coordCanvas) {
          this._coordCanvas = document.createElement('canvas');
          this._coordCanvas.width = 256;
          this._coordCanvas.height = 64;
          this._coordCtx = this._coordCanvas.getContext('2d');
        }
        const ctx = this._coordCtx;
        ctx.clearRect(0, 0, 256, 64);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.fillRect(0, 0, 256, 64);
        ctx.strokeRect(0, 0, 256, 64);
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(textStr, 128, 32);

        if (this.coordTag.material && this.coordTag.material.map) {
          this.coordTag.material.map.needsUpdate = true;
        }
      }
    }
    this.requestRender();
  }

  // Sit 3D CAD Workpiece Flush on Top of Spoilboard Surface
  // Physics Stack: Aluminum Table @ Z = 0.1mm, Spoilboard Thickness = T mm, Surface = 0.1 + T mm
  sitWorkpieceOnSpoilboard() {
    const app = window.app || window.xe;
    if (!app || !app.scene || !app.scene.root) return;
    const THREE = window.THREE;
    if (!THREE) return;

    // --- A-Axis 4th Axis Mode (Replaces Spoilboard) ---
    if (this.bridge?.rotary && this.bridge.rotary.enabled) {
      const rot = this.bridge.rotary;
      // In A-Axis operations, spoilboard is NOT used and sits unmounted
      const slab = this.bedGroup ? this.bedGroup.getObjectByName('CLE_Spoilboard_Slab') : null;
      const topPlane = this.bedGroup ? this.bedGroup.getObjectByName('CLE_Bed_Top_Plane') : null;
      if (slab) slab.visible = false;
      if (topPlane) topPlane.visible = false;

      // Center workpiece along the A-axis rotation centerline (Y=centerY, Z=zCenter)
      let cy = 0, cz = 0;
      let hasBox = false;
      if (typeof app.scene.allBox === 'function') {
        const box = app.scene.allBox();
        if (box && isFinite(box.min.y)) {
          cy = (box.min.y + box.max.y) / 2;
          cz = (box.min.z + box.max.z) / 2;
          hasBox = true;
        }
      }

      const zCenter = rot.getZCenter(); // 45.10mm (45mm above bed table)
      const yCenter = rot.centerY;       // 250mm
      const deltaY = hasBox ? (yCenter - cy) : 0;
      const deltaZ = hasBox ? (zCenter - cz) : zCenter;

      app.scene.root.position.set(0, deltaY, deltaZ);
      app.scene.root.updateMatrixWorld(true);
      this.workpieceZ = zCenter;
      this.requestRender();
      console.log(`[CLE Bed] Workpiece centered on A-Axis rotation line: Y=${yCenter}mm, Z=${zCenter.toFixed(2)}mm (45mm above bed, spoilboard unmounted).`);
      return;
    }

    // Restore spoilboard visibility if rotary is disabled
    const slab = this.bedGroup ? this.bedGroup.getObjectByName('CLE_Spoilboard_Slab') : null;
    const topPlane = this.bedGroup ? this.bedGroup.getObjectByName('CLE_Bed_Top_Plane') : null;
    if (slab) slab.visible = true;
    if (topPlane) topPlane.visible = true;

    const surfaceZ = 0.10 + (this.config.spoilboardThickness !== undefined ? this.config.spoilboardThickness : 20.0);

    // 1. Compute lowest Z coordinate of active CAD bodies
    let minZ = 0;
    let hasBodies = false;
    try {
      if (typeof app.scene.allBox === 'function') {
        const box = app.scene.allBox();
        if (box && isFinite(box.min.z) && Math.abs(box.min.z) < 1e8) {
          minZ = box.min.z;
          hasBodies = true;
        }
      }
    } catch (e) {}

    if (!hasBodies && app.scene.views) {
      try {
        for (const [id, view] of app.scene.views) {
          if (view.data && view.data.bbox && view.data.bbox.min) {
            const bMinZ = view.data.bbox.min[2];
            if (bMinZ < minZ || !hasBodies) {
              minZ = bMinZ;
              hasBodies = true;
            }
          }
        }
      } catch (e) {}
    }

    // Delta required to sit workpiece bottom flush on top of spoilboard surface
    const deltaZ = hasBodies ? (surfaceZ - minZ) : surfaceZ;
    app.scene.root.position.z = deltaZ;
    app.scene.root.updateMatrixWorld(true);
    this.workpieceZ = surfaceZ;

    this.requestRender();
    console.log(`[CLE Bed] Workpiece seated flush on spoilboard surface: Z=${surfaceZ.toFixed(2)}mm (bed Z=0.1mm, spoilboard thickness=${this.config.spoilboardThickness}mm, deltaZ=${deltaZ.toFixed(2)}mm).`);
  }

  // Rotate Workpiece around X (A-Axis), Y, or Z
  rotateWorkpiece(axis = 'X', angleDeg = 90) {
    const app = window.app || window.xe;
    if (!app || !app.scene) return;
    const rad = (angleDeg * Math.PI) / 180;
    const THREE = window.THREE;
    if (!THREE) return;

    if (app.scene.views && app.scene.views.size > 0) {
      for (const [id, view] of app.scene.views) {
        if (view.group) {
          if (axis === 'X') view.group.rotation.x += rad;
          else if (axis === 'Y') view.group.rotation.y += rad;
          else if (axis === 'Z') view.group.rotation.z += rad;
          view.group.updateMatrixWorld(true);
        } else if (view.mesh) {
          if (axis === 'X') view.mesh.rotation.x += rad;
          else if (axis === 'Y') view.mesh.rotation.y += rad;
          else if (axis === 'Z') view.mesh.rotation.z += rad;
          view.mesh.updateMatrixWorld(true);
        }
      }
    } else if (app.scene.root) {
      if (axis === 'X') app.scene.root.rotation.x += rad;
      else if (axis === 'Y') app.scene.root.rotation.y += rad;
      else if (axis === 'Z') app.scene.root.rotation.z += rad;
      app.scene.root.updateMatrixWorld(true);
    }

    this.sitWorkpieceOnSpoilboard();
    this.requestRender();
    if (this.bridge) this.bridge.notify(`Rotated workpiece ${angleDeg}° about ${axis}-axis (A-Axis alignment).`, 'ok');
  }

  // Live Spoilboard Dimension & Z Thickness Adjuster
  async setSpoilboardDimensions({ x, y, thickness, cutoutOvercut, saveToVault = true }) {
    if (x !== undefined && isFinite(x) && x > 0) this.config.spoilboardX = parseFloat(x);
    if (y !== undefined && isFinite(y) && y > 0) this.config.spoilboardY = parseFloat(y);
    if (thickness !== undefined && isFinite(thickness) && thickness >= 0) this.config.spoilboardThickness = parseFloat(thickness);
    if (cutoutOvercut !== undefined && isFinite(cutoutOvercut)) this.config.cutoutOvercut = parseFloat(cutoutOvercut);

    // Rebuild 3D bed scene
    this.mountToScene();

    // Re-seat workpiece on new spoilboard surface
    this.sitWorkpieceOnSpoilboard();

    // Persist to Vault
    if (saveToVault && this.bridge.vault) {
      const mach = this.bridge.vault.getActiveMachine();
      if (mach) {
        mach.spoilboardX = this.config.spoilboardX;
        mach.spoilboardY = this.config.spoilboardY;
        mach.spoilboardThickness = this.config.spoilboardThickness;
        mach.cutoutOvercut = this.config.cutoutOvercut;
        await this.bridge.vault.saveMachine(mach);
        console.log('[CLE Bed] Spoilboard dimensions persisted to active machine profile in Vault.');
      }
    }

    this.requestRender();
    this.bridge.notify(`Spoilboard Updated: ${this.config.spoilboardX}x${this.config.spoilboardY}x${this.config.spoilboardThickness}mm (Workpiece seated at Z=${(0.1 + this.config.spoilboardThickness).toFixed(2)}mm)`, 'ok');
  }

  // Toggle Visibility of Bed, Spoilboard & Elevated Workpiece
  toggle() {
    this.visible = !this.visible;
    if (this.bedGroup) {
      this.bedGroup.visible = this.visible;
    }
    const app = window.app || window.xe;
    if (app && app.scene && app.scene.root) {
      if (this.visible) {
        // Seat workpiece on top of spoilboard
        this.sitWorkpieceOnSpoilboard();
      } else {
        // Return workpiece to standard CAD workspace (Z = 0)
        app.scene.root.position.z = 0;
        app.scene.root.updateMatrixWorld(true);
      }
    }
    this.requestRender();
    this.bridge.notify(`Machine Bed & Spoilboard: ${this.visible ? 'ACTIVE (Workpiece seated on Spoilboard)' : 'HIDDEN (Workpiece on normal CAD zero)'}`, 'info');
    return this.visible;
  }

  // Safely dispose all geometries, materials and textures to prevent memory leaks
  disposeBedGroup() {
    if (!this.bedGroup) return;
    if (this.rulerSprites) {
      this.rulerSprites.forEach(s => {
        if (s.material && s.material.map) s.material.map.dispose();
        if (s.material) s.material.dispose();
      });
      this.rulerSprites = [];
    }

    this.bedGroup.traverse((obj) => {
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

    if (this.bedGroup.parent) {
      this.bedGroup.parent.remove(this.bedGroup);
    }
    this.bedGroup = null;
    this.cursorGroup = null;
    this.shadowCrosshair = null;
    this.guideLines = null;
    this.coordTag = null;
    this._coordCanvas = null;
    this._coordCtx = null;
    this._lastCoordText = null;
  }

  // ==========================================
  // Bed Object Management & Interactive Placement
  // ==========================================

  getBedObjects() {
    const objects = [];
    const app = window.app || window.xe;
    const doc = window.Se?.doc || app?.scene?.doc || app?.doc;

    // 1. Sketches & Imported Photos/Images
    if (doc && Array.isArray(doc.sketches)) {
      doc.sketches.forEach(s => {
        if (s.hidden) return;
        const isImage = !!(s.image && s.image.src);
        const ox = s.plane?.o?.[0] !== undefined ? s.plane.o[0] : 300.0;
        const oy = s.plane?.o?.[1] !== undefined ? s.plane.o[1] : 250.0;
        const oz = s.plane?.o?.[2] !== undefined ? s.plane.o[2] : 20.10;
        objects.push({
          type: isImage ? 'photo' : 'sketch',
          id: s.id,
          name: s.name || (isImage ? 'Photo Image' : 'Sketch'),
          isImage,
          imageSrc: s.image?.src || null,
          w: isImage ? (s.image.w || 100.0) : 100.0,
          h: isImage ? (s.image.h || 100.0) : 100.0,
          x: ox,
          y: oy,
          z: oz,
          raw: s
        });
      });
    }

    // 2. 3D CAD Bodies
    if (doc && Array.isArray(doc.bodies)) {
      doc.bodies.forEach(b => {
        if (b.hidden || b.hole) return;
        let bx = 300.0, by = 250.0, bz = 20.10;
        if (b.m && b.m.length >= 16) {
          bx = b.m[12];
          by = b.m[13];
          bz = b.m[14];
        }
        objects.push({
          type: 'body',
          id: b.id,
          name: b.name || '3D Body',
          isImage: false,
          imageSrc: null,
          w: 60.0,
          h: 60.0,
          x: bx,
          y: by,
          z: bz,
          raw: b
        });
      });
    }

    // 3. Grayscale 3D Relief Mesh
    if (this.bridge?.slicer?.reliefMesh) {
      const rm = this.bridge.slicer.reliefMesh;
      objects.push({
        type: 'relief',
        id: 'cle_relief_mesh',
        name: '3D Grayscale Relief Mesh',
        isImage: false,
        imageSrc: null,
        w: this.bridge.slicer.activeGrayscaleOptions?.targetWidth || 100.0,
        h: this.bridge.slicer.activeGrayscaleOptions?.targetHeight || 100.0,
        x: rm.position.x,
        y: rm.position.y,
        z: rm.position.z,
        raw: rm
      });
    }

    return objects;
  }

  selectBedObject(type, id) {
    const objs = this.getBedObjects();
    const found = objs.find(o => o.type === type && o.id === id);
    if (!found) return;

    this.selectedObject = found;
    const app = window.app || window.xe;

    if (type === 'body' && app && app.select) {
      app.select([id]);
    }

    this.renderSelectionOutline(found);
    this.mountBedHUD(found);
    this.bridge.notify(`Selected: ${found.name} (X=${found.x.toFixed(1)}, Y=${found.y.toFixed(1)})`, 'info');
  }

  deselectBedObject() {
    this.selectedObject = null;
    if (this._selBoxMesh && this._selBoxMesh.parent) {
      this._selBoxMesh.parent.remove(this._selBoxMesh);
      this._selBoxMesh = null;
    }
    const hud = document.getElementById('cle-bed-pos-hud');
    if (hud) hud.remove();
    this.requestRender();
  }

  renderSelectionOutline(obj) {
    const THREE = window.THREE;
    if (!THREE || !this.bedGroup) return;

    if (this._selBoxMesh && this._selBoxMesh.parent) {
      this._selBoxMesh.parent.remove(this._selBoxMesh);
      this._selBoxMesh = null;
    }

    const w = obj.w || 80.0;
    const h = obj.h || 80.0;
    const halfW = w / 2 + 3.0;
    const halfH = h / 2 + 3.0;
    const z = (this.config.spoilboardThickness || 20.0) + 0.35; // Hover just above spoilboard

    const pts = [
      new THREE.Vector3(-halfW, -halfH, 0),
      new THREE.Vector3(halfW, -halfH, 0),
      new THREE.Vector3(halfW, halfH, 0),
      new THREE.Vector3(-halfW, halfH, 0),
      new THREE.Vector3(-halfW, -halfH, 0)
    ];

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff, // Luminous neon cyan selection ring
      linewidth: 3,
      depthTest: false
    });

    this._selBoxMesh = new THREE.Line(geo, mat);
    this._selBoxMesh.name = 'CLE_Bed_Selection_Outline';
    this._selBoxMesh.position.set(obj.x, obj.y, z);
    this.bedGroup.add(this._selBoxMesh);
    this.requestRender();
  }

  moveBedObject(type, id, newX, newY, newZ) {
    const app = window.app || window.xe;
    const zVal = newZ !== undefined ? newZ : (this.config.spoilboardThickness || 20.0) + 0.10;

    if (type === 'photo' || type === 'sketch') {
      if (window.Se && window.Se.update) {
        window.Se.update(doc => {
          const sk = doc.sketches.find(s => s.id === id);
          if (sk && sk.plane) {
            sk.plane.o[0] = newX;
            sk.plane.o[1] = newY;
            sk.plane.o[2] = zVal;
          }
        }, 'Move Sketch on Bed');
      }
    } else if (type === 'body') {
      if (window.Se && window.Se.update) {
        window.Se.update(doc => {
          const b = doc.bodies.find(x => x.id === id);
          if (b && b.m) {
            b.m[12] = newX;
            b.m[13] = newY;
            b.m[14] = zVal;
          }
        }, 'Move Body on Bed');
      }
    } else if (type === 'relief') {
      if (this.bridge?.slicer?.reliefMesh) {
        this.bridge.slicer.reliefMesh.position.set(newX, newY, zVal);
      }
    }

    if (this.selectedObject && this.selectedObject.id === id) {
      this.selectedObject.x = newX;
      this.selectedObject.y = newY;
      this.selectedObject.z = zVal;
      if (this._selBoxMesh) {
        this._selBoxMesh.position.set(newX, newY, zVal + 0.25);
      }
      this.updateBedHUDValues(newX, newY);
    }

    if (app && app.scene && app.scene.refresh) app.scene.refresh();
    this.requestRender();
  }

  mountBedHUD(obj) {
    let hud = document.getElementById('cle-bed-pos-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'cle-bed-pos-hud';
      hud.style.cssText = `
        position: absolute;
        bottom: 24px;
        left: 20px;
        z-index: 1000;
        background: var(--paper, #1e1e24);
        border: 1px solid var(--accent, #00f0ff);
        border-radius: 8px;
        padding: 10px 14px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        font-family: var(--f-ui, sans-serif);
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 280px;
      `;
      const container = document.getElementById('viewport') || document.body;
      container.appendChild(hud);
    }

    const icon = obj.isImage ? '🖼️' : (obj.type === 'body' ? '📦' : '🏔️');
    hud.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
        <span style="font-weight:700; font-size:12px; color:var(--ink, #fff); display:flex; align-items:center; gap:6px;">
          <span>${icon}</span>
          <span style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${obj.name}</span>
        </span>
        <button id="cle-hud-close" style="background:none; border:none; cursor:pointer; color:var(--ink-2, #888); font-size:14px; padding:0 4px;">✕</button>
      </div>

      <div style="display:flex; gap:10px; align-items:center;">
        <div style="display:flex; align-items:center; gap:4px;">
          <label style="font-size:11px; font-weight:700; color:var(--ink, #fff);">X:</label>
          <input id="cle-hud-inp-x" class="cle-input" type="number" step="1.0" value="${obj.x.toFixed(1)}" style="width:70px; padding:3px 6px; font-size:11px; font-family:var(--f-mono);">
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <label style="font-size:11px; font-weight:700; color:var(--ink, #fff);">Y:</label>
          <input id="cle-hud-inp-y" class="cle-input" type="number" step="1.0" value="${obj.y.toFixed(1)}" style="width:70px; padding:3px 6px; font-size:11px; font-family:var(--f-mono);">
        </div>
        <span style="font-size:11px; color:var(--ink-2, #888);">mm</span>
      </div>

      <div style="display:flex; gap:6px; margin-top:2px;">
        <button id="cle-hud-center-btn" class="cle-btn" style="padding:4px 8px; font-size:11px;" title="Center on Spoilboard Bed (X=300, Y=250)">🎯 Center</button>
        <button id="cle-hud-zero-btn" class="cle-btn" style="padding:4px 8px; font-size:11px;" title="Move to Work Zero (X=50, Y=50)">📐 Zero</button>
        <button id="cle-hud-slice-btn" class="cle-btn" style="padding:4px 10px; font-size:11px; background:var(--accent, #00f0ff); color:var(--on-accent, #000); font-weight:700; margin-left:auto;">⚡ Slice</button>
      </div>
    `;

    // Hook listeners
    const inX = hud.querySelector('#cle-hud-inp-x');
    const inY = hud.querySelector('#cle-hud-inp-y');

    const updateFromInputs = () => {
      const nx = parseFloat(inX.value) || 0;
      const ny = parseFloat(inY.value) || 0;
      this.moveBedObject(obj.type, obj.id, nx, ny);
    };

    inX.onchange = updateFromInputs;
    inY.onchange = updateFromInputs;

    hud.querySelector('#cle-hud-close').onclick = () => this.deselectBedObject();

    hud.querySelector('#cle-hud-center-btn').onclick = () => {
      const center = this.bridge?.vellum?.getBedCenter ? this.bridge.vellum.getBedCenter() : { x: 300, y: 250, z: 20.10 };
      inX.value = center.x.toFixed(1);
      inY.value = center.y.toFixed(1);
      this.moveBedObject(obj.type, obj.id, center.x, center.y);
    };

    hud.querySelector('#cle-hud-zero-btn').onclick = () => {
      inX.value = '50.0';
      inY.value = '50.0';
      this.moveBedObject(obj.type, obj.id, 50.0, 50.0);
    };

    hud.querySelector('#cle-hud-slice-btn').onclick = () => {
      if (obj.isImage) {
        this.bridge.openModal('grayscale');
      } else {
        this.bridge.openModal('slicer');
      }
    };
  }

  updateBedHUDValues(x, y) {
    const inX = document.getElementById('cle-hud-inp-x');
    const inY = document.getElementById('cle-hud-inp-y');
    if (inX) inX.value = x.toFixed(1);
    if (inY) inY.value = y.toFixed(1);
  }

  bindBedInteraction() {
    if (this._boundInteraction) return;
    const app = window.app || window.xe;
    const canvas = app?.vp?.canvas;
    if (!canvas) return;

    this._boundInteraction = true;
    let isMouseDown = false;
    let dragTarget = null;
    let dragPlaneZ = (this.config.spoilboardThickness || 20.0) + 0.10;
    let startX = 0, startY = 0;
    let objStartX = 0, objStartY = 0;
    let didMove = false;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // Left click only
      const THREE = window.THREE;
      if (!THREE || !app.vp || !app.vp.camera) return;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, app.vp.camera);

      // Collect interactive candidate meshes
      const targets = [];
      const meshMap = new Map();

      // Relief mesh
      if (this.bridge?.slicer?.reliefMesh) {
        targets.push(this.bridge.slicer.reliefMesh);
        meshMap.set(this.bridge.slicer.reliefMesh, { type: 'relief', id: 'cle_relief_mesh' });
      }

      // Sketches & sketch images
      if (app.scene?.sketchRoot) {
        app.scene.sketchRoot.updateMatrixWorld(true);
        app.scene.sketchRoot.traverse(child => {
          if (child.isMesh) {
            let cur = child;
            let skId = null;
            while (cur && !skId) {
                if (cur.userData && cur.userData.sketch) skId = cur.userData.sketch;
                cur = cur.parent;
            }
            if (skId) {
              targets.push(child);
              meshMap.set(child, { type: 'sketch', id: skId });
            }
          }
        });
      }

      // 3D Bodies
      if (app.scene?.bodyRoot) {
        app.scene.bodyRoot.updateMatrixWorld(true);
        app.scene.bodyRoot.traverse(child => {
          if (child.isMesh && child.userData?.base?.body?.id) {
            targets.push(child);
            meshMap.set(child, { type: 'body', id: child.userData.base.body.id });
          }
        });
      }

      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const match = meshMap.get(hit.object);
        if (match) {
          const objs = this.getBedObjects();
          const obj = objs.find(o => o.id === match.id);
          if (obj) {
            this.selectBedObject(obj.type, obj.id);
            isMouseDown = true;
            dragTarget = obj;
            startX = e.clientX;
            startY = e.clientY;
            objStartX = obj.x;
            objStartY = obj.y;
            didMove = false;
          }
        }
      }
    }, { capture: true });

    window.addEventListener('pointermove', (e) => {
      if (!isMouseDown || !dragTarget) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) > 4) didMove = true;

      // Project onto spoilboard table plane
      const THREE = window.THREE;
      if (!THREE || !app.vp || !app.vp.camera) return;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, app.vp.camera);

      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -dragPlaneZ);
      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        // Clamp to machine bed travel limits
        const minX = 10, maxX = this.config.travelX - 10;
        const minY = 10, maxY = this.config.travelY - 10;
        const targetX = Math.max(minX, Math.min(maxX, +intersection.x.toFixed(1)));
        const targetY = Math.max(minY, Math.min(maxY, +intersection.y.toFixed(1)));

        this.moveBedObject(dragTarget.type, dragTarget.id, targetX, targetY);
      }
    });

    window.addEventListener('pointerup', () => {
      if (isMouseDown && dragTarget && didMove) {
        this.bridge.notify(`Positioned ${dragTarget.name} at X=${dragTarget.x.toFixed(1)}, Y=${dragTarget.y.toFixed(1)}mm`, 'ok');
      }
      isMouseDown = false;
      dragTarget = null;
    });
  }


  // Full Rebuild when Machine Profile or Spoilboard Size is changed in Vault
  rebuild() {
    this.syncWithActiveMachine();
    this.mountToScene();
  }

  // Safely request JumpStart viewport frame render
  requestRender() {
    const app = window.app || window.xe;
    if (app && app.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
  }
}

