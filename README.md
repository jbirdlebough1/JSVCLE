# CLEJS Project

## 1. Directory Structure

```text
D:\CLEJS\
├── JSoriginal\          <-- Current official JumpStart reference copy
│   └── index.htm        <-- Updated when the daily upstream check finds a change
│
├── Dev\                 <-- Active Working Directory
│   ├── index.htm        <-- Development copy of JumpStart 2.7.2
│   ├── cle_tools\       <-- Modular CLE additions (FluidNC/TTC6050, tool library)
│   └── slicer\          <-- Continuous 3D CNC / Laser slicer logic
├── JSoriginal_history\  <-- Dated prior versions saved before upstream replacement
├── upstream-reports\    <-- Daily upstream-vs-Dev comparison tables
└── Update-JumpStart.ps1 <-- Scheduled ClassyApps upstream check
```

## 2. Strategy & Ground Rules

1. **Track the Official Upstream in `JSoriginal`**:
   - The daily scheduled check follows the JumpStart app link on classyapps.org and updates `JSoriginal/index.htm` only when its SHA-256 changes.
   - The previous file is saved under `JSoriginal_history` before replacement.
   - Review the dated table in `upstream-reports` to compare the upstream file against `Dev/index.htm`; the updater never changes `Dev`.
2. **Direct Development in `Dev`**:
   - Integrate CLE capabilities directly into JumpStart's native DOM and runtime, avoiding nested iframes or disconnected external docks.
3. **Native 3D Vertex & Canvas Slicing**:
   - Slicer 3D / Laser / CNC modes operate directly within the Three.js 3D canvas context with full vertex access for continuous Z profiles and toolpath generation.
4. **Hardware Integrations**:
   - FluidNC / TTC6050 profiles, machine limits, tool library, and streaming protocol live under `cle_tools/`.
