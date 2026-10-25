/**
 * CLEJS - Job Recovery & Crash Resume Subsystem
 * Tracks live G-Code streaming position and generates safe-plunge resume sequences
 */

export class CLEJobRecoveryEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.activeJob = null;
    this.currentLineIndex = 0;
    this.totalLines = 0;
    this.lastPosition = { X: 0, Y: 0, Z: 0, A: 0 };
    this.feedRate = 1000;
    this.spindleRPM = 12000;
    this.safeZClearance = 25.0; // mm above workpiece
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
    this.saveCheckpoint();
  }

  recordPosition(wpos, feed, rpm) {
    this.lastPosition = { ...wpos };
    if (feed) this.feedRate = feed;
    if (rpm) this.spindleRPM = rpm;
    this.saveCheckpoint();
  }

  advanceLine(idx) {
    this.currentLineIndex = idx;
    if (idx % 25 === 0) {
      this.saveCheckpoint();
    }
  }

  saveCheckpoint() {
    if (!this.activeJob) return;
    const checkpoint = {
      filename: this.activeJob.filename,
      currentLineIndex: this.currentLineIndex,
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

  // Generates Safe Recovery G-Code from a specified line index
  generateResumeSequence(fullGCodeLines, resumeLineIndex, safeZ = this.safeZClearance) {
    const targetIdx = Math.max(0, Math.min(fullGCodeLines.length - 1, resumeLineIndex));
    
    // Find the target coordinate of the resume line
    let targetX = this.lastPosition.X;
    let targetY = this.lastPosition.Y;
    let targetZ = this.lastPosition.Z;
    let targetA = this.lastPosition.A;

    // Scan backwards from targetIdx to reconstruct coordinate state
    for (let i = targetIdx; i >= 0; i--) {
      const line = fullGCodeLines[i];
      const matchX = line.match(/[Xx](-?\d+\.?\d*)/);
      const matchY = line.match(/[Yy](-?\d+\.?\d*)/);
      const matchZ = line.match(/[Zz](-?\d+\.?\d*)/);
      const matchA = line.match(/[Aa](-?\d+\.?\d*)/);
      if (matchX && targetX === this.lastPosition.X) targetX = parseFloat(matchX[1]);
      if (matchY && targetY === this.lastPosition.Y) targetY = parseFloat(matchY[1]);
      if (matchZ && targetZ === this.lastPosition.Z) targetZ = parseFloat(matchZ[1]);
      if (matchA && targetA === this.lastPosition.A) targetA = parseFloat(matchA[1]);
    }

    const preamble = [
      `; --- CLEJS Crash Recovery Preamble ---`,
      `; Resuming job from line ${targetIdx} of ${fullGCodeLines.length}`,
      'G21 G90 ; Metric, Absolute positioning',
      `G0 Z${safeZ} F1000 ; Move to safe clearance height`,
      `M3 S${this.spindleRPM} ; Spin up spindle / activate tool`,
      'G4 P2 ; Dwell 2 seconds for full RPM',
      `G0 X${targetX} Y${targetY} A${targetA} F3000 ; Rapid to resume XY location`,
      `G1 Z${targetZ} F300 ; Controlled plunge to resume depth`,
      `G1 F${this.feedRate} ; Restore working feed rate`,
      `; --- Resumed Stream Starts Here ---`
    ];

    const remaining = fullGCodeLines.slice(targetIdx);
    return [...preamble, ...remaining];
  }
}
