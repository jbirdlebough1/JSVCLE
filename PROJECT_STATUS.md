# CLEJS Project Status & Recovery Ledger

## Primary Project Directives (Strict Enforcement)
1. **Free / Open-Source Only & Explicit Permission:**
   - Never download or recommend paid software. Free and open-source software only.
   - Always ask for explicit permission before downloading or installing any program/dependency.
   - Install all tools exclusively to `D:\CLEJS\tools` to keep drive `C:` as free as possible.
2. **Local Execution on CL3:**
   - Execute all workloads, builds, and tools locally on the **CL3** server (Intel Core i9, 24 threads, 32GB RAM).
3. **No Paid Services / Prefer Local Tools:**
   - Never use or integrate paid third-party APIs/services. Use free or open-source solutions only.
   - Preference is strictly for local tools running on CL3.
4. **Google Gemini Pro Account Only:**
   - Use only the user's prepaid Google Gemini Pro account—no exceptions.

---

## 1. Project Overview & Architecture
- **Project Name**: CLEJS (Continuous 3D CNC / Laser / Engraver JumpStart Extension)
- **Active Git Branch**: `CLEJS`
- **Primary Goal**: Direct, native integration of CNC, continuous 3D slicing, and laser controls into JumpStart 3D (Three.js CAD/CAM app by Max Smolens) targeting FluidNC and TwoTrees TTC6050 hardware.
- **Key Architecture Rules**:
  1. Direct integration into JumpStart's native DOM and Three.js runtime with zero disturbance to Max S.'s core code.
  2. Upstream JumpStart tracking isolated in `JSoriginal/` via `Update-JumpStart.ps1` (daily 8:00 AM check via Windows Task Scheduler).
  3. Single-point non-invasive hook at the bottom of `Dev/index.htm` loading modular extensions.
  4. Minimal Python server (`tools/CLE_server.py`) handling OS-level PrusaSlicer CLI execution and disk vault sync.
  5. Zero session information loss: every build/milestone syncs Antigravity JSONL session transcripts to `sessions/<conversation-id>/` and commits to git.

---

## 2. Session Recovery Protocol (For New or Resumed Sessions)
When an AI agent opens this repository in a new session:
1. **Read this file (`PROJECT_STATUS.md`)** to absorb the current state and immediate next tasks.
2. **Check latest git log** (`git log -n 5 --oneline`) to see the latest commits.
3. **If deep context is needed**: Inspect `sessions/<latest-conversation-id>/transcript.jsonl` to review exact past prompts, reasoning, and tool executions.
4. **Active Conversation ID**: Record the new session ID in `sessions/` and update this status file.

---

## 3. Session Log Directory (`d:\CLEJS\sessions\`)

| Conversation ID | Model | Date Started | Status | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `c1c01b32-0294-42e0-a526-18f205e9d6d5` | Gemini 3.8 Flash | 2026-10-24 | **Active** | Built all modular subsystems in single pass: Gamepad (Switch Modes 1 & 2), FluidNC/FluidTouch, 4th Axis, Cal, Vault, Test, Recovery, Slicer CLI, CLE_server, Inno Setup, 8:00 AM scheduled task. |

---

## 4. Current State & Milestones

- [x] Initialized Git repository with primary branch `CLEJS`.
- [x] Established `sessions/` directory to archive complete Antigravity transcript logs (`transcript.jsonl` and `transcript_full.jsonl`).
- [x] Created `PROJECT_STATUS.md` ledger for zero-loss crash recovery.
- [x] Created `Save-CLEJSCheckpoint.ps1` for automated sync-and-commit workflows.
- [x] Created `D:\CLEJS\tools` directory for local tool installs.
- [x] Codified Primary Project Directives into project documentation and git ledger.
- [x] **Phase 1: Nintendo Switch Gamepad Subsystem (`cle_gamepad.js`)**:
  - HTML5 Gamepad API integration.
  - Mode 1 (Design): Left stick spherical orbit, Right stick pan, Triggers ZL/ZR zoom, D-Pad orthopedic view snaps.
  - Mode 2 (Run): Proportional X/Y jog, Z plunge, A rotary jog, D-Pad step cycling (0.01-10mm), WCS zeroing, Touch-plate probe, Teach-pendant macro recorder.
  - Visual Remapping modal.
- [x] **Phase 2: FluidNC & FluidTouch 7" Head Bridge (`cle_fluidnc.js`)**:
  - Web Serial (USB) and WebSocket connections.
  - Live Digital Readout (DRO) updating X, Y, Z, A coordinates in real-time.
  - Direct launch link to FluidTouch 7" Head / FluidNC Web GUI.
  - G-Code line streaming with flow control and immediate E-Stop (`!`).
- [x] **Phase 3: 4th-Axis Rotary Engine & Three.js Visualizer (`cle_rotary.js`)**:
  - Renders cylindrical stock and 3-jaw rotary chuck in JumpStart's Three.js scene.
  - Planar-to-rotary coordinate unwrapping ($A = \frac{360 \times Y}{\pi \times D}$).
- [x] **Phase 4: Calibration, Vault, Test, & Job Recovery**:
  - `cle_calibration.js`: Steps/mm calculator, Laser power/speed matrix generator, Backlash measurement.
  - `cle_vault.js`: Endmills, lasers, materials, TTC6050 profiles, macros.
  - `cle_test.js`: Circle-Diamond-Square, Rapid repeatability, Laser alignment pulse.
  - `cle_recovery.js`: Live stream position tracking, power-loss crash recovery wizard with Safe-Z plunge preamble.
- [x] **Phase 5: PrusaSlicer CLI & `CLE_server.py`**:
  - `cle_slicer.js`: Three.js vertex extractor to STL.
  - `tools/CLE_server.py`: Local Python server on CL3 (localhost:8765) executing PrusaSlicer CLI and handling disk vault persistence.
- [x] **Phase 6: Inno Setup Installer & Daily 8:00 AM Upstream Task**:
  - `installer/cle_setup.iss` (Inno Setup installer targeting `D:\CLEJS`).
  - `cle_start.bat`: One-click startup for CLE_server and JumpStart.
  - Windows Task Scheduler: `CLEJS_Daily_Upstream_Check` registered to run daily at 8:00 AM.
