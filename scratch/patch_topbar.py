with open('Dev/index.htm', 'r', encoding='utf-8') as f:
    content = f.read()

target = '''    <button class="tb-btn" id="btn-projects" title="Your designs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span class="lbl">Designs</span></button>
    <div class="menu-wrap">
      <button class="tb-btn" id="btn-export" aria-haspopup="true" title="Open a project file, save a copy, or export"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span class="lbl">Open/Export</span></button>
      <div class="menu" id="menu-export" hidden>
        <button data-act="stl">STL for 3D printing <small>.stl</small></button>
        <button data-act="3mf">3MF for 3D printing (with colors) <small>.3mf</small></button>
        <button data-act="step">STEP for other CAD <small>.step</small></button>
        <button data-act="dxf" title="Every sketch, flat, for laser or vinyl cutters and other CAD">Sketches as DXF <small>.dxf</small></button>
        <hr>
        <button data-act="json">Save Project File <small>.json</small></button>
        <button data-act="import">Open a project file…</button>
      </div>
    </div>'''

replacement = '''    <button class="tb-btn" id="btn-new-project" title="Start a fresh new project (clears workspace)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg><span class="lbl">New</span></button>
    <button class="tb-btn" id="btn-save-project" title="Quick Save Version"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg><span class="lbl">Save</span></button>
    <button class="tb-btn" id="btn-save-as-project" title="Save As (Named file &amp; version)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/><path d="M12 18v-5M9 15l3-3 3 3"/></svg><span class="lbl">Save As</span></button>
    <button class="tb-btn" id="btn-projects" title="Your designs"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span class="lbl">Designs</span></button>
    <div class="menu-wrap">
      <button class="tb-btn" id="btn-export" aria-haspopup="true" title="Open a project file, save a copy, or export"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg><span class="lbl">Open/Export</span></button>
      <div class="menu" id="menu-export" hidden>
        <button data-act="new" id="menu-act-new" title="Clear workspace and start fresh"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:6px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>New Project</button>
        <button data-act="save" id="menu-act-save" title="Quick Save Version"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:6px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save Version</button>
        <button data-act="saveas" id="menu-act-saveas" title="Save As named project copy"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px;margin-right:6px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/><path d="M12 18v-5M9 15l3-3 3 3"/></svg>Save As…</button>
        <hr>
        <button data-act="stl">STL for 3D printing <small>.stl</small></button>
        <button data-act="3mf">3MF for 3D printing (with colors) <small>.3mf</small></button>
        <button data-act="step">STEP for other CAD <small>.step</small></button>
        <button data-act="dxf" title="Every sketch, flat, for laser or vinyl cutters and other CAD">Sketches as DXF <small>.dxf</small></button>
        <hr>
        <button data-act="json">Save Project File <small>.json</small></button>
        <button data-act="import">Open a project file…</button>
      </div>
    </div>'''

target_crlf = target.replace('\n', '\r\n')
replacement_crlf = replacement.replace('\n', '\r\n')

if target_crlf in content:
    content = content.replace(target_crlf, replacement_crlf, 1)
    with open('Dev/index.htm', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS (CRLF)')
elif target in content:
    content = content.replace(target, replacement, 1)
    with open('Dev/index.htm', 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS (LF)')
else:
    print('TARGET NOT FOUND')

