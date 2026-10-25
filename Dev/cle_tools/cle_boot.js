/**
 * CLEJS - Master Extension Bootstrapper (V5)
 * Native JumpStart Integration, Joystick Mode Ribbon, Interactive Gamepad Remap Table,
 * MEAGCLE-Style Git Vault, Job Crash Recovery (-5 lines lookback), and Top-Down / Bottom-Up Slicer
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
