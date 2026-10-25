# CLEJS Project Status & Recovery Ledger

## Primary Project Directives (Strict Enforcement)
1. **Free / Open-Source Only:**
   - Free and open-source software only. Never use paid tools.
   - Install all tools exclusively to `D:\CLEJS\tools` to keep drive `C:` as free as possible.
2. **Local Execution on CL3 & Full RWX Pre-Approval:**
   - Execute all workloads, builds, and tools locally on the **CL3** server (Intel Core i9, 24 threads, 32GB RAM).
   - **Full RWX Granted:** All local tools (Bash, Python, Git, etc.) have full Read, Write, and Execute (RWX) permissions across `D:\`. Never ask for permission for local tools unless explicitly requiring a write to `C:`.
   - **Cross-Platform Standard:** Use **Bash** (`.sh`) exclusively across all environments (no PowerShell).
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
  2. Upstream JumpStart tracking isolated in `JSoriginal/` via `update_jumpstart.sh` (daily 8:00 AM check via automated task).
  3. Single-point non-invasive hook at the bottom of `Dev/index.htm` loading modular extensions via universal `cle_bundle.js`.
  4. Minimal Python server (`tools/CLE_server.py`) handling OS-level PrusaSlicer CLI execution and disk vault sync.
  5. Zero session information loss: every build/milestone syncs Antigravity JSONL session transcripts to `sessions/<conversation-id>/` via `save_checkpoint.sh` and commits to git.

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
| `c1c01b32-0294-42e0-a526-18f205e9d6d5` | Gemini 3.8 Flash | 2026-10-24 | **Active** | Full device-type aware Slicing (Top-Down for CNC/Laser, Bottom-Up for 3D), MEAGCLE Git Design Vault, Job Crash Recovery (-5 lines lookback), Multiple Machine Profiles (LightBurn/MillMage Devices model), FluidNC Flash config.yaml & G-code ($$, $I) capability detection, Joystick Mode ribbon redesign, and interactive Switch controller remap table. |

---

## 4. Current State & Milestones

- [x] Initialized Git repository with primary branch `CLEJS`.
- [x] Established `sessions/` directory to archive complete Antigravity transcript logs (`transcript.jsonl` and `transcript_full.jsonl`).
- [x] Standardized on pure **Bash** scripts (`save_checkpoint.sh`, `update_jumpstart.sh`, `cle_start.sh`).
- [x] Codified full RWX permission directive for local tools without prompting.
- [x] **Chrome `file:///` Offline Compatibility**: Bundled all CLE logic into `Dev/cle_tools/cle_bundle.js` with standard `<script>` tag.
- [x] **Native Advanced Mode CLE Tab**: Added `"cle"` to `wstabs` (`Design`, `3D Print Sim`, `Simulate`, `CLE`).
- [x] **D-Pad Cross Button Fully Activated**:
  - Design Mode: Snaps orthogonal views (`Top`, `Front`, `Left`, `Right`) and nudges camera.
  - Manual Mode: Step size cycling (0.01mm to 10mm) and directional step jog.
  - Live monitor in Controller Setup highlights D-Pad inputs.
- [x] **Fixed Right Stick Pan Vertical**: Pan up and down direction sign aligned with JumpStart camera matrix.
- [x] **Manual CNC/Laser Control Center Popup**:
  - Live DRO display (X, Y, Z, A).
  - Bed Safety Soft-Limits Active: $Z \ge 0.1\text{ mm}$ (hard clamp to prevent bed/tool crash), $X: 0 \to 595\text{ mm}$, $Y: 0 \to 495\text{ mm}$ (5mm clearance from endstops).
  - Manual Spindle ON/OFF toggle (`M3 S...` / `M5`) with RPM input.
  - Manual Laser ON/OFF toggle and 1% framing pulse button (`M3 S10`).
  - G-Code Sequence Move Recorder: Records jog moves and exports to `.nc` macro file.
  - Live FluidNC terminal console with command input.
  - Remote Workpiece Camera Feed: Connects to USB Webcam (`getUserMedia`) or Network IP Cam stream (MJPEG/HTTP).
- [x] **Continuous 3D Visualizer Sliced Stack**:
  - Dual-engine slicing (PrusaSlicer CLI on CL3 + Native JS Slicer in browser).
  - Renders 3D layer toolpaths directly in Three.js viewport with color elevation gradient.
  - Floating layer slider HUD (`[ < ] [ Layer N / Total ] [ > ] [ Show All ]`).
  - Direct SD Card upload to FluidNC / FluidTouch 7" local storage.
- [x] **Generic Camera Engine (USB Webcams & Open Wi-Fi/IP Streams)**:
  - Supports any standard USB camera via HTML5 WebRTC `getUserMedia` with auto-enumeration and persistent device selection.
  - Auto-selects Logitech C270 HD WebCam connected on CL3 (720p @ 30 FPS, ~30ms latency, zero cloud dependence).
  - Supports open Wi-Fi/IP cameras via MJPEG / HTTP streaming with persistent stream URL.
  - Optical Reticle & Digital Edge Finder: High-contrast green overlay with 4 cycleable modes (Crosshair with 5mm tick marks, Concentric Bullseye, Alignment Grid, Off).
  - Optical WCS Zeroing: Sets WCS zero at optical crosshair location (`G10 L20 P1`) accounting for configurable camera-to-spindle/laser offsets.
  - One-click Workpiece Snapshot capture: Exports timestamped 1280x720 PNG directly to disk.
  - Viewport Picture-in-Picture Docking: Floats live video feed into bottom-right of 3D scene.
- [x] **Devices & Multiple Machine Profiles (LightBurn / MillMage Model)**:
  - Supports multiple machine profiles (TwoTrees TTC6050 CNC, Diode Laser 20W, 4-Axis Rotary, Custom CNC Router).
  - Automatically queries and reads parameters via G-code variables (`$$` and `$I`).
  - Directly reads FluidNC's full capability model from flash `config.yaml` (`$Config/Dump` over serial/WS or HTTP `/files/config.yaml`), and imports disk `config.yaml`.
  - Machine profile updates bed bounds, soft-limits, max feeds, and storage targets (FluidNC ESP32 SD & FluidTouch 7" Display SD).
- [x] **Interactive Gamepad Remap Table & User Profiles**:
  - Full remap table for all Switch buttons and axes (Left/Right sticks, D-Pad cross, face buttons, triggers).
  - Real-time deflection meters for all axes 0..5 (solves Switch axis 3/5 right stick pan up/down).
  - Mutually exclusive single-active D-Pad cross cluster.
  - Saves and loads custom profiles directly to/from CLE-Vault (`vault/profiles/<name>.json`).
- [x] **MEAGCLE-Style Design & Machine State Git Vault**:
  - Project name dynamically derived from JumpStart project name (`window.xe?.doc?.name`).
  - Check-in snapshots with description & tags, committed directly to local Git repository in `vault/projects/<name>/`.
  - Full version history timeline with one-click **Restore** (includes safety checkpoint before restore).
  - Check-in captures JumpStart document state, slicer settings, controller profiles, and machine state.
- [x] **Job Crash & Power-Loss Recovery (-5 Lines Lookback)**:
  - Tracks live streaming G-code lines and modal states ($X, Y, Z, A, F, S$).
  - Detects job hangs, disconnects, or pauses.
  - Safe recovery routine resumes from **-5 G-code lines before the hang**: Safe Z lift -> rapid traverse XY -> spindle/laser spinup with 2s dwell -> plunge to cut depth -> stream remainder.
- [x] **Device-Type-Aware Slicing Order (Top-Down for CNC/Laser, Bottom-Up for 3D)**:
  - CNC and Laser modes slice and cut **TOP-DOWN** into material.
  - 3D Additive Print mode builds **BOTTOM-UP** from bed.
  - Direct Three.js visualizer rendering with `app.vp.scene.add()` and `app.vp.request()`.
  - Floating Layer HUD slider with directional progression and direct FluidNC SD card transfer.
- [x] **Ribbon Harmonization**:
  - Removed "Zero All".
  - Renamed ribbon card to **`JOYSTICK MODE`**.
  - Machine card shows active device name, `USB List`, `WiFi Setup`, `Machine Gcode`, `FluidNC`.
  - Button labeled `Manual Control of <Machine Name>`.
  - JumpStart native notifications via `xe.toast(...)`.
- [x] **Tool Library & Automated/Manual Tool Changes (MTC & ATC)**:
  - Custom hardware support: TwoTrees TTC6050 with MKS DLC32 MAX 4-axis, CL57 closed-loop drivers, and VTA102 40K encoders.
  - Multi-Spindle Support: 3 interchangeable spindles (Stock 500W DC 12k RPM, 800W Router 24k RPM, 1.5kW VFD 24k RPM).
  - Laser Head Tool Integration: Atomstack/IKIER A70 (70W optical output to Ztop, 160W electrical consumption, 43.75% efficiency, 30mm focal distance) and 20W precision diode (120W electrical consumption, 20mm focal distance). Configurable PWM frequency 2,500Hz - 20,000Hz.
  - Toolsetter Touch-Off Probe Cycle: Generates safe G-code for MTC with touch-plate probing (`G38.2`), fixed collet stop rings, and ATC rack slots.
  - Tool Library UI: Interactive modal to add/edit/delete tools, save to Vault, and execute live tool changes directly over FluidNC.
- [x] **Joystick Mode Ribbon Cleanup & Real-Time Controller Switch Indicators**:
  - Defaults cleanly to **Design Mode** (Three.js 3D viewport navigation).
  - Switching to **Manual Mode** immediately initiates machine auto-connection and pops up the live Device Control Card.
  - **Camera Auto-Start**: Automatically enumerates and starts the USB webcam (e.g., Logitech C270) or IP camera stream upon opening the control center.
  - **Live Controller Switch State Indicator Strip**: 18 real-time LED pill badges (B, A, Y, X, L, R, ZL, ZR, Minus, Plus, L3, R3, D-Pad Up/Down/Left/Right, Home, Capture) illuminating dynamically with glowing green feedback and summary text as buttons are pressed.
  - **Vault Save Confirmation**: Parameter edits (axis remapping, inversions, and profiles) display an in-modal CLE-Vault confirmation banner and desktop toast notification.
