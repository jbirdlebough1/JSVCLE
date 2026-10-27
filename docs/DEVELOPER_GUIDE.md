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
4. **Local Hardware & Git Vault Service (`tools/CLE_server.py`)**: A zero-dependency Python 3 HTTP daemon listening on `127.0.0.1:8765` providing MEAGCLE Git snapshotting, controller profile persistence, and PrusaSlicer CLI execution fallback.

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
            VaultFE["cle_vault.js\n(Design Vault Client)"]
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
        FluidNCHW["FluidNC Controller / GRBL ESP32\n(TwoTrees TTC6050 / TTC450)"]
    end

    VellumBridge <-->|Window PostMessage Protocol| VellumCore
    FluidNC <-->|WebSerial USB (115200 baud) or WebSocket| FluidNCHW
    VaultFE <-->|HTTP REST /api/vault/*| Server
    Slicer <-->|HTTP REST /api/slice/prusa| Server
```

---

## 2. Functional Capability Model

JSVCLE operates under a unified functional capability matrix across CAD, CAM, 2D Vector, and CNC control domains:

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
        H6["MEAGCLE Local Git Vault Snapshots"]
    end

    Vector_Domain -->|PostMessage SVG / Profiles| CAD_Domain
    CAD_Domain -->|Three.js Meshes & B-Rep Faces| CAM_Domain
    CAM_Domain -->|G-Code Streams & SD Upload| Hardware_Domain
```

---

## 3. Development Environment & DevInstaller

The JSVCLE build and development infrastructure is designed for zero friction on Windows 11 64-bit developer workstations.

### 3.1 Developer Setup Scripts

#### `tools/DevInstaller.bat` & `tools/DevInstaller.ps1`
Bootstraps a fresh developer workstation by locating and verifying core toolchains:
1. **Node.js (v18+ LTS)**: Validates `node -v` and `npm -v`. Installs required build and testing dependencies (`playwright`, `three`).
2. **Python 3 (3.10+)**: Detects native Python. Installs standard library virtual environment and packages if required.
3. **Git (v2.30+)**: Verifies `git.exe` in `PATH`, verifies repository integrity, and checks local commit branches.
4. **Inno Setup 6 (`ISCC.exe`)**: Queries registry (`HKLM` and `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1`) and default installation directories (`C:\Program Files (x86)\Inno Setup 6\ISCC.exe` and `%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe`).
5. **Playwright Chromium Browsers**: Executes `npx playwright install chromium` for automated headless regression testing.

To bootstrap the developer environment:
```powershell
.\tools\DevInstaller.bat
```

### 3.2 Master Build Pipeline (`build_full_tree.bat` / `Build-FullTree.ps1`)

The master build script automates a 6-stage release pipeline:

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

- **Phase 1: Upstream Sync Check**: Validates that `JSoriginal/` and `VVSource/` tracking folders match upstream repositories and logs hash deltas into `upstream-reports/`.
- **Phase 2: Bundle Compilation**: Executes `python tools/bundle_cle.py` to aggregate all modular ES6 modules in `Dev/cle_tools/` into `cle_bundle.js` for standalone distributions.
- **Phase 3: Core Diagnostics**: Runs `bash tools/test_build.sh` to verify syntax of all JavaScript, HTML, and Python files.
- **Phase 4: Headless E2E Regression**: Spins up temporary HTTP server and runs Playwright Chromium tests validating:
  - JumpStart DOM loading and Three.js scene creation.
  - Spoilboard table mesh generation and workpiece seating.
  - Slicer toolpath generation and G-code preview.
  - Vellum iframe PostMessage bi-directional communication.
  - Grayscale 3D relief mesh generation and plane alignment.
- **Phase 5: Remote Validation**: Inspects git remotes and verifies staging hygiene.
- **Phase 6: Inno Setup Packaging**: Invokes `ISCC.exe installer/cle_setup.iss` with LZMA2/Ultra64 solid compression.

---

## 4. File-by-File Breakdown & Module Reference

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
  - `config.travelX`, `config.travelY`, `config.travelZ`: Active machine envelope dimensions.
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

### 4.7 MEAGCLE Design Vault Client: `Dev/cle_tools/cle_vault.js`
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
    Boot->>Vault: Fetch Active Machine Profile ("TwoTrees TTC6050")
    Vault->>Bed: Set Bed Dimensions (600x500mm, Spoilboard 20mm)

    Note over Boot: Phase 3: Hardware & Telemetry Ready
    Boot->>Boot: Attach Gamepad Listeners & Serial Connection Handlers
    Boot->>DOM: Display "CLE Suite Ready (v01.00.66)" Toast
```

### 5.2 Window Global Namespaces Reference

| Global Identifier | Providing Module | Description |
|---|---|---|
| `window.CLE` | `Dev/cle_tools/cle_boot.js` | Master singleton instance of `CLEBridge`. Houses references to all sub-engines (`CLE.bed`, `CLE.slicer`, `CLE.fluidnc`, `CLE.rotary`, `CLE.gamepad`, `CLE.vault`, `CLE.vellum`, `CLE.recovery`). |
| `window.app` / `window.xe` | JumpStart CAD Core (`Dev/index.htm`) | Master JumpStart application instance. Manages Three.js scene (`app.scene`), active camera (`app.camera`), renderer, B-Rep bodies, and command stack. |
| `window.Se` | JumpStart CAD Core | CAD document model containing active sketches, parametric features, planes, and solid bodies. |
| `window.Ei` | Vellum Core (`Vellum/index.htm`) | Vellum application instance managing 2D SVG canvas elements, layers, selection sets, and vector export pipelines. |
| `window.Vellum` | Vellum Core | Vellum standalone API namespace for curve generation and laser kerf calculation. |

### 5.3 Cross-Frame PostMessage Communication Protocol

When Vellum Vector Studio interacts with JumpStart CAD, communication occurs via the HTML5 PostMessage API:

```mermaid
sequenceDiagram
    autonumber
    participant Vellum as Vellum Iframe (Vellum/index.htm)
    participant Bridge as cle_vellum.js (JumpStart Parent)
    participant JSKernel as JumpStart CAD Engine

    Vellum->>Bridge: window.parent.postMessage({ type: 'CLE_VELLUM_EXPORT', mode: 'extrude', svgData: '<svg...>...</svg>', thickness: 5.0 }, '*')
    Bridge->>Bridge: Validate origin & payload structure
    alt mode == 'extrude'
        Bridge->>JSKernel: Parse SVG Path into THREE.Shape
        Bridge->>JSKernel: Execute Direct Extrude (height: 5.0mm)
        Bridge->>JSKernel: Seat Solid Body onto Spoilboard (Z = 20.10mm)
    else mode == 'sketch'
        Bridge->>JSKernel: Convert SVG Beziers into CAD Sketch Points & Curves
        Bridge->>JSKernel: Append Sketch to active plane in window.Se
    else mode == 'bed_overlay'
        Bridge->>JSKernel: Create Canvas Texture and map to spoilboard surface plane
    end
    Bridge->>Bridge: Close Vellum Modal & Focus 3D Viewport
```

---

## 6. Glossary of Functions, Classes & Technical Terms

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
- **MEAGCLE Git Vault**: An architectural pattern where every machine configuration, tool library change, and CAD model revision is automatically committed to a local, zero-network Git repository.
- **Lookback Buffer (`-5` lines)**: Crash recovery strategy where resume execution starts 5 toolpath lines prior to the recorded crash point, ensuring smooth overlap without leaving uncarved gouges or ridges.
- **Spoilboard**: A sacrificial MDF board mounted to the aluminum CNC bed table, allowing cutting tools to cleanly break through workpieces without damaging the machine frame.
- **WebSerial API**: Modern browser W3C standard allowing web applications to directly read and write to serial COM ports at baud rates up to 115200 without browser plugins.

