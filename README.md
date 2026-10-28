# JSVCLE Studio
**JumpStart 3D CAD + Vellum Vector Studio + Continuous Layer Extension (CLE)**  
*An Integrated In-Browser CAD / CAM / Laser Fabrication Workspace*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform: Windows 11](https://img.shields.io/badge/Platform-Windows%2011-0078D4.svg)](dist/)
[![Upstream: JumpStart 3D](https://img.shields.io/badge/Upstream-JumpStart%203D%20v2.7.7-orange.svg)](https://classyapps.org)
[![Vector: Vellum v1.6](https://img.shields.io/badge/Vector-Vellum%20v1.6-purple.svg)](Vellum/)
[![Hardware: FluidNC](https://img.shields.io/badge/Hardware-FluidNC%20ESP32-green.svg)](Dev/cle_tools/cle_fluidnc.js)

---

> [!CAUTION]
> **RESEARCH EXPERIMENTATION & LIABILITY DISCLAIMER**  
> This software is purely research experimentation and is provided strictly **"AS IS"**. It may damage your device, CNC machine, spindle, laser diode, workpiece, or computer. The goal of this project is the exploration of what is possible in unified in-browser digital fabrication. Users accept all risks and agree to hold authors, contributors, and developers completely harmless regardless of outcome. **USE AT YOUR OWN RISK.**
> 
> **Community Rules:**
> 1. **Open Source & Copyleft:** Keep all innovations accessible and free for everyone.
> 2. **Constructive Community:** Keep all commentary positive, helpful, and respectful.
> 3. **Action-Oriented Collaboration:** Write code to fix issues and share your solutions back to the group.

---

## 🚀 Pre-Compiled Windows Installers (`/dist` Folder)

For zero-dependency setup on Windows 11 (no Node.js or Python required on host):
* **Latest Installer:** [`dist/JSVCLE_Experimental_v01.00.66.exe`](dist/JSVCLE_Experimental_v01.00.66.exe) (~20.7 MB)
* **GitHub Releases:** You can also download the pre-compiled installer executables and documentation directly from the [JSVCLE Releases Page](https://github.com/jbirdlebough1/JSVCLE/releases).

The installer packages:
1. **JumpStart 3D CAD Core** (`Dev/index.htm`) with the complete Continuous Layer Extension.
2. **Vellum Vector Studio** (`Vellum/index.htm`) for 2D curve drawing, text, laser kerf, and direct 3D extrusion.
3. **Local Hardware Daemon** (`tools/CLE_server.py`) and embedded Python 3.11 runtime.
4. **Machine Vault & Tool Library** (`vault/`) for offline calibration and gamepad mappings.
5. Windows All-Users Start Menu and Desktop shortcuts with autostart daemon registration.

---

## 📚 Documentation & Technical Manuals (`/docs` Folder)

Comprehensive manuals with 16 vector architectural and execution-flow diagrams:

| Document | PDF Edition | Markdown Edition | Description |
|---|---|---|---|
| **User Guide** | [📥 `USER_GUIDE.pdf`](docs/USER_GUIDE.pdf) *(9 pages)* | [📄 `USER_GUIDE.md`](docs/USER_GUIDE.md) | Installation, initial machine setup, 3 walkthrough workflows, troubleshooting, and glossary. |
| **Developer Guide** | [📥 `DEVELOPER_GUIDE.pdf`](docs/DEVELOPER_GUIDE.pdf) *(15 pages)* | [📄 `DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) | Architecture, capability matrix, DevInstaller, execution lifecycles, and class reference. |

---

## 🛠️ Feature Highlights

### 1. Laminated Multi-Part Slicing with Precision Alignment Dowel Holes
Partitions tall, contoured 3D models (such as acoustic biradial horns and thick hardwood furniture stock) into discrete slab thicknesses (e.g., $30.0\,\text{mm}$).
* Automatically calculates bounds and generates horizontal machining partitions.
* Automatically bores precision $\varnothing 8.0\,\text{mm}$ registration dowel holes through all mating layers.
* Ensures 100% concentric alignment during final glue-up and assembly.

### 2. Grayscale 2D Photo to 3D Continuous Z Relief Carving
Converts standard 2D photograph brightness and contrast depth maps into true 3D sculptural reliefs.
* Dynamically extracts pixel luminance ($L = 0.299R + 0.587G + 0.114B$) on an off-screen canvas.
* Displaces 3D mesh vertices along the Z-axis in real time.
* Generates continuous multi-axis raster G-code that smoothly varies Z depth along every carving pass without stepped stair-stepping.

### 3. Vellum Vector Studio to JumpStart 3D Bi-Directional Bridge
Draw vector curves, text, and laser paths in Vellum (`Vellum/index.htm`), and push them directly into JumpStart CAD via the PostMessage bridge:
* **Option 1:** Add as an editable 2D parametric sketch on any CAD plane.
* **Option 2:** Direct Extrude into a watertight 3D solid (e.g. $5.0\,\text{mm}$ thickness) resting at spoilboard center ($Z=20.10\,\text{mm}$).
* **Option 3:** Align as an optical underlay on the CNC spoilboard bed.

### 4. Interactive Spoilboard Manager & 4-Axis DRO
* Visual MDF spoilboard table ($600 \times 500 \times 20\,\text{mm}$) with real-time collision detection.
* $0.20\,\text{mm}$ sacrificial breakthrough overcut margin for clean cutouts without tabs.
* Real-time 4-axis digital readout (X, Y, Z, A) over WebSerial USB and WebSocket networking for FluidNC controllers.
* Dual-mode gamepad control (CAD camera orbit vs. CNC machine jog with quadratic acceleration curves).
* Job crash recovery with a persistent $-5$ lines lookback buffer.

---

## 🐛 Defect Tracking & Bugfix Report (CLEBUGGER)

We track all defects, enhancements, and KLOC metrics transparently using **CLEBUGGER** (`bugs.db`):

* **Codebase Size:** `26.096 KLOC` (across 74 files)
* **Working Codebase:** `25.951 KLOC`
* **Defect Density:** `0.15 bugs/KLOC`

| Defect ID | Build | Status | Subsystem | Title / Description |
|---|---|---|---|---|
| **CLEJS-001** | `v01.00.66` | 🟡 `OPEN` | `cle_bed.js` | Cannot place or seat Design CAD bodies onto spoilboard table (Z=20.10mm) |
| **CLEJS-002** | `v01.00.66` | 🟡 `OPEN` | `cle_slicer.js` | Grayscale 3D relief mesh 90 deg rotation discrepancy and scaling alignment |
| **CLEJS-003** | `v01.00.66` | 🟡 `OPEN` | `cle_boot.js` | Restore JumpStart Design workspace editing and selection for imported photos and 3D relief |
| **CLEJS-004** | `v01.00.66` | 🟡 `OPEN` | `cle_slicer.js` | Expand slicer engine to slice Vellum 2D vector curves and profiles directly |
| **CLEJS-005** | `v01.00.66` | 🟢 `RESOLVED` | `docs` | Render visual diagrams, generate PDF docs with disclaimer preface and no blank pages |

To report bugs or collaborate on fixes, please open an issue in the [JSVCLE Issue Tracker](https://github.com/jbirdlebough1/JSVCLE/issues).

---

## 📁 Repository Directory Structure

```text
D:\CLEJS\
├── Dev\                 <-- JumpStart 3D CAD + Continuous Layer CAM Extension (CLE)
│   ├── index.htm        <-- Main application entry point
│   ├── cle_tools\       <-- Modular ES6 subsystems (bed, slicer, fluidnc, rotary, gamepad, vault)
│   └── slicer\          <-- Native Three.js slicing engine
├── Vellum\              <-- Vellum Vector Studio (2D vector drawing, laser, kerf, tracing)
├── docs\                <-- User Guide, Developer Guide, PDF manuals, and SVG diagrams
│   ├── diagrams\        <-- 16 rendered vector architecture and execution flow diagrams
│   ├── USER_GUIDE.pdf   <-- 9-page visual User Guide
│   └── DEVELOPER_GUIDE.pdf <-- 15-page visual Developer Guide
├── tools\               <-- Local Python server, DevInstaller, build pipeline, bundler
│   ├── CLE_server.py    <-- Background daemon for Git Vault and hardware IO (port 8765)
│   ├── DevInstaller.bat <-- Automated developer toolchain bootstrapper
│   └── update_github.py <-- Automated one-command GitHub publisher & verifier
├── vault\               <-- Local disk vault for machine profiles & tool libraries
├── installer\           <-- Inno Setup 6 packaging script (cle_setup.iss)
├── dist\                <-- Compiled distribution installers (JSVCLE_Experimental_v01.00.66.exe)
├── JSoriginal\          <-- Upstream JumpStart reference copy (classyapps.org)
├── VVSource\            <-- Upstream Vellum Vector Studio reference copy
└── Build-FullTree.ps1   <-- Master 7-stage build, test, and installer compilation pipeline
```

---

## 💻 Developer Setup & Building

To bootstrap a developer workstation:
```cmd
.\tools\DevInstaller.bat
```

To run the complete 7-stage build pipeline, automated tests, and compile the installer:
```cmd
.\build_full_tree.bat
```

To update and push verified code to GitHub:
```cmd
python tools\update_github.py
```
