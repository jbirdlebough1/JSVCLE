/* CLEJS Unified Bundle (Non-ES Module for direct file:// Chrome compatibility) */
(function(){
'use strict';

/* --- Module: cle_gamepad.js --- */
/**
 * CLEJS - Nintendo Switch Gamepad Subsystem
 * Native HTML5 Gamepad API integration for JumpStart 3D
 * Supports: Nintendo Switch Joy-Cons, Pro Controller, and Standard Gamepads
 */

class CLEGamepadEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.gamepadIndex = null;
    this.mode = 'design'; // 'design' (Viewport Orbit/Pan) | 'run' (CNC/Laser Jog & Setup)
    this.stepSize = 1.0;  // 0.01, 0.1, 1.0, 10.0 mm
    this.activeAxis = 'Z'; // 'X', 'Y', 'Z', 'A'
    this.recordingMacro = false;
    this.recordedMacro = [];
    this.deadzone = 0.15;
    this.lastButtonStates = {};
    this.pollInterval = null;

    // Configurable mapping profiles
    this.mapping = {
      design: {
        orbitSpeed: 0.04,
        panSpeed: 1.5,
        zoomSpeed: 2.0
      },
      run: {
        jogFeedXY: 2000,
        jogFeedZ: 500,
        jogFeedA: 1500,
        continuous: true
      }
    };

    this.initListeners();
  }

  initListeners() {
    window.addEventListener('gamepadconnected', (e) => {
      console.log(`[CLE Gamepad] Connected: ${e.gamepad.id} at index ${e.gamepad.index}`);
      this.gamepadIndex = e.gamepad.index;
      this.updateStatusBadge(true, e.gamepad.id);
      this.startPolling();
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log(`[CLE Gamepad] Disconnected index: ${e.gamepad.index}`);
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
        this.updateStatusBadge(false);
        this.stopPolling();
      }
    });
  }

  updateStatusBadge(connected, name = '') {
    const dot = document.getElementById('cle-gp-dot');
    const label = document.getElementById('cle-gp-label');
    if (dot && label) {
      if (connected) {
        dot.classList.add('connected');
        const isSwitch = /switch|joy-con|pro controller/i.test(name);
        label.textContent = isSwitch ? 'Switch Pad: Active' : 'Gamepad: Active';
        label.title = name;
      } else {
        dot.classList.remove('connected');
        label.textContent = 'Gamepad: Disconnected';
        label.title = 'Connect Nintendo Switch Pro / Joy-Con via Bluetooth or USB';
      }
    }
  }

  startPolling() {
    if (this.pollInterval) return;
    const poll = () => {
      this.processGamepadFrame();
      this.pollInterval = requestAnimationFrame(poll);
    };
    this.pollInterval = requestAnimationFrame(poll);
  }

  stopPolling() {
    if (this.pollInterval) {
      cancelAnimationFrame(this.pollInterval);
      this.pollInterval = null;
    }
  }

  getGamepad() {
    if (this.gamepadIndex === null) {
      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < gps.length; i++) {
        if (gps[i]) {
          this.gamepadIndex = i;
          this.updateStatusBadge(true, gps[i].id);
          return gps[i];
        }
      }
      return null;
    }
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    return gps[this.gamepadIndex] || null;
  }

  applyDeadzone(val) {
    if (Math.abs(val) < this.deadzone) return 0;
    const sign = Math.sign(val);
    return sign * ((Math.abs(val) - this.deadzone) / (1 - this.deadzone));
  }

  toggleMode() {
    this.mode = this.mode === 'design' ? 'run' : 'design';
    const modeBtn = document.getElementById('cle-gp-mode-toggle');
    if (modeBtn) {
      modeBtn.textContent = this.mode === 'design' ? 'Mode: Design 3D' : 'Mode: Run CNC/Laser';
      modeBtn.classList.toggle('active', this.mode === 'run');
    }
    this.bridge.notify(`Switch Controller switched to ${this.mode.toUpperCase()} mode.`);
  }

  processGamepadFrame() {
    const gp = this.getGamepad();
    if (!gp) return;

    // Standard Gamepad Mapping:
    // Axes: 0: LX, 1: LY, 2: RX, 3: RY
    // Buttons:
    // 0: A (or B on Switch layout), 1: B (or A), 2: X (or Y), 3: Y (or X)
    // 4: L, 5: R, 6: ZL (trigger), 7: ZR (trigger)
    // 8: Minus/Select, 9: Plus/Start
    // 10: L-Stick click, 11: R-Stick click
    // 12: D-Up, 13: D-Down, 14: D-Left, 15: D-Right
    // 16: Home, 17: Capture

    const lx = this.applyDeadzone(gp.axes[0] || 0);
    const ly = this.applyDeadzone(gp.axes[1] || 0);
    const rx = this.applyDeadzone(gp.axes[2] || 0);
    const ry = this.applyDeadzone(gp.axes[3] || 0);

    // Mode Toggle button (+ or Start button: button 9)
    if (this.isJustPressed(gp, 9)) {
      this.toggleMode();
    }

    if (this.mode === 'design') {
      this.processDesignMode(lx, ly, rx, ry, gp);
    } else {
      this.processRunMode(lx, ly, rx, ry, gp);
    }
  }

  isJustPressed(gp, btnIdx) {
    const btn = gp.buttons[btnIdx];
    const isDown = btn && (typeof btn === 'object' ? btn.pressed : btn > 0.5);
    const wasDown = !!this.lastButtonStates[btnIdx];
    this.lastButtonStates[btnIdx] = isDown;
    return isDown && !wasDown;
  }

  isHeld(gp, btnIdx) {
    const btn = gp.buttons[btnIdx];
    return btn && (typeof btn === 'object' ? btn.pressed : btn > 0.5);
  }

  processDesignMode(lx, ly, rx, ry, gp) {
    const app = window.app || window.xe;
    if (!app || !app.vp) return;

    // Left stick: Spherical Orbit around target
    if (Math.abs(lx) > 0.05 || Math.abs(ly) > 0.05) {
      if (app.vp.orbit) {
        app.vp.orbit(lx * this.mapping.design.orbitSpeed, -ly * this.mapping.design.orbitSpeed);
      } else if (app.vp.camera) {
        // Fallback camera orbit
        app.vp.camera.position.x += lx * 2;
        app.vp.camera.position.y -= ly * 2;
        app.vp.camera.lookAt(0, 0, 0);
      }
    }

    // Right stick: Pan viewport
    if (Math.abs(rx) > 0.05 || Math.abs(ry) > 0.05) {
      if (app.vp.pan) {
        app.vp.pan(-rx * this.mapping.design.panSpeed, ry * this.mapping.design.panSpeed);
      }
    }

    // Triggers ZL/ZR: Smooth Zoom
    const zl = (gp.buttons[6]?.value || (gp.buttons[6]?.pressed ? 1 : 0));
    const zr = (gp.buttons[7]?.value || (gp.buttons[7]?.pressed ? 1 : 0));
    const zoomDelta = (zr - zl) * this.mapping.design.zoomSpeed;
    if (Math.abs(zoomDelta) > 0.1 && app.vp.zoom) {
      app.vp.zoom(zoomDelta);
    }

    // D-Pad view presets
    if (this.isJustPressed(gp, 12)) app.vp.setView && app.vp.setView('top');
    if (this.isJustPressed(gp, 13)) app.vp.setView && app.vp.setView('front');
    if (this.isJustPressed(gp, 14)) app.vp.setView && app.vp.setView('left');
    if (this.isJustPressed(gp, 15)) app.vp.setView && app.vp.setView('iso');

    // Face buttons in design mode
    if (this.isJustPressed(gp, 0)) app.fit && app.fit(); // B: Fit to screen
    if (this.isJustPressed(gp, 1)) app.showShortcuts && app.showShortcuts(); // A
  }

  processRunMode(lx, ly, rx, ry, gp) {
    const fluid = this.bridge.fluidnc;
    if (!fluid) return;

    // D-Pad: Step size cycling
    if (this.isJustPressed(gp, 12)) this.cycleStepSize(1);
    if (this.isJustPressed(gp, 13)) this.cycleStepSize(-1);

    // Left stick: Analog Jog X & Y
    if (Math.abs(lx) > 0.05 || Math.abs(ly) > 0.05) {
      const dist = this.stepSize;
      const feed = this.mapping.run.jogFeedXY;
      const dx = (lx * dist).toFixed(3);
      const dy = (-ly * dist).toFixed(3);
      fluid.jogAxisRelative({ X: dx, Y: dy }, feed);
      this.recordMacroStep(`$J=G91 G21 X${dx} Y${dy} F${feed}`);
    }

    // Right stick: Z axis (vertical) & A axis (rotary horizontal)
    if (Math.abs(ry) > 0.05) {
      const dz = (-ry * this.stepSize).toFixed(3);
      fluid.jogAxisRelative({ Z: dz }, this.mapping.run.jogFeedZ);
      this.recordMacroStep(`$J=G91 G21 Z${dz} F${this.mapping.run.jogFeedZ}`);
    }
    if (Math.abs(rx) > 0.05) {
      const da = (rx * (this.stepSize * 10)).toFixed(2); // degrees
      fluid.jogAxisRelative({ A: da }, this.mapping.run.jogFeedA);
      this.recordMacroStep(`$J=G91 G21 A${da} F${this.mapping.run.jogFeedA}`);
    }

    // Face buttons (Switch Run Mode)
    // Button 0 (A): Zero WCS on active axis
    if (this.isJustPressed(gp, 0)) {
      fluid.zeroAxis(this.activeAxis);
      this.bridge.notify(`WCS Zeroed for axis ${this.activeAxis}`);
    }

    // Button 1 (B): Feed Hold / Pause
    if (this.isJustPressed(gp, 1)) {
      fluid.sendImmediate('!');
      this.bridge.notify('FEED HOLD executed (!)');
    }

    // Button 2 (X): Z-probe touch plate cycle
    if (this.isJustPressed(gp, 2)) {
      this.triggerProbeCycle();
    }

    // Button 3 (Y): Cycle active axis (X -> Y -> Z -> A)
    if (this.isJustPressed(gp, 3)) {
      const axes = ['X', 'Y', 'Z', 'A'];
      const nextIdx = (axes.indexOf(this.activeAxis) + 1) % axes.length;
      this.activeAxis = axes[nextIdx];
      this.bridge.notify(`Active pendant axis: ${this.activeAxis}`);
    }

    // Minus / Select button (8): Macro Recording Toggle
    if (this.isJustPressed(gp, 8)) {
      this.toggleMacroRecording();
    }
  }

  cycleStepSize(dir) {
    const steps = [0.01, 0.1, 1.0, 5.0, 10.0, 50.0];
    let idx = steps.indexOf(this.stepSize);
    idx = Math.max(0, Math.min(steps.length - 1, idx + dir));
    this.stepSize = steps[idx];
    const el = document.getElementById('cle-step-val');
    if (el) el.textContent = `${this.stepSize} mm`;
    this.bridge.notify(`Jog step increment: ${this.stepSize} mm`);
  }

  triggerProbeCycle() {
    const fluid = this.bridge.fluidnc;
    if (!fluid || !fluid.isConnected) {
      this.bridge.notify('FluidNC not connected for probe cycle', 'error');
      return;
    }
    // Safe standard touch-plate routine: G38.2 Z-25 F100, then G92 Z15.0 (plate thickness), retract G0 Z20
    const plateThick = 15.0; // mm
    const gcode = [
      'G21 G91',
      'G38.2 Z-30 F75',
      `G92 Z${plateThick}`,
      'G0 Z5'
    ];
    fluid.streamGCodeLines(gcode);
    this.bridge.notify(`Executing Touch Plate Probe (thickness ${plateThick}mm)`);
  }

  toggleMacroRecording() {
    this.recordingMacro = !this.recordingMacro;
    if (this.recordingMacro) {
      this.recordedMacro = [];
      this.bridge.notify('Macro Recording: STARTED (moving axes will record steps)', 'ok');
    } else {
      this.bridge.notify(`Macro Recording: STOPPED (${this.recordedMacro.length} commands saved)`, 'ok');
      if (this.recordedMacro.length > 0) {
        this.bridge.vault.saveMacro(`Recorded_Macro_${Date.now()}`, this.recordedMacro.join('\n'));
      }
    }
  }

  recordMacroStep(cmd) {
    if (this.recordingMacro) {
      this.recordedMacro.push(cmd);
    }
  }
}


/* --- Module: cle_fluidnc.js --- */
/**
 * CLEJS - FluidNC & FluidTouch 7" Controller Bridge
 * Real-time streaming, Web Serial, WebSocket, Status Polling & FluidTouch Head Integration
 */

class CLEFluidNCClient {
  constructor(bridge) {
    this.bridge = bridge;
    this.isConnected = false;
    this.connectionType = 'none'; // 'serial' | 'websocket'
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.socket = null;
    this.ip = localStorage.getItem('cle.fluidnc.ip') || '192.168.1.100';
    this.baud = 115200;
    
    // Status State
    this.state = 'Disconnected';
    this.mpos = { X: 0.0, Y: 0.0, Z: 0.0, A: 0.0 };
    this.wpos = { X: 0.0, Y: 0.0, Z: 0.0, A: 0.0 };
    this.feedRate = 0;
    this.spindleRPM = 0;
    this.buffer = '';
    this.pollTimer = null;
    this.sendQueue = [];
    this.isStreaming = false;
  }

  // --- Web Serial Connection ---
  async connectSerial() {
    if (!('serial' in navigator)) {
      this.bridge.notify('Web Serial API not supported in this browser. Use Chrome/Edge or WebSocket.', 'error');
      return false;
    }
    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: this.baud });
      this.writer = this.port.writable.getWriter();
      this.isConnected = true;
      this.connectionType = 'serial';
      this.bridge.notify('Connected to FluidNC via USB Serial', 'ok');
      this.updateConnectionUI(true);
      this.startSerialReadLoop();
      this.startStatusPolling();
      return true;
    } catch (err) {
      console.error('[CLE FluidNC] Serial connection error:', err);
      this.bridge.notify(`Serial connection failed: ${err.message}`, 'error');
      return false;
    }
  }

  async startSerialReadLoop() {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.handleIncomingData(value);
      }
    } catch (err) {
      console.warn('[CLE FluidNC] Read loop closed:', err);
    } finally {
      this.disconnect();
    }
  }

  // --- WebSocket Connection (FluidNC / FluidTouch 7" Head) ---
  connectWebSocket(ip = this.ip) {
    this.ip = ip;
    localStorage.setItem('cle.fluidnc.ip', ip);
    const wsUrl = `ws://${this.ip}:81`; // FluidNC standard websocket port
    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.onopen = () => {
        this.isConnected = true;
        this.connectionType = 'websocket';
        this.bridge.notify(`Connected to FluidTouch/FluidNC at ${this.ip}`, 'ok');
        this.updateConnectionUI(true);
        this.startStatusPolling();
      };
      this.socket.onmessage = (event) => {
        this.handleIncomingData(event.data);
      };
      this.socket.onerror = (err) => {
        console.error('[CLE FluidNC] WebSocket error:', err);
        this.bridge.notify(`WebSocket error connecting to ${this.ip}`, 'error');
      };
      this.socket.onclose = () => {
        this.disconnect();
      };
    } catch (err) {
      this.bridge.notify(`WebSocket failed: ${err.message}`, 'error');
    }
  }

  disconnect() {
    this.isConnected = false;
    this.connectionType = 'none';
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.writer) { try { this.writer.releaseLock(); } catch {} this.writer = null; }
    if (this.port) { try { this.port.close(); } catch {} this.port = null; }
    if (this.socket) { try { this.socket.close(); } catch {} this.socket = null; }
    this.updateConnectionUI(false);
    this.bridge.notify('Disconnected from FluidNC');
  }

  updateConnectionUI(connected) {
    const badge = document.getElementById('cle-fluid-badge');
    if (badge) {
      badge.textContent = connected ? `FluidNC (${this.connectionType.toUpperCase()})` : 'FluidNC: Offline';
      badge.className = `cle-badge ${connected ? 'connected' : 'alert'}`;
    }
  }

  startStatusPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendImmediate('?');
      }
    }, 200);
  }

  handleIncomingData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop(); // Keep partial line

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
        this.parseStatusReport(trimmed);
      } else if (trimmed === 'ok') {
        this.onCommandAck();
      } else if (trimmed.startsWith('error:')) {
        this.bridge.notify(`FluidNC ${trimmed}`, 'error');
      }
    }
  }

  // Parses: <Idle|MPos:0.000,0.000,0.000,0.000|WPos:0.000,0.000,0.000,0.000|FS:500,12000>
  parseStatusReport(report) {
    const body = report.slice(1, -1);
    const parts = body.split('|');
    this.state = parts[0];

    for (let i = 1; i < parts.length; i++) {
      const field = parts[i];
      if (field.startsWith('WPos:')) {
        const coords = field.slice(5).split(',').map(Number);
        this.wpos.X = coords[0] || 0;
        this.wpos.Y = coords[1] || 0;
        this.wpos.Z = coords[2] || 0;
        if (coords.length > 3) this.wpos.A = coords[3] || 0;
      } else if (field.startsWith('MPos:')) {
        const coords = field.slice(5).split(',').map(Number);
        this.mpos.X = coords[0] || 0;
        this.mpos.Y = coords[1] || 0;
        this.mpos.Z = coords[2] || 0;
        if (coords.length > 3) this.mpos.A = coords[3] || 0;
      } else if (field.startsWith('FS:')) {
        const [feed, rpm] = field.slice(3).split(',').map(Number);
        this.feedRate = feed || 0;
        this.spindleRPM = rpm || 0;
      }
    }
    this.updateDRO();
  }

  updateDRO() {
    const xVal = document.getElementById('cle-dro-x');
    const yVal = document.getElementById('cle-dro-y');
    const zVal = document.getElementById('cle-dro-z');
    const aVal = document.getElementById('cle-dro-a');
    if (xVal) xVal.textContent = this.wpos.X.toFixed(2);
    if (yVal) yVal.textContent = this.wpos.Y.toFixed(2);
    if (zVal) zVal.textContent = this.wpos.Z.toFixed(2);
    if (aVal) aVal.textContent = this.wpos.A.toFixed(1);

    // Keep active session recovery tracker updated
    if (this.bridge.recovery) {
      this.bridge.recovery.recordPosition(this.wpos, this.feedRate, this.spindleRPM);
    }
  }

  sendImmediate(char) {
    if (!this.isConnected) return;
    if (this.connectionType === 'serial' && this.writer) {
      this.writer.write(new TextEncoder().encode(char));
    } else if (this.connectionType === 'websocket' && this.socket) {
      this.socket.send(char);
    }
  }

  sendGCode(gcode) {
    if (!this.isConnected) {
      this.bridge.notify('FluidNC is not connected', 'error');
      return;
    }
    const clean = gcode.trim() + '\n';
    if (this.connectionType === 'serial' && this.writer) {
      this.writer.write(new TextEncoder().encode(clean));
    } else if (this.connectionType === 'websocket' && this.socket) {
      this.socket.send(clean);
    }
  }

  jogAxisRelative(axisDeltas, feedRate = 1000) {
    let jogCmd = `$J=G91 G21`;
    for (const [axis, dist] of Object.entries(axisDeltas)) {
      if (dist !== 0 && dist !== '0.00' && dist !== '0.000') {
        jogCmd += ` ${axis}${dist}`;
      }
    }
    jogCmd += ` F${feedRate}`;
    this.sendGCode(jogCmd);
  }

  zeroAxis(axis) {
    if (axis === 'ALL') {
      this.sendGCode('G10 L20 P1 X0 Y0 Z0 A0');
    } else {
      this.sendGCode(`G10 L20 P1 ${axis}0`);
    }
  }

  openFluidTouchWebGUI() {
    const url = `http://${this.ip}`;
    window.open(url, '_blank');
  }

  streamGCodeLines(lines) {
    this.sendQueue = [...lines];
    this.isStreaming = true;
    this.sendNextQueued();
  }

  sendNextQueued() {
    if (this.sendQueue.length === 0) {
      this.isStreaming = false;
      this.bridge.notify('G-Code streaming complete', 'ok');
      return;
    }
    const next = this.sendQueue.shift();
    if (next && next.trim()) {
      this.sendGCode(next);
    } else {
      this.sendNextQueued();
    }
  }

  onCommandAck() {
    if (this.isStreaming) {
      this.sendNextQueued();
    }
  }
}


/* --- Module: cle_rotary.js --- */
/**
 * CLEJS - 4th Axis Rotary (A-Axis) Engine & Three.js Visualizer
 * Real-time continuous cylindrical coordinate transforms and Three.js scene augmentation
 */

class CLERotaryEngine {
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


/* --- Module: cle_calibration.js --- */
/**
 * CLEJS - Calibration Subsystem
 * Steps/mm, Laser Kerf / Power Matrix, Backlash Measurement & Spindle PWM
 */

class CLECalibrationEngine {
  constructor(bridge) {
    this.bridge = bridge;
  }

  // Calculate new steps/mm
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

  // Generates Laser Power & Speed Matrix G-Code Test Card
  generateLaserTestMatrix(options = {}) {
    const minSpeed = options.minSpeed || 500;
    const maxSpeed = options.maxSpeed || 2500;
    const speedSteps = options.speedSteps || 5;
    const minPower = options.minPower || 10; // percent
    const maxPower = options.maxPower || 100;
    const powerSteps = options.powerSteps || 5;
    const squareSize = options.squareSize || 8; // mm
    const spacing = options.spacing || 3;       // mm

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
        const sVal = Math.round((pPct / 100) * 1000); // 0-1000 standard S-curve
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

  // Generates Backlash Test Routine
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


/* --- Module: cle_vault.js --- */
/**
 * CLEJS - Vault Subsystem
 * Tools, Materials, Feeds & Speeds, Machine Profiles, and G-Code Macros
 */

class CLEVault {
  constructor(bridge) {
    this.bridge = bridge;
    this.storageKey = 'cle.vault.data';
    this.data = this.loadVault();
  }

  getDefaults() {
    return {
      tools: [
        { id: 't1', name: '1/8" (3.175mm) Flat 2-Flute Endmill', type: 'flat', diameter: 3.175, fluteLength: 12, flutes: 2 },
        { id: 't2', name: '1/4" (6.35mm) Flat 2-Flute Rougher', type: 'flat', diameter: 6.35, fluteLength: 22, flutes: 2 },
        { id: 't3', name: '1/8" (3.175mm) Ball Nose Carving Bit', type: 'ball', diameter: 3.175, fluteLength: 15, radius: 1.5875 },
        { id: 't4', name: '60° V-Carve Engraving Bit', type: 'vbit', diameter: 6.35, angle: 60, tipWidth: 0.1 },
        { id: 't5', name: '90° V-Carve Engraving Bit', type: 'vbit', diameter: 12.7, angle: 90, tipWidth: 0.2 },
        { id: 't6', name: '20W Diode Laser Module', type: 'laser', spotDiameter: 0.08, maxPowerWatts: 20 }
      ],
      materials: [
        { id: 'm1', name: 'Baltic Birch Plywood', feedRateXY: 1800, plungeRate: 400, passDepth: 1.5, rpm: 18000 },
        { id: 'm2', name: 'Cast Acrylic', feedRateXY: 1200, plungeRate: 300, passDepth: 0.8, rpm: 14000 },
        { id: 'm3', name: 'Hard Maple / Oak', feedRateXY: 1400, plungeRate: 350, passDepth: 1.0, rpm: 18000 },
        { id: 'm4', name: 'MDF', feedRateXY: 2200, plungeRate: 600, passDepth: 2.0, rpm: 18000 },
        { id: 'm5', name: 'Aluminum 6061', feedRateXY: 600, plungeRate: 150, passDepth: 0.25, rpm: 22000 }
      ],
      machines: [
        {
          id: 'ttc6050',
          name: 'TwoTrees TTC6050 CNC (FluidNC)',
          travelX: 600,
          travelY: 500,
          travelZ: 100,
          travelA: 360,
          maxRateXY: 5000,
          maxRateZ: 1000,
          maxRateA: 3000,
          spindleMaxRPM: 24000
        }
      ],
      macros: [
        {
          id: 'macro-probe',
          name: 'Probe Z (Touch Plate)',
          gcode: 'G21 G91\nG38.2 Z-30 F75\nG92 Z15.0\nG0 Z5'
        },
        {
          id: 'macro-park',
          name: 'Park Machine Rear',
          gcode: 'G21 G90\nG0 Z20 F800\nG0 X10 Y480 F4000'
        },
        {
          id: 'macro-laser-tick',
          name: 'Laser Alignment Pulse (1 sec, 5%)',
          gcode: 'M3 S50\nG4 P1\nM5'
        }
      ]
    };
  }

  loadVault() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('[CLE Vault] Error loading vault from localStorage:', e);
    }
    return this.getDefaults();
  }

  saveVault() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data, null, 2));
      // Trigger sync to CLE_server.py disk if available
      this.syncToServer();
    } catch (e) {
      console.error('[CLE Vault] Error saving vault:', e);
    }
  }

  saveMacro(name, gcode) {
    this.data.macros.push({
      id: `macro-${Date.now()}`,
      name,
      gcode
    });
    this.saveVault();
    this.bridge.notify(`Saved macro: ${name}`, 'ok');
  }

  async syncToServer() {
    try {
      await fetch('http://127.0.0.1:8765/api/vault/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.data)
      });
    } catch {}
  }
}


/* --- Module: cle_test.js --- */
/**
 * CLEJS - Diagnostic & Verification Test Suite
 * Circle-Diamond-Square, Rapid Repeatability, Laser Test Firing, and Rotary Checks
 */

class CLETestEngine {
  constructor(bridge) {
    this.bridge = bridge;
  }

  // Generates Circle-Diamond-Square (CDS) G-Code Pattern
  generateCircleDiamondSquareGCode(size = 50, feed = 1200) {
    const half = size / 2;
    const radius = size * 0.4;
    return [
      '; --- CLEJS Circle-Diamond-Square (CDS) Diagnostic Test ---',
      'G21 G90',
      'G0 Z5 F800 ; Safe Z',
      'G0 X0 Y0 F3000',
      'G1 Z0 F400 ; Touch surface',
      '; 1. Square Boundary',
      `G1 X${size} Y0 F${feed}`,
      `G1 X${size} Y${size}`,
      `G1 X0 Y${size}`,
      'G1 X0 Y0',
      'G0 Z5',
      '; 2. Inscribed Diamond',
      `G0 X${half} Y0`,
      'G1 Z0 F400',
      `G1 X${size} Y${half} F${feed}`,
      `G1 X${half} Y${size}`,
      `G1 X0 Y${half}`,
      `G1 X${half} Y0`,
      'G0 Z5',
      '; 3. Concentric Circle',
      `G0 X${half} Y${half - radius}`,
      'G1 Z0 F400',
      `G2 X${half} Y${half - radius} I0 J${radius} F${feed}`,
      'G0 Z10 ; Retract finish',
      'G0 X0 Y0 F3000'
    ].join('\n');
  }

  // Generates 4-Corner Rapid Repeatability Test
  generateRepeatabilityTest(travelX = 300, travelY = 300, cycles = 3, feed = 4000) {
    const lines = [
      `; --- CLEJS Rapid Positioning Repeatability Test (${cycles} cycles) ---`,
      'G21 G90',
      'G0 Z10 F1000',
      'G0 X0 Y0 F4000'
    ];
    for (let i = 1; i <= cycles; i++) {
      lines.push(`; Cycle ${i} of ${cycles}`);
      lines.push(`G0 X${travelX} Y0 F${feed}`);
      lines.push(`G0 X${travelX} Y${travelY}`);
      lines.push(`G0 X0 Y${travelY}`);
      lines.push('G0 X0 Y0');
    }
    lines.push('G0 Z15');
    lines.push('; Check if return point aligns precisely with origin.');
    return lines.join('\n');
  }
}


/* --- Module: cle_recovery.js --- */
/**
 * CLEJS - Job Recovery & Crash Resume Subsystem
 * Tracks live G-Code streaming position and generates safe-plunge resume sequences
 */

class CLEJobRecoveryEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.activeJob = null;
    this.currentLineIndex = 0;
    this.totalLines = 0;
    this.lastPosition = { X: 0, Y: 0, Z: 0, A: 0 };
    this.feedRate = 1000;
    this.spindleRPM = 12000;
    this.safeZClearance = 25.0; // mm above workpiece
    this.storageKey = 'cle.recovery.checkpoint';
  }

  startJob(filename, gcodeLines) {
    this.activeJob = {
      filename,
      lines: gcodeLines,
      startTime: Date.now()
    };
    this.totalLines = gcodeLines.length;
    this.currentLineIndex = 0;
    this.saveCheckpoint();
  }

  recordPosition(wpos, feed, rpm) {
    this.lastPosition = { ...wpos };
    if (feed) this.feedRate = feed;
    if (rpm) this.spindleRPM = rpm;
    this.saveCheckpoint();
  }

  advanceLine(idx) {
    this.currentLineIndex = idx;
    if (idx % 25 === 0) {
      this.saveCheckpoint();
    }
  }

  saveCheckpoint() {
    if (!this.activeJob) return;
    const checkpoint = {
      filename: this.activeJob.filename,
      currentLineIndex: this.currentLineIndex,
      totalLines: this.totalLines,
      lastPosition: this.lastPosition,
      feedRate: this.feedRate,
      spindleRPM: this.spindleRPM,
      timestamp: Date.now()
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(checkpoint));
    } catch {}
  }

  getSavedCheckpoint() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  // Generates Safe Recovery G-Code from a specified line index
  generateResumeSequence(fullGCodeLines, resumeLineIndex, safeZ = this.safeZClearance) {
    const targetIdx = Math.max(0, Math.min(fullGCodeLines.length - 1, resumeLineIndex));
    
    // Find the target coordinate of the resume line
    let targetX = this.lastPosition.X;
    let targetY = this.lastPosition.Y;
    let targetZ = this.lastPosition.Z;
    let targetA = this.lastPosition.A;

    // Scan backwards from targetIdx to reconstruct coordinate state
    for (let i = targetIdx; i >= 0; i--) {
      const line = fullGCodeLines[i];
      const matchX = line.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = line.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = line.match(/[Zz](-?\d+\.?\d*)/);
      const matchA = line.match(/[Aa](-?\d+\.?\d*)/);
      if (matchX && targetX === this.lastPosition.X) targetX = parseFloat(matchX[1]);
      if (matchY && targetY === this.lastPosition.Y) targetY = parseFloat(matchY[1]);
      if (matchZ && targetZ === this.lastPosition.Z) targetZ = parseFloat(matchZ[1]);
      if (matchA && targetA === this.lastPosition.A) targetA = parseFloat(matchA[1]);
    }

    const preamble = [
      `; --- CLEJS Crash Recovery Preamble ---`,
      `; Resuming job from line ${targetIdx} of ${fullGCodeLines.length}`,
      'G21 G90 ; Metric, Absolute positioning',
      `G0 Z${safeZ} F1000 ; Move to safe clearance height`,
      `M3 S${this.spindleRPM} ; Spin up spindle / activate tool`,
      'G4 P2 ; Dwell 2 seconds for full RPM',
      `G0 X${targetX} Y${targetY} A${targetA} F3000 ; Rapid to resume XY location`,
      `G1 Z${targetZ} F300 ; Controlled plunge to resume depth`,
      `G1 F${this.feedRate} ; Restore working feed rate`,
      `; --- Resumed Stream Starts Here ---`
    ];

    const remaining = fullGCodeLines.slice(targetIdx);
    return [...preamble, ...remaining];
  }
}


/* --- Module: cle_slicer.js --- */
/**
 * CLEJS - Slicer Integration Subsystem
 * Native Three.js geometry extraction, continuous canvas slicing, and PrusaSlicer CLI bridge
 */

class CLESlicerEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.serverUrl = 'http://127.0.0.1:8765';
    this.layerHeight = 0.2;
    this.infillPercent = 20;
    this.nozzleDiameter = 0.4;
  }

  // Extracts active CAD geometry as an ASCII/Binary STL from JumpStart's Three.js scene
  getActiveBodySTL() {
    const app = window.app || window.xe;
    if (!app) throw new Error('JumpStart app instance not ready.');

    // Look for bodies in the document
    const bodies = app.doc?.bodies || [];
    if (bodies.length === 0) {
      throw new Error('No 3D bodies found in JumpStart scene to slice.');
    }

    // Use Chisel bridge or scene view mesh if available
    let allTriangles = null;
    if (window.__JS3D_CHISEL__ && bodies[0]) {
      allTriangles = window.__JS3D_CHISEL__.bodyTris(bodies[0].id);
    }

    if (!allTriangles || allTriangles.length === 0) {
      throw new Error('Could not extract mesh triangles for the active body.');
    }

    return this.trianglesToSTL(allTriangles);
  }

  trianglesToSTL(triangles) {
    // Generates ASCII STL string from Float32Array of vertices [x0, y0, z0, x1, y1, z1, x2, y2, z2, ...]
    let stl = 'solid CLEJS_Model\n';
    const numTriangles = triangles.length / 9;

    for (let i = 0; i < numTriangles; i++) {
      const idx = i * 9;
      const ax = triangles[idx], ay = triangles[idx + 1], az = triangles[idx + 2];
      const bx = triangles[idx + 3], by = triangles[idx + 4], bz = triangles[idx + 5];
      const cx = triangles[idx + 6], cy = triangles[idx + 7], cz = triangles[idx + 8];

      // Calculate face normal
      const u1 = bx - ax, u2 = by - ay, u3 = bz - az;
      const v1 = cx - ax, v2 = cy - ay, v3 = cz - az;
      const nx = u2 * v3 - u3 * v2;
      const ny = u3 * v1 - u1 * v3;
      const nz = u1 * v2 - u2 * v1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      stl += `  facet normal ${nx / len} ${ny / len} ${nz / len}\n`;
      stl += '    outer loop\n';
      stl += `      vertex ${ax} ${ay} ${az}\n`;
      stl += `      vertex ${bx} ${by} ${bz}\n`;
      stl += `      vertex ${cx} ${cy} ${cz}\n`;
      stl += '    endloop\n';
      stl += '  endfacet\n';
    }
    stl += 'endsolid CLEJS_Model\n';
    return stl;
  }

  // Sends STL to local CLE_server.py to execute PrusaSlicer CLI on CL3
  async sliceWithPrusaCLI(stlString, profileOptions = {}) {
    this.bridge.notify('Invoking PrusaSlicer CLI locally on CL3...', 'ok');
    try {
      const resp = await fetch(`${this.serverUrl}/api/slice/prusa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stl: stlString,
          options: {
            layerHeight: this.layerHeight,
            infill: this.infillPercent,
            ...profileOptions
          }
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `Server responded with ${resp.status}`);
      }

      const data = await resp.json();
      this.bridge.notify(`PrusaSlicer CLI complete! (${data.lineCount} lines generated)`, 'ok');
      return data.gcode;
    } catch (err) {
      console.error('[CLE Slicer] Prusa CLI failed:', err);
      this.bridge.notify(`PrusaSlicer CLI error: ${err.message}`, 'error');
      throw err;
    }
  }
}


/* --- Module: cle_boot.js --- */
/**
 * CLEJS - Master Extension Bootstrapper
 * Mounts into JumpStart 3D native DOM without modifying core application code
 */


class CLEBridge {
  constructor() {
    this.version = '1.0.0';
    this.vault = new CLEVault(this);
    this.fluidnc = new CLEFluidNCClient(this);
    this.gamepad = new CLEGamepadEngine(this);
    this.rotary = new CLERotaryEngine(this);
    this.calibration = new CLECalibrationEngine(this);
    this.test = new CLETestEngine(this);
    this.recovery = new CLEJobRecoveryEngine(this);
    this.slicer = new CLESlicerEngine(this);

    this.activeModal = null;
  }

  notify(message, type = 'info') {
    console.log(`[CLE ${type.toUpperCase()}] ${message}`);
    let toast = document.getElementById('cle-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cle-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: var(--block);
        color: var(--block-ink);
        padding: 10px 18px;
        border-radius: var(--r);
        border: 1px solid var(--accent);
        box-shadow: 0 4px 16px var(--shadow);
        font: 600 12px/1.3 var(--f-ui);
        z-index: 9999;
        transition: opacity 0.3s ease;
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    if (type === 'error') toast.style.borderColor = 'var(--danger)';
    else if (type === 'ok') toast.style.borderColor = 'var(--ok)';
    else toast.style.borderColor = 'var(--accent)';

    toast.style.opacity = '1';
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => {
      if (toast) toast.style.opacity = '0';
    }, 3200);
  }

  init() {
    console.log('[CLEJS] Initializing extension harness...');
    this.mountTopbarControls();
    this.mountRibbon();
    setTimeout(() => {
      this.rotary.initVisualizer();
    }, 1500);
  }

  mountTopbarControls() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) {
      setTimeout(() => this.mountTopbarControls(), 400);
      return;
    }
    if (document.getElementById('cle-main-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'cle-top-btn';
    btn.id = 'cle-main-btn';
    btn.innerHTML = `
      <span class="cle-badge" id="cle-fluid-badge">FluidNC: Offline</span>
      <span>CLE Suite</span>
    `;
    btn.onclick = () => this.toggleRibbon();
    topbar.appendChild(btn);
  }

  mountRibbon() {
    if (document.getElementById('cle-ribbon')) return;
    const appEl = document.getElementById('app') || document.body;
    const ribbon = document.createElement('div');
    ribbon.id = 'cle-ribbon';
    ribbon.innerHTML = `
      <!-- FluidNC / FluidTouch 7" Connection Group -->
      <div class="cle-group">
        <span class="cle-group-label">Machine</span>
        <button class="cle-btn" id="cle-conn-serial">USB Serial</button>
        <button class="cle-btn" id="cle-conn-ws">WiFi/WS</button>
        <button class="cle-btn" id="cle-btn-fluidtouch" title="Open FluidTouch 7' Head / Web GUI">FluidTouch 7"</button>
      </div>

      <!-- Real-Time DRO -->
      <div class="cle-group">
        <span class="cle-group-label">DRO (WCS)</span>
        <div class="cle-dro-bar">
          <span class="cle-dro-axis"><span class="cle-dro-name">X</span><span class="cle-dro-val" id="cle-dro-x">0.00</span></span>
          <span class="cle-dro-axis"><span class="cle-dro-name">Y</span><span class="cle-dro-val" id="cle-dro-y">0.00</span></span>
          <span class="cle-dro-axis"><span class="cle-dro-name">Z</span><span class="cle-dro-val" id="cle-dro-z">0.00</span></span>
          <span class="cle-dro-axis"><span class="cle-dro-name">A</span><span class="cle-dro-val" id="cle-dro-a">0.0</span></span>
        </div>
        <button class="cle-btn" id="cle-zero-all" title="Zero all axes (G10 L20 P1)">Zero All</button>
      </div>

      <!-- Nintendo Switch Controller Group -->
      <div class="cle-group">
        <span class="cle-group-label">Controller</span>
        <div class="cle-gamepad-pill" title="Nintendo Switch Controller">
          <div class="cle-gamepad-dot" id="cle-gp-dot"></div>
          <span id="cle-gp-label">Gamepad: Disconnected</span>
        </div>
        <button class="cle-btn" id="cle-gp-mode-toggle">Mode: Design 3D</button>
        <span class="cle-dro-val" id="cle-step-val" title="Jog step increment">1 mm</span>
        <button class="cle-btn" id="cle-gp-remap-btn">Remap</button>
      </div>

      <!-- Rotary 4th Axis & Tools Group -->
      <div class="cle-group">
        <span class="cle-group-label">CLE Tools</span>
        <button class="cle-btn" id="cle-rotary-toggle">4th Axis (A)</button>
        <button class="cle-btn" id="cle-btn-slicer">Prusa Slicer</button>
        <button class="cle-btn" id="cle-btn-vault">Vault</button>
        <button class="cle-btn" id="cle-btn-cal">Calibration</button>
        <button class="cle-btn" id="cle-btn-test">Test</button>
        <button class="cle-btn" id="cle-btn-recovery">Job Recovery</button>
      </div>

      <!-- Emergency Pause -->
      <button class="cle-btn danger" id="cle-btn-estop">FEED HOLD (!)</button>
    `;

    const topbar = document.querySelector('.topbar');
    if (topbar && topbar.nextSibling) {
      topbar.parentNode.insertBefore(ribbon, topbar.nextSibling);
    } else {
      appEl.prepend(ribbon);
    }

    this.wireRibbonEvents();
  }

  // Native JumpStart Advanced Ribbon Renderer (When "CLE" tab in wstabs is clicked)
  renderAdvancedRibbon(m, s, n) {
    // 1. Machine Section
    m("Machine", "", [
      { id: "cle-r-serial", label: "USB Serial", title: "Connect to FluidNC via USB Serial", icon: "drive", fn: () => this.fluidnc.connectSerial() },
      { id: "cle-r-ws", label: "WiFi / WS", title: "Connect to FluidNC via WiFi / WebSocket", icon: "motion", fn: () => {
          const ip = prompt("Enter FluidTouch / FluidNC IP:", this.fluidnc.ip);
          if (ip) this.fluidnc.connectWebSocket(ip);
      }},
      { id: "cle-r-fluidtouch", label: "FluidTouch 7\"", title: "Open FluidTouch 7' Web GUI", icon: "render", fn: () => this.fluidnc.openFluidTouchWebGUI() },
      { id: "cle-r-zero", label: "Zero All", title: "Zero All Axes (G10 L20 P1)", icon: "origin", fn: () => this.fluidnc.zeroAxis("ALL") }
    ]);

    // 2. Controller Section
    m("Switch Pad", "", [
      { id: "cle-r-gp-mode", label: this.gamepad.mode === "design" ? "Design 3D" : "Run Pendant", title: "Toggle Switch Controller Mode", icon: "motion", pressed: this.gamepad.mode === "run", fn: () => this.gamepad.toggleMode() },
      { id: "cle-r-gp-remap", label: "Remap Pad", title: "Configure Switch Controller Buttons", icon: "settings", fn: () => this.openModal("gamepad") }
    ]);

    // 3. 4th Axis & Slicer
    m("Rotary & Slicer", "", [
      { id: "cle-r-rotary", label: "4th Axis (A)", title: "Toggle 4th Axis Rotary Stock in 3D View", icon: "lathe", pressed: this.rotary.enabled, fn: () => this.rotary.toggle() },
      { id: "cle-r-slicer", label: "Prusa Slicer", title: "PrusaSlicer CLI Integration", icon: "printer3d", fn: () => this.openModal("slicer") }
    ]);

    // 4. Tools Section
    m("CLE Tools", "", [
      { id: "cle-r-vault", label: "Vault", title: "Tools, Materials & Machine Profiles", icon: "box", fn: () => this.openModal("vault") },
      { id: "cle-r-cal", label: "Calibration", title: "Steps/mm, Laser & Backlash", icon: "inspect", fn: () => this.openModal("calibration") },
      { id: "cle-r-test", label: "Test Suite", title: "Diagnostic Test Cuts", icon: "pattern", fn: () => this.openModal("test") },
      { id: "cle-r-rec", label: "Job Recovery", title: "Power-loss & Crash Recovery", icon: "recovery", fn: () => this.openModal("recovery") }
    ]);

    // 5. Safety
    m("Safety", "", [
      { id: "cle-r-estop", label: "FEED HOLD (!)", title: "Emergency Feed Hold", icon: "clearSim", cls: "danger", fn: () => this.fluidnc.sendImmediate("!") }
    ]);

    // Append DRO Bar
    const droDiv = document.createElement("div");
    droDiv.className = "cle-group";
    droDiv.style.marginLeft = "auto";
    droDiv.style.alignSelf = "center";
    droDiv.innerHTML = `
      <span class="cle-group-label">DRO (WCS)</span>
      <div class="cle-dro-bar">
        <span class="cle-dro-axis"><span class="cle-dro-name">X</span><span class="cle-dro-val" id="cle-dro-x">${this.fluidnc.wpos.X.toFixed(2)}</span></span>
        <span class="cle-dro-axis"><span class="cle-dro-name">Y</span><span class="cle-dro-val" id="cle-dro-y">${this.fluidnc.wpos.Y.toFixed(2)}</span></span>
        <span class="cle-dro-axis"><span class="cle-dro-name">Z</span><span class="cle-dro-val" id="cle-dro-z">${this.fluidnc.wpos.Z.toFixed(2)}</span></span>
        <span class="cle-dro-axis"><span class="cle-dro-name">A</span><span class="cle-dro-val" id="cle-dro-a">${this.fluidnc.wpos.A.toFixed(1)}</span></span>
      </div>
    `;
    s.append(droDiv);
  }

  toggleRibbon() {
    const r = document.getElementById('cle-ribbon');
    if (r) {
      r.style.display = r.style.display === 'none' ? 'flex' : 'none';
    }
  }

  wireRibbonEvents() {
    const bindClick = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.onclick = fn;
    };

    bindClick('cle-conn-serial', () => {
      if (this.fluidnc.isConnected) this.fluidnc.disconnect();
      else this.fluidnc.connectSerial();
    });
    bindClick('cle-conn-ws', () => {
      const ip = prompt('Enter FluidTouch / FluidNC IP Address:', this.fluidnc.ip);
      if (ip) this.fluidnc.connectWebSocket(ip);
    });
    bindClick('cle-btn-fluidtouch', () => this.fluidnc.openFluidTouchWebGUI());
    bindClick('cle-zero-all', () => {
      this.fluidnc.zeroAxis('ALL');
      this.notify('Zeroed All Axes (G10 L20 P1 X0 Y0 Z0 A0)', 'ok');
    });
    bindClick('cle-btn-estop', () => {
      this.fluidnc.sendImmediate('!');
      this.notify('EMERGENCY FEED HOLD SENT (!)', 'error');
    });
    bindClick('cle-gp-mode-toggle', () => this.gamepad.toggleMode());
    bindClick('cle-gp-remap-btn', () => this.openModal('gamepad'));
    bindClick('cle-rotary-toggle', () => this.rotary.toggle());
    bindClick('cle-btn-slicer', () => this.openModal('slicer'));
    bindClick('cle-btn-vault', () => this.openModal('vault'));
    bindClick('cle-btn-cal', () => this.openModal('calibration'));
    bindClick('cle-btn-test', () => this.openModal('test'));
    bindClick('cle-btn-recovery', () => this.openModal('recovery'));
  }

  openModal(type) {
    this.closeModal();

    const overlay = document.createElement('div');
    overlay.className = 'cle-modal-overlay';
    overlay.id = 'cle-active-modal';

    const modal = document.createElement('div');
    modal.className = 'cle-modal';

    let title = 'CLE Tool';
    let bodyHtml = '';

    if (type === 'gamepad') {
      title = 'Nintendo Switch Controller Setup & Remapping';
      bodyHtml = `
        <div class="cle-switch-diagram">
          <div class="cle-joycon-panel">
            <div class="cle-joycon-title">Left Joy-Con / Stick</div>
            <p><strong>Design Mode:</strong> Spherical Orbit (Pitch/Yaw)</p>
            <p><strong>Run Mode:</strong> Proportional Jog X & Y axes</p>
            <p><strong>D-Pad:</strong> Snap standard views (Design) / Step increment toggle (Run)</p>
            <p><strong>ZL Trigger:</strong> Zoom In / Jog Slowdown modifier</p>
            <p><strong>Minus (-) Button:</strong> Start/Stop Macro Recording ("Teach Pendant")</p>
          </div>
          <div class="cle-joycon-panel">
            <div class="cle-joycon-title">Right Joy-Con / Stick</div>
            <p><strong>Design Mode:</strong> Pan Up / Down / Left / Right</p>
            <p><strong>Run Mode:</strong> Jog Z axis (vert) & A axis (rotary)</p>
            <p><strong>A / B Buttons:</strong> Zero WCS (A) / Feed Hold (B)</p>
            <p><strong>X / Y Buttons:</strong> Touch-Plate Probe (X) / Cycle Axis (Y)</p>
            <p><strong>ZR Trigger:</strong> Zoom Out</p>
            <p><strong>Plus (+) Button:</strong> Toggle Design & Run Modes</p>
          </div>
        </div>
      `;
    } else if (type === 'calibration') {
      title = 'CLE Calibration Suite';
      bodyHtml = `
        <div class="cle-tabs">
          <button class="cle-tab active">Steps / mm</button>
          <button class="cle-tab">Laser Power/Speed Matrix</button>
          <button class="cle-tab">Backlash Measurement</button>
        </div>
        <div class="cle-form-row">
          <label>Target Axis:</label>
          <select class="cle-select" id="cal-axis">
            <option value="X">X Axis ($100)</option>
            <option value="Y">Y Axis ($101)</option>
            <option value="Z">Z Axis ($102)</option>
            <option value="A">A Rotary Axis ($103)</option>
          </select>
        </div>
        <div class="cle-form-row">
          <label>Current Steps/mm:</label>
          <input class="cle-input" id="cal-cur-steps" type="number" value="160.0">
        </div>
        <div class="cle-form-row">
          <label>Commanded Distance (mm):</label>
          <input class="cle-input" id="cal-cmd-dist" type="number" value="100.0">
        </div>
        <div class="cle-form-row">
          <label>Measured Distance (mm):</label>
          <input class="cle-input" id="cal-meas-dist" type="number" value="98.5">
        </div>
        <div style="margin-top:10px;">
          <button class="cle-btn" id="cal-calc-btn">Calculate & Send to FluidNC</button>
        </div>
      `;
    } else if (type === 'vault') {
      title = 'CLE Vault (Tools, Feeds & Speeds, Machine Profiles)';
      const tools = this.vault.data.tools;
      const materials = this.vault.data.materials;
      bodyHtml = `
        <div class="cle-joycon-title">Tool Presets (${tools.length})</div>
        <ul>
          ${tools.map(t => `<li><strong>${t.name}</strong> - Ø${t.diameter || t.spotDiameter}mm (${t.type})</li>`).join('')}
        </ul>
        <div class="cle-joycon-title" style="margin-top:12px;">Material Presets (${materials.length})</div>
        <ul>
          ${materials.map(m => `<li><strong>${m.name}</strong>: Feed ${m.feedRateXY} mm/min, Plunge ${m.plungeRate} mm/min, Pass ${m.passDepth}mm, ${m.rpm} RPM</li>`).join('')}
        </ul>
      `;
    } else if (type === 'test') {
      title = 'Diagnostic & Verification Tests';
      bodyHtml = `
        <p>Generate precision test G-code to verify machine squareness, repeatability, and laser alignment:</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;">
          <button class="cle-btn" id="test-btn-cds">Generate Circle-Diamond-Square (50mm)</button>
          <button class="cle-btn" id="test-btn-rep">Generate 4-Corner Rapid Repeatability</button>
          <button class="cle-btn" id="test-btn-pulse">Laser 1s Alignment Pulse</button>
        </div>
      `;
    } else if (type === 'recovery') {
      title = 'Job Crash & Power-Loss Recovery Wizard';
      const cp = this.recovery.getSavedCheckpoint();
      bodyHtml = `
        <p>Resume an interrupted job cleanly without gouging the workpiece or losing coordinate synchronization.</p>
        <div class="cle-joycon-panel" style="margin-top:10px;">
          <p><strong>Last Tracked Job:</strong> ${cp ? cp.filename : 'None recorded'}</p>
          <p><strong>Last Streamed Line:</strong> ${cp ? cp.currentLineIndex : 0} of ${cp ? cp.totalLines : 0}</p>
          <p><strong>Saved Work Position:</strong> X: ${cp ? cp.lastPosition.X : 0}, Y: ${cp ? cp.lastPosition.Y : 0}, Z: ${cp ? cp.lastPosition.Z : 0}, A: ${cp ? cp.lastPosition.A : 0}</p>
        </div>
        <div class="cle-form-row" style="margin-top:12px;">
          <label>Resume from Line #:</label>
          <input class="cle-input" id="rec-line" type="number" value="${cp ? cp.currentLineIndex : 0}">
        </div>
        <div class="cle-form-row">
          <label>Safe Z Clearance (mm):</label>
          <input class="cle-input" id="rec-safe-z" type="number" value="25.0">
        </div>
        <div style="margin-top:12px;">
          <button class="cle-btn" id="rec-plan-btn">Generate Recovery Preamble & Arm Stream</button>
        </div>
      `;
    } else if (type === 'slicer') {
      title = 'PrusaSlicer CLI & Continuous Slicing';
      bodyHtml = `
        <p>Slice JumpStart 3D models using <strong>PrusaSlicer CLI</strong> running locally on your CL3 server.</p>
        <div class="cle-form-row" style="margin-top:12px;">
          <label>Layer Height (mm):</label>
          <input class="cle-input" id="slice-layer-h" type="number" value="0.2" step="0.05">
        </div>
        <div class="cle-form-row">
          <label>Infill Density (%):</label>
          <input class="cle-input" id="slice-infill" type="number" value="20" step="5">
        </div>
        <div style="margin-top:14px; display:flex; gap:8px;">
          <button class="cle-btn" id="slice-run-btn">Export Mesh & Slice with Prusa CLI</button>
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="cle-modal-header">
        <span>${title}</span>
        <button class="cle-modal-close" id="cle-modal-close-btn">&times;</button>
      </div>
      <div class="cle-modal-body">
        ${bodyHtml}
      </div>
      <div class="cle-modal-footer">
        <button class="cle-btn" id="cle-modal-done-btn">Close</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.activeModal = overlay;

    document.getElementById('cle-modal-close-btn').onclick = () => this.closeModal();
    document.getElementById('cle-modal-done-btn').onclick = () => this.closeModal();

    if (type === 'calibration') {
      document.getElementById('cal-calc-btn').onclick = () => {
        const ax = document.getElementById('cal-axis').value;
        const cur = document.getElementById('cal-cur-steps').value;
        const cmd = document.getElementById('cal-cmd-dist').value;
        const meas = document.getElementById('cal-meas-dist').value;
        try {
          const res = this.calibration.calculateStepsPerMm(ax, cur, cmd, meas);
          this.fluidnc.sendGCode(res.command);
          this.notify(`Calculated & sent ${res.command} (${res.newSteps} steps/mm)`, 'ok');
          this.closeModal();
        } catch (e) {
          this.notify(e.message, 'error');
        }
      };
    } else if (type === 'test') {
      document.getElementById('test-btn-cds').onclick = () => {
        const gcode = this.test.generateCircleDiamondSquareGCode();
        this.fluidnc.streamGCodeLines(gcode.split('\n'));
        this.notify('Streaming Circle-Diamond-Square test to FluidNC', 'ok');
        this.closeModal();
      };
      document.getElementById('test-btn-pulse').onclick = () => {
        this.fluidnc.sendGCode('M3 S50\nG4 P1\nM5');
        this.notify('Laser 1s pulse executed', 'ok');
      };
    } else if (type === 'recovery') {
      document.getElementById('rec-plan-btn').onclick = () => {
        const line = parseInt(document.getElementById('rec-line').value, 10);
        const safeZ = parseFloat(document.getElementById('rec-safe-z').value);
        this.notify(`Recovery routine armed from line ${line} with Safe Z=${safeZ}mm`, 'ok');
        this.closeModal();
      };
    } else if (type === 'slicer') {
      document.getElementById('slice-run-btn').onclick = async () => {
        try {
          const stl = this.slicer.getActiveBodySTL();
          const gcode = await this.slicer.sliceWithPrusaCLI(stl, {
            layerHeight: parseFloat(document.getElementById('slice-layer-h').value),
            infill: parseInt(document.getElementById('slice-infill').value, 10)
          });
          this.notify('PrusaSlicer CLI generation complete!', 'ok');
          this.closeModal();
        } catch (e) {
          this.notify(`Slicing failed: ${e.message}`, 'error');
        }
      };
    }
  }

  closeModal() {
    if (this.activeModal) {
      this.activeModal.remove();
      this.activeModal = null;
    }
  }
}

// Global attachment
window.CLE = new CLEBridge();

// Self-boot when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.CLE.init());
} else {
  window.CLE.init();
}


})();
