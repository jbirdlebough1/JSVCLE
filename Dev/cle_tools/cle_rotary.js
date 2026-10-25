/**
 * CLEJS - 4th Axis Rotary (A-Axis) Engine & Three.js Visualizer
 * Real-time continuous cylindrical coordinate transforms and Three.js scene augmentation
 */

export class CLERotaryEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.enabled = false;
    this.stockDiameter = 50.0; // mm
    this.stockLength = 150.0;   // mm
    this.axisAlignment = 'X';   // Rotary axis parallel to X (typical for TTC6050 4th axis)
    this.currentAngle = 0.0;    // degrees
    this.cylinderMesh = null;
    this.chuckMesh = null;
    this.rotaryGroup = null;
  }

  initVisualizer() {
    const app = window.app || window.xe;
    if (!app || !app.scene) {
      console.warn('[CLE Rotary] Three.js scene not ready yet.');
      return;
    }

    if (this.rotaryGroup) {
      app.scene.remove(this.rotaryGroup);
    }

    // Dynamic import Three if needed or use existing instance from app
    const THREE = window.THREE || (app.vp && app.vp.THREE) || null;
    if (!THREE) {
      console.warn('[CLE Rotary] THREE instance not found on window or app.');
      return;
    }

    this.rotaryGroup = new THREE.Group();
    this.rotaryGroup.name = 'CLE_Rotary_Subsystem';

    // 1. Cylindrical Stock Material & Mesh
    const radius = this.stockDiameter / 2;
    const geom = new THREE.CylinderGeometry(radius, radius, this.stockLength, 36, 1);
    geom.rotateZ(Math.PI / 2); // Align with X axis

    const mat = new THREE.MeshStandardMaterial({
      color: 0xd8af79, // Wood/wax amber tone
      roughness: 0.6,
      metalness: 0.1,
      transparent: true,
      opacity: 0.75,
      wireframe: false
    });
    this.cylinderMesh = new THREE.Mesh(geom, mat);
    this.rotaryGroup.add(this.cylinderMesh);

    // 2. Rotary 3-Jaw Chuck / Headstock Model Representation
    const chuckGeom = new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, 20, 24);
    chuckGeom.rotateZ(Math.PI / 2);
    chuckGeom.translate(-this.stockLength / 2 - 10, 0, 0);
    const chuckMat = new THREE.MeshStandardMaterial({
      color: 0x444f5a,
      metalness: 0.8,
      roughness: 0.3
    });
    this.chuckMesh = new THREE.Mesh(chuckGeom, chuckMat);
    this.rotaryGroup.add(this.chuckMesh);

    this.rotaryGroup.position.set(0, 0, 0);
    this.rotaryGroup.visible = this.enabled;
    app.scene.add(this.rotaryGroup);

    console.log('[CLE Rotary] 4th-axis visualizer initialized in Three.js scene.');
  }

  toggle(enabled) {
    this.enabled = enabled !== undefined ? enabled : !this.enabled;
    if (this.rotaryGroup) {
      this.rotaryGroup.visible = this.enabled;
    } else if (this.enabled) {
      this.initVisualizer();
    }
    const btn = document.getElementById('cle-rotary-toggle');
    if (btn) btn.classList.toggle('active', this.enabled);
    this.bridge.notify(`4th Axis (Rotary): ${this.enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  setStockDimensions(diameter, length) {
    this.stockDiameter = parseFloat(diameter) || 50.0;
    this.stockLength = parseFloat(length) || 150.0;
    this.initVisualizer();
    this.bridge.notify(`Rotary Stock: Ø${this.stockDiameter}mm × ${this.stockLength}mm`);
  }

  updateAngle(angleDegrees) {
    this.currentAngle = angleDegrees;
    if (this.cylinderMesh) {
      // Rotate around X axis
      const rad = (angleDegrees * Math.PI) / 180;
      this.cylinderMesh.rotation.x = rad;
    }
  }

  // --- Coordinate Transformation Logic ---
  // Converts flat Y mm into A rotational degrees based on diameter
  yToRotaryDegrees(yMm) {
    const circumference = Math.PI * this.stockDiameter;
    return (yMm / circumference) * 360.0;
  }

  rotaryDegreesToY(aDeg) {
    const circumference = Math.PI * this.stockDiameter;
    return (aDeg / 360.0) * circumference;
  }

  // Wraps standard planar G-Code into 4th Axis Rotary G-Code
  wrapPlanarGCodeToRotary(gcodeText) {
    const lines = gcodeText.split('\n');
    const out = [];
    out.push(`; --- CLEJS 4th Axis Wrapped (Stock Diameter: ${this.stockDiameter}mm) ---`);
    out.push('G90 G21 ; Absolute programming, mm');
    out.push('G92 A0 ; Set A0 at start');

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
}
