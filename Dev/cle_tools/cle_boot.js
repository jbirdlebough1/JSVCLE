/**
 * CLEJS - Master Extension Bootstrapper
 * Mounts into JumpStart 3D native DOM without modifying core application code
 */

import { CLEGamepadEngine } from './cle_gamepad.js';
import { CLEFluidNCClient } from './cle_fluidnc.js';
import { CLERotaryEngine } from './cle_rotary.js';
import { CLECalibrationEngine } from './cle_calibration.js';
import { CLEVault } from './cle_vault.js';
import { CLETestEngine } from './cle_test.js';
import { CLEJobRecoveryEngine } from './cle_recovery.js';
import { CLESlicerEngine } from './cle_slicer.js';

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
    // Allow Three.js scene to render first, then attach rotary
    setTimeout(() => {
      this.rotary.initVisualizer();
    }, 1500);
  }

  mountTopbarControls() {
    const topbar = document.querySelector('.topbar');
    if (!topbar) {
      console.warn('[CLEJS] Topbar not found, retrying...');
      setTimeout(() => this.mountTopbarControls(), 500);
      return;
    }

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

    // Insert ribbon after topbar
    const topbar = document.querySelector('.topbar');
    if (topbar && topbar.nextSibling) {
      topbar.parentNode.insertBefore(ribbon, topbar.nextSibling);
    } else {
      appEl.prepend(ribbon);
    }

    this.wireRibbonEvents();
  }

  toggleRibbon() {
    const r = document.getElementById('cle-ribbon');
    if (r) {
      r.style.display = r.style.display === 'none' ? 'flex' : 'none';
    }
  }

  wireRibbonEvents() {
    // Machine connections
    document.getElementById('cle-conn-serial').onclick = () => {
      if (this.fluidnc.isConnected) this.fluidnc.disconnect();
      else this.fluidnc.connectSerial();
    };
    document.getElementById('cle-conn-ws').onclick = () => {
      const ip = prompt('Enter FluidTouch / FluidNC IP Address:', this.fluidnc.ip);
      if (ip) this.fluidnc.connectWebSocket(ip);
    };
    document.getElementById('cle-btn-fluidtouch').onclick = () => {
      this.fluidnc.openFluidTouchWebGUI();
    };

    // Zeroing & E-stop
    document.getElementById('cle-zero-all').onclick = () => {
      this.fluidnc.zeroAxis('ALL');
      this.notify('Zeroed All Axes (G10 L20 P1 X0 Y0 Z0 A0)', 'ok');
    };
    document.getElementById('cle-btn-estop').onclick = () => {
      this.fluidnc.sendImmediate('!');
      this.notify('EMERGENCY FEED HOLD SENT (!)', 'error');
    };

    // Gamepad
    document.getElementById('cle-gp-mode-toggle').onclick = () => {
      this.gamepad.toggleMode();
    };
    document.getElementById('cle-gp-remap-btn').onclick = () => {
      this.openModal('gamepad');
    };

    // Rotary toggle
    document.getElementById('cle-rotary-toggle').onclick = () => {
      this.rotary.toggle();
    };

    // Subsystem modals
    document.getElementById('cle-btn-slicer').onclick = () => this.openModal('slicer');
    document.getElementById('cle-btn-vault').onclick = () => this.openModal('vault');
    document.getElementById('cle-btn-cal').onclick = () => this.openModal('calibration');
    document.getElementById('cle-btn-test').onclick = () => this.openModal('test');
    document.getElementById('cle-btn-recovery').onclick = () => this.openModal('recovery');
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

    // Wire specific modal events
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

