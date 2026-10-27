with open('Dev/cle_tools/cle_slicer.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the sliceGrayscaleHeightmap implementation with the comprehensive Grayscale engine
target = '''  // --- Grayscale Heightmap to Slice Conversion (Original CLE Feature) ---
  // Converts 8-bit or 16-bit grayscale images to multi-layer toolpath slices with brightness, contrast, gamma
  async sliceGrayscaleHeightmap(imageSource = null, options = {}) {
    const brightness = options.brightness !== undefined ? options.brightness : 0;
    const contrast = options.contrast !== undefined ? options.contrast : 0;
    const gamma = options.gamma !== undefined ? options.gamma : 1.0;
    const sliceCount = Math.max(2, Math.min(64, options.sliceCount || 16));
    const bitDepth = options.bitDepth === '16bit' ? '16bit' : '8bit';
    const targetW = options.targetWidth || 100.0;
    const targetD = options.targetHeight || 100.0;
    const depthMm = options.depthMm || 4.0;
    const mode = options.mode || this.mode || 'cnc';
    this.mode = mode;

    this.bridge.notify(`Generating ${sliceCount} Grayscale slices (${bitDepth}, ${mode.toUpperCase()})...`, 'info');

    // 1. Render imageSource to offscreen canvas
    const cols = 80;
    const rows = 80;
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');

    if (imageSource instanceof HTMLImageElement || imageSource instanceof HTMLCanvasElement) {
      ctx.drawImage(imageSource, 0, 0, cols, rows);
    } else {
      // Default radial gradient relief pattern for instant visualization
      const grad = ctx.createRadialGradient(cols / 2, rows / 2, 4, cols / 2, rows / 2, cols / 2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#888888');
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cols, rows);
    }

    const imgData = ctx.getImageData(0, 0, cols, rows).data;
    const heightMap = new Float32Array(cols * rows);
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast) || 1);

    for (let i = 0; i < cols * rows; i++) {
      const idx = i * 4;
      let r = imgData[idx];
      let g = imgData[idx + 1];
      let b = imgData[idx + 2];

      let L = 0.299 * r + 0.587 * g + 0.114 * b;
      L = L + (brightness * 2.55);
      L = factor * (L - 128) + 128;
      L = Math.max(0, Math.min(255, L));

      let v = L / 255.0;
      v = Math.pow(v, 1.0 / Math.max(0.1, gamma));

      if (bitDepth === '8bit') {
        v = Math.round(v * 255) / 255.0;
      } else {
        v = Math.round(v * 65535) / 65535.0;
      }
      heightMap[i] = v;
    }

    // 2. Build Slices based on Mode
    this.slicedLayers = [];
    const isTopDown = (mode === 'cnc' || mode === 'laser');
    const xStep = targetW / cols;
    const yStep = targetD / rows;

    for (let s = 0; s < sliceCount; s++) {
      const progress = s / Math.max(1, sliceCount - 1);
      let layerZ;
      if (isTopDown) {
        layerZ = -progress * depthMm;
      } else {
        layerZ = 1.0 + progress * depthMm;
      }

      const layer = {
        index: s,
        z: layerZ,
        toolNumber: s === 0 ? 1 : (s > sliceCount / 2 ? 2 : 1),
        points: []
      };

      for (let r = 0; r < rows; r += 2) {
        const yPos = r * yStep;
        const forward = (r / 2) % 2 === 0;
        const startC = forward ? 0 : cols - 1;
        const endC = forward ? cols : -1;
        const stepC = forward ? 1 : -1;

        let inCut = false;
        for (let c = startC; c !== endC; c += stepC) {
          const val = heightMap[r * cols + c];
          const xPos = c * xStep;

          const shouldCut = isTopDown ? (val >= (1.0 - progress)) : (val >= progress);

          if (shouldCut) {
            if (!inCut) {
              layer.points.push({ x: xPos, y: yPos, z: layerZ, isRapid: true });
              inCut = true;
            }
            layer.points.push({ x: xPos, y: yPos, z: layerZ, isRapid: false });
          } else if (inCut) {
            layer.points.push({ x: xPos, y: yPos, z: layerZ + (isTopDown ? 2.0 : 0.5), isRapid: true });
            inCut = false;
          }
        }
      }

      if (layer.points.length > 1) {
        this.slicedLayers.push(layer);
      }
    }

    // Generate G-code lines for the grayscale slices
    const gcode = [];
    gcode.push(`; === CLEJS Grayscale Slices ===`);
    gcode.push(`; Mode: ${mode.toUpperCase()} | Passes: ${this.slicedLayers.length} | BitDepth: ${bitDepth}`);
    gcode.push(`G21 G90 G17`);
    gcode.push(`G0 Z10.000 F1000`);
    let currentTool = 0;

    for (const l of this.slicedLayers) {
      if (l.toolNumber && l.toolNumber !== currentTool) {
        currentTool = l.toolNumber;
        gcode.push(`; --- Tool Change to Tool #${currentTool} ---`);
        gcode.push(`M5`);
        gcode.push(`G0 Z20.000 F800`);
        gcode.push(`M6 T${currentTool}`);
        gcode.push(mode === 'laser' ? 'M3 S1000' : 'M3 S12000');
        gcode.push(`G4 P2`);
      }
      gcode.push(`; Layer Z = ${l.z.toFixed(3)}`);
      for (const p of l.points) {
        if (p.isRapid) {
          gcode.push(`G0 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} Z${p.z.toFixed(3)} F3000`);
        } else {
          gcode.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} Z${p.z.toFixed(3)} F1200`);
        }
      }
    }
    gcode.push(`M5`);
    gcode.push(`G0 Z20.000 F1000`);
    this.rawGCode = gcode.join('\\n');

    this.renderSlicedStackToVisualizer();
    this.mountLayerHUD();
    this.bridge.notify(`Grayscale Sliced: ${this.slicedLayers.length} passes rendered in 3D visualizer!`, 'ok');
    return this.slicedLayers;
  }'''

replacement = '''  // =========================================================================
  // GRAYSCALE TO 3D RELIEF & CONTINUOUS Z SLICING SUBSYSTEM
  // =========================================================================

  /**
   * Extract and process pixel brightness array from an image source
   */
  async extractHeightmap(imageSource, opts = {}) {
    const cols = opts.cols || 80;
    const rows = opts.rows || 80;
    const brightness = opts.brightness || 0;
    const contrast = opts.contrast || 0;
    const gamma = opts.gamma || 1.0;
    const invert = !!opts.invert;

    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext('2d');

    let imgEl = null;
    if (imageSource instanceof HTMLImageElement || imageSource instanceof HTMLCanvasElement) {
      imgEl = imageSource;
    } else if (typeof imageSource === 'string' && (imageSource.startsWith('data:') || imageSource.startsWith('blob:') || imageSource.startsWith('http') || imageSource.startsWith('.'))) {
      imgEl = await new Promise((resolve, reject) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = imageSource;
      });
    } else {
      // Check if there is an active sketch with an image in JumpStart doc
      const doc = window.Se?.doc || window.app?.doc;
      const skWithImg = doc?.sketches?.find(s => s.image && s.image.src);
      if (skWithImg) {
        imgEl = await new Promise((resolve) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.onload = () => resolve(im);
          im.onerror = () => resolve(null);
          im.src = skWithImg.image.src;
        });
      }
    }

    if (imgEl && imgEl.width > 0 && imgEl.height > 0) {
      ctx.drawImage(imgEl, 0, 0, cols, rows);
    } else {
      // Default radial dome relief pattern
      const grad = ctx.createRadialGradient(cols / 2, rows / 2, 2, cols / 2, rows / 2, cols / 2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.3, '#dddddd');
      grad.addColorStop(0.7, '#666666');
      grad.addColorStop(1, '#000000');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cols, rows);
    }

    const imgData = ctx.getImageData(0, 0, cols, rows).data;
    const heightMap = new Float32Array(cols * rows);
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast) || 1);

    for (let i = 0; i < cols * rows; i++) {
      const idx = i * 4;
      const r = imgData[idx];
      const g = imgData[idx + 1];
      const b = imgData[idx + 2];

      let L = 0.299 * r + 0.587 * g + 0.114 * b;
      L = L + (brightness * 2.55);
      L = factor * (L - 128) + 128;
      L = Math.max(0, Math.min(255, L));

      let v = L / 255.0;
      if (invert) v = 1.0 - v;
      v = Math.pow(Math.max(0, Math.min(1, v)), 1.0 / Math.max(0.1, gamma));
      heightMap[i] = v;
    }

    return { heightMap, cols, rows, aspect: (imgEl && imgEl.height > 0) ? (imgEl.width / imgEl.height) : 1.0 };
  }

  /**
   * Create a 3D solid relief mesh object in the workspace from a 2D grayscale image
   */
  async create3DReliefObjectFromGrayscale(imageSource = null, options = {}) {
    const app = window.app || window.xe;
    const THREE = window.THREE;
    if (!app || !app.vp || !THREE) return null;

    const targetW = options.targetWidth || 100.0;
    const targetH = options.targetHeight || 100.0;
    const depthMm = options.depthMm || 5.0;
    const baseFloorMm = options.baseFloorMm || 2.0;
    const invert = !!options.invert;
    const brightness = options.brightness !== undefined ? options.brightness : 0;
    const contrast = options.contrast !== undefined ? options.contrast : 0;
    const gamma = options.gamma !== undefined ? options.gamma : 1.0;
    const resolution = Math.max(30, Math.min(160, options.resolution || 80));

    this.bridge.notify(`Generating 3D Relief Object (${targetW}x${targetH}mm, Depth: ${depthMm}mm)...`, 'info');

    // 1. Process image pixels into heightmap
    const { heightMap, cols, rows } = await this.extractHeightmap(imageSource, {
      cols: resolution,
      rows: resolution,
      brightness,
      contrast,
      gamma,
      invert
    });

    // 2. Build 3D Watertight Solid Geometry (Relief Top + 4 Side Walls + Flat Bottom)
    const geom = new THREE.BufferGeometry();
    const vertices = [];
    const indices = [];

    const halfW = targetW / 2.0;
    const halfH = targetH / 2.0;
    const xStep = targetW / (cols - 1);
    const yStep = targetH / (rows - 1);

    // Top surface vertices: grid of cols x rows
    for (let r = 0; r < rows; r++) {
      const y = -halfH + r * yStep;
      for (let c = 0; c < cols; c++) {
        const x = -halfW + c * xStep;
        const val = heightMap[r * cols + c];
        const z = baseFloorMm + val * depthMm;
        vertices.push(x, y, z);
      }
    }

    // Top surface grid triangles
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i0 = r * cols + c;
        const i1 = r * cols + (c + 1);
        const i2 = (r + 1) * cols + c;
        const i3 = (r + 1) * cols + (c + 1);
        indices.push(i0, i1, i2);
        indices.push(i1, i3, i2);
      }
    }

    // Bottom surface vertices at Z = 0
    const bottomStartIdx = vertices.length / 3;
    for (let r = 0; r < rows; r++) {
      const y = -halfH + r * yStep;
      for (let c = 0; c < cols; c++) {
        const x = -halfW + c * xStep;
        vertices.push(x, y, 0);
      }
    }

    // Bottom surface triangles (facing downwards)
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const i0 = bottomStartIdx + r * cols + c;
        const i1 = bottomStartIdx + r * cols + (c + 1);
        const i2 = bottomStartIdx + (r + 1) * cols + c;
        const i3 = bottomStartIdx + (r + 1) * cols + (c + 1);
        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    // 4 Skirt side walls connecting top edges to bottom edges
    for (let c = 0; c < cols - 1; c++) {
      const t0 = c, t1 = c + 1;
      const b0 = bottomStartIdx + c, b1 = bottomStartIdx + c + 1;
      indices.push(t0, b0, t1);
      indices.push(t1, b0, b1);
    }
    for (let c = 0; c < cols - 1; c++) {
      const t0 = (rows - 1) * cols + c, t1 = (rows - 1) * cols + c + 1;
      const b0 = bottomStartIdx + (rows - 1) * cols + c, b1 = bottomStartIdx + (rows - 1) * cols + c + 1;
      indices.push(t0, t1, b0);
      indices.push(t1, b1, b0);
    }
    for (let r = 0; r < rows - 1; r++) {
      const t0 = r * cols, t1 = (r + 1) * cols;
      const b0 = bottomStartIdx + r * cols, b1 = bottomStartIdx + (r + 1) * cols;
      indices.push(t0, t1, b0);
      indices.push(t1, b1, b0);
    }
    for (let r = 0; r < rows - 1; r++) {
      const t0 = r * cols + (cols - 1), t1 = (r + 1) * cols + (cols - 1);
      const b0 = bottomStartIdx + r * cols + (cols - 1), b1 = bottomStartIdx + (r + 1) * cols + (cols - 1);
      indices.push(t0, b0, t1);
      indices.push(t1, b0, b1);
    }

    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xd4a373, // Warm maple wood relief
      roughness: 0.55,
      metalness: 0.08,
      side: THREE.DoubleSide
    });

    if (this.reliefMesh) {
      if (this.reliefMesh.parent) this.reliefMesh.parent.remove(this.reliefMesh);
      if (this.reliefMesh.geometry) this.reliefMesh.geometry.dispose();
      if (this.reliefMesh.material) this.reliefMesh.material.dispose();
      this.reliefMesh = null;
    }

    this.reliefMesh = new THREE.Mesh(geom, mat);
    this.reliefMesh.name = 'CLE_Grayscale_3D_Relief_Object';

    const bedCenter = (this.bridge?.vellum && this.bridge.vellum.getBedCenter)
      ? this.bridge.vellum.getBedCenter()
      : { x: 300, y: 250, z: 20.10 };

    this.reliefMesh.position.set(bedCenter.x, bedCenter.y, bedCenter.z);

    const container = app.vp.scene || app.vp.world;
    container.add(this.reliefMesh);

    if (app.vp && app.vp.view) {
      app.vp.view.target.set(bedCenter.x, bedCenter.y, bedCenter.z + (baseFloorMm + depthMm) / 2);
      if (app.vp.updateCamera) app.vp.updateCamera();
    }
    app.vp.dirty = true;
    if (app.vp.request) app.vp.request();

    this.activeGrayscaleImage = imageSource;
    this.activeGrayscaleOptions = options;

    this.bridge.notify(`Created 3D Relief Object (${targetW}x${targetH}x${(baseFloorMm + depthMm).toFixed(1)}mm) at center of bed!`, 'ok');
    return this.reliefMesh;
  }

  /**
   * Slice grayscale heightmap into continuous Z toolpaths
   */
  async sliceGrayscaleHeightmap(imageSource = null, options = {}) {
    const brightness = options.brightness !== undefined ? options.brightness : 0;
    const contrast = options.contrast !== undefined ? options.contrast : 0;
    const gamma = options.gamma !== undefined ? options.gamma : 1.0;
    const sliceCount = Math.max(2, Math.min(128, options.sliceCount || 20));
    const bitDepth = options.bitDepth === '16bit' ? '16bit' : '8bit';
    const targetW = options.targetWidth || 100.0;
    const targetD = options.targetHeight || 100.0;
    const depthMm = options.depthMm || 5.0;
    const baseFloorMm = options.baseFloorMm || 2.0;
    const invert = !!options.invert;
    const strategy = options.strategy || 'continuous'; // 'continuous' or 'waterline'
    const mode = options.mode || this.mode || 'cnc';
    this.mode = mode;

    this.bridge.notify(`Generating ${sliceCount} Grayscale Continuous Z Slices (${mode.toUpperCase()})...`, 'info');

    const resolution = Math.max(40, Math.min(160, options.resolution || 80));
    const { heightMap, cols, rows } = await this.extractHeightmap(imageSource, {
      cols: resolution,
      rows: resolution,
      brightness,
      contrast,
      gamma,
      invert
    });

    const bedCenter = (this.bridge?.vellum && this.bridge.vellum.getBedCenter)
      ? this.bridge.vellum.getBedCenter()
      : { x: 300, y: 250, z: 20.10 };

    const startX = bedCenter.x - targetW / 2.0;
    const startY = bedCenter.y - targetD / 2.0;
    const surfaceZ = bedCenter.z + baseFloorMm + depthMm;
    const xStep = targetW / cols;
    const yStep = targetD / rows;

    this.slicedLayers = [];
    const isTopDown = (mode === 'cnc' || mode === 'laser');

    if (strategy === 'continuous') {
      // Continuous 3D Relief Surface Passes: raster passes with dynamically changing Z
      for (let s = 0; s < sliceCount; s++) {
        const passFraction = (s + 1) / sliceCount;
        const passDepthLimit = depthMm * passFraction;
        const layer = {
          index: s,
          z: surfaceZ - passDepthLimit,
          toolNumber: s === 0 ? 1 : (s >= sliceCount - 2 ? 3 : 1), // Roughing endmill then ballnose
          points: []
        };

        for (let r = 0; r < rows; r++) {
          const yPos = startY + r * yStep;
          const forward = (r % 2 === 0);
          const startC = forward ? 0 : cols - 1;
          const endC = forward ? cols : -1;
          const stepC = forward ? 1 : -1;

          let inPass = false;
          for (let c = startC; c !== endC; c += stepC) {
            const xPos = startX + c * xStep;
            const val = heightMap[r * cols + c];
            // Height depth: 0 is floor, 1 is peak
            const targetZ = surfaceZ - (1.0 - val) * passDepthLimit;

            if (!inPass) {
              layer.points.push({ x: xPos, y: yPos, z: surfaceZ + 3.0, isRapid: true });
              layer.points.push({ x: xPos, y: yPos, z: targetZ, isRapid: false });
              inPass = true;
            } else {
              layer.points.push({ x: xPos, y: yPos, z: targetZ, isRapid: false });
            }
          }
          if (inPass) {
            const lastPt = layer.points[layer.points.length - 1];
            layer.points.push({ x: lastPt.x, y: lastPt.y, z: surfaceZ + 3.0, isRapid: true });
          }
        }

        if (layer.points.length > 1) {
          this.slicedLayers.push(layer);
        }
      }
    } else {
      // Stepped Waterline Roughing Passes
      for (let s = 0; s < sliceCount; s++) {
        const progress = s / Math.max(1, sliceCount - 1);
        const layerZ = surfaceZ - progress * depthMm;
        const layer = {
          index: s,
          z: layerZ,
          toolNumber: s === 0 ? 1 : (s > sliceCount / 2 ? 2 : 1),
          points: []
        };

        for (let r = 0; r < rows; r += 2) {
          const yPos = startY + r * yStep;
          const forward = (r / 2) % 2 === 0;
          const startC = forward ? 0 : cols - 1;
          const endC = forward ? cols : -1;
          const stepC = forward ? 1 : -1;

          let inCut = false;
          for (let c = startC; c !== endC; c += stepC) {
            const val = heightMap[r * cols + c];
            const xPos = startX + c * xStep;
            const shouldCut = (val >= (1.0 - progress));

            if (shouldCut) {
              if (!inCut) {
                layer.points.push({ x: xPos, y: yPos, z: surfaceZ + 2.0, isRapid: true });
                inCut = true;
              }
              layer.points.push({ x: xPos, y: yPos, z: layerZ, isRapid: false });
            } else if (inCut) {
              layer.points.push({ x: xPos, y: yPos, z: surfaceZ + 2.0, isRapid: true });
              inCut = false;
            }
          }
        }

        if (layer.points.length > 1) {
          this.slicedLayers.push(layer);
        }
      }
    }

    // Build Production G-Code
    const feed = options.feedRate || this.feedRate || 1500;
    const rpm = options.spindleRPM || 14000;
    const gcode = [];
    gcode.push(`; === CLEJS Grayscale Continuous Z Slices ===`);
    gcode.push(`; Strategy: ${strategy.toUpperCase()} | Depth: ${depthMm.toFixed(2)}mm | Passes: ${this.slicedLayers.length}`);
    gcode.push(`; Bed Origin: X=${bedCenter.x.toFixed(2)}, Y=${bedCenter.y.toFixed(2)}, Z=${bedCenter.z.toFixed(2)}`);
    gcode.push(`G21 G90 G17`);
    gcode.push(`G0 Z${(surfaceZ + 15.0).toFixed(3)} F1000 ; Safe retract`);
    gcode.push(`M3 S${rpm} ; Spindle ON`);

    let currentTool = 0;
    for (const l of this.slicedLayers) {
      if (l.toolNumber && l.toolNumber !== currentTool) {
        currentTool = l.toolNumber;
        gcode.push(`; --- Tool Change to Tool #${currentTool} ---`);
        gcode.push(`M5`);
        gcode.push(`G0 Z${(surfaceZ + 20.0).toFixed(3)} F1000`);
        gcode.push(`M6 T${currentTool}`);
        gcode.push(`M3 S${rpm}`);
        gcode.push(`G4 P2`);
      }
      gcode.push(`; Layer #${l.index + 1}`);
      for (const p of l.points) {
        if (p.isRapid) {
          gcode.push(`G0 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} Z${p.z.toFixed(3)} F3000`);
        } else {
          gcode.push(`G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)} Z${p.z.toFixed(3)} F${feed}`);
        }
      }
    }

    gcode.push(`M5 ; Spindle OFF`);
    gcode.push(`G0 Z${(surfaceZ + 25.0).toFixed(3)} F1000 ; Safe park`);
    gcode.push(`G0 X0.000 Y0.000 F3000 ; Return home`);
    gcode.push(`M30 ; Program End`);
    this.rawGCode = gcode.join('\\n');

    this.renderSlicedStackToVisualizer();
    this.mountLayerHUD();
    this.bridge.notify(`Grayscale Sliced: ${this.slicedLayers.length} continuous Z passes rendered in 3D visualizer!`, 'ok');
    return this.slicedLayers;
  }'''

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in content:
    content = content.replace(target_crlf, replacement_crlf, 1)
    print("cle_slicer.js patched (CRLF)")
elif target in content:
    content = content.replace(target, replacement, 1)
    print("cle_slicer.js patched (LF)")
else:
    print("Target not found in cle_slicer.js!")

with open('Dev/cle_tools/cle_slicer.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated cle_slicer.js successfully.")

