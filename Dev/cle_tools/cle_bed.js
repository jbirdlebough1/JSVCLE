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
      spoilboardThickness: 15.0,
      spoilboardOffsetX: 0.0,
      spoilboardOffsetY: 0.0,
      gridPitch: 10.0,
      majorGridPitch: 50.0
    };
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
    this.config.spoilboardThickness = mach.spoilboardThickness !== undefined ? parseFloat(mach.spoilboardThickness) : 15.0;
    this.config.spoilboardOffsetX = mach.spoilboardOffsetX !== undefined ? parseFloat(mach.spoilboardOffsetX) : 0.0;
    this.config.spoilboardOffsetY = mach.spoilboardOffsetY !== undefined ? parseFloat(mach.spoilboardOffsetY) : 0.0;
  }

  // Get Three.js root scene/world container
  getWorldContainer() {
    const app = window.app || window.xe;
    if (!app || !app.vp) return null;
    // Prefer app.vp.world (holds CAD bodies), fallback to app.vp.scene
    return app.vp.world || app.vp.scene || null;
  }

  // Mount bed and cursor to JumpStart Three.js viewport
  mountToScene() {
    const container = this.getWorldContainer();
    const THREE = window.THREE;
    if (!container || !THREE) {
      setTimeout(() => this.mountToScene(), 300);
      return;
    }

    if (this.bedGroup && this.bedGroup.parent) {
      this.bedGroup.parent.remove(this.bedGroup);
    }

    this.bedGroup = new THREE.Group();
    this.bedGroup.name = 'CLE_Device_Bed_Visualizer';
    this.bedGroup.visible = this.visible;

    this.buildSpoilboardSlab(THREE);
    this.buildGridAndExtrusionFrame(THREE);
    this.buildMillimeterRulers(THREE);
    this.buildToolheadCursor(THREE);

    container.add(this.bedGroup);
    this.requestRender();
    console.log('[CLE Bed] Mounted device bed, spoilboard and rulers to 3D viewport.');
  }

  // 1. Spoilboard Slab (Physical MDF / Tooling Plate)
  buildSpoilboardSlab(THREE) {
    const { spoilboardX, spoilboardY, spoilboardThickness, spoilboardOffsetX, spoilboardOffsetY } = this.config;

    // Solid MDF/Aluminum Base Slab
    const slabGeo = new THREE.BoxGeometry(spoilboardX, spoilboardY, spoilboardThickness);
    // Dark engineering slate/MDF tone
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0x1e242d,
      roughness: 0.85,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88,
      depthWrite: true
    });

    const slab = new THREE.Mesh(slabGeo, slabMat);
    // Center of slab: top surface sits flush at Z = 0.00
    slab.position.set(
      spoilboardOffsetX + spoilboardX / 2,
      spoilboardOffsetY + spoilboardY / 2,
      -spoilboardThickness / 2
    );
    slab.receiveShadow = true;
    slab.name = 'CLE_Spoilboard_Slab';
    this.bedGroup.add(slab);

    // Subtle edge highlight for spoilboard border
    const edgesGeo = new THREE.EdgesGeometry(slabGeo);
    const edgesMat = new THREE.LineBasicMaterial({ color: 0x415065, transparent: true, opacity: 0.6 });
    const slabEdges = new THREE.LineSegments(edgesGeo, edgesMat);
    slab.add(slabEdges);
  }

  // 2. Machine Travel Frame & Millimeter Grid Lines on Spoilboard Surface
  buildGridAndExtrusionFrame(THREE) {
    const { travelX, travelY, spoilboardX, spoilboardY, spoilboardOffsetX, spoilboardOffsetY, gridPitch, majorGridPitch } = this.config;

    const minorPts = [];
    const majorPts = [];
    const zSurface = 0.04; // Placed right above spoilboard surface to avoid z-fighting

    const x0 = spoilboardOffsetX;
    const x1 = spoilboardOffsetX + spoilboardX;
    const y0 = spoilboardOffsetY;
    const y1 = spoilboardOffsetY + spoilboardY;

    // Grid lines along X (running in Y direction)
    for (let x = x0; x <= x1 + 0.1; x += gridPitch) {
      const relX = Math.round(x - x0);
      const isMajor = (relX % majorGridPitch === 0);
      const target = isMajor ? majorPts : minorPts;
      target.push(x, y0, zSurface, x, y1, zSurface);
    }

    // Grid lines along Y (running in X direction)
    for (let y = y0; y <= y1 + 0.1; y += gridPitch) {
      const relY = Math.round(y - y0);
      const isMajor = (relY % majorGridPitch === 0);
      const target = isMajor ? majorPts : minorPts;
      target.push(x0, y, zSurface, x1, y, zSurface);
    }

    // Minor grid lines
    if (minorPts.length > 0) {
      const minGeo = new THREE.BufferGeometry();
      minGeo.setAttribute('position', new THREE.Float32BufferAttribute(minorPts, 3));
      const minMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.35 });
      const minLines = new THREE.LineSegments(minGeo, minMat);
      this.bedGroup.add(minLines);
    }

    // Major grid lines
    if (majorPts.length > 0) {
      const majGeo = new THREE.BufferGeometry();
      majGeo.setAttribute('position', new THREE.Float32BufferAttribute(majorPts, 3));
      const majMat = new THREE.LineBasicMaterial({ color: 0x475569, transparent: true, opacity: 0.75 });
      const majLines = new THREE.LineSegments(majGeo, majMat);
      this.bedGroup.add(majLines);
    }

    // Physical Machine Travel Limits Wireframe (Extrusion Perimeter)
    const travelPts = [
      0, 0, zSurface,
      travelX, 0, zSurface,
      travelX, 0, zSurface,
      travelX, travelY, zSurface,
      travelX, travelY, zSurface,
      0, travelY, zSurface,
      0, travelY, zSurface,
      0, 0, zSurface
    ];
    const travelGeo = new THREE.BufferGeometry();
    travelGeo.setAttribute('position', new THREE.Float32BufferAttribute(travelPts, 3));
    const travelMat = new THREE.LineBasicMaterial({ color: 0xe056fd, linewidth: 2, transparent: true, opacity: 0.85 });
    const travelFrame = new THREE.LineSegments(travelGeo, travelMat);
    travelFrame.name = 'CLE_Machine_Travel_Limit_Box';
    this.bedGroup.add(travelFrame);
  }

  // 3. Millimeter Rulers along X and Y axes with Tick Marks and Numerical Labels
  buildMillimeterRulers(THREE) {
    const { travelX, travelY, spoilboardOffsetX, spoilboardOffsetY } = this.config;
    const zSurface = 0.05;

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
    texture.minFilter = THREE.LinearFilter;
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
      // LASER HEAD: Anodized Heatsink Body + Laser Cone Beam
      const headMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.6, roughness: 0.3 });
      const headMesh = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 26), headMat);
      headMesh.position.set(0, 0, 15);
      this.cursorGroup.add(headMesh);

      // Laser focal cone beam (translucent violet/red)
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xec4899,
        transparent: true,
        opacity: 0.45,
        depthWrite: false
      });
      const beamCone = new THREE.Mesh(new THREE.ConeGeometry(5, 12, 16, 1, true), beamMat);
      beamCone.position.set(0, 0, 6);
      beamCone.rotation.x = Math.PI;
      this.cursorGroup.add(beamCone);
    } else {
      // SPINDLE HEAD: ER11/ER16 Collet Nut + Carbide Endmill Bit
      const colletMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 });
      const colletMesh = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 4.5, 12, 16), colletMat);
      colletMesh.position.set(0, 0, 10);
      colletMesh.rotation.x = Math.PI / 2;
      this.cursorGroup.add(colletMesh);

      // Bit shank & flutes pointing down to (0,0,0)
      const bitMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.1 });
      const bitMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 12, 12), bitMat);
      bitMesh.position.set(0, 0, 4);
      bitMesh.rotation.x = Math.PI / 2;
      this.cursorGroup.add(bitMesh);
    }

    // Floating 3D DRO Coordinate Badge
    this.coordTag = this.createNumberLabelSprite(THREE, 'X0.00 Y0.00 Z0.00', '#38bdf8');
    this.coordTag.position.set(0, 0, 32);
    this.coordTag.scale.set(28, 12, 1);
    this.cursorGroup.add(this.coordTag);

    // Initial position
    this.cursorGroup.position.set(this.lastPos.X, this.lastPos.Y, this.lastPos.Z);
    this.bedGroup.add(this.cursorGroup);

    // Projected Crosshair on Spoilboard Surface
    this.buildShadowCrosshair(THREE);
  }

  // Projected Shadow Crosshair & Guide Lines to Rulers on Spoilboard
  buildShadowCrosshair(THREE) {
    if (this.shadowCrosshair && this.shadowCrosshair.parent) {
      this.shadowCrosshair.parent.remove(this.shadowCrosshair);
    }

    this.shadowCrosshair = new THREE.Group();
    this.shadowCrosshair.name = 'CLE_Spoilboard_Crosshair_Shadow';

    // Concentric Target Ring on Spoilboard Surface
    const ringGeo = new THREE.RingGeometry(3.0, 4.0, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthTest: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.position.set(0, 0, 0.08);
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

  // Update Crosshair Position & Projection Lines
  updateCrosshairShadow(x, y) {
    if (!this.shadowCrosshair || !this.guideLines) return;

    this.shadowCrosshair.position.set(x, y, 0);

    const posAttr = this.guideLines.geometry.attributes.position;
    const baseY = this.config.spoilboardOffsetY;
    const baseX = this.config.spoilboardOffsetX;

    // Line 1: from (x, y) down to front X-axis ruler at (x, baseY)
    posAttr.setXYZ(0, 0, 0, 0.08);
    posAttr.setXYZ(1, 0, baseY - y, 0.08);

    // Line 2: from (x, y) left to Y-axis ruler at (baseX, y)
    posAttr.setXYZ(2, 0, 0, 0.08);
    posAttr.setXYZ(3, baseX - x, 0, 0.08);

    posAttr.needsUpdate = true;
    this.guideLines.computeLineDistances();
  }

  // Live Position Update from FluidNC DRO (wpos or mpos)
  updateToolCursor(coords) {
    if (!coords) return;
    this.lastPos.X = coords.X !== undefined ? coords.X : this.lastPos.X;
    this.lastPos.Y = coords.Y !== undefined ? coords.Y : this.lastPos.Y;
    this.lastPos.Z = coords.Z !== undefined ? coords.Z : this.lastPos.Z;
    if (coords.A !== undefined) this.lastPos.A = coords.A;

    if (this.cursorGroup) {
      this.cursorGroup.position.set(this.lastPos.X, this.lastPos.Y, this.lastPos.Z);
    }

    this.updateCrosshairShadow(this.lastPos.X, this.lastPos.Y);

    if (this.coordTag && this.coordTag.material && this.coordTag.material.map) {
      const text = `X:${this.lastPos.X.toFixed(1)} Y:${this.lastPos.Y.toFixed(1)} Z:${this.lastPos.Z.toFixed(1)}`;
      this.updateSpriteCanvasText(this.coordTag, text);
    }

    this.requestRender();
  }

  // Re-draw text on sprite canvas
  updateSpriteCanvasText(sprite, text) {
    const canvas = sprite.material.map.image;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#0284c7';
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    sprite.material.map.needsUpdate = true;
  }

  // Toggle Visibility of Bed & Rulers
  toggle() {
    this.visible = !this.visible;
    if (this.bedGroup) {
      this.bedGroup.visible = this.visible;
    }
    this.requestRender();
    this.bridge.notify(`Machine Bed & Rulers: ${this.visible ? 'VISIBLE' : 'HIDDEN'}`, 'info');
    return this.visible;
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
