/**
 * CLEJS - Vault Subsystem
 * Tools, Materials, Feeds & Speeds, Machine Profiles, and G-Code Macros
 */

export class CLEVault {
  constructor(bridge) {
    this.bridge = bridge;
    this.storageKey = 'cle.vault.data';
    this.data = this.loadVault();
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
        {
          id: 'macro-probe',
          name: 'Probe Z (Touch Plate)',
          gcode: 'G21 G91\nG38.2 Z-30 F75\nG92 Z15.0\nG0 Z5'
        },
        {
          id: 'macro-park',
          name: 'Park Machine Rear',
          gcode: 'G21 G90\nG0 Z20 F800\nG0 X10 Y480 F4000'
        },
        {
          id: 'macro-laser-tick',
          name: 'Laser Alignment Pulse (1 sec, 5%)',
          gcode: 'M3 S50\nG4 P1\nM5'
        }
      ]
    };
  }

  loadVault() {
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('[CLE Vault] Error loading vault from localStorage:', e);
    }
    return this.getDefaults();
  }

  saveVault() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.data, null, 2));
      // Trigger sync to CLE_server.py disk if available
      this.syncToServer();
    } catch (e) {
      console.error('[CLE Vault] Error saving vault:', e);
    }
  }

  saveMacro(name, gcode) {
    this.data.macros.push({
      id: `macro-${Date.now()}`,
      name,
      gcode
    });
    this.saveVault();
    this.bridge.notify(`Saved macro: ${name}`, 'ok');
  }

  async syncToServer() {
    try {
      await fetch('http://127.0.0.1:8765/api/vault/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.data)
      });
    } catch {}
  }
}
