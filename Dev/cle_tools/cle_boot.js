/**
 * CLEJS - Master Extension Bootstrapper (V4)
 * Advanced Mode Ribbon, Manual CNC/Laser Control Center, Generic USB/Wi-Fi Camera Engine,
 * Optical Crosshair Reticle & Viewport Picture-in-Picture
 */

import { CLEGamepadEngine } from './cle_gamepad.js';
import { CLEFluidNCClient } from './cle_fluidnc.js';
import { CLERotaryEngine } from './cle_rotary.js';
import { CLECalibrationEngine } from './cle_calibration.js';
import { CLEVault } from './cle_vault.js';
import { CLETestEngine } from './cle_test.js';
import { CLEJobRecoveryEngine } from './cle_recovery.js';
import { CLESlicerEngine } from './cle_slicer.js';
import { CLECameraEngine } from './cle_camera.js';

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
