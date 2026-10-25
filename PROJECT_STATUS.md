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
  3. Single-point non-invasive hook at the bottom of `Dev/index.htm` loading modular extensions.
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
| `c1c01b32-0294-42e0-a526-18f205e9d6d5` | Gemini 3.8 Flash | 2026-10-24 | **Active** | Injected native CLE ribbon tab in Advanced mode wstabs. Created cle_bundle.js for universal Chrome file:// compatibility. |

---

## 4. Current State & Milestones

- [x] Initialized Git repository with primary branch `CLEJS`.
- [x] Established `sessions/` directory to archive complete Antigravity transcript logs (`transcript.jsonl` and `transcript_full.jsonl`).
- [x] Standardized on pure **Bash** scripts (`save_checkpoint.sh`, `update_jumpstart.sh`, `cle_start.sh`).
- [x] Codified full RWX permission directive for local tools without prompting.
- [x] **Chrome `file:///` Compatibility**: Bundled all CLE logic into `Dev/cle_tools/cle_bundle.js` using standard `<script>` tag, eliminating CORS module failures on local file loads.
- [x] **Native Advanced Mode CLE Tab**: Added `"cle"` to `wstabs` (`Design`, `3D Print Sim`, `Simulate`, `CLE`) in JumpStart's Advanced mode ribbon navigation.
- [x] **Ribbon Router Integration**: Wired `Vr === "cle"` to `window.CLE.renderAdvancedRibbon(...)` rendering native JumpStart buttons for:
  - Machine: USB Serial, WiFi/WS, FluidTouch 7" Head, Zero All
  - Controller: Nintendo Switch Mode toggle (Design 3D / Run Pendant), Button Remap
  - Rotary & Slicer: 4th Axis Rotary (A) stock visualizer, Prusa Slicer CLI
  - CLE Tools: Vault, Calibration, Test Suite, Job Recovery
  - Safety: FEED HOLD (!)
  - Real-time DRO: Live X, Y, Z, A coordinate bar
