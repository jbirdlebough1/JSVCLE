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
| `c1c01b32-0294-42e0-a526-18f205e9d6d5` | Gemini 3.8 Flash | 2026-10-24 | **Active** | Built Manual CNC/Laser Control Center popup with live DRO, terminal console, remote camera feed (USB/IP), Bed Safety Soft-Limits (Z>=0.1mm, X/Y max -5mm), Spindle/Laser toggle, G-code macro recorder, fixed D-Pad cross button and pan vertical. |

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
