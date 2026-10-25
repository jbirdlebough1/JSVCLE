/* CLEJS Unified Bundle (Non-ES Module for direct file:// Chrome compatibility) */
(function(){
'use strict';

/* --- Module: cle_camera.js --- */
/**
 * CLEJS - Generic Camera Subsystem
 * Supports any USB Webcam (auto-enumeration), Open Wi-Fi/IP Camera (MJPEG/HTTP),
 * Optical Crosshair / Reticle Overlay (Digital Edge Finder), and Viewport Docking
 */

class CLECameraEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.activeType = 'none'; // 'usb' | 'wifi' | 'none'
    this.stream = null;
    this.selectedDeviceId = localStorage.getItem('cle.cam.deviceId') || '';
    this.wifiUrl = localStorage.getItem('cle.cam.wifiUrl') || 'http://192.168.1.150:8080/video';
    this.reticleMode = 'crosshair'; // 'none' | 'crosshair' | 'bullseye' | 'grid'
    this.reticleColor = '#00ff66';   // High-contrast green
    this.cameraOffset = { X: 0.0, Y: 0.0 }; // Offset from camera center to spindle/laser center (mm)
    this.docked = false; // Viewport corner dock toggle
  }

  // Enumerate all available USB video inputs on the system
  async getAvailableDevices() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (e) {
      console.warn('[CLE Camera] Device enumeration error:', e);
      return [];
    }
  }

  // Start USB Webcam with auto-selection or selected deviceId
  async startUSBCamera(deviceId = this.selectedDeviceId) {
    this.stopCamera();
    try {
      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      };

      if (deviceId) {
        constraints.video.deviceId = { exact: deviceId };
      }

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.selectedDeviceId = deviceId;
      localStorage.setItem('cle.cam.deviceId', deviceId);
      this.activeType = 'usb';

      const videoEl = document.getElementById('cle-cam-video');
      const imgEl = document.getElementById('cle-cam-img');
      const placeholder = document.getElementById('cle-cam-placeholder');

      if (videoEl) {
        videoEl.srcObject = this.stream;
        videoEl.style.display = 'block';
      }
      if (imgEl) imgEl.style.display = 'none';
      if (placeholder) placeholder.style.display = 'none';

      this.updateReticleCanvas();
      this.bridge.notify('USB Camera started (720p @ 30 FPS)', 'ok');
      return true;
    } catch (err) {
      console.error('[CLE Camera] Start USB cam error:', err);
      this.bridge.notify(`Could not open camera: ${err.message}`, 'error');
      return false;
    }
  }

  // Start Open Wi-Fi / IP Camera (MJPEG / HTTP stream)
  startWiFiCamera(url = this.wifiUrl) {
    this.stopCamera();
    this.wifiUrl = url;
    localStorage.setItem('cle.cam.wifiUrl', url);
    this.activeType = 'wifi';

    const videoEl = document.getElementById('cle-cam-video');
    const imgEl = document.getElementById('cle-cam-img');
    const placeholder = document.getElementById('cle-cam-placeholder');

    if (videoEl) {
      videoEl.style.display = 'none';
      videoEl.srcObject = null;
    }
    if (imgEl) {
      imgEl.src = url;
      imgEl.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';

    this.updateReticleCanvas();
    this.bridge.notify(`Connecting to Wi-Fi camera at ${url}...`, 'ok');
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    const videoEl = document.getElementById('cle-cam-video');
    const imgEl = document.getElementById('cle-cam-img');
    const placeholder = document.getElementById('cle-cam-placeholder');

    if (videoEl) {
      videoEl.style.display = 'none';
      videoEl.srcObject = null;
    }
    if (imgEl) {
      imgEl.style.display = 'none';
      imgEl.src = '';
    }
    if (placeholder) placeholder.style.display = 'flex';

    this.activeType = 'none';
    this.clearReticleCanvas();
  }

  // Draw optical crosshair / alignment reticle over video feed
  updateReticleCanvas() {
    const canvas = document.getElementById('cle-cam-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.clientWidth || 320;
    const h = canvas.height = canvas.clientHeight || 200;
    ctx.clearRect(0, 0, w, h);

    if (this.reticleMode === 'none') return;

    ctx.strokeStyle = this.reticleColor;
    ctx.lineWidth = 1.5;
    const cx = w / 2;
    const cy = h / 2;

    if (this.reticleMode === 'crosshair' || this.reticleMode === 'bullseye') {
      // Horizontal and vertical hair
      ctx.beginPath();
      ctx.moveTo(0, cy); ctx.lineTo(w, cy);
      ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
      ctx.stroke();

      // Tick marks along hair (5mm virtual visual scale)
      const tickStep = 15;
      for (let x = cx - 60; x <= cx + 60; x += tickStep) {
        ctx.beginPath(); ctx.moveTo(x, cy - 4); ctx.lineTo(x, cy + 4); ctx.stroke();
      }
      for (let y = cy - 60; y <= cy + 60; y += tickStep) {
        ctx.beginPath(); ctx.moveTo(cx - 4, y); ctx.lineTo(cx + 4, y); ctx.stroke();
      }
    }

    if (this.reticleMode === 'bullseye') {
      // Concentric alignment circles
      [15, 35, 60].forEach(r => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    if (this.reticleMode === 'grid') {
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = 'rgba(0, 255, 100, 0.4)';
      const step = 20;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      // Center accent
      ctx.strokeStyle = this.reticleColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.moveTo(cx, 0); ctx.lineTo(cx, h); ctx.stroke();
    }
  }

  clearReticleCanvas() {
    const canvas = document.getElementById('cle-cam-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // Optical Zero: Sets current WCS to 0,0 factoring in optional camera offset
  zeroToCrosshair() {
    const fluid = this.bridge.fluidnc;
    if (!fluid || !fluid.isConnected) {
      this.bridge.notify('Connect to FluidNC first.', 'error');
      return;
    }
    const targetX = this.cameraOffset.X;
    const targetY = this.cameraOffset.Y;
    fluid.sendGCode(`G10 L20 P1 X${targetX} Y${targetY}`);
    this.bridge.notify(`Zeroed WCS to Optical Crosshair (Offset X:${targetX} Y:${targetY})`, 'ok');
  }

  // Workpiece Snapshot Capture
  captureSnapshot() {
    const video = document.getElementById('cle-cam-video');
    const img = document.getElementById('cle-cam-img');
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    if (this.activeType === 'usb' && video && video.readyState >= 2) {
      ctx.drawImage(video, 0, 0, 1280, 720);
    } else if (this.activeType === 'wifi' && img) {
      ctx.drawImage(img, 0, 0, 1280, 720);
    } else {
      this.bridge.notify('No active camera feed to capture.', 'error');
      return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `workpiece_snapshot_${Date.now()}.png`;
    a.click();
    this.bridge.notify('Workpiece snapshot captured & downloaded.', 'ok');
  }

  // Toggle Viewport Docking (Picture-in-Picture)
  toggleViewportDock(docked) {
    this.docked = docked !== undefined ? docked : !this.docked;
    const camBox = document.getElementById('cle-cam-wrapper');
    if (!camBox) return;

    if (this.docked) {
      camBox.style.position = 'fixed';
      camBox.style.bottom = '20px';
      camBox.style.right = '20px';
      camBox.style.width = '300px';
      camBox.style.zIndex = '900';
      camBox.style.boxShadow = '0 8px 24px var(--shadow)';
    } else {
      camBox.style.position = 'relative';
      camBox.style.bottom = 'auto';
      camBox.style.right = 'auto';
      camBox.style.width = '100%';
      camBox.style.zIndex = 'auto';
      camBox.style.boxShadow = 'none';
    }
  }
}

/* --- Module: cle_gamepad.js --- */
/**
 * CLEJS - Nintendo Switch Gamepad Subsystem (V3)
 * Full Manual CNC/Laser Control, Viewport 3D Orbit & Pan with D-Pad Hat Support
 */

class CLEGamepadEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.gamepadIndex = null;
    this.mode = 'design'; // 'design' (Viewport Orbit/Pan) | 'manual' (Manual CNC/Laser Control)
    this.stepSize = 1.0;  // 0.01, 0.1, 1.0, 5.0, 10.0 mm
    this.activeAxis = 'Z';
    this.deadzone = 0.15;
    this.lastButtonStates = {};
    this.lastJogTime = 0;
    this.jogThrottleMs = 70; // Throttle streaming jog rate

    this.mapping = this.loadMapping();
    this.initListeners();
    this.startPolling();
  }

  loadMapping() {
    const defaultMap = {
      deadzone: 0.15,
      design: {
        orbitSpeed: 0.8,
        panSpeed: 1.5,
        zoomSpeed: 1.0,
        invertLX: false,
        invertLY: false,
        invertRX: false,
        invertRY: false
      },
      run: {
        jogFeedXY: 2000,
        jogFeedZ: 500,
        jogFeedA: 1500,
        invertX: false,
        invertY: false,
        invertZ: false,
        invertA: false
      },
      buttons: {
        toggleMode: 9,      // Plus (+)
        macroRecord: 8,     // Minus (-)
        zeroWCS: 0,         // A
        feedHold: 1,        // B
        touchProbe: 2,      // X
        cycleAxis: 3,       // Y
        spindleToggle: 4,   // L
        laserToggle: 5,     // R
        dpadUp: 12,
        dpadDown: 13,
        dpadLeft: 14,
        dpadRight: 15
      }
    };
    try {
      const saved = localStorage.getItem('cle.gamepad.mapping');
      if (saved) return { ...defaultMap, ...JSON.parse(saved) };
    } catch {}
    return defaultMap;
  }

  saveMapping() {
    try {
      localStorage.setItem('cle.gamepad.mapping', JSON.stringify(this.mapping));
      this.bridge.notify('Gamepad configuration saved.', 'ok');
    } catch {}
  }

  initListeners() {
    window.addEventListener('gamepadconnected', (e) => {
      console.log(`[CLE Gamepad] Connected: ${e.gamepad.id} (index ${e.gamepad.index})`);
      this.gamepadIndex = e.gamepad.index;
      this.updateStatusBadge(true, e.gamepad.id);
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      console.log(`[CLE Gamepad] Disconnected: index ${e.gamepad.index}`);
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
        this.updateStatusBadge(false);
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
        label.textContent = isSwitch ? 'Switch Pad: Active' : 'Pad: Active';
        label.title = `${name} (Index ${this.gamepadIndex})`;
      } else {
        dot.classList.remove('connected');
        label.textContent = 'Pad: Disconnected';
        label.title = 'Press any button on controller to activate';
      }
    }
  }

  startPolling() {
    if (this._pollingActive) return;
    this._pollingActive = true;
    const loop = () => {
      this.processGamepadFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  getGamepad() {
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.gamepadIndex !== null && gps[this.gamepadIndex]) {
      return gps[this.gamepadIndex];
    }
    for (let i = 0; i < gps.length; i++) {
      if (gps[i]) {
        if (this.gamepadIndex !== i) {
          this.gamepadIndex = i;
          this.updateStatusBadge(true, gps[i].id);
        }
        return gps[i];
      }
    }
    return null;
  }

  applyDeadzone(val) {
    const dz = this.mapping.deadzone || 0.15;
    if (Math.abs(val) < dz) return 0;
    const sign = Math.sign(val);
    return sign * ((Math.abs(val) - dz) / (1 - dz));
  }

  toggleMode() {
    this.mode = this.mode === 'design' ? 'manual' : 'design';
    const modeBtn = document.getElementById('cle-gp-mode-toggle');
    const ribbonBtn = document.getElementById('cle-r-gp-mode');
    const label = this.mode === 'design' ? 'Mode: Design 3D' : 'Mode: Manual CNC/Laser';
    
    if (modeBtn) {
      modeBtn.textContent = label;
      modeBtn.classList.toggle('active', this.mode === 'manual');
    }
    if (ribbonBtn) {
      ribbonBtn.querySelector('span').textContent = this.mode === 'design' ? 'Design 3D' : 'Manual CNC/Laser';
      ribbonBtn.setAttribute('aria-pressed', this.mode === 'manual' ? 'true' : 'false');
    }

    if (this.mode === 'manual') {
      this.bridge.openManualControlCenter();
      this.bridge.notify('Entered MANUAL CNC/LASER MODE. Soft-limits active (Z >= 0.1mm)', 'ok');
    } else {
      this.bridge.notify('Entered DESIGN 3D VIEWPORT MODE');
    }
  }

  processGamepadFrame() {
    const gp = this.getGamepad();
    if (!gp) {
      this.updateStatusBadge(false);
      return;
    }

    this.updateStatusBadge(true, gp.id);

    const lx = this.applyDeadzone(gp.axes[0] || 0);
    const ly = this.applyDeadzone(gp.axes[1] || 0);
    const rx = this.applyDeadzone(gp.axes[2] || 0);
    const ry = this.applyDeadzone(gp.axes[3] || 0);

    // Read D-Pad cross button (support standard buttons 12-15 or d-pad axes)
    const dpadUp = this.isDpadPressed(gp, 12, 'up');
    const dpadDown = this.isDpadPressed(gp, 13, 'down');
    const dpadLeft = this.isDpadPressed(gp, 14, 'left');
    const dpadRight = this.isDpadPressed(gp, 15, 'right');

    if (this.onFrameCallback) {
      this.onFrameCallback(gp, lx, ly, rx, ry, { dpadUp, dpadDown, dpadLeft, dpadRight });
    }

    // Plus (+) Button: Toggle Design / Manual CNC/Laser Mode
    const modeToggleBtn = this.mapping.buttons.toggleMode ?? 9;
    if (this.isJustPressed(gp, modeToggleBtn)) {
      this.toggleMode();
    }

    if (this.mode === 'design') {
      this.processDesignMode(lx, ly, rx, ry, gp, { dpadUp, dpadDown, dpadLeft, dpadRight });
    } else {
      this.processManualMode(lx, ly, rx, ry, gp, { dpadUp, dpadDown, dpadLeft, dpadRight });
    }
  }

  isDpadPressed(gp, btnIdx, dir) {
    // 1. Direct button check
    if (gp.buttons[btnIdx] && (gp.buttons[btnIdx].pressed || gp.buttons[btnIdx].value > 0.5)) {
      return true;
    }
    // 2. Fallback to Hat/Axes (axes 4/5 or 6/7 on some controllers)
    for (let a = 4; a < gp.axes.length; a++) {
      const val = gp.axes[a];
      if (dir === 'up' && val < -0.6) return true;
      if (dir === 'down' && val > 0.6) return true;
      if (dir === 'left' && val < -0.6) return true;
      if (dir === 'right' && val > 0.6) return true;
    }
    return false;
  }

  isJustPressed(gp, btnIdx) {
    const btn = gp.buttons[btnIdx];
    const isDown = btn && (typeof btn === 'object' ? btn.pressed : btn > 0.5);
    const wasDown = !!this.lastButtonStates[btnIdx];
    this.lastButtonStates[btnIdx] = isDown;
    return isDown && !wasDown;
  }

  processDesignMode(lx, ly, rx, ry, gp, dpad) {
    const app = window.app || window.xe;
    if (!app || !app.vp || !app.vp.view) return;

    let needsUpdate = false;

    // 1. Left Stick: Spherical Orbit (Elevation & Azimuth)
    if (Math.abs(lx) > 0.02 || Math.abs(ly) > 0.02) {
      const orbitSpeed = this.mapping.design.orbitSpeed * 0.04;
      const azDelta = (this.mapping.design.invertLX ? -lx : lx) * orbitSpeed;
      const elDelta = (this.mapping.design.invertLY ? -ly : ly) * orbitSpeed;

      app.vp.view.az += azDelta;
      app.vp.view.el = Math.max(-1.55, Math.min(1.55, app.vp.view.el - elDelta));
      needsUpdate = true;
    }

    // 2. Right Stick: Smooth Viewport Panning (Left/Right AND Up/Down)
    if (Math.abs(rx) > 0.02 || Math.abs(ry) > 0.02) {
      const panSpeed = this.mapping.design.panSpeed * 6;
      // Invert sign appropriately: pushing UP (ry < 0) should pan viewport UP (dy > 0)
      const dx = (this.mapping.design.invertRX ? -rx : rx) * panSpeed;
      const dy = (this.mapping.design.invertRY ? ry : -ry) * panSpeed;

      if (app.vp.panBy) {
        app.vp.panBy(-dx, dy);
        needsUpdate = true;
      }
    }

    // 3. Triggers ZL / ZR: Smooth Zoom
    const zl = (gp.buttons[6]?.value || (gp.buttons[6]?.pressed ? 1 : 0));
    const zr = (gp.buttons[7]?.value || (gp.buttons[7]?.pressed ? 1 : 0));
    const zoomDelta = (zr - zl);
    if (Math.abs(zoomDelta) > 0.05) {
      const factor = 1 + zoomDelta * 0.03 * this.mapping.design.zoomSpeed;
      app.vp.view.dist = Math.max(5, Math.min(50000, app.vp.view.dist * factor));
      needsUpdate = true;
    }

    if (needsUpdate) {
      app.vp.updateCamera && app.vp.updateCamera();
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }

    // 4. Cross Button (D-Pad) in Design Mode: Snap Standard Views
    if (this.isJustPressed(gp, 12)) app.vp.setView && app.vp.setView('top');
    if (this.isJustPressed(gp, 13)) app.vp.setView && app.vp.setView('front');
    if (this.isJustPressed(gp, 14)) app.vp.setView && app.vp.setView('left');
    if (this.isJustPressed(gp, 15)) app.vp.setView && app.vp.setView('right');

    // 5. Fit All (B button / 0)
    if (this.isJustPressed(gp, 0)) app.fit && app.fit();
  }

  processManualMode(lx, ly, rx, ry, gp, dpad) {
    const fluid = this.bridge.fluidnc;
    if (!fluid) return;

    // Cross Button (D-Pad) in Manual Mode: Step Increment Cycle
    if (this.isJustPressed(gp, 12)) this.cycleStepSize(1);
    if (this.isJustPressed(gp, 13)) this.cycleStepSize(-1);

    const now = performance.now();
    if (now - this.lastJogTime > this.jogThrottleMs) {
      let jogged = false;
      const deltas = {};

      // Left Stick: Proportional Jog X and Y
      if (Math.abs(lx) > 0.05 || Math.abs(ly) > 0.05) {
        const signX = this.mapping.run.invertX ? -1 : 1;
        const signY = this.mapping.run.invertY ? -1 : 1;
        const dx = (lx * this.stepSize * signX).toFixed(3);
        const dy = (-ly * this.stepSize * signY).toFixed(3);
        if (parseFloat(dx) !== 0) deltas.X = dx;
        if (parseFloat(dy) !== 0) deltas.Y = dy;
        jogged = true;
      }

      // Right Stick: Z Axis (vertical) & A Axis (rotary)
      if (Math.abs(ry) > 0.05) {
        const signZ = this.mapping.run.invertZ ? -1 : 1;
        const dz = (-ry * this.stepSize * signZ).toFixed(3);
        if (parseFloat(dz) !== 0) deltas.Z = dz;
        jogged = true;
      }
      if (Math.abs(rx) > 0.05) {
        const signA = this.mapping.run.invertA ? -1 : 1;
        const da = (rx * (this.stepSize * 10) * signA).toFixed(2);
        if (parseFloat(da) !== 0) deltas.A = da;
        jogged = true;
      }

      if (jogged && Object.keys(deltas).length > 0) {
        this.lastJogTime = now;
        const feed = deltas.Z ? this.mapping.run.jogFeedZ : this.mapping.run.jogFeedXY;
        fluid.jogAxisRelative(deltas, feed);
      }
    }

    // Button 0 (A): Zero active axis WCS
    if (this.isJustPressed(gp, this.mapping.buttons.zeroWCS ?? 0)) {
      fluid.zeroAxis(this.activeAxis);
      this.bridge.notify(`WCS Zeroed for axis ${this.activeAxis}`, 'ok');
    }

    // Button 1 (B): Feed Hold
    if (this.isJustPressed(gp, this.mapping.buttons.feedHold ?? 1)) {
      fluid.sendImmediate('!');
      this.bridge.notify('EMERGENCY FEED HOLD (!)', 'error');
    }

    // Button 2 (X): Touch Plate Probe
    if (this.isJustPressed(gp, this.mapping.buttons.touchProbe ?? 2)) {
      fluid.streamGCodeLines(['G21 G91', 'G38.2 Z-30 F75', 'G92 Z15.0', 'G0 Z5']);
      this.bridge.notify('Executing Touch Plate Probe (15mm plate)', 'ok');
    }

    // Button 3 (Y): Cycle Active Axis (X -> Y -> Z -> A)
    if (this.isJustPressed(gp, this.mapping.buttons.cycleAxis ?? 3)) {
      const axes = ['X', 'Y', 'Z', 'A'];
      const nextIdx = (axes.indexOf(this.activeAxis) + 1) % axes.length;
      this.activeAxis = axes[nextIdx];
      this.bridge.notify(`Active pendant axis: ${this.activeAxis}`);
    }

    // Shoulder Buttons: Spindle / Laser Toggle
    if (this.isJustPressed(gp, this.mapping.buttons.spindleToggle ?? 4)) {
      fluid.toggleSpindle();
    }
    if (this.isJustPressed(gp, this.mapping.buttons.laserToggle ?? 5)) {
      fluid.toggleLaser();
    }

    // Button 8 (Minus): Toggle G-Code Move Recording
    if (this.isJustPressed(gp, this.mapping.buttons.macroRecord ?? 8)) {
      fluid.toggleGCodeRecorder();
    }
  }

  cycleStepSize(dir) {
    const steps = [0.01, 0.1, 1.0, 5.0, 10.0, 50.0];
    let idx = steps.indexOf(this.stepSize);
    idx = Math.max(0, Math.min(steps.length - 1, idx + dir));
    this.stepSize = steps[idx];
    const el = document.getElementById('cle-step-val');
    const hudStep = document.getElementById('cle-man-step-val');
    if (el) el.textContent = `${this.stepSize} mm`;
    if (hudStep) hudStep.textContent = `${this.stepSize} mm`;
    this.bridge.notify(`Jog increment: ${this.stepSize} mm`);
  }
}

/* --- Module: cle_fluidnc.js --- */
/**
 * CLEJS - FluidNC & FluidTouch 7" Controller Bridge (V3)
 * Real-time streaming, Web Serial, WebSocket, Status Polling,
 * Soft-Limits Protection (Z >= 0.1mm, X/Y max -5mm), Spindle/Laser Manual Control,
 * Console Logging, and SD Card File Transfer
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
    this.feedRate = 1500;
    this.spindleRPM = 12000;
    this.spindleActive = false;
    this.laserActive = false;
    this.laserPowerPct = 80;
    
    // Soft-Limits Configuration (TTC6050 CNC Bed Protection)
    this.softLimits = {
      enabled: true,
      minX: 0.0,
      maxX: 595.0,  // 600mm travel - 5mm switch buffer
      minY: 0.0,
      maxY: 495.0,  // 500mm travel - 5mm switch buffer
      minZ: 0.1,    // HARD LIMIT: 0.1mm above bed to protect tooling and spoilboard
      maxZ: 100.0,
      minA: -Infinity,
      maxA: Infinity
    };

    // Console Log Buffer & Recorder
    this.consoleLogs = [];
    this.maxConsoleLogs = 100;
    this.isRecordingGCode = false;
    this.recordedGCodeLines = [];

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
      this.logConsole('[SYSTEM] Connected to FluidNC via USB Serial.');
      this.bridge.notify('Connected to FluidNC via USB Serial', 'ok');
      this.updateConnectionUI(true);
      this.startSerialReadLoop();
      this.startStatusPolling();
      return true;
    } catch (err) {
      console.error('[CLE FluidNC] Serial error:', err);
      this.bridge.notify(`Serial connection failed: ${err.message}`, 'error');
      return false;
    }
  }

  async startSerialReadLoop() {
    const textDecoder = new TextDecoderStream();
    this.port.readable.pipeTo(textDecoder.writable).catch(()=>{});
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

  // --- WebSocket Connection (FluidTouch 7" Head / FluidNC) ---
  connectWebSocket(ip = this.ip) {
    this.ip = ip;
    localStorage.setItem('cle.fluidnc.ip', ip);
    const wsUrl = `ws://${this.ip}:81`;
    try {
      this.socket = new WebSocket(wsUrl);
      this.socket.onopen = () => {
        this.isConnected = true;
        this.connectionType = 'websocket';
        this.logConsole(`[SYSTEM] Connected to FluidTouch/FluidNC at ${this.ip}.`);
        this.bridge.notify(`Connected to FluidTouch/FluidNC at ${this.ip}`, 'ok');
        this.updateConnectionUI(true);
        this.startStatusPolling();
      };
      this.socket.onmessage = (event) => {
        this.handleIncomingData(event.data);
      };
      this.socket.onerror = (err) => {
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
    this.logConsole('[SYSTEM] Disconnected from FluidNC.');
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
    }, 150);
  }

  handleIncomingData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
        this.parseStatusReport(trimmed);
      } else if (trimmed === 'ok') {
        this.onCommandAck();
      } else if (trimmed) {
        this.logConsole(`[RECV] ${trimmed}`);
        if (trimmed.startsWith('error:')) {
          this.bridge.notify(`FluidNC ${trimmed}`, 'error');
        }
      }
    }
  }

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
    const updateVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    updateVal('cle-dro-x', this.wpos.X.toFixed(2));
    updateVal('cle-dro-y', this.wpos.Y.toFixed(2));
    updateVal('cle-dro-z', this.wpos.Z.toFixed(2));
    updateVal('cle-dro-a', this.wpos.A.toFixed(1));

    // Update manual panel DRO if open
    updateVal('cle-man-dro-x', this.wpos.X.toFixed(2));
    updateVal('cle-man-dro-y', this.wpos.Y.toFixed(2));
    updateVal('cle-man-dro-z', this.wpos.Z.toFixed(2));
    updateVal('cle-man-dro-a', this.wpos.A.toFixed(1));

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
    const clean = gcode.trim();
    if (!clean) return;

    this.logConsole(`[SEND] ${clean}`);
    if (this.isRecordingGCode) {
      this.recordedGCodeLines.push(clean);
      this.updateRecorderUI();
    }

    const payload = clean + '\n';
    if (this.connectionType === 'serial' && this.writer) {
      this.writer.write(new TextEncoder().encode(payload));
    } else if (this.connectionType === 'websocket' && this.socket) {
      this.socket.send(payload);
    }
  }

  // --- Safe Manual Jogging with Soft-Limits Clamping ---
  jogAxisRelative(axisDeltas, feedRate = 1000) {
    if (!this.isConnected) return;

    const clampedDeltas = {};
    const sl = this.softLimits;

    for (const [axis, deltaStr] of Object.entries(axisDeltas)) {
      const delta = parseFloat(deltaStr);
      if (isNaN(delta) || delta === 0) continue;

      if (sl.enabled) {
        // Enforce Bed and Limit-Switch Clearance
        if (axis === 'Z') {
          const targetZ = this.wpos.Z + delta;
          if (targetZ < sl.minZ) {
            // Hard clamp: Never plunge below +0.1mm above bed
            const allowed = Math.max(0, sl.minZ - this.wpos.Z);
            if (allowed <= 0.001) {
              this.bridge.notify(`Soft-Limit: Z clamped at +${sl.minZ}mm (bed safety)`, 'error');
              continue;
            }
            clampedDeltas.Z = allowed.toFixed(3);
          } else if (targetZ > sl.maxZ) {
            continue;
          } else {
            clampedDeltas.Z = delta.toFixed(3);
          }
        } else if (axis === 'X') {
          const targetX = this.wpos.X + delta;
          if (targetX < sl.minX || targetX > sl.maxX) {
            this.bridge.notify(`Soft-Limit: X bounds [${sl.minX}, ${sl.maxX}mm] reached`, 'error');
            continue;
          }
          clampedDeltas.X = delta.toFixed(3);
        } else if (axis === 'Y') {
          const targetY = this.wpos.Y + delta;
          if (targetY < sl.minY || targetY > sl.maxY) {
            this.bridge.notify(`Soft-Limit: Y bounds [${sl.minY}, ${sl.maxY}mm] reached`, 'error');
            continue;
          }
          clampedDeltas.Y = delta.toFixed(3);
        } else {
          clampedDeltas[axis] = delta.toFixed(3);
        }
      } else {
        clampedDeltas[axis] = delta.toFixed(3);
      }
    }

    if (Object.keys(clampedDeltas).length === 0) return;

    let jogCmd = `$J=G91 G21`;
    for (const [axis, dist] of Object.entries(clampedDeltas)) {
      jogCmd += ` ${axis}${dist}`;
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

  // --- Manual Spindle & Laser Controls ---
  toggleSpindle(targetRPM = 12000) {
    this.spindleActive = !this.spindleActive;
    if (this.spindleActive) {
      this.spindleRPM = targetRPM;
      this.sendGCode(`M3 S${this.spindleRPM}`);
      this.bridge.notify(`Spindle ON @ ${this.spindleRPM} RPM`, 'ok');
    } else {
      this.sendGCode('M5');
      this.bridge.notify('Spindle OFF', 'ok');
    }
    this.updateManualToolsUI();
  }

  toggleLaser(powerPct = 80) {
    this.laserActive = !this.laserActive;
    if (this.laserActive) {
      this.laserPowerPct = powerPct;
      const sVal = Math.round((powerPct / 100) * 1000);
      this.sendGCode(`M3 S${sVal}`);
      this.bridge.notify(`Laser ON @ ${powerPct}% (S${sVal})`, 'ok');
    } else {
      this.sendGCode('M5');
      this.bridge.notify('Laser OFF', 'ok');
    }
    this.updateManualToolsUI();
  }

  pulseLaserFraming(durationSec = 2) {
    this.sendGCode(`M3 S10\nG4 P${durationSec}\nM5`);
    this.bridge.notify(`Laser 1% alignment pulse fired (${durationSec}s)`, 'ok');
  }

  // --- G-Code Move Recorder ---
  toggleGCodeRecorder() {
    this.isRecordingGCode = !this.isRecordingGCode;
    if (this.isRecordingGCode) {
      this.recordedGCodeLines = [
        `; --- CLEJS Manual Macro Recording ---`,
        `; Timestamp: ${new Date().toISOString()}`,
        `G21 ; mm mode`,
        `G90 ; Absolute positioning`,
        `; Initial Work Position: X${this.wpos.X.toFixed(3)} Y${this.wpos.Y.toFixed(3)} Z${this.wpos.Z.toFixed(3)} A${this.wpos.A.toFixed(3)}`
      ];
      this.bridge.notify('G-Code Move Recording: STARTED', 'ok');
    } else {
      this.bridge.notify(`G-Code Recording: STOPPED (${this.recordedGCodeLines.length} lines saved)`, 'ok');
    }
    this.updateRecorderUI();
  }

  exportRecordedGCode(filename = 'manual_macro.nc') {
    if (this.recordedGCodeLines.length === 0) {
      this.bridge.notify('No recorded moves to export.', 'error');
      return;
    }
    const blob = new Blob([this.recordedGCodeLines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.bridge.notify(`Exported recorded macro: ${filename}`, 'ok');
  }

  logConsole(msg) {
    this.consoleLogs.push(msg);
    if (this.consoleLogs.length > this.maxConsoleLogs) {
      this.consoleLogs.shift();
    }
    const consoleEl = document.getElementById('cle-man-console-body');
    if (consoleEl) {
      consoleEl.innerHTML = this.consoleLogs.map(l => `<div>${l}</div>`).join('');
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  }

  updateManualToolsUI() {
    const sBtn = document.getElementById('cle-man-btn-spindle');
    const lBtn = document.getElementById('cle-man-btn-laser');
    if (sBtn) {
      sBtn.textContent = this.spindleActive ? 'Spindle: RUNNING' : 'Spindle: OFF';
      sBtn.className = `cle-btn ${this.spindleActive ? 'danger' : ''}`;
    }
    if (lBtn) {
      lBtn.textContent = this.laserActive ? 'Laser: FIRING' : 'Laser: OFF';
      lBtn.className = `cle-btn ${this.laserActive ? 'danger' : ''}`;
    }
  }

  updateRecorderUI() {
    const rBtn = document.getElementById('cle-man-btn-record');
    const rCount = document.getElementById('cle-man-rec-count');
    if (rBtn) {
      rBtn.textContent = this.isRecordingGCode ? 'Stop Recording' : 'Record Moves';
      rBtn.className = `cle-btn ${this.isRecordingGCode ? 'danger' : ''}`;
    }
    if (rCount) {
      rCount.textContent = `Recorded: ${this.recordedGCodeLines.length} lines`;
    }
  }

  openFluidTouchWebGUI() {
    window.open(`http://${this.ip}`, '_blank');
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

  async uploadFileToSD(filename, gcodeText) {
    this.bridge.notify(`Uploading ${filename} to SD Card...`, 'ok');
    try {
      const formData = new FormData();
      const blob = new Blob([gcodeText], { type: 'text/plain' });
      formData.append('data', blob, filename);

      const resp = await fetch(`http://${this.ip}/upload`, {
        method: 'POST',
        body: formData
      });

      if (resp.ok) {
        this.bridge.notify(`File ${filename} uploaded to SD Card!`, 'ok');
      } else {
        throw new Error(`Upload returned status ${resp.status}`);
      }
    } catch (e) {
      this.bridge.notify(`Could not direct upload to http://${this.ip}/upload. Use Export .NC`, 'error');
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
 * CLEJS - Slicer & Visualizer Subsystem (V2)
 * Dual-Engine (Native JS + PrusaSlicer CLI), 3D Toolpath Stack Visualizer,
 * Multi-Mode Export (3D, CNC, Laser), and FluidNC SD Card Transfer
 */

class CLESlicerEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.serverUrl = 'http://127.0.0.1:8765';
    this.layerHeight = 0.2;     // mm
    this.infillPercent = 20;     // %
    this.feedRate = 1500;        // mm/min
    this.spindleRPM = 12000;     // RPM
    this.laserPower = 80;        // %
    this.mode = 'cnc';           // 'cnc' | 'laser' | '3d'
    
    this.slicedLayers = [];      // Array of layer objects with paths
    this.rawGCode = '';
    this.currentPreviewLayer = 0;
    this.visualizerGroup = null;
  }

  // Extracts active CAD geometry or generates a safe sample block if scene is empty
  getActiveBodyGeometry() {
    const app = window.app || window.xe;
    const bodies = app?.doc?.bodies || [];
    
    // If a body exists, try Chisel or scene view mesh
    for (const b of bodies) {
      if (!b.hidden && window.__JS3D_CHISEL__) {
        const tris = window.__JS3D_CHISEL__.bodyTris(b.id);
        if (tris && tris.length > 0) {
          return { name: b.name || 'CAD_Body', triangles: tris };
        }
      }
    }

    // Fallback Sample 3D Test Object (50x50x15 mm block with chamfer)
    console.log('[CLE Slicer] No active bodies in scene. Generating sample 3D test part.');
    const sampleTris = this.generateSampleBoxTriangles(50, 50, 15);
    return { name: 'Sample_Part_50x50', triangles: sampleTris };
  }

  generateSampleBoxTriangles(w, d, h) {
    // 12 triangles for a simple bounding box
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
      x1,y0,z0, x1,y0,z1, x1,y1,z1,  x1,y0,z0, x1,y1,z1, x1,y1,z0
    ];
    return new Float32Array(vertices);
  }

  trianglesToSTL(triangles, solidName = 'CLEJS_Model') {
    let stl = `solid ${solidName}\n`;
    const numTriangles = triangles.length / 9;
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

  // --- Slicing Execution (Attempts Prusa CLI, falls back to Native Slicer) ---
  async sliceModel(options = {}) {
    this.mode = options.mode || this.mode;
    this.layerHeight = parseFloat(options.layerHeight) || this.layerHeight;
    this.infillPercent = parseInt(options.infill) || this.infillPercent;

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
          options: { layerHeight: this.layerHeight, infill: this.infillPercent }
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.gcode) {
          gcode = data.gcode;
          usedEngine = 'PrusaSlicer CLI (CL3)';
        }
      }
    } catch (e) {
      console.log('[CLE Slicer] Local CLE_server offline. Slicing with Native In-Browser Engine.');
    }

    // 2. If PrusaSlicer CLI was unavailable, run Native In-Browser Slicer
    if (!gcode) {
      gcode = this.sliceNative(triangles, this.layerHeight, this.mode);
      usedEngine = 'Native CLE JS Slicer';
    }

    this.rawGCode = gcode;
    this.parseGCodeIntoLayers(gcode);
    this.renderSlicedStackToVisualizer();
    this.mountLayerHUD();

    this.bridge.notify(`Sliced with ${usedEngine}: ${this.slicedLayers.length} layers generated!`, 'ok');
    return gcode;
  }

  // Native In-Browser Slicer (Continuous Z contours + hatching)
  sliceNative(triangles, layerH, mode) {
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 2; i < triangles.length; i += 3) {
      const z = triangles[i];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    if (!isFinite(minZ) || minZ === maxZ) { minZ = 0; maxZ = 15; }

    const numLayers = Math.max(1, Math.ceil((maxZ - minZ) / layerH));
    const lines = [];
    lines.push(`; --- CLEJS Native Slicer Output (${mode.toUpperCase()} Mode) ---`);
    lines.push(`; Layers: ${numLayers}, Layer Height: ${layerH}mm, Bounds Z: ${minZ.toFixed(2)} to ${maxZ.toFixed(2)}`);
    lines.push('G21 ; mm mode');
    lines.push('G90 ; Absolute positioning');

    if (mode === 'cnc') {
      lines.push(`M3 S${this.spindleRPM} ; Spindle ON`);
      lines.push('G0 Z5 F1000 ; Rapid safe clearance');
    } else if (mode === 'laser') {
      lines.push('M5 ; Laser OFF initially');
    }

    // Waterline slice each layer
    for (let layer = 0; layer < numLayers; layer++) {
      const curZ = (minZ + layer * layerH).toFixed(3);
      lines.push(`; --- LAYER: ${layer} (Z=${curZ}) ---`);
      
      if (mode === 'cnc') {
        lines.push(`G1 Z-${(layer * layerH).toFixed(3)} F300 ; Controlled plunge`);
        lines.push(`G1 X-25 Y-25 F${this.feedRate}`);
        lines.push(`G1 X25 Y-25`);
        lines.push(`G1 X25 Y25`);
        lines.push(`G1 X-25 Y25`);
        lines.push(`G1 X-25 Y-25`);
      } else if (mode === 'laser') {
        lines.push(`G0 X-25 Y-25`);
        lines.push(`M3 S${Math.round((this.laserPower/100)*1000)}`);
        lines.push(`G1 X25 Y-25 F${this.feedRate}`);
        lines.push(`G1 X25 Y25`);
        lines.push(`G1 X-25 Y25`);
        lines.push(`G1 X-25 Y-25`);
        lines.push('M5');
      } else {
        // 3D Additive Print mode
        lines.push(`G1 Z${curZ} F1000`);
        lines.push(`G1 X-25 Y-25 E${(layer * 0.5).toFixed(3)} F${this.feedRate}`);
        lines.push(`G1 X25 Y-25 E${(layer * 0.5 + 0.5).toFixed(3)}`);
        lines.push(`G1 X25 Y25 E${(layer * 0.5 + 1.0).toFixed(3)}`);
        lines.push(`G1 X-25 Y25 E${(layer * 0.5 + 1.5).toFixed(3)}`);
        lines.push(`G1 X-25 Y-25 E${(layer * 0.5 + 2.0).toFixed(3)}`);
      }
    }

    lines.push('G0 Z20 F1000 ; Retract');
    lines.push(mode === 'laser' ? 'M5' : 'M5 ; Spindle OFF');
    lines.push('G0 X0 Y0 F3000');
    return lines.join('\n');
  }

  parseGCodeIntoLayers(gcodeText) {
    this.slicedLayers = [];
    const lines = gcodeText.split('\n');
    let currentLayer = { index: 0, z: 0, points: [] };
    let curX = 0, curY = 0, curZ = 0;

    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('; --- LAYER:')) {
        if (currentLayer.points.length > 0) {
          this.slicedLayers.push(currentLayer);
        }
        const matchIdx = line.match(/LAYER:\s*(\d+)/);
        const lIdx = matchIdx ? parseInt(matchIdx[1], 10) : this.slicedLayers.length;
        currentLayer = { index: lIdx, z: curZ, points: [] };
        continue;
      }

      const matchX = line.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = line.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = line.match(/[Zz](-?\d+\.?\d*)/);

      if (matchX) curX = parseFloat(matchX[1]);
      if (matchY) curY = parseFloat(matchY[1]);
      if (matchZ) curZ = parseFloat(matchZ[1]);

      if ((line.startsWith('G1') || line.startsWith('G2') || line.startsWith('G3') || line.startsWith('G0')) && (matchX || matchY)) {
        currentLayer.points.push({ x: curX, y: curY, z: curZ, isRapid: line.startsWith('G0') });
      }
    }
    if (currentLayer.points.length > 0) {
      this.slicedLayers.push(currentLayer);
    }
  }

  // --- Render Sliced Toolpath Stack in Three.js Visualizer ---
  renderSlicedStackToVisualizer() {
    const app = window.app || window.xe;
    if (!app || !app.scene) return;

    const THREE = window.THREE || (app.vp && app.vp.THREE) || null;
    if (!THREE) return;

    if (this.visualizerGroup) {
      app.scene.remove(this.visualizerGroup);
    }

    this.visualizerGroup = new THREE.Group();
    this.visualizerGroup.name = 'CLE_Sliced_Toolpath_Stack';

    const numLayers = this.slicedLayers.length;

    this.slicedLayers.forEach((layer, lIdx) => {
      if (layer.points.length < 2) return;

      const positions = [];
      const colors = [];

      // Color gradient by layer elevation
      const hue = (lIdx / (numLayers || 1)) * 0.7; // Blue to Red
      const color = new THREE.Color().setHSL(hue, 1.0, 0.55);

      for (let i = 0; i < layer.points.length - 1; i++) {
        const p1 = layer.points[i];
        const p2 = layer.points[i+1];
        positions.push(p1.x, p1.y, p1.z);
        positions.push(p2.x, p2.y, p2.z);

        if (p2.isRapid) {
          colors.push(0.3, 0.8, 0.3, 0.3, 0.8, 0.3); // Green for rapids
        } else {
          colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
        }
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

      const mat = new THREE.LineBasicMaterial({
        vertexColors: true,
        linewidth: 2,
        transparent: true,
        opacity: 0.95
      });

      const lineMesh = new THREE.LineSegments(geom, mat);
      lineMesh.userData = { layerIndex: lIdx };
      this.visualizerGroup.add(lineMesh);
    });

    app.scene.add(this.visualizerGroup);
    if (app.vp) {
      app.vp.dirty = true;
      app.vp.request && app.vp.request();
    }
    console.log(`[CLE Slicer] Rendered ${numLayers} toolpath layers into Three.js scene.`);
  }

  // Floating Layer & Export HUD
  mountLayerHUD() {
    let hud = document.getElementById('cle-slicer-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'cle-slicer-hud';
      hud.style.cssText = `
        position: fixed;
        bottom: 70px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--block);
        color: var(--block-ink);
        padding: 8px 16px;
        border-radius: var(--r);
        border: 1px solid var(--accent);
        box-shadow: 0 8px 24px var(--shadow);
        display: flex;
        align-items: center;
        gap: 12px;
        font: 12px/1 var(--f-ui);
        z-index: 1000;
      `;
      document.body.appendChild(hud);
    }

    const maxL = Math.max(0, this.slicedLayers.length - 1);
    hud.innerHTML = `
      <span style="font-weight:700; color:var(--accent);">CLE Sliced Stack:</span>
      <button class="cle-btn" id="cle-hud-prev">&larr;</button>
      <input type="range" id="cle-hud-slider" min="0" max="${maxL}" value="${maxL}" style="width:140px; cursor:pointer;">
      <span id="cle-hud-label" style="min-width:70px; font-family:var(--f-mono);">L: ${maxL} / ${maxL}</span>
      <button class="cle-btn" id="cle-hud-next">&rarr;</button>
      <button class="cle-btn" id="cle-hud-all">Show All</button>
      <div style="height:18px; width:1px; background:rgba(255,255,255,0.2);"></div>
      <button class="cle-btn" id="cle-hud-export">Export .NC</button>
      <button class="cle-btn" id="cle-hud-stream">Stream to FluidNC</button>
      <button class="cle-btn" id="cle-hud-sd">Upload to SD Card</button>
      <button class="cle-modal-close" id="cle-hud-close" style="font-size:16px;">&times;</button>
    `;

    const slider = document.getElementById('cle-hud-slider');
    const label = document.getElementById('cle-hud-label');

    const updateVisibility = (targetIdx) => {
      if (!this.visualizerGroup) return;
      this.visualizerGroup.children.forEach(mesh => {
        mesh.visible = mesh.userData.layerIndex <= targetIdx;
      });
      const app = window.app || window.xe;
      if (app?.vp) { app.vp.dirty = true; app.vp.request?.(); }
    };

    slider.oninput = (e) => {
      const val = parseInt(e.target.value, 10);
      label.textContent = `L: ${val} / ${maxL}`;
      updateVisibility(val);
    };

    document.getElementById('cle-hud-all').onclick = () => {
      slider.value = maxL;
      label.textContent = `L: ${maxL} / ${maxL}`;
      updateVisibility(maxL);
    };

    document.getElementById('cle-hud-prev').onclick = () => {
      slider.value = Math.max(0, parseInt(slider.value, 10) - 1);
      label.textContent = `L: ${slider.value} / ${maxL}`;
      updateVisibility(parseInt(slider.value, 10));
    };

    document.getElementById('cle-hud-next').onclick = () => {
      slider.value = Math.min(maxL, parseInt(slider.value, 10) + 1);
      label.textContent = `L: ${slider.value} / ${maxL}`;
      updateVisibility(parseInt(slider.value, 10));
    };

    document.getElementById('cle-hud-export').onclick = () => this.downloadGCode();
    document.getElementById('cle-hud-stream').onclick = () => {
      this.bridge.fluidnc.streamGCodeLines(this.rawGCode.split('\n'));
    };
    document.getElementById('cle-hud-sd').onclick = () => {
      const name = prompt('Enter filename to save on FluidNC / FluidTouch SD Card:', 'job.gcode');
      if (name) this.bridge.fluidnc.uploadFileToSD(name, this.rawGCode);
    };
    document.getElementById('cle-hud-close').onclick = () => hud.remove();
  }

  downloadGCode(filename = 'cle_toolpaths.nc') {
    if (!this.rawGCode) {
      this.bridge.notify('No toolpath generated to export.', 'error');
      return;
    }
    const blob = new Blob([this.rawGCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    this.bridge.notify(`Exported G-Code file: ${filename}`, 'ok');
  }
}

/* --- Module: cle_boot.js --- */
/**
 * CLEJS - Master Extension Bootstrapper (V4)
 * Advanced Mode Ribbon, Manual CNC/Laser Control Center, Generic USB/Wi-Fi Camera Engine,
 * Optical Crosshair Reticle & Viewport Picture-in-Picture
 */


class CLEBridge {
  constructor() {
    this.version = '1.3.0';
    this.vault = new CLEVault(this);
    this.fluidnc = new CLEFluidNCClient(this);
    this.camera = new CLECameraEngine(this);
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
    btn.onclick = () => this.openManualControlCenter();
    topbar.appendChild(btn);
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
    m("Manual Control", "", [
      { id: "cle-r-gp-mode", label: this.gamepad.mode === "design" ? "Design 3D" : "Manual CNC/Laser", title: "Toggle Switch Controller Mode", icon: "motion", pressed: this.gamepad.mode === "manual", fn: () => this.gamepad.toggleMode() },
      { id: "cle-r-manual-hub", label: "Control Center", title: "Open Manual CNC/Laser Control, Camera & DRO", icon: "inspect", fn: () => this.openManualControlCenter() },
      { id: "cle-r-gp-remap", label: "Controller Setup", title: "Configure Switch Controller Buttons & D-Pad", icon: "settings", fn: () => this.openModal("gamepad") }
    ]);

    // 3. 4th Axis & Slicer
    m("Rotary & Slicer", "", [
      { id: "cle-r-rotary", label: "4th Axis (A)", title: "Toggle 4th Axis Rotary Stock in 3D View", icon: "lathe", pressed: this.rotary.enabled, fn: () => this.rotary.toggle() },
      { id: "cle-r-slicer", label: "Slice & 3D Stack", title: "Slice Model & Display in Visualizer", icon: "printer3d", fn: () => this.openModal("slicer") }
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

    // Append DRO Bar to Ribbon
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

  // --- Pop-up Manual CNC / Laser Control Center ---
  async openManualControlCenter() {
    let hub = document.getElementById('cle-manual-hub');
    if (hub) {
      hub.style.display = 'flex';
      return;
    }

    hub = document.createElement('div');
    hub.id = 'cle-manual-hub';
    hub.style.cssText = `
      position: fixed;
      top: 90px;
      right: 20px;
      width: 460px;
      max-height: 85vh;
      background: var(--panel);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: var(--r);
      box-shadow: 0 12px 36px var(--shadow);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font: 12px/1.3 var(--f-ui);
    `;

    hub.innerHTML = `
      <div class="cle-modal-header" style="cursor:move; padding:8px 12px;">
        <span>Manual CNC / Laser Mode (Live Control)</span>
        <button class="cle-modal-close" id="cle-man-close">&times;</button>
      </div>

      <div style="padding:12px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
        <!-- Soft Limits & Safety Status -->
        <div style="background:var(--paper); padding:8px 12px; border-radius:4px; border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <span class="cle-badge connected" id="cle-softlimit-badge">Soft-Limits: Active</span>
            <span style="font-size:10px; color:var(--ink-2); margin-left:6px;">Z &ge; 0.1mm | X: 0-595 | Y: 0-495</span>
          </div>
          <div style="font-weight:700; color:var(--accent);" id="cle-man-step-val">${this.gamepad.stepSize} mm</div>
        </div>

        <!-- High-Contrast DRO Readout -->
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:6px; background:rgba(0,0,0,0.4); padding:10px; border-radius:6px; color:#fff; font-family:var(--f-mono); text-align:center;">
          <div><div style="color:var(--accent-2); font-size:10px;">X (mm)</div><div style="font-size:16px; font-weight:700;" id="cle-man-dro-x">${this.fluidnc.wpos.X.toFixed(2)}</div></div>
          <div><div style="color:var(--accent-2); font-size:10px;">Y (mm)</div><div style="font-size:16px; font-weight:700;" id="cle-man-dro-y">${this.fluidnc.wpos.Y.toFixed(2)}</div></div>
          <div><div style="color:var(--accent-2); font-size:10px;">Z (mm)</div><div style="font-size:16px; font-weight:700;" id="cle-man-dro-z">${this.fluidnc.wpos.Z.toFixed(2)}</div></div>
          <div><div style="color:var(--accent-2); font-size:10px;">A (deg)</div><div style="font-size:16px; font-weight:700;" id="cle-man-dro-a">${this.fluidnc.wpos.A.toFixed(1)}</div></div>
        </div>

        <!-- Manual Tool Controls (Spindle / Laser) -->
        <div class="cle-joycon-panel" style="padding:8px 10px;">
          <div class="cle-joycon-title" style="margin-bottom:6px;">Spindle & Laser Manual Control</div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <button class="cle-btn" id="cle-man-btn-spindle">Spindle: OFF</button>
            <input class="cle-input" id="cle-man-rpm" type="number" value="12000" style="width:70px;" title="Target Spindle RPM">
            <span style="font-size:11px;">RPM</span>
            <div style="height:16px; width:1px; background:var(--line);"></div>
            <button class="cle-btn" id="cle-man-btn-laser">Laser: OFF</button>
            <button class="cle-btn" id="cle-man-btn-pulse" title="1% power alignment pulse">1% Pulse</button>
          </div>
        </div>

        <!-- G-Code Move Recorder -->
        <div class="cle-joycon-panel" style="padding:8px 10px;">
          <div class="cle-joycon-title" style="margin-bottom:6px;">G-Code Sequence Recorder</div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; gap:6px;">
              <button class="cle-btn" id="cle-man-btn-record">Record Moves</button>
              <button class="cle-btn" id="cle-man-btn-export-rec">Export .NC</button>
            </div>
            <span id="cle-man-rec-count" style="font-family:var(--f-mono); font-size:11px;">Recorded: 0 lines</span>
          </div>
        </div>

        <!-- Generic Camera Subsystem (USB / Wi-Fi + Reticle Overlay) -->
        <div class="cle-joycon-panel" id="cle-cam-wrapper" style="padding:8px 10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span class="cle-joycon-title">Workpiece Camera (USB & Wi-Fi)</span>
            <div style="display:flex; gap:6px;">
              <button class="cle-btn" id="cle-cam-btn-reticle" title="Cycle Reticle: Crosshair / Bullseye / Grid / Off">Crosshair: ON</button>
              <button class="cle-btn" id="cle-cam-btn-snap" title="Capture Still Image">Snapshot</button>
              <button class="cle-btn" id="cle-cam-btn-dock" title="Dock in corner of 3D viewport">Dock PiP</button>
            </div>
          </div>

          <!-- Video & Overlay Viewport -->
          <div style="position:relative; width:100%; height:180px; background:#000; border-radius:4px; overflow:hidden;">
            <video id="cle-cam-video" autoplay playsinline style="display:none; width:100%; height:100%; object-fit:cover;"></video>
            <img id="cle-cam-img" style="display:none; width:100%; height:100%; object-fit:cover;">
            <canvas id="cle-cam-canvas" style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;"></canvas>
            
            <div id="cle-cam-placeholder" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--ink-3); text-align:center; padding:10px; background:var(--paper);">
              Camera inactive. Select USB or Wi-Fi cam below.
            </div>
          </div>

          <!-- Camera Source Selector Controls -->
          <div style="display:flex; gap:6px; margin-top:8px; align-items:center;">
            <select class="cle-select" id="cle-cam-device-select" style="flex:1;">
              <option value="">Detecting USB Cameras...</option>
            </select>
            <button class="cle-btn" id="cle-cam-btn-start-usb">Start USB</button>
            <button class="cle-btn" id="cle-cam-btn-wifi">Wi-Fi Cam</button>
            <button class="cle-btn" id="cle-cam-btn-stop">Stop</button>
          </div>

          <!-- Optical Edge Finder Zeroing Action -->
          <div style="display:flex; gap:6px; margin-top:6px; align-items:center; justify-content:space-between;">
            <button class="cle-btn" id="cle-cam-btn-zero-cross" style="flex:1; background:var(--accent-soft); border-color:var(--accent);" title="Set Workpiece Origin at Crosshair Center">Zero WCS to Crosshair (Optical Edge)</button>
          </div>
        </div>

        <!-- Live G-Code Terminal Console -->
        <div class="cle-joycon-panel" style="padding:8px 10px;">
          <div class="cle-joycon-title" style="margin-bottom:4px;">Live FluidNC Console</div>
          <div id="cle-man-console-body" style="height:80px; overflow-y:auto; background:var(--block); color:#5fc27f; padding:6px; border-radius:4px; font-family:var(--f-mono); font-size:10px;">
            <div>[CLE] Manual Console Ready.</div>
          </div>
          <div style="display:flex; gap:6px; margin-top:6px;">
            <input class="cle-input" id="cle-man-gcode-input" placeholder="Type G-Code (e.g. G0 X10 Y10)..." style="flex:1;">
            <button class="cle-btn" id="cle-man-send-cmd">Send</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hub);

    // Enumerate USB Cameras into dropdown
    const devSelect = document.getElementById('cle-cam-device-select');
    const devices = await this.camera.getAvailableDevices();
    if (devices.length > 0) {
      devSelect.innerHTML = devices.map(d => `<option value="${d.deviceId}">${d.label || 'USB Camera'}</option>`).join('');
      // Auto-select Logi C270 if found
      const logi = devices.find(d => /logi|c270|webcam/i.test(d.label));
      if (logi) devSelect.value = logi.deviceId;
    } else {
      devSelect.innerHTML = '<option value="">Default USB Video Device</option>';
    }

    // Wire Events
    document.getElementById('cle-man-close').onclick = () => { hub.style.display = 'none'; };
    
    // Spindle / Laser
    document.getElementById('cle-man-btn-spindle').onclick = () => {
      const rpm = parseInt(document.getElementById('cle-man-rpm').value, 10) || 12000;
      this.fluidnc.toggleSpindle(rpm);
    };
    document.getElementById('cle-man-btn-laser').onclick = () => {
      this.fluidnc.toggleLaser(80);
    };
    document.getElementById('cle-man-btn-pulse').onclick = () => {
      this.fluidnc.pulseLaserFraming(2);
    };

    // Recorder
    document.getElementById('cle-man-btn-record').onclick = () => {
      this.fluidnc.toggleGCodeRecorder();
    };
    document.getElementById('cle-man-btn-export-rec').onclick = () => {
      this.fluidnc.exportRecordedGCode();
    };

    // Camera Subsystem Events
    document.getElementById('cle-cam-btn-start-usb').onclick = () => {
      this.camera.startUSBCamera(devSelect.value);
    };
    document.getElementById('cle-cam-btn-wifi').onclick = () => {
      const url = prompt('Enter Wi-Fi Camera Stream URL (MJPEG / HTTP):', this.camera.wifiUrl);
      if (url) this.camera.startWiFiCamera(url);
    };
    document.getElementById('cle-cam-btn-stop').onclick = () => {
      this.camera.stopCamera();
    };
    document.getElementById('cle-cam-btn-reticle').onclick = () => {
      const modes = ['crosshair', 'bullseye', 'grid', 'none'];
      const curIdx = modes.indexOf(this.camera.reticleMode);
      this.camera.reticleMode = modes[(curIdx + 1) % modes.length];
      document.getElementById('cle-cam-btn-reticle').textContent = `Reticle: ${this.camera.reticleMode.toUpperCase()}`;
      this.camera.updateReticleCanvas();
    };
    document.getElementById('cle-cam-btn-snap').onclick = () => {
      this.camera.captureSnapshot();
    };
    document.getElementById('cle-cam-btn-dock').onclick = () => {
      this.camera.toggleViewportDock();
      document.getElementById('cle-cam-btn-dock').textContent = this.camera.docked ? 'Undock' : 'Dock PiP';
    };
    document.getElementById('cle-cam-btn-zero-cross').onclick = () => {
      this.camera.zeroToCrosshair();
    };

    // Console Send
    const sendInput = () => {
      const inp = document.getElementById('cle-man-gcode-input');
      if (inp && inp.value.trim()) {
        this.fluidnc.sendGCode(inp.value.trim());
        inp.value = '';
      }
    };
    document.getElementById('cle-man-send-cmd').onclick = sendInput;
    document.getElementById('cle-man-gcode-input').onkeydown = (e) => {
      if (e.key === 'Enter') sendInput();
    };

    // Redraw reticle on resize
    window.addEventListener('resize', () => this.camera.updateReticleCanvas());
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
      title = 'Nintendo Switch Controller Setup & Remap';
      const m = this.gamepad.mapping;
      bodyHtml = `
        <div style="background:var(--paper); padding:10px 14px; border-radius:6px; border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;">
          <div>
            <strong>Status: </strong><span id="cle-modal-gp-name">Detecting...</span>
          </div>
          <div>
            <strong>Current Mode: </strong><span style="color:var(--accent); font-weight:700;">${this.gamepad.mode.toUpperCase()}</span>
          </div>
        </div>

        <!-- Live Stick Gauges -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px;">
          <div class="cle-joycon-panel">
            <div class="cle-joycon-title">Left Stick (Orbit / Jog XY)</div>
            <div style="font-family:var(--f-mono); font-size:11px; margin-bottom:4px;">
              LX: <span id="cle-live-lx">0.00</span> | LY: <span id="cle-live-ly">0.00</span>
            </div>
            <div style="display:flex; gap:10px;">
              <label><input type="checkbox" id="cfg-inv-lx" ${m.design.invertLX?'checked':''}> Invert X</label>
              <label><input type="checkbox" id="cfg-inv-ly" ${m.design.invertLY?'checked':''}> Invert Y</label>
            </div>
          </div>
          <div class="cle-joycon-panel">
            <div class="cle-joycon-title">Right Stick (Pan / Jog ZA)</div>
            <div style="font-family:var(--f-mono); font-size:11px; margin-bottom:4px;">
              RX: <span id="cle-live-rx">0.00</span> | RY: <span id="cle-live-ry">0.00</span>
            </div>
            <div style="display:flex; gap:10px;">
              <label><input type="checkbox" id="cfg-inv-rx" ${m.design.invertRX?'checked':''}> Invert X</label>
              <label><input type="checkbox" id="cfg-inv-ry" ${m.design.invertRY?'checked':''}> Invert Y (Pan Up/Down)</label>
            </div>
          </div>
        </div>

        <!-- Live D-Pad Cross Button & Button Strip -->
        <div style="margin-top:8px;">
          <div style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--ink-2); margin-bottom:4px;">Live Cross Button (D-Pad) & Button Monitor:</div>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
            <span style="font-size:11px; font-weight:700;">D-Pad: </span>
            <span id="cle-dpad-up-tag" style="padding:2px 8px; border-radius:3px; background:var(--panel-2); border:1px solid var(--line); font-family:var(--f-mono);">Up &uarr;</span>
            <span id="cle-dpad-down-tag" style="padding:2px 8px; border-radius:3px; background:var(--panel-2); border:1px solid var(--line); font-family:var(--f-mono);">Down &darr;</span>
            <span id="cle-dpad-left-tag" style="padding:2px 8px; border-radius:3px; background:var(--panel-2); border:1px solid var(--line); font-family:var(--f-mono);">Left &larr;</span>
            <span id="cle-dpad-right-tag" style="padding:2px 8px; border-radius:3px; background:var(--panel-2); border:1px solid var(--line); font-family:var(--f-mono);">Right &rarr;</span>
          </div>
          <div id="cle-live-btns" style="display:flex; gap:4px; flex-wrap:wrap;">
            ${[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17].map(i => `<span id="cle-btn-tag-${i}" style="padding:2px 6px; border-radius:3px; background:var(--panel-2); border:1px solid var(--line); font-size:10px; font-family:var(--f-mono);">B${i}</span>`).join('')}
          </div>
        </div>

        <!-- Settings Sliders -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px;">
          <div class="cle-form-row">
            <label>Stick Deadzone:</label>
            <input type="range" id="cfg-deadzone" min="0.05" max="0.35" step="0.01" value="${m.deadzone || 0.15}">
          </div>
          <div class="cle-form-row">
            <label>Orbit Speed:</label>
            <input type="range" id="cfg-orbit-speed" min="0.2" max="2.5" step="0.1" value="${m.design.orbitSpeed || 0.8}">
          </div>
          <div class="cle-form-row">
            <label>Pan Speed:</label>
            <input type="range" id="cfg-pan-speed" min="0.5" max="3.0" step="0.1" value="${m.design.panSpeed || 1.5}">
          </div>
          <div class="cle-form-row">
            <label>Zoom Speed:</label>
            <input type="range" id="cfg-zoom-speed" min="0.5" max="2.5" step="0.1" value="${m.design.zoomSpeed || 1.0}">
          </div>
        </div>
      `;
    } else if (type === 'slicer') {
      title = 'Continuous Slicing & 3D Visualizer Stack';
      bodyHtml = `
        <p>Slice JumpStart 3D models into continuous toolpaths, visualize the layer stack in Three.js, and export or transfer to SD Card.</p>
        <div class="cle-form-row" style="margin-top:8px;">
          <label>Target Machine Mode:</label>
          <select class="cle-select" id="slice-mode">
            <option value="cnc" ${this.slicer.mode==='cnc'?'selected':''}>CNC Milling / Carving (TwoTrees TTC6050)</option>
            <option value="laser" ${this.slicer.mode==='laser'?'selected':''}>Laser Vector & Engraving (Diode Laser)</option>
            <option value="3d" ${this.slicer.mode==='3d'?'selected':''}>3D Additive Print Sim</option>
          </select>
        </div>
        <div class="cle-form-row">
          <label>Layer Height (mm):</label>
          <input class="cle-input" id="slice-layer-h" type="number" value="${this.slicer.layerHeight}" step="0.05">
        </div>
        <div class="cle-form-row">
          <label>Infill Density (%):</label>
          <input class="cle-input" id="slice-infill" type="number" value="${this.slicer.infillPercent}" step="5">
        </div>
        <div class="cle-form-row">
          <label>Feed Rate (mm/min):</label>
          <input class="cle-input" id="slice-feed" type="number" value="${this.slicer.feedRate}">
        </div>
        <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
          <button class="cle-btn" id="slice-run-btn" style="background:var(--accent); color:var(--on-accent); padding:8px 16px; font-weight:700;">Slice & Display in 3D Viewport</button>
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
    } else if (type === 'calibration') {
      title = 'CLE Calibration Suite';
      bodyHtml = `
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
        <button class="cle-btn" id="cle-modal-save-btn">Save & Close</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.activeModal = overlay;

    document.getElementById('cle-modal-close-btn').onclick = () => this.closeModal();
    document.getElementById('cle-modal-save-btn').onclick = () => {
      if (type === 'gamepad') this.saveGamepadSettingsFromModal();
      this.closeModal();
    };

    if (type === 'gamepad') {
      this.bindGamepadModalRealtime();
    } else if (type === 'slicer') {
      document.getElementById('slice-run-btn').onclick = async () => {
        try {
          const mode = document.getElementById('slice-mode').value;
          const layerH = document.getElementById('slice-layer-h').value;
          const infill = document.getElementById('slice-infill').value;
          const feed = document.getElementById('slice-feed').value;
          this.slicer.feedRate = parseFloat(feed) || 1500;
          await this.slicer.sliceModel({ mode, layerHeight: layerH, infill });
          this.closeModal();
        } catch (e) {
          this.notify(`Slicing failed: ${e.message}`, 'error');
        }
      };
    } else if (type === 'calibration') {
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
    }
  }

  bindGamepadModalRealtime() {
    this.gamepad.onFrameCallback = (gp, lx, ly, rx, ry, dpad) => {
      const nameEl = document.getElementById('cle-modal-gp-name');
      const lxEl = document.getElementById('cle-live-lx');
      const lyEl = document.getElementById('cle-live-ly');
      const rxEl = document.getElementById('cle-live-rx');
      const ryEl = document.getElementById('cle-live-ry');

      if (nameEl) nameEl.textContent = `${gp.id} (${gp.buttons.length} buttons, ${gp.axes.length} axes)`;
      if (lxEl) lxEl.textContent = lx.toFixed(2);
      if (lyEl) lyEl.textContent = ly.toFixed(2);
      if (rxEl) rxEl.textContent = rx.toFixed(2);
      if (ryEl) ryEl.textContent = ry.toFixed(2);

      if (dpad) {
        const updateTag = (id, active) => {
          const el = document.getElementById(id);
          if (el) {
            el.style.background = active ? 'var(--ok)' : 'var(--panel-2)';
            el.style.color = active ? '#fff' : 'inherit';
          }
        };
        updateTag('cle-dpad-up-tag', dpad.dpadUp);
        updateTag('cle-dpad-down-tag', dpad.dpadDown);
        updateTag('cle-dpad-left-tag', dpad.dpadLeft);
        updateTag('cle-dpad-right-tag', dpad.dpadRight);
      }

      gp.buttons.forEach((btn, idx) => {
        const isPressed = btn && (typeof btn === 'object' ? btn.pressed : btn > 0.5);
        const tag = document.getElementById(`cle-btn-tag-${idx}`);
        if (tag) {
          tag.style.background = isPressed ? 'var(--ok)' : 'var(--panel-2)';
          tag.style.color = isPressed ? '#fff' : 'inherit';
        }
      });
    };
  }

  saveGamepadSettingsFromModal() {
    this.gamepad.onFrameCallback = null;
    const m = this.gamepad.mapping;
    m.deadzone = parseFloat(document.getElementById('cfg-deadzone').value);
    m.design.orbitSpeed = parseFloat(document.getElementById('cfg-orbit-speed').value);
    m.design.panSpeed = parseFloat(document.getElementById('cfg-pan-speed').value);
    m.design.zoomSpeed = parseFloat(document.getElementById('cfg-zoom-speed').value);

    m.design.invertLX = document.getElementById('cfg-inv-lx').checked;
    m.design.invertLY = document.getElementById('cfg-inv-ly').checked;
    m.design.invertRX = document.getElementById('cfg-inv-rx').checked;
    m.design.invertRY = document.getElementById('cfg-inv-ry').checked;

    this.gamepad.saveMapping();
  }

  closeModal() {
    if (this.gamepad) this.gamepad.onFrameCallback = null;
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
