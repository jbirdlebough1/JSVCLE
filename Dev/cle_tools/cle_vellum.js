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
    const wsTab = document.getElementById('ws-vellum');
    if (wsTab && wsTab.getAttribute('aria-selected') === 'true') {
      const wsCle = document.getElementById('ws-cle');
      const wsDesign = document.getElementById('ws-design');
      if (wsCle) wsCle.click();
      else if (wsDesign) wsDesign.click();
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
   * Handle incoming Vellum export payload
   */
  handleExport(payload) {
    const { svg, objects, mode, thickness, plane, name } = payload;
    const app = window.app || window.xe;
    if (!window.Se || !window.Se.update) {
      console.error('[CLE Vellum Bridge] window.Se document manager not found');
      if (app && app.toast) app.toast('Cannot import: CAD document manager not ready', 'err');
      return;
    }

    const { pts, ents } = this.parseSvgToEntities(svg, objects);
    if (!ents.length) {
      if (app && app.toast) app.toast('No vector shapes found to export', 'err');
      return;
    }

    // Plane definitions
    let planeDef = { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }; // Default XY Top
    if (plane === 'XZ') {
      planeDef = { o: [0, 0, 0], x: [1, 0, 0], n: [0, 1, 0] };
    } else if (plane === 'YZ') {
      planeDef = { o: [0, 0, 0], x: [0, 1, 0], n: [1, 0, 0] };
    }

    const skId = 'sk_' + Date.now();
    const partName = name || 'Vellum Vector';

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
      doc.sketches.push(newSketch);

      if (mode === 'extrude') {
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
            profiles: [{ key: 'p0', pt: [0, 0] }],
            dist: parseFloat(thickness) || 5.0,
            mode: 'one',
            dist2: 0,
            mods: []
          }
        });
      }
    }, `Import ${partName} from Vellum`);

    this.close();

    // Notify user & trigger scene update
    if (app) {
      if (app.scene && app.scene.refresh) app.scene.refresh();
      if (app.refreshUI) app.refreshUI('change');
      if (app.vp && app.vp.request) app.vp.request();
      if (app.fit) app.fit();

      if (mode === 'extrude') {
        if (app.toast) app.toast(`Created 3D Extruded Body "${partName}" (${thickness}mm) from Vellum!`, 'ok');
      } else {
        if (app.enterSketch) app.enterSketch(skId);
        if (app.toast) app.toast(`Imported "${partName}" as 2D editable sketch on ${plane} plane!`, 'ok');
      }
    }
  }
}

// Global initialization
if (typeof window !== 'undefined') {
  window.CLE = window.CLE || {};
  window.CLE.vellum = new CLEVellumBridge();
}
