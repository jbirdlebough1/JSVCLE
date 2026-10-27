with open('Vellum/index.htm', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Expose window.Vellum before })();\n</script>
target1 = '''  } else { try{ localStorage.removeItem(BACKUP_STORE_KEY); }catch(e){} }
}, 600);


})();
</script>'''

replacement1 = '''  } else { try{ localStorage.removeItem(BACKUP_STORE_KEY); }catch(e){} }
}, 600);

  // Expose Vellum interface globally for JumpStart / CLE integration
  window.Vellum = {
    get state() { return state; },
    get PAGE() { return PAGE; },
    get objects() { return state.objects; },
    objBBox,
    unionBBox,
    exportSVG,
    async getExportSvg() {
      if (typeof ensureTextFontsLoaded === 'function') await ensureTextFontsLoaded();
      const bboxes = state.objects.map(objBBox);
      const bb = bboxes.length ? unionBBox(bboxes) : { x: PAGE.x, y: PAGE.y, w: PAGE.w, h: PAGE.h };
      const pad = 0;
      const vb = `${bb.x} ${bb.y} ${bb.w} ${bb.h}`;
      let body = '';
      const defs = []; const idCounter = { n: 1 };
      for (const o of state.objects) {
        if (o.visible === false) continue;
        if (o.type === 'image') {
          const rot = o.angle ? ` transform="rotate(${o.angle} ${o.x + o.w / 2} ${o.y + o.h / 2})"` : '';
          body += `<image x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" opacity="${o.opacity === undefined ? 1 : o.opacity}" href="${o.src}"${rot}/>\n`;
        } else if (o.type === 'text') {
          const fillAttr = o.fill && o.fill !== 'none' ? svgFillAttr(o.fill, defs, idCounter) : 'none';
          const hasStroke = o.stroke && o.stroke !== 'none' && o.strokeWidth > 0;
          const strokeAttrs = hasStroke ? ` stroke="${o.stroke}" stroke-width="${svgStrokeW(o)}"` : '';
          body += svgPlainTextBlock(o, fillAttr, strokeAttrs);
        } else {
          const d = segmentsToPathD(o.segments);
          const fillAttr = svgFillAttr(o.fill, defs, idCounter, o);
          body += `<path d="${d}" fill="${fillAttr}" stroke="${o.stroke === 'none' ? 'none' : o.stroke}" stroke-width="${svgStrokeW(o)}"/>\n`;
        }
      }
      return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${bb.w}" height="${bb.h}">\n${defs.length ? '<defs>' + defs.join('\\n') + '</defs>\\n' : ''}${body}</svg>`;
    }
  };

})();
</script>'''

target1_crlf = target1.replace('\n', '\r\n')
replacement1_crlf = replacement1.replace('\n', '\r\n')

if target1_crlf in content:
    content = content.replace(target1_crlf, replacement1_crlf, 1)
    print("Expose window.Vellum patched (CRLF)")
elif target1 in content:
    content = content.replace(target1, replacement1, 1)
    print("Expose window.Vellum patched (LF)")
else:
    print("Target 1 not found!")

# 2. Update openModal and confirmBtn in Bridge script
target2 = '''    function openModal() {
      if (!modal) return;
      const objs = (typeof state !== 'undefined' && state.objects) ? state.objects : [];
      const hasVectors = objs.some(o => o.visible !== false && o.type !== 'image' && o.segments && o.segments.length > 0);
      const hasImages = objs.some(o => o.visible !== false && o.type === 'image');'''

replacement2 = '''    function openModal() {
      if (!modal) return;
      const objs = (window.Vellum && window.Vellum.objects) || (typeof state !== 'undefined' && state.objects) || [];
      const hasVectors = objs.some(o => o.visible !== false && o.type !== 'image' && o.segments && o.segments.length > 0);
      const hasImages = objs.some(o => o.visible !== false && o.type === 'image');'''

target2_crlf = target2.replace('\n', '\r\n')
replacement2_crlf = replacement2.replace('\n', '\r\n')

if target2_crlf in content:
    content = content.replace(target2_crlf, replacement2_crlf, 1)
    print("openModal patched (CRLF)")
elif target2 in content:
    content = content.replace(target2, replacement2, 1)
    print("openModal patched (LF)")
else:
    print("Target 2 not found!")

# 3. Update confirmBtn to use window.Vellum
target3 = '''        try {
          const svgData = await buildSvgData();
          const mode = radExtrude && radExtrude.checked ? 'extrude' : radImage && radImage.checked ? 'image' : 'sketch';
          const thickness = parseFloat(document.getElementById('jsExtrudeThickness')?.value) || 5.0;
          const plane = document.getElementById('jsTargetPlane')?.value || 'XY';
          const name = document.getElementById('jsPartName')?.value.trim() || 'Vellum Design';
          const objectsList = (typeof state !== 'undefined' && state.objects) ? state.objects : [];'''

replacement3 = '''        try {
          let svgData = '';
          if (window.Vellum && window.Vellum.getExportSvg) {
            svgData = await window.Vellum.getExportSvg();
          } else {
            svgData = await buildSvgData();
          }
          const mode = radExtrude && radExtrude.checked ? 'extrude' : radImage && radImage.checked ? 'image' : 'sketch';
          const thickness = parseFloat(document.getElementById('jsExtrudeThickness')?.value) || 5.0;
          const plane = document.getElementById('jsTargetPlane')?.value || 'XY';
          const name = document.getElementById('jsPartName')?.value.trim() || 'Vellum Design';
          const objectsList = (window.Vellum && window.Vellum.objects) ? window.Vellum.objects.slice() : ((typeof state !== 'undefined' && state.objects) ? state.objects.slice() : []);'''

target3_crlf = target3.replace('\n', '\r\n')
replacement3_crlf = replacement3.replace('\n', '\r\n')

if target3_crlf in content:
    content = content.replace(target3_crlf, replacement3_crlf, 1)
    print("confirmBtn patched (CRLF)")
elif target3 in content:
    content = content.replace(target3, replacement3, 1)
    print("confirmBtn patched (LF)")
else:
    print("Target 3 not found!")

with open('Vellum/index.htm', 'w', encoding='utf-8') as f:
    f.write(content)
print("Vellum/index.htm written successfully.")

