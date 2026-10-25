/**
 * CLEJS - Nintendo Switch Gamepad Subsystem (V3)
 * Full Manual CNC/Laser Control, Viewport 3D Orbit & Pan with D-Pad Hat Support
 */

export class CLEGamepadEngine {
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
