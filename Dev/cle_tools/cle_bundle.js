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
 * CLEJS - Nintendo Switch Gamepad Subsystem (V4)
 * Full Manual CNC/Laser Control, Viewport 3D Orbit & Pan with D-Pad Hat Support,
 * Configurable Remapping Table, and Vault Profile Storage
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
    this.remapListeningAction = null; // Currently listening for button/axis press

    this.mapping = this.loadMapping();
    this.initListeners();
    this.startPolling();
  }

  loadMapping() {
    const defaultMap = {
      profileName: 'Nintendo Switch Pro',
      deadzone: 0.15,
      axes: {
        lx: 0,
        ly: 1,
        rx: 2,
        ry: 3, // Automatically falls back to 5 if 3 is idle
        ryAlt: 5
      },
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

  saveMapping(profileName = this.mapping.profileName) {
    try {
      this.mapping.profileName = profileName;
      localStorage.setItem('cle.gamepad.mapping', JSON.stringify(this.mapping));
      this.bridge.notify(`Gamepad configuration saved (${profileName}).`, 'ok');
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
      const span = ribbonBtn.querySelector('span');
      if (span) span.textContent = this.mode === 'design' ? 'Design 3D' : 'Manual CNC/Laser';
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

    // Read Left Stick
    const lxIdx = this.mapping.axes?.lx ?? 0;
    const lyIdx = this.mapping.axes?.ly ?? 1;
    const lx = this.applyDeadzone(gp.axes[lxIdx] || 0);
    const ly = this.applyDeadzone(gp.axes[lyIdx] || 0);

    // Read Right Stick (with intelligent auto-fallback for Axis 3 vs Axis 5 on Switch controllers)
    const rxIdx = this.mapping.axes?.rx ?? 2;
    let ryIdx = this.mapping.axes?.ry ?? 3;
    
    let rawRY = gp.axes[ryIdx] || 0;
    // Auto-fallback: if configured axis is silent but axis 5 has clear input, use axis 5
    if (Math.abs(rawRY) < 0.05 && gp.axes.length > 5 && Math.abs(gp.axes[5] || 0) > 0.12) {
      ryIdx = 5;
      rawRY = gp.axes[5];
    } else if (Math.abs(rawRY) < 0.05 && gp.axes.length > 4 && Math.abs(gp.axes[4] || 0) > 0.12) {
      ryIdx = 4;
      rawRY = gp.axes[4];
    }

    const rx = this.applyDeadzone(gp.axes[rxIdx] || 0);
    const ry = this.applyDeadzone(rawRY);

    // Read D-Pad cross button (strictly 1 active direction at a time, no axis cross-talk)
    const dpad = this.getDpadState(gp);

    // Interactive remap check if active
    if (this.remapListeningAction) {
      this.checkRemapInput(gp);
    }

    if (this.onFrameCallback) {
      this.onFrameCallback(gp, lx, ly, rx, ry, dpad);
    }

    // Plus (+) Button: Toggle Design / Manual CNC/Laser Mode
    const modeToggleBtn = this.mapping.buttons.toggleMode ?? 9;
    if (this.isJustPressed(gp, modeToggleBtn)) {
      this.toggleMode();
    }

    if (this.mode === 'design') {
      this.processDesignMode(lx, ly, rx, ry, gp, dpad);
    } else {
      this.processManualMode(lx, ly, rx, ry, gp, dpad);
    }
  }

  // D-Pad cluster cross: enforces clean, single-direction activation
  getDpadState(gp) {
    const upIdx = this.mapping.buttons?.dpadUp ?? 12;
    const downIdx = this.mapping.buttons?.dpadDown ?? 13;
    const leftIdx = this.mapping.buttons?.dpadLeft ?? 14;
    const rightIdx = this.mapping.buttons?.dpadRight ?? 15;

    const bUp = gp.buttons[upIdx] && (gp.buttons[upIdx].pressed || gp.buttons[upIdx].value > 0.5);
    const bDown = gp.buttons[downIdx] && (gp.buttons[downIdx].pressed || gp.buttons[downIdx].value > 0.5);
    const bLeft = gp.buttons[leftIdx] && (gp.buttons[leftIdx].pressed || gp.buttons[leftIdx].value > 0.5);
    const bRight = gp.buttons[rightIdx] && (gp.buttons[rightIdx].pressed || gp.buttons[rightIdx].value > 0.5);

    // Mutually exclusive single-active cross button
    let dpadUp = false, dpadDown = false, dpadLeft = false, dpadRight = false;
    if (bUp && !bDown) dpadUp = true;
    else if (bDown && !bUp) dpadDown = true;
    else if (bLeft && !bRight) dpadLeft = true;
    else if (bRight && !bLeft) dpadRight = true;

    return { dpadUp, dpadDown, dpadLeft, dpadRight };
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
      const orbitSpeed = (this.mapping.design.orbitSpeed || 0.8) * 0.04;
      const azDelta = (this.mapping.design.invertLX ? -lx : lx) * orbitSpeed;
      const elDelta = (this.mapping.design.invertLY ? -ly : ly) * orbitSpeed;

      app.vp.view.az += azDelta;
      app.vp.view.el = Math.max(-1.55, Math.min(1.55, app.vp.view.el - elDelta));
      needsUpdate = true;
    }

    // 2. Right Stick: Smooth Viewport Panning (Left/Right AND Up/Down)
    if (Math.abs(rx) > 0.02 || Math.abs(ry) > 0.02) {
      const panSpeed = (this.mapping.design.panSpeed || 1.5) * 8.0;
      // Invert sign: pushing UP (ry < 0) pans viewport UP (dy > 0)
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
      const factor = 1 + zoomDelta * 0.03 * (this.mapping.design.zoomSpeed || 1.0);
      app.vp.view.dist = Math.max(5, Math.min(50000, app.vp.view.dist * factor));
      needsUpdate = true;
    }

    // 4. D-Pad Cross: Instant Orthogonal View Snaps
    if (dpad.dpadUp && this.isJustPressed(gp, this.mapping.buttons.dpadUp)) {
      if (app.setView) app.setView('top');
      else { app.vp.view.az = 0; app.vp.view.el = Math.PI / 2; }
      needsUpdate = true;
    } else if (dpad.dpadDown && this.isJustPressed(gp, this.mapping.buttons.dpadDown)) {
      if (app.setView) app.setView('front');
      else { app.vp.view.az = 0; app.vp.view.el = 0; }
      needsUpdate = true;
    } else if (dpad.dpadLeft && this.isJustPressed(gp, this.mapping.buttons.dpadLeft)) {
      if (app.setView) app.setView('left');
      else { app.vp.view.az = -Math.PI / 2; app.vp.view.el = 0; }
      needsUpdate = true;
    } else if (dpad.dpadRight && this.isJustPressed(gp, this.mapping.buttons.dpadRight)) {
      if (app.setView) app.setView('right');
      else { app.vp.view.az = Math.PI / 2; app.vp.view.el = 0; }
      needsUpdate = true;
    }

    if (needsUpdate) {
      if (app.vp.updateCamera) app.vp.updateCamera();
      if (app.vp.request) app.vp.request();
    }
  }

  processManualMode(lx, ly, rx, ry, gp, dpad) {
    const fluid = this.bridge.fluidnc;
    if (!fluid || !fluid.isConnected) return;

    const now = performance.now();

    // 1. Button Actions
    const btns = this.mapping.buttons;

    if (this.isJustPressed(gp, btns.cycleAxis)) {
      const axes = ['Z', 'A', 'X', 'Y'];
      const curIdx = axes.indexOf(this.activeAxis);
      this.activeAxis = axes[(curIdx + 1) % axes.length];
      this.bridge.notify(`Active jog axis: ${this.activeAxis}`);
    }

    if (this.isJustPressed(gp, btns.zeroWCS)) {
      fluid.zeroAxis(this.activeAxis);
    }

    if (this.isJustPressed(gp, btns.feedHold)) {
      fluid.sendImmediate('!');
      this.bridge.notify('EMERGENCY FEED HOLD (!)', 'error');
    }

    if (this.isJustPressed(gp, btns.touchProbe)) {
      this.executeTouchProbe();
    }

    if (this.isJustPressed(gp, btns.spindleToggle)) {
      fluid.toggleSpindle();
    }

    if (this.isJustPressed(gp, btns.laserToggle)) {
      fluid.toggleLaser();
    }

    if (this.isJustPressed(gp, btns.macroRecord)) {
      fluid.toggleMacroRecording();
    }

    // 2. D-Pad Discrete Step Jogging
    if (dpad.dpadUp && this.isJustPressed(gp, btns.dpadUp)) {
      this.stepJog('Y', this.stepSize);
    } else if (dpad.dpadDown && this.isJustPressed(gp, btns.dpadDown)) {
      this.stepJog('Y', -this.stepSize);
    } else if (dpad.dpadLeft && this.isJustPressed(gp, btns.dpadLeft)) {
      this.stepJog('X', -this.stepSize);
    } else if (dpad.dpadRight && this.isJustPressed(gp, btns.dpadRight)) {
      this.stepJog('X', this.stepSize);
    }

    // 3. Proportional Analog Jogging (Throttled)
    if (now - this.lastJogTime < this.jogThrottleMs) return;

    let jogDistX = 0, jogDistY = 0, jogDistZ = 0, jogDistA = 0;
    const run = this.mapping.run;

    if (Math.abs(lx) > 0.05) jogDistX = (run.invertX ? -lx : lx) * (run.jogFeedXY / 60) * (this.jogThrottleMs / 1000);
    if (Math.abs(ly) > 0.05) jogDistY = (run.invertY ? ly : -ly) * (run.jogFeedXY / 60) * (this.jogThrottleMs / 1000);
    if (Math.abs(ry) > 0.05) jogDistZ = (run.invertZ ? ry : -ry) * (run.jogFeedZ / 60) * (this.jogThrottleMs / 1000);
    if (Math.abs(rx) > 0.05) jogDistA = (run.invertA ? -rx : rx) * (run.jogFeedA / 60) * (this.jogThrottleMs / 1000);

    if (jogDistX !== 0 || jogDistY !== 0 || jogDistZ !== 0 || jogDistA !== 0) {
      fluid.jogVectorClamped({ X: jogDistX, Y: jogDistY, Z: jogDistZ, A: jogDistA });
      this.lastJogTime = now;
    }
  }

  stepJog(axis, dist) {
    const fluid = this.bridge.fluidnc;
    if (!fluid || !fluid.isConnected) return;
    const vec = { X: 0, Y: 0, Z: 0, A: 0 };
    vec[axis] = dist;
    fluid.jogVectorClamped(vec);
  }

  executeTouchProbe() {
    const fluid = this.bridge.fluidnc;
    if (!fluid || !fluid.isConnected) {
      this.bridge.notify('Connect to FluidNC first.', 'error');
      return;
    }
    this.bridge.notify('Starting Z touch plate probe cycle (G38.2)...');
    fluid.sendGCode('G21 G91');
    fluid.sendGCode('G38.2 Z-25 F75');
    fluid.sendGCode('G92 Z15.0');
    fluid.sendGCode('G0 Z5 F500');
    fluid.sendGCode('G90');
    this.bridge.notify('Z probe completed. WCS Z set to 20.0mm', 'ok');
  }

  // Interactive remap listener
  startListeningForRemap(actionKey, callback) {
    this.remapListeningAction = { actionKey, callback };
  }

  stopListeningForRemap() {
    this.remapListeningAction = null;
  }

  checkRemapInput(gp) {
    // Check buttons
    for (let i = 0; i < gp.buttons.length; i++) {
      const b = gp.buttons[i];
      if (b && (b.pressed || b.value > 0.7)) {
        if (this.remapListeningAction) {
          const act = this.remapListeningAction;
          this.remapListeningAction = null;
          act.callback({ type: 'button', index: i });
          return;
        }
      }
    }
    // Check axes with deflection > 0.6
    for (let a = 0; a < gp.axes.length; a++) {
      if (Math.abs(gp.axes[a]) > 0.65) {
        if (this.remapListeningAction) {
          const act = this.remapListeningAction;
          this.remapListeningAction = null;
          act.callback({ type: 'axis', index: a });
          return;
        }
      }
    }
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
    this.detectedSettings = {};
    this.isQueryingSettings = false;
  }

  // Applies Machine Profile (Like LightBurn & MillMage Devices)
  applyMachineProfile(mach) {
    if (!mach) return;
    this.machineProfile = mach;
    const clX = mach.clearanceX || 5.0;
    const clY = mach.clearanceY || 5.0;
    this.softLimits.maxX = (mach.travelX || 600.0) - clX;
    this.softLimits.maxY = (mach.travelY || 500.0) - clY;
    this.softLimits.minZ = mach.safeLimitZ !== undefined ? mach.safeLimitZ : 0.1;
    this.softLimits.maxZ = mach.travelZ || 100.0;
    if (mach.spindleMaxRPM) this.spindleRPM = mach.spindleMaxRPM;
    if (mach.wifiIP) {
      this.ip = mach.wifiIP;
      localStorage.setItem('cle.fluidnc.ip', mach.wifiIP);
    }
  }

  // Read machine settings & type via G-code variables ($$ and $I)
  queryDeviceSettings() {
    if (!this.isConnected) {
      this.bridge.notify('Connect to FluidNC / machine first via USB or WiFi.', 'error');
      return;
    }
    this.detectedSettings = {};
    this.isQueryingSettings = true;
    this.bridge.notify('Querying machine parameters via G-code variables ($$, $I)...');
    this.sendImmediate('$I');
    this.sendImmediate('$$');
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
    if (this.isStreaming && this.bridge.recovery) {
      this.bridge.recovery.markJobHung(this.streamLineIndex, 'Connection to FluidNC disconnected unexpectedly.');
    }
    this.isStreaming = false;
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
        if (this.isQueryingSettings && Object.keys(this.detectedSettings).length > 2) {
          this.finishSettingsQuery();
        }
        if (this.isDumpingYaml && this.yamlDumpBuffer.length > 50) {
          this.isDumpingYaml = false;
          this.applyYamlCapabilityModel(this.yamlDumpBuffer, 'Flash ($Config/Dump)');
        }
      } else if (trimmed) {
        if (this.isDumpingYaml) {
          this.yamlDumpBuffer += line + '\n';
        }
        this.logConsole(`[RECV] ${trimmed}`);
        if (trimmed.startsWith('$') || trimmed.startsWith('[')) {
          this.parseDeviceSettingLine(trimmed);
        }
        if (trimmed.startsWith('error:')) {
          this.bridge.notify(`FluidNC ${trimmed}`, 'error');
        }
      }
    }
  }

  parseDeviceSettingLine(line) {
    const sMatch = line.match(/^\$(\d+)=([-\d.]+)/);
    if (sMatch) {
      const param = parseInt(sMatch[1], 10);
      const val = parseFloat(sMatch[2]);
      if (param === 130) this.detectedSettings.travelX = val;
      else if (param === 131) this.detectedSettings.travelY = val;
      else if (param === 132) this.detectedSettings.travelZ = val;
      else if (param === 100) this.detectedSettings.stepsX = val;
      else if (param === 101) this.detectedSettings.stepsY = val;
      else if (param === 102) this.detectedSettings.stepsZ = val;
      else if (param === 110) this.detectedSettings.maxRateX = val;
      else if (param === 111) this.detectedSettings.maxRateY = val;
      else if (param === 112) this.detectedSettings.maxRateZ = val;
      else if (param === 30) this.detectedSettings.spindleMaxRPM = val;
      else if (param === 32) this.detectedSettings.laserMode = (val === 1);
    }
    const verMatch = line.match(/\[VER:([^:]+):([^\]]+)\]/);
    if (verMatch) {
      this.detectedSettings.firmware = `${verMatch[2]} v${verMatch[1]}`;
    }
  }

  finishSettingsQuery() {
    this.isQueryingSettings = false;
    const d = this.detectedSettings;
    const curMach = this.bridge.vault.getActiveMachine();
    if (d.travelX) curMach.travelX = d.travelX;
    if (d.travelY) curMach.travelY = d.travelY;
    if (d.travelZ) curMach.travelZ = d.travelZ;
    if (d.maxRateXY) curMach.maxRateXY = d.maxRateXY;
    if (d.spindleMaxRPM) curMach.spindleMaxRPM = d.spindleMaxRPM;
    if (d.laserMode !== undefined) curMach.type = d.laserMode ? 'laser' : 'cnc';
    if (d.firmware) curMach.firmware = d.firmware;

    this.applyMachineProfile(curMach);
    this.bridge.vault.saveMachine(curMach);
    this.bridge.notify(`Auto-configured ${curMach.name} from G-code variables! Travel: ${curMach.travelX}x${curMach.travelY}mm, ${curMach.type.toUpperCase()}`, 'ok');
  }

  // --- Read Full Capability Model from FluidNC Flash config.yaml ---
  async requestConfigYaml() {
    this.bridge.notify('Requesting FluidNC flash config.yaml capability model...');
    
    // 1. Try HTTP fetch if connected over WiFi
    if (this.connectionType === 'websocket' || this.ip) {
      try {
        const resp = await fetch(`http://${this.ip}/files/config.yaml`);
        if (resp.ok) {
          const yaml = await resp.text();
          this.applyYamlCapabilityModel(yaml, 'Flash WiFi');
          return;
        }
      } catch (e) {}
      try {
        const resp2 = await fetch(`http://${this.ip}/config.yaml`);
        if (resp2.ok) {
          const yaml = await resp2.text();
          this.applyYamlCapabilityModel(yaml, 'Flash WiFi');
          return;
        }
      } catch (e) {}
    }

    // 2. Over Serial / WebSocket via $Config/Dump command
    if (this.isConnected) {
      this.yamlDumpBuffer = '';
      this.isDumpingYaml = true;
      this.sendImmediate('$Config/Dump');
      this.bridge.notify('Streaming config.yaml from controller ($Config/Dump)...');
      return;
    }

    this.bridge.notify('Connect to FluidNC first or click Import Local config.yaml.', 'error');
  }

  parseFluidNCYaml(yamlText) {
    const lines = yamlText.split('\n');
    let currentSection = '';
    let currentAxis = '';
    const data = {
      name: '',
      board: '',
      axes: {},
      laserMaxPwr: 1000,
      spindleMaxRPM: 12000
    };

    for (let raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('board:')) data.board = line.split(':')[1].trim();
      if (line.startsWith('name:')) data.name = line.split(':')[1].trim();

      if (line.startsWith('axes:')) { currentSection = 'axes'; continue; }
      if (line.startsWith('Laser:')) { currentSection = 'laser'; continue; }
      if (line.startsWith('pwm:')) { currentSection = 'pwm'; continue; }
      if (line.startsWith('probe:')) { currentSection = 'probe'; continue; }

      if (currentSection === 'axes') {
        const axMatch = line.match(/^([xyza]):$/i);
        if (axMatch) {
          currentAxis = axMatch[1].toLowerCase();
          data.axes[currentAxis] = {};
          continue;
        }
        if (currentAxis && line.includes(':')) {
          const [k, v] = line.split(':').map(s => s.trim());
          if (k === 'steps_per_mm') data.axes[currentAxis].stepsPerMm = parseFloat(v);
          if (k === 'max_rate_mm_per_min') data.axes[currentAxis].maxRate = parseFloat(v);
          if (k === 'max_travel_mm') data.axes[currentAxis].maxTravel = parseFloat(v);
        }
      }

      if (currentSection === 'laser' && line.includes('speed_map:')) {
        const m = line.match(/(\d+)=100/);
        if (m) data.laserMaxPwr = parseInt(m[1], 10);
      }

      if (currentSection === 'pwm' && line.includes('speed_map:')) {
        const m = line.match(/(\d+)=100/);
        if (m) data.spindleMaxRPM = parseInt(m[1], 10);
      }
    }
    return data;
  }

  applyYamlCapabilityModel(yamlText, source = 'Flash') {
    const parsed = this.parseFluidNCYaml(yamlText);
    const curMach = this.bridge.vault.getActiveMachine();
    
    if (parsed.name) curMach.name = parsed.name;
    if (parsed.axes.x?.maxTravel) curMach.travelX = parsed.axes.x.maxTravel;
    if (parsed.axes.y?.maxTravel) curMach.travelY = parsed.axes.y.maxTravel;
    if (parsed.axes.z?.maxTravel) curMach.travelZ = parsed.axes.z.maxTravel;
    if (parsed.axes.x?.maxRate) curMach.maxRateXY = parsed.axes.x.maxRate;
    if (parsed.spindleMaxRPM) curMach.spindleMaxRPM = parsed.spindleMaxRPM;
    if (parsed.laserMaxPwr) curMach.laserMaxPwr = parsed.laserMaxPwr;
    curMach.firmware = parsed.board ? `FluidNC (${parsed.board})` : 'FluidNC ESP32';

    this.applyMachineProfile(curMach);
    this.bridge.vault.saveMachine(curMach);
    this.bridge.notify(`Loaded full capability model from ${source} (${curMach.name})! Travels: ${curMach.travelX}x${curMach.travelY}x${curMach.travelZ}mm`, 'ok');
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

  streamGCode(gcodeText) {
    const lines = gcodeText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith(';'));
    this.sendQueue = [...lines];
    this.streamTotalLines = lines.length;
    this.streamLineIndex = 0;
    this.isStreaming = true;
    if (this.bridge.recovery) {
      this.bridge.recovery.startJob('FluidNC_Job', lines);
    }
    this.sendNextQueued();
  }

  streamGCodeLines(lines) {
    this.streamGCode(lines.join('\n'));
  }

  sendNextQueued() {
    if (this.sendQueue.length === 0) {
      this.isStreaming = false;
      this.bridge.notify('G-Code streaming complete', 'ok');
      return;
    }
    const next = this.sendQueue.shift();
    this.streamLineIndex++;
    if (this.bridge.recovery) {
      this.bridge.recovery.advanceLine(this.streamLineIndex, next);
    }
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
 * CLEJS - Vault Subsystem (V3 - MEAGCLE Architecture)
 * Design & Machine State Git Vault, Project Check-In / Version Recall,
 * User Controller Profiles, Tools, Materials, Feeds & Speeds, and Macros
 */

class CLEVault {
  constructor(bridge) {
    this.bridge = bridge;
    this.serverUrl = 'http://127.0.0.1:8765';
    this.storageKey = 'cle.vault.data';
    this.localSnapshotsKey = 'cle.vault.local_snapshots';
    this.data = this.loadVault();
  }

  // Current JumpStart Project Name
  getActiveProjectName() {
    const app = window.app || window.xe;
    const name = app?.doc?.name || document.title || 'JumpStart_Project';
    return name.replace(/[^\w\s-]/g, '').trim() || 'JumpStart_Project';
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
        { id: 'macro-probe', name: 'Probe Z (Touch Plate)', gcode: 'G21 G91\nG38.2 Z-30 F75\nG92 Z15.0\nG0 Z5' },
        { id: 'macro-park', name: 'Park Machine Rear', gcode: 'G21 G90\nG0 Z20 F800\nG0 X10 Y480 F4000' },
        { id: 'macro-laser-tick', name: 'Laser Alignment Pulse (1 sec, 5%)', gcode: 'M3 S50\nG4 P1\nM5' }
      ]
    };
  }

  loadVault() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('[CLE Vault] Error loading vault data:', e);
    }
    return this.getDefaults();
  }

  saveVault() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data, null, 2));
      this.syncToServer();
    } catch (e) {
      console.error('[CLE Vault] Error saving vault:', e);
    }
  }

  async syncToServer() {
    try {
      await fetch(`${this.serverUrl}/api/vault/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.data)
      });
    } catch {}
  }

  // --- MEAGCLE Design & Machine State Git Vault Engine ---

  async getVaultStatus(projectName = this.getActiveProjectName()) {
    try {
      const resp = await fetch(`${this.serverUrl}/api/vault/status?project=${encodeURIComponent(projectName)}`);
      if (resp.ok) return await resp.json();
    } catch (e) {
      // Offline fallback
    }
    return {
      status: 'offline',
      project_name: projectName,
      project_dir: `D:/CLEJS/vault/projects/${projectName}`,
      has_repo: false,
      git_available: false
    };
  }

  async getVaultHistory(projectName = this.getActiveProjectName(), query = '') {
    try {
      const resp = await fetch(`${this.serverUrl}/api/vault/history?project=${encodeURIComponent(projectName)}&query=${encodeURIComponent(query)}`);
      if (resp.ok) {
        const data = await resp.json();
        return data.history || [];
      }
    } catch (e) {
      // Offline fallback: check localStorage snapshots
    }
    return this.getLocalSnapshots(projectName, query);
  }

  async takeSnapshot(description, tags = []) {
    const projectName = this.getActiveProjectName();
    const app = window.app || window.xe;

    // Gather full project state
    const payloadData = {
      doc: app?.doc ? JSON.parse(JSON.stringify(app.doc)) : {},
      slicer: {
        mode: this.bridge.slicer?.mode,
        layerHeight: this.bridge.slicer?.layerHeight,
        infill: this.bridge.slicer?.infillPercent,
        feedRate: this.bridge.slicer?.feedRate,
        rawGCode: this.bridge.slicer?.rawGCode
      },
      profile: this.bridge.gamepad?.mapping,
      machine: {
        wpos: this.bridge.fluidnc?.wpos,
        softLimits: this.bridge.fluidnc?.softLimits
      },
      tags
    };

    // 1. Try Git Vault via CLE_server
    try {
      const resp = await fetch(`${this.serverUrl}/api/vault/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: projectName,
          description,
          tags,
          data: payloadData
        })
      });
      if (resp.ok) {
        const result = await resp.json();
        this.saveLocalSnapshot(projectName, description, payloadData, result.short_hash || 'HEAD');
        return result;
      }
    } catch (e) {
      // Server offline fallback
    }

    // 2. Offline fallback snapshot
    const fallbackHash = Math.random().toString(36).substring(2, 9);
    this.saveLocalSnapshot(projectName, description, payloadData, fallbackHash);
    return {
      status: 'ok',
      short_hash: fallbackHash,
      message: description,
      date: 'just now',
      offline: true
    };
  }

  async restoreSnapshot(commitHash) {
    const projectName = this.getActiveProjectName();
    let restoredData = null;

    // 1. Try server restore
    try {
      const resp = await fetch(`${this.serverUrl}/api/vault/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: projectName, commit_hash: commitHash })
      });
      if (resp.ok) {
        const result = await resp.json();
        restoredData = result.data;
      }
    } catch (e) {
      // Offline fallback
    }

    if (!restoredData) {
      restoredData = this.getLocalSnapshotData(projectName, commitHash);
    }

    if (!restoredData) {
      throw new Error(`Could not locate snapshot data for ${commitHash}`);
    }

    // Apply restored project state to JumpStart
    const app = window.app || window.xe;
    if (restoredData.doc && app?.doc) {
      try {
        // Restore document in JumpStart
        Object.assign(app.doc, restoredData.doc);
        if (app.refreshUI) app.refreshUI('load');
        if (app.vp?.request) app.vp.request();
      } catch (err) {
        console.warn('[CLE Vault] Document reload warning:', err);
      }
    }

    // Restore controller profile
    if (restoredData.profile && this.bridge.gamepad) {
      this.bridge.gamepad.mapping = restoredData.profile;
      this.bridge.gamepad.saveMapping();
    }

    // Restore slicer settings
    if (restoredData.slicer && this.bridge.slicer) {
      Object.assign(this.bridge.slicer, restoredData.slicer);
    }

    return { status: 'ok', restored_hash: commitHash };
  }

  // Local snapshot fallback helpers
  saveLocalSnapshot(projectName, desc, data, hash) {
    try {
      const raw = localStorage.getItem(this.localSnapshotsKey) || '{}';
      const store = JSON.parse(raw);
      if (!store[projectName]) store[projectName] = [];
      store[projectName].unshift({
        commit_hash: hash,
        short_hash: hash.substring(0, 7),
        author: 'CLE Operator',
        date: new Date().toLocaleTimeString(),
        message: desc,
        data
      });
      // Cap at 30 revisions
      if (store[projectName].length > 30) store[projectName].pop();
      localStorage.setItem(this.localSnapshotsKey, JSON.stringify(store));
    } catch {}
  }

  getLocalSnapshots(projectName, query = '') {
    try {
      const raw = localStorage.getItem(this.localSnapshotsKey) || '{}';
      const store = JSON.parse(raw);
      const list = store[projectName] || [];
      const q = query.toLowerCase();
      return list.filter(c => !q || c.message.toLowerCase().includes(q) || c.short_hash.toLowerCase().includes(q));
    } catch {
      return [];
    }
  }

  getLocalSnapshotData(projectName, hash) {
    try {
      const raw = localStorage.getItem(this.localSnapshotsKey) || '{}';
      const store = JSON.parse(raw);
      const list = store[projectName] || [];
      const item = list.find(c => c.commit_hash === hash || c.short_hash === hash);
      return item ? item.data : null;
    } catch {
      return null;
    }
  }

  // --- Controller User Profiles in CLE-Vault ---
  async saveControllerProfile(name, mapping) {
    try {
      await fetch(`${this.serverUrl}/api/vault/profile/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mapping })
      });
    } catch {}
    // Also save locally
    try {
      const savedProfiles = JSON.parse(localStorage.getItem('cle.vault.controller_profiles') || '{}');
      savedProfiles[name] = mapping;
      localStorage.setItem('cle.vault.controller_profiles', JSON.stringify(savedProfiles));
    } catch {}
    this.bridge.notify(`Profile "${name}" saved to CLE-Vault.`, 'ok');
  }

  async getControllerProfiles() {
    let profiles = [];
    try {
      const resp = await fetch(`${this.serverUrl}/api/vault/profiles`);
      if (resp.ok) {
        const data = await resp.json();
        profiles = data.profiles || [];
      }
    } catch {}
    
    // Merge local profiles
    try {
      const local = JSON.parse(localStorage.getItem('cle.vault.controller_profiles') || '{}');
      for (const [k, v] of Object.entries(local)) {
        if (!profiles.some(p => p.name === k)) {
          profiles.push({ name: k, profile: v });
        }
      }
    } catch {}
    return profiles;
  }

  // --- Devices & Machine Profiles (Like LightBurn & MillMage) ---
  getDefaultMachines() {
    return [
      {
        id: 'ttc6050_cnc',
        name: 'TwoTrees TTC6050 CNC (FluidNC)',
        type: 'cnc',
        travelX: 600,
        travelY: 500,
        travelZ: 100,
        travelA: 360,
        safeLimitZ: 0.1,
        clearanceX: 5.0,
        clearanceY: 5.0,
        maxRateXY: 5000,
        maxRateZ: 1000,
        maxRateA: 3000,
        spindleMaxRPM: 24000,
        laserMaxPwr: 1000,
        wifiIP: '192.168.1.150',
        firmware: 'FluidNC',
        notes: 'Main 600x500 CNC mill with ESP32 FluidNC + FluidTouch 7" screen'
      },
      {
        id: 'ttc6050_laser',
        name: 'TwoTrees 20W Diode Laser (FluidNC)',
        type: 'laser',
        travelX: 600,
        travelY: 500,
        travelZ: 100,
        travelA: 0,
        safeLimitZ: 0.1,
        clearanceX: 5.0,
        clearanceY: 5.0,
        maxRateXY: 8000,
        maxRateZ: 1000,
        maxRateA: 0,
        spindleMaxRPM: 0,
        laserMaxPwr: 1000,
        wifiIP: '192.168.1.150',
        firmware: 'FluidNC',
        notes: '20W Diode Laser Module with air assist'
      },
      {
        id: 'ttc6050_rotary',
        name: 'TwoTrees TTC6050 4-Axis Rotary (FluidNC)',
        type: 'rotary',
        travelX: 600,
        travelY: 100,
        travelZ: 100,
        travelA: 360,
        safeLimitZ: 0.1,
        clearanceX: 5.0,
        clearanceY: 5.0,
        maxRateXY: 3000,
        maxRateZ: 1000,
        maxRateA: 3000,
        spindleMaxRPM: 24000,
        laserMaxPwr: 0,
        wifiIP: '192.168.1.150',
        firmware: 'FluidNC',
        notes: 'Cylindrical 4th axis carving with 80mm chuck'
      }
    ];
  }

  getActiveMachine() {
    const list = this.getMachinesSync();
    const activeId = localStorage.getItem('cle.vault.active_machine_id');
    const found = list.find(m => m.id === activeId);
    return found || list[0] || this.getDefaultMachines()[0];
  }

  setActiveMachine(machineId) {
    const list = this.getMachinesSync();
    const found = list.find(m => m.id === machineId);
    if (!found) return;
    localStorage.setItem('cle.vault.active_machine_id', machineId);
    if (this.bridge.fluidnc) {
      this.bridge.fluidnc.applyMachineProfile(found);
    }
    this.bridge.machineName = found.name;
    this.bridge.notify(`Switched active machine to: ${found.name}`, 'ok');
  }

  getMachinesSync() {
    try {
      const raw = localStorage.getItem('cle.vault.machines');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return this.getDefaultMachines();
  }

  async getMachines() {
    let machines = [];
    try {
      const resp = await fetch(`${this.serverUrl}/api/vault/machines`);
      if (resp.ok) {
        const data = await resp.json();
        machines = data.machines || [];
      }
    } catch {}

    const localList = this.getMachinesSync();
    for (const m of localList) {
      if (!machines.some(x => x.id === m.id)) {
        machines.push(m);
      }
    }

    if (machines.length === 0) {
      machines = this.getDefaultMachines();
    }
    localStorage.setItem('cle.vault.machines', JSON.stringify(machines));
    return machines;
  }

  async saveMachine(machine) {
    if (!machine.id) {
      machine.id = 'mach_' + Date.now();
    }
    try {
      await fetch(`${this.serverUrl}/api/vault/machine/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine })
      });
    } catch {}

    const list = this.getMachinesSync().filter(m => m.id !== machine.id);
    list.push(machine);
    localStorage.setItem('cle.vault.machines', JSON.stringify(list));
    this.bridge.notify(`Machine profile "${machine.name}" saved to Vault.`, 'ok');
  }

  async deleteMachine(machineId) {
    try {
      await fetch(`${this.serverUrl}/api/vault/machine/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: machineId })
      });
    } catch {}

    const list = this.getMachinesSync().filter(m => m.id !== machineId);
    localStorage.setItem('cle.vault.machines', JSON.stringify(list));
    this.bridge.notify(`Machine profile removed from Vault.`);
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
 * CLEJS - Job Recovery & Crash Resume Subsystem (V3)
 * Watches active streaming G-code line, detects job hangs/disconnects,
 * and recovers seamlessly at -5 G-code lines before the hang with safe Z-lift & plunge
 */

class CLEJobRecoveryEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.activeJob = null;
    this.currentLineIndex = 0;
    this.totalLines = 0;
    this.hungLineIndex = 0;
    this.isHung = false;
    this.lookbackLines = 5; // Resume -5 lines before the hang
    this.lastPosition = { X: 0, Y: 0, Z: 0, A: 0 };
    this.feedRate = 1200;
    this.spindleRPM = 12000;
    this.laserPower = 800;
    this.safeZClearance = 15.0; // mm safe lift above workpiece
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
    this.hungLineIndex = 0;
    this.isHung = false;
    this.saveCheckpoint();
  }

  // Called continuously by cle_fluidnc while streaming
  advanceLine(idx, gcodeText = '') {
    this.currentLineIndex = idx;
    
    // Parse modal coordinates and feeds from streamed line
    if (gcodeText) {
      const matchX = gcodeText.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = gcodeText.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = gcodeText.match(/[Zz](-?\d+\.?\d*)/);
      const matchA = gcodeText.match(/[Aa](-?\d+\.?\d*)/);
      const matchF = gcodeText.match(/[Ff](\d+\.?\d*)/);
      const matchS = gcodeText.match(/[Ss](\d+\.?\d*)/);

      if (matchX) this.lastPosition.X = parseFloat(matchX[1]);
      if (matchY) this.lastPosition.Y = parseFloat(matchY[1]);
      if (matchZ) this.lastPosition.Z = parseFloat(matchZ[1]);
      if (matchA) this.lastPosition.A = parseFloat(matchA[1]);
      if (matchF) this.feedRate = parseFloat(matchF[1]);
      if (matchS) this.spindleRPM = parseFloat(matchS[1]);
    }

    if (idx % 20 === 0) {
      this.saveCheckpoint();
    }
  }

  recordPosition(wpos) {
    if (wpos) {
      this.lastPosition = { ...this.lastPosition, ...wpos };
      this.saveCheckpoint();
    }
  }

  // Triggered when job hangs, disconnects, holds, or aborts
  markJobHung(lineIndex = this.currentLineIndex, reason = 'Job Interrupted') {
    this.hungLineIndex = lineIndex;
    this.isHung = true;
    this.saveCheckpoint();
    this.bridge.notify(`Job hang detected at Line ${lineIndex}! Recovery armed (-5 lines).`, 'error');
  }

  saveCheckpoint() {
    if (!this.activeJob) return;
    const checkpoint = {
      filename: this.activeJob.filename,
      currentLineIndex: this.currentLineIndex,
      hungLineIndex: this.hungLineIndex,
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

  // Target resume line: (hung line - lookback)
  getTargetResumeLine(lookback = this.lookbackLines) {
    const baseLine = this.hungLineIndex || this.currentLineIndex;
    return Math.max(0, baseLine - lookback);
  }

  // Generates safe recovery preamble and slice of remaining G-code
  generateResumeSequence(fullGCodeLines, resumeLineIndex, safeZ = this.safeZClearance) {
    if (!fullGCodeLines || fullGCodeLines.length === 0) return '';
    const targetIdx = Math.max(0, Math.min(fullGCodeLines.length - 1, resumeLineIndex));

    let targetX = this.lastPosition.X;
    let targetY = this.lastPosition.Y;
    let targetZ = this.lastPosition.Z;
    let targetA = this.lastPosition.A;
    let targetF = this.feedRate;
    let targetS = this.spindleRPM;

    // Scan backwards from targetIdx to find modal coordinates and speeds
    for (let i = targetIdx; i >= 0; i--) {
      const line = fullGCodeLines[i];
      const matchX = line.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = line.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = line.match(/[Zz](-?\d+\.?\d*)/);
      const matchA = line.match(/[Aa](-?\d+\.?\d*)/);
      const matchF = line.match(/[Ff](\d+\.?\d*)/);
      const matchS = line.match(/[Ss](\d+\.?\d*)/);

      if (matchX && targetX === this.lastPosition.X) targetX = parseFloat(matchX[1]);
      if (matchY && targetY === this.lastPosition.Y) targetY = parseFloat(matchY[1]);
      if (matchZ && targetZ === this.lastPosition.Z) targetZ = parseFloat(matchZ[1]);
      if (matchA && targetA === this.lastPosition.A) targetA = parseFloat(matchA[1]);
      if (matchF && targetF === this.feedRate) targetF = parseFloat(matchF[1]);
      if (matchS && targetS === this.spindleRPM) targetS = parseFloat(matchS[1]);
    }

    const preamble = [
      `; ==========================================`,
      `;   CLEJS Safe Job Recovery Sequence        `,
      `;   Hung at line: ${this.hungLineIndex || this.currentLineIndex} | Resuming at line: ${targetIdx} (-${this.lookbackLines} lookback)`,
      `; ==========================================`,
      'G21 G90 ; Metric units, Absolute coordinates',
      `G0 Z${safeZ} F1000 ; 1. Safe clearance lift above workpiece`,
      `G0 X${targetX} Y${targetY} A${targetA} F3000 ; 2. Rapid traverse to resume XY coordinate`,
      `M3 S${targetS} ; 3. Re-engage Spindle / Laser`,
      'G4 P2.0 ; 4. Dwell 2 seconds for full RPM',
      `G1 Z${targetZ} F300 ; 5. Controlled plunge to target cut depth`,
      `G1 F${targetF} ; Restore feed rate`,
      `; --- Resuming Original G-Code Toolpath ---`
    ];

    const remaining = fullGCodeLines.slice(targetIdx);
    return preamble.concat(remaining).join('\n');
  }

  // Execute recovery directly through FluidNC streaming
  async executeRecovery(resumeLineIndex, safeZ = this.safeZClearance) {
    const fluid = this.bridge.fluidnc;
    if (!fluid || !fluid.isConnected) {
      this.bridge.notify('Connect to FluidNC first.', 'error');
      return;
    }

    let lines = this.activeJob?.lines;
    if (!lines || lines.length === 0) {
      // Check saved checkpoint or slicer rawGCode
      if (this.bridge.slicer?.rawGCode) {
        lines = this.bridge.slicer.rawGCode.split('\n');
      }
    }

    if (!lines || lines.length === 0) {
      this.bridge.notify('No active G-code buffer found to recover.', 'error');
      return;
    }

    const recoveryGCode = this.generateResumeSequence(lines, resumeLineIndex, safeZ);
    this.bridge.notify(`Resuming job from line ${resumeLineIndex} (-5 lookback) with Safe Z=${safeZ}mm...`, 'ok');
    
    // Start streaming the recovery G-code
    this.startJob(`Recovered_${this.activeJob?.filename || 'Job'}`, recoveryGCode.split('\n'));
    await fluid.streamGCode(recoveryGCode);
  }
}

/* --- Module: cle_slicer.js --- */
/**
 * CLEJS - Slicer & Visualizer Subsystem (V3)
 * Device-Type-Aware Slicing (Top-Down for CNC/Laser, Bottom-Up for 3D),
 * Native Three.js Visualizer Stack, Floating Layer HUD, and FluidNC SD Card Export
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
    this.mode = 'cnc';           // 'cnc' (top-down) | 'laser' (top-down) | '3d' (bottom-up)
    
    this.slicedLayers = [];      // Array of layer objects
    this.rawGCode = '';
    this.currentPreviewLayer = -1; // -1 = Show All
    this.visualizerGroup = null;
  }

  // Extracts active CAD geometry from JumpStart scene or generates realistic sample block
  getActiveBodyGeometry() {
    const app = window.app || window.xe;
    const bodies = app?.doc?.bodies || [];
    
    // 1. Try extracting actual mesh vertices from JumpStart scene views
    if (app?.scene?.views) {
      for (const b of bodies) {
        if (!b.hidden) {
          const view = app.scene.views.get(b.id);
          if (view) {
            // Check Three.js mesh geometry
            if (view.mesh?.geometry?.attributes?.position) {
              const pos = view.mesh.geometry.attributes.position.array;
              if (pos && pos.length >= 9) {
                return { name: b.name || 'CAD_Body', triangles: new Float32Array(pos) };
              }
            }
            // Check view.data.vertices
            if (view.data?.vertices && view.data.vertices.length >= 9) {
              return { name: b.name || 'CAD_Body', triangles: new Float32Array(view.data.vertices) };
            }
          }
        }
      }
    }

    // 2. Fallback Sample 3D Test Object (50x40x12 mm rectangular billet with chamfer)
    console.log('[CLE Slicer] No meshed bodies active. Generating sample 3D test billet.');
    const sampleTris = this.generateSampleBoxTriangles(50, 40, 12);
    return { name: 'Sample_Billet_50x40', triangles: sampleTris };
  }

  generateSampleBoxTriangles(w, d, h) {
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
      gcode = this.sliceNative(triangles, this.layerHeight, this.mode);
      usedEngine = `Native CLE JS (${this.mode.toUpperCase()})`;
    }

    this.rawGCode = gcode;
    this.parseGCodeIntoLayers(gcode);
    this.renderSlicedStackToVisualizer();
    this.mountLayerHUD();

    const orderDesc = (this.mode === 'cnc' || this.mode === 'laser') ? 'Top-Down passes' : 'Bottom-Up layers';
    this.bridge.notify(`Sliced (${usedEngine}): ${this.slicedLayers.length} ${orderDesc} generated!`, 'ok');
    return gcode;
  }

  // Native In-Browser Slicer with strict Top-Down (CNC/Laser) vs Bottom-Up (3D) ordering
  sliceNative(triangles, layerH, mode) {
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

    // Preamble finish
    lines.push('G0 Z15.0 F1000 ; Safe retract');
    lines.push(mode === 'laser' ? 'M5 ; Laser shutdown' : 'M5 ; Spindle OFF');
    lines.push('G0 X0 Y0 F3000 ; Return to home origin');
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
        const matchZ = line.match(/Z=([-\d.]+)/);
        const lZ = matchZ ? parseFloat(matchZ[1]) : curZ;
        currentLayer = { index: lIdx, z: lZ, points: [] };
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

  // --- Render Sliced Toolpath Stack in JumpStart's Native Three.js Viewport ---
  renderSlicedStackToVisualizer() {
    const app = window.app || window.xe;
    if (!app) return;

    // JumpStart attaches Three.js Scene to app.vp.scene
    const threeScene = (app.vp && app.vp.scene) || app.scene;
    if (!threeScene || !threeScene.add) {
      console.warn('[CLE Slicer] Could not locate Three.js scene.');
      return;
    }

    const THREE = window.THREE || (app.vp && app.vp.THREE) || null;
    if (!THREE) return;

    // Clean up previous visualizer group
    if (this.visualizerGroup) {
      threeScene.remove(this.visualizerGroup);
    }

    this.visualizerGroup = new THREE.Group();
    this.visualizerGroup.name = 'CLE_Sliced_Toolpath_Stack';

    const numLayers = this.slicedLayers.length;
    const isTopDown = (this.mode === 'cnc' || this.mode === 'laser');

    this.slicedLayers.forEach((layer, lIdx) => {
      if (layer.points.length < 2) return;

      const positions = [];
      const colors = [];

      // Color coding:
      // 3D (bottom-up): blue at base -> red at top
      // CNC/Laser (top-down): bright green at surface -> deep red at deepest cut
      let hue;
      if (isTopDown) {
        hue = 0.33 - (lIdx / (numLayers || 1)) * 0.33; // 0.33 (green) down to 0.0 (red)
      } else {
        hue = (lIdx / (numLayers || 1)) * 0.7; // 0.0 to 0.7
      }
      const color = new THREE.Color().setHSL(Math.max(0, hue), 1.0, 0.55);

      for (let i = 0; i < layer.points.length - 1; i++) {
        const p1 = layer.points[i];
        const p2 = layer.points[i+1];
        positions.push(p1.x, p1.y, p1.z);
        positions.push(p2.x, p2.y, p2.z);

        if (p2.isRapid) {
          // Rapid traverse in faint cyan/yellow
          colors.push(0.3, 0.8, 0.9, 0.3, 0.8, 0.9);
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
      lineMesh.userData = { layerIndex: lIdx, zElevation: layer.z };
      this.visualizerGroup.add(lineMesh);
    });

    threeScene.add(this.visualizerGroup);

    // Trigger JumpStart viewport redraw
    if (app.vp) {
      app.vp.dirty = true;
      if (app.vp.request) app.vp.request();
    }
    console.log(`[CLE Slicer] Rendered ${numLayers} toolpath layers into Three.js scene.`);
  }

  // Filter layer visibility according to scrubbed layer index
  setPreviewLayer(targetIndex) {
    this.currentPreviewLayer = targetIndex;
    if (!this.visualizerGroup) return;

    const isTopDown = (this.mode === 'cnc' || this.mode === 'laser');

    this.visualizerGroup.children.forEach(mesh => {
      const lIdx = mesh.userData.layerIndex;
      if (targetIndex === -1) {
        mesh.visible = true; // Show all
      } else {
        // Show progression up to current layer
        mesh.visible = (lIdx <= targetIndex);
      }
    });

    const app = window.app || window.xe;
    if (app?.vp?.request) app.vp.request();
  }

  // Floating Layer & Export HUD
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
        gap: 12px;
        z-index: 1000;
        font-family: var(--f);
        font-size: 12px;
      `;
      document.body.appendChild(hud);
    }

    const numLayers = this.slicedLayers.length;
    const isTopDown = (this.mode === 'cnc' || this.mode === 'laser');
    const modeLabel = isTopDown ? `${this.mode.toUpperCase()}: Top-Down` : '3D: Bottom-Up';

    hud.innerHTML = `
      <div style="font-weight:700; color:var(--accent);">${modeLabel}</div>
      <div style="display:flex; align-items:center; gap:6px;">
        <button class="cle-btn" id="cle-hud-prev" style="padding:2px 8px;">&larr;</button>
        <span id="cle-hud-label" style="font-family:var(--f-mono); min-width:120px; text-align:center;">
          All (${numLayers} passes)
        </span>
        <button class="cle-btn" id="cle-hud-next" style="padding:2px 8px;">&rarr;</button>
      </div>
      <input type="range" id="cle-hud-slider" min="-1" max="${numLayers - 1}" value="-1" style="width:140px;">
      <button class="cle-btn" id="cle-hud-all">Show All</button>
      <div style="border-left:1px solid var(--line); height:18px;"></div>
      <button class="cle-btn" id="cle-hud-export" style="background:var(--accent); color:var(--on-accent); font-weight:600;">Export .NC</button>
      <button class="cle-btn" id="cle-hud-upload" style="background:var(--ok); color:#fff; font-weight:600;">To SD Card</button>
      <button class="cle-btn" id="cle-hud-close" style="padding:2px 6px;">&times;</button>
    `;

    hud.style.display = 'flex';

    const slider = document.getElementById('cle-hud-slider');
    const label = document.getElementById('cle-hud-label');

    const updateHUD = (val) => {
      slider.value = val;
      this.setPreviewLayer(parseInt(val, 10));
      if (val == -1) {
        label.textContent = `All (${numLayers} passes)`;
      } else {
        const curL = this.slicedLayers[val];
        label.textContent = `Pass ${parseInt(val, 10) + 1}/${numLayers} (Z=${curL ? curL.z.toFixed(2) : '--'}mm)`;
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
    document.getElementById('cle-hud-export').onclick = () => this.exportGCodeFile();
    document.getElementById('cle-hud-upload').onclick = () => this.uploadGCodeToSD();
    document.getElementById('cle-hud-close').onclick = () => { hud.style.display = 'none'; };
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

/* --- Module: cle_boot.js --- */
/**
 * CLEJS - Master Extension Bootstrapper (V5)
 * Native JumpStart Integration, Joystick Mode Ribbon, Interactive Gamepad Remap Table,
 * MEAGCLE-Style Git Vault, Job Crash Recovery (-5 lines lookback), and Top-Down / Bottom-Up Slicer
 */


class CLEBridge {
  constructor() {
    this.version = '1.4.0';
    this.machineName = 'TwoTrees TTC6050';
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
    const app = window.app || window.xe;
    if (app && app.toast) {
      app.toast(message, type === 'error' ? 'err' : '');
      return;
    }

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
    console.log(`[CLEJS] Initializing Continuous 3D Extension v${this.version}...`);
    this.injectTopBarButton();
    this.registerWithJumpStart();
  }

  registerWithJumpStart() {
    const app = window.app || window.xe;
    if (app) {
      console.log('[CLEJS] Attached to active JumpStart 3D runtime context.');
    } else {
      setTimeout(() => this.registerWithJumpStart(), 250);
    }
  }

  injectTopBarButton() {
    const topbar = document.getElementById('topbar') || document.querySelector('.topbar') || document.body;
    if (!topbar || topbar === document.body) {
      setTimeout(() => this.injectTopBarButton(), 200);
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
    const activeMach = this.vault.getActiveMachine();
    this.machineName = activeMach.name;

    // 1. Machine Section (Devices like LightBurn / MillMage)
    m(activeMach.name, "", [
      { id: "cle-r-devices", label: "Devices", title: "Select or Configure Machine Profiles (Like LightBurn/MillMage)", icon: "settings", fn: () => this.openModal("machines") },
      { id: "cle-r-serial", label: "USB List", title: "Select & Connect USB Serial COM Port to FluidNC", icon: "drive", fn: () => this.fluidnc.connectSerial() },
      { id: "cle-r-ws", label: "WiFi Setup", title: "Configure FluidTouch 7\" / FluidNC WiFi IP & WebSocket", icon: "motion", fn: () => {
          const ip = prompt("Enter FluidTouch 7\" / FluidNC IP:", this.fluidnc.ip);
          if (ip) this.fluidnc.connectWebSocket(ip);
      }},
      { id: "cle-r-gcode", label: "Machine Gcode", title: "Direct Machine G-Code Terminal & Console", icon: "edit", fn: () => this.openManualControlCenter() },
      { id: "cle-r-fluidnc", label: "FluidNC", title: "FluidTouch 7\" Web GUI / FluidNC Status", icon: "inspect", fn: () => this.fluidnc.openFluidTouchWebGUI() }
    ]);

    // 2. JOYSTICK MODE Section
    m("JOYSTICK MODE", "", [
      { id: "cle-r-gp-mode", label: this.gamepad.mode === "design" ? "Design 3D" : "Manual CNC/Laser", title: "Toggle Switch Controller Mode", icon: "motion", pressed: this.gamepad.mode === "manual", fn: () => this.gamepad.toggleMode() },
      { id: "cle-r-manual-hub", label: `Manual Control of ${activeMach.name}`, title: "Open Live Manual Control Center, Remote Camera Feed & Soft-Limits", icon: "inspect", fn: () => this.openManualControlCenter() },
      { id: "cle-r-gp-remap", label: "Controller Setup", title: "Configure Switch Controller Buttons, Axes & Remap Table", icon: "settings", fn: () => this.openModal("gamepad") }
    ]);

    // 3. 4th Axis & Slicer
    m("Rotary & Slicer", "", [
      { id: "cle-r-rotary", label: "4th Axis (A)", title: "Toggle 4th Axis Rotary Chuck & Cylindrical Stock in 3D View", icon: "lathe", pressed: this.rotary.enabled, fn: () => this.rotary.toggle() },
      { id: "cle-r-slicer", label: "Slice & 3D Stack", title: "Slice Model (Top-Down for CNC/Laser, Bottom-Up for 3D) & Display in Visualizer", icon: "printer3d", fn: () => this.openModal("slicer") }
    ]);

    // 4. Tools Section
    m("CLE Tools", "", [
      { id: "cle-r-vault", label: "Vault", title: "MEAGCLE Design & Machine State Git Vault", icon: "box", fn: () => this.openModal("vault") },
      { id: "cle-r-cal", label: "Calibration", title: "Steps/mm, Laser & Backlash Calibration", icon: "inspect", fn: () => this.openModal("calibration") },
      { id: "cle-r-test", label: "Test Suite", title: "Diagnostic Test Cuts", icon: "pattern", fn: () => this.openModal("test") },
      { id: "cle-r-rec", label: "Job Recovery", title: "Job Crash Recovery (-5 lines lookback)", icon: "recovery", fn: () => this.openModal("recovery") }
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
      width: 470px;
      max-height: 85vh;
      background: var(--panel);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 12px 36px var(--shadow);
      z-index: 1000;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      font-family: var(--f);
    `;

    hub.innerHTML = `
      <div style="padding:10px 14px; background:var(--panel-2); border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:700; font-size:13px; color:var(--accent);">Manual Control of ${this.machineName}</span>
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="cle-badge" id="cle-man-conn-status" style="font-size:10px;">Offline</span>
          <button class="cle-modal-close" id="cle-man-close" style="font-size:18px; cursor:pointer; background:none; border:none; color:inherit;">&times;</button>
        </div>
      </div>

      <div style="padding:12px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
        <!-- Live DRO & Bed Safety Limits Notice -->
        <div class="cle-joycon-panel" style="padding:8px 12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span class="cle-joycon-title" style="margin:0;">Live Machine Coordinates</span>
            <span style="font-size:10px; color:var(--ok); font-weight:700;">Soft-Limits Active: Z &ge; 0.1mm</span>
          </div>
          <div class="cle-dro-bar" style="justify-content:space-between;">
            <span class="cle-dro-axis"><span class="cle-dro-name">X</span><span class="cle-dro-val" id="cle-man-dro-x">0.00</span></span>
            <span class="cle-dro-axis"><span class="cle-dro-name">Y</span><span class="cle-dro-val" id="cle-man-dro-y">0.00</span></span>
            <span class="cle-dro-axis"><span class="cle-dro-name">Z</span><span class="cle-dro-val" id="cle-man-dro-z">0.00</span></span>
            <span class="cle-dro-axis"><span class="cle-dro-name">A</span><span class="cle-dro-val" id="cle-man-dro-a">0.0</span></span>
          </div>
        </div>

        <!-- Spindle & Laser Controls -->
        <div class="cle-joycon-panel" style="padding:8px 10px;">
          <div class="cle-joycon-title" style="margin-bottom:6px;">Spindle & Laser Controls</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
            <div style="display:flex; flex-direction:column; gap:4px;">
              <button class="cle-btn" id="cle-man-spindle-btn" style="justify-content:center;">Spindle: OFF</button>
              <div style="display:flex; align-items:center; gap:4px;">
                <span style="font-size:10px;">RPM:</span>
                <input class="cle-input" id="cle-man-spindle-rpm" type="number" value="${this.fluidnc.spindleRPM}" step="1000" style="padding:2px 4px; font-size:11px; flex:1;">
              </div>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <button class="cle-btn" id="cle-man-laser-btn" style="justify-content:center;">Laser: OFF</button>
              <button class="cle-btn" id="cle-man-laser-pulse" style="font-size:10px; justify-content:center;">1% Framing Pulse</button>
            </div>
          </div>
        </div>

        <!-- G-Code Move Recorder -->
        <div class="cle-joycon-panel" style="padding:8px 10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span class="cle-joycon-title" style="margin:0;">Move Recorder</span>
            <span id="cle-rec-status" style="font-size:10px; color:var(--ink-3);">Idle</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="cle-btn" id="cle-man-rec-btn">Start Recording</button>
            <button class="cle-btn" id="cle-man-export-btn">Export Macro (.nc)</button>
          </div>
        </div>

        <!-- Generic Camera Subsystem (USB & Wi-Fi + Reticle Overlay) -->
        <div class="cle-joycon-panel" id="cle-cam-wrapper" style="padding:8px 10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span class="cle-joycon-title">Workpiece Camera (USB & Wi-Fi)</span>
            <div style="display:flex; gap:6px;">
              <button class="cle-btn" id="cle-cam-btn-reticle" title="Cycle Reticle">Reticle: ON</button>
              <button class="cle-btn" id="cle-cam-btn-snap" title="Capture Workpiece Frame">Snapshot</button>
              <button class="cle-btn" id="cle-cam-btn-dock" title="Dock in corner of 3D viewport">Dock PiP</button>
            </div>
          </div>

          <div style="position:relative; width:100%; height:180px; background:#000; border-radius:4px; overflow:hidden;">
            <video id="cle-cam-video" autoplay playsinline style="display:none; width:100%; height:100%; object-fit:cover;"></video>
            <img id="cle-cam-img" style="display:none; width:100%; height:100%; object-fit:cover;">
            <canvas id="cle-cam-canvas" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none;"></canvas>
            <div id="cle-cam-placeholder" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; color:var(--ink-3); text-align:center; padding:12px; gap:4px;">
              <span>No live camera active.</span>
              <span style="font-size:10px;">Select your USB webcam (e.g. Logitech C270) or connect open Wi-Fi cam.</span>
            </div>
          </div>

          <!-- Camera Selector Bar -->
          <div style="display:flex; gap:6px; margin-top:8px; align-items:center;">
            <select class="cle-select" id="cle-cam-device-select" style="flex:1; font-size:11px; padding:3px 6px;">
              <option value="">Detecting USB Cameras...</option>
            </select>
            <button class="cle-btn" id="cle-cam-btn-start-usb">Start USB</button>
            <button class="cle-btn" id="cle-cam-btn-wifi">Open Wi-Fi</button>
            <button class="cle-btn" id="cle-cam-btn-stop">&times;</button>
          </div>
          <div style="margin-top:6px; display:flex; justify-content:space-between; align-items:center;">
            <button class="cle-btn" id="cle-cam-btn-zero-cross" style="font-size:10px; width:100%;">Set WCS Zero at Optical Crosshair (G10 L20)</button>
          </div>
        </div>

        <!-- Terminal Console -->
        <div class="cle-joycon-panel" style="padding:8px 10px;">
          <div class="cle-joycon-title" style="margin-bottom:4px;">FluidNC Terminal Console</div>
          <div id="cle-man-console" style="height:90px; background:#0d1117; color:#39d353; font-family:var(--f-mono); font-size:10px; padding:6px; border-radius:4px; overflow-y:auto; white-space:pre-wrap; border:1px solid var(--line);"></div>
          <div style="display:flex; gap:6px; margin-top:6px;">
            <input class="cle-input" id="cle-man-gcode-input" placeholder="G-code command (e.g. $H, ?)" style="flex:1; padding:4px 6px; font-size:11px;">
            <button class="cle-btn" id="cle-man-send-btn">Send</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hub);

    // Auto-populate camera device list
    const devSelect = document.getElementById('cle-cam-device-select');
    const devices = await this.camera.getAvailableDevices();
    if (devices.length > 0) {
      devSelect.innerHTML = devices.map(d => `<option value="${d.deviceId}">${d.label || 'USB Camera'}</option>`).join('');
      const logi = devices.find(d => /logi|c270|webcam/i.test(d.label));
      if (logi) devSelect.value = logi.deviceId;
    } else {
      devSelect.innerHTML = '<option value="">Default USB Video Device</option>';
    }

    // Wire Events
    document.getElementById('cle-man-close').onclick = () => { hub.style.display = 'none'; };
    
    document.getElementById('cle-man-spindle-btn').onclick = () => {
      const rpm = parseInt(document.getElementById('cle-man-spindle-rpm').value, 10);
      this.fluidnc.spindleRPM = rpm;
      this.fluidnc.toggleSpindle();
    };

    document.getElementById('cle-man-laser-btn').onclick = () => {
      this.fluidnc.toggleLaser();
    };

    document.getElementById('cle-man-laser-pulse').onclick = () => {
      this.fluidnc.laserPulse(1000, 10);
    };

    document.getElementById('cle-man-rec-btn').onclick = () => {
      this.fluidnc.toggleMacroRecording();
    };

    document.getElementById('cle-man-export-btn').onclick = () => {
      this.fluidnc.exportRecordedGCode();
    };

    // Camera Subsystem Events
    document.getElementById('cle-cam-btn-start-usb').onclick = () => {
      this.camera.startUSBCamera(devSelect.value);
    };
    document.getElementById('cle-cam-btn-wifi').onclick = () => {
      const url = prompt('Enter Open Wi-Fi Camera Stream URL (MJPEG / HTTP):', this.camera.wifiUrl);
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
      const val = inp.value.trim();
      if (val) {
        this.fluidnc.sendGCode(val);
        inp.value = '';
      }
    };
    document.getElementById('cle-man-send-btn').onclick = sendInput;
    document.getElementById('cle-man-gcode-input').onkeydown = (e) => {
      if (e.key === 'Enter') sendInput();
    };

    window.addEventListener('resize', () => this.camera.updateReticleCanvas());
  }

  // --- Modals (Gamepad Setup Table, MEAGCLE Vault, Job Recovery, Slicer) ---
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
      title = 'Nintendo Switch Controller Setup & Remap Table';
      const m = this.gamepad.mapping;
      bodyHtml = `
        <div style="background:var(--paper); padding:10px 14px; border-radius:6px; border:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <strong>Controller: </strong><span id="cle-modal-gp-name" style="color:var(--accent);">Detecting...</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <input class="cle-input" id="cle-gp-profile-name" value="${m.profileName || 'Nintendo Switch Pro'}" placeholder="Profile Name" style="padding:3px 8px; font-size:11px; width:160px;">
            <button class="cle-btn" id="cle-btn-save-profile" style="background:var(--accent); color:var(--on-accent); font-weight:600;">Save to Vault</button>
            <select class="cle-select" id="cle-gp-vault-profiles" style="font-size:11px; padding:3px 6px;">
              <option value="">Load Vault Profile...</option>
            </select>
          </div>
        </div>

        <!-- Live Stick Gauges & Axis Selector -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:8px;">
          <div class="cle-joycon-panel">
            <div class="cle-joycon-title">Left Stick (Orbit / Machine Jog XY)</div>
            <div style="font-family:var(--f-mono); font-size:11px; margin-bottom:6px;">
              LX: <span id="cle-live-lx">0.00</span> | LY: <span id="cle-live-ly">0.00</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px; margin-bottom:6px;">
              <label>Axis X:
                <select class="cle-select" id="cfg-axis-lx" style="width:100%; padding:2px 4px;">
                  ${[0,1,2,3,4,5].map(a => `<option value="${a}" ${m.axes?.lx===a?'selected':''}>Axis ${a}</option>`).join('')}
                </select>
              </label>
              <label>Axis Y:
                <select class="cle-select" id="cfg-axis-ly" style="width:100%; padding:2px 4px;">
                  ${[0,1,2,3,4,5].map(a => `<option value="${a}" ${m.axes?.ly===a?'selected':''}>Axis ${a}</option>`).join('')}
                </select>
              </label>
            </div>
            <div style="display:flex; gap:10px; font-size:11px;">
              <label><input type="checkbox" id="cfg-inv-lx" ${m.design.invertLX?'checked':''}> Invert X</label>
              <label><input type="checkbox" id="cfg-inv-ly" ${m.design.invertLY?'checked':''}> Invert Y</label>
            </div>
          </div>

          <div class="cle-joycon-panel">
            <div class="cle-joycon-title">Right Stick (Pan / Machine Jog ZA)</div>
            <div style="font-family:var(--f-mono); font-size:11px; margin-bottom:6px;">
              RX: <span id="cle-live-rx">0.00</span> | RY (Pan Up/Down): <span id="cle-live-ry">0.00</span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:11px; margin-bottom:6px;">
              <label>Axis X (Pan L/R):
                <select class="cle-select" id="cfg-axis-rx" style="width:100%; padding:2px 4px;">
                  ${[0,1,2,3,4,5].map(a => `<option value="${a}" ${m.axes?.rx===a?'selected':''}>Axis ${a}</option>`).join('')}
                </select>
              </label>
              <label>Axis Y (Pan Up/Dn):
                <select class="cle-select" id="cfg-axis-ry" style="width:100%; padding:2px 4px;">
                  ${[0,1,2,3,4,5].map(a => `<option value="${a}" ${(m.axes?.ry===a || (m.axes?.ry===3 && a===3))?'selected':''}>Axis ${a}${a===3||a===5?' (Switch)':''}</option>`).join('')}
                </select>
              </label>
            </div>
            <div style="display:flex; gap:10px; font-size:11px;">
              <label><input type="checkbox" id="cfg-inv-rx" ${m.design.invertRX?'checked':''}> Invert X</label>
              <label><input type="checkbox" id="cfg-inv-ry" ${m.design.invertRY?'checked':''}> Invert Y (Pan)</label>
            </div>
          </div>
        </div>

        <!-- Live All-Axes Meter Strip -->
        <div class="cle-joycon-panel" style="padding:6px 10px; margin-top:8px;">
          <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--ink-3); margin-bottom:4px;">Real-Time Gamepad Axes Deflection:</div>
          <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:8px; font-family:var(--f-mono); font-size:10px; text-align:center;">
            ${[0,1,2,3,4,5].map(a => `
              <div>
                <span>Axis ${a}: <span id="cle-axis-val-${a}">0.00</span></span>
                <div class="cle-axis-meter" style="margin-top:2px;"><div id="cle-axis-bar-${a}" class="cle-axis-meter-fill" style="width:50%;"></div></div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- D-Pad Single-Active Cross Button & Buttons Strip -->
        <div style="margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--ink-2);">D-Pad Cross Button (Single Active Direction):</span>
            <span id="cle-dpad-active-label" style="font-size:10px; font-family:var(--f-mono); color:var(--ok);">Center (None)</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center; margin-bottom:8px;">
            <span id="cle-dpad-up-tag" style="padding:3px 10px; border-radius:3px; background:var(--panel-2); border:1px solid var(--line); font-family:var(--f-mono); font-size:11px;">Up &uarr;</span>
            <span id="cle-dpad-down-tag" style="padding:3px 10px; border-radius:3px; background:var(--panel-2); border:1px solid var(--line); font-family:var(--f-mono); font-size:11px;">Down &darr;</span>
            <span id="cle-dpad-left-tag" style="padding:3px 10px; border-radius:3px; background:var(--panel-2); border:1px solid var(--line); font-family:var(--f-mono); font-size:11px;">Left &larr;</span>
            <span id="cle-dpad-right-tag" style="padding:3px 10px; border-radius:3px; background:var(--panel-2); border:1px solid var(--line); font-family:var(--f-mono); font-size:11px;">Right &rarr;</span>
          </div>
        </div>

        <!-- Interactive Function Remap Table -->
        <div style="max-height:220px; overflow-y:auto; border:1px solid var(--line); border-radius:6px; margin-top:8px;">
          <table class="cle-table">
            <thead>
              <tr>
                <th>Function / Action</th>
                <th>Target Action in JS / CNC</th>
                <th>Assigned Button</th>
                <th>Remap</th>
              </tr>
            </thead>
            <tbody id="cle-remap-tbody">
              ${this.buildRemapTableRows()}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'vault') {
      title = '📦 Design & Machine State Vault (MEAGCLE Architecture)';
      const projName = this.vault.getActiveProjectName();
      bodyHtml = `
        <div class="cle-joycon-panel" style="padding:10px 14px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <div>
              <span style="font-size:11px; color:var(--ink-3);">Active JumpStart Project:</span>
              <strong style="color:var(--accent); font-size:13px; margin-left:4px;">${projName}</strong>
            </div>
            <span id="cle-vault-badge" class="cle-badge connected">✔ Active Git Repository</span>
          </div>
          <div style="font-family:var(--f-mono); font-size:10px; color:var(--ink-3);">
            Repository Path: D:/CLEJS/vault/projects/${projName}
          </div>
        </div>

        <!-- Snapshot Check-in Box -->
        <div class="cle-joycon-panel" style="padding:10px 14px; margin-bottom:12px;">
          <div class="cle-joycon-title" style="margin-bottom:6px;">Create Project Check-in / Snapshot</div>
          <div style="display:flex; gap:8px;">
            <input class="cle-input" id="cle-vault-snap-desc" placeholder="Snapshot description (e.g. Sliced continuous toolpath, feed rate tested)" style="flex:1;">
            <button class="cle-btn" id="cle-vault-btn-snap" style="background:var(--ok); color:#fff; font-weight:700; padding:6px 14px;">Take Snapshot</button>
          </div>
        </div>

        <!-- Revisions Timeline -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:12px; font-weight:700;">Revision History & Recall:</span>
          <input class="cle-input" id="cle-vault-search" placeholder="Filter revisions..." style="padding:3px 8px; font-size:11px; width:160px;">
        </div>

        <div id="cle-vault-history-list" style="max-height:240px; overflow-y:auto; display:flex; flex-direction:column; gap:6px;">
          <div style="color:var(--ink-3); font-size:11px; text-align:center; padding:12px;">Loading Git revisions...</div>
        </div>
      `;
    } else if (type === 'recovery') {
      title = '🛟 Job Crash & Power-Loss Recovery Wizard';
      const cp = this.recovery.getSavedCheckpoint();
      const hungLine = this.recovery.hungLineIndex || (cp ? cp.hungLineIndex || cp.currentLineIndex : 0);
      const targetResume = Math.max(0, hungLine - 5);

      bodyHtml = `
        <p>Recovers interrupted or hung jobs by resuming <strong>-5 G-code lines before the hang</strong>, saving material and preventing tool breakage.</p>
        
        <div class="cle-joycon-panel" style="margin-top:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span><strong>Interrupted Job:</strong> ${cp ? cp.filename : (this.recovery.activeJob?.filename || 'Active_Toolpath.nc')}</span>
            <span class="cle-badge alert">Hang at Line: ${hungLine}</span>
          </div>
          <div style="font-size:11px; color:var(--ink-2); margin-top:4px;">
            Saved Work Position: X: ${this.recovery.lastPosition.X.toFixed(2)}, Y: ${this.recovery.lastPosition.Y.toFixed(2)}, Z: ${this.recovery.lastPosition.Z.toFixed(2)}
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
          <div class="cle-form-row">
            <label>Resume Line # (-5 lookback):</label>
            <input class="cle-input" id="rec-resume-line" type="number" value="${targetResume}">
          </div>
          <div class="cle-form-row">
            <label>Safe Z Clearance (mm):</label>
            <input class="cle-input" id="rec-safe-z" type="number" value="15.0" step="1.0">
          </div>
        </div>

        <div class="cle-joycon-panel" style="margin-top:12px;">
          <div class="cle-joycon-title" style="margin-bottom:6px;">Recovery Preamble Sequence:</div>
          <pre id="rec-preview" style="background:#0d1117; color:#39d353; font-family:var(--f-mono); font-size:10px; padding:8px; border-radius:4px; max-height:100px; overflow-y:auto; margin:0;">Generating recovery sequence...</pre>
        </div>

        <div style="margin-top:14px; display:flex; justify-content:flex-end; gap:8px;">
          <button class="cle-btn" id="rec-btn-execute" style="background:var(--ok); color:#fff; font-weight:700; padding:8px 16px;">Resume Job from Line ${targetResume}</button>
        </div>
      `;
    } else if (type === 'slicer') {
      title = 'Continuous Slicing & 3D Toolpath Stack';
      bodyHtml = `
        <p>Slice JumpStart 3D models with strict device-type awareness. View the continuous layer stack in Three.js and transfer to FluidNC SD Card.</p>
        
        <div class="cle-form-row" style="margin-top:10px;">
          <label>Target Machine & Slicing Order:</label>
          <select class="cle-select" id="slice-mode">
            <option value="cnc" ${this.slicer.mode==='cnc'?'selected':''}>CNC Milling / Carving (${this.machineName}) &mdash; TOP-DOWN passes</option>
            <option value="laser" ${this.slicer.mode==='laser'?'selected':''}>Diode Laser Vector & Engraving &mdash; TOP-DOWN passes</option>
            <option value="3d" ${this.slicer.mode==='3d'?'selected':''}>3D Additive Print Sim &mdash; BOTTOM-UP layers</option>
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

        <div style="margin-top:14px; display:flex; gap:10px;">
          <button class="cle-btn" id="slice-run-btn" style="background:var(--accent); color:var(--on-accent); padding:8px 18px; font-weight:700;">Slice & Display in 3D Viewport</button>
        </div>
      `;
    } else if (type === 'machines') {
      title = 'Devices & Machine Profiles (LightBurn / MillMage Model)';
      const machines = this.vault.getMachinesSync();
      const activeMach = this.vault.getActiveMachine();

      bodyHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--paper); padding:10px 14px; border-radius:6px; border:1px solid var(--line); margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-weight:700;">Select Device:</label>
            <select class="cle-select" id="cle-mach-selector" style="font-weight:700; color:var(--accent); min-width:240px;">
              ${machines.map(m => `<option value="${m.id}" ${m.id === activeMach.id ? 'selected' : ''}>${m.name} (${m.type.toUpperCase()})</option>`).join('')}
            </select>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button class="cle-btn" id="cle-mach-btn-activate" style="background:var(--ok); color:#fff; font-weight:700;">Make Active Device</button>
            <button class="cle-btn" id="cle-mach-btn-query" title="Auto-detect machine settings by querying controller ($$, $I)">Query ($$, $I)</button>
            <button class="cle-btn" id="cle-mach-btn-read-yaml" style="background:var(--accent); color:var(--on-accent); font-weight:600;" title="Load full capability model from FluidNC flash config.yaml">Read Flash config.yaml</button>
            <button class="cle-btn" id="cle-mach-btn-import-yaml" title="Import local config.yaml file from disk">Import config.yaml</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <!-- Left Column: Work Area & Soft-Limits -->
          <div class="cle-joycon-panel">
            <div class="cle-joycon-title">Work Area (Travels & Bed Bounds)</div>
            <div class="cle-form-row">
              <label>Device Name:</label>
              <input class="cle-input" id="cle-m-name" value="${activeMach.name}">
            </div>
            <div class="cle-form-row">
              <label>Device Type:</label>
              <select class="cle-select" id="cle-m-type">
                <option value="cnc" ${activeMach.type==='cnc'?'selected':''}>CNC Milling / Router</option>
                <option value="laser" ${activeMach.type==='laser'?'selected':''}>Diode Laser Cutter / Engraver</option>
                <option value="rotary" ${activeMach.type==='rotary'?'selected':''}>4-Axis Rotary Carving</option>
              </select>
            </div>
            <div class="cle-form-row">
              <label>X Travel (mm):</label>
              <input class="cle-input" id="cle-m-tx" type="number" value="${activeMach.travelX || 600}">
            </div>
            <div class="cle-form-row">
              <label>Y Travel (mm):</label>
              <input class="cle-input" id="cle-m-ty" type="number" value="${activeMach.travelY || 500}">
            </div>
            <div class="cle-form-row">
              <label>Z Travel (mm):</label>
              <input class="cle-input" id="cle-m-tz" type="number" value="${activeMach.travelZ || 100}">
            </div>
            <div class="cle-form-row">
              <label>4th Axis Rotary (A deg):</label>
              <input class="cle-input" id="cle-m-ta" type="number" value="${activeMach.travelA || 360}">
            </div>
          </div>

          <!-- Right Column: Safety, Speeds & Controller -->
          <div class="cle-joycon-panel">
            <div class="cle-joycon-title">Bed Safety & Controller Hardware</div>
            <div class="cle-form-row">
              <label>Z Min Soft-Limit (Bed Clamp):</label>
              <input class="cle-input" id="cle-m-minz" type="number" step="0.05" value="${activeMach.safeLimitZ !== undefined ? activeMach.safeLimitZ : 0.1}" title="Strict floor limit to prevent spoilboard gouging">
            </div>
            <div class="cle-form-row">
              <label>XY Endstop Buffer (mm):</label>
              <input class="cle-input" id="cle-m-buffer" type="number" value="${activeMach.clearanceX || 5.0}" title="Distance kept from hardware limit switches">
            </div>
            <div class="cle-form-row">
              <label>Max XY Feed (mm/min):</label>
              <input class="cle-input" id="cle-m-maxfeed" type="number" value="${activeMach.maxRateXY || 5000}">
            </div>
            <div class="cle-form-row">
              <label>Max Spindle RPM / Laser PWM:</label>
              <input class="cle-input" id="cle-m-rpm" type="number" value="${activeMach.spindleMaxRPM || 24000}">
            </div>
            <div class="cle-form-row">
              <label>WiFi IP (FluidTouch/FluidNC):</label>
              <input class="cle-input" id="cle-m-ip" value="${activeMach.wifiIP || '192.168.1.150'}">
            </div>
            <div class="cle-form-row">
              <label>Storage Endpoints:</label>
              <span style="font-size:11px; color:var(--ink-2);">FluidNC ESP32 SD &amp; FluidTouch 7" SD</span>
            </div>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
          <button class="cle-btn" id="cle-mach-btn-new" style="background:var(--panel-2);">+ Add New Device Profile</button>
          <div style="display:flex; gap:8px;">
            <button class="cle-btn danger" id="cle-mach-btn-delete">Delete Device</button>
            <button class="cle-btn" id="cle-mach-btn-save" style="background:var(--accent); color:var(--on-accent); font-weight:700; padding:6px 14px;">Save Device Profile</button>
          </div>
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
        <button class="cle-btn" id="cle-modal-save-btn">Done</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.activeModal = overlay;

    document.getElementById('cle-modal-close-btn').onclick = () => this.closeModal();
    document.getElementById('cle-modal-save-btn').onclick = () => this.closeModal();

    // Wire Modal Logic
    if (type === 'gamepad') {
      this.bindGamepadModalRealtime();
      this.loadVaultProfilesList();
      
      document.getElementById('cle-btn-save-profile').onclick = async () => {
        const name = document.getElementById('cle-gp-profile-name').value.trim() || 'Custom_Profile';
        this.saveGamepadSettingsFromModal();
        await this.vault.saveControllerProfile(name, this.gamepad.mapping);
        this.loadVaultProfilesList();
      };

      document.getElementById('cle-gp-vault-profiles').onchange = async (e) => {
        const name = e.target.value;
        if (!name) return;
        const profiles = await this.vault.getControllerProfiles();
        const found = profiles.find(p => p.name === name);
        if (found) {
          this.gamepad.mapping = found.profile;
          this.gamepad.saveMapping(name);
          this.notify(`Loaded profile "${name}" from Vault.`, 'ok');
          this.openModal('gamepad');
        }
      };
    } else if (type === 'vault') {
      this.loadVaultHistoryList();

      document.getElementById('cle-vault-btn-snap').onclick = async () => {
        const descInput = document.getElementById('cle-vault-snap-desc');
        const desc = descInput.value.trim() || 'Manual project check-in';
        this.notify('Creating project snapshot in Vault...');
        const res = await this.vault.takeSnapshot(desc);
        if (res.status === 'ok') {
          this.notify(`Snapshot created: ${res.short_hash}`, 'ok');
          descInput.value = '';
          this.loadVaultHistoryList();
        } else {
          this.notify(res.message || 'Snapshot clean (no changes).');
        }
      };

      document.getElementById('cle-vault-search').oninput = (e) => {
        this.loadVaultHistoryList(e.target.value);
      };
    } else if (type === 'recovery') {
      const updatePreview = () => {
        const l = parseInt(document.getElementById('rec-resume-line').value, 10) || 0;
        const z = parseFloat(document.getElementById('rec-safe-z').value) || 15.0;
        let lines = this.recovery.activeJob?.lines;
        if (!lines && this.slicer.rawGCode) lines = this.slicer.rawGCode.split('\n');
        if (lines) {
          const preview = this.recovery.generateResumeSequence(lines, l, z);
          document.getElementById('rec-preview').textContent = preview.split('\n').slice(0, 15).join('\n') + '\n...';
        }
      };
      document.getElementById('rec-resume-line').oninput = updatePreview;
      document.getElementById('rec-safe-z').oninput = updatePreview;
      updatePreview();

      document.getElementById('rec-btn-execute').onclick = () => {
        const l = parseInt(document.getElementById('rec-resume-line').value, 10) || 0;
        const z = parseFloat(document.getElementById('rec-safe-z').value) || 15.0;
        this.recovery.executeRecovery(l, z);
        this.closeModal();
      };
    } else if (type === 'slicer') {
      document.getElementById('slice-run-btn').onclick = async () => {
        const mode = document.getElementById('slice-mode').value;
        const layerH = document.getElementById('slice-layer-h').value;
        const infill = document.getElementById('slice-infill').value;
        const feed = document.getElementById('slice-feed').value;
        this.slicer.feedRate = parseFloat(feed) || 1500;
        await this.slicer.sliceModel({ mode, layerHeight: layerH, infill });
        this.closeModal();
      };
    } else if (type === 'machines') {
      const populateForm = (mach) => {
        document.getElementById('cle-m-name').value = mach.name || '';
        document.getElementById('cle-m-type').value = mach.type || 'cnc';
        document.getElementById('cle-m-tx').value = mach.travelX || 600;
        document.getElementById('cle-m-ty').value = mach.travelY || 500;
        document.getElementById('cle-m-tz').value = mach.travelZ || 100;
        document.getElementById('cle-m-ta').value = mach.travelA || 360;
        document.getElementById('cle-m-minz').value = mach.safeLimitZ !== undefined ? mach.safeLimitZ : 0.1;
        document.getElementById('cle-m-buffer').value = mach.clearanceX || 5.0;
        document.getElementById('cle-m-maxfeed').value = mach.maxRateXY || 5000;
        document.getElementById('cle-m-rpm').value = mach.spindleMaxRPM || 24000;
        document.getElementById('cle-m-ip').value = mach.wifiIP || '192.168.1.150';
      };

      const selector = document.getElementById('cle-mach-selector');
      selector.onchange = (e) => {
        const m = this.vault.getMachinesSync().find(x => x.id === e.target.value);
        if (m) populateForm(m);
      };

      document.getElementById('cle-mach-btn-activate').onclick = () => {
        this.vault.setActiveMachine(selector.value);
        this.closeModal();
      };

      document.getElementById('cle-mach-btn-query').onclick = () => {
        this.fluidnc.queryDeviceSettings();
        setTimeout(() => {
          const cur = this.vault.getActiveMachine();
          populateForm(cur);
        }, 1200);
      };

      document.getElementById('cle-mach-btn-read-yaml').onclick = () => {
        this.fluidnc.requestConfigYaml();
        setTimeout(() => {
          const cur = this.vault.getActiveMachine();
          populateForm(cur);
        }, 1500);
      };

      document.getElementById('cle-mach-btn-import-yaml').onclick = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.yaml,.yml';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            this.fluidnc.applyYamlCapabilityModel(ev.target.result, file.name);
            const cur = this.vault.getActiveMachine();
            populateForm(cur);
          };
          reader.readAsText(file);
        };
        input.click();
      };

      document.getElementById('cle-mach-btn-save').onclick = async () => {
        const curMach = this.vault.getMachinesSync().find(x => x.id === selector.value) || { id: 'mach_' + Date.now() };
        curMach.name = document.getElementById('cle-m-name').value.trim() || 'CNC Device';
        curMach.type = document.getElementById('cle-m-type').value;
        curMach.travelX = parseFloat(document.getElementById('cle-m-tx').value) || 600;
        curMach.travelY = parseFloat(document.getElementById('cle-m-ty').value) || 500;
        curMach.travelZ = parseFloat(document.getElementById('cle-m-tz').value) || 100;
        curMach.travelA = parseFloat(document.getElementById('cle-m-ta').value) || 360;
        curMach.safeLimitZ = parseFloat(document.getElementById('cle-m-minz').value) || 0.1;
        curMach.clearanceX = parseFloat(document.getElementById('cle-m-buffer').value) || 5.0;
        curMach.clearanceY = curMach.clearanceX;
        curMach.maxRateXY = parseFloat(document.getElementById('cle-m-maxfeed').value) || 5000;
        curMach.spindleMaxRPM = parseFloat(document.getElementById('cle-m-rpm').value) || 24000;
        curMach.wifiIP = document.getElementById('cle-m-ip').value.trim() || '192.168.1.150';

        await this.vault.saveMachine(curMach);
        this.openModal('machines');
      };

      document.getElementById('cle-mach-btn-new').onclick = () => {
        const newName = prompt('Enter New Device Name (e.g. Diode Laser 20W, TTC6050 Secondary):', 'New CNC Device');
        if (newName) {
          const newMach = {
            id: 'mach_' + Date.now(),
            name: newName,
            type: 'cnc',
            travelX: 600,
            travelY: 500,
            travelZ: 100,
            travelA: 360,
            safeLimitZ: 0.1,
            clearanceX: 5.0,
            maxRateXY: 5000,
            spindleMaxRPM: 24000,
            wifiIP: '192.168.1.150'
          };
          this.vault.saveMachine(newMach);
          this.openModal('machines');
        }
      };

      document.getElementById('cle-mach-btn-delete').onclick = async () => {
        if (confirm('Delete this device profile?')) {
          await this.vault.deleteMachine(selector.value);
          this.openModal('machines');
        }
      };
    }
  }

  buildRemapTableRows() {
    const actions = [
      { key: 'toggleMode', name: 'Toggle Mode', target: 'Design 3D <-> Manual CNC/Laser', default: 'Button 9 (Plus +)' },
      { key: 'macroRecord', name: 'Macro Record', target: 'Start / Stop G-Code Recording', default: 'Button 8 (Minus -)' },
      { key: 'zeroWCS', name: 'Zero WCS', target: 'Zero Active Axis (G10 L20)', default: 'Button 0 (A)' },
      { key: 'feedHold', name: 'Feed Hold', target: 'Immediate Machine Stop (!)', default: 'Button 1 (B)' },
      { key: 'touchProbe', name: 'Touch Plate Probe', target: 'Z-Probe Cycle (G38.2)', default: 'Button 2 (X)' },
      { key: 'cycleAxis', name: 'Cycle Axis', target: 'Switch Active Axis (Z->A->X->Y)', default: 'Button 3 (Y)' },
      { key: 'spindleToggle', name: 'Spindle Toggle', target: 'Turn Spindle ON / OFF (M3/M5)', default: 'Button 4 (L Shoulder)' },
      { key: 'laserToggle', name: 'Laser Toggle', target: 'Turn Laser ON / OFF (M3/M5)', default: 'Button 5 (R Shoulder)' },
      { key: 'dpadUp', name: 'D-Pad Up', target: 'Snap Top View / Step Y+', default: 'Button 12 (D-Pad Up)' },
      { key: 'dpadDown', name: 'D-Pad Down', target: 'Snap Front View / Step Y-', default: 'Button 13 (D-Pad Down)' },
      { key: 'dpadLeft', name: 'D-Pad Left', target: 'Snap Left View / Step X-', default: 'Button 14 (D-Pad Left)' },
      { key: 'dpadRight', name: 'D-Pad Right', target: 'Snap Right View / Step X+', default: 'Button 15 (D-Pad Right)' }
    ];

    const btns = this.gamepad.mapping.buttons;

    return actions.map(a => {
      const assigned = btns[a.key] !== undefined ? `Button ${btns[a.key]}` : a.default;
      return `
        <tr>
          <td><strong>${a.name}</strong></td>
          <td style="color:var(--ink-2);">${a.target}</td>
          <td><span id="cle-remap-val-${a.key}" style="font-family:var(--f-mono); color:var(--accent);">${assigned}</span></td>
          <td><button class="cle-btn" onclick="window.CLE.remapButton('${a.key}')" style="padding:2px 8px;">Bind</button></td>
        </tr>
      `;
    }).join('');
  }

  remapButton(actionKey) {
    const valEl = document.getElementById(`cle-remap-val-${actionKey}`);
    if (valEl) valEl.textContent = 'Press button on pad...';
    this.notify(`Press any button on controller for "${actionKey}"...`);

    this.gamepad.startListeningForRemap(actionKey, (res) => {
      if (res.type === 'button') {
        this.gamepad.mapping.buttons[actionKey] = res.index;
        if (valEl) valEl.textContent = `Button ${res.index}`;
        this.notify(`Bound "${actionKey}" to Button ${res.index}`, 'ok');
      }
    });
  }

  async loadVaultProfilesList() {
    const select = document.getElementById('cle-gp-vault-profiles');
    if (!select) return;
    const profiles = await this.vault.getControllerProfiles();
    select.innerHTML = '<option value="">Load Vault Profile...</option>' +
      profiles.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
  }

  async loadVaultHistoryList(query = '') {
    const list = document.getElementById('cle-vault-history-list');
    if (!list) return;
    const history = await this.vault.getVaultHistory(this.vault.getActiveProjectName(), query);
    if (!history || history.length === 0) {
      list.innerHTML = `<div style="color:var(--ink-3); font-size:11px; text-align:center; padding:12px;">No snapshots recorded for this project yet. Take your first snapshot above!</div>`;
      return;
    }

    list.innerHTML = history.map(c => `
      <div class="cle-vault-card">
        <div style="flex:1; min-width:0;">
          <div style="font-weight:600; font-size:12px; color:var(--ink); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
            ${c.message}
          </div>
          <div style="font-size:10px; color:var(--ink-3); margin-top:2px;">
            <span style="font-family:var(--f-mono); color:var(--accent); font-weight:700;">${c.short_hash}</span> &bull; ${c.author} &bull; ${c.date}
          </div>
        </div>
        <button class="cle-btn" onclick="window.CLE.restoreVaultCheckpoint('${c.commit_hash}')" style="background:var(--panel-2); border-color:var(--line); padding:4px 10px; font-size:11px;">Restore</button>
      </div>
    `).join('');
  }

  async restoreVaultCheckpoint(hash) {
    if (!confirm(`Restore project to revision ${hash.substring(0, 7)}? A safety snapshot will be saved first.`)) return;
    try {
      this.notify(`Restoring project to ${hash.substring(0, 7)}...`);
      await this.vault.restoreSnapshot(hash);
      this.notify(`✔ Restored project to revision ${hash.substring(0, 7)}!`, 'ok');
      this.closeModal();
    } catch (e) {
      this.notify(`Restore failed: ${e.message}`, 'error');
    }
  }

  bindGamepadModalRealtime() {
    this.gamepad.onFrameCallback = (gp, lx, ly, rx, ry, dpad) => {
      const nameEl = document.getElementById('cle-modal-gp-name');
      const lxEl = document.getElementById('cle-live-lx');
      const lyEl = document.getElementById('cle-live-ly');
      const rxEl = document.getElementById('cle-live-rx');
      const ryEl = document.getElementById('cle-live-ry');

      if (nameEl) nameEl.textContent = `${gp.id} (${gp.buttons.length} btns, ${gp.axes.length} axes)`;
      if (lxEl) lxEl.textContent = lx.toFixed(2);
      if (lyEl) lyEl.textContent = ly.toFixed(2);
      if (rxEl) rxEl.textContent = rx.toFixed(2);
      if (ryEl) ryEl.textContent = ry.toFixed(2);

      // Real-time Deflection meters for all axes 0..5
      for (let a = 0; a < 6; a++) {
        const val = gp.axes[a] || 0;
        const valEl = document.getElementById(`cle-axis-val-${a}`);
        const barEl = document.getElementById(`cle-axis-bar-${a}`);
        if (valEl) valEl.textContent = val.toFixed(2);
        if (barEl) {
          const pct = Math.max(0, Math.min(100, (val + 1) * 50));
          barEl.style.width = `${pct}%`;
        }
      }

      // Single-Active D-Pad Cross Cluster
      const dpadLabel = document.getElementById('cle-dpad-active-label');
      let activeDir = 'Center (None)';
      if (dpad.dpadUp) activeDir = 'UP ↑';
      else if (dpad.dpadDown) activeDir = 'DOWN ↓';
      else if (dpad.dpadLeft) activeDir = 'LEFT ←';
      else if (dpad.dpadRight) activeDir = 'RIGHT →';
      if (dpadLabel) dpadLabel.textContent = activeDir;

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
    };
  }

  saveGamepadSettingsFromModal() {
    this.gamepad.onFrameCallback = null;
    const m = this.gamepad.mapping;
    if (!m.axes) m.axes = {};

    m.axes.lx = parseInt(document.getElementById('cfg-axis-lx').value, 10);
    m.axes.ly = parseInt(document.getElementById('cfg-axis-ly').value, 10);
    m.axes.rx = parseInt(document.getElementById('cfg-axis-rx').value, 10);
    m.axes.ry = parseInt(document.getElementById('cfg-axis-ry').value, 10);

    m.design.invertLX = document.getElementById('cfg-inv-lx').checked;
    m.design.invertLY = document.getElementById('cfg-inv-ly').checked;
    m.design.invertRX = document.getElementById('cfg-inv-rx').checked;
    m.design.invertRY = document.getElementById('cfg-inv-ry').checked;

    this.gamepad.saveMapping();
  }

  closeModal() {
    if (this.gamepad) {
      this.gamepad.onFrameCallback = null;
      this.gamepad.stopListeningForRemap();
    }
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
