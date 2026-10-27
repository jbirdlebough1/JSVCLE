
> [!CAUTION]
> **RESEARCH EXPERIMENTATION & LIABILITY DISCLAIMER**  
> This software is purely research experimentation and is provided strictly **"AS IS"**. It may damage your device, CNC machine, spindle, laser diode, workpiece, or computer. The goal of this project is the exploration of what is possible in unified in-browser digital fabrication. Users accept all risks and agree to hold authors, contributors, and developers completely harmless regardless of outcome. **USE AT YOUR OWN RISK.**
>
> All comments, feedback, and discussion are encouraged and welcome in community posts.  
> **Community Rules:**
> 1. **Open Source & Copyleft:** Keep all innovations accessible and free for everyone.
> 2. **Constructive Community:** Keep all commentary positive, helpful, and respectful.
> 3. **Action-Oriented Collaboration:** Write code to fix issues and share your solutions back to the group.

---

# JSVCLE Studio — Developer Guide
**JumpStart 3D CAD + Vellum Vector Studio + Continuous Layer Extension (CLE)**  
*Architecture, Subsystem Internals, Lifecycle, API Reference, and Tooling Manual*

---

## 1. System Architecture & High-Level Design

### 1.1 Architectural Overview
JSVCLE Studio is a modular digital fabrication platform combining three core runtime environments into an integrated desktop architecture:
1. **JumpStart 3D CAD Core (`Dev/index.htm`)**: An in-browser Boundary Representation (B-Rep) parametric solid modeling engine built on Three.js and custom geometric kernel primitives.
2. **Vellum Vector Studio (`Vellum/index.htm`)**: A standalone 2D parametric vector editor, SVG engine, and laser path generator running within an isolated or modal iframe context.
3. **Continuous Layer Extension (CLE) (`Dev/cle_tools/`)**: A modular suite of ES6 classes mounted directly into JumpStart's runtime lifecycle to provide CNC/laser toolpath slicing, physical machine envelope simulation, 4th axis rotary modeling, dual-mode gamepad control, hardware telemetry, and job recovery.
4. **Local Hardware & Git Vault Service (`tools/CLE_server.py`)**: A zero-dependency Python 3 HTTP daemon listening on `127.0.0.1:8765` providing CLE Git snapshotting, controller profile persistence, and PrusaSlicer CLI execution fallback.


![dev_architecture.svg](diagrams/dev_architecture.svg)

```mermaid
flowchart TD
    subgraph BrowserRuntime["Browser Client Runtime (JumpStart 3D CAD)"]
        Three["Three.js WebGL Scene & Camera Viewport"]
        JSKernel["JumpStart B-Rep Parametric CAD Kernel\n(window.app / window.xe / window.Se)"]
        
        subgraph CLE_Suite["Continuous Layer Extension (window.CLE)"]
            Boot["cle_boot.js\n(Master Bootstrapper & UI Ribbon)"]
            Bed["cle_bed.js\n(Machine Table, Spoilboard, Rulers)"]
            Slicer["cle_slicer.js\n(Top-Down CNC/Laser & Grayscale Slicer)"]
            FluidNC["cle_fluidnc.js\n(WebSerial & WebSocket Client)"]
            Rotary["cle_rotary.js\n(4th Axis A-Chuck & Lathe Sim)"]
            Gamepad["cle_gamepad.js\n(Dual-Mode Gamepad Engine)"]
            VaultFE["cle_vault.js\n(CLE Design Vault Client)"]
            Recovery["cle_recovery.js\n(Crash Resume Engine)"]
            VellumBridge["cle_vellum.js\n(Cross-Frame Bridge)"]
            Cam["cle_camera.js\n(Optical Alignment)"]
            ToolLib["cle_tool_library.js\n(Tool Presets)"]
        end

        Three <--> JSKernel
        JSKernel <--> Boot
        Boot --> Bed & Slicer & FluidNC & Rotary & Gamepad & VaultFE & Recovery & VellumBridge & Cam & ToolLib
    end

    subgraph VellumIframe["Vellum Vector Studio (Vellum/index.htm)"]
        VellumCore["Vector Engine / SVG DOM\n(window.Vellum / window.Ei)"]
        VellumUI["2D Canvas, Laser Presets, Path Booleans"]
    end

    subgraph NativeDaemon["Local Python Background Server (Port 8765)"]
        Server["tools/CLE_server.py\n(BaseHTTPRequestHandler)"]
        GitVault["GitVaultEngine\n(Local Git CLI Automation)"]
        PrusaCLI["PrusaSlicerEngine\n(CLI G-Code Compilation)"]
        ProfileStore["Controller & Machine Profile Storage\n(JSON Store in vault/)"]
        Server --> GitVault & PrusaCLI & ProfileStore
    end

    subgraph HardwareCNC["Physical Machine Controller"]
        FluidNCHW["FluidNC CNC / Laser Controller\n(FluidNC ESP32 Motion Controller)"]
    end

    VellumBridge <-->|Window PostMessage Protocol| VellumCore
    FluidNC <-->|"WebSerial USB 115200 baud or WebSocket"| FluidNCHW
    VaultFE <-->|HTTP REST /api/vault/*| Server
    Slicer <-->|HTTP REST /api/slice/prusa| Server
```


---

### 1.2 Repository Structure & Component Hierarchy


![dev_repo_tree.svg](diagrams/dev_repo_tree.svg)

```mermaid
graph TD
    Root["D:\\CLEJS (Repository Root)"]

    subgraph AppLayers["Application Layers"]
        Dev["Dev/\n(JumpStart 3D + CLE Extension)"]
        Vellum["Vellum/\n(Vellum Vector Studio 2D)"]
        Tools["tools/\n(Python Server, Build Scripts, Runtime)"]
        Vault["vault/\n(Local Git Repos, Profiles, Machines)"]
        Installer["installer/\n(Inno Setup Packaging)"]
        Docs["docs/\n(User & Developer Guides)"]
    end

    subgraph DevComponents["Dev Subsystems (Dev/cle_tools/)"]
        D1["cle_boot.js (Master Singleton)"]
        D2["cle_bed.js (Spoilboard & Rulers)"]
        D3["cle_slicer.js (CAM & Relief Engine)"]
        D4["cle_fluidnc.js (Hardware Comms)"]
        D5["cle_rotary.js (4th Axis Rotary)"]
        D6["cle_gamepad.js (Dual-Mode Gamepad)"]
        D7["cle_vault.js (CLE Git Client)"]
        D8["cle_recovery.js (Crash Resumption)"]
        D9["cle_vellum.js (PostMessage Bridge)"]
    end

    subgraph ToolsComponents["Tools Subsystems (tools/)"]
        T1["CLE_server.py (Daemon on Port 8765)"]
        T2["bundle_cle.py (ES6 Compiler)"]
        T3["DevInstaller.bat / .ps1"]
        T4["export_to_github.py (Sanitizer)"]
        T5["python_runtime/ (Embedded Python 3.11)"]
    end

    Root --> Dev & Vellum & Tools & Vault & Installer & Docs
    Dev --> DevComponents
    Tools --> ToolsComponents
```


---

## 2. Functional Capability Model

JSVCLE operates under a unified functional capability matrix across CAD, CAM, 2D Vector, and CNC control domains:


![dev_capability_matrix.svg](diagrams/dev_capability_matrix.svg)

```mermaid
graph LR
    subgraph CAD_Domain["CAD Domain (JumpStart 3D)"]
        C1["3D Parametric Solids"]
        C2["Sketches & Extrusions"]
        C3["Revolve & Sweeps"]
        C4["Boolean Unions / Cuts"]
        C5["Image Underlay Mapping"]
    end

    subgraph Vector_Domain["Vector Domain (Vellum)"]
        V1["Bezier Curve Drawing"]
        V2["Text to Outlines"]
        V3["SVG / DXF Ingestion"]
        V4["Raster-to-Vector Tracing"]
        V5["Direct CAD Push & Auto-Extrude"]
    end

    subgraph CAM_Domain["CAM Domain (CLE Slicer)"]
        M1["Device-Aware Slicing (Top-Down vs Bottom-Up)"]
        M2["Grayscale 2D-to-3D Continuous Z Relief"]
        M3["Laminated Horn / Thick Slab Partitioning"]
        M4["Alignment Dowel Hole Generation"]
        M5["Dynamic G-Code Post-Processing"]
    end

    subgraph Hardware_Domain["Hardware Domain (CLE CNC)"]
        H1["WebSerial & WebSocket Communication"]
        H2["Live 4-Axis DRO (X, Y, Z, A)"]
        H3["Interactive Spoilboard Collision Avoidance"]
        H4["Dual-Mode Gamepad (CAD Orbit vs CNC Jog)"]
        H5["Crash Recovery with -5 Line Lookback"]
        H6["CLE Git Vault Snapshots"]
    end

    Vector_Domain -->|PostMessage SVG / Profiles| CAD_Domain
    CAD_Domain -->|Three.js Meshes & B-Rep Faces| CAM_Domain
    CAM_Domain -->|G-Code Streams & SD Upload| Hardware_Domain
```


---

## 3. Development Environment & DevInstaller

The JSVCLE build and development infrastructure is designed for zero friction on Windows 11 64-bit developer workstations.

### 3.1 Toolchain Verification Hierarchy


![dev_toolchain_flow.svg](diagrams/dev_toolchain_flow.svg)

```mermaid
flowchart TD
    Start["Run DevInstaller.bat / .ps1"] --> CheckNode{"Node.js 18+ LTS Installed?"}
    CheckNode -- No --> InstallNode["Prompt: Install Node.js from nodejs.org"]
    CheckNode -- Yes --> CheckPy{"Python 3.10+ Installed?"}

    CheckPy -- No --> InstallPy["Prompt: Install Python 3.10+ from python.org"]
    CheckPy -- Yes --> CheckGit{"Git 2.30+ Installed?"}

    CheckGit -- No --> InstallGit["Prompt: Install Git for Windows"]
    CheckGit -- Yes --> CheckInno{"Inno Setup 6 (ISCC.exe) Present?"}

    CheckInno -- No --> LocateInno["Search Registry & Program Files for ISCC.exe"]
    CheckInno -- Yes --> InstallNPM["Run npm install (Playwright, Three.js)"]
    LocateInno --> InstallNPM

    InstallNPM --> InstallBrowser["Run npx playwright install chromium"]
    InstallBrowser --> DevReady["Workstation Ready for Master Builds!"]
```


### 3.2 Master Build Pipeline (`build_full_tree.bat` / `Build-FullTree.ps1`)

The master build script automates a 6-stage release pipeline:


![dev_build_pipeline.svg](diagrams/dev_build_pipeline.svg)

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / CI
    participant Script as Build-FullTree.ps1
    participant Git as Git Submodules / Remotes
    participant Bundle as bundle_cle.py
    participant Tests as Test Runner (Bash + Playwright)
    participant Inno as Inno Setup (ISCC.exe)
    participant Dist as dist/ Output Folder

    Dev->>Script: Run build_full_tree.bat
    Script->>Git: Phase 1: Upstream Sync & Verification
    Script->>Bundle: Phase 2: Compile cle_bundle.js
    Script->>Tests: Phase 3: Shell Build Diagnostics (test_build.sh)
    Script->>Tests: Phase 4: Playwright Headless Browser E2E Suite
    Script->>Git: Phase 5: Remote Branch & Tag Validation
    Script->>Inno: Phase 6: Compile cle_setup.iss
    Inno->>Dist: Output JSVCLE_Experimental_v01.00.66.exe
    Dist-->>Dev: Build Artifact + SHA-256 Checksum Verified
```


---

## 4. File-by-File Breakdown & Module Reference


![dev_class_hierarchy.svg](diagrams/dev_class_hierarchy.svg)

```mermaid
classDiagram
    class CLEBridge {
        +String version
        +String machineName
        +CLEVault vault
        +CLEFluidNCClient fluidnc
        +CLECameraEngine camera
        +CLEGamepadEngine gamepad
        +CLERotaryEngine rotary
        +CLECalibrationEngine calibration
        +CLEJobRecoveryEngine recovery
        +CLESlicerEngine slicer
        +CLEBedVisualizer bed
        +CLEVellumBridge vellum
        +init()
        +notify(msg, type)
        +openModal(title, html)
        +closeModal()
    }

    class CLEBedVisualizer {
        +Object config
        +Number workpieceZ
        +THREE.Group bedGroup
        +THREE.Group cursorGroup
        +mountToScene()
        +buildBedMesh()
        +buildRulers()
        +updateToolheadPosition(x,y,z,a)
        +placeWorkpieceOnSpoilboard(mesh)
    }

    class CLESlicerEngine {
        +Number layerHeight
        +String mode
        +Object laminationConfig
        +Array slicedLayers
        +sliceActiveModel()
        +sliceGrayscaleRelief(img, opts)
        +generateLaminatedSlabs(cadMesh)
        +exportGCodeToFluidNC(filename)
    }

    class CLEFluidNCClient {
        +SerialPort port
        +WebSocket ws
        +String status
        +Object dro
        +connectSerial(baud)
        +connectWebSocket(ip)
        +send(gcode)
        +jog(axis, dist, feed)
        +feedHold()
        +resumeJob()
        +emergencyReset()
    }

    class CLEGamepadEngine {
        +Number mode
        +Object mapping
        +poll()
        +applyDeadband(val)
        +calculateJogRate(deflection)
        +openRemapModal()
    }

    class CLEJobRecoveryEngine {
        +Number lastExecutedLine
        +Array lookbackBuffer
        +recordExecutedLine(idx, gcode)
        +resumeAfterCrash()
    }

    class CLEVellumBridge {
        +HTMLElement modalEl
        +HTMLIFrameElement iframeEl
        +openVellum()
        +closeVellum()
        +handleExport(payload)
    }

    class CLEVault {
        +String serverUrl
        +saveProject(name, data, comment)
        +getProjectHistory(name)
        +checkoutProjectVersion(name, hash)
        +saveMachineProfile(id, config)
    }

    CLEBridge *-- CLEBedVisualizer
    CLEBridge *-- CLESlicerEngine
    CLEBridge *-- CLEFluidNCClient
    CLEBridge *-- CLEGamepadEngine
    CLEBridge *-- CLEJobRecoveryEngine
    CLEBridge *-- CLEVellumBridge
    CLEBridge *-- CLEVault
```


### 4.1 Master Bootstrap & UI Lifecycle: `Dev/cle_tools/cle_boot.js`
- **Role**: Master orchestrator. Instantiates all sub-engines, builds top navigation tabs, injects the ribbon UI, manages modal dialogs, and controls DOM toasts.
- **Global Exports**:
  - `window.CLE`: Master instance of `CLEBridge`.
- **Key Methods**:
  - `init()`: Lifecycle hook executed on `DOMContentLoaded`. Mounts CSS, builds UI ribbon, initializes bed visualizer, attaches keyboard hooks, and pings `CLE_server.py`.
  - `injectStyles()`: Appends `cle_theme.css` styles into the JumpStart host DOM.
  - `buildTopNavigationTabs()`: Appends `CAD | CAM | Laser | Rotary | Slicer | Vellum` workspace selector tabs to the top header.
  - `buildRibbon()`: Renders contextual action bars (Connection, Jog Controls, Spoilboard, Slicer, Rotary, Vault).
  - `showVaultSaveNotice(msg)`: Displays animated non-blocking HUD notification.
  - `openModal(title, contentHtml)` / `closeModal()`: Standardized modal dialog manager.

### 4.2 Spoilboard, Machine Table & Rulers: `Dev/cle_tools/cle_bed.js`
- **Role**: Renders the physical CNC workspace in Three.js, including MDF spoilboard, extruded aluminum base frame, precision millimeter ruler graduations, workpiece seating, and the live 4-axis toolhead cursor.
- **Class**: `CLEBedVisualizer(bridge)`
- **Key Properties**:
  - `config.travelX`, `config.travelY`, `config.travelZ`: Active machine envelope dimensions ($600 \times 500 \times 100\,\text{mm}$).
  - `config.spoilboardThickness`: MDF slab thickness (default $20.0\,\text{mm}$).
  - `config.cutoutOvercut`: Safe breakthrough allowance into spoilboard (default $0.2\,\text{mm}$).
  - `workpieceZ`: Calculated top-of-spoilboard seating height ($Z = \text{thickness} + 0.1\,\text{mm} = 20.10\,\text{mm}$).
  - `bedGroup`: `THREE.Group` containing table meshes and grid lines.
  - `cursorGroup`: `THREE.Group` containing live spindle cone, tool tip, projected shadow reticle, and DRO billboard.
- **Key Methods**:
  - `mountToScene()`: Hooks into JumpStart's active Three.js scene (`window.app.scene` or `window.xe.scene`).
  - `buildBedMesh()`: Generates aluminum bed frame and textured MDF spoilboard.
  - `buildRulers()`: Generates millimeter graduations and numeric labels along X (0 to 600mm) and Y (0 to 500mm) using canvas texture sprites.
  - `updateToolheadPosition(x, y, z, a)`: Moves live 3D cursor, casts vertical shadow down onto spoilboard surface, and updates floating DRO coordinate tag.
  - `placeWorkpieceOnSpoilboard(mesh)`: Aligns bottom bounding box of CAD solid or grayscale relief to `Z = workpieceZ`.

### 4.3 Slicer & Toolpath Engine: `Dev/cle_tools/cle_slicer.js`
- **Role**: Multi-mode CNC, Laser, and 3D slicing engine. Converts B-Rep solids, meshes, and 2D grayscale relief depth maps into multi-pass G-code.
- **Class**: `CLESlicerEngine(bridge)`
- **Key Modes**:
  - `mode = 'cnc'`: Top-Down roughing and finishing passes ($Z_{\max} \rightarrow Z_{\min}$) down to spoilboard overcut.
  - `mode = 'laser'`: Top-down planar vector marking and vector rastering.
  - `mode = '3d'`: Bottom-up additive FDM slicing ($Z_0 \rightarrow Z_{\max}$).
  - `laminationConfig.enabled = true`: Laminated slicing for biradial horns and thick slab stock. Partitions tall models into discrete slabs (e.g. $30.0\,\text{mm}$) with automated $\varnothing 8.0\,\text{mm}$ alignment dowel holes.
  - `sliceGrayscaleRelief(imageEl, options)`: Creates 3D continuous relief mesh from grayscale image brightness and computes carving toolpath.
- **Key Methods**:
  - `sliceActiveModel()`: Inspects JumpStart CAD geometry, extracts planar boundary contours, computes infill hatch, and renders 3D layer visualization stack.
  - `generateLaminatedSlabs(cadMesh)`: Splits geometry along Z planes into separate machining jobs with registration pins.
  - `renderLayerStack()`: Generates color-coded `THREE.LineSegments` representing rapid moves (red), feed moves (cyan), and retracts (yellow).
  - `exportGCodeToFluidNC(filename)`: Sends generated toolpath over HTTP to `CLE_server.py` or streams to FluidNC SD card.

### 4.4 Hardware Comms & FluidNC Client: `Dev/cle_tools/cle_fluidnc.js`
- **Role**: Communicates with physical CNC/Laser controller hardware via WebSerial API (USB) and WebSocket (Wi-Fi).
- **Class**: `CLEFluidNCClient(bridge)`
- **Key Properties**:
  - `port`: Active `SerialPort` instance.
  - `ws`: Active `WebSocket` instance.
  - `status`: Machine status string (`Idle`, `Run`, `Jog`, `Hold`, `Alarm`).
  - `dro`: Machine coordinates `{ X, Y, Z, A }` and work coordinates `{ wX, wY, wZ, wA }`.
- **Key Methods**:
  - `connectSerial(baudRate = 115200)`: Requests WebSerial USB device and opens reader/writer streams.
  - `connectWebSocket(ipAddress)`: Connects to FluidNC WebSocket stream on port 81 or 8080.
  - `send(gcodeLine)`: Queues and transmits G-code command string.
  - `jog(axis, distance, feedRate)`: Sends real-time jog string `$J=G91 G21 {axis}{distance} F{feedRate}`.
  - `feedHold()`: Sends immediate `!` character.
  - `resumeJob()`: Sends immediate `~` character.
  - `emergencyReset()`: Sends immediate Ctrl+X (`\x18`) character.
  - `pollStatus()`: Sends `?` query every $100\,\text{ms}$ to parse `<Status|WPos:X,Y,Z,A|FS:feed,speed>` responses.

### 4.5 Dual-Mode Gamepad Engine: `Dev/cle_tools/cle_gamepad.js`
- **Role**: Connects USB/Bluetooth gamepads (Nintendo Switch Pro, Xbox, PlayStation) with dual-mode behavior.
- **Class**: `CLEGamepadEngine(bridge)`
- **Operational Modes**:
  - `Mode 0: Design CAD Mode`: Left stick orbits CAD camera; right stick pans; triggers zoom in/out.
  - `Mode 1: CNC Machine Jog Mode`: Left stick jogs X/Y axes; right stick jogs Z axis; bumpers jog A rotary axis.
- **Key Methods**:
  - `poll()`: High-frequency loop synchronized to `requestAnimationFrame`.
  - `applyDeadband(value, threshold = 0.12)`: Filters joystick analog drift.
  - `calculateJogRate(axisDeflection)`: Applies quadratic acceleration curve for precise micro-stepping on soft deflections and high-speed transit on full deflections.
  - `openRemapModal()`: Opens visual remap interface for button and axis reassignment.

### 4.6 4th Axis Rotary (A) & Lathe: `Dev/cle_tools/cle_rotary.js`
- **Role**: Simulates and toolpaths continuous 4th axis rotary operations.
- **Class**: `CLERotaryEngine(bridge)`
- **Key Properties**:
  - `chuckDiameter`: Visual 3-jaw chuck diameter (default $80\,\text{mm}$ or $100\,\text{mm}$).
  - `stockLength`, `stockDiameter`: Visual cylinder stock dimensions.
  - `rotaryGroup`: `THREE.Group` attached to machine bed.
- **Key Methods**:
  - `mountToBed()`: Positions rotary chuck along the left edge of the spoilboard ($X=50\,\text{mm}, Y=250\,\text{mm}, Z=60\,\text{mm}$).
  - `updateAngle(deg)`: Continuously rotates chuck, jaws, and stock cylinder in 3D viewport.
  - `clampWorkpiece(length, diameter)`: Adjusts 3D stock cylinder dimensions and centers on lathe axis.

### 4.7 CLE Design Vault Client: `Dev/cle_tools/cle_vault.js`
- **Role**: Frontend client communicating with `tools/CLE_server.py` to provide version control and profile persistence.
- **Class**: `CLEVault(bridge)`
- **Key Methods**:
  - `saveProject(projectName, cadStateJson, comment)`: Posts project bundle to `/api/vault/save`. Triggers automatic Git commit in `vault/projects/{name}/`.
  - `getProjectHistory(projectName)`: Fetches commit hash, author, timestamp, and message log.
  - `checkoutProjectVersion(projectName, commitHash)`: Restores exact historical project state.
  - `saveControllerProfile(profileName, mapping)`: Saves gamepad mapping to `vault/profiles/`.
  - `saveMachineProfile(machineId, config)`: Saves machine envelope, limits, and bed offsets to `vault/machines/`.

### 4.8 Vellum Vector Studio Bridge: `Dev/cle_tools/cle_vellum.js`
- **Role**: Bi-directional integration bridge between JumpStart 3D and ClassyApps Vellum Vector Studio.
- **Class**: `CLEVellumBridge(bridge)`
- **Key Properties**:
  - `modalEl`: Fullscreen overlay container.
  - `iframeEl`: Embedded iframe hosting `Vellum/index.htm`.
- **Key Methods**:
  - `openVellum()` / `closeVellum()`: Toggles fullscreen Vellum workspace overlay.
  - `initMessageListener()`: Listens for `window.addEventListener('message')` events containing `CLE_VELLUM_EXPORT`.
  - `handleExport(payload)`: Receives vector data from Vellum:
    - **Option 1 (New Sketch)**: Injects 2D curve into JumpStart as an editable sketch on the active plane.
    - **Option 2 (Direct Extrude)**: Invokes JumpStart's CAD kernel to extrude the closed vector boundary into a 3D solid at specified thickness (e.g. $5.0\,\text{mm}$).
    - **Option 3 (Bed Image Overlay)**: Embeds vector silhouette onto the CNC spoilboard table for alignment.

### 4.9 Local Hardware & Git Vault Server: `tools/CLE_server.py`
- **Role**: Python 3 HTTP daemon on `127.0.0.1:8765`. Standard library only (`http.server`, `subprocess`, `json`, `pathlib`).
- **Classes**:
  - `GitVaultEngine`: Automates `git init`, `git add`, `git commit`, `git log`, and `git checkout` inside `vault/projects/{name}/`.
  - `PrusaSlicerEngine`: CLI wrapper executing bundled or system PrusaSlicer binary to export sliced G-code.
  - `CLEVaultHandler(BaseHTTPRequestHandler)`: REST endpoint dispatcher with CORS support.
- **API Endpoints**:
  - `GET /api/status`: Returns server health, active port, and Git binary path.
  - `POST /api/vault/save`: Receives `{ project, json_data, comment }` $\rightarrow$ writes `model.json` $\rightarrow$ Git commit.
  - `GET /api/vault/history?project={name}`: Returns Git commit history array.
  - `POST /api/vault/checkout`: Receives `{ project, hash }` $\rightarrow$ runs `git checkout {hash}` $\rightarrow$ returns restored JSON.
  - `POST /api/profile/save` & `GET /api/profile/list`: Manages gamepad mappings in `vault/profiles/`.
  - `POST /api/machine/save` & `GET /api/machine/list`: Manages machine configurations in `vault/machines/`.
  - `POST /api/slice/prusa`: Accepts STL or geometry payload $\rightarrow$ runs PrusaSlicer CLI $\rightarrow$ returns G-code.

---

## 5. Execution Flow, Lifecycles & Event Architecture

### 5.1 System Initialization Lifecycle

When `Dev/index.htm` is loaded, JSVCLE initializes through 4 deterministic phases:


![dev_lifecycle.svg](diagrams/dev_lifecycle.svg)

```mermaid
sequenceDiagram
    autonumber
    participant DOM as Browser DOM
    participant Boot as cle_boot.js (CLEBridge)
    participant Kernel as JumpStart CAD Kernel (window.app)
    participant Bed as cle_bed.js
    participant Server as CLE_server.py (Port 8765)
    participant Vault as cle_vault.js

    DOM->>Boot: DOMContentLoaded Event Triggered
    Note over Boot: Phase 0: DOM & Styles
    Boot->>DOM: Inject cle_theme.css
    Boot->>DOM: Inject Top Workspace Tabs (CAD | CAM | Laser | Rotary | Slicer | Vellum)
    Boot->>DOM: Inject CLE Control Ribbon

    Note over Boot,Kernel: Phase 1: Subsystem Mounting
    Boot->>Kernel: Poll for window.app / window.xe scene readiness
    Kernel-->>Boot: Three.js Scene, Camera & Renderer Ready
    Boot->>Bed: Initialize BedVisualizer (mountToScene)
    Bed->>Kernel: Add Bed Frame, MDF Spoilboard & Rulers to scene

    Note over Boot,Vault: Phase 2: Vault & Profile Sync
    Boot->>Server: GET /api/status
    Server-->>Boot: 200 OK (Server Active, Git Ready)
    Boot->>Vault: Fetch Active Machine Profile ("FluidNC Standard CNC")
    Vault->>Bed: Set Bed Dimensions (600x500mm, Spoilboard 20mm)

    Note over Boot: Phase 3: Hardware & Telemetry Ready
    Boot->>Boot: Attach Gamepad Listeners & Serial Connection Handlers
    Boot->>DOM: Display "CLE Suite Ready (v01.00.66)" Toast
```


---

### 5.2 Slicer Toolpath Generation & G-Code Export Execution Flow


![dev_slicer_flow.svg](diagrams/dev_slicer_flow.svg)

```mermaid
flowchart TD
    UserSlice["User Clicks 'Slice Active Model'"] --> InspectBody["Inspect JumpStart CAD Bodies in Scene"]
    InspectBody --> DetectType{"Geometry Type?"}

    DetectType -- "3D CAD Solid Mesh" --> CalcBounds["Calculate Bounding Box (X, Y, Zmin, Zmax)"]
    CalcBounds --> PlaneIntersect["Generate Horizontal Slicing Planes at Z Step-Downs"]
    PlaneIntersect --> ContourLoop["Extract Outer & Inner Boundary Loops"]
    ContourLoop --> InfillHatch["Compute Linear / Zig-Zag Infill Paths"]
    InfillHatch --> SpoilboardOvercut["Apply 0.2mm Breakthrough Overcut at Z = 20.10mm"]
    SpoilboardOvercut --> RenderLines["Compile THREE.LineSegments (Cyan=Feed, Red=Rapid)"]
    RenderLines --> AssembleGCode["Assemble ISO G-Code Program (G0, G1, F, S)"]

    DetectType -- "Grayscale 2D Photo" --> GrayscaleFlow["Invoke sliceGrayscaleRelief()"]
    GrayscaleFlow --> RenderLines

    AssembleGCode --> MountHUD["Mount Floating Slicer HUD in Viewport"]
    MountHUD --> ExportChoice{"Export Action?"}
    ExportChoice -- "Download .nc" --> SaveFile["Trigger Browser File Download"]
    ExportChoice -- "Stream to SD" --> FluidNCSD["HTTP / WebSocket Stream to FluidNC SD Card"]
```


---

### 5.3 Grayscale 2D Photo to 3D Continuous Z Relief Carving Flow


![dev_grayscale_flow.svg](diagrams/dev_grayscale_flow.svg)

```mermaid
sequenceDiagram
    autonumber
    actor User as CNC Machinist
    participant UI as cle_boot.js (#cle-r-grayscale)
    participant Slicer as cle_slicer.js
    participant Bed as cle_bed.js
    participant Three as JumpStart Three.js Scene

    User->>UI: Selects Photo & Clicks 'Slice to Continuous Z'
    UI->>Slicer: sliceGrayscaleRelief(imageElement, options)
    Note over Slicer: Step 1: Pixel Luminance Extraction
    Slicer->>Slicer: Draw image onto off-screen 2D Canvas
    Slicer->>Slicer: Read RGBA ImageDataBuffer (W x H pixels)
    Slicer->>Slicer: Compute Luminance: L = 0.299R + 0.587G + 0.114B
    Slicer->>Slicer: Apply Gamma Curve & Invert Map (0.0 to 1.0)

    Note over Slicer: Step 2: 3D Relief Mesh Generation
    Slicer->>Three: Instantiate THREE.PlaneGeometry(width, height, segW, segH)
    Slicer->>Three: Displace Vertices along Z based on Luminance x MaxDepth
    Slicer->>Three: Construct Watertight Base Side Walls & Floor
    Slicer->>Bed: placeWorkpieceOnSpoilboard(reliefMesh)
    Bed->>Three: Set Mesh Position (X=300, Y=250, Z=20.10mm)

    Note over Slicer: Step 3: Continuous Raster Toolpathing
    loop For Each Y Raster Line
        Slicer->>Slicer: Traverse X pixels left-to-right (Zig) / right-to-left (Zag)
        Slicer->>Slicer: Output G1 X... Y... Z... with continuous depth variation
    end
    Slicer->>UI: Mount Slicer HUD & Render 3D Toolpath Overlays
    UI-->>User: Live 3D Simulation Ready
```


---

### 5.4 Hardware Telemetry, Real-Time DRO & Jogging Execution Flow


![dev_telemetry_flow.svg](diagrams/dev_telemetry_flow.svg)

```mermaid
sequenceDiagram
    autonumber
    participant UI as Digital Readout Ribbon & Bed Cursor
    participant Client as cle_fluidnc.js
    participant HW as FluidNC ESP32 Controller

    Note over Client,HW: Periodic Telemetry Loop (Every 100ms)
    loop Every 100ms
        Client->>HW: Send '?' Status Poll Query
        HW-->>Client: Response: <Idle|WPos:150.000,200.000,20.100,0.000|FS:0,0>
        Client->>Client: Parse Coordinates: X=150, Y=200, Z=20.1, A=0
        Client->>UI: Update Ribbon DRO Labels (X: 150.00, Y: 200.00, Z: 20.10)
        Client->>UI: Update 3D Bed Toolhead Position & Cast Spoilboard Shadow
    end

    Note over UI,HW: User Jog Command Execution
    alt User Jogs via Keyboard / Gamepad Stick
        UI->>Client: jog('X', +10.0, 1500)
        Client->>Client: Format non-modal command: $J=G91 G21 X10.0 F1500
        Client->>HW: Transmit Jog String via WebSerial / WebSocket
        HW-->>Client: Response: ok
    else Emergency Stop / Feed Hold
        UI->>Client: feedHold() / emergencyReset()
        Client->>HW: Send Immediate '!' or Ctrl+X (0x18)
        HW-->>Client: Instant Motion Stop & Status: Hold / Alarm
    end
```


---

### 5.5 Job Crash Recovery with Lookback Buffer Execution Flow


![dev_recovery_flow.svg](diagrams/dev_recovery_flow.svg)

```mermaid
flowchart TD
    RunJob["Job Running Toolpath Execution"] --> TrackLine["cle_recovery.js records executed line index N in LocalStorage"]
    TrackLine --> CrashEvent{"Unexpected Power Loss / Disconnect?"}

    CrashEvent -- No --> Finish["Job Finishes Cleanly (M30)"]
    CrashEvent -- Yes --> Reconnect["User Reconnects & Clicks 'Resume Crashed Job'"]

    Reconnect --> QueryVault["Lookup last recorded line index N from LocalStorage"]
    QueryVault --> ApplyLookback["Compute Recovery Line: R = max(0, N - 5)"]
    ApplyLookback --> SafeRetract["Emit G0 Z50 (Safe Retract Clearance)"]
    SafeRetract --> RapidXY["Emit G0 X{R} Y{R} (Rapid to recovery starting point)"]
    RapidXY --> SpindleRestart["Emit M3 S{RPM} & G4 P3.0 (Dwell 3 sec for spindle up-to-speed)"]
    SpindleRestart --> PlungeZ["Emit G1 Z{R} F{PlungeRate}"]
    PlungeZ --> ResumeStream["Stream remaining G-Code lines from index R to end"]
    ResumeStream --> SeamlessCarve["Continuous carving seamlessly resumed without gouging!"]
```


---

### 5.6 CLE Git Vault Project State Snapshot & Restoration Flow


![dev_vault_flow.svg](diagrams/dev_vault_flow.svg)

```mermaid
sequenceDiagram
    autonumber
    actor User as Designer / Engineer
    participant FE as cle_vault.js (Browser)
    participant Server as CLE_server.py (Port 8765)
    participant Git as Git CLI (vault/projects/{name}/)

    User->>FE: Clicks 'Save to Vault' (Project: 'CarvedSign', Comment: 'Add mounting bosses')
    FE->>FE: Serialize JumpStart CAD State to JSON
    FE->>Server: POST /api/vault/save { project: 'CarvedSign', json_data: {...}, comment: '...' }
    Server->>Server: Write model.json to vault/projects/CarvedSign/
    Server->>Git: git init (if repo does not exist)
    Server->>Git: git add model.json
    Server->>Git: git commit -m "Add mounting bosses"
    Git-->>Server: Commit hash 8f3a12b created
    Server-->>FE: 200 OK { success: true, commit: '8f3a12b' }
    FE->>User: Displays animated HUD notice: "Project saved to CLE Git Vault (8f3a12b)"

    Note over User,Git: Version Restoration Workflow
    User->>FE: Opens Vault History & Selects Commit 8f3a12b
    FE->>Server: POST /api/vault/checkout { project: 'CarvedSign', hash: '8f3a12b' }
    Server->>Git: git checkout 8f3a12b
    Server-->>FE: Return historical model.json payload
    FE->>FE: Rehydrate JumpStart 3D CAD document (window.Se)
    FE-->>User: Historical version loaded and rendered in 3D viewport!
```


---

## 6. Window Global Namespaces Reference

| Global Identifier | Providing Module | Description |
|---|---|---|
| `window.CLE` | `Dev/cle_tools/cle_boot.js` | Master singleton instance of `CLEBridge`. Houses references to all sub-engines (`CLE.bed`, `CLE.slicer`, `CLE.fluidnc`, `CLE.rotary`, `CLE.gamepad`, `CLE.vault`, `CLE.vellum`, `CLE.recovery`). |
| `window.app` / `window.xe` | JumpStart CAD Core (`Dev/index.htm`) | Master JumpStart application instance. Manages Three.js scene (`app.scene`), active camera (`app.camera`), renderer, B-Rep bodies, and command stack. |
| `window.Se` | JumpStart CAD Core | CAD document model containing active sketches, parametric features, planes, and solid bodies. |
| `window.Ei` | Vellum Core (`Vellum/index.htm`) | Vellum application instance managing 2D SVG canvas elements, layers, selection sets, and vector export pipelines. |
| `window.Vellum` | Vellum Core | Vellum standalone API namespace for curve generation and laser kerf calculation. |

---

## 7. Glossary of Functions, Classes & Technical Terms

### Technical Classes & Methods

- `CLEBridge`: The central controller class instantiated at `window.CLE`. Aggregates all subsystems and coordinates UI lifecycle.
- `CLEBedVisualizer.mountToScene()`: Binds the CNC table, MDF spoilboard, and millimeter graduation rulers into JumpStart's active Three.js scene hierarchy.
- `CLEBedVisualizer.placeWorkpieceOnSpoilboard(mesh)`: Analyzes the bounding box of a 3D CAD mesh or relief mesh and translates its Z-origin so the bottom rests exactly at $Z = 20.10\,\text{mm}$ (spoilboard surface + safe clearance).
- `CLESlicerEngine.sliceActiveModel()`: Traverses the active solid body, intersects slicing planes along the Z-axis, generates contour boundaries, calculates infill paths, and compiles CNC/laser G-code.
- `CLESlicerEngine.generateLaminatedSlabs(cadMesh)`: Partitions tall CAD models into horizontal $30\,\text{mm}$ slab layers with dowel pin registration holes for laminated acoustic horns.
- `CLEFluidNCClient.jog(axis, distance, feedRate)`: Formats and sends non-modal GRBL jog commands (`$J=G91 G21 ...`) via USB Serial or WebSocket.
- `CLEJobRecoveryEngine.recordExecutedLine(lineNumber, gcodeStr)`: Circular buffer tracking executed toolpath lines in browser local storage.
- `CLEJobRecoveryEngine.resumeAfterCrash()`: Reads crash line index, backs up 5 lines (`-5` lookback), raises spindle to safe Z clearance, moves to XY restart point, spins up spindle, and resumes carving.
- `CLEGamepadEngine.calculateJogRate(axisDeflection)`: Mathematical transfer function applying quadratic scaling $f(x) = \text{sign}(x) \cdot x^2 \cdot V_{\max}$ for smooth jog speed control.
- `GitVaultEngine.ensure_repo(projectDir)`: Backend Python method that validates the presence of `.git` in a project vault directory, initializing an isolated Git repository if absent.
- `CLEVellumBridge.handleExport(payload)`: Message handler parsing vector payloads exported from Vellum Vector Studio into JumpStart CAD geometry.

### Engineering & Domain Terms

- **B-Rep (Boundary Representation)**: The method used by CAD kernels to represent 3D solid objects by their enclosing boundary surfaces (faces, edges, vertices).
- **Continuous Z Relief**: Converting a continuous 2D grayscale image (0–255 pixel intensity) into continuous toolhead depth coordinates for 3D sculptural carving.
- **DRO (Digital Readout)**: Real-time numeric display of the toolhead's current coordinates across X, Y, Z, and A axes in millimeters and degrees.
- **FluidNC**: High-performance, open-source CNC firmware running on ESP32 microcontrollers supporting multi-axis motion, USB serial, and Wi-Fi WebSockets.
- **Laminated Slicing**: Slicing thick or curved objects (such as acoustic loudspeaker horns) into separate wood slab layers that are machined independently and aligned using dowel pins.
- **CLE Git Vault**: An architectural pattern where every machine configuration, tool library change, and CAD model revision is automatically committed to a local, zero-network Git repository.
- **Lookback Buffer (`-5` lines)**: Crash recovery strategy where resume execution starts 5 toolpath lines prior to the recorded crash point, ensuring smooth overlap without leaving uncarved gouges or ridges.
- **Spoilboard**: A sacrificial MDF board mounted to the aluminum CNC bed table, allowing cutting tools to cleanly break through workpieces without damaging the machine frame.
- **WebSerial API**: Modern browser W3C standard allowing web applications to directly read and write to serial COM ports at baud rates up to 115200 without browser plugins.
