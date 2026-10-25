/**
 * CLEJS - Job Recovery & Crash Resume Subsystem (V3)
 * Watches active streaming G-code line, detects job hangs/disconnects,
 * and recovers seamlessly at -5 G-code lines before the hang with safe Z-lift & plunge
 */

export class CLEJobRecoveryEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.activeJob = null;
    this.currentLineIndex = 0;
    this.totalLines = 0;
    this.hungLineIndex = 0;
    this.isHung = false;
    this.lookbackLines = 5; // Resume -5 lines before the hang
    this.lastPosition = { X: 0, Y: 0, Z: 0, A: 0 };
    this.feedRate = 1200;
    this.spindleRPM = 12000;
    this.laserPower = 800;
    this.safeZClearance = 15.0; // mm safe lift above workpiece
    this.storageKey = 'cle.recovery.checkpoint';
  }

  startJob(filename, gcodeLines) {
    this.activeJob = {
      filename,
      lines: gcodeLines,
      startTime: Date.now()
    };
    this.totalLines = gcodeLines.length;
    this.currentLineIndex = 0;
    this.hungLineIndex = 0;
    this.isHung = false;
    this.saveCheckpoint();
  }

  // Called continuously by cle_fluidnc while streaming
  advanceLine(idx, gcodeText = '') {
    this.currentLineIndex = idx;
    
    // Parse modal coordinates and feeds from streamed line
    if (gcodeText) {
      const matchX = gcodeText.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = gcodeText.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = gcodeText.match(/[Zz](-?\d+\.?\d*)/);
      const matchA = gcodeText.match(/[Aa](-?\d+\.?\d*)/);
      const matchF = gcodeText.match(/[Ff](\d+\.?\d*)/);
      const matchS = gcodeText.match(/[Ss](\d+\.?\d*)/);

      if (matchX) this.lastPosition.X = parseFloat(matchX[1]);
      if (matchY) this.lastPosition.Y = parseFloat(matchY[1]);
      if (matchZ) this.lastPosition.Z = parseFloat(matchZ[1]);
      if (matchA) this.lastPosition.A = parseFloat(matchA[1]);
      if (matchF) this.feedRate = parseFloat(matchF[1]);
      if (matchS) this.spindleRPM = parseFloat(matchS[1]);
    }

    if (idx % 20 === 0) {
      this.saveCheckpoint();
    }
  }

  recordPosition(wpos) {
    if (wpos) {
      this.lastPosition = { ...this.lastPosition, ...wpos };
      this.saveCheckpoint();
    }
  }

  // Triggered when job hangs, disconnects, holds, or aborts
  markJobHung(lineIndex = this.currentLineIndex, reason = 'Job Interrupted') {
    this.hungLineIndex = lineIndex;
    this.isHung = true;
    this.saveCheckpoint();
    this.bridge.notify(`Job hang detected at Line ${lineIndex}! Recovery armed (-5 lines).`, 'error');
  }

  saveCheckpoint() {
    if (!this.activeJob) return;
    const checkpoint = {
      filename: this.activeJob.filename,
      currentLineIndex: this.currentLineIndex,
      hungLineIndex: this.hungLineIndex,
      totalLines: this.totalLines,
      lastPosition: this.lastPosition,
      feedRate: this.feedRate,
      spindleRPM: this.spindleRPM,
      timestamp: Date.now()
    };
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(checkpoint));
    } catch {}
  }

  getSavedCheckpoint() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  // Target resume line: (hung line - lookback)
  getTargetResumeLine(lookback = this.lookbackLines) {
    const baseLine = this.hungLineIndex || this.currentLineIndex;
    return Math.max(0, baseLine - lookback);
  }

  // Generates safe recovery preamble and slice of remaining G-code
  generateResumeSequence(fullGCodeLines, resumeLineIndex, safeZ = this.safeZClearance) {
    if (!fullGCodeLines || fullGCodeLines.length === 0) return '';
    const targetIdx = Math.max(0, Math.min(fullGCodeLines.length - 1, resumeLineIndex));

    let targetX = this.lastPosition.X;
    let targetY = this.lastPosition.Y;
    let targetZ = this.lastPosition.Z;
    let targetA = this.lastPosition.A;
    let targetF = this.feedRate;
    let targetS = this.spindleRPM;

    // Scan backwards from targetIdx to find modal coordinates and speeds
    for (let i = targetIdx; i >= 0; i--) {
      const line = fullGCodeLines[i];
      const matchX = line.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = line.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = line.match(/[Zz](-?\d+\.?\d*)/);
      const matchA = line.match(/[Aa](-?\d+\.?\d*)/);
      const matchF = line.match(/[Ff](\d+\.?\d*)/);
      const matchS = line.match(/[Ss](\d+\.?\d*)/);

      if (matchX && targetX === this.lastPosition.X) targetX = parseFloat(matchX[1]);
      if (matchY && targetY === this.lastPosition.Y) targetY = parseFloat(matchY[1]);
      if (matchZ && targetZ === this.lastPosition.Z) targetZ = parseFloat(matchZ[1]);
      if (matchA && targetA === this.lastPosition.A) targetA = parseFloat(matchA[1]);
      if (matchF && targetF === this.feedRate) targetF = parseFloat(matchF[1]);
      if (matchS && targetS === this.spindleRPM) targetS = parseFloat(matchS[1]);
    }

    const preamble = [
      `; ==========================================`,
      `;   CLEJS Safe Job Recovery Sequence        `,
      `;   Hung at line: ${this.hungLineIndex || this.currentLineIndex} | Resuming at line: ${targetIdx} (-${this.lookbackLines} lookback)`,
      `; ==========================================`,
      'G21 G90 ; Metric units, Absolute coordinates',
      `G0 Z${safeZ} F1000 ; 1. Safe clearance lift above workpiece`,
      `G0 X${targetX} Y${targetY} A${targetA} F3000 ; 2. Rapid traverse to resume XY coordinate`,
      `M3 S${targetS} ; 3. Re-engage Spindle / Laser`,
      'G4 P2.0 ; 4. Dwell 2 seconds for full RPM',
      `G1 Z${targetZ} F300 ; 5. Controlled plunge to target cut depth`,
      `G1 F${targetF} ; Restore feed rate`,
      `; --- Resuming Original G-Code Toolpath ---`
    ];

    const remaining = fullGCodeLines.slice(targetIdx);
    return preamble.concat(remaining).join('\n');
  }

  // Execute recovery directly through FluidNC streaming
  async executeRecovery(resumeLineIndex, safeZ = this.safeZClearance) {
    const fluid = this.bridge.fluidnc;
    if (!fluid || !fluid.isConnected) {
      this.bridge.notify('Connect to FluidNC first.', 'error');
      return;
    }

    let lines = this.activeJob?.lines;
    if (!lines || lines.length === 0) {
      // Check saved checkpoint or slicer rawGCode
      if (this.bridge.slicer?.rawGCode) {
        lines = this.bridge.slicer.rawGCode.split('\n');
      }
    }

    if (!lines || lines.length === 0) {
      this.bridge.notify('No active G-code buffer found to recover.', 'error');
      return;
    }

    const recoveryGCode = this.generateResumeSequence(lines, resumeLineIndex, safeZ);
    this.bridge.notify(`Resuming job from line ${resumeLineIndex} (-5 lookback) with Safe Z=${safeZ}mm...`, 'ok');
    
    // Start streaming the recovery G-code
    this.startJob(`Recovered_${this.activeJob?.filename || 'Job'}`, recoveryGCode.split('\n'));
    await fluid.streamGCode(recoveryGCode);
  }
}
