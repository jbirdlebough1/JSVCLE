# CLEJS Project

## Primary Project Directives
1. **Free / Open-Source Only:**
   - No paid software or tools. Free and open-source only.
   - Install all tools exclusively in `D:\CLEJS\tools` to keep drive `C:` clean.
2. **Local Execution on CL3 & Permanent Pre-Approval:**
   - Execute all workloads, builds, and tools locally on the **CL3** server (i9, 24 threads, 32GB RAM).
   - **Bash, Python, and local tools are permanently pre-approved** to run directly without asking for confirmation.
   - **Cross-Platform Standard:** All automation scripts use **Bash** (`.sh`) instead of PowerShell.
3. **No Paid Services / Prefer Local Tools:**
   - No paid third-party web services or APIs.
   - All tools and processing prefer local execution on CL3.
4. **Google Gemini Pro Account Exclusively:**
   - Use only the user's prepaid Google Gemini Pro account—no exceptions.

---

## 1. Directory Structure

```text
D:\CLEJS\
├── JSoriginal\          <-- Current official JumpStart reference copy
│   └── index.htm        <-- Updated when the daily upstream check finds a change
│
├── Dev\                 <-- Active Working Directory
│   ├── index.htm        <-- Development copy of JumpStart
│   ├── cle_tools\       <-- Modular CLE additions (FluidNC/TTC6050, tool library)
│   └── slicer\          <-- Continuous 3D CNC / Laser slicer logic
├── tools\               <-- Local tool installations & CLE_server.py
├── sessions\            <-- Permanent Antigravity session transcript archive
├── vault\               <-- Local disk vault for machine profiles & tool libraries
├── installer\           <-- Inno Setup packaging scripts
├── JSoriginal_history\  <-- Dated prior versions saved before upstream replacement
├── upstream-reports\    <-- Daily upstream-vs-Dev comparison tables
├── PROJECT_STATUS.md    <-- Recovery ledger for zero information loss
├── save_checkpoint.sh   <-- Automated Bash transcript sync and git commit script
├── update_jumpstart.sh  <-- Automated Bash ClassyApps upstream check
└── cle_start.sh         <-- One-click Bash launcher for server and JumpStart
```

## 2. Strategy & Ground Rules

1. **Track the Official Upstream in `JSoriginal`**:
   - The daily 8:00 AM check follows the JumpStart app link on classyapps.org and updates `JSoriginal/index.htm` only when its SHA-256 changes.
   - The previous file is saved under `JSoriginal_history` before replacement.
   - Review the dated table in `upstream-reports` to compare the upstream file against `Dev/index.htm`; the updater never changes `Dev`.
2. **Direct Development in `Dev`**:
   - Integrate CLE capabilities directly into JumpStart's native DOM and runtime, avoiding nested iframes or disconnected external docks.
3. **Native 3D Vertex & Canvas Slicing**:
   - Slicer 3D / Laser / CNC modes operate directly within the Three.js 3D canvas context with full vertex access for continuous Z profiles and toolpath generation.
4. **Hardware Integrations**:
   - FluidNC / TTC6050 profiles, machine limits, tool library, and streaming protocol live under `cle_tools/`.
