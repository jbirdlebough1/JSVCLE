/**
 * CLEJS - Vault Subsystem (V3 - MEAGCLE Architecture)
 * Design & Machine State Git Vault, Project Check-In / Version Recall,
 * User Controller Profiles, Tools, Materials, Feeds & Speeds, and Macros
 */

export class CLEVault {
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
        spoilboardThickness: 15.0,   // Spoilboard Thickness (mm, e.g. 15mm MDF)
        spoilboardOffsetX: 0.0,      // Spoilboard Offset X from Machine 0,0
        spoilboardOffsetY: 0.0,      // Spoilboard Offset Y from Machine 0,0
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
        wifiIP: '192.168.1.150',
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
      if (mach.spoilboardThickness === undefined) mach.spoilboardThickness = 15.0;
      if (mach.spoilboardOffsetX === undefined) mach.spoilboardOffsetX = 0.0;
      if (mach.spoilboardOffsetY === undefined) mach.spoilboardOffsetY = 0.0;
    }
    return mach;
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
