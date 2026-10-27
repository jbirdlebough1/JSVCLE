/**
 * CLEJS - Nintendo Switch Gamepad Subsystem (V4)
 * Full Manual CNC/Laser Control, Viewport 3D Orbit & Pan with D-Pad Hat Support,
 * Configurable Remapping Table, and Vault Profile Storage
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
