/**
 * CLEJS - Nintendo Switch Gamepad Subsystem
 * Native HTML5 Gamepad API integration for JumpStart 3D
 * Supports: Nintendo Switch Joy-Cons, Pro Controller, and Standard Gamepads
 */

export class CLEGamepadEngine {
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

