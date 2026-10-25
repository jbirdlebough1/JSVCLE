/**
 * CLEJS - Slicer Integration Subsystem
 * Native Three.js geometry extraction, continuous canvas slicing, and PrusaSlicer CLI bridge
 */

export class CLESlicerEngine {
  constructor(bridge) {
    this.bridge = bridge;
    this.serverUrl = 'http://127.0.0.1:8765';
    this.layerHeight = 0.2;
    this.infillPercent = 20;
    this.nozzleDiameter = 0.4;
  }

  // Extracts active CAD geometry as an ASCII/Binary STL from JumpStart's Three.js scene
  getActiveBodySTL() {
    const app = window.app || window.xe;
    if (!app) throw new Error('JumpStart app instance not ready.');

    // Look for bodies in the document
    const bodies = app.doc?.bodies || [];
    if (bodies.length === 0) {
      throw new Error('No 3D bodies found in JumpStart scene to slice.');
    }

    // Use Chisel bridge or scene view mesh if available
    let allTriangles = null;
    if (window.__JS3D_CHISEL__ && bodies[0]) {
      allTriangles = window.__JS3D_CHISEL__.bodyTris(bodies[0].id);
    }

    if (!allTriangles || allTriangles.length === 0) {
      throw new Error('Could not extract mesh triangles for the active body.');
    }

    return this.trianglesToSTL(allTriangles);
  }

  trianglesToSTL(triangles) {
    // Generates ASCII STL string from Float32Array of vertices [x0, y0, z0, x1, y1, z1, x2, y2, z2, ...]
    let stl = 'solid CLEJS_Model\n';
    const numTriangles = triangles.length / 9;

    for (let i = 0; i < numTriangles; i++) {
      const idx = i * 9;
      const ax = triangles[idx], ay = triangles[idx + 1], az = triangles[idx + 2];
      const bx = triangles[idx + 3], by = triangles[idx + 4], bz = triangles[idx + 5];
      const cx = triangles[idx + 6], cy = triangles[idx + 7], cz = triangles[idx + 8];

      // Calculate face normal
      const u1 = bx - ax, u2 = by - ay, u3 = bz - az;
      const v1 = cx - ax, v2 = cy - ay, v3 = cz - az;
      const nx = u2 * v3 - u3 * v2;
      const ny = u3 * v1 - u1 * v3;
      const nz = u1 * v2 - u2 * v1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

      stl += `  facet normal ${nx / len} ${ny / len} ${nz / len}\n`;
      stl += '    outer loop\n';
      stl += `      vertex ${ax} ${ay} ${az}\n`;
      stl += `      vertex ${bx} ${by} ${bz}\n`;
      stl += `      vertex ${cx} ${cy} ${cz}\n`;
      stl += '    endloop\n';
      stl += '  endfacet\n';
    }
    stl += 'endsolid CLEJS_Model\n';
    return stl;
  }

  // Sends STL to local CLE_server.py to execute PrusaSlicer CLI on CL3
  async sliceWithPrusaCLI(stlString, profileOptions = {}) {
    this.bridge.notify('Invoking PrusaSlicer CLI locally on CL3...', 'ok');
    try {
      const resp = await fetch(`${this.serverUrl}/api/slice/prusa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stl: stlString,
          options: {
            layerHeight: this.layerHeight,
            infill: this.infillPercent,
            ...profileOptions
          }
        })
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `Server responded with ${resp.status}`);
      }

      const data = await resp.json();
      this.bridge.notify(`PrusaSlicer CLI complete! (${data.lineCount} lines generated)`, 'ok');
      return data.gcode;
    } catch (err) {
      console.error('[CLE Slicer] Prusa CLI failed:', err);
      this.bridge.notify(`PrusaSlicer CLI error: ${err.message}`, 'error');
      throw err;
    }
  }
}

