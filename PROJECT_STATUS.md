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
- **Primary Goal**: Direct, native integration of CNC, continuous 3D slicing, and laser controls into JumpStart 3D (Three.js CAD/CAM app) targeting FluidNC and TwoTrees TTC6050 hardware.
- **Key Architecture Rules**:
  1. Direct integration into JumpStart's native DOM and Three.js runtime (no nested iframes or detached popups).
  2. Upstream JumpStart tracking isolated in `JSoriginal/` via `Update-JumpStart.ps1` (never auto-merged into `Dev/`).
  3. Continuous 3D vertex & canvas slicing logic housed in `Dev/slicer/`.
  4. FluidNC / TTC6050 machine profiles, limits, tool library, and streaming protocols housed in `Dev/cle_tools/`.
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
| `c1c01b32-0294-42e0-a526-18f205e9d6d5` | Gemini 3.8 Flash | 2026-10-24 | **Active** | Project initialization, git setup, zero-loss logging protocol, strict directives established. |

---

## 4. Current State & Milestones

- [x] Initialized Git repository with primary branch `CLEJS`.
- [x] Established `sessions/` directory to archive complete Antigravity transcript logs (`transcript.jsonl` and `transcript_full.jsonl`).
- [x] Created `PROJECT_STATUS.md` ledger for zero-loss crash recovery.
- [x] Created `Save-CLEJSCheckpoint.ps1` for automated sync-and-commit workflows.
- [x] Created `D:\CLEJS\tools` directory for local tool installs.
- [x] Codified Primary Project Directives into project documentation and git ledger.
- [ ] Determine baseline for `Dev/index.htm`: keep v2.7.2 baseline or update baseline to newly released upstream v2.7.4.
- [ ] Implement foundational machine profiles in `Dev/cle_tools/` (TTC6050, FluidNC protocol definitions).
- [ ] Scaffold Three.js canvas vertex access in `Dev/slicer/`.
