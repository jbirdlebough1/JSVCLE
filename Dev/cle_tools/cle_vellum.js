/**
 * CLE Vellum Vector Studio Integration Bridge
 * Connects ClassyApps Vellum Vector Studio (2D vector drawing, laser, vinyl, box maker)
 * with JumpStart 3D CAD/CAM workspace.
 */

export class CLEVellumBridge {
  constructor(boot = null) {
    this.boot = boot;
    this.modalEl = null;
    this.iframeEl = null;
    this.isOpen = false;
    this.initMessageListener();
  }

  initMessageListener() {
    window.addEventListener('message', (ev) => {
      if (!ev.data || ev.data.type !== 'CLE_VELLUM_EXPORT') return;
      console.log('[CLE Vellum Bridge] Received export payload from Vellum:', ev.data);
      this.handleExport(ev.data);
    });
  }

  ensureUI() {
    if (this.modalEl) return;

    this.modalEl = document.createElement('div');
    this.modalEl.id = 'cle-vellum-modal';
    this.modalEl.style.cssText = `
      display: none;
      position: fixed;
      inset: 0;
      z-index: 100000;
      background: #0f172a;
      flex-direction: column;
      font-family: var(--f-ui, system-ui, -apple-system, sans-serif);
    `;

    // Header Bar
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      background: #1e293b;
      border-bottom: 1px solid #334155;
      color: #f8fafc;
      user-select: none;
      height: 44px;
      box-sizing: border-box;
    `;

    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <span style="font-weight:800; font-size:15px; color:#38bdf8; display:flex; align-items:center; gap:6px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>
          Vellum Vector Studio
        </span>
        <span style="font-size:12px; color:#94a3b8; border-left:1px solid #475569; padding-left:12px;">
          Vector Shapes &middot; Box Maker &middot; Text &middot; Laser Outlines
        </span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:11px; color:#cbd5e1; background:#0369a1; padding:3px 8px; border-radius:4px; font-weight:600;">
          CLE &middot; JS 3D &middot; VV Unified Suite
        </span>
        <button id="cle-vellum-close-btn" style="
          background: #ef4444;
          color: #ffffff;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        ">
          &times; Return to 3D Viewport
        </button>
      </div>
    `;

    // Iframe container
    const iframeWrap = document.createElement('div');
    iframeWrap.style.cssText = `
      flex: 1;
      position: relative;
      background: #ffffff;
    `;

    this.iframeEl = document.createElement('iframe');
    this.iframeEl.id = 'cle-vellum-iframe';
    this.iframeEl.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border: none;
    `;
    // Try relative path from Dev/
    this.iframeEl.src = '../Vellum/index.htm';

    iframeWrap.appendChild(this.iframeEl);
    this.modalEl.appendChild(header);
    this.modalEl.appendChild(iframeWrap);
    document.body.appendChild(this.modalEl);

    const closeBtn = header.querySelector('#cle-vellum-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }
  }

  open() {
    const activeTab = document.querySelector('.wstabs button[aria-selected="true"]');
    if (activeTab && activeTab.id !== 'ws-vellum') {
      this.returnWorkspace = activeTab.id; // e.g. 'ws-cle' or 'ws-design'
    } else if (!this.returnWorkspace) {
      this.returnWorkspace = 'ws-cle';
    }

    this.ensureUI();
    this.modalEl.style.display = 'flex';
    this.isOpen = true;
    const app = window.app || window.xe;
    if (app && app.setMode) {
      // Keep advanced mode ready
      if (app.mode !== 'advanced') app.setMode('advanced');
    }
  }

  close() {
    if (!this.modalEl) return;
    this.modalEl.style.display = 'none';
    this.isOpen = false;
    const app = window.app || window.xe;

    // Ensure we are in 3D viewport, not inside 2D sketcher
    if (app && app.sketcher && app.sketcher.active && app.exitSketch) {
      app.exitSketch();
    }

    // Return to the workspace where user initiated (CLE or Design)
    const targetWsId = this.returnWorkspace || 'ws-cle';
    const targetTab = document.getElementById(targetWsId);
    const fallbackTab = document.getElementById('ws-cle') || document.getElementById('ws-design');
    if (targetTab) {
      targetTab.click();
    } else if (fallbackTab) {
      fallbackTab.click();
    }

    if (app && app.vp && app.vp.request) {
      app.vp.request();
    }
  }

  /**
   * Parse SVG entities into JumpStart points and curve entities
   */
  parseSvgToEntities(svgStr, rawObjects) {
    const pts = [];
    const ents = [];
    const ptMap = new Map();

    const addPt = (x, y) => {
      const snap = 0.001;
      const k = `${Math.round(x / snap)},${Math.round(y / snap)}`;
      if (ptMap.has(k)) return ptMap.get(k);
      const pid = 'p_' + Math.random().toString(36).substr(2, 8);
      pts.push({ id: pid, x: +x.toFixed(4), y: +y.toFixed(4) });
      ptMap.set(k, pid);
      return pid;
    };

    // First check if rawObjects with segments are available
    if (Array.isArray(rawObjects) && rawObjects.length > 0) {
      // Find bounding box for centering
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      rawObjects.forEach(obj => {
        if (!obj || !Array.isArray(obj.segments)) return;
        obj.segments.forEach(s => {
          if (s.x !== undefined) {
            minX = Math.min(minX, s.x);
            maxX = Math.max(maxX, s.x);
          }
          if (s.y !== undefined) {
            minY = Math.min(minY, s.y);
            maxY = Math.max(maxY, s.y);
          }
        });
      });

      const hasBounds = isFinite(minX) && isFinite(minY);
      const cx = hasBounds ? (minX + maxX) / 2 : 0;
      const cy = hasBounds ? (minY + maxY) / 2 : 0;

      rawObjects.forEach(obj => {
        if (!obj || !Array.isArray(obj.segments) || obj.visible === false) return;
        const segs = obj.segments;
        let curX = 0, curY = 0, startX = 0, startY = 0;

        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          if (s.type === 'M') {
            curX = s.x - cx;
            curY = -(s.y - cy); // Invert SVG Y into CAD standard Y
            startX = curX;
            startY = curY;
          } else if (s.type === 'L') {
            const nextX = s.x - cx;
            const nextY = -(s.y - cy);
            const pA = addPt(curX, curY);
            const pB = addPt(nextX, nextY);
            if (pA !== pB) {
              ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: pA, b: pB });
            }
            curX = nextX;
            curY = nextY;
          } else if (s.type === 'C') {
            // Cubic bezier: sample into 12 segments for smooth CAD curve
            const x0 = curX, y0 = curY;
            const x1 = s.x1 - cx, y1 = -(s.y1 - cy);
            const x2 = s.x2 - cx, y2 = -(s.y2 - cy);
            const x3 = s.x - cx, y3 = -(s.y - cy);
            const STEPS = 12;
            let lastPid = addPt(x0, y0);
            for (let step = 1; step <= STEPS; step++) {
              const t = step / STEPS;
              const u = 1 - t;
              const px = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
              const py = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
              const nextPid = addPt(px, py);
              if (lastPid !== nextPid) {
                ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: lastPid, b: nextPid });
              }
              lastPid = nextPid;
            }
            curX = x3;
            curY = y3;
          } else if (s.type === 'Z' || s.type === 'z') {
            const pA = addPt(curX, curY);
            const pB = addPt(startX, startY);
            if (pA !== pB) {
              ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: pA, b: pB });
            }
            curX = startX;
            curY = startY;
          }
        }
      });

      if (ents.length > 0) {
        return { pts, ents };
      }
    }

    // Fallback: Parse SVG DOM
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgStr, 'image/svg+xml');
      const root = doc.documentElement;
      const viewBox = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
      const cx = (viewBox.length === 4) ? viewBox[0] + viewBox[2] / 2 : 0;
      const cy = (viewBox.length === 4) ? viewBox[1] + viewBox[3] / 2 : 0;

      // Rectangles
      const rects = root.querySelectorAll('rect');
      rects.forEach(r => {
        const x = (parseFloat(r.getAttribute('x')) || 0) - cx;
        const y = -((parseFloat(r.getAttribute('y')) || 0) - cy);
        const w = parseFloat(r.getAttribute('width')) || 0;
        const h = parseFloat(r.getAttribute('height')) || 0;
        if (w > 0 && h > 0) {
          const p1 = addPt(x, y);
          const p2 = addPt(x + w, y);
          const p3 = addPt(x + w, y - h);
          const p4 = addPt(x, y - h);
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: p1, b: p2 });
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: p2, b: p3 });
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: p3, b: p4 });
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'line', a: p4, b: p1 });
        }
      });

      // Circles
      const circles = root.querySelectorAll('circle');
      circles.forEach(c => {
        const x = (parseFloat(c.getAttribute('cx')) || 0) - cx;
        const y = -((parseFloat(c.getAttribute('cy')) || 0) - cy);
        const r = parseFloat(c.getAttribute('r')) || 0;
        if (r > 0) {
          const cp = addPt(x, y);
          ents.push({ id: 'e_' + Math.random().toString(36).substr(2, 8), t: 'circle', c: cp, r });
        }
      });
    } catch (e) {
      console.warn('[CLE Vellum Bridge] SVG parsing error:', e);
    }

    return { pts, ents };
  }

  /**
   * Get machine bed center coordinates dynamically
   * Defaults to TTC6050 (X=300, Y=250, Z=20.10mm on top of spoilboard)
   */
  getBedCenter() {
    let cx = 300;
    let cy = 250;
    let cz = 20.10; // 0.10 bed base + 20.0 spoilboard

    try {
      if (window.CLE) {
        if (window.CLE.machine && window.CLE.machine.travel) {
          const t = window.CLE.machine.travel;
          if (t.x && t.x.max) cx = (t.x.min || 0) + (t.x.max - (t.x.min || 0)) / 2;
          if (t.y && t.y.max) cy = (t.y.min || 0) + (t.y.max - (t.y.min || 0)) / 2;
        }
        if (window.CLE.spoilboard && typeof window.CLE.spoilboard.thickness === 'number') {
          cz = 0.10 + window.CLE.spoilboard.thickness;
        }
      }
    } catch (e) {
      console.warn('[CLE Vellum] error determining bed center:', e);
    }

    return { x: cx, y: cy, z: cz };
  }

  /**
   * Handle incoming Vellum export payload
   */
  handleExport(payload) {
    const { svg, objects, images, mode, thickness, plane, name } = payload;
    const app = window.app || window.xe;
    if (!window.Se || !window.Se.update) {
      console.error('[CLE Vellum Bridge] window.Se document manager not found');
      if (app && app.toast) app.toast('Cannot import: CAD document manager not ready', 'err');
      return;
    }

    const { pts, ents } = this.parseSvgToEntities(svg, objects);
    const hasImages = Array.isArray(images) && images.length > 0;
    const hasVectors = ents.length > 0;

    if (!hasVectors && !hasImages) {
      if (app && app.toast) app.toast('No shapes or images found in Vellum to transfer', 'err');
      return;
    }

    // Determine plane origin at center of machine bed
    const bedCenter = this.getBedCenter();
    let planeDef = { o: [bedCenter.x, bedCenter.y, bedCenter.z], x: [1, 0, 0], n: [0, 0, 1] }; // Default XY Top
    if (plane === 'XZ') {
      planeDef = { o: [bedCenter.x, bedCenter.y, bedCenter.z], x: [1, 0, 0], n: [0, 1, 0] };
    } else if (plane === 'YZ') {
      planeDef = { o: [bedCenter.x, bedCenter.y, bedCenter.z], x: [0, 1, 0], n: [1, 0, 0] };
    }

    const skId = 'sk_' + Date.now();
    const partName = name || (hasVectors ? 'Vellum Vector' : 'Vellum Picture');

    let imagePayload = null;
    if (hasImages) {
      const im = images[0];
      let wMm = im.w || 120;
      let hMm = im.h || 80;
      // Scale down nicely if image is excessively large in pixel units
      if (wMm > 400 || hMm > 400) {
        const factor = 200 / Math.max(wMm, hMm);
        wMm *= factor;
        hMm *= factor;
      }
      imagePayload = {
        src: im.src,
        name: partName,
        w: +wMm.toFixed(2),
        h: +hMm.toFixed(2),
        cx: 0,
        cy: 0,
        rot: im.angle || 0,
        opacity: im.opacity !== undefined ? im.opacity : 0.75
      };
    }

    window.Se.update(doc => {
      const newSketch = {
        id: skId,
        name: partName,
        seq: ++doc.seq,
        plane: planeDef,
        pts: pts,
        ents: ents,
        hidden: false
      };

      if (imagePayload) {
        newSketch.image = imagePayload;
      }

      doc.sketches.push(newSketch);

      if (mode === 'extrude' && hasVectors) {
        // Detect closed profiles using JumpStart's internal profile detector
        let profiles = [];
        if (window.Ei) {
          try {
            const det = window.Ei(newSketch);
            if (Array.isArray(det) && det.length > 0) {
              profiles = det.map(p => ({ key: p.key, pt: p.pt }));
            }
          } catch (err) {
            console.warn('[CLE Vellum] error computing profiles with Ei:', err);
          }
        }
        if (profiles.length === 0) {
          profiles = [{ key: 'p0', pt: [0, 0] }];
        }

        const bodyId = 'b_' + Date.now();
        doc.bodies.push({
          id: bodyId,
          name: partName + ' (3D)',
          seq: ++doc.seq,
          color: '#38bdf8',
          hole: false,
          hidden: false,
          m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          node: {
            t: 'extrude',
            sketch: skId,
            profiles: profiles,
            dist: parseFloat(thickness) || 5.0,
            mode: 'one',
            dist2: 0,
            mods: []
          }
        });
      }
    }, `Import ${partName} from Vellum`);

    this.close();

    // Notify user & trigger scene and bed update
    if (app) {
      if (app.sketcher && app.sketcher.active && app.exitSketch) {
        app.exitSketch();
      }
      if (app.scene && app.scene.refresh) app.scene.refresh();
      if (app.refreshUI) app.refreshUI('change');
      if (app.vp && app.vp.request) app.vp.request();
    }

    if (window.CLE && window.CLE.bed) {
      if (window.CLE.bed.sitWorkpieceOnSpoilboard) window.CLE.bed.sitWorkpieceOnSpoilboard();
      if (window.CLE.bed.fitBedView) window.CLE.bed.fitBedView();
    } else if (app && app.fit) {
      app.fit();
    }

    if (!hasVectors && hasImages) {
      if (app && app.toast) app.toast(`Placed "${partName}" onto center of bed!`, 'ok');
    } else if (mode === 'extrude' && hasVectors) {
      if (app && app.toast) app.toast(`Created 3D Extruded Body "${partName}" (${thickness}mm) at center of bed!`, 'ok');
    } else {
      if (app && app.toast) app.toast(`Imported 2D sketch "${partName}" at center of bed!`, 'ok');
    }
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.CLE = window.CLE || {};
  window.CLE.vellum = new CLEVellumBridge();
}
