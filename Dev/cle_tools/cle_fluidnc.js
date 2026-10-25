/**
 * CLEJS - FluidNC & FluidTouch 7" Controller Bridge (V3)
 * Real-time streaming, Web Serial, WebSocket, Status Polling,
 * Soft-Limits Protection (Z >= 0.1mm, X/Y max -5mm), Spindle/Laser Manual Control,
 * Console Logging, and SD Card File Transfer
 */

export class CLEFluidNCClient {
  constructor(bridge) {
    this.bridge = bridge;
    this.isConnected = false;
    this.connectionType = 'none'; // 'serial' | 'websocket'
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.socket = null;
    const cachedIp = localStorage.getItem('cle.fluidnc.ip');
    this.ip = (cachedIp && cachedIp !== '192.168.1.100' && cachedIp !== '192.168.1.150' && cachedIp !== '192.168.12.150') ? cachedIp : '192.168.12.158';
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
    this.ip = (ip || '192.168.12.158').trim();
    localStorage.setItem('cle.fluidnc.ip', this.ip);
    if (this.bridge && this.bridge.vault) {
      const mach = this.bridge.vault.getActiveMachine();
      if (mach && mach.wifiIP !== this.ip) {
        mach.wifiIP = this.ip;
        this.bridge.vault.saveMachine(mach);
      }
    }
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

    // Update 3D Bed Toolhead Cursor in real time
    if (this.bridge.bed) {
      this.bridge.bed.updateToolCursor(this.wpos);
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
