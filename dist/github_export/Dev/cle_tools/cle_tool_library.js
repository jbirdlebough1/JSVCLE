/**
 * CLEJS - Tool Library & Tool Change Subsystem (V1)
 * Supports Manual Tool Change (MTC) with Toolsetter Probing, Automated Tool Change (ATC),
 * Spindle & Laser Tool Models, Optical Power Scaling, and FluidNC Tool Length Offsets (TLO)
 */

export class CLEToolLibrary {
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
