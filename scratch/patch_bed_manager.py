import sys
sys.stdout.reconfigure(encoding="utf-8")

# Read cle_bed.js
with open("Dev/cle_tools/cle_bed.js", "r", encoding="utf-8") as f:
    bed_code = f.read()

# Add object manager and bed interaction methods right before `rebuild() {`
target = "  // Full Rebuild when Machine Profile or Spoilboard Size is changed in Vault"

bed_methods = '''  // ==========================================
  // Bed Object Management & Interactive Placement
  // ==========================================

  getBedObjects() {
    const objects = [];
    const app = window.app || window.xe;
    const doc = window.Se?.doc || app?.scene?.doc || app?.doc;

    // 1. Sketches & Imported Photos/Images
    if (doc && Array.isArray(doc.sketches)) {
      doc.sketches.forEach(s => {
        if (s.hidden) return;
        const isImage = !!(s.image && s.image.src);
        const ox = s.plane?.o?.[0] !== undefined ? s.plane.o[0] : 300.0;
        const oy = s.plane?.o?.[1] !== undefined ? s.plane.o[1] : 250.0;
        const oz = s.plane?.o?.[2] !== undefined ? s.plane.o[2] : 20.10;
        objects.push({
          type: isImage ? 'photo' : 'sketch',
          id: s.id,
          name: s.name || (isImage ? 'Photo Image' : 'Sketch'),
          isImage,
          imageSrc: s.image?.src || null,
          w: isImage ? (s.image.w || 100.0) : 100.0,
          h: isImage ? (s.image.h || 100.0) : 100.0,
          x: ox,
          y: oy,
          z: oz,
          raw: s
        });
      });
    }

    // 2. 3D CAD Bodies
    if (doc && Array.isArray(doc.bodies)) {
      doc.bodies.forEach(b => {
        if (b.hidden || b.hole) return;
        let bx = 300.0, by = 250.0, bz = 20.10;
        if (b.m && b.m.length >= 16) {
          bx = b.m[12];
          by = b.m[13];
          bz = b.m[14];
        }
        objects.push({
          type: 'body',
          id: b.id,
          name: b.name || '3D Body',
          isImage: false,
          imageSrc: null,
          w: 60.0,
          h: 60.0,
          x: bx,
          y: by,
          z: bz,
          raw: b
        });
      });
    }

    // 3. Grayscale 3D Relief Mesh
    if (this.bridge?.slicer?.reliefMesh) {
      const rm = this.bridge.slicer.reliefMesh;
      objects.push({
        type: 'relief',
        id: 'cle_relief_mesh',
        name: '3D Grayscale Relief Mesh',
        isImage: false,
        imageSrc: null,
        w: this.bridge.slicer.activeGrayscaleOptions?.targetWidth || 100.0,
        h: this.bridge.slicer.activeGrayscaleOptions?.targetHeight || 100.0,
        x: rm.position.x,
        y: rm.position.y,
        z: rm.position.z,
        raw: rm
      });
    }

    return objects;
  }

  selectBedObject(type, id) {
    const objs = this.getBedObjects();
    const found = objs.find(o => o.type === type && o.id === id);
    if (!found) return;

    this.selectedObject = found;
    const app = window.app || window.xe;

    if (type === 'body' && app && app.select) {
      app.select([id]);
    }

    this.renderSelectionOutline(found);
    this.mountBedHUD(found);
    this.bridge.notify(`Selected: ${found.name} (X=${found.x.toFixed(1)}, Y=${found.y.toFixed(1)})`, 'info');
  }

  deselectBedObject() {
    this.selectedObject = null;
    if (this._selBoxMesh && this._selBoxMesh.parent) {
      this._selBoxMesh.parent.remove(this._selBoxMesh);
      this._selBoxMesh = null;
    }
    const hud = document.getElementById('cle-bed-pos-hud');
    if (hud) hud.remove();
    this.requestRender();
  }

  renderSelectionOutline(obj) {
    const THREE = window.THREE;
    if (!THREE || !this.bedGroup) return;

    if (this._selBoxMesh && this._selBoxMesh.parent) {
      this._selBoxMesh.parent.remove(this._selBoxMesh);
      this._selBoxMesh = null;
    }

    const w = obj.w || 80.0;
    const h = obj.h || 80.0;
    const halfW = w / 2 + 3.0;
    const halfH = h / 2 + 3.0;
    const z = (this.config.spoilboardThickness || 20.0) + 0.35; // Hover just above spoilboard

    const pts = [
      new THREE.Vector3(-halfW, -halfH, 0),
      new THREE.Vector3(halfW, -halfH, 0),
      new THREE.Vector3(halfW, halfH, 0),
      new THREE.Vector3(-halfW, halfH, 0),
      new THREE.Vector3(-halfW, -halfH, 0)
    ];

    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0x00f0ff, // Luminous neon cyan selection ring
      linewidth: 3,
      depthTest: false
    });

    this._selBoxMesh = new THREE.Line(geo, mat);
    this._selBoxMesh.name = 'CLE_Bed_Selection_Outline';
    this._selBoxMesh.position.set(obj.x, obj.y, z);
    this.bedGroup.add(this._selBoxMesh);
    this.requestRender();
  }

  moveBedObject(type, id, newX, newY, newZ) {
    const app = window.app || window.xe;
    const zVal = newZ !== undefined ? newZ : (this.config.spoilboardThickness || 20.0) + 0.10;

    if (type === 'photo' || type === 'sketch') {
      if (window.Se && window.Se.update) {
        window.Se.update(doc => {
          const sk = doc.sketches.find(s => s.id === id);
          if (sk && sk.plane) {
            sk.plane.o[0] = newX;
            sk.plane.o[1] = newY;
            sk.plane.o[2] = zVal;
          }
        }, 'Move Sketch on Bed');
      }
    } else if (type === 'body') {
      if (window.Se && window.Se.update) {
        window.Se.update(doc => {
          const b = doc.bodies.find(x => x.id === id);
          if (b && b.m) {
            b.m[12] = newX;
            b.m[13] = newY;
            b.m[14] = zVal;
          }
        }, 'Move Body on Bed');
      }
    } else if (type === 'relief') {
      if (this.bridge?.slicer?.reliefMesh) {
        this.bridge.slicer.reliefMesh.position.set(newX, newY, zVal);
      }
    }

    if (this.selectedObject && this.selectedObject.id === id) {
      this.selectedObject.x = newX;
      this.selectedObject.y = newY;
      this.selectedObject.z = zVal;
      if (this._selBoxMesh) {
        this._selBoxMesh.position.set(newX, newY, zVal + 0.25);
      }
      this.updateBedHUDValues(newX, newY);
    }

    if (app && app.scene && app.scene.refresh) app.scene.refresh();
    this.requestRender();
  }

  mountBedHUD(obj) {
    let hud = document.getElementById('cle-bed-pos-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'cle-bed-pos-hud';
      hud.style.cssText = `
        position: absolute;
        bottom: 24px;
        left: 20px;
        z-index: 1000;
        background: var(--paper, #1e1e24);
        border: 1px solid var(--accent, #00f0ff);
        border-radius: 8px;
        padding: 10px 14px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.45);
        font-family: var(--f-ui, sans-serif);
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 280px;
      `;
      const container = document.getElementById('viewport') || document.body;
      container.appendChild(hud);
    }

    const icon = obj.isImage ? '🖼️' : (obj.type === 'body' ? '📦' : '🏔️');
    hud.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
        <span style="font-weight:700; font-size:12px; color:var(--ink, #fff); display:flex; align-items:center; gap:6px;">
          <span>${icon}</span>
          <span style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${obj.name}</span>
        </span>
        <button id="cle-hud-close" style="background:none; border:none; cursor:pointer; color:var(--ink-2, #888); font-size:14px; padding:0 4px;">✕</button>
      </div>

      <div style="display:flex; gap:10px; align-items:center;">
        <div style="display:flex; align-items:center; gap:4px;">
          <label style="font-size:11px; font-weight:700; color:var(--ink, #fff);">X:</label>
          <input id="cle-hud-inp-x" class="cle-input" type="number" step="1.0" value="${obj.x.toFixed(1)}" style="width:70px; padding:3px 6px; font-size:11px; font-family:var(--f-mono);">
        </div>
        <div style="display:flex; align-items:center; gap:4px;">
          <label style="font-size:11px; font-weight:700; color:var(--ink, #fff);">Y:</label>
          <input id="cle-hud-inp-y" class="cle-input" type="number" step="1.0" value="${obj.y.toFixed(1)}" style="width:70px; padding:3px 6px; font-size:11px; font-family:var(--f-mono);">
        </div>
        <span style="font-size:11px; color:var(--ink-2, #888);">mm</span>
      </div>

      <div style="display:flex; gap:6px; margin-top:2px;">
        <button id="cle-hud-center-btn" class="cle-btn" style="padding:4px 8px; font-size:11px;" title="Center on Spoilboard Bed (X=300, Y=250)">🎯 Center</button>
        <button id="cle-hud-zero-btn" class="cle-btn" style="padding:4px 8px; font-size:11px;" title="Move to Work Zero (X=50, Y=50)">📐 Zero</button>
        <button id="cle-hud-slice-btn" class="cle-btn" style="padding:4px 10px; font-size:11px; background:var(--accent, #00f0ff); color:var(--on-accent, #000); font-weight:700; margin-left:auto;">⚡ Slice</button>
      </div>
    `;

    // Hook listeners
    const inX = hud.querySelector('#cle-hud-inp-x');
    const inY = hud.querySelector('#cle-hud-inp-y');

    const updateFromInputs = () => {
      const nx = parseFloat(inX.value) || 0;
      const ny = parseFloat(inY.value) || 0;
      this.moveBedObject(obj.type, obj.id, nx, ny);
    };

    inX.onchange = updateFromInputs;
    inY.onchange = updateFromInputs;

    hud.querySelector('#cle-hud-close').onclick = () => this.deselectBedObject();

    hud.querySelector('#cle-hud-center-btn').onclick = () => {
      const center = this.bridge?.vellum?.getBedCenter ? this.bridge.vellum.getBedCenter() : { x: 300, y: 250, z: 20.10 };
      inX.value = center.x.toFixed(1);
      inY.value = center.y.toFixed(1);
      this.moveBedObject(obj.type, obj.id, center.x, center.y);
    };

    hud.querySelector('#cle-hud-zero-btn').onclick = () => {
      inX.value = '50.0';
      inY.value = '50.0';
      this.moveBedObject(obj.type, obj.id, 50.0, 50.0);
    };

    hud.querySelector('#cle-hud-slice-btn').onclick = () => {
      if (obj.isImage) {
        this.bridge.openModal('grayscale');
      } else {
        this.bridge.openModal('slicer');
      }
    };
  }

  updateBedHUDValues(x, y) {
    const inX = document.getElementById('cle-hud-inp-x');
    const inY = document.getElementById('cle-hud-inp-y');
    if (inX) inX.value = x.toFixed(1);
    if (inY) inY.value = y.toFixed(1);
  }

  bindBedInteraction() {
    if (this._boundInteraction) return;
    const app = window.app || window.xe;
    const canvas = app?.vp?.canvas;
    if (!canvas) return;

    this._boundInteraction = true;
    let isMouseDown = false;
    let dragTarget = null;
    let dragPlaneZ = (this.config.spoilboardThickness || 20.0) + 0.10;
    let startX = 0, startY = 0;
    let objStartX = 0, objStartY = 0;
    let didMove = false;

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // Left click only
      const THREE = window.THREE;
      if (!THREE || !app.vp || !app.vp.camera) return;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, app.vp.camera);

      // Collect interactive candidate meshes
      const targets = [];
      const meshMap = new Map();

      // Relief mesh
      if (this.bridge?.slicer?.reliefMesh) {
        targets.push(this.bridge.slicer.reliefMesh);
        meshMap.set(this.bridge.slicer.reliefMesh, { type: 'relief', id: 'cle_relief_mesh' });
      }

      // Sketches & sketch images
      if (app.scene?.sketchRoot) {
        app.scene.sketchRoot.updateMatrixWorld(true);
        app.scene.sketchRoot.traverse(child => {
          if (child.isMesh) {
            let cur = child;
            let skId = null;
            while (cur && !skId) {
                if (cur.userData && cur.userData.sketch) skId = cur.userData.sketch;
                cur = cur.parent;
            }
            if (skId) {
              targets.push(child);
              meshMap.set(child, { type: 'sketch', id: skId });
            }
          }
        });
      }

      // 3D Bodies
      if (app.scene?.bodyRoot) {
        app.scene.bodyRoot.updateMatrixWorld(true);
        app.scene.bodyRoot.traverse(child => {
          if (child.isMesh && child.userData?.base?.body?.id) {
            targets.push(child);
            meshMap.set(child, { type: 'body', id: child.userData.base.body.id });
          }
        });
      }

      const hits = raycaster.intersectObjects(targets, false);
      if (hits.length > 0) {
        const hit = hits[0];
        const match = meshMap.get(hit.object);
        if (match) {
          const objs = this.getBedObjects();
          const obj = objs.find(o => o.id === match.id);
          if (obj) {
            this.selectBedObject(obj.type, obj.id);
            isMouseDown = true;
            dragTarget = obj;
            startX = e.clientX;
            startY = e.clientY;
            objStartX = obj.x;
            objStartY = obj.y;
            didMove = false;
          }
        }
      }
    }, { capture: true });

    window.addEventListener('pointermove', (e) => {
      if (!isMouseDown || !dragTarget) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) > 4) didMove = true;

      // Project onto spoilboard table plane
      const THREE = window.THREE;
      if (!THREE || !app.vp || !app.vp.camera) return;

      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, app.vp.camera);

      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -dragPlaneZ);
      const intersection = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, intersection)) {
        // Clamp to machine bed travel limits
        const minX = 10, maxX = this.config.travelX - 10;
        const minY = 10, maxY = this.config.travelY - 10;
        const targetX = Math.max(minX, Math.min(maxX, +intersection.x.toFixed(1)));
        const targetY = Math.max(minY, Math.min(maxY, +intersection.y.toFixed(1)));

        this.moveBedObject(dragTarget.type, dragTarget.id, targetX, targetY);
      }
    });

    window.addEventListener('pointerup', () => {
      if (isMouseDown && dragTarget && didMove) {
        this.bridge.notify(`Positioned ${dragTarget.name} at X=${dragTarget.x.toFixed(1)}, Y=${dragTarget.y.toFixed(1)}mm`, 'ok');
      }
      isMouseDown = false;
      dragTarget = null;
    });
  }

'''

if target not in bed_code:
    print("ERROR: target not found in cle_bed.js")
    sys.exit(1)

bed_code = bed_code.replace(target, bed_methods + "\n" + target, 1)

# Also ensure bindBedInteraction() is called inside mountToScene()
mount_target = "this.fitBedView();"
mount_call = "this.fitBedView();\n    this.bindBedInteraction();"
bed_code = bed_code.replace(mount_target, mount_call, 1)

with open("Dev/cle_tools/cle_bed.js", "w", encoding="utf-8") as f:
    f.write(bed_code)

print("Updated cle_bed.js successfully!")
