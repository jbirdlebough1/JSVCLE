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
import { CLEToolLibrary } from './cle_tool_library.js';
import { CLEBedVisualizer } from './cle_bed.js';

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

    // 0. Return to Design Workspace (JumpStart CAD)
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
