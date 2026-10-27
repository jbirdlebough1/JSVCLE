/* CLEJS Unified Bundle (Non-ES Module for direct file:// Chrome compatibility) */
(function(){
'use strict';

if (typeof THREE !== 'undefined' && THREE.Object3D) {
  if (!THREE.Object3D.prototype.removeFromParent) {
    THREE.Object3D.prototype.removeFromParent = function() { if (this.parent) this.parent.remove(this); return this; };
  }
}

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
    this.wifiUrl = localStorage.getItem('cle.cam.wifiUrl') || 'http://192.168.12.158:8080/video';
    this.reticleMode = 'crosshair'; // 'none' | 'crosshair' | 'bullseye' | 'grid'
    this.reticleColor = '#00ff66';   // High-contrast green
    this.cameraOffset = { X: 0.0, Y: 0.0 }; // Offset from camera center to spindle/laser center (mm)
    this.docked = false; // Viewport corner dock toggle
  }

  get isActive() {
    return this.activeType !== 'none' && ((this.stream !== null && this.stream.active) || this.activeType === 'wifi');
  }

  // Synchronize DOM elements (video feed, dropdown, placeholder) to current camera state
  syncUI() {
    const videoEl = document.getElementById('cle-cam-video');
    const imgEl = document.getElementById('cle-cam-img');
    const placeholder = document.getElementById('cle-cam-placeholder');
    const devSelect = document.getElementById('cle-cam-device-select');

    if (this.activeType === 'usb' && this.stream && this.stream.active) {
      if (videoEl) {
        if (videoEl.srcObject !== this.stream) {
          videoEl.srcObject = this.stream;
        }
        videoEl.style.display = 'block';
        try { videoEl.play(); } catch (e) {}
      }
      if (imgEl) imgEl.style.display = 'none';
      if (placeholder) placeholder.style.display = 'none';
    } else if (this.activeType === 'wifi' && this.wifiUrl) {
      if (videoEl) {
        videoEl.style.display = 'none';
        videoEl.srcObject = null;
      }
      if (imgEl) {
        imgEl.src = this.wifiUrl;
        imgEl.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
    } else {
      if (videoEl) {
        videoEl.style.display = 'none';
        videoEl.srcObject = null;
      }
      if (imgEl) {
        imgEl.style.display = 'none';
      }
      if (placeholder) placeholder.style.display = 'flex';
    }

    if (devSelect && this.selectedDeviceId) {
      devSelect.value = this.selectedDeviceId;
    }
    this.updateReticleCanvas();
  }

  // Automatically start USB camera from Vault configuration on CLE startup
  async autoStartIfAvailable(silent = true) {
    if (this.isActive) {
      this.syncUI();
      return true;
    }
    if (this._startPromise) return this._startPromise;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return false;
    }

    const vCfg = this.bridge?.vault ? this.bridge.vault.getCameraConfig() : {};

    try {
      const savedDevId = this.selectedDeviceId || vCfg.deviceId || localStorage.getItem('cle.cam.deviceId');
      return await this.startUSBCamera(savedDevId || undefined, silent);
    } catch (e) {
      console.warn('[CLE Camera] Auto-start check error:', e);
    }
    return false;
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

  // Start USB Webcam with auto-selection or selected deviceId (guarded against duplicate prompts)
  async startUSBCamera(deviceId = this.selectedDeviceId, silent = false) {
    if (this.isActive && this.stream && this.stream.active) {
      this.syncUI();
      return true;
    }
    if (this._isStarting && this._startPromise) {
      return this._startPromise;
    }
    this._isStarting = true;
    this._startPromise = (async () => {
      this.stopCamera(false);
      try {
        const vCfg = this.bridge?.vault ? this.bridge.vault.getCameraConfig() : {};
        const targetId = deviceId || this.selectedDeviceId || vCfg.deviceId || localStorage.getItem('cle.cam.deviceId');

        const constraints = {
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }
        };

        // Use ideal constraint so changed deviceId hashes never throw OverconstrainedError
        if (targetId) {
          constraints.video.deviceId = { ideal: targetId };
        }

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.permissionGranted = true;
        localStorage.setItem('cle.cam.permissionGranted', 'true');
        this.activeType = 'usb';

        // Capture device details now that stream is established and labels are populated
        let activeLabel = 'Logitech HD Webcam C270';
        try {
          const track = this.stream.getVideoTracks()[0];
          if (track) {
            const settings = track.getSettings ? track.getSettings() : {};
            if (settings.deviceId) this.selectedDeviceId = settings.deviceId;
            if (track.label) activeLabel = track.label;
          }
          const devices = await this.getAvailableDevices();
          const logi = devices.find(d => /logi|c270|webcam/i.test(d.label));
          const matched = (this.selectedDeviceId && devices.find(d => d.deviceId === this.selectedDeviceId)) ||
                          logi ||
                          (targetId && devices.find(d => d.deviceId === targetId)) ||
                          devices[0];
          if (matched) {
            this.selectedDeviceId = matched.deviceId;
            activeLabel = matched.label || activeLabel;
            localStorage.setItem('cle.cam.deviceId', matched.deviceId);
            localStorage.setItem('cle.cam.deviceLabel', activeLabel);
          }

          // Update UI dropdown
          const devSelect = document.getElementById('cle-cam-device-select');
          if (devSelect && devices.length > 0) {
            devSelect.innerHTML = devices.map(d => `<option value="${d.deviceId}">${d.label || 'USB Camera'}</option>`).join('');
            if (this.selectedDeviceId) devSelect.value = this.selectedDeviceId;
          }
        } catch (e) {}

        if (this.bridge && this.bridge.vault) {
          this.bridge.vault.saveCameraConfig({
            permissionGranted: true,
            deviceId: this.selectedDeviceId,
            deviceLabel: activeLabel,
            activeType: 'usb'
          });
        }

        this.syncUI();
        if (!silent) {
          this.bridge.notify(`Camera active: ${activeLabel} (720p @ 30 FPS)`, 'ok');
        }
        return true;
      } catch (err) {
        console.warn('[CLE Camera] Start USB cam error:', err);
        if (!silent) {
          this.bridge.notify(`Could not open camera: ${err.message}`, 'error');
        }
        return false;
      }
    })();

    try {
      return await this._startPromise;
    } finally {
      this._isStarting = false;
      this._startPromise = null;
    }
  }

  // Start Open Wi-Fi / IP Camera (MJPEG / HTTP stream)
  startWiFiCamera(url = this.wifiUrl) {
    this.stopCamera(false);
    this.wifiUrl = url;
    localStorage.setItem('cle.cam.wifiUrl', url);
    this.activeType = 'wifi';
    this.syncUI();
    this.bridge.notify(`Connecting to Wi-Fi camera at ${url}...`, 'ok');
  }

  stopCamera(resetActiveType = true) {
    if (this.stream) {
      try {
        this.stream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      this.stream = null;
    }
    if (resetActiveType) {
      this.activeType = 'none';
    }
    this.syncUI();
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

  async setMode(targetMode) {
    if (this.mode === targetMode) {
      this.updateModeUI();
      return;
    }
    this.mode = targetMode;
    this.updateModeUI();

    if (this.mode === 'manual') {
      // Connect to device if not connected
      if (this.bridge.fluidnc && !this.bridge.fluidnc.isConnected) {
        this.bridge.notify('Connecting to machine device...', 'info');
        await this.bridge.fluidnc.autoConnect();
      }
      // Show device card for control (which auto-starts camera if permission was previously granted)
      await this.bridge.openManualControlCenter();
      this.bridge.notify('Entered MANUAL CNC/LASER MODE. Machine control card active.', 'ok');
    } else {
      // Returned to Design 3D Mode
      const hub = document.getElementById('cle-manual-hub');
      if (hub) hub.style.display = 'none';
      this.bridge.notify('Entered DESIGN 3D VIEWPORT MODE');
    }
  }

  async toggleMode() {
    await this.setMode(this.mode === 'design' ? 'manual' : 'design');
  }

  updateModeUI() {
    const btnDesign = document.getElementById('cle-r-gp-design');
    const btnManual = document.getElementById('cle-r-gp-manual');
    const modeBtn = document.getElementById('cle-gp-mode-toggle');
    const legacyRibbonBtn = document.getElementById('cle-r-gp-mode');
    
    if (btnDesign) {
      btnDesign.setAttribute('aria-pressed', this.mode === 'design' ? 'true' : 'false');
      btnDesign.classList.toggle('active', this.mode === 'design');
    }
    if (btnManual) {
      btnManual.setAttribute('aria-pressed', this.mode === 'manual' ? 'true' : 'false');
      btnManual.classList.toggle('active', this.mode === 'manual');
    }
    if (modeBtn) {
      modeBtn.textContent = this.mode === 'design' ? 'Mode: Design 3D' : 'Mode: Manual CNC/Laser';
      modeBtn.classList.toggle('active', this.mode === 'manual');
    }
    if (legacyRibbonBtn) {
      const span = legacyRibbonBtn.querySelector('span');
      if (span) span.textContent = this.mode === 'design' ? 'Design Mode' : 'Manual Mode';
      legacyRibbonBtn.setAttribute('aria-pressed', this.mode === 'manual' ? 'true' : 'false');
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

  // D-Pad cluster cross: robust detection supporting standard buttons, DirectInput POV hat & discrete axes
  getDpadState(gp) {
    const upIdx = this.mapping.buttons?.dpadUp ?? 12;
    const downIdx = this.mapping.buttons?.dpadDown ?? 13;
    const leftIdx = this.mapping.buttons?.dpadLeft ?? 14;
    const rightIdx = this.mapping.buttons?.dpadRight ?? 15;

    let bUp = gp.buttons[upIdx] && (gp.buttons[upIdx].pressed || gp.buttons[upIdx].value > 0.5);
    let bDown = gp.buttons[downIdx] && (gp.buttons[downIdx].pressed || gp.buttons[downIdx].value > 0.5);
    let bLeft = gp.buttons[leftIdx] && (gp.buttons[leftIdx].pressed || gp.buttons[leftIdx].value > 0.5);
    let bRight = gp.buttons[rightIdx] && (gp.buttons[rightIdx].pressed || gp.buttons[rightIdx].value > 0.5);

    // Fallback: Check alternative buttons 14..17 if 12..15 are inactive
    if (!bUp && !bDown && !bLeft && !bRight && gp.buttons.length >= 18) {
      bUp = gp.buttons[14] && (gp.buttons[14].pressed || gp.buttons[14].value > 0.5);
      bDown = gp.buttons[15] && (gp.buttons[15].pressed || gp.buttons[15].value > 0.5);
      bLeft = gp.buttons[16] && (gp.buttons[16].pressed || gp.buttons[16].value > 0.5);
      bRight = gp.buttons[17] && (gp.buttons[17].pressed || gp.buttons[17].value > 0.5);
    }

    // DirectInput POV Hat on Axis 9 (Standard for Switch controllers in Windows DirectInput)
    if (!bUp && !bDown && !bLeft && !bRight && gp.axes && gp.axes.length > 9) {
      const pov = gp.axes[9];
      if (pov >= -1.05 && pov <= 1.05) {
        if (Math.abs(pov - (-1.0)) < 0.15 || Math.abs(pov - (1.0)) < 0.15) bUp = true;
        else if (Math.abs(pov - (-0.428)) < 0.15) bRight = true;
        else if (Math.abs(pov - (0.143)) < 0.15) bDown = true;
        else if (Math.abs(pov - (0.714)) < 0.15) bLeft = true;
      }
    }

    // Axes 4 and 5 fallback (when not mapped to main joysticks)
    if (!bUp && !bDown && !bLeft && !bRight && gp.axes && gp.axes.length >= 6) {
      const usedAxes = [this.mapping.axes.lx, this.mapping.axes.ly, this.mapping.axes.rx, this.mapping.axes.ry];
      if (!usedAxes.includes(4) && Math.abs(gp.axes[4]) > 0.6) {
        if (gp.axes[4] < -0.6) bLeft = true;
        if (gp.axes[4] > 0.6) bRight = true;
      }
      if (!usedAxes.includes(5) && Math.abs(gp.axes[5]) > 0.6) {
        if (gp.axes[5] < -0.6) bUp = true;
        if (gp.axes[5] > 0.6) bDown = true;
      }
    }

    // Mutually exclusive single-active cross button
    let dpadUp = false, dpadDown = false, dpadLeft = false, dpadRight = false;
    if (bUp && !bDown && !bLeft && !bRight) dpadUp = true;
    else if (bDown && !bUp && !bLeft && !bRight) dpadDown = true;
    else if (bLeft && !bRight && !bUp && !bDown) dpadLeft = true;
    else if (bRight && !bLeft && !bUp && !bDown) dpadRight = true;
    else if (bUp) dpadUp = true;
    else if (bDown) dpadDown = true;
    else if (bLeft) dpadLeft = true;
    else if (bRight) dpadRight = true;

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

    // 4. D-Pad Cross: Instant Orthogonal View Snaps (Works for buttons, POV hat and axes)
    if (!this.lastDpad) this.lastDpad = {};
    const dpadJustUp = dpad.dpadUp && !this.lastDpad.up;
    const dpadJustDown = dpad.dpadDown && !this.lastDpad.down;
    const dpadJustLeft = dpad.dpadLeft && !this.lastDpad.left;
    const dpadJustRight = dpad.dpadRight && !this.lastDpad.right;
    this.lastDpad = { up: dpad.dpadUp, down: dpad.dpadDown, left: dpad.dpadLeft, right: dpad.dpadRight };

    if (dpadJustUp) {
      if (app.setView) app.setView('top');
      else { app.vp.view.az = 0; app.vp.view.el = Math.PI / 2; }
      needsUpdate = true;
    } else if (dpadJustDown) {
      if (app.setView) app.setView('front');
      else { app.vp.view.az = 0; app.vp.view.el = 0; }
      needsUpdate = true;
    } else if (dpadJustLeft) {
      if (app.setView) app.setView('left');
      else { app.vp.view.az = -Math.PI / 2; app.vp.view.el = 0; }
      needsUpdate = true;
    } else if (dpadJustRight) {
      if (app.setView) app.setView('right');
      else { app.vp.view.az = Math.PI / 2; app.vp.view.el = 0; }
      needsUpdate = true;
    }

    // 5. Bumpers L / R (Buttons 4 / 5): Step Previous / Next Slice when Slicer Visualizer is open
    const lJust = this.isJustPressed(gp, 4);
    const rJust = this.isJustPressed(gp, 5);
    if ((lJust || rJust) && this.bridge?.slicer?.visualizerGroup) {
      if (lJust) {
        const prevBtn = document.getElementById('cle-hud-prev');
        if (prevBtn) prevBtn.click();
      } else if (rJust) {
        const nextBtn = document.getElementById('cle-hud-next');
        if (nextBtn) nextBtn.click();
      }
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
    const cachedIp = localStorage.getItem('cle.fluidnc.ip');
    if (!cachedIp || cachedIp === '192.168.1.100' || cachedIp === '192.168.1.150' || cachedIp === '192.168.12.150') {
      this.ip = '192.168.12.158';
      localStorage.setItem('cle.fluidnc.ip', '192.168.12.158');
    } else {
      this.ip = cachedIp.trim();
    }
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
    
    // Configure Active Tool Head (Spindle vs Laser)
    if (mach.activeHead === 'laser') {
      const laser = (mach.lasers && mach.lasers[mach.activeLaserIndex || 0]) || null;
      this.activeToolType = 'laser';
      this.activeLaser = laser;
      this.laserActive = false;
      this.spindleActive = false;
    } else {
      const spindle = (mach.spindles && mach.spindles[mach.activeSpindleIndex || 0]) || null;
      this.activeToolType = 'spindle';
      this.activeSpindle = spindle;
      if (spindle && spindle.maxRPM) this.spindleRPM = spindle.maxRPM;
      this.spindleActive = false;
      this.laserActive = false;
    }

    if (mach.wifiIP) {
      this.ip = mach.wifiIP;
      localStorage.setItem('cle.fluidnc.ip', mach.wifiIP);
    }
  }

  // Move Z to laser focal point (distance from output cone to workpiece Ztop)
  autoFocusLaser() {
    if (!this.isConnected) {
      this.bridge.notify('Connect to FluidNC first.', 'error');
      return;
    }
    const laser = this.activeLaser || this.bridge.vault.getActiveLaser();
    const focalDist = laser.focalDistanceMm || 30.0;
    this.sendGCode('G90');
    this.sendGCode(`G0 Z${focalDist.toFixed(2)} F800`);
    this.bridge.notify(`Positioned Z to laser focal point: ${focalDist}mm above Ztop (${laser.name})`, 'ok');
  }

  // Calculate & Set Laser Power with optical watts and electrical draw
  setLaserPower(pct) {
    const laser = this.activeLaser || this.bridge.vault.getActiveLaser();
    const clampedPct = Math.max(0, Math.min(100, pct));
    const opticalWatts = ((clampedPct / 100) * (laser.opticalWatts || 70.0)).toFixed(1);
    const electricalWatts = ((clampedPct / 100) * (laser.electricalWatts || 160.0)).toFixed(1);
    const pwmVal = Math.round((clampedPct / 100) * 1000);

    this.laserPowerPct = clampedPct;
    if (this.laserActive && this.isConnected) {
      this.sendGCode(`M3 S${pwmVal}`);
    }
    return {
      percent: clampedPct,
      opticalWatts,
      electricalWatts,
      pwmVal
    };
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

  // Auto-connect to active machine device (WebSocket / IP)
  async autoConnect() {
    if (this.isConnected) return true;
    const mach = this.bridge.vault ? this.bridge.vault.getActiveMachine() : null;
    const ip = (mach && mach.wifiIP) ? mach.wifiIP : this.ip;
    if (ip && ip !== 'none' && ip.trim().length > 0) {
      try {
        this.connectWebSocket(ip.trim());
        return true;
      } catch (e) {
        console.warn('[CLE FluidNC] WebSocket auto-connect error:', e);
      }
    }
    return false;
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
      if (this.bridge && this.bridge.camera) {
        this.bridge.camera.autoStartIfAvailable();
      }
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
    let rawInput = (ip || this.ip || '192.168.12.158').trim();
    // Strip protocols and trailing slashes
    let host = rawInput.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/.*$/, '').trim();

    // Clean up stale IPs
    if (host === '192.168.12.150' || host === '192.168.1.150' || host === '192.168.1.100') {
      host = '192.168.12.158';
    }

    this.ip = host;
    localStorage.setItem('cle.fluidnc.ip', host);
    if (this.bridge && this.bridge.vault) {
      const mach = this.bridge.vault.getActiveMachine();
      if (mach && mach.wifiIP !== host) {
        mach.wifiIP = host;
        this.bridge.vault.saveMachine(mach);
      }
    }

    if (this.socket) {
      try { this.socket.close(); } catch (e) {}
      this.socket = null;
    }

    // Map mDNS hostname 'ttcwifi.local' or 'ttcwifi' to resolved IP 192.168.12.158 for WebSocket
    // (Chromium cannot resolve .local mDNS domains for WebSocket connections)
    let wsHost = host;
    if (host.toLowerCase() === 'ttcwifi.local' || host.toLowerCase() === 'ttcwifi' || host.toLowerCase() === 'ttc6050') {
      wsHost = '192.168.12.158';
    }

    // Candidate WebSocket URLs in priority order:
    // 1. ws://${wsHost} (port 80 default, root path '/') -> Fastest connection for TwoTrees TTC6050 DLC32 MAX
    // 2. ws://${wsHost}:81 -> FluidNC raw telnet/websocket port
    // 3. ws://${wsHost}/websocket -> ESP32 Web Server websocket endpoint
    const candidates = [
      `ws://${wsHost}`,
      `ws://${wsHost}:81`,
      `ws://${wsHost}/websocket`
    ];

    this._probeWebSocketCandidates(candidates, 0, host);
  }

  _probeWebSocketCandidates(candidates, index, displayHost) {
    if (index >= candidates.length) {
      this.bridge.notify(`Could not connect to FluidTouch/FluidNC at ${displayHost} via WebSocket`, 'error');
      this.disconnect();
      return;
    }

    const wsUrl = candidates[index];
    let connected = false;
    let connectTimeout = null;

    try {
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';
      this.socket = ws;

      connectTimeout = setTimeout(() => {
        if (!connected && ws.readyState !== WebSocket.OPEN) {
          try { ws.close(); } catch (e) {}
          console.log(`[CLE FluidNC] Candidate ${wsUrl} timed out, trying next...`);
          this._probeWebSocketCandidates(candidates, index + 1, displayHost);
        }
      }, 2500);

      ws.onopen = () => {
        connected = true;
        if (connectTimeout) clearTimeout(connectTimeout);
        this.isConnected = true;
        this.connectionType = 'websocket';
        this.logConsole(`[SYSTEM] Connected to FluidTouch/FluidNC at ${displayHost} (${wsUrl}).`);
        this.bridge.notify(`Connected to FluidTouch/FluidNC at ${displayHost}`, 'ok');
        this.updateConnectionUI(true);
        this.startStatusPolling();
        if (this.bridge && this.bridge.camera) {
          this.bridge.camera.autoStartIfAvailable();
        }
      };

      ws.onmessage = (event) => {
        let data = event.data;
        if (data instanceof ArrayBuffer) {
          data = new TextDecoder().decode(data);
        }
        this.handleIncomingData(data);
      };

      ws.onerror = (err) => {
        if (!connected) {
          if (connectTimeout) clearTimeout(connectTimeout);
          try { ws.close(); } catch (e) {}
          console.log(`[CLE FluidNC] Candidate ${wsUrl} error, trying next...`);
          this._probeWebSocketCandidates(candidates, index + 1, displayHost);
          return;
        }
        this.bridge.notify(`WebSocket connection error on ${displayHost}`, 'error');
      };

      ws.onclose = () => {
        if (connected) {
          this.disconnect();
        }
      };
    } catch (err) {
      if (!connected) {
        this._probeWebSocketCandidates(candidates, index + 1, displayHost);
      } else {
        this.bridge.notify(`WebSocket failed: ${err.message}`, 'error');
      }
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
    const manBadge = document.getElementById('cle-man-conn-status');
    if (manBadge) {
      manBadge.textContent = connected ? `Connected (${this.connectionType.toUpperCase()})` : 'Offline';
      manBadge.className = `cle-badge ${connected ? 'connected' : 'alert'}`;
    }
    const machBtn = document.getElementById('cle-mach-btn-connect');
    if (machBtn) {
      machBtn.textContent = connected ? 'Disconnect' : 'Connect';
    }
  }

  startStatusPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendImmediate('?');
      }
    }, 250);
  }

  handleIncomingData(chunk) {
    if (typeof chunk !== 'string') {
      if (chunk instanceof ArrayBuffer) {
        chunk = new TextDecoder().decode(chunk);
      } else if (chunk && chunk.buffer instanceof ArrayBuffer) {
        chunk = new TextDecoder().decode(chunk.buffer);
      } else {
        try {
          chunk = String(chunk);
        } catch (e) {
          return;
        }
      }
    }
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Filter out internal ESP32 heartbeat counter packets to stop console DOM spam and memory leaks
      if (/^currentid:/i.test(trimmed)) continue;

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
      } else {
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
      if (el && el.textContent !== val) el.textContent = val;
    };
    const xStr = this.wpos.X.toFixed(2);
    const yStr = this.wpos.Y.toFixed(2);
    const zStr = this.wpos.Z.toFixed(2);
    const aStr = this.wpos.A.toFixed(1);

    updateVal('cle-dro-x', xStr);
    updateVal('cle-dro-y', yStr);
    updateVal('cle-dro-z', zStr);
    updateVal('cle-dro-a', aStr);

    // Update manual panel DRO if open
    updateVal('cle-man-dro-x', xStr);
    updateVal('cle-man-dro-y', yStr);
    updateVal('cle-man-dro-z', zStr);
    updateVal('cle-man-dro-a', aStr);

    if (!this._lastReportedPos) this._lastReportedPos = { X: NaN, Y: NaN, Z: NaN, A: NaN };
    const dx = Math.abs(this.wpos.X - this._lastReportedPos.X);
    const dy = Math.abs(this.wpos.Y - this._lastReportedPos.Y);
    const dz = Math.abs(this.wpos.Z - this._lastReportedPos.Z);
    const da = Math.abs(this.wpos.A - this._lastReportedPos.A);

    // Only update 3D scene & recovery when position has actually changed
    if (dx > 0.02 || dy > 0.02 || dz > 0.02 || da > 0.05) {
      this._lastReportedPos = { ...this.wpos };

      // Update 3D Bed Toolhead Cursor in real time
      if (this.bridge.bed) {
        this.bridge.bed.updateToolCursor(this.wpos);
      }
      if (this.bridge.rotary && this.bridge.rotary.enabled && isFinite(this.wpos.A)) {
        this.bridge.rotary.setAngle(this.wpos.A);
      }

      if (this.isStreaming && this.bridge.recovery) {
        this.bridge.recovery.recordPosition(this.wpos, this.feedRate, this.spindleRPM);
      }
    }
  }

  // --- Real-time Surface Compensation / 0.1mm Micro-Stepping ---
  // Allows pausing job and nudging X/Y/Z/A in +/- 0.1mm increments to compensate for uneven workpiece surface
  compensateAxis(axis, delta = 0.1) {
    if (!this.isConnected) {
      this.bridge.notify('Connect to machine first.', 'error');
      return;
    }
    const ax = axis.toUpperCase();
    const rate = ax === 'Z' ? 200 : 500;
    // FluidNC realtime jog command
    const jogCmd = `$J=G91 G21 ${ax}${delta > 0 ? '+' : ''}${delta.toFixed(2)} F${rate}`;
    this.sendImmediate(jogCmd + '\n');
    this.bridge.notify(`Surface Compensated ${ax} by ${delta > 0 ? '+' : ''}${delta.toFixed(2)}mm`, 'ok');
    this.logConsole(`[COMPENSATION] ${ax} ${delta > 0 ? '+' : ''}${delta.toFixed(2)}mm ($J)`);
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
    const clean = gcode.trim();
    if (!clean) return;

    if (!this.isConnected) {
      this.logConsole(`[SEND FAIL] "${clean}" — FluidNC is offline. Connect machine first.`);
      this.bridge.notify('FluidNC is not connected', 'error');
      return;
    }

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
          const minZBound = (this.bridge.rotary && this.bridge.rotary.enabled)
            ? Math.max(sl.minZ, this.bridge.rotary.getZBot())
            : sl.minZ;
          if (targetZ < minZBound) {
            // Hard clamp: Never plunge below bed or A-axis -5mm safety boundary
            const allowed = Math.max(0, minZBound - this.wpos.Z);
            if (allowed <= 0.001) {
              this.bridge.notify(`Soft-Limit: Z clamped at +${minZBound.toFixed(2)}mm (rotary safety boundary)`, 'error');
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
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const formatted = `[${timestamp}] ${msg}`;
    this.consoleLogs.push(formatted);
    if (this.consoleLogs.length > this.maxConsoleLogs) {
      this.consoleLogs.shift();
    }
    const consoleEl = document.getElementById('cle-man-console') || document.getElementById('cle-man-console-body');
    if (consoleEl) {
      consoleEl.innerHTML = this.consoleLogs.map(l => `<div style="margin-bottom:2px;">${l}</div>`).join('');
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
    let cleanIp = (this.ip || '192.168.12.158').trim();
    cleanIp = cleanIp.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/.*$/, '').trim();
    if (cleanIp === '192.168.12.150' || cleanIp === '192.168.1.150' || cleanIp === '192.168.1.100') {
      cleanIp = '192.168.12.158';
    }
    const url = `http://${cleanIp}`;
    let win = null;
    try {
      win = window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {}
    if (!win) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 100);
    }
    this.bridge.notify(`Opening FluidTouch Web GUI at ${url}`, 'info');
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

    const next = this.sendQueue[0];
    // Detect Tool Change request M6 T#
    const m6Match = next ? next.match(/M6\s*(?:T(\d+))?/i) : null;
    if (m6Match) {
      this.sendQueue.shift();
      const toolNum = m6Match[1] ? parseInt(m6Match[1], 10) : 1;
      this.triggerToolChange(toolNum, next);
      return;
    }

    this.sendQueue.shift();
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

  // --- Tool Change Routine & State Preservation ---
  triggerToolChange(toolNum, gcodeLine) {
    this.isStreaming = false;
    this.toolChangeResumeState = {
      toolNum,
      gcodeLine,
      lineIndex: this.streamLineIndex,
      lastPos: { ...this.wpos },
      feedRate: this.feedRate,
      spindleRPM: this.spindleRPM
    };

    this.bridge.notify(`Tool change requested: Tool #${toolNum}. Retracting to safe clearance...`, 'info');
    // Safe clearance retract
    this.sendImmediate('M5\n');
    this.sendImmediate('G0 Z20.000 F800\n');

    if (this.bridge && this.bridge.openToolChangeCard) {
      this.bridge.openToolChangeCard(this.toolChangeResumeState);
    }
  }

  continueAfterToolChange() {
    if (!this.toolChangeResumeState) {
      this.isStreaming = true;
      this.sendNextQueued();
      return;
    }

    const s = this.toolChangeResumeState;
    this.bridge.notify(`Resuming job with Tool #${s.toolNum}...`, 'ok');

    // 1. Return to saved XY at safe clearance Z
    this.sendImmediate(`G0 X${s.lastPos.X.toFixed(3)} Y${s.lastPos.Y.toFixed(3)} F3000\n`);
    // 2. Restore Spindle if running
    if (s.spindleRPM > 0) {
      this.sendImmediate(`M3 S${s.spindleRPM}\n`);
      this.sendImmediate('G4 P2\n'); // Dwell 2 sec for spindle spin-up
    }
    // 3. Plunge back to cutting Z
    this.sendImmediate(`G1 Z${s.lastPos.Z.toFixed(3)} F${s.feedRate || 300}\n`);

    this.toolChangeResumeState = null;
    this.isStreaming = true;
    this.sendNextQueued();
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
 * TwoTrees TTC6050 / TTC450 4th Axis Kit Integration
 * Turning Mode (RPM & deg/s), Settable Gear Ratio (5:1 default), Center Y & Z=45mm Mounting,
 * -5mm Safety Floor Boundary, Radial 3D Rotation, and Top-Down Index Mode (CNC & Laser)
 * 
 * Auto-fits Chuck (headstock) and Opposing Center (tailstock live center) to clamp at each end of the object.
 * Pure on-axis radial rotation with zero orbital wobble and zero dummy stock clutter.
 */

class CLERotaryEngine {
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
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.9, roughness: 0.2 });
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
    const liveTipMat = new THREE.MeshStandardMaterial({ color: 0xef4444, metalness: 0.95, roughness: 0.1 });
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
      color: 0xef4444, // Bright Red
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

/* --- Module: cle_calibration.js --- */
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

class CLECalibrationEngine {
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
          spindleMaxRPM: 24000,
          wifiIP: '192.168.12.158',
          spoilboardX: 600,
          spoilboardY: 500,
          spoilboardThickness: 20.0,
          rotaryConfig: {
            gearRatio: 5.0,
            motorPulleyMm: 15.0,
            chuckPulleyMm: 55.0,
            stepsPerRev: 200,
            microsteps: 16,
            centerHeightMm: 45.0,
            centerY: 250.0,
            startX: 20.0,
            stockDiameter: 50.0,
            stockLength: 150.0,
            zSafetyLimit: -5.0,
            zClearance: 10.0
          },
          cameraConfig: {
            permissionGranted: true,
            activeType: 'usb',
            deviceLabel: 'Logitech HD Webcam C270',
            deviceId: ''
          }
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
        id: 'ttc6050_custom_dlc32',
        name: 'TwoTrees TTC6050 (MKS DLC32 MAX 4-Axis)',
        chassis: 'TwoTrees TTC6050',
        board: 'MKS DLC32 MAX (ESP32-WROVER-32E, 4-Axis True Motion)',
        drivers: 'XYZ Closed-Loop CL57 Stepper Drivers',
        encoders: 'VTA102 40K CPR Optical Encoders',
        firmware: 'FluidNC v3.7+ Current FW',
        travelX: 600,
        travelY: 500,
        travelZ: 100,
        travelA: 10000,
        spoilboardX: 600,            // Spoilboard Width (mm)
        spoilboardY: 500,            // Spoilboard Length/Depth (mm)
        spoilboardThickness: 20.0,   // Spoilboard Thickness (mm, 20mm MDF spoilboard)
        spoilboardOffsetX: 0.0,      // Spoilboard Offset X from Machine 0,0
        spoilboardOffsetY: 0.0,      // Spoilboard Offset Y from Machine 0,0
        cutoutOvercut: 0.2,          // 0.2mm breakthrough into spoilboard for clean cutouts
        stepsPerMmX: 640.0,
        stepsPerMmY: 640.0,
        stepsPerMmZ: 640.0,
        stepsPerMmA: 40.776,
        safeLimitZ: 0.1,    // 0.1mm above bed spoilboard protection
        clearanceX: 5.0,    // 5mm buffer from endstops
        clearanceY: 5.0,    // 5mm buffer from endstops
        maxRateXY: 5000,
        maxRateZ: 500,
        maxRateA: 2000,
        wifiIP: '192.168.12.158',
        activeHead: 'spindle', // 'spindle' | 'laser'
        activeSpindleIndex: 0,
        activeLaserIndex: 0,
        spindles: [
          {
            id: 'sp1',
            number: 1,
            name: 'Spindle 1: Stock TTC 500W DC (12,000 RPM)',
            type: 'DC PWM (gpio.35)',
            toolNum: 0,
            maxRPM: 12000,
            minRPM: 1000,
            spinupMs: 1500,
            pwmHz: 5000,
            notes: 'Stock TTC6050 spindle for general carving and light engraving'
          },
          {
            id: 'sp2',
            number: 2,
            name: 'Spindle 2: 800W Air-Cooled Router (24,000 RPM)',
            type: 'Trim Router / ER11',
            toolNum: 0,
            maxRPM: 24000,
            minRPM: 5000,
            spinupMs: 2000,
            pwmHz: 5000,
            notes: 'High-speed router for rapid wood and acrylic pocketing'
          },
          {
            id: 'sp3',
            number: 3,
            name: 'Spindle 3: 1.5kW Water-Cooled VFD (24,000 RPM)',
            type: 'VFD Spindle / ER16',
            toolNum: 0,
            maxRPM: 24000,
            minRPM: 6000,
            spinupMs: 3500,
            pwmHz: 5000,
            notes: 'Heavy duty, low-runout spindle for aluminum 6061 and precision 3D reliefs'
          }
        ],
        lasers: [
          {
            id: 'ls1',
            number: 1,
            name: 'Laser 1: A70 Ultra-Power Laser (70W Optical)',
            laserType: 'Quad/Octa Diode Array (gpio.2)',
            toolNum: 1,
            opticalWatts: 70.0,      // Optical output delivered to Ztop
            electricalWatts: 160.0,  // Actual power consumption draw
            efficiencyPct: 43.75,    // 70W / 160W = 43.75%
            pwmFrequencyHz: 5000,    // Configurable 2,500Hz - 20,000Hz
            focalDistanceMm: 30.0,   // Distance from tip of output cone to Ztop of workpiece
            spotDiameterMm: 0.08,
            maxFeedRate: 10000,
            notes: 'Atomstack/IKIER A70 high power cutter: 70W optical at Ztop, 160W electrical'
          },
          {
            id: 'ls2',
            number: 2,
            name: 'Laser 2: 20W Precision Engraver (20W Optical)',
            laserType: 'Diode Array (gpio.2)',
            toolNum: 1,
            opticalWatts: 20.0,      // Optical output delivered to Ztop
            electricalWatts: 120.0,  // Actual power consumption draw
            efficiencyPct: 16.67,
            pwmFrequencyHz: 5000,    // Configurable 2,500Hz - 20,000Hz
            focalDistanceMm: 20.0,   // Distance from tip of output cone to Ztop of workpiece
            spotDiameterMm: 0.05,
            maxFeedRate: 8000,
            notes: 'Fine-focus 20W diode head for high-resolution photo engraving and vector marking'
          }
        ]
      }
    ];
  }

  getActiveHead() {
    const mach = this.getActiveMachine();
    if (mach.activeHead === 'laser') {
      const idx = mach.activeLaserIndex || 0;
      return { type: 'laser', tool: mach.lasers ? mach.lasers[idx] : null };
    }
    const idx = mach.activeSpindleIndex || 0;
    return { type: 'spindle', tool: mach.spindles ? mach.spindles[idx] : null };
  }

  getActiveSpindle() {
    const mach = this.getActiveMachine();
    const idx = mach.activeSpindleIndex || 0;
    return (mach.spindles && mach.spindles[idx]) || (this.getDefaultMachines()[0].spindles[0]);
  }

  getActiveLaser() {
    const mach = this.getActiveMachine();
    const idx = mach.activeLaserIndex || 0;
    return (mach.lasers && mach.lasers[idx]) || (this.getDefaultMachines()[0].lasers[0]);
  }

  setActiveHead(headType, toolIndex = 0) {
    const mach = this.getActiveMachine();
    mach.activeHead = headType;
    if (headType === 'spindle') mach.activeSpindleIndex = toolIndex;
    if (headType === 'laser') mach.activeLaserIndex = toolIndex;
    this.saveMachine(mach);
    if (this.bridge.fluidnc) {
      this.bridge.fluidnc.applyMachineProfile(mach);
    }
    const tool = headType === 'spindle' ? mach.spindles[toolIndex] : mach.lasers[toolIndex];
    this.bridge.notify(`Active tool changed to ${headType.toUpperCase()}: ${tool.name}`, 'ok');
  }

  getActiveMachine() {
    const list = this.getMachinesSync();
    const activeId = localStorage.getItem('cle.vault.active_machine_id');
    const mach = list.find(m => m.id === activeId) || list[0] || this.getDefaultMachines()[0];
    if (mach) {
      if (mach.spoilboardX === undefined) mach.spoilboardX = mach.travelX || 600;
      if (mach.spoilboardY === undefined) mach.spoilboardY = mach.travelY || 500;
      if (mach.spoilboardThickness === undefined || mach.spoilboardThickness === 15.0) mach.spoilboardThickness = 20.0;
      if (mach.spoilboardOffsetX === undefined) mach.spoilboardOffsetX = 0.0;
      if (mach.spoilboardOffsetY === undefined) mach.spoilboardOffsetY = 0.0;
      if (mach.cutoutOvercut === undefined) mach.cutoutOvercut = 0.2;

      // Clean up legacy/stale IPs (.150, .100, etc.) from localStorage
      const savedFluidIp = localStorage.getItem('cle.fluidnc.ip');
      if (savedFluidIp && (savedFluidIp === '192.168.12.150' || savedFluidIp === '192.168.1.150' || savedFluidIp === '192.168.1.100')) {
        localStorage.setItem('cle.fluidnc.ip', '192.168.12.158');
      }

      // Ensure valid WiFi IP without overwriting user custom IP
      if (!mach.wifiIP || mach.wifiIP === '192.168.1.150' || mach.wifiIP === '192.168.12.150' || mach.wifiIP === '192.168.1.100') {
        const currentSaved = localStorage.getItem('cle.fluidnc.ip');
        mach.wifiIP = (currentSaved && currentSaved !== '192.168.12.150' && currentSaved !== '192.168.1.150' && currentSaved !== '192.168.1.100')
          ? currentSaved.trim()
          : '192.168.12.158';
        localStorage.setItem('cle.fluidnc.ip', mach.wifiIP);
      } else {
        localStorage.setItem('cle.fluidnc.ip', mach.wifiIP);
      }
    }
    return mach;
  }

  setActiveMachine(machineId) {
    const list = this.getMachinesSync();
    const found = list.find(m => m.id === machineId);
    if (!found) return;
    localStorage.setItem('cle.vault.active_machine_id', machineId);
    if (found.wifiIP) {
      localStorage.setItem('cle.fluidnc.ip', found.wifiIP);
      if (this.bridge.fluidnc) {
        this.bridge.fluidnc.ip = found.wifiIP;
      }
    }
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
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach(m => {
            if (!m.wifiIP || m.wifiIP === '192.168.1.150' || m.wifiIP === '192.168.12.150' || m.wifiIP === '192.168.1.100') {
              m.wifiIP = '192.168.12.158';
            }
          });
          return parsed;
        }
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
    machines.forEach(m => {
      if (!m.wifiIP || m.wifiIP === '192.168.1.150' || m.wifiIP === '192.168.12.150' || m.wifiIP === '192.168.1.100') {
        m.wifiIP = '192.168.12.158';
      }
    });
    localStorage.setItem('cle.vault.machines', JSON.stringify(machines));
    return machines;
  }

  async saveMachine(machine) {
    if (!machine.id) {
      machine.id = 'mach_' + Date.now();
    }
    if (machine.wifiIP === '192.168.12.150' || machine.wifiIP === '192.168.1.150' || machine.wifiIP === '192.168.1.100' || !machine.wifiIP) {
      machine.wifiIP = '192.168.12.158';
    }

    try {
      await fetch(`${this.serverUrl}/api/vault/machine/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine })
      });
    } catch {}

    const list = this.getMachinesSync();
    const idx = list.findIndex(m => m.id === machine.id);
    if (idx >= 0) {
      list[idx] = machine;
    } else {
      list.push(machine);
    }
    localStorage.setItem('cle.vault.machines', JSON.stringify(list));
    localStorage.setItem('cle.vault.active_machine_id', machine.id);
    localStorage.setItem('cle.fluidnc.ip', machine.wifiIP);

    if (this.bridge && this.bridge.fluidnc) {
      this.bridge.fluidnc.ip = machine.wifiIP;
      this.bridge.fluidnc.applyMachineProfile(machine);
    }
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

  // --- Persistent Camera Permission & Device Configuration ---
  async saveCameraConfig(cfg) {
    const current = this.getCameraConfig();
    const updated = { ...current, ...cfg, lastSaved: Date.now() };
    localStorage.setItem('cle.vault.camera', JSON.stringify(updated));
    if (cfg.deviceId) localStorage.setItem('cle.cam.deviceId', cfg.deviceId);
    if (cfg.wifiUrl) localStorage.setItem('cle.cam.wifiUrl', cfg.wifiUrl);
    if (cfg.permissionGranted !== undefined) {
      localStorage.setItem('cle.cam.permissionGranted', cfg.permissionGranted ? 'true' : 'false');
    }
    const mach = this.getActiveMachine();
    if (mach) {
      mach.cameraConfig = updated;
      await this.saveMachine(mach);
      console.log('[CLE Vault] Camera permission & config committed to active machine in Vault.');
    }
  }

  getCameraConfig() {
    const mach = this.getActiveMachine();
    if (mach && mach.cameraConfig) {
      if (mach.cameraConfig.permissionGranted !== undefined) {
        localStorage.setItem('cle.cam.permissionGranted', mach.cameraConfig.permissionGranted ? 'true' : 'false');
      }
      return mach.cameraConfig;
    }
    try {
      const raw = localStorage.getItem('cle.vault.camera');
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return {
      permissionGranted: true,
      deviceId: localStorage.getItem('cle.cam.deviceId') || '',
      deviceLabel: localStorage.getItem('cle.cam.deviceLabel') || 'Logitech HD Webcam C270',
      wifiUrl: localStorage.getItem('cle.cam.wifiUrl') || 'http://192.168.12.158:8080/video',
      activeType: 'usb'
    };
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
      const now = Date.now();
      // Throttle checkpoint disk/localStorage writes to at most once per second
      if (!this._lastSavedTime || (now - this._lastSavedTime > 1000)) {
        this._lastSavedTime = now;
        this.saveCheckpoint();
      }
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
          // Keep natural CAD body color with translucent opacity
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

      // Clear any legacy orange edge outlines if present
      if (obj._cleEdges) {
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

/* --- Module: cle_tool_library.js --- */
/**
 * CLEJS - Tool Library & Tool Change Subsystem (V1)
 * Supports Manual Tool Change (MTC) with Toolsetter Probing, Automated Tool Change (ATC),
 * Spindle & Laser Tool Models, Optical Power Scaling, and FluidNC Tool Length Offsets (TLO)
 */

class CLEToolLibrary {
  constructor(bridge) {
    this.bridge = bridge;
    this.storageKey = 'cle.vault.tool_library';
    this.toolsetterKey = 'cle.vault.toolsetter_config';
    this.activeToolNumber = 1;

    this.toolsetter = this.loadToolsetterConfig();
    this.tools = this.loadTools();
  }

  loadToolsetterConfig() {
    const defaultSetter = {
      enabled: true,
      mode: 'mtc_probe', // 'mtc_probe' | 'mtc_fixed' | 'atc_rack'
      parkPosition: { X: 10.0, Y: 10.0, Z: -5.0 }, // G53 Machine Coordinates for bit swap
      setterPosition: { X: 25.0, Y: 25.0, Z: -5.0 }, // G53 Machine Coordinates of toolsetter
      touchPlateThicknessMm: 15.0, // Height of touch plate / toolsetter sensor
      maxProbeDistanceMm: 70.0,
      fastProbeFeed: 300,  // mm/min
      slowProbeFeed: 50,   // mm/min
      retractDistanceMm: 5.0,
      spindleSpinupDwellSec: 2.0
    };
    try {
      const saved = localStorage.getItem(this.toolsetterKey);
      if (saved) return { ...defaultSetter, ...JSON.parse(saved) };
    } catch {}
    return defaultSetter;
  }

  saveToolsetterConfig(cfg = this.toolsetter) {
    this.toolsetter = cfg;
    try {
      localStorage.setItem(this.toolsetterKey, JSON.stringify(this.toolsetter));
      this.bridge.notify('Toolsetter & Tool Change configuration saved.', 'ok');
    } catch {}
  }

  getDefaultTools() {
    return [
      {
        number: 1,
        name: '1/4" (6.35mm) 2-Flute Carbide Endmill',
        type: 'flat',
        diameter: 6.35,
        fluteLength: 22.0,
        overallLength: 60.0,
        flutes: 2,
        spindleNumber: 1, // Spindle 1 (Stock TTC 500W), 2 (800W Router), or 3 (1.5kW VFD)
        spindleRPM: 12000,
        feedXY: 1800,
        plungeZ: 400,
        stepoverPct: 40,
        passDepth: 1.5,
        changeMode: 'mtc_probe',
        atcSlot: 1,
        notes: 'General roughing & profiling for plywood, hardwood, and acrylic'
      },
      {
        number: 2,
        name: '1/8" (3.175mm) 2-Flute Flat Endmill',
        type: 'flat',
        diameter: 3.175,
        fluteLength: 12.0,
        overallLength: 38.0,
        flutes: 2,
        spindleNumber: 1,
        spindleRPM: 12000,
        feedXY: 1400,
        plungeZ: 300,
        stepoverPct: 40,
        passDepth: 1.0,
        changeMode: 'mtc_probe',
        atcSlot: 2,
        notes: 'Fine profiling, small pockets, and precision contour cutouts'
      },
      {
        number: 3,
        name: '1/8" (3.175mm) Tapered Ball Nose Carver (R0.5)',
        type: 'ball',
        diameter: 3.175,
        tipRadius: 0.5,
        fluteLength: 15.0,
        overallLength: 45.0,
        flutes: 2,
        spindleNumber: 2,
        spindleRPM: 18000,
        feedXY: 1600,
        plungeZ: 350,
        stepoverPct: 10,
        passDepth: 0.5,
        changeMode: 'mtc_probe',
        atcSlot: 3,
        notes: 'Continuous 3D relief finishing and artistic topography carves'
      },
      {
        number: 4,
        name: '60° Carbide V-Carve Engraving Bit',
        type: 'vbit',
        diameter: 6.35,
        angle: 60,
        tipWidth: 0.1,
        fluteLength: 12.0,
        overallLength: 45.0,
        flutes: 1,
        spindleNumber: 1,
        spindleRPM: 12000,
        feedXY: 1200,
        plungeZ: 250,
        stepoverPct: 20,
        passDepth: 1.0,
        changeMode: 'mtc_probe',
        atcSlot: 4,
        notes: 'Precision letter carving, beveling, and chamfering'
      },
      {
        number: 5,
        name: 'Laser Tool 1: A70 70W Optical Laser Head',
        type: 'laser',
        diameter: 0.08, // Spot diameter
        laserNumber: 1,
        laserType: 'Diode Array (gpio.2)',
        opticalWatts: 70.0,      // Optical output delivered to Ztop
        electricalWatts: 160.0,  // Actual power consumption draw
        efficiencyPct: 43.75,    // 70W / 160W = 43.75%
        pwmFrequencyHz: 5000,    // Configurable 2,500Hz - 20,000Hz
        focalDistanceMm: 30.0,   // Distance from tip of output cone to Ztop of workpiece
        feedXY: 8000,
        plungeZ: 500,
        changeMode: 'mtc_fixed', // Positioned via focal spacer or auto-focus
        atcSlot: 5,
        notes: 'High-power 70W optical laser for rapid vector cutting and deep dark engraving'
      },
      {
        number: 6,
        name: 'Laser Tool 2: 20W Precision Diode Laser',
        type: 'laser',
        diameter: 0.05,
        laserNumber: 2,
        laserType: 'Quad Diode (gpio.2)',
        opticalWatts: 20.0,
        electricalWatts: 120.0,
        efficiencyPct: 16.67,
        pwmFrequencyHz: 5000,
        focalDistanceMm: 20.0,
        feedXY: 6000,
        plungeZ: 500,
        changeMode: 'mtc_fixed',
        atcSlot: 6,
        notes: 'Fine-focus 20W diode head for high-resolution photo engraving and vector marking'
      }
    ];
  }

  loadTools() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[CLE Tool Library] Load error:', e);
    }
    return this.getDefaultTools();
  }

  saveTools(tools = this.tools) {
    this.tools = tools;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.tools));
      this.bridge.vault.syncToServer();
    } catch (e) {
      console.error('[CLE Tool Library] Save error:', e);
    }
  }

  getTool(toolNumber) {
    return this.tools.find(t => t.number === toolNumber) || this.tools[0];
  }

  addOrUpdateTool(toolData) {
    const idx = this.tools.findIndex(t => t.number === toolData.number);
    if (idx >= 0) {
      this.tools[idx] = { ...this.tools[idx], ...toolData };
      this.bridge.notify(`Updated Tool T${toolData.number}: ${toolData.name}`, 'ok');
    } else {
      this.tools.push(toolData);
      this.tools.sort((a, b) => a.number - b.number);
      this.bridge.notify(`Added Tool T${toolData.number}: ${toolData.name}`, 'ok');
    }
    this.saveTools();
  }

  deleteTool(toolNumber) {
    this.tools = this.tools.filter(t => t.number !== toolNumber);
    this.saveTools();
    this.bridge.notify(`Deleted Tool T${toolNumber}`);
  }

  // --- G-Code Generation for Manual Tool Change (MTC) & ATC ---

  generateToolChangeGCode(toolNumber) {
    const tool = this.getTool(toolNumber);
    if (!tool) return `; Error: Tool T${toolNumber} not found in library`;

    const ts = this.toolsetter;
    const isLaser = (tool.type === 'laser');

    if (isLaser) {
      return [
        `; ==========================================`,
        `;   Mount Laser Tool T${tool.number}: ${tool.name}`,
        `;   Optical Power: ${tool.opticalWatts}W | Electrical Draw: ${tool.electricalWatts}W (Eff: ${tool.efficiencyPct}%)`,
        `;   PWM Frequency: ${tool.pwmFrequencyHz}Hz | Focal Distance: ${tool.focalDistanceMm}mm`,
        `; ==========================================`,
        'M5 ; Spindle/Laser OFF',
        'G90 G21 ; Absolute coordinates, Metric units',
        `G53 G0 Z${ts.parkPosition.Z} ; Safe Z retract`,
        `G53 G0 X${ts.parkPosition.X} Y${ts.parkPosition.Y} ; Park machine for laser mount`,
        `M0 (MSG, Mount Laser Tool T${tool.number}: ${tool.name}. Set Focal Distance to ${tool.focalDistanceMm}mm above Ztop)`,
        '$32=1 ; Enable FluidNC Laser Mode',
        `G90 G0 Z${tool.focalDistanceMm} F800 ; Position focal point directly above workpiece Z0`,
        `; Ready for laser toolpath execution`
      ].join('\n');
    }

    // Manual Tool Change with Automatic Toolsetter Touch-off (MTC + Probe)
    if (ts.mode === 'mtc_probe') {
      return [
        `; ==========================================`,
        `;   Tool Change T${tool.number}: ${tool.name} (Ø${tool.diameter}mm)`,
        `;   Spindle: Spindle ${tool.spindleNumber || 1} @ ${tool.spindleRPM} RPM`,
        `; ==========================================`,
        'M5 M9 ; Spindle and coolant OFF',
        'G90 G21 ; Absolute metric positioning',
        `G53 G0 Z${ts.parkPosition.Z} ; 1. Retract to top safe clearance`,
        `G53 G0 X${ts.parkPosition.X} Y${ts.parkPosition.Y} ; 2. Rapid to operator park position`,
        `M0 (MSG, Insert Tool T${tool.number}: ${tool.name}. Press Cycle Start to probe)`,
        `; --- Automatic Tool Length Offset (TLO) Probe Cycle ---`,
        `G53 G0 X${ts.setterPosition.X} Y${ts.setterPosition.Y} ; 3. Rapid over Toolsetter`,
        `G91 G38.2 Z-${ts.maxProbeDistanceMm} F${ts.fastProbeFeed} ; 4. Fast initial touch-off`,
        `G0 Z${ts.retractDistanceMm} ; Retract slightly`,
        `G38.2 Z-${ts.retractDistanceMm + 2.0} F${ts.slowProbeFeed} ; 5. Precision measurement touch`,
        `G92 Z${ts.touchPlateThicknessMm} ; 6. Set Tool Reference height`,
        `G90 G53 G0 Z${ts.parkPosition.Z} ; 7. Retract to safe height`,
        `M3 S${tool.spindleRPM} ; 8. Spin up Spindle`,
        `G4 P${ts.spindleSpinupDwellSec} ; 9. Dwell for full RPM`,
        `; --- Tool T${tool.number} Armed & Ready ---`
      ].join('\n');
    }

    // ATC Rack Slot Tool Change
    if (ts.mode === 'atc_rack') {
      return [
        `; --- Automated Tool Change: Slot ${tool.atcSlot || 1} (T${tool.number}) ---`,
        'M5 M9',
        `G90 G53 G0 Z${ts.parkPosition.Z}`,
        `M6 T${tool.number} ; Trigger ATC Rack Macro Slot ${tool.atcSlot || 1}`,
        `M3 S${tool.spindleRPM}`,
        `G4 P${ts.spindleSpinupDwellSec}`
      ].join('\n');
    }

    // Default Fixed Collet Ring
    return [
      `; --- Fixed Stop Tool Change: T${tool.number} ---`,
      'M5 M9',
      `G53 G0 Z${ts.parkPosition.Z}`,
      `G53 G0 X${ts.parkPosition.X} Y${ts.parkPosition.Y}`,
      `M0 (MSG, Swap to Pre-set Tool T${tool.number}: ${tool.name})`,
      `M3 S${tool.spindleRPM}`,
      `G4 P${ts.spindleSpinupDwellSec}`
    ].join('\n');
  }

  // Interactively execute a tool change on the connected machine
  async executeLiveToolChange(toolNumber) {
    const fluid = this.bridge.fluidnc;
    if (!fluid || !fluid.isConnected) {
      this.bridge.notify('Connect to FluidNC first.', 'error');
      return;
    }
    const tool = this.getTool(toolNumber);
    if (!tool) {
      this.bridge.notify(`Tool T${toolNumber} not found.`, 'error');
      return;
    }

    this.activeToolNumber = toolNumber;
    const gcode = this.generateToolChangeGCode(toolNumber);
    this.bridge.notify(`Executing Tool Change routine for T${tool.number}: ${tool.name}...`, 'ok');
    await fluid.streamGCode(gcode);
  }
}

/* --- Module: cle_bed.js --- */
/**
 * CLEJS - Device Bed, Spoilboard, Millimeter Rulers & Live Toolhead Cursor Subsystem
 * Renders physical machine envelope, spoilboard slab with grid, millimeter ruler graduations,
 * and live 3D toolhead cursor with projected shadow and DRO coordinates in JumpStart viewport.
 */

class CLEBedVisualizer {
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


/* --- Module: cle_vellum.js --- */
/**
 * CLE Vellum Vector Studio Integration Bridge
 * Connects ClassyApps Vellum Vector Studio (2D vector drawing, laser, vinyl, box maker)
 * with JumpStart 3D CAD/CAM workspace.
 */

class CLEVellumBridge {
  constructor(boot = null) {
    this.boot = boot;
    this.modalEl = null;
    this.iframeEl = null;
    this.isOpen = false;
    this.initMessageListener();
  }

  initMessageListener() {
    window.addEventListener('message', (ev) => {
      if (!ev.data || ev.data.type !== 'CLE_VELLUM_EXPORT') return;
      console.log('[CLE Vellum Bridge] Received export payload from Vellum:', ev.data);
      this.handleExport(ev.data);
    });
  }

  ensureUI() {
    if (this.modalEl) return;

    this.modalEl = document.createElement('div');
    this.modalEl.id = 'cle-vellum-modal';
    this.modalEl.style.cssText = `
      display: none;
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: #0f172a;
      flex-direction: column;
      font-family: var(--f-ui, system-ui, -apple-system, sans-serif);
    `;

    // Header Bar
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      color: #f8fafc;
      user-select: none;
      height: 44px;
      box-sizing: border-box;
    `;

    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-weight:800; font-size:15px; color:#38bdf8; display:flex; align-items:center; gap:6px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
          Vellum Vector Studio
        </span>
        <span style="font-size:12px; color:#94a3b8; border-left:1px solid #475569; padding-left:12px;">
          Vector Shapes &middot; Box Maker &middot; Text &middot; Laser Outlines
        </span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:11px; color:#cbd5e1; background:#0369a1; padding:3px 8px; border-radius:4px; font-weight:600;">
          CLE &middot; JS 3D &middot; VV Unified Suite
        </span>
        <button id="cle-vellum-close-btn" style="
          background: #ef4444;
          color: #ffffff;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        ">
          &times; Return to 3D Viewport
        </button>
      </div>
    `;

    // Iframe container
    const iframeWrap = document.createElement('div');
    iframeWrap.style.cssText = `
      flex: 1;
      position: relative;
      background: #ffffff;
    `;

    this.iframeEl = document.createElement('iframe');
    this.iframeEl.id = 'cle-vellum-iframe';
    this.iframeEl.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: none;
    `;
    // Try relative path from Dev/
    this.iframeEl.src = '../Vellum/index.htm';

    iframeWrap.appendChild(this.iframeEl);
    this.modalEl.appendChild(header);
    this.modalEl.appendChild(iframeWrap);
    document.body.appendChild(this.modalEl);

    const closeBtn = header.querySelector('#cle-vellum-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }

  open() {
    const activeTab = document.querySelector('.wstabs button[aria-selected="true"]');
    if (activeTab && activeTab.id !== 'ws-vellum') {
      this.returnWorkspace = activeTab.id; // e.g. 'ws-cle' or 'ws-design'
    } else if (!this.returnWorkspace) {
      this.returnWorkspace = 'ws-cle';
    }

    this.ensureUI();
    this.modalEl.style.display = 'flex';
    this.isOpen = true;
    const app = window.app || window.xe;
    if (app && app.setMode) {
      // Keep advanced mode ready
      if (app.mode !== 'advanced') app.setMode('advanced');
    }
  }

  close() {
    if (!this.modalEl) return;
    this.modalEl.style.display = 'none';
    this.isOpen = false;
    const app = window.app || window.xe;

    // Ensure we are in 3D viewport, not inside 2D sketcher
    if (app && app.sketcher && app.sketcher.active && app.exitSketch) {
      app.exitSketch();
    }

    // Return to the workspace where user initiated (CLE or Design)
    const targetWsId = this.returnWorkspace || 'ws-cle';
    const targetTab = document.getElementById(targetWsId);
    const fallbackTab = document.getElementById('ws-cle') || document.getElementById('ws-design');
    if (targetTab) {
      targetTab.click();
    } else if (fallbackTab) {
      fallbackTab.click();
    }

    if (app && app.vp && app.vp.request) {
      app.vp.request();
    }
  }

  /**
   * Parse SVG entities into JumpStart points and curve entities
   */
  parseSvgToEntities(svgStr, rawObjects) {
    const pts = [];
    const ents = [];
    const ptMap = new Map();

    const addPt = (x, y) => {
      const snap = 0.001;
      const k = `${Math.round(x / snap)},${Math.round(y / snap)}`;
      if (ptMap.has(k)) return ptMap.get(k);
      const pid = 'p_' + Math.random().toString(36).substr(2, 8);
      pts.push({ id: pid, x: +x.toFixed(4), y: +y.toFixed(4) });
      ptMap.set(k, pid);
      return pid;
    };

    // First check if rawObjects with segments are available
    if (Array.isArray(rawObjects) && rawObjects.length > 0) {
      // Find bounding box for centering
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      rawObjects.forEach(obj => {
        if (!obj || !Array.isArray(obj.segments)) return;
        obj.segments.forEach(s => {
          if (s.x !== undefined) {
            minX = Math.min(minX, s.x);
            maxX = Math.max(maxX, s.x);
          }
          if (s.y !== undefined) {
            minY = Math.min(minY, s.y);
            maxY = Math.max(maxY, s.y);
          }
        });
      });

      const hasBounds = isFinite(minX) && isFinite(minY);
      const cx = hasBounds ? (minX + maxX) / 2 : 0;
      const cy = hasBounds ? (minY + maxY) / 2 : 0;

      rawObjects.forEach(obj => {
        if (!obj || !Array.isArray(obj.segments) || obj.visible === false) return;
        const segs = obj.segments;
        let curX = 0, curY = 0, startX = 0, startY = 0;

        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          if (s.type === 'M') {
            curX = s.x - cx;
            curY = -(s.y - cy); // Invert SVG Y into CAD standard Y
            startX = curX;
            startY = curY;
          } else if (s.type === 'L') {
            const nextX = s.x - cx;
            const nextY = -(s.y - cy);
            const pA = addPt(curX, curY);
            const pB = addPt(nextX, nextY);
            if (pA !== pB) {
              ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: pA, b: pB });
            }
            curX = nextX;
            curY = nextY;
          } else if (s.type === 'C') {
            // Cubic bezier: sample into 12 segments for smooth CAD curve
            const x0 = curX, y0 = curY;
            const x1 = s.x1 - cx, y1 = -(s.y1 - cy);
            const x2 = s.x2 - cx, y2 = -(s.y2 - cy);
            const x3 = s.x - cx, y3 = -(s.y - cy);
            const STEPS = 12;
            let lastPid = addPt(x0, y0);
            for (let step = 1; step <= STEPS; step++) {
              const t = step / STEPS;
              const u = 1 - t;
              const px = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
              const py = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
              const nextPid = addPt(px, py);
              if (lastPid !== nextPid) {
                ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: lastPid, b: nextPid });
              }
              lastPid = nextPid;
            }
            curX = x3;
            curY = y3;
          } else if (s.type === 'Z' || s.type === 'z') {
            const pA = addPt(curX, curY);
            const pB = addPt(startX, startY);
            if (pA !== pB) {
              ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: pA, b: pB });
            }
            curX = startX;
            curY = startY;
          }
        }
      });

      if (ents.length > 0) {
        return { pts, ents };
      }
    }

    // Fallback: Parse SVG DOM
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgStr, 'image/svg+xml');
      const root = doc.documentElement;
      const viewBox = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const cx = (viewBox.length === 4) ? viewBox[0] + viewBox[2] / 2 : 0;
      const cy = (viewBox.length === 4) ? viewBox[1] + viewBox[3] / 2 : 0;

      // Rectangles
      const rects = root.querySelectorAll('rect');
      rects.forEach(r => {
        const x = (parseFloat(r.getAttribute('x')) || 0) - cx;
        const y = -((parseFloat(r.getAttribute('y')) || 0) - cy);
        const w = parseFloat(r.getAttribute('width')) || 0;
        const h = parseFloat(r.getAttribute('height')) || 0;
        if (w > 0 && h > 0) {
          const p1 = addPt(x, y);
          const p2 = addPt(x + w, y);
          const p3 = addPt(x + w, y - h);
          const p4 = addPt(x, y - h);
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: p1, b: p2 });
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: p2, b: p3 });
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: p3, b: p4 });
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: p4, b: p1 });
        }
      });

      // Circles
      const circles = root.querySelectorAll('circle');
      circles.forEach(c => {
        const x = (parseFloat(c.getAttribute('cx')) || 0) - cx;
        const y = -((parseFloat(c.getAttribute('cy')) || 0) - cy);
        const r = parseFloat(c.getAttribute('r')) || 0;
        if (r > 0) {
          const cp = addPt(x, y);
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'circle', c: cp, r });
        }
      });
    } catch (e) {
      console.warn('[CLE Vellum Bridge] SVG parsing error:', e);
    }

    return { pts, ents };
  }

  /**
   * Get machine bed center coordinates dynamically
   * Defaults to TTC6050 (X=300, Y=250, Z=20.10mm on top of spoilboard)
   */
  getBedCenter() {
    let cx = 300;
    let cy = 250;
    let cz = 20.10; // 0.10 bed base + 20.0 spoilboard

    try {
      if (window.CLE) {
        if (window.CLE.machine && window.CLE.machine.travel) {
          const t = window.CLE.machine.travel;
          if (t.x && t.x.max) cx = (t.x.min || 0) + (t.x.max - (t.x.min || 0)) / 2;
          if (t.y && t.y.max) cy = (t.y.min || 0) + (t.y.max - (t.y.min || 0)) / 2;
        }
        if (window.CLE.spoilboard && typeof window.CLE.spoilboard.thickness === 'number') {
          cz = 0.10 + window.CLE.spoilboard.thickness;
        }
      }
    } catch (e) {
      console.warn('[CLE Vellum] error determining bed center:', e);
    }

    return { x: cx, y: cy, z: cz };
  }

  /**
   * Handle incoming Vellum export payload
   */
  handleExport(payload) {
    const { svg, objects, images, mode, thickness, plane, name } = payload;
    const app = window.app || window.xe;
    if (!window.Se || !window.Se.update) {
      console.error('[CLE Vellum Bridge] window.Se document manager not found');
      if (app && app.toast) app.toast('Cannot import: CAD document manager not ready', 'err');
      return;
    }

    const { pts, ents } = this.parseSvgToEntities(svg, objects);
    const hasImages = Array.isArray(images) && images.length > 0;
    const hasVectors = ents.length > 0;

    if (!hasVectors && !hasImages) {
      if (app && app.toast) app.toast('No shapes or images found in Vellum to transfer', 'err');
      return;
    }

    // Determine plane origin at center of machine bed
    const bedCenter = this.getBedCenter();
    let planeDef = { o: [bedCenter.x, bedCenter.y, bedCenter.z], x: [1, 0, 0], n: [0, 0, 1] }; // Default XY Top
    if (plane === 'XZ') {
      planeDef = { o: [bedCenter.x, bedCenter.y, bedCenter.z], x: [1, 0, 0], n: [0, 1, 0] };
    } else if (plane === 'YZ') {
      planeDef = { o: [bedCenter.x, bedCenter.y, bedCenter.z], x: [0, 1, 0], n: [1, 0, 0] };
    }

    const skId = 'sk_' + Date.now();
    const partName = name || (hasVectors ? 'Vellum Vector' : 'Vellum Picture');

    let imagePayload = null;
    if (hasImages) {
      const im = images[0];
      let wMm = im.w || 120;
      let hMm = im.h || 80;
      // Scale down nicely if image is excessively large in pixel units
      if (wMm > 400 || hMm > 400) {
        const factor = 200 / Math.max(wMm, hMm);
        wMm *= factor;
        hMm *= factor;
      }
      imagePayload = {
        src: im.src,
        name: partName,
        w: +wMm.toFixed(2),
        h: +hMm.toFixed(2),
        cx: 0,
        cy: 0,
        rot: im.angle || 0,
        opacity: im.opacity !== undefined ? im.opacity : 0.75
      };
    }

    window.Se.update(doc => {
      const newSketch = {
        id: skId,
        name: partName,
        seq: ++doc.seq,
        plane: planeDef,
        pts: pts,
        ents: ents,
        hidden: false
      };

      if (imagePayload) {
        newSketch.image = imagePayload;
      }

      doc.sketches.push(newSketch);

      if (mode === 'extrude' && hasVectors) {
        // Detect closed profiles using JumpStart's internal profile detector
        let profiles = [];
        if (window.Ei) {
          try {
            const det = window.Ei(newSketch);
            if (Array.isArray(det) && det.length > 0) {
              profiles = det.map(p => ({ key: p.key, pt: p.pt }));
            }
          } catch (err) {
            console.warn('[CLE Vellum] error computing profiles with Ei:', err);
          }
        }
        if (profiles.length === 0) {
          profiles = [{ key: 'p0', pt: [0, 0] }];
        }

        const bodyId = 'b_' + Date.now();
        doc.bodies.push({
          id: bodyId,
          name: partName + ' (3D)',
          seq: ++doc.seq,
          color: '#38bdf8',
          hole: false,
          hidden: false,
          m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          node: {
            t: 'extrude',
            sketch: skId,
            profiles: profiles,
            dist: parseFloat(thickness) || 5.0,
            mode: 'one',
            dist2: 0,
            mods: []
          }
        });
      }
    }, `Import ${partName} from Vellum`);

    this.close();

    // Notify user & trigger scene and bed update
    if (app) {
      if (app.sketcher && app.sketcher.active && app.exitSketch) {
        app.exitSketch();
      }
      if (app.scene && app.scene.refresh) app.scene.refresh();
      if (app.refreshUI) app.refreshUI('change');
      if (app.vp && app.vp.request) app.vp.request();
    }

    if (window.CLE && window.CLE.bed) {
      if (window.CLE.bed.sitWorkpieceOnSpoilboard) window.CLE.bed.sitWorkpieceOnSpoilboard();
      if (window.CLE.bed.fitBedView) window.CLE.bed.fitBedView();
    } else if (app && app.fit) {
      app.fit();
    }

    if (!hasVectors && hasImages) {
      if (app && app.toast) app.toast(`Placed "${partName}" onto center of bed!`, 'ok');
    } else if (mode === 'extrude' && hasVectors) {
      if (app && app.toast) app.toast(`Created 3D Extruded Body "${partName}" (${thickness}mm) at center of bed!`, 'ok');
    } else {
      if (app && app.toast) app.toast(`Imported 2D sketch "${partName}" at center of bed!`, 'ok');
    }
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.CLE = window.CLE || {};
  window.CLE.vellum = new CLEVellumBridge();
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
    this.toolLibrary = new CLEToolLibrary(this);
    this.bed = new CLEBedVisualizer(this);
    this.vellum = new CLEVellumBridge(this);

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
    if (this.camera) {
      this.camera.autoStartIfAvailable(true);
    }
  }

  registerWithJumpStart() {
    const app = window.app || window.xe;
    const THREE = window.THREE;
    if (THREE) {
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
    }
    if (app && app.vp) {
      console.log('[CLEJS] Attached to active JumpStart 3D runtime context.');
      this.injectTopBarButton();
      if (this.bed) this.bed.init();
      if (this.slicer) this.slicer.init();
      const mach = this.vault?.getActiveMachine();
      if (mach?.rotaryConfig && this.rotary) {
        const rc = mach.rotaryConfig;
        if (rc.gearRatio) this.rotary.gearRatio = rc.gearRatio;
        if (rc.motorPulleyMm) this.rotary.motorPulleyMm = rc.motorPulleyMm;
        if (rc.chuckPulleyMm) this.rotary.chuckPulleyMm = rc.chuckPulleyMm;
        if (rc.centerHeightMm) this.rotary.centerHeightMm = rc.centerHeightMm;
        if (rc.centerY) this.rotary.centerY = rc.centerY;
        if (rc.startX) this.rotary.startX = rc.startX;
        if (rc.stockDiameter) this.rotary.stockDiameter = rc.stockDiameter;
        if (rc.stockLength) this.rotary.stockLength = rc.stockLength;
        if (rc.zSafetyLimit !== undefined) this.rotary.zSafetyLimit = rc.zSafetyLimit;
        if (rc.zClearance !== undefined) this.rotary.zClearance = rc.zClearance;
      }
      if (this.camera && !this.camera.isActive) {
        this.camera.autoStartIfAvailable(true);
      }
      // Hook scene refresh so workpiece automatically stays seated on spoilboard
      if (app.scene && !this._sceneRefreshHooked) {
        this._sceneRefreshHooked = true;
        const origRefresh = app.scene.refresh ? app.scene.refresh.bind(app.scene) : null;
        if (origRefresh) {
          app.scene.refresh = () => {
            origRefresh();
            if (this.bed && this.bed.visible) {
              this.bed.sitWorkpieceOnSpoilboard();
            }
          };
        }
      }
    } else {
      setTimeout(() => this.registerWithJumpStart(), 250);
    }
  }

  async connectActiveMachine() {
    if (this.fluidnc.isConnected) {
      this.fluidnc.disconnect();
      return;
    }
    // Always open Manual Control Center so the user has immediate visual feedback of the machine card, DRO, and console
    this.openManualControlCenter();
    const mach = this.vault.getActiveMachine();
    if (mach && mach.wifiIP && mach.wifiIP !== 'none') {
      const ok = await this.fluidnc.autoConnect();
      if (ok) return;
    }
    await this.fluidnc.connectSerial();
  }

  injectTopBarButton() {
    const topbar = document.getElementById('topbar') || document.querySelector('.topbar') || document.body;
    if (!topbar || topbar === document.body) {
      setTimeout(() => this.injectTopBarButton(), 200);
      return;
    }

    // Bind Project Topbar Buttons
    const btnNew = document.getElementById('btn-new-project');
    if (btnNew && !btnNew._cleBound) {
      btnNew._cleBound = true;
      btnNew.onclick = () => this.newProject();
    }

    const btnSave = document.getElementById('btn-save-project');
    if (btnSave && !btnSave._cleBound) {
      btnSave._cleBound = true;
      btnSave.onclick = () => this.saveProject();
    }

    const btnSaveAs = document.getElementById('btn-save-as-project');
    if (btnSaveAs && !btnSaveAs._cleBound) {
      btnSaveAs._cleBound = true;
      btnSaveAs.onclick = () => this.saveProjectAs();
    }

    // Bind Open/Export Dropdown Menu actions
    const menuExport = document.getElementById('menu-export');
    if (menuExport && !menuExport._cleBound) {
      menuExport._cleBound = true;
      menuExport.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'new') {
          menuExport.hidden = true;
          this.newProject();
        } else if (act === 'save') {
          menuExport.hidden = true;
          this.saveProject();
        } else if (act === 'saveas') {
          menuExport.hidden = true;
          this.saveProjectAs();
        }
      });
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

  /**
   * Clear workspace and start a fresh project
   */
  newProject(force = false) {
    const doc = (window.Se && window.Se.doc) || (window.app && window.app.doc);
    const hasBodies = doc && Array.isArray(doc.bodies) && doc.bodies.length > 0;
    const hasSketches = doc && Array.isArray(doc.sketches) && doc.sketches.length > 0;

    if (!force && (hasBodies || hasSketches)) {
      const ok = confirm("Start a new project? This will clear all bodies and sketches in the current workspace.");
      if (!ok) return;
    }

    const app = window.app || window.xe;

    // Use JumpStart's internal newDesign if available
    if (app && app.projects && app.projects.newDesign) {
      app.projects.newDesign("advanced");
    } else if (window.Se && window.Se.load && window.uo) {
      window.Se.load(window.uo("Untitled", "advanced"));
    } else if (window.Se && window.Se.update) {
      window.Se.update(d => {
        d.bodies = [];
        d.sketches = [];
        d.joints = [];
        d.name = "Untitled";
        d.ver = 1;
      }, "New Project");
    }

    // Clear CLE visualizers, toolpaths, and active modes
    if (this.slicer && this.slicer.clearVisualizer) this.slicer.clearVisualizer();
    if (this.recovery && this.recovery.clearVisualizer) this.recovery.clearVisualizer();
    if (this.calibration && this.calibration.clearVisualizer) this.calibration.clearVisualizer();
    if (this.test && this.test.clearVisualizer) this.test.clearVisualizer();

    // Reset document name field in topbar if present
    const docnameEl = document.querySelector('.docname');
    if (docnameEl) docnameEl.value = 'Untitled';

    // Reset Bed & Camera
    if (this.bed) {
      if (this.bed.fitBedView) this.bed.fitBedView();
      if (this.bed.sitWorkpieceOnSpoilboard) this.bed.sitWorkpieceOnSpoilboard();
    } else if (app && app.vp && app.vp.setView) {
      app.vp.setView("home");
    }

    this.notify("Started new project — Workspace cleared.", "ok");
  }

  /**
   * Quick Save current project version
   */
  async saveProject() {
    const app = window.app || window.xe;
    const doc = (window.Se && window.Se.doc) || (app && app.doc);
    const name = (doc && doc.name) ? doc.name : "Untitled";

    if (app && app.projects && app.projects.saveVersion) {
      try {
        await app.projects.saveVersion();
        this.notify(`Project saved as "${name}" version!`, 'ok');
        return;
      } catch (err) {
        console.warn('[CLE] saveVersion error:', err);
      }
    }

    if (app && app.projects && app.projects.saveNow) {
      try {
        await app.projects.saveNow();
        this.notify(`Project "${name}" saved!`, 'ok');
        return;
      } catch (err) {
        console.warn('[CLE] saveNow error:', err);
      }
    }

    this.downloadProjectFile(name, doc);
    this.notify(`Project "${name}" exported!`, 'ok');
  }

  /**
   * Save As named project copy & download JSON
   */
  async saveProjectAs(customName = null) {
    const app = window.app || window.xe;
    const doc = (window.Se && window.Se.doc) || (app && app.doc);
    const currentName = (doc && doc.name) ? doc.name : "Untitled";

    const chosen = customName !== null ? customName : prompt("Enter project name:", currentName);
    if (!chosen || !chosen.trim()) return;

    const trimmed = chosen.trim();

    if (window.Se && window.Se.update) {
      window.Se.update(d => {
        d.name = trimmed;
      }, `Rename to ${trimmed}`);
    } else if (doc) {
      doc.name = trimmed;
    }

    const docnameEl = document.querySelector('.docname');
    if (docnameEl) docnameEl.value = trimmed;

    // Save version in browser storage
    if (app && app.projects && app.projects.saveVersion) {
      try {
        await app.projects.saveVersion();
      } catch (err) {
        console.warn('[CLE] saveVersion error:', err);
      }
    } else if (app && app.projects && app.projects.saveNow) {
      try {
        await app.projects.saveNow();
      } catch (err) {
        console.warn('[CLE] saveNow error:', err);
      }
    }

    // Always trigger .json project file download so user has their named copy!
    this.downloadProjectFile(trimmed, doc);
    this.notify(`Project saved as "${trimmed}" and downloaded!`, 'ok');
  }

  /**
   * Export project document as downloadable JSON file
   */
  downloadProjectFile(name, doc) {
    const payloadDoc = doc || (window.Se && window.Se.doc) || (window.app && window.app.doc) || {};
    const safeName = (name || payloadDoc.name || 'Untitled').replace(/[<>/\\":;?*|=,]+/g, '_').trim() || 'Untitled';
    const jsonStr = JSON.stringify({ app: "jumpstart-3d", version: 1, doc: payloadDoc }, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName.endsWith('.json') ? safeName : `${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Native JumpStart Advanced Ribbon Renderer (When "CLE" tab in wstabs is clicked)
  renderAdvancedRibbon(m, s, n) {
    const activeMach = this.vault.getActiveMachine();
    this.machineName = activeMach.name;

    // 0. Return to Design Workspace, Vector Studio & Project Actions
    m("Design", "", [
      {
        id: "cle-r-return-design",
        label: "Return",
        title: "Return to JumpStart CAD Design Workspace",
        icon: "select",
        cls: "accent",
        fn: () => {
          if (this.slicer) this.slicer.clearVisualizer();
          const btn = document.getElementById('ws-design');
          if (btn) btn.click();
          else if (window.app && window.app.setWorkspace) window.app.setWorkspace('design');
          this.notify('Returned to JumpStart Design CAD workspace.', 'info');
        }
      },
      {
        id: "cle-r-vellum",
        label: "Vector Studio",
        title: "Open Vellum Vector Studio (2D Vector Drawing, Box Maker, Laser Outlines)",
        icon: "sketch",
        cls: "accent",
        fn: () => {
          if (window.CLE && window.CLE.vellum) window.CLE.vellum.open();
        }
      },
      {
        id: "cle-r-new-proj",
        label: "New Project",
        title: "Start a Fresh New Project (Clears Workspace)",
        icon: "newSketch",
        cls: "accent",
        fn: () => this.newProject()
      },
      {
        id: "cle-r-save-proj",
        label: "Save",
        title: "Save Project Version",
        icon: "box",
        cls: "accent",
        fn: () => this.saveProject()
      },
      {
        id: "cle-r-saveas-proj",
        label: "Save As",
        title: "Save Project As (Named File & Version)",
        icon: "features",
        cls: "accent",
        fn: () => this.saveProjectAs()
      }
    ]);

    // 1. Machine Section (Devices like LightBurn / MillMage)
    m(activeMach.name, "", [
      { id: "cle-r-devices", label: "Devices", title: "Select or Configure Machine Profiles (Like LightBurn/MillMage)", icon: "features", fn: () => this.openModal("machines") },
      { id: "cle-r-serial", label: "USB List", title: "Select & Connect USB Serial COM Port to FluidNC", icon: "drive", fn: () => this.fluidnc.connectSerial() },
      { id: "cle-r-ws", label: "WiFi Setup", title: "Configure FluidTouch 7\" / FluidNC WiFi IP & WebSocket", icon: "motion", fn: async () => {
          const mach = this.vault.getActiveMachine();
          let currentIp = this.fluidnc.ip || mach?.wifiIP || '192.168.12.158';
          if (currentIp === '192.168.12.150' || currentIp === '192.168.1.150' || currentIp === '192.168.1.100') {
            currentIp = '192.168.12.158';
          }
          const ip = prompt("Enter FluidTouch 7\" / FluidNC IP or Hostname (e.g. ttcwifi.local or 192.168.12.158):", currentIp);
          if (ip && ip.trim()) {
            let cleanIp = ip.trim().replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/.*$/, '').trim();
            if (cleanIp === '192.168.12.150' || cleanIp === '192.168.1.150' || cleanIp === '192.168.1.100') {
              cleanIp = '192.168.12.158';
            }
            this.fluidnc.ip = cleanIp;
            localStorage.setItem('cle.fluidnc.ip', cleanIp);
            if (mach) {
              mach.wifiIP = cleanIp;
              await this.vault.saveMachine(mach);
            }
            this.fluidnc.connectWebSocket(cleanIp);
          }
      }},
      { id: "cle-r-connect", label: "Connect", title: "Direct Machine Connect / Disconnect", icon: "drive", pressed: this.fluidnc.isConnected, fn: () => this.connectActiveMachine() },
      { id: "cle-r-fluidnc", label: "FluidNC", title: "FluidTouch 7\" Web GUI / FluidNC Status", icon: "motion", fn: () => this.fluidnc.openFluidTouchWebGUI() },
      { id: "cle-r-bed", label: "Machine Bed", title: "Toggle 3D Bed, Spoilboard & Workpiece Elevation", icon: "dim", pressed: this.bed ? this.bed.visible : true, fn: () => {
        if (this.bed) {
          const vis = this.bed.toggle();
          const el = document.getElementById('cle-r-bed');
          if (el) el.classList.toggle('pressed', vis);
        }
      }},
      { id: "cle-r-spoilboard", label: "Spoilboard & Z", title: "Adjust Spoilboard Size, Thickness & Sit Workpiece on Surface", icon: "cube", fn: () => this.openModal("spoilboard") },
      { id: "cle-r-fitbed", label: "Fit Bed", title: "Center and Frame 3D View on Machine Bed", icon: "zoomExtents", fn: () => this.bed && this.bed.fitBedView() }
    ]);

    // 2. JOYSTICK MODE Section (Defaults to Design Mode; has dedicated Manual Mode button)
    m("JOYSTICK MODE", "", [
      { 
        id: "cle-r-gp-design", 
        label: "Design Mode", 
        title: "Active 3D CAD Viewport Navigation (Left Stick: Orbit 3D, Right Stick: Pan)", 
        icon: "motion", 
        pressed: this.gamepad.mode === "design", 
        fn: () => this.gamepad.setMode('design') 
      },
      { 
        id: "cle-r-gp-manual", 
        label: "Manual Mode", 
        title: "Switch to Manual CNC/Laser Control (Connects to device, opens Control Card & starts camera)", 
        icon: "drive", 
        pressed: this.gamepad.mode === "manual", 
        fn: () => this.gamepad.setMode('manual') 
      },
      { 
        id: "cle-r-gp-remap", 
        label: "Controller Setup", 
        title: "Configure Switch Controller Buttons, Axes & Live Switch Indicators", 
        icon: "features", 
        fn: () => this.openModal("gamepad") 
      }
    ]);

    // 3. 4th Axis & Slicer
    m("Rotary & Slicer", "", [
      { id: "cle-r-rotary", label: "4th Axis (A)", title: "Toggle 4th Axis Rotary Chuck & Cylindrical Stock in 3D View", icon: "lathe", pressed: this.rotary.enabled, fn: () => this.rotary.toggle() },
      { id: "cle-r-rot-fit", label: "Clamp Ends", title: "Auto-Clamp Chuck & Opposing Center to CAD Object Ends", icon: "box", fn: () => this.rotary.fitToObject() },
      { id: "cle-r-rot-center", label: "Center on Obj", title: "Center A-Axis Chuck and Opposing Center Symmetrically on CAD Object", icon: "dim", fn: () => this.rotary.centerOnObject() },
      { id: "cle-r-rot-tool", label: "Center Tool", title: "Toggle A-Axis Center Point Alignment Tool & Reticle (Chuck & Live Center)", icon: "features", pressed: this.rotary.centerPointVisible, fn: () => this.rotary.toggleCenterPointTool() },
      { id: "cle-r-rot-jog", label: "Jog Center", title: "Jog Spindle / Laser Toolhead Directly to A-Axis Center Point", icon: "motion", fn: () => this.rotary.jogToolToCenter('workpiece') },
      { id: "cle-r-rot-setup", label: "A-Axis Setup", title: "TwoTrees Rotary Setup: Gear Ratio (5:1), Pulley, Center Y, Z=45mm & Safety", icon: "features", fn: () => this.openModal("rotary") },
      { id: "cle-r-turning", label: "Turning", title: "Lathe Continuous Spindle Turning (RPM & Deg/s)", icon: "motion", pressed: this.rotary.isTurning, fn: () => this.rotary.toggleTurning() },
      { id: "cle-r-index", label: "Index Next", title: "Index A-Axis to Next Facet (Top-Down Milling)", icon: "revolve", fn: () => this.rotary.nextIndex() },
      { id: "cle-r-slicer", label: "Slice & 3D Stack", title: "Slice Model (Top-Down for CNC/Laser, Bottom-Up for 3D) & Display in Visualizer", icon: "printer3d", fn: () => this.openModal("slicer") }
    ]);

    // 4. Tools Section
    m("CLE Tools", "", [
      { id: "cle-r-vault", label: "Vault", title: "MEAGCLE Design & Machine State Git Vault", icon: "box", fn: () => this.openModal("vault") },
      { id: "cle-r-tools", label: "Tool Library", title: "Tool Library & Manual/Automated Tool Changes", icon: "features", fn: () => this.openModal("tools") },
      { id: "cle-r-cal", label: "Calibration", title: "Steps/mm, Laser & Backlash Calibration", icon: "dim", fn: () => this.openModal("calibration") },
      { id: "cle-r-test", label: "Test Suite", title: "Diagnostic Test Cuts", icon: "pattern", fn: () => this.openModal("test") },
      { id: "cle-r-rec", label: "Job Recovery", title: "Job Crash Recovery (-5 lines lookback)", icon: "pattern", fn: () => this.openModal("recovery") }
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
      if (this.fluidnc) {
        this.fluidnc.updateConnectionUI(this.fluidnc.isConnected);
        const conEl = document.getElementById('cle-man-console');
        if (conEl) {
          conEl.innerHTML = this.fluidnc.consoleLogs.map(l => `<div style="margin-bottom:2px;">${l}</div>`).join('');
          conEl.scrollTop = conEl.scrollHeight;
        }
      }
      if (this.camera) {
        this.camera.syncUI();
        if (!this.camera.isActive) {
          this.camera.autoStartIfAvailable(false);
        }
      }
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
          <button class="cle-btn" id="cle-man-return" style="padding:2px 8px; font-size:11px; font-weight:700; background:#2563eb; color:#fff;" title="Return to JumpStart CAD Design Workspace">Return</button>
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

        <!-- Surface Compensation (0.1mm Micro-stepping for Uneven Surface) -->
        <div class="cle-joycon-panel" style="padding:8px 10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span class="cle-joycon-title" style="margin:0;">Surface Compensation (&plusmn;0.1mm)</span>
            <span style="font-size:10px; color:var(--accent); font-weight:600;" id="cle-comp-status">Active Nudge: 0.1mm</span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:6px;">
            <div style="display:flex; flex-direction:column; gap:4px; text-align:center;">
              <span style="font-size:10px; font-weight:700;">X</span>
              <button class="cle-btn" id="cle-comp-xp" style="justify-content:center; padding:2px;">+0.1</button>
              <button class="cle-btn" id="cle-comp-xm" style="justify-content:center; padding:2px;">-0.1</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; text-align:center;">
              <span style="font-size:10px; font-weight:700;">Y</span>
              <button class="cle-btn" id="cle-comp-yp" style="justify-content:center; padding:2px;">+0.1</button>
              <button class="cle-btn" id="cle-comp-ym" style="justify-content:center; padding:2px;">-0.1</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; text-align:center;">
              <span style="font-size:10px; font-weight:700; color:var(--accent);">Z</span>
              <button class="cle-btn" id="cle-comp-zp" style="justify-content:center; padding:2px; font-weight:700;">+0.1</button>
              <button class="cle-btn" id="cle-comp-zm" style="justify-content:center; padding:2px; font-weight:700;">-0.1</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:4px; text-align:center;">
              <span style="font-size:10px; font-weight:700;">A</span>
              <button class="cle-btn" id="cle-comp-ap" style="justify-content:center; padding:2px;">+0.1&deg;</button>
              <button class="cle-btn" id="cle-comp-am" style="justify-content:center; padding:2px;">-0.1&deg;</button>
            </div>
          </div>
        </div>

        <!-- Move Current Point (Safe Workpiece Positioning) -->
        <div class="cle-joycon-panel" style="padding:8px 10px;">
          <div class="cle-joycon-title" style="margin-bottom:6px;">Move Current Point (Safe Z Clearance)</div>
          <div style="display:flex; gap:6px; align-items:center;">
            <input class="cle-input" id="cle-mcp-x" type="number" placeholder="Target X" style="padding:3px 6px; font-size:11px; width:70px;">
            <input class="cle-input" id="cle-mcp-y" type="number" placeholder="Target Y" style="padding:3px 6px; font-size:11px; width:70px;">
            <button class="cle-btn" id="cle-mcp-go" style="background:var(--accent); color:var(--on-accent); font-weight:600; flex:1;">Move Point (Z-Safe)</button>
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
      else if (this.camera.selectedDeviceId) devSelect.value = this.camera.selectedDeviceId;
    } else {
      devSelect.innerHTML = '<option value="">Default USB Video Device</option>';
    }

    // Immediately sync camera feed to UI (stream already loaded from Vault on boot)
    if (this.camera) {
      this.camera.syncUI();
      if (!this.camera.isActive) {
        this.camera.autoStartIfAvailable(false);
      }
    }

    // Sync live connection state to manual card badge and initialize Terminal Console
    if (this.fluidnc) {
      this.fluidnc.updateConnectionUI(this.fluidnc.isConnected);
      const conEl = document.getElementById('cle-man-console');
      if (conEl) {
        if (this.fluidnc.consoleLogs.length === 0) {
          this.fluidnc.logConsole('[SYSTEM] FluidNC Terminal Console Initialized.');
          this.fluidnc.logConsole(`[STATUS] Machine: ${this.vault.getActiveMachine().name} | State: ${this.fluidnc.isConnected ? 'Connected' : 'Offline'}`);
        } else {
          conEl.innerHTML = this.fluidnc.consoleLogs.map(l => `<div style="margin-bottom:2px;">${l}</div>`).join('');
          conEl.scrollTop = conEl.scrollHeight;
        }
      }
    }

    // Wire Events
    document.getElementById('cle-man-close').onclick = () => { hub.style.display = 'none'; };
    const manReturn = document.getElementById('cle-man-return');
    if (manReturn) {
      manReturn.onclick = () => {
        hub.style.display = 'none';
        const wsBtn = document.getElementById('ws-design');
        if (wsBtn) wsBtn.click();
        this.notify('Returned to JumpStart Design CAD workspace.', 'info');
      };
    }
    
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

    // Surface Compensation Events (0.1mm micro-steps)
    document.getElementById('cle-comp-xp').onclick = () => this.fluidnc.compensateAxis('X', 0.1);
    document.getElementById('cle-comp-xm').onclick = () => this.fluidnc.compensateAxis('X', -0.1);
    document.getElementById('cle-comp-yp').onclick = () => this.fluidnc.compensateAxis('Y', 0.1);
    document.getElementById('cle-comp-ym').onclick = () => this.fluidnc.compensateAxis('Y', -0.1);
    document.getElementById('cle-comp-zp').onclick = () => this.fluidnc.compensateAxis('Z', 0.1);
    document.getElementById('cle-comp-zm').onclick = () => this.fluidnc.compensateAxis('Z', -0.1);
    document.getElementById('cle-comp-ap').onclick = () => this.fluidnc.compensateAxis('A', 0.1);
    document.getElementById('cle-comp-am').onclick = () => this.fluidnc.compensateAxis('A', -0.1);

    // Move Current Point (Safe clearance retract first)
    document.getElementById('cle-mcp-go').onclick = () => {
      const tx = parseFloat(document.getElementById('cle-mcp-x').value);
      const ty = parseFloat(document.getElementById('cle-mcp-y').value);
      if (!isNaN(tx) && !isNaN(ty)) {
        this.moveCurrentPoint(tx, ty);
      } else {
        this.notify('Enter valid target X and Y coordinates.', 'error');
      }
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

  // --- Safe Workpiece Navigation: Move Current Point ---
  moveCurrentPoint(targetX, targetY) {
    if (!this.fluidnc || !this.fluidnc.isConnected) {
      this.notify('Connect to machine first.', 'error');
      return;
    }
    this.notify(`Moving tool to X:${targetX.toFixed(1)} Y:${targetY.toFixed(1)} (Safe Z Retract first)...`, 'info');
    // 1. Safe clearance retract
    this.fluidnc.sendImmediate('G0 Z20.000 F800\n');
    // 2. Rapid traverse to target XY
    this.fluidnc.sendImmediate(`G0 X${targetX.toFixed(3)} Y${targetY.toFixed(3)} F3000\n`);
  }

  // --- Manual Tool Change Card (M6 Intercept Routine) ---
  openToolChangeCard(resumeState) {
    let card = document.getElementById('cle-tool-change-card');
    if (!card) {
      card = document.createElement('div');
      card.id = 'cle-tool-change-card';
      card.style.cssText = `
        position: fixed;
        top: 80px;
        left: 50%;
        transform: translateX(-50%);
        width: 440px;
        background: var(--panel);
        color: var(--ink);
        border: 2px solid var(--accent);
        border-radius: 10px;
        box-shadow: 0 16px 48px var(--shadow);
        z-index: 10000;
        padding: 16px;
        font-family: var(--f);
      `;
      document.body.appendChild(card);
    }

    const tool = (this.toolLibrary && this.toolLibrary.tools)
      ? (this.toolLibrary.tools.find(t => t.number === resumeState.toolNum) || { name: `Tool #${resumeState.toolNum}`, type: 'Endmill / Laser', diameter: 3.175 })
      : { name: `Tool #${resumeState.toolNum}`, type: 'Endmill / Laser', diameter: 3.175 };

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--line); padding-bottom:8px; margin-bottom:12px;">
        <span style="font-size:14px; font-weight:800; color:var(--accent);">Manual Tool Change Required</span>
        <span class="cle-badge alert">Job Paused</span>
      </div>
      <div class="cle-joycon-panel" style="padding:10px; margin-bottom:12px;">
        <div style="font-size:13px; font-weight:700; color:var(--ink);">Please Install: Tool #${resumeState.toolNum} &mdash; ${tool.name}</div>
        <div style="font-size:11px; color:var(--ink-2); margin-top:4px;">Type: ${tool.type} | Diameter: ${tool.diameter}mm</div>
        <div style="font-size:11px; color:var(--ink-3); margin-top:2px;">Requested at G-code line ${resumeState.lineIndex}: <code>${resumeState.gcodeLine}</code></div>
      </div>
      <div style="font-size:11px; color:var(--ink-2); margin-bottom:10px;">
        Saved Resume Position: <strong>X: ${resumeState.lastPos.X.toFixed(2)}, Y: ${resumeState.lastPos.Y.toFixed(2)}, Z: ${resumeState.lastPos.Z.toFixed(2)}</strong> (Spindle is safely retracted at Z=20mm)
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
        <button class="cle-btn" id="cle-tc-btn-probe">Probe Z (Touch Plate)</button>
        <button class="cle-btn" id="cle-tc-btn-zero">Zero Z (G92 Z0)</button>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button class="cle-btn" id="cle-tc-btn-continue" style="background:var(--ok); color:#fff; font-weight:700; padding:8px 18px;">Continue Job</button>
      </div>
    `;

    card.style.display = 'block';

    document.getElementById('cle-tc-btn-probe').onclick = () => {
      this.fluidnc.sendGCode('G21 G91\nG38.2 Z-30 F75\nG92 Z15.0\nG0 Z5\nG90\n');
      this.notify('Probing Z touch plate...', 'info');
    };
    document.getElementById('cle-tc-btn-zero').onclick = () => {
      this.fluidnc.sendImmediate('G92 Z0\n');
      this.notify('Work coordinate Z zeroed (G92 Z0).', 'ok');
    };
    document.getElementById('cle-tc-btn-continue').onclick = () => {
      card.style.display = 'none';
      this.fluidnc.continueAfterToolChange();
    };
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
        <!-- Vault Parameter Save Confirmation Notice -->
        <div id="cle-vault-status-notice" style="display:none; padding:8px 12px; background:rgba(57, 211, 83, 0.15); border:1px solid var(--ok); border-radius:6px; margin-bottom:8px; font-size:11px; color:var(--ok); font-weight:600; align-items:center; gap:8px;">
          <span>✔ CLE-Vault:</span> <span id="cle-vault-status-text">Parameters saved successfully.</span>
        </div>

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

        <!-- Live Controller Switch & Button States Strip -->
        <div class="cle-joycon-panel" style="padding:8px 12px; margin-top:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--ink-2); letter-spacing:0.5px;">Active Controller Switch &amp; Button States:</span>
            <span id="cle-active-btn-summary" style="font-size:10px; font-family:var(--f-mono); color:var(--ink-3);">All Switches Idle</span>
          </div>
          <div id="cle-switch-indicators" style="display:flex; flex-wrap:wrap; gap:5px; font-family:var(--f-mono); font-size:10px;">
            ${[
              { id: 0, label: 'B (0)' },
              { id: 1, label: 'A (1)' },
              { id: 2, label: 'Y (2)' },
              { id: 3, label: 'X (3)' },
              { id: 4, label: 'L (4)' },
              { id: 5, label: 'R (5)' },
              { id: 6, label: 'ZL (6)' },
              { id: 7, label: 'ZR (7)' },
              { id: 8, label: 'Minus - (8)' },
              { id: 9, label: 'Plus + (9)' },
              { id: 10, label: 'L3 (10)' },
              { id: 11, label: 'R3 (11)' },
              { id: 12, label: 'D-Up ↑ (12)' },
              { id: 13, label: 'D-Dn ↓ (13)' },
              { id: 14, label: 'D-Lf ← (14)' },
              { id: 15, label: 'D-Rt → (15)' },
              { id: 16, label: 'Home (16)' },
              { id: 17, label: 'Capture (17)' }
            ].map(b => `
              <span id="cle-btn-tag-${b.id}" class="cle-switch-pill" style="padding:3px 8px; border-radius:4px; background:var(--panel-2); border:1px solid var(--line); color:var(--ink-2); font-weight:600; transition:all 0.08s ease;">
                ${b.label}
              </span>
            `).join('')}
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

        <!-- Interactive Function Remap Table with Live Button Status Indicators -->
        <div style="max-height:220px; overflow-y:auto; border:1px solid var(--line); border-radius:6px; margin-top:8px;">
          <table class="cle-table">
            <thead>
              <tr>
                <th>Function / Action</th>
                <th>Target Action in JS / CNC</th>
                <th>Assigned Button</th>
                <th style="text-align:center;">Status</th>
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

      const toolsList = (this.toolLibrary && this.toolLibrary.tools && this.toolLibrary.tools.length > 0)
        ? this.toolLibrary.tools
        : [
            { number: 1, name: '1/4" Flat Endmill', type: 'flat', diameter: 6.35 },
            { number: 2, name: '1/8" Flat Endmill / Drill', type: 'flat', diameter: 3.175 },
            { number: 3, name: '1/8" Ball Nose Carver', type: 'ball', diameter: 3.175 }
          ];

      const renderToolOpts = (defaultNum) => toolsList.map(t =>
        `<option value="${t.number}" ${t.number === defaultNum ? 'selected' : ''}>T${t.number}: ${t.name} (${t.diameter}mm)</option>`
      ).join('');

      const toolOptionsDrill = renderToolOpts(this.slicer.laminationConfig.toolMapping?.drillingToolNumber || 2);
      const toolOptionsRough = renderToolOpts(this.slicer.laminationConfig.toolMapping?.roughingToolNumber || 1);
      const toolOptionsFinish = renderToolOpts(this.slicer.laminationConfig.toolMapping?.finishingToolNumber || 3);
      const toolOptionsCutout = renderToolOpts(this.slicer.laminationConfig.toolMapping?.cutoutToolNumber || 1);

      bodyHtml = `
        <p>Slice JumpStart 3D models with strict device-type awareness. View the continuous layer stack in Three.js and transfer to FluidNC SD Card.</p>
        
        <div class="cle-form-row" style="margin-top:10px;">
          <label>Target Machine & Slicing Order:</label>
          <select class="cle-select" id="slice-mode">
            <option value="cnc" ${this.slicer.mode==='cnc'?'selected':''}>CNC Milling / Carving (${this.machineName}) &mdash; TOP-DOWN passes</option>
            <option value="rotary" ${this.slicer.mode==='rotary'?'selected':''}>TwoTrees 4th Axis Rotary (A) & Turning &mdash; TOP-DOWN Multi-Sided Index / Lathe</option>
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

        <!-- Spoilboard Clean Cutout Breakthrough Option -->
        <div class="cle-form-row" style="margin-top:12px; background:rgba(37,99,235,0.08); padding:10px 12px; border-radius:6px; border:1px solid rgba(37,99,235,0.25);">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="slice-enable-cutout" checked style="width:16px; height:16px;">
            <span style="font-weight:700;">Spoilboard Clean Cutout (Breakthrough Pass)</span>
          </label>
          <div style="font-size:11px; color:var(--ink-2); margin-top:4px;">
            Mills 0.20mm into the spoilboard for a clean cutout without tabs. Zero risk of touching aluminum bed table (>19mm safe MDF buffer).
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-top:6px;">
            <label style="font-size:12px;">Cutout Depth into Spoilboard (mm):</label>
            <input class="cle-input" id="slice-cutout-depth" type="number" step="0.05" value="${this.bed ? (this.bed.config.cutoutOvercut || 0.20) : 0.20}" style="width:90px;">
          </div>
        </div>

        <!-- Laminated Multi-Part Slicing (Biradial Horns & Stacks) -->
        <div class="cle-form-row" style="margin-top:12px; background:rgba(250,204,21,0.08); padding:10px 12px; border-radius:6px; border:1px solid rgba(250,204,21,0.35);">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="slice-enable-lamination" ${this.slicer.laminationConfig.enabled ? 'checked' : ''} style="width:16px; height:16px;">
            <span style="font-weight:700; color:var(--ink);">🪵 Laminated Multi-Part Slicing (Biradial Horns & Stacks)</span>
          </label>
          <div style="font-size:11px; color:var(--ink-2); margin-top:4px;">
            Partitions tall complex designs (e.g. Biradial audio horns, Altec 511B style acoustic stacks) into manageable 30mm glued/doweled slabs with alignment pin holes and per-slab G-code export.
          </div>

          <div id="slice-lam-panel" style="margin-top:10px; display:${this.slicer.laminationConfig.enabled ? 'block' : 'none'};">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="cle-form-row">
                <label style="font-size:12px;">Slab Thickness (mm):</label>
                <input class="cle-input" id="slice-slab-thick" type="number" step="1.0" value="${this.slicer.laminationConfig.slabThickness || 30.0}">
              </div>
              <div class="cle-form-row">
                <label style="font-size:12px;">Dowel Margin from Edge (mm):</label>
                <input class="cle-input" id="slice-dowel-margin" type="number" step="1.0" value="${this.slicer.laminationConfig.dowelMargin || 25.0}">
              </div>
            </div>

            <!-- Slab Presets -->
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; align-items:center;">
              <span style="font-size:11px; color:var(--ink-2);">Slab Presets:</span>
              <button type="button" class="cle-btn cle-slab-preset" data-val="18.0" style="padding:2px 8px; font-size:11px;">18mm (3/4" MDF)</button>
              <button type="button" class="cle-btn cle-slab-preset" data-val="25.0" style="padding:2px 8px; font-size:11px;">25mm (1")</button>
              <button type="button" class="cle-btn cle-slab-preset" data-val="30.0" style="padding:2px 8px; font-size:11px; font-weight:700; border-color:var(--accent);">30mm (Biradial Horn)</button>
              <button type="button" class="cle-btn cle-slab-preset" data-val="40.0" style="padding:2px 8px; font-size:11px;">40mm (Heavy Slab)</button>
              <button type="button" class="cle-btn cle-slab-preset" data-val="50.0" style="padding:2px 8px; font-size:11px;">50mm (2")</button>
            </div>

            <!-- Alignment Dowel Pins -->
            <div style="margin-top:10px; padding-top:8px; border-top:1px dashed rgba(250,204,21,0.3); display:grid; grid-template-columns:1fr 1fr; gap:10px;">
              <div class="cle-form-row">
                <label style="font-size:12px;">Dowel Pin Diameter (mm):</label>
                <input class="cle-input" id="slice-dowel-dia" type="number" step="0.5" value="${this.slicer.laminationConfig.dowelDiameter || 8.0}">
              </div>
              <div class="cle-form-row">
                <label style="font-size:12px;">Registration Dowel Holes:</label>
                <select class="cle-select" id="slice-dowel-count" style="font-size:12px;">
                  <option value="4" ${this.slicer.laminationConfig.dowelHoleCount === 4 ? 'selected' : ''}>4 Holes (Symmetric Corners)</option>
                  <option value="2" ${this.slicer.laminationConfig.dowelHoleCount === 2 ? 'selected' : ''}>2 Holes (Diagonal Alignment)</option>
                </select>
              </div>
            </div>

            <!-- Tool Mapping for Slices -->
            <div style="margin-top:10px; padding-top:8px; border-top:1px dashed rgba(250,204,21,0.3);">
              <div style="font-size:12px; font-weight:700; color:var(--ink); margin-bottom:6px;">Tool Library Operation Mapping:</div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                <div class="cle-form-row">
                  <label style="font-size:11px;">Op 1: Dowel Pin Drilling:</label>
                  <select class="cle-select" id="slice-tool-drill" style="font-size:11px;">
                    ${toolOptionsDrill}
                  </select>
                </div>
                <div class="cle-form-row">
                  <label style="font-size:11px;">Op 2: Bulk Roughing Pass:</label>
                  <select class="cle-select" id="slice-tool-rough" style="font-size:11px;">
                    ${toolOptionsRough}
                  </select>
                </div>
                <div class="cle-form-row">
                  <label style="font-size:11px;">Op 3: 3D Contour Finishing:</label>
                  <select class="cle-select" id="slice-tool-finish" style="font-size:11px;">
                    ${toolOptionsFinish}
                  </select>
                </div>
                <div class="cle-form-row">
                  <label style="font-size:11px;">Op 4: Spoilboard Cutout:</label>
                  <select class="cle-select" id="slice-tool-cutout" style="font-size:11px;">
                    ${toolOptionsCutout}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top:14px; display:flex; gap:10px;">
          <button class="cle-btn" id="slice-run-btn" style="background:var(--accent); color:var(--on-accent); padding:8px 18px; font-weight:700;">Slice & Display in 3D Viewport</button>
          <button class="cle-btn" id="slice-return-btn" style="background:#2563eb; color:#fff; padding:8px 18px; font-weight:700;" title="Return to JumpStart CAD Design Workspace">Return to Design</button>
        </div>
      `;
    } else if (type === 'rotary') {
      title = 'TwoTrees 4th Axis Rotary (A) & Turning Setup';
      const rot = this.rotary;
      const spd = rot.getStepsPerDegree();

      bodyHtml = `
        <div style="background:rgba(217, 119, 6, 0.12); border-left:4px solid #d97706; padding:8px 12px; border-radius:4px; margin-bottom:12px; font-size:12px;">
          <strong>TwoTrees TTC6050 / TTC450 4th Axis Kit:</strong> Center of rotation is <strong>${rot.centerHeightMm.toFixed(1)}mm from aluminum bed</strong>.
          The A-axis replaces the spoilboard (spoilboard unmounted during rotary operations).
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <!-- 1. Pulley & Drive Ratio -->
          <div style="background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:12px;">
            <div style="font-weight:700; color:var(--accent); font-size:12px; margin-bottom:8px; text-transform:uppercase;">Drive & Pulleys</div>
            <div class="cle-form-row">
              <label>Kit Preset:</label>
              <select class="cle-select" id="rot-preset-select">
                <option value="twotrees" selected>TwoTrees TTC6050/450 Kit (5:1, 15/55mm)</option>
                <option value="twotrees4">TwoTrees Standard (4:1 Ratio)</option>
                <option value="custom">Custom Chuck / Pulleys</option>
              </select>
            </div>
            <div class="cle-form-row">
              <label>Gear Ratio (X:1):</label>
              <input class="cle-input" id="rot-gear-ratio" type="number" step="0.1" value="${rot.gearRatio}">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div class="cle-form-row">
                <label style="font-size:11px;">Motor Pulley (mm):</label>
                <input class="cle-input" id="rot-motor-pulley" type="number" step="1" value="${rot.motorPulleyMm}">
              </div>
              <div class="cle-form-row">
                <label style="font-size:11px;">Chuck Pulley (mm):</label>
                <input class="cle-input" id="rot-chuck-pulley" type="number" step="1" value="${rot.chuckPulleyMm}">
              </div>
            </div>
            <div style="font-size:11px; color:var(--ink-2); margin-top:6px; padding:6px; background:rgba(0,0,0,0.1); border-radius:4px;">
              Stepper: NEMA17 (200 st/rev, 16x) &rarr; <span id="rot-steps-deg-lbl" style="color:var(--accent); font-weight:700;">${spd.toFixed(3)}</span> steps/degree
            </div>
          </div>

          <!-- 2. Mounting Position & Rotation Center -->
          <div style="background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:12px;">
            <div style="font-weight:700; color:var(--accent); font-size:12px; margin-bottom:8px; text-transform:uppercase;">Mounting Center & Boundaries</div>
            <div class="cle-form-row">
              <label>Center of Chuck in Y (mm):</label>
              <input class="cle-input" id="rot-center-y" type="number" value="${rot.centerY}">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div class="cle-form-row">
                <label style="font-size:11px;">Centerline to Bed (mm):</label>
                <input class="cle-input" id="rot-center-z" type="number" value="${rot.centerHeightMm}">
              </div>
              <div class="cle-form-row">
                <label style="font-size:11px;">Chuck Assy Height (mm):</label>
                <input class="cle-input" id="rot-chuck-h" type="number" value="${rot.chuckAssemblyHeightMm}" title="TwoTrees chuck is 66mm tall (fits under X-axis gantry)">
              </div>
            </div>
            <!-- Chuck X with Nudge Controls -->
            <div style="margin-top:6px;">
              <div style="font-size:11px; font-weight:600; margin-bottom:2px;">Chuck X Face (Start of Object):</div>
              <div style="display:flex; gap:3px; align-items:center;">
                <button class="cle-btn" id="rot-btn-chuck-m10" style="padding:2px 5px; font-size:10px;">-10</button>
                <button class="cle-btn" id="rot-btn-chuck-m1" style="padding:2px 5px; font-size:10px;">-1</button>
                <input class="cle-input" id="rot-chuck-x" type="number" style="flex:1; text-align:center;" value="${rot.chuckX}">
                <button class="cle-btn" id="rot-btn-chuck-p1" style="padding:2px 5px; font-size:10px;">+1</button>
                <button class="cle-btn" id="rot-btn-chuck-p10" style="padding:2px 5px; font-size:10px;">+10</button>
              </div>
            </div>

            <!-- Opposing Center X with Nudge Controls -->
            <div style="margin-top:6px;">
              <div style="font-size:11px; font-weight:600; margin-bottom:2px;">Opposing Center X (End of Object):</div>
              <div style="display:flex; gap:3px; align-items:center;">
                <button class="cle-btn" id="rot-btn-tail-m10" style="padding:2px 5px; font-size:10px;">-10</button>
                <button class="cle-btn" id="rot-btn-tail-m1" style="padding:2px 5px; font-size:10px;">-1</button>
                <input class="cle-input" id="rot-tailstock-x" type="number" style="flex:1; text-align:center;" value="${rot.tailstockX}">
                <button class="cle-btn" id="rot-btn-tail-p1" style="padding:2px 5px; font-size:10px;">+1</button>
                <button class="cle-btn" id="rot-btn-tail-p10" style="padding:2px 5px; font-size:10px;">+10</button>
              </div>
            </div>

            <!-- Positioning Actions -->
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; margin-bottom:6px;">
              <button class="cle-btn" id="rot-btn-fit-object" style="background:#ea580c; color:#fff; font-size:11px; font-weight:700; padding:5px 6px;" title="Align Chuck to Xmin and Center to Xmax">
                Clamp to Ends
              </button>
              <button class="cle-btn" id="rot-btn-center-object" style="background:#0284c7; color:#fff; font-size:11px; font-weight:700; padding:5px 6px;" title="Center chuck and center symmetrically around object midpoint">
                Center on Object
              </button>
            </div>

            <!-- Center Point Tool Controls -->
            <div style="background:rgba(6, 182, 212, 0.08); border:1px solid #06b6d4; border-radius:6px; padding:8px; margin-top:6px;">
              <div style="font-size:11px; font-weight:700; color:#0891b2; margin-bottom:4px; text-transform:uppercase;">
                🎯 Center Point Tool
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                <button class="cle-btn" id="rot-btn-toggle-tool" style="background:${rot.centerPointVisible ? '#06b6d4' : 'var(--paper)'}; color:${rot.centerPointVisible ? '#fff' : 'var(--ink)'}; font-size:11px; font-weight:600; padding:4px 6px;">
                  ${rot.centerPointVisible ? 'Hide Center Tool' : 'Show Center Tool'}
                </button>
                <button class="cle-btn" id="rot-btn-jog-center" style="background:#f59e0b; color:#000; font-size:11px; font-weight:700; padding:4px 6px;" title="Jog CNC spindle / laser head to rotation center point">
                  Jog to Center Point
                </button>
              </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
              <div class="cle-form-row">
                <label style="font-size:11px;">Safety Floor (Zbot mm):</label>
                <input class="cle-input" id="rot-safe-limit" type="number" step="1" value="${rot.zSafetyLimit}" title="-5mm boundary below centerline">
              </div>
              <div class="cle-form-row">
                <label style="font-size:11px;">Safe Retract (Ztop mm):</label>
                <input class="cle-input" id="rot-clearance" type="number" step="1" value="${rot.zClearance}">
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Stock Dimensions & Machine Z Clearance Accounting -->
        <div style="background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:12px; margin-top:10px;">
          <div style="font-weight:700; color:var(--accent); font-size:12px; margin-bottom:8px; text-transform:uppercase;">
            Stock Dimensions & Bed / Gantry Clearance Accounting
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="cle-form-row">
              <label>Stock Diameter (mm):</label>
              <input class="cle-input" id="rot-stock-dia" type="number" step="1" max="80" value="${rot.stockDiameter}">
            </div>
            <div class="cle-form-row">
              <label>Stock Length (mm):</label>
              <input class="cle-input" id="rot-stock-len" type="number" step="5" value="${rot.stockLength}">
            </div>
          </div>
          <div id="rot-clearance-feedback" style="margin-top:8px; font-size:11px; padding:8px 10px; border-radius:6px; background:rgba(0,0,0,0.06); border:1px solid var(--line);">
            ${(() => {
              const clr = rot.checkClearances(rot.stockDiameter);
              const color = clr.status === 'ok' || clr.status === 'shielded' ? 'var(--ok)' : (clr.status === 'collision' ? 'var(--err)' : '#d97706');
              return `
                <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:600;">
                  <span>Bed Floor Margin: <strong>${clr.bedMargin.toFixed(1)} mm</strong> (Min 5mm | Max Ø${clr.maxSafeDia.toFixed(0)}mm)</span>
                  <span>Material Top: <strong>${clr.matTop.toFixed(1)} mm from bed</strong> (Chuck is ${clr.chuckTop}mm)</span>
                </div>
                <div style="color:${color}; font-weight:700;">
                  ${clr.message}
                </div>
              `;
            })()}
          </div>
        </div>

        <!-- 4. Turning & Index Modes Panels -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:10px;">
          <!-- Turning Mode Panel -->
          <div style="background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:12px;">
            <div style="font-weight:700; color:#0284c7; font-size:12px; margin-bottom:6px;">🔄 Turning Mode (Lathe Spindle)</div>
            <p style="font-size:11px; color:var(--ink-2); margin-bottom:8px;">Continuous A-axis rotation at constant RPM or deg/s.</p>
            <div style="display:flex; gap:8px; align-items:center;">
              <div class="cle-form-row" style="flex:1;">
                <label style="font-size:11px;">Speed (RPM):</label>
                <input class="cle-input" id="rot-turn-rpm" type="number" min="1" max="600" value="${rot.turningRPM}">
              </div>
              <div style="font-size:11px; font-weight:700; color:var(--ok); min-width:80px;" id="rot-turn-degs">
                ${(rot.turningRPM * 6).toFixed(0)}°/s
              </div>
            </div>
            <div style="display:flex; gap:6px; margin-top:8px;">
              <button class="cle-btn" id="rot-btn-turn-start" style="background:#0284c7; color:#fff; font-weight:700; flex:1; padding:4px 8px;">▶ Start Turning</button>
              <button class="cle-btn" id="rot-btn-turn-stop" style="background:#ef4444; color:#fff; font-weight:700; padding:4px 10px;">Stop</button>
            </div>
          </div>

          <!-- Index Mode Panel -->
          <div style="background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:12px;">
            <div style="font-weight:700; color:#10b981; font-size:12px; margin-bottom:6px;">📐 Index Mode (Top-Down Multi-Sided)</div>
            <p style="font-size:11px; color:var(--ink-2); margin-bottom:8px;">Rotates A to orient each face straight UP for top-down CNC/Laser cutting.</p>
            <div class="cle-form-row">
              <label style="font-size:11px;">Index Preset:</label>
              <select class="cle-select" id="rot-index-mode-sel" style="font-size:11px;">
                <option value="2-sided" ${rot.indexMode === '2-sided' ? 'selected' : ''}>2-Sided (0°, 180°)</option>
                <option value="4-sided" ${rot.indexMode === '4-sided' ? 'selected' : ''}>4-Sided (0°, 90°, 180°, 270°)</option>
                <option value="6-sided" ${rot.indexMode === '6-sided' ? 'selected' : ''}>6-Sided (0°, 60°, 120°, 180°, 240°, 300°)</option>
                <option value="8-sided" ${rot.indexMode === '8-sided' ? 'selected' : ''}>8-Sided (45° steps)</option>
                <option value="custom" ${rot.indexMode === 'custom' ? 'selected' : ''}>Custom Step Angle</option>
              </select>
            </div>
            <div style="display:flex; gap:6px; margin-top:8px; align-items:center;">
              <button class="cle-btn" id="rot-btn-idx-prev" style="padding:3px 10px;">&larr; Prev</button>
              <span id="rot-idx-status" style="font-family:var(--f-mono); font-size:11px; font-weight:700; color:var(--accent); text-align:center; flex:1;">
                A = ${rot.currentAngle.toFixed(1)}°
              </span>
              <button class="cle-btn" id="rot-btn-idx-next" style="padding:3px 10px;">Next &rarr;</button>
              <button class="cle-btn" id="rot-btn-zero-a" style="padding:3px 8px; font-size:10px;">Zero A</button>
            </div>
          </div>
        </div>

        <div style="margin-top:14px; display:flex; gap:10px; align-items:center;">
          <button class="cle-btn" id="rot-btn-apply" style="background:var(--accent); color:var(--on-accent); padding:8px 18px; font-weight:700;">Apply & Mount 4th Axis</button>
          <button class="cle-btn" id="rot-btn-send-step" style="background:var(--paper); padding:8px 14px; font-size:11px;" title="Send $103 steps/degree to FluidNC controller">Send $103 to FluidNC</button>
          <button class="cle-btn" id="rot-btn-return" style="background:#2563eb; color:#fff; padding:8px 18px; font-weight:700; margin-left:auto;" title="Return to JumpStart CAD Design Workspace">Return</button>
        </div>
      `;
    } else if (type === 'spoilboard') {
      title = '🪵 Spoilboard Size, Z Thickness & Workpiece Elevation';
      const bConf = this.bed ? this.bed.config : { spoilboardX: 600, spoilboardY: 500, spoilboardThickness: 20.0, cutoutOvercut: 0.2 };
      const curThick = bConf.spoilboardThickness !== undefined ? bConf.spoilboardThickness : 20.0;
      const curX = bConf.spoilboardX || 600;
      const curY = bConf.spoilboardY || 500;
      const curCutout = bConf.cutoutOvercut !== undefined ? bConf.cutoutOvercut : 0.2;
      const curOffX = bConf.spoilboardOffsetX || 0;
      const curOffY = bConf.spoilboardOffsetY || 0;

      bodyHtml = `
        <p style="margin-bottom:12px; font-size:12px; color:var(--ink-2);">
          Configure the physical spoilboard slab sitting on top of the machine aluminum table bed.
          The workpiece sits flush on the spoilboard surface, allowing the tool to mill 0.2mm into the spoilboard for 100% clean cutouts without touching the aluminum table.
        </p>

        <!-- Visual Stack Diagram -->
        <div style="background:var(--paper); border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin-bottom:14px;">
          <div style="font-weight:700; font-size:12px; color:var(--accent); margin-bottom:8px; text-transform:uppercase; letter-spacing:0.5px;">
            Physical 3D Coordinate Stack
          </div>
          <div style="display:flex; flex-direction:column; gap:6px; font-family:monospace; font-size:12px;">
            <div style="display:flex; justify-content:space-between; padding:6px 10px; background:rgba(56, 189, 248, 0.12); border-left:4px solid #38bdf8; border-radius:4px;">
              <span><strong>Workpiece (3D CAD Object):</strong> Sits on top of Spoilboard</span>
              <span id="stack-workpiece-z" style="color:#0284c7; font-weight:700;">Z = +${(0.1 + curThick).toFixed(2)} mm</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 10px; background:rgba(245, 158, 11, 0.12); border-left:4px solid #f59e0b; border-radius:4px;">
              <span><strong>Clean Cutout Breakthrough Level:</strong> -${curCutout.toFixed(2)}mm into spoilboard</span>
              <span id="stack-cutout-z" style="color:#d97706; font-weight:700;">Z = +${(0.1 + curThick - curCutout).toFixed(2)} mm</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 10px; background:rgba(37, 99, 235, 0.15); border-left:4px solid #2563eb; border-radius:4px;">
              <span><strong>Spoilboard Slab (MDF / Sacrificial Fixture):</strong> Thickness = <span id="stack-thick-val">${curThick.toFixed(1)}</span> mm</span>
              <span id="stack-spoil-span" style="color:#1d4ed8; font-weight:700;">Z = +0.10 .. +${(0.1 + curThick).toFixed(2)} mm</span>
            </div>
            <div style="display:flex; justify-content:space-between; padding:6px 10px; background:rgba(100, 116, 139, 0.15); border-left:4px solid #64748b; border-radius:4px;">
              <span><strong>Aluminum Machine Table Bed:</strong> Safety Limit Floor (Zero Risk)</span>
              <span style="color:#475569; font-weight:700;">Z = +0.10 mm Hard Floor</span>
            </div>
          </div>
          <div id="stack-safety-margin" style="margin-top:8px; font-size:11px; color:var(--ok); font-weight:600;">
            ✔ ${(curThick - curCutout).toFixed(2)} mm of protective MDF buffer between cutout pass and aluminum table bed.
          </div>
        </div>

        <!-- Spoilboard Dimensions Form -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="cle-form-row">
            <label>Spoilboard Width (X mm):</label>
            <input class="cle-input" id="cle-sp-width" type="number" value="${curX}" step="10">
          </div>
          <div class="cle-form-row">
            <label>Spoilboard Depth (Y mm):</label>
            <input class="cle-input" id="cle-sp-depth" type="number" value="${curY}" step="10">
          </div>
        </div>

        <div style="margin-top:10px;">
          <div class="cle-form-row">
            <label>Spoilboard Z Thickness (mm):</label>
            <input class="cle-input" id="cle-sp-thick" type="number" value="${curThick}" step="0.5">
          </div>
          <!-- Quick Preset Chips -->
          <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px; align-items:center;">
            <span style="font-size:11px; color:var(--ink-2);">Presets:</span>
            <button class="cle-btn cle-sp-preset" data-val="12.0" style="padding:2px 8px; font-size:11px;">12mm (1/2")</button>
            <button class="cle-btn cle-sp-preset" data-val="15.0" style="padding:2px 8px; font-size:11px;">15mm</button>
            <button class="cle-btn cle-sp-preset" data-val="18.0" style="padding:2px 8px; font-size:11px;">18mm</button>
            <button class="cle-btn cle-sp-preset" data-val="19.05" style="padding:2px 8px; font-size:11px;">19.05mm (3/4")</button>
            <button class="cle-btn cle-sp-preset" data-val="20.0" style="padding:2px 8px; font-size:11px; font-weight:700; border-color:var(--accent);">20mm (Standard)</button>
            <button class="cle-btn cle-sp-preset" data-val="25.0" style="padding:2px 8px; font-size:11px;">25mm (1")</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:12px;">
          <div class="cle-form-row">
            <label>Offset X (mm):</label>
            <input class="cle-input" id="cle-sp-offx" type="number" value="${curOffX}">
          </div>
          <div class="cle-form-row">
            <label>Offset Y (mm):</label>
            <input class="cle-input" id="cle-sp-offy" type="number" value="${curOffY}">
          </div>
        </div>

        <div class="cle-form-row" style="margin-top:10px;">
          <label>Breakthrough Cutout Depth into Spoilboard (mm):</label>
          <input class="cle-input" id="cle-sp-cutout" type="number" step="0.05" value="${curCutout}">
        </div>

        <!-- Action Buttons -->
        <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <button class="cle-btn" id="cle-sp-btn-sit" style="background:var(--ok); color:#fff; font-weight:700; padding:8px 16px;">
            🪑 Sit 3D Object on Spoilboard
          </button>
          <div style="display:flex; gap:8px;">
            <button class="cle-btn" id="cle-sp-btn-cancel">Close</button>
            <button class="cle-btn" id="cle-sp-btn-save" style="background:var(--accent); color:var(--on-accent); font-weight:700; padding:8px 18px;">
              Apply & Save to Vault
            </button>
          </div>
        </div>
      `;
    } else if (type === 'grayscale') {
      title = '🖼️ Grayscale Heightmap to Slices (Original CLE)';
      bodyHtml = `
        <p>Convert 8-bit or 16-bit grayscale depthmaps/relief images into multi-pass toolpath slices with real-time brightness, contrast, and gamma modulation.</p>
        
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:10px;">
          <div class="cle-form-row">
            <label>Machine Mode (Device-Aware):</label>
            <select class="cle-select" id="grey-mode">
              <option value="cnc" ${this.slicer.mode==='cnc'?'selected':''}>CNC Milling (Top-Down Carving into Stock)</option>
              <option value="laser" ${this.slicer.mode==='laser'?'selected':''}>Laser Engraving (Power Modulated S0-S1000)</option>
              <option value="3d" ${this.slicer.mode==='3d'?'selected':''}>3D Additive Relief (Lithophane Bottom-Up)</option>
            </select>
          </div>
          <div class="cle-form-row">
            <label>Bit Depth Mode:</label>
            <select class="cle-select" id="grey-bitdepth">
              <option value="8bit">8-Bit Mode (256 Discrete Grayscale Levels)</option>
              <option value="16bit">16-Bit Mode (High-Precision 65,536 Levels)</option>
            </select>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <div class="cle-form-row">
            <label>Number of Slices / Passes:</label>
            <input class="cle-input" id="grey-slices" type="number" min="2" max="64" value="16">
          </div>
          <div class="cle-form-row">
            <label>Max Carving / Relief Depth (mm):</label>
            <input class="cle-input" id="grey-depth" type="number" step="0.5" value="4.0">
          </div>
        </div>

        <div class="cle-joycon-panel" style="padding:10px 14px; margin-top:8px;">
          <div class="cle-joycon-title" style="margin-bottom:8px;">Image Modulation Controls</div>
          <div class="cle-form-row" style="margin-bottom:6px;">
            <label>Brightness: <span id="lbl-grey-bright" style="font-family:var(--f-mono);">0</span></label>
            <input type="range" id="grey-bright" min="-100" max="100" value="0" style="width:100%;">
          </div>
          <div class="cle-form-row" style="margin-bottom:6px;">
            <label>Contrast: <span id="lbl-grey-contrast" style="font-family:var(--f-mono);">0</span></label>
            <input type="range" id="grey-contrast" min="-100" max="100" value="0" style="width:100%;">
          </div>
          <div class="cle-form-row" style="margin-bottom:6px;">
            <label>Gamma: <span id="lbl-grey-gamma" style="font-family:var(--f-mono);">1.0</span></label>
            <input type="range" id="grey-gamma" min="20" max="300" value="100" style="width:100%;">
          </div>
        </div>

        <div class="cle-form-row" style="margin-top:10px;">
          <label>Load Custom Image File (Optional):</label>
          <input type="file" id="grey-file" accept="image/*" class="cle-input" style="padding:4px;">
        </div>

        <div style="margin-top:14px; display:flex; justify-content:flex-end; gap:8px;">
          <button class="cle-btn" id="grey-btn-generate" style="background:var(--accent); color:var(--on-accent); padding:8px 18px; font-weight:700;">Generate Slices & View in 3D</button>
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
            <button class="cle-btn" id="cle-mach-btn-connect" style="background:var(--accent); color:var(--on-accent); font-weight:700;">Connect</button>
            <button class="cle-btn" id="cle-mach-btn-activate" style="background:var(--ok); color:#fff; font-weight:700;">Make Active Device</button>
            <button class="cle-btn" id="cle-mach-btn-query" title="Auto-detect machine settings by querying controller ($$, $I)">Query ($$, $I)</button>
            <button class="cle-btn" id="cle-mach-btn-read-yaml" style="background:var(--accent); color:var(--on-accent); font-weight:600;" title="Load full capability model from FluidNC flash config.yaml">Read Flash config.yaml</button>
            <button class="cle-btn" id="cle-mach-btn-import-yaml" title="Import local config.yaml file from disk">Import config.yaml</button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <!-- Left Column: Work Area & Spoilboard Bounds -->
          <div class="cle-joycon-panel">
            <div class="cle-joycon-title">Work Area &amp; Spoilboard Size</div>
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
              <label>Spoilboard Width (X mm):</label>
              <input class="cle-input" id="cle-m-spoil-x" type="number" value="${activeMach.spoilboardX || activeMach.travelX || 600}" title="Width of spoilboard MDF or fixture slab">
            </div>
            <div class="cle-form-row">
              <label>Spoilboard Depth (Y mm):</label>
              <input class="cle-input" id="cle-m-spoil-y" type="number" value="${activeMach.spoilboardY || activeMach.travelY || 500}" title="Depth/length of spoilboard MDF or fixture slab">
            </div>
            <div class="cle-form-row">
              <label>Spoilboard Thickness (mm):</label>
              <input class="cle-input" id="cle-m-spoil-thick" type="number" step="0.5" value="${activeMach.spoilboardThickness !== undefined ? activeMach.spoilboardThickness : 15.0}" title="Thickness of spoilboard slab (placed below Z=0)">
            </div>
            <div class="cle-form-row">
              <label>Spoilboard Offset (X, Y mm):</label>
              <div style="display:flex; gap:6px;">
                <input class="cle-input" id="cle-m-spoil-offx" type="number" value="${activeMach.spoilboardOffsetX || 0}" style="width:50%;" title="Offset X from machine 0,0">
                <input class="cle-input" id="cle-m-spoil-offy" type="number" value="${activeMach.spoilboardOffsetY || 0}" style="width:50%;" title="Offset Y from machine 0,0">
              </div>
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
              <input class="cle-input" id="cle-m-ip" value="${activeMach.wifiIP || '192.168.12.158'}">
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
    } else if (type === 'tools') {
      title = '🔧 Tool Library & Tool Changes (Spindles & Lasers)';
      const tools = this.toolLibrary.tools;
      const ts = this.toolLibrary.toolsetter;

      bodyHtml = `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--paper); padding:10px 14px; border-radius:6px; border:1px solid var(--line); margin-bottom:12px; flex-wrap:wrap; gap:8px;">
          <div>
            <span style="font-weight:700; color:var(--accent);">Tool Library:</span>
            <span style="font-size:11px; color:var(--ink-2); margin-left:6px;">${tools.length} Tools Configured (Endmills, V-Bits, Lasers)</span>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="cle-btn" id="cle-tl-btn-add" style="background:var(--ok); color:#fff; font-weight:700;">+ Add New Tool</button>
            <button class="cle-btn" id="cle-tl-btn-save-vault">Save to Vault</button>
          </div>
        </div>

        <!-- Tool Change & Toolsetter Mode Configuration -->
        <div class="cle-joycon-panel" style="padding:10px 12px; margin-bottom:12px;">
          <div class="cle-joycon-title" style="margin-bottom:8px;">Tool Change Mode &amp; Toolsetter Setup (MTC / ATC)</div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; font-size:11px;">
            <div>
              <div class="cle-form-row" style="grid-template-columns:140px 1fr; margin-bottom:6px;">
                <label>Change Mode:</label>
                <select class="cle-select" id="cle-ts-mode" style="padding:3px 6px;">
                  <option value="mtc_probe" ${ts.mode==='mtc_probe'?'selected':''}>Manual Tool Change + Touch-Plate (MTC Probe)</option>
                  <option value="mtc_fixed" ${ts.mode==='mtc_fixed'?'selected':''}>Manual Fixed-Length Stop Ring</option>
                  <option value="atc_rack" ${ts.mode==='atc_rack'?'selected':''}>Automated Tool Changer (ATC Rack Slots)</option>
                </select>
              </div>
              <div class="cle-form-row" style="grid-template-columns:140px 1fr; margin-bottom:6px;">
                <label>Park Pos (G53 XYZ):</label>
                <div style="display:flex; gap:4px;">
                  <input class="cle-input" id="cle-ts-park-x" type="number" value="${ts.parkPosition.X}" style="width:50px; padding:2px 4px;">
                  <input class="cle-input" id="cle-ts-park-y" type="number" value="${ts.parkPosition.Y}" style="width:50px; padding:2px 4px;">
                  <input class="cle-input" id="cle-ts-park-z" type="number" value="${ts.parkPosition.Z}" style="width:50px; padding:2px 4px;">
                </div>
              </div>
            </div>
            <div>
              <div class="cle-form-row" style="grid-template-columns:140px 1fr; margin-bottom:6px;">
                <label>Toolsetter (G53 XY):</label>
                <div style="display:flex; gap:4px;">
                  <input class="cle-input" id="cle-ts-pos-x" type="number" value="${ts.setterPosition.X}" style="width:60px; padding:2px 4px;">
                  <input class="cle-input" id="cle-ts-pos-y" type="number" value="${ts.setterPosition.Y}" style="width:60px; padding:2px 4px;">
                </div>
              </div>
              <div class="cle-form-row" style="grid-template-columns:140px 1fr; margin-bottom:6px;">
                <label>Plate Thickness (mm):</label>
                <input class="cle-input" id="cle-ts-thick" type="number" step="0.1" value="${ts.touchPlateThicknessMm}" style="width:80px; padding:2px 4px;">
              </div>
            </div>
          </div>
          <div style="display:flex; justify-content:flex-end; margin-top:6px;">
            <button class="cle-btn" id="cle-ts-save-btn" style="font-size:11px;">Update Toolsetter Config</button>
          </div>
        </div>

        <!-- Tools Table -->
        <div style="max-height:280px; overflow-y:auto; border:1px solid var(--line); border-radius:6px;">
          <table class="cle-table">
            <thead>
              <tr>
                <th>T#</th>
                <th>Tool Name</th>
                <th>Type</th>
                <th>Geometry / Laser Specs</th>
                <th>Assigned Head</th>
                <th>Feeds &amp; Speeds</th>
                <th>Tool Change Action</th>
              </tr>
            </thead>
            <tbody>
              ${tools.map(t => {
                const isLaser = (t.type === 'laser');
                const specs = isLaser
                  ? `<strong>${t.opticalWatts}W Optical</strong> (${t.electricalWatts}W Draw, ${t.efficiencyPct}%)<br><span style="font-size:10px; color:var(--ink-3);">Focal: ${t.focalDistanceMm}mm | ${t.pwmFrequencyHz}Hz</span>`
                  : `Ø${t.diameter}mm (Flute: ${t.fluteLength || '--'}mm)`;
                const head = isLaser
                  ? `<span class="cle-badge" style="background:#e34c26; color:#fff;">Laser ${t.laserNumber || 1}</span>`
                  : `<span class="cle-badge" style="background:var(--accent); color:var(--on-accent);">Spindle ${t.spindleNumber || 1}</span>`;
                const feeds = isLaser
                  ? `Feed: ${t.feedXY} mm/min`
                  : `RPM: ${t.spindleRPM || 12000}<br>F: ${t.feedXY} / P: ${t.plungeZ}`;

                return `
                  <tr>
                    <td><strong>T${t.number}</strong></td>
                    <td><strong>${t.name}</strong></td>
                    <td><span style="text-transform:uppercase; font-size:10px; font-weight:700;">${t.type}</span></td>
                    <td style="font-size:11px;">${specs}</td>
                    <td>${head}</td>
                    <td style="font-size:11px; font-family:var(--f-mono);">${feeds}</td>
                    <td>
                      <div style="display:flex; gap:4px;">
                        <button class="cle-btn" onclick="window.CLE.toolLibrary.executeLiveToolChange(${t.number})" style="background:var(--ok); color:#fff; padding:2px 8px; font-weight:600;">Change (T${t.number})</button>
                        <button class="cle-btn danger" onclick="window.CLE.deleteToolFromUI(${t.number})" style="padding:2px 6px;">&times;</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'calibration' || type === 'test') {
      title = '🎯 Machine Calibration & Chassis Squareness Diagnostics';
      const limits = this.calibration.getMachineLimits();
      const xSpan = limits.maxX - limits.minX;
      const ySpan = limits.maxY - limits.minY;
      const diagLen = Math.hypot(xSpan, ySpan).toFixed(2);
      const maxSq = Math.min(xSpan, ySpan);
      const sqSizes = [1.0, 0.8, 0.6, 0.4, 0.2].map(f => (maxSq * f).toFixed(1));

      bodyHtml = `
        <!-- Calibration Navigation Tabs -->
        <div style="display:flex; gap:6px; border-bottom:1px solid var(--line); padding-bottom:8px; margin-bottom:12px; flex-wrap:wrap;">
          <button class="cle-btn" id="cle-cal-tab-btn-1" style="background:var(--accent); color:var(--on-accent); font-weight:700; font-size:11px;">Test 1: Chassis Squareness &amp; Circles</button>
          <button class="cle-btn" id="cle-cal-tab-btn-2" style="background:var(--panel-2); font-weight:600; font-size:11px;">Test 2: 4-Quadrant 3D Relief (120x120mm)</button>
          <button class="cle-btn" id="cle-cal-tab-btn-3" style="background:var(--panel-2); font-weight:600; font-size:11px;">Steps/mm Calculator</button>
          <button class="cle-btn" id="cle-cal-tab-btn-4" style="background:var(--panel-2); font-weight:600; font-size:11px;">Laser Power Matrix</button>
          <button class="cle-btn" id="cle-cal-tab-btn-5" style="background:var(--panel-2); font-weight:600; font-size:11px;">Backlash Routine</button>
        </div>

        <!-- TAB 1: TEST ONE (Chassis Squareness, Diagonals, 5 Concentric Squares & Inscribed Tangent Circles) -->
        <div id="cle-cal-pane-1" class="cle-cal-pane" style="display:block;">
          <div style="background:var(--paper); padding:10px 14px; border-radius:6px; border:1px solid var(--line); margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div>
                <strong style="color:var(--accent); font-size:13px;">Test 1: Full-Bed Chassis Squareness &amp; Circle Roundness</strong>
                <div style="font-size:11px; color:var(--ink-2); margin-top:2px;">
                  Corner-to-corner diagonals crossing at exact bed center + 5 concentric descending squares with inscribed tangent circles.
                </div>
              </div>
              <div style="display:flex; gap:6px;">
                <button class="cle-btn" id="cle-cal-t1-preview-btn" style="background:var(--accent); color:var(--on-accent); font-weight:700;">👁 3D Viewport Preview</button>
                <button class="cle-btn" id="cle-cal-t1-export-btn">💾 Export G-Code (.nc)</button>
                <button class="cle-btn" id="cle-cal-t1-upload-btn">⚡ Upload to SD</button>
                <button class="cle-btn danger" id="cle-cal-t1-run-btn">▶ Stream to Machine</button>
              </div>
            </div>
          </div>

          <!-- Machine Envelopes & Diagnostics Strip -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px;">
            <div class="cle-joycon-panel" style="padding:10px 12px;">
              <div class="cle-joycon-title" style="margin-bottom:6px;">Active Machine Bounds (5mm Safety Inset)</div>
              <table style="width:100%; font-size:11px; font-family:var(--f-mono);">
                <tr><td>X Envelope:</td><td><strong>${limits.minX.toFixed(1)}mm to ${limits.maxX.toFixed(1)}mm</strong> (${limits.travelX}mm travel - 5mm)</td></tr>
                <tr><td>Y Envelope:</td><td><strong>${limits.minY.toFixed(1)}mm to ${limits.maxY.toFixed(1)}mm</strong> (${limits.travelY}mm travel - 5mm)</td></tr>
                <tr><td>Bed Center:</td><td><strong>X=${limits.centerX.toFixed(2)}mm, Y=${limits.centerY.toFixed(2)}mm</strong> (Intersection)</td></tr>
                <tr><td>Diagonals (1 &amp; 2):</td><td><strong>${diagLen}mm</strong> each corner-to-corner</td></tr>
              </table>
            </div>

            <div class="cle-joycon-panel" style="padding:10px 12px;">
              <div class="cle-joycon-title" style="margin-bottom:6px;">5 Concentric Squares &amp; Inscribed Tangent Circles</div>
              <div style="font-size:11px; color:var(--ink-2); margin-bottom:4px;">Centered symmetrically at (X:${limits.centerX.toFixed(0)}, Y:${limits.centerY.toFixed(0)}):</div>
              <div style="display:flex; flex-wrap:wrap; gap:4px; font-size:10px; font-family:var(--f-mono);">
                ${sqSizes.map((s, idx) => `
                  <span class="cle-switch-pill" style="padding:3px 6px; background:var(--panel-2); border:1px solid var(--line);">
                    #${idx+1}: <strong>${s}x${s}mm</strong> (⌀${s}mm)
                  </span>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Diagnostic Measurement Guide -->
          <div class="cle-joycon-panel" style="padding:10px 14px; background:rgba(2, 132, 199, 0.05); border:1px solid rgba(2, 132, 199, 0.25);">
            <div style="font-size:11px; font-weight:700; color:var(--accent); margin-bottom:4px;">📐 How to Measure &amp; Calibrate:</div>
            <div style="font-size:11px; line-height:1.5; color:var(--ink-1);">
              <strong>1. Chassis Squareness (Orthogonality):</strong> Measure Diagonal 1 (Lower-Left to Upper-Right) and Diagonal 2 (Upper-Left to Lower-Right) with a steel tape or gauge. If both diagonals are identical, the machine gantry is 100% perpendicular (square). Any difference indicates rhomboid chassis skew.<br>
              <strong>2. Circle Roundness &amp; Backlash:</strong> Using digital vernier calipers, measure each tangent circle across the X-axis (horizontal) and Y-axis (vertical). If diameters differ, calibrate steps/mm or tighten belt/leadscrew backlash.
            </div>
          </div>
        </div>

        <!-- TAB 2: TEST TWO (4-Quadrant 3D Relief & Stepped Cavity on 120x120mm Block, 40mm Stack) -->
        <div id="cle-cal-pane-2" class="cle-cal-pane" style="display:none;">
          <div style="background:var(--paper); padding:10px 14px; border-radius:6px; border:1px solid var(--line); margin-bottom:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div>
                <strong style="color:var(--accent); font-size:13px;">Test 2: 4-Quadrant 3D Relief &amp; Stepped Workpiece Test</strong>
                <div style="font-size:11px; color:var(--ink-2); margin-top:2px;">
                  120x120mm Stock (20mm thickness) clamped on 20mm Spoilboard (40mm total stack height).
                </div>
              </div>
              <div style="display:flex; gap:6px; align-items:center;">
                <select class="cle-select" id="cle-cal-t2-quad-sel" style="font-size:11px; padding:4px 8px;">
                  <option value="all">Full 4-Quadrant Test (All Features)</option>
                  <option value="1">Q1 Only: Inverted Stepped Cone Hole</option>
                  <option value="2">Q2 Only: Inverted Stepped Square Hole</option>
                  <option value="3">Q3 Only: Raised Cone on 4mm Floor</option>
                  <option value="4">Q4 Only: Raised Square Pyramid on 4mm Floor</option>
                </select>
                <button class="cle-btn" id="cle-cal-t2-preview-btn" style="background:var(--accent); color:var(--on-accent); font-weight:700;">👁 3D Viewport Preview</button>
                <button class="cle-btn" id="cle-cal-t2-export-btn">💾 Export G-Code (.nc)</button>
                <button class="cle-btn" id="cle-cal-t2-upload-btn">⚡ Upload to SD</button>
                <button class="cle-btn danger" id="cle-cal-t2-run-btn">▶ Stream to Machine</button>
              </div>
            </div>
          </div>

          <!-- Mandatory Clamping & Setup Notice -->
          <div style="padding:8px 12px; background:rgba(217, 119, 6, 0.12); border:1px solid #d97706; border-radius:6px; margin-bottom:10px; font-size:11px; color:#b45309; display:flex; align-items:center; gap:8px;">
            <span style="font-size:16px;">⚠️</span>
            <span><strong>Clamping Required:</strong> Mount a <strong>120x120x20mm</strong> workpiece firmly clamped on top of the <strong>20mm spoilboard</strong> (40mm total height from aluminum table). Clamps must be placed outside the 50x50mm quadrant cutting zones.</span>
          </div>

          <!-- 4-Quadrant Visual Grid Breakdown -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
            <!-- Quadrant 1 -->
            <div class="cle-joycon-panel" style="padding:8px 12px; border-left:4px solid #00e5ff;">
              <div style="font-weight:700; font-size:11px; color:var(--accent);">Quadrant 1 (Top-Left): Inverted Stepped Cone Hole</div>
              <div style="font-size:11px; color:var(--ink-2); margin-top:2px;">
                • Total Depth: <strong>16.0mm Z</strong> (leaves 4mm floor remaining)<br>
                • Increments: <strong>0.1mm Z inc</strong> with <strong>1.0mm stepover</strong><br>
                • Top Diameter: ⌀48mm &rarr; Bottom: ⌀16mm cavity
              </div>
            </div>

            <!-- Quadrant 2 -->
            <div class="cle-joycon-panel" style="padding:8px 12px; border-left:4px solid #38bdf8;">
              <div style="font-weight:700; font-size:11px; color:var(--accent);">Quadrant 2 (Top-Right): Inverted Stepped Square Hole</div>
              <div style="font-size:11px; color:var(--ink-2); margin-top:2px;">
                • Total Depth: <strong>16.0mm Z</strong> (leaves 4mm floor remaining)<br>
                • Increments: <strong>0.1mm Z inc</strong> with <strong>1.0mm stepover</strong><br>
                • Top Square: 48x48mm &rarr; Bottom: 16x16mm stepped hole
              </div>
            </div>

            <!-- Quadrant 3 -->
            <div class="cle-joycon-panel" style="padding:8px 12px; border-left:4px solid #10b981;">
              <div style="font-weight:700; font-size:11px; color:var(--ok);">Quadrant 3 (Bottom-Left): Raised Cone on 4mm ZFloor</div>
              <div style="font-size:11px; color:var(--ink-2); margin-top:2px;">
                • Quad Area Hogged Down to: <strong>4mm remaining floor</strong> (Z=-16.0mm)<br>
                • Raised Cone: Rises from <strong>4mm floor up to 18mm Peak</strong> (14mm tall)<br>
                • Stepover: <strong>0.1mm Z inc</strong>, <strong>1.0mm step X/Y</strong> (Base ⌀44mm &rarr; Peak ⌀6mm)
              </div>
            </div>

            <!-- Quadrant 4 -->
            <div class="cle-joycon-panel" style="padding:8px 12px; border-left:4px solid #0284c7;">
              <div style="font-weight:700; font-size:11px; color:var(--accent);">Quadrant 4 (Bottom-Right): Raised 4-Sided Pyramid on 4mm ZFloor</div>
              <div style="font-size:11px; color:var(--ink-2); margin-top:2px;">
                • Quad Area Hogged Down to: <strong>4mm remaining floor</strong> (Z=-16.0mm)<br>
                • 4-Sided Pyramid: Rises from <strong>4mm floor up to 18mm Peak</strong> (14mm tall)<br>
                • Base: 44x44mm &rarr; Peak: 6x6mm with 4 sharp corner ridges
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 3: STEPS/MM CALCULATOR -->
        <div id="cle-cal-pane-3" class="cle-cal-pane" style="display:none;">
          <div class="cle-joycon-panel" style="padding:12px 14px; max-width:540px;">
            <div class="cle-joycon-title" style="margin-bottom:8px;">Steps/mm Axis Calibration ($100, $101, $102, $103)</div>
            <div style="display:grid; grid-template-columns:120px 1fr; gap:8px; font-size:11px; align-items:center;">
              <label>Axis to Calibrate:</label>
              <select class="cle-select" id="cle-cal-axis" style="padding:3px 6px; width:120px;">
                <option value="X">X Axis ($100)</option>
                <option value="Y">Y Axis ($101)</option>
                <option value="Z">Z Axis ($102)</option>
                <option value="A">A Rotary ($103)</option>
              </select>

              <label>Current Steps/mm:</label>
              <input class="cle-input" id="cle-cal-cur-steps" type="number" step="0.001" value="80.000" style="padding:3px 6px;">

              <label>Commanded Distance (mm):</label>
              <input class="cle-input" id="cle-cal-cmd-dist" type="number" step="0.1" value="100.0" style="padding:3px 6px;">

              <label>Measured Distance (mm):</label>
              <input class="cle-input" id="cle-cal-meas-dist" type="number" step="0.01" value="99.50" style="padding:3px 6px;">
            </div>

            <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
              <span id="cle-cal-result" style="font-family:var(--f-mono); font-size:11px; color:var(--ok); font-weight:700;"></span>
              <button class="cle-btn" id="cle-cal-apply-btn" style="background:var(--accent); color:var(--on-accent); font-weight:700;">Calculate &amp; Send to FluidNC</button>
            </div>
          </div>
        </div>

        <!-- TAB 4: LASER POWER MATRIX -->
        <div id="cle-cal-pane-4" class="cle-cal-pane" style="display:none;">
          <div class="cle-joycon-panel" style="padding:12px 14px;">
            <div class="cle-joycon-title" style="margin-bottom:8px;">Laser Power &amp; Speed Test Matrix Card</div>
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap; font-size:11px; margin-bottom:12px;">
              <label>Speed: <input class="cle-input" id="cle-cal-l-speed" type="number" value="1500" style="width:70px; padding:3px;"> mm/min</label>
              <label>Max Power: <input class="cle-input" id="cle-cal-l-pwr" type="number" value="100" style="width:60px; padding:3px;"> %</label>
              <button class="cle-btn" id="cle-cal-l-gen-btn" style="background:var(--accent); color:var(--on-accent); font-weight:700;">Generate Matrix G-Code</button>
            </div>
            <textarea class="cle-input" id="cle-cal-l-gcode" rows="8" style="width:100%; font-family:var(--f-mono); font-size:11px;" readonly placeholder="G-code matrix will appear here..."></textarea>
          </div>
        </div>

        <!-- TAB 5: BACKLASH ROUTINE -->
        <div id="cle-cal-pane-5" class="cle-cal-pane" style="display:none;">
          <div class="cle-joycon-panel" style="padding:12px 14px;">
            <div class="cle-joycon-title" style="margin-bottom:8px;">Backlash Dial Indicator Routine</div>
            <div style="display:flex; gap:12px; align-items:center; font-size:11px; margin-bottom:12px;">
              <label>Axis:
                <select class="cle-select" id="cle-cal-b-axis">
                  <option value="X">X Axis</option>
                  <option value="Y">Y Axis</option>
                  <option value="Z">Z Axis</option>
                </select>
              </label>
              <label>Distance: <input class="cle-input" id="cle-cal-b-dist" type="number" value="10" style="width:60px; padding:3px;"> mm</label>
              <button class="cle-btn" id="cle-cal-b-gen-btn" style="background:var(--accent); color:var(--on-accent); font-weight:700;">Generate Backlash G-Code</button>
            </div>
            <textarea class="cle-input" id="cle-cal-b-gcode" rows="8" style="width:100%; font-family:var(--f-mono); font-size:11px;" readonly placeholder="Backlash test routine G-code..."></textarea>
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
    document.getElementById('cle-modal-save-btn').onclick = () => {
      if (type === 'gamepad') {
        this.saveGamepadSettingsFromModal();
      }
      this.closeModal();
    };

    // Wire Modal Logic
    if (type === 'gamepad') {
      this.bindGamepadModalRealtime();
      this.loadVaultProfilesList();
      
      document.getElementById('cle-btn-save-profile').onclick = async () => {
        const name = document.getElementById('cle-gp-profile-name').value.trim() || 'Custom_Profile';
        this.saveGamepadSettingsFromModal();
        await this.vault.saveControllerProfile(name, this.gamepad.mapping);
        this.showVaultSaveNotice(`Parameters & profile "${name}" saved to CLE-Vault.`);
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
      const returnBtn = document.getElementById('slice-return-btn');
      if (returnBtn) {
        returnBtn.onclick = () => {
          this.closeModal();
          const wsBtn = document.getElementById('ws-design');
          if (wsBtn) wsBtn.click();
          this.notify('Returned to JumpStart Design CAD workspace.', 'info');
        };
      }
      const lamCheck = document.getElementById('slice-enable-lamination');
      const lamPanel = document.getElementById('slice-lam-panel');
      if (lamCheck && lamPanel) {
        lamCheck.onchange = () => {
          lamPanel.style.display = lamCheck.checked ? 'block' : 'none';
        };
      }
      document.querySelectorAll('.cle-slab-preset').forEach(btn => {
        btn.onclick = () => {
          const val = btn.getAttribute('data-val');
          const thickInput = document.getElementById('slice-slab-thick');
          if (thickInput) thickInput.value = val;
        };
      });

      document.getElementById('slice-run-btn').onclick = async () => {
        const mode = document.getElementById('slice-mode').value;
        const layerH = document.getElementById('slice-layer-h').value;
        const infill = document.getElementById('slice-infill').value;
        const feed = document.getElementById('slice-feed').value;
        const enableCutout = document.getElementById('slice-enable-cutout') ? document.getElementById('slice-enable-cutout').checked : true;
        const cutoutOvercut = document.getElementById('slice-cutout-depth') ? (parseFloat(document.getElementById('slice-cutout-depth').value) || 0.20) : 0.20;

        const enableLamination = document.getElementById('slice-enable-lamination') ? document.getElementById('slice-enable-lamination').checked : false;
        const slabThickness = document.getElementById('slice-slab-thick') ? (parseFloat(document.getElementById('slice-slab-thick').value) || 30.0) : 30.0;
        const dowelHolesEnabled = true;
        const dowelDiameter = document.getElementById('slice-dowel-dia') ? (parseFloat(document.getElementById('slice-dowel-dia').value) || 8.0) : 8.0;
        const dowelMargin = document.getElementById('slice-dowel-margin') ? (parseFloat(document.getElementById('slice-dowel-margin').value) || 25.0) : 25.0;
        const dowelHoleCount = document.getElementById('slice-dowel-count') ? (parseInt(document.getElementById('slice-dowel-count').value, 10) || 4) : 4;
        const toolMapping = {
          drillingToolNumber: parseInt(document.getElementById('slice-tool-drill')?.value || 2, 10),
          roughingToolNumber: parseInt(document.getElementById('slice-tool-rough')?.value || 1, 10),
          finishingToolNumber: parseInt(document.getElementById('slice-tool-finish')?.value || 3, 10),
          cutoutToolNumber: parseInt(document.getElementById('slice-tool-cutout')?.value || 1, 10)
        };

        this.slicer.feedRate = parseFloat(feed) || 1500;
        await this.slicer.sliceModel({
          mode,
          layerHeight: layerH,
          infill,
          feedRate: feed,
          enableCutout,
          cutoutOvercut,
          enableLamination,
          slabThickness,
          dowelHolesEnabled,
          dowelDiameter,
          dowelMargin,
          dowelHoleCount,
          toolMapping
        });
        this.closeModal();
      };
    } else if (type === 'rotary') {
      const rot = this.rotary;

      // Preset change handler
      const presetSel = document.getElementById('rot-preset-select');
      const ratioIn = document.getElementById('rot-gear-ratio');
      const mPulleyIn = document.getElementById('rot-motor-pulley');
      const cPulleyIn = document.getElementById('rot-chuck-pulley');
      const stepsLbl = document.getElementById('rot-steps-deg-lbl');

      const updateStepsCalc = () => {
        const r = parseFloat(ratioIn.value) || 5.0;
        const spd = (rot.stepsPerRev * rot.microsteps * r) / 360;
        if (stepsLbl) stepsLbl.textContent = spd.toFixed(3);
      };

      if (presetSel) {
        presetSel.onchange = () => {
          if (presetSel.value === 'twotrees') {
            ratioIn.value = '5.0';
            mPulleyIn.value = '15';
            cPulleyIn.value = '55';
          } else if (presetSel.value === 'twotrees4') {
            ratioIn.value = '4.0';
            mPulleyIn.value = '15';
            cPulleyIn.value = '60';
          }
          updateStepsCalc();
        };
      }

      if (ratioIn) ratioIn.oninput = updateStepsCalc;
      if (mPulleyIn && cPulleyIn) {
        mPulleyIn.oninput = () => {
          const mp = parseFloat(mPulleyIn.value) || 15;
          const cp = parseFloat(cPulleyIn.value) || 55;
          ratioIn.value = (cp / mp).toFixed(2);
          updateStepsCalc();
        };
        cPulleyIn.oninput = () => {
          const mp = parseFloat(mPulleyIn.value) || 15;
          const cp = parseFloat(cPulleyIn.value) || 55;
          ratioIn.value = (cp / mp).toFixed(2);
          updateStepsCalc();
        };
      }

      // Turning controls
      const turnRpmIn = document.getElementById('rot-turn-rpm');
      const turnDegsLbl = document.getElementById('rot-turn-degs');
      if (turnRpmIn) {
        turnRpmIn.oninput = () => {
          const rpm = parseFloat(turnRpmIn.value) || 60;
          if (turnDegsLbl) turnDegsLbl.textContent = `${(rpm * 6).toFixed(0)}°/s`;
        };
      }
      const btnTurnStart = document.getElementById('rot-btn-turn-start');
      if (btnTurnStart) {
        btnTurnStart.onclick = () => {
          const rpm = parseFloat(turnRpmIn.value) || 60;
          rot.startTurning(rpm);
        };
      }
      const btnTurnStop = document.getElementById('rot-btn-turn-stop');
      if (btnTurnStop) {
        btnTurnStop.onclick = () => rot.stopTurning();
      }

      // Index controls
      const idxModeSel = document.getElementById('rot-index-mode-sel');
      if (idxModeSel) {
        idxModeSel.onchange = () => {
          rot.setIndexMode(idxModeSel.value);
          const st = document.getElementById('rot-idx-status');
          if (st) st.textContent = `A = ${rot.currentAngle.toFixed(1)}°`;
        };
      }
      const btnIdxPrev = document.getElementById('rot-btn-idx-prev');
      if (btnIdxPrev) {
        btnIdxPrev.onclick = () => {
          rot.prevIndex();
          const st = document.getElementById('rot-idx-status');
          if (st) st.textContent = `A = ${rot.currentAngle.toFixed(1)}°`;
        };
      }
      const btnIdxNext = document.getElementById('rot-btn-idx-next');
      if (btnIdxNext) {
        btnIdxNext.onclick = () => {
          rot.nextIndex();
          const st = document.getElementById('rot-idx-status');
          if (st) st.textContent = `A = ${rot.currentAngle.toFixed(1)}°`;
        };
      }
      const btnZeroA = document.getElementById('rot-btn-zero-a');
      if (btnZeroA) {
        btnZeroA.onclick = () => {
          rot.setAngle(0);
          if (this.fluidnc?.isConnected) this.fluidnc.sendImmediate('G92 A0');
          const st = document.getElementById('rot-idx-status');
          if (st) st.textContent = 'A = 0.0°';
          this.notify('A-Axis WCS Zeroed (G92 A0)', 'ok');
        };
      }

      // Send $103 steps/degree to FluidNC
      const btnSendStep = document.getElementById('rot-btn-send-step');
      if (btnSendStep) {
        btnSendStep.onclick = () => {
          const spd = rot.getStepsPerDegree();
          if (this.fluidnc?.isConnected) {
            this.fluidnc.sendImmediate(`$103=${spd.toFixed(3)}`);
            this.notify(`Sent $103=${spd.toFixed(3)} to FluidNC controller.`, 'ok');
          } else {
            this.notify(`Calculated $103=${spd.toFixed(3)} (Connect FluidNC to write to controller).`, 'info');
          }
        };
      }

      // Apply & Mount 4th Axis
      const btnApply = document.getElementById('rot-btn-apply');
      if (btnApply) {
        btnApply.onclick = async () => {
          rot.setGearRatio(ratioIn.value, mPulleyIn.value, cPulleyIn.value);
          const cX = parseFloat(document.getElementById('rot-chuck-x')?.value) || rot.chuckX;
          const tX = parseFloat(document.getElementById('rot-tailstock-x')?.value) || rot.tailstockX;
          rot.setChuckPosition(cX);
          rot.setTailstockPosition(tX);
          rot.setMountingPosition(
            document.getElementById('rot-center-y').value,
            document.getElementById('rot-center-z').value,
            cX
          );
          rot.zSafetyLimit = parseFloat(document.getElementById('rot-safe-limit').value) || -5.0;
          rot.zClearance = parseFloat(document.getElementById('rot-clearance').value) || 10.0;
          rot.setStockDimensions(
            document.getElementById('rot-stock-dia').value,
            document.getElementById('rot-stock-len').value
          );
          if (!rot.enabled) rot.toggle(true);

          // Persist to machine in vault
          const mach = this.vault.getActiveMachine();
          if (mach) {
            mach.rotaryConfig = {
              gearRatio: rot.gearRatio,
              motorPulleyMm: rot.motorPulleyMm,
              chuckPulleyMm: rot.chuckPulleyMm,
              centerHeightMm: rot.centerHeightMm,
              centerY: rot.centerY,
              startX: rot.startX,
              chuckX: rot.chuckX,
              tailstockX: rot.tailstockX,
              stockDiameter: rot.stockDiameter,
              stockLength: rot.stockLength,
              zSafetyLimit: rot.zSafetyLimit,
              zClearance: rot.zClearance
            };
            await this.vault.saveMachine(mach);
          }
          this.closeModal();
        };
      }

      // Auto-Fit Chuck & Opposing Center to CAD Object Ends
      const inChuckX = document.getElementById('rot-chuck-x');
      const inTailX = document.getElementById('rot-tailstock-x');
      const inLen = document.getElementById('rot-stock-len');
      const inDia = document.getElementById('rot-stock-dia');
      const feedbackEl = document.getElementById('rot-clearance-feedback');

      const refreshFields = () => {
        if (inChuckX) inChuckX.value = rot.chuckX;
        if (inTailX) inTailX.value = rot.tailstockX;
        if (inLen) inLen.value = rot.stockLength;
        if (inDia) inDia.value = rot.stockDiameter;
        updateClearanceFeedback();
      };

      // Nudge buttons for Chuck X
      const btnCm10 = document.getElementById('rot-btn-chuck-m10');
      if (btnCm10) btnCm10.onclick = () => { rot.nudgeChuck(-10); refreshFields(); };
      const btnCm1 = document.getElementById('rot-btn-chuck-m1');
      if (btnCm1) btnCm1.onclick = () => { rot.nudgeChuck(-1); refreshFields(); };
      const btnCp1 = document.getElementById('rot-btn-chuck-p1');
      if (btnCp1) btnCp1.onclick = () => { rot.nudgeChuck(1); refreshFields(); };
      const btnCp10 = document.getElementById('rot-btn-chuck-p10');
      if (btnCp10) btnCp10.onclick = () => { rot.nudgeChuck(10); refreshFields(); };

      // Nudge buttons for Center X
      const btnTm10 = document.getElementById('rot-btn-tail-m10');
      if (btnTm10) btnTm10.onclick = () => { rot.nudgeTailstock(-10); refreshFields(); };
      const btnTm1 = document.getElementById('rot-btn-tail-m1');
      if (btnTm1) btnTm1.onclick = () => { rot.nudgeTailstock(-1); refreshFields(); };
      const btnTp1 = document.getElementById('rot-btn-tail-p1');
      if (btnTp1) btnTp1.onclick = () => { rot.nudgeTailstock(1); refreshFields(); };
      const btnTp10 = document.getElementById('rot-btn-tail-p10');
      if (btnTp10) btnTp10.onclick = () => { rot.nudgeTailstock(10); refreshFields(); };

      // Center on Object button
      const btnCenterObj = document.getElementById('rot-btn-center-object');
      if (btnCenterObj) {
        btnCenterObj.onclick = () => {
          rot.centerOnObject();
          refreshFields();
        };
      }

      // Center Point Tool toggle & Jog buttons
      const btnToggleTool = document.getElementById('rot-btn-toggle-tool');
      if (btnToggleTool) {
        btnToggleTool.onclick = () => {
          const vis = rot.toggleCenterPointTool();
          btnToggleTool.style.background = vis ? '#06b6d4' : 'var(--paper)';
          btnToggleTool.style.color = vis ? '#fff' : 'var(--ink)';
          btnToggleTool.textContent = vis ? 'Hide Center Tool' : 'Show Center Tool';
        };
      }

      const btnJogCenter = document.getElementById('rot-btn-jog-center');
      if (btnJogCenter) {
        btnJogCenter.onclick = () => {
          rot.jogToolToCenter('workpiece');
        };
      }

      const updateClearanceFeedback = () => {
        if (!feedbackEl || !inDia) return;
        const val = parseFloat(inDia.value) || 0;
        const clr = rot.checkClearances(val);
        const color = clr.status === 'ok' || clr.status === 'shielded' ? 'var(--ok)' : (clr.status === 'collision' ? 'var(--err)' : '#d97706');
        feedbackEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-weight:600;">
            <span>Bed Floor Margin: <strong>${clr.bedMargin.toFixed(1)} mm</strong> (Min 5mm | Max Ø${clr.maxSafeDia.toFixed(0)}mm)</span>
            <span>Material Top: <strong>${clr.matTop.toFixed(1)} mm from bed</strong> (Chuck is ${clr.chuckTop}mm)</span>
          </div>
          <div style="color:${color}; font-weight:700;">
            ${clr.message}
          </div>
        `;
      };

      if (inDia) {
        inDia.oninput = updateClearanceFeedback;
      }

      const btnFit = document.getElementById('rot-btn-fit-object');
      if (btnFit) {
        btnFit.onclick = () => {
          rot.fitToObject();
          if (inChuckX) inChuckX.value = rot.chuckX;
          if (inTailX) inTailX.value = rot.tailstockX;
          if (inLen) inLen.value = rot.stockLength;
          if (inDia) inDia.value = rot.stockDiameter;
          updateClearanceFeedback();
        };
      }

      if (inChuckX) {
        inChuckX.onchange = () => rot.setChuckPosition(parseFloat(inChuckX.value) || 0);
      }
      if (inTailX) {
        inTailX.onchange = () => rot.setTailstockPosition(parseFloat(inTailX.value) || 0);
      }

      // Return to Design
      const btnReturn = document.getElementById('rot-btn-return');
      if (btnReturn) {
        btnReturn.onclick = () => {
          this.closeModal();
          const wsBtn = document.getElementById('ws-design');
          if (wsBtn) wsBtn.click();
          this.notify('Returned to JumpStart Design CAD workspace.', 'info');
        };
      }
    } else if (type === 'spoilboard') {
      const wInput = document.getElementById('cle-sp-width');
      const dInput = document.getElementById('cle-sp-depth');
      const tInput = document.getElementById('cle-sp-thick');
      const cInput = document.getElementById('cle-sp-cutout');
      const offXInput = document.getElementById('cle-sp-offx');
      const offYInput = document.getElementById('cle-sp-offy');

      const updateStackDisplay = () => {
        const t = parseFloat(tInput.value) || 20.0;
        const c = parseFloat(cInput.value) || 0.20;
        const surf = 0.10 + t;
        const cut = surf - c;
        const safe = t - c;
        const wElem = document.getElementById('stack-workpiece-z');
        const cElem = document.getElementById('stack-cutout-z');
        const tElem = document.getElementById('stack-thick-val');
        const sElem = document.getElementById('stack-spoil-span');
        const safeElem = document.getElementById('stack-safety-margin');
        if (wElem) wElem.textContent = `Z = +${surf.toFixed(2)} mm`;
        if (cElem) cElem.textContent = `Z = +${cut.toFixed(2)} mm`;
        if (tElem) tElem.textContent = t.toFixed(1);
        if (sElem) sElem.textContent = `Z = +0.10 .. +${surf.toFixed(2)} mm`;
        if (safeElem) safeElem.textContent = `✔ ${safe.toFixed(2)} mm of protective MDF buffer between cutout pass and aluminum table bed.`;
      };

      tInput.oninput = updateStackDisplay;
      cInput.oninput = updateStackDisplay;

      document.querySelectorAll('.cle-sp-preset').forEach(btn => {
        btn.onclick = () => {
          tInput.value = btn.getAttribute('data-val');
          updateStackDisplay();
        };
      });

      document.getElementById('cle-sp-btn-sit').onclick = () => {
        if (this.bed) {
          const t = parseFloat(tInput.value) || 20.0;
          this.bed.config.spoilboardThickness = t;
          this.bed.sitWorkpieceOnSpoilboard();
          this.notify(`Workpiece seated on Spoilboard surface at Z=${(0.1 + t).toFixed(2)}mm`, 'ok');
        }
      };

      document.getElementById('cle-sp-btn-cancel').onclick = () => this.closeModal();

      document.getElementById('cle-sp-btn-save').onclick = async () => {
        const x = parseFloat(wInput.value) || 600;
        const y = parseFloat(dInput.value) || 500;
        const thickness = parseFloat(tInput.value) || 20.0;
        const cutoutOvercut = parseFloat(cInput.value) || 0.20;
        const offX = parseFloat(offXInput.value) || 0.0;
        const offY = parseFloat(offYInput.value) || 0.0;

        if (this.bed) {
          this.bed.config.spoilboardOffsetX = offX;
          this.bed.config.spoilboardOffsetY = offY;
          await this.bed.setSpoilboardDimensions({ x, y, thickness, cutoutOvercut, saveToVault: true });
        }
        this.closeModal();
      };
    } else if (type === 'grayscale') {
      const bSlider = document.getElementById('grey-bright');
      const cSlider = document.getElementById('grey-contrast');
      const gSlider = document.getElementById('grey-gamma');
      bSlider.oninput = (e) => { document.getElementById('lbl-grey-bright').textContent = e.target.value; };
      cSlider.oninput = (e) => { document.getElementById('lbl-grey-contrast').textContent = e.target.value; };
      gSlider.oninput = (e) => { document.getElementById('lbl-grey-gamma').textContent = (e.target.value / 100).toFixed(1); };

      let loadedImg = null;
      document.getElementById('grey-file').onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (re) => {
            loadedImg = new Image();
            loadedImg.src = re.target.result;
          };
          reader.readAsDataURL(file);
        }
      };

      document.getElementById('grey-btn-generate').onclick = async () => {
        const b = parseInt(bSlider.value, 10);
        const c = parseInt(cSlider.value, 10);
        const g = parseInt(gSlider.value, 10) / 100;
        const slices = parseInt(document.getElementById('grey-slices').value, 10) || 16;
        const depth = parseFloat(document.getElementById('grey-depth').value) || 4.0;
        const bitDepth = document.getElementById('grey-bitdepth').value;
        const mode = document.getElementById('grey-mode').value;

        this.closeModal();
        await this.slicer.sliceGrayscaleHeightmap(loadedImg, {
          brightness: b,
          contrast: c,
          gamma: g,
          sliceCount: slices,
          depthMm: depth,
          bitDepth,
          mode
        });
      };
    } else if (type === 'machines') {
      const populateForm = (mach) => {
        document.getElementById('cle-m-name').value = mach.name || '';
        document.getElementById('cle-m-type').value = mach.type || 'cnc';
        document.getElementById('cle-m-tx').value = mach.travelX || 600;
        document.getElementById('cle-m-ty').value = mach.travelY || 500;
        document.getElementById('cle-m-tz').value = mach.travelZ || 100;
        document.getElementById('cle-m-spoil-x').value = mach.spoilboardX || mach.travelX || 600;
        document.getElementById('cle-m-spoil-y').value = mach.spoilboardY || mach.travelY || 500;
        document.getElementById('cle-m-spoil-thick').value = mach.spoilboardThickness !== undefined ? mach.spoilboardThickness : 15.0;
        document.getElementById('cle-m-spoil-offx').value = mach.spoilboardOffsetX || 0;
        document.getElementById('cle-m-spoil-offy').value = mach.spoilboardOffsetY || 0;
        document.getElementById('cle-m-ta').value = mach.travelA || 360;
        document.getElementById('cle-m-minz').value = mach.safeLimitZ !== undefined ? mach.safeLimitZ : 0.1;
        document.getElementById('cle-m-buffer').value = mach.clearanceX || 5.0;
        document.getElementById('cle-m-maxfeed').value = mach.maxRateXY || 5000;
        document.getElementById('cle-m-rpm').value = mach.spindleMaxRPM || 24000;
        document.getElementById('cle-m-ip').value = mach.wifiIP || '192.168.12.158';
      };

      const selector = document.getElementById('cle-mach-selector');
      selector.onchange = (e) => {
        const m = this.vault.getMachinesSync().find(x => x.id === e.target.value);
        if (m) populateForm(m);
      };

      document.getElementById('cle-mach-btn-activate').onclick = () => {
        this.vault.setActiveMachine(selector.value);
        if (this.bed) this.bed.rebuild();
        this.closeModal();
      };

      const connBtn = document.getElementById('cle-mach-btn-connect');
      if (connBtn) {
        connBtn.textContent = this.fluidnc.isConnected ? 'Disconnect' : 'Connect';
        connBtn.onclick = async () => {
          await this.connectActiveMachine();
          connBtn.textContent = this.fluidnc.isConnected ? 'Disconnect' : 'Connect';
        };
      }

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
        const curMach = this.vault.getMachinesSync().find(x => x.id === selector.value) || { id: selector.value || ('mach_' + Date.now()) };
        curMach.name = document.getElementById('cle-m-name').value.trim() || 'CNC Device';
        curMach.type = document.getElementById('cle-m-type').value;
        curMach.travelX = parseFloat(document.getElementById('cle-m-tx').value) || 600;
        curMach.travelY = parseFloat(document.getElementById('cle-m-ty').value) || 500;
        curMach.travelZ = parseFloat(document.getElementById('cle-m-tz').value) || 100;
        curMach.spoilboardX = parseFloat(document.getElementById('cle-m-spoil-x').value) || curMach.travelX || 600;
        curMach.spoilboardY = parseFloat(document.getElementById('cle-m-spoil-y').value) || curMach.travelY || 500;
        curMach.spoilboardThickness = parseFloat(document.getElementById('cle-m-spoil-thick').value) || 20.0;
        curMach.spoilboardOffsetX = parseFloat(document.getElementById('cle-m-spoil-offx').value) || 0;
        curMach.spoilboardOffsetY = parseFloat(document.getElementById('cle-m-spoil-offy').value) || 0;
        curMach.travelA = parseFloat(document.getElementById('cle-m-ta').value) || 360;
        curMach.safeLimitZ = parseFloat(document.getElementById('cle-m-minz').value) || 0.1;
        curMach.clearanceX = parseFloat(document.getElementById('cle-m-buffer').value) || 5.0;
        curMach.clearanceY = curMach.clearanceX;
        curMach.maxRateXY = parseFloat(document.getElementById('cle-m-maxfeed').value) || 5000;
        curMach.spindleMaxRPM = parseFloat(document.getElementById('cle-m-rpm').value) || 24000;
        let newIp = document.getElementById('cle-m-ip').value.trim() || '192.168.12.158';
        newIp = newIp.replace(/^https?:\/\//i, '').replace(/^wss?:\/\//i, '').replace(/\/.*$/, '').trim();
        if (newIp === '192.168.12.150' || newIp === '192.168.1.150' || newIp === '192.168.1.100') {
          newIp = '192.168.12.158';
        }
        curMach.wifiIP = newIp;

        await this.vault.saveMachine(curMach);
        this.vault.setActiveMachine(curMach.id);
        this.fluidnc.ip = newIp;
        localStorage.setItem('cle.fluidnc.ip', newIp);

        if (this.bed) this.bed.rebuild();
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
            wifiIP: '192.168.12.158'
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
    } else if (type === 'tools') {
      // Save Toolsetter Config
      document.getElementById('cle-ts-save-btn').onclick = () => {
        const mode = document.getElementById('cle-ts-mode').value;
        const parkX = parseFloat(document.getElementById('cle-ts-park-x').value) || 10.0;
        const parkY = parseFloat(document.getElementById('cle-ts-park-y').value) || 10.0;
        const parkZ = parseFloat(document.getElementById('cle-ts-park-z').value) || -5.0;
        const posX = parseFloat(document.getElementById('cle-ts-pos-x').value) || 25.0;
        const posY = parseFloat(document.getElementById('cle-ts-pos-y').value) || 25.0;
        const thick = parseFloat(document.getElementById('cle-ts-thick').value) || 15.0;

        this.toolLibrary.saveToolsetterConfig({
          ...this.toolLibrary.toolsetter,
          mode,
          parkPosition: { X: parkX, Y: parkY, Z: parkZ },
          setterPosition: { X: posX, Y: posY, Z: parkZ },
          touchPlateThicknessMm: thick
        });
      };

      // Add New Tool Button (Spindle or Laser with efficiency & optical/electrical W)
      document.getElementById('cle-tl-btn-add').onclick = () => {
        const isLaser = confirm('Click OK for Laser Tool, or Cancel for Spindle/Router Tool.');
        if (isLaser) {
          const name = prompt('Enter Laser Tool Name:', 'Atomstack A70 70W');
          if (!name) return;
          const optW = parseFloat(prompt('Optical Output Power (Watts to Ztop):', '70')) || 70;
          const elecW = parseFloat(prompt('Electrical Power Consumption Draw (Watts):', '160')) || 160;
          const focalMm = parseFloat(prompt('Focal Distance (mm from cone tip to Ztop):', '30')) || 30;
          const pwmHz = parseInt(prompt('PWM Frequency (2500 - 20000 Hz):', '5000'), 10) || 5000;
          const feed = parseFloat(prompt('Feed Speed (mm/min):', '8000')) || 8000;
          const effPct = Math.round((optW / elecW) * 10000) / 100;
          const nextNum = (this.toolLibrary.tools.length > 0) ? Math.max(...this.toolLibrary.tools.map(t => t.number)) + 1 : 1;

          this.toolLibrary.addOrUpdateTool({
            number: nextNum,
            name,
            type: 'laser',
            diameter: 0.08,
            laserNumber: (this.toolLibrary.tools.filter(t => t.type === 'laser').length + 1),
            laserType: `${optW}W Diode (gpio.2)`,
            opticalWatts: optW,
            electricalWatts: elecW,
            efficiencyPct: effPct,
            pwmFrequencyHz: pwmHz,
            focalDistanceMm: focalMm,
            feedXY: feed,
            plungeZ: 500,
            changeMode: 'mtc_fixed',
            atcSlot: nextNum,
            notes: `Optical: ${optW}W, Electrical: ${elecW}W (${effPct}% efficiency)`
          });
          this.openModal('tools');
        } else {
          const name = prompt('Enter Spindle Tool Name:', '1/4" 2-Flute Carbide Endmill');
          if (!name) return;
          const dia = parseFloat(prompt('Tool Diameter (mm):', '6.35')) || 6.35;
          const spindleNum = parseInt(prompt('Spindle Select (1=Stock 500W, 2=800W Router, 3=1.5kW VFD):', '1'), 10) || 1;
          const rpm = parseInt(prompt('Spindle RPM:', '12000'), 10) || 12000;
          const feed = parseFloat(prompt('Feed Rate XY (mm/min):', '1800')) || 1800;
          const plunge = parseFloat(prompt('Plunge Rate Z (mm/min):', '400')) || 400;
          const nextNum = (this.toolLibrary.tools.length > 0) ? Math.max(...this.toolLibrary.tools.map(t => t.number)) + 1 : 1;

          this.toolLibrary.addOrUpdateTool({
            number: nextNum,
            name,
            type: 'flat',
            diameter: dia,
            fluteLength: 22.0,
            overallLength: 50.0,
            flutes: 2,
            spindleNumber: spindleNum,
            spindleRPM: rpm,
            feedXY: feed,
            plungeZ: plunge,
            stepoverPct: 40,
            passDepth: 1.5,
            changeMode: 'mtc_probe',
            atcSlot: nextNum,
            notes: `Spindle ${spindleNum} bit`
          });
          this.openModal('tools');
        }
      };

      // Save to Vault Button
      document.getElementById('cle-tl-btn-save-vault').onclick = async () => {
        this.toolLibrary.saveTools();
        await this.vault.saveControllerProfile('tool_library_backup', { tools: this.toolLibrary.tools });
        this.notify('Tool Library saved to Vault & storage.', 'ok');
      };
    } else if (type === 'calibration' || type === 'test') {
      // Tab Switching
      [1, 2, 3, 4, 5].forEach(tabNum => {
        const btn = document.getElementById(`cle-cal-tab-btn-${tabNum}`);
        if (!btn) return;
        btn.onclick = () => {
          [1, 2, 3, 4, 5].forEach(k => {
            const b = document.getElementById(`cle-cal-tab-btn-${k}`);
            const p = document.getElementById(`cle-cal-pane-${k}`);
            if (b) {
              b.style.background = (k === tabNum) ? 'var(--accent)' : 'var(--panel-2)';
              b.style.color = (k === tabNum) ? 'var(--on-accent)' : 'inherit';
              b.style.fontWeight = (k === tabNum) ? '700' : '600';
            }
            if (p) p.style.display = (k === tabNum) ? 'block' : 'none';
          });
        };
      });

      // Test 1: Preview in 3D Viewport
      document.getElementById('cle-cal-t1-preview-btn').onclick = () => {
        this.calibration.previewChassisSquarenessTest();
      };

      // Test 1: Export G-Code
      document.getElementById('cle-cal-t1-export-btn').onclick = () => {
        this.calibration.generateChassisSquarenessGCode();
        this.calibration.exportTestGCode('CLEJS_Chassis_Squareness_Test.nc');
      };

      // Test 1: Upload to FluidNC SD
      document.getElementById('cle-cal-t1-upload-btn').onclick = async () => {
        this.calibration.generateChassisSquarenessGCode();
        await this.calibration.uploadTestGCodeToSD('Chassis_Squareness.nc');
      };

      // Test 1: Stream to Machine
      document.getElementById('cle-cal-t1-run-btn').onclick = () => {
        if (confirm('Start Test 1 Chassis Squareness & Circle Roundness Cut? Ensure spindle and bed are ready.')) {
          this.calibration.generateChassisSquarenessGCode();
          this.calibration.runTestOnMachine();
        }
      };

      // Test 2: Preview in 3D Viewport
      document.getElementById('cle-cal-t2-preview-btn').onclick = () => {
        const selQuad = document.getElementById('cle-cal-t2-quad-sel').value;
        this.calibration.previewQuadrant3DTest({ quadrant: selQuad });
      };

      // Test 2: Export G-Code
      document.getElementById('cle-cal-t2-export-btn').onclick = () => {
        const selQuad = document.getElementById('cle-cal-t2-quad-sel').value;
        this.calibration.generateQuadrant3DTestGCode({ quadrant: selQuad });
        this.calibration.exportTestGCode(`CLEJS_Quadrant_3D_Test_Q${selQuad}.nc`);
      };

      // Test 2: Upload to FluidNC SD
      document.getElementById('cle-cal-t2-upload-btn').onclick = async () => {
        const selQuad = document.getElementById('cle-cal-t2-quad-sel').value;
        this.calibration.generateQuadrant3DTestGCode({ quadrant: selQuad });
        await this.calibration.uploadTestGCodeToSD(`Quadrant_3D_Q${selQuad}.nc`);
      };

      // Test 2: Stream to Machine
      document.getElementById('cle-cal-t2-run-btn').onclick = () => {
        const selQuad = document.getElementById('cle-cal-t2-quad-sel').value;
        if (confirm('Start Test 2 4-Quadrant 3D Stepped & Relief Cut? Verify 120x120mm block is securely clamped on 20mm spoilboard!')) {
          this.calibration.generateQuadrant3DTestGCode({ quadrant: selQuad });
          this.calibration.runTestOnMachine();
        }
      };

      // Tab 3: Steps/mm Apply Button
      document.getElementById('cle-cal-apply-btn').onclick = () => {
        const ax = document.getElementById('cle-cal-axis').value;
        const curS = document.getElementById('cle-cal-cur-steps').value;
        const cmdD = document.getElementById('cle-cal-cmd-dist').value;
        const measD = document.getElementById('cle-cal-meas-dist').value;

        try {
          const res = this.calibration.calculateStepsPerMm(ax, curS, cmdD, measD);
          document.getElementById('cle-cal-result').textContent = `New Steps/mm: ${res.newSteps} (${res.command})`;
          if (this.fluidnc) {
            this.fluidnc.sendGCode(res.command);
            this.notify(`Sent ${res.command} to FluidNC`, 'ok');
          }
        } catch (e) {
          alert(e.message);
        }
      };

      // Tab 4: Laser Matrix Generator
      document.getElementById('cle-cal-l-gen-btn').onclick = () => {
        const spd = parseFloat(document.getElementById('cle-cal-l-speed').value) || 1500;
        const pwr = parseFloat(document.getElementById('cle-cal-l-pwr').value) || 100;
        const gc = this.calibration.generateLaserTestMatrix({ maxSpeed: spd, maxPower: pwr });
        document.getElementById('cle-cal-l-gcode').value = gc;
        this.calibration.activeTestGCode = gc;
      };

      // Tab 5: Backlash Generator
      document.getElementById('cle-cal-b-gen-btn').onclick = () => {
        const ax = document.getElementById('cle-cal-b-axis').value;
        const dist = parseFloat(document.getElementById('cle-cal-b-dist').value) || 10;
        const gc = this.calibration.generateBacklashTestGCode(ax, dist);
        document.getElementById('cle-cal-b-gcode').value = gc;
        this.calibration.activeTestGCode = gc;
      };
    }
  }

  deleteToolFromUI(toolNumber) {
    if (confirm(`Are you sure you want to delete Tool T${toolNumber}?`)) {
      this.toolLibrary.deleteTool(toolNumber);
      this.openModal('tools');
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
          <td><span id="cle-remap-val-${a.key}" style="font-family:var(--f-mono); color:var(--accent); font-weight:700;">${assigned}</span></td>
          <td style="text-align:center;"><span id="cle-remap-led-${a.key}" class="cle-switch-pill" style="padding:2px 8px; font-size:10px; font-weight:700; background:var(--panel-2); border:1px solid var(--line); color:var(--ink-3);">IDLE</span></td>
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

      // Real-time Button & Switch State Indicators (0..17)
      const btnNames = ['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', 'Minus -', 'Plus +', 'L3', 'R3', 'D-Up ↑', 'D-Dn ↓', 'D-Lf ←', 'D-Rt →', 'Home', 'Capture'];
      const activeBtns = [];
      for (let b = 0; b < 18; b++) {
        let isPressed = false;
        // Check direct button
        if (gp.buttons[b] && (gp.buttons[b].pressed || gp.buttons[b].value > 0.4)) {
          isPressed = true;
        }
        // Link D-pad state directly to indicators 12..15 so POV hat and axes also light them up
        if (b === 12 && dpad.dpadUp) isPressed = true;
        if (b === 13 && dpad.dpadDown) isPressed = true;
        if (b === 14 && dpad.dpadLeft) isPressed = true;
        if (b === 15 && dpad.dpadRight) isPressed = true;

        const tagEl = document.getElementById(`cle-btn-tag-${b}`);
        if (tagEl) {
          if (isPressed) {
            tagEl.style.background = 'var(--ok)';
            tagEl.style.color = '#fff';
            tagEl.style.borderColor = 'var(--ok)';
            tagEl.style.boxShadow = '0 0 8px rgba(57, 211, 83, 0.6)';
            activeBtns.push(btnNames[b] || `Btn ${b}`);
          } else {
            tagEl.style.background = 'var(--panel-2)';
            tagEl.style.color = 'var(--ink-2)';
            tagEl.style.borderColor = 'var(--line)';
            tagEl.style.boxShadow = 'none';
          }
        }
      }

      // Update Remap Table Status Column in real-time
      const actionKeys = ['toggleMode', 'macroRecord', 'zeroWCS', 'feedHold', 'touchProbe', 'cycleAxis', 'spindleToggle', 'laserToggle', 'dpadUp', 'dpadDown', 'dpadLeft', 'dpadRight'];
      const mappedBtns = this.gamepad.mapping.buttons;
      actionKeys.forEach(k => {
        const ledEl = document.getElementById(`cle-remap-led-${k}`);
        if (!ledEl) return;
        let isAct = false;
        if (k === 'dpadUp') isAct = dpad.dpadUp;
        else if (k === 'dpadDown') isAct = dpad.dpadDown;
        else if (k === 'dpadLeft') isAct = dpad.dpadLeft;
        else if (k === 'dpadRight') isAct = dpad.dpadRight;
        else {
          const bIdx = mappedBtns[k];
          if (bIdx !== undefined && gp.buttons[bIdx]) {
            isAct = gp.buttons[bIdx].pressed || gp.buttons[bIdx].value > 0.4;
          }
        }
        if (isAct) {
          ledEl.style.background = (k === 'feedHold') ? 'var(--danger)' : 'var(--ok)';
          ledEl.style.color = '#fff';
          ledEl.style.borderColor = (k === 'feedHold') ? 'var(--danger)' : 'var(--ok)';
          ledEl.style.boxShadow = (k === 'feedHold') ? '0 0 8px rgba(235, 87, 87, 0.7)' : '0 0 8px rgba(57, 211, 83, 0.7)';
          ledEl.textContent = 'PRESSED';
        } else {
          ledEl.style.background = 'var(--panel-2)';
          ledEl.style.color = 'var(--ink-3)';
          ledEl.style.borderColor = 'var(--line)';
          ledEl.style.boxShadow = 'none';
          ledEl.textContent = 'IDLE';
        }
      });

      const summaryEl = document.getElementById('cle-active-btn-summary');
      if (summaryEl) {
        if (activeBtns.length > 0) {
          summaryEl.textContent = `Active Switches: ${activeBtns.join(', ')}`;
          summaryEl.style.color = 'var(--ok)';
        } else {
          summaryEl.textContent = 'All Switches Idle';
          summaryEl.style.color = 'var(--ink-3)';
        }
      }

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

  showVaultSaveNotice(msg) {
    this.notify(`✔ Vault: ${msg}`, 'ok');
    const noticeEl = document.getElementById('cle-vault-status-notice');
    const textEl = document.getElementById('cle-vault-status-text');
    if (noticeEl && textEl) {
      textEl.textContent = msg;
      noticeEl.style.display = 'flex';
      clearTimeout(this._vaultNoticeTimer);
      this._vaultNoticeTimer = setTimeout(() => {
        if (noticeEl) noticeEl.style.display = 'none';
      }, 4500);
    }
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

    const profName = (document.getElementById('cle-gp-profile-name')?.value || m.profileName || 'Nintendo Switch Pro').trim();
    this.gamepad.saveMapping(profName);
    this.vault.saveControllerProfile(profName, m);
    this.showVaultSaveNotice(`Parameter changes & profile "${profName}" saved to CLE-Vault.`);
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
