#!/usr/bin/env python3
"""
JSVCLE Studio Documentation & PDF Generator
Renders Mermaid diagrams into vector SVGs in docs/diagrams/
Generates high-fidelity PDF versions (docs/USER_GUIDE.pdf and docs/DEVELOPER_GUIDE.pdf)
with research disclaimer preface and strict print pagination (no blank pages).
"""

import os
import re
import sys
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT_DIR = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT_DIR / "docs"
DIAGRAMS_DIR = DOCS_DIR / "diagrams"
TOOLS_DIR = ROOT_DIR / "tools"
MERMAID_JS = TOOLS_DIR / "mermaid.min.js"

DIAGRAMS_DIR.mkdir(parents=True, exist_ok=True)

DISCLAIMER_MD = """
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
"""

DISCLAIMER_HTML = """
<div class="disclaimer-card">
  <div class="disclaimer-header">
    <span class="disclaimer-badge">CAUTION</span>
    <span class="disclaimer-title">RESEARCH EXPERIMENTATION & LIABILITY DISCLAIMER</span>
  </div>
  <div class="disclaimer-body">
    <p><strong>This software is purely research experimentation and is provided strictly "AS IS".</strong> It may damage your device, CNC machine, spindle, laser diode, workpiece, or computer. The goal of this project is the exploration of what is possible in unified in-browser digital fabrication. Users accept all risks and agree to hold authors, contributors, and developers completely harmless regardless of outcome. <strong>USE AT YOUR OWN RISK.</strong></p>
    <p>All comments, feedback, and discussion are encouraged and welcome in community posts.</p>
    <div class="community-rules">
      <strong>Community Rules:</strong>
      <ul>
        <li><strong>Open Source & Copyleft:</strong> Keep all innovations accessible and free for everyone.</li>
        <li><strong>Constructive Community:</strong> Keep all commentary positive, helpful, and respectful.</li>
        <li><strong>Action-Oriented Collaboration:</strong> Write code to fix issues and share your solutions back to the group.</li>
      </ul>
    </div>
  </div>
</div>
"""

def extract_mermaid_blocks(text):
    pattern = r"```mermaid\s*\n(.*?)```"
    return re.findall(pattern, text, flags=re.DOTALL)

def render_diagrams_with_playwright(page, diagrams_map):
    """
    diagrams_map: dict of { filename: mermaid_code }
    Uses playwright to render each diagram with Mermaid and save SVG
    """
    html_content = f"""<!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <script>{MERMAID_JS.read_text(encoding='utf-8')}</script>
      <script>
        mermaid.initialize({{
          startOnLoad: false,
          theme: 'neutral',
          securityLevel: 'loose',
          fontFamily: 'Segoe UI, -apple-system, sans-serif'
        }});
      </script>
      <style>
        body {{ margin: 0; padding: 20px; background: white; }}
        .diag-container {{ margin-bottom: 30px; }}
      </style>
    </head>
    <body>
      <div id="render-target"></div>
    </body>
    </html>"""
    
    page.set_content(html_content)
    
    for filename, code in diagrams_map.items():
        print(f"[*] Rendering diagram: {filename}...")
        svg_code = page.evaluate("""async ([code, id]) => {
            const { svg } = await mermaid.render('mermaid-' + id, code);
            return svg;
        }""", [code.strip(), re.sub(r'[^a-zA-Z0-9]', '_', filename)])
        
        out_svg = DIAGRAMS_DIR / filename
        out_svg.write_text(svg_code, encoding="utf-8")
        print(f"    [+] Saved {out_svg.name} ({len(svg_code)} bytes)")

def convert_markdown_to_html(md_text, doc_title, diagrams_map):
    """
    Converts markdown text to clean HTML, replacing mermaid code blocks with <img> tags pointing to SVGs
    """
    # Replace disclaimer block if already there or add at top
    # Replace markdown headers
    html = md_text
    
    # Replace mermaid blocks with SVG images
    counter = 0
    keys = list(diagrams_map.keys())
    
    def repl_mermaid(match):
        nonlocal counter
        if counter < len(keys):
            key = keys[counter]
            counter += 1
            return f'\n<div class="diagram-figure"><img src="diagrams/{key}" alt="{key}" class="diagram-svg" /><div class="diagram-caption">Figure: {key.replace(".svg", "").replace("_", " ").title()}</div></div>\n'
        return match.group(0)
    
    html = re.sub(r"```mermaid\s*\n.*?```", repl_mermaid, html, flags=re.DOTALL)
    
    # Simple markdown replacements for headings, bold, tables, code
    # Headers
    html = re.sub(r"^# (.+)$", r"<h1>\1</h1>", html, flags=re.MULTILINE)
    html = re.sub(r"^## (.+)$", r"<h2>\1</h2>", html, flags=re.MULTILINE)
    html = re.sub(r"^### (.+)$", r"<h3>\1</h3>", html, flags=re.MULTILINE)
    html = re.sub(r"^#### (.+)$", r"<h4>\1</h4>", html, flags=re.MULTILINE)
    
    # Bold & Italic
    html = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", html)
    html = re.sub(r"\*(.+?)\*", r"<em>\1</em>", html)
    
    # Inline code
    html = re.sub(r"`([^`]+)`", r"<code>\1</code>", html)
    
    # Blockquotes / Alerts
    html = re.sub(r"^> \[\!([A-Z]+)\]\s*\n(> .*\n?)+", "", html, flags=re.MULTILINE)
    html = re.sub(r"^> (.*)$", r"<blockquote>\1</blockquote>", html, flags=re.MULTILINE)
    
    # Tables conversion
    def convert_table(match):
        lines = [l.strip() for l in match.group(0).strip().split("\n") if l.strip()]
        if len(lines) < 2:
            return match.group(0)
        headers = [c.strip() for c in lines[0].strip("|").split("|")]
        th_cells = "".join([f"<th>{h}</th>" for h in headers])
        rows_html = []
        for line in lines[2:]:
            cols = [c.strip() for c in line.strip("|").split("|")]
            td_cells = "".join([f"<td>{c}</td>" for c in cols])
            rows_html.append(f"<tr>{td_cells}</tr>")
        return f'<div class="table-container"><table><thead><tr>{th_cells}</tr></thead><tbody>{"".join(rows_html)}</tbody></table></div>'
    
    html = re.sub(r"(\|[^\n]+\|\n\|[-| :]+\|\n(\|[^\n]+\|\n?)+)", convert_table, html)
    
    # Code blocks
    def repl_code(match):
        lang = match.group(1) or ""
        code = match.group(2).replace("<", "&lt;").replace(">", "&gt;")
        return f'<pre class="code-block {lang}"><code>{code}</code></pre>'
    
    html = re.sub(r"```([a-z0-9_-]*)\n(.*?)```", repl_code, html, flags=re.DOTALL)
    
    # Horizontal rules
    html = re.sub(r"^---+$", r"<hr/>", html, flags=re.MULTILINE)
    
    # Paragraphs and Lists
    paragraphs = []
    in_ul = False
    in_ol = False
    for line in html.split("\n"):
        l = line.strip()
        if not l:
            if in_ul: paragraphs.append("</ul>"); in_ul = False
            if in_ol: paragraphs.append("</ol>"); in_ol = False
            continue
        if l.startswith("- ") or l.startswith("* "):
            if not in_ul: paragraphs.append("<ul>"); in_ul = True
            paragraphs.append(f"<li>{l[2:]}</li>")
        elif re.match(r"^\d+\.\s", l):
            if not in_ol: paragraphs.append("<ol>"); in_ol = True
            item_text = re.sub(r"^\d+\.\s*", "", l)
            paragraphs.append(f"<li>{item_text}</li>")
        elif l.startswith("<h") or l.startswith("<div") or l.startswith("<table") or l.startswith("<pre") or l.startswith("<hr") or l.startswith("</"):
            if in_ul: paragraphs.append("</ul>"); in_ul = False
            if in_ol: paragraphs.append("</ol>"); in_ol = False
            paragraphs.append(line)
        else:
            if in_ul: paragraphs.append("</ul>"); in_ul = False
            if in_ol: paragraphs.append("</ol>"); in_ol = False
            paragraphs.append(f"<p>{line}</p>")
    if in_ul: paragraphs.append("</ul>")
    if in_ol: paragraphs.append("</ol>")
    
    body_content = "\n".join(paragraphs)
    
    full_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{doc_title}</title>
  <style>
    @page {{
      size: letter;
      margin: 14mm 14mm 14mm 14mm;
      @bottom-right {{
        content: counter(page);
      }}
    }}
    
    *, *:before, *:after {{
      box-sizing: border-box;
    }}
    
    body {{
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.5;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
    }}
    
    h1 {{
      font-size: 22pt;
      font-weight: 800;
      color: #0f172a;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 6px;
      margin-top: 0;
      margin-bottom: 12px;
      page-break-after: avoid;
      break-after: avoid;
    }}
    
    h2 {{
      font-size: 14pt;
      font-weight: 700;
      color: #0369a1;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-top: 20px;
      margin-bottom: 10px;
      page-break-after: avoid;
      break-after: avoid;
    }}
    
    h3 {{
      font-size: 12pt;
      font-weight: 600;
      color: #0f172a;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
      break-after: avoid;
    }}
    
    p, li {{
      color: #334155;
    }}
    
    p {{
      margin: 0 0 8px 0;
    }}
    
    ul, ol {{
      margin: 4px 0 10px 20px;
      padding: 0;
    }}
    
    li {{
      margin-bottom: 4px;
    }}
    
    /* Disclaimer Card */
    .disclaimer-card {{
      border: 2px solid #dc2626;
      border-radius: 6px;
      background: #fef2f2;
      margin: 14px 0 20px 0;
      padding: 12px 16px;
      page-break-inside: avoid;
      break-inside: avoid;
    }}
    
    .disclaimer-header {{
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }}
    
    .disclaimer-badge {{
      background: #dc2626;
      color: #ffffff;
      font-weight: 800;
      font-size: 9pt;
      letter-spacing: 0.5px;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }}
    
    .disclaimer-title {{
      font-size: 11pt;
      font-weight: 800;
      color: #991b1b;
      letter-spacing: 0.3px;
    }}
    
    .disclaimer-body p {{
      color: #7f1d1d;
      font-size: 9.5pt;
      line-height: 1.45;
      margin-bottom: 6px;
    }}
    
    .community-rules {{
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid #fecaca;
      font-size: 9.5pt;
      color: #991b1b;
    }}
    
    .community-rules ul {{
      margin: 4px 0 0 16px;
    }}
    
    .community-rules li {{
      color: #7f1d1d;
    }}
    
    /* Diagram Figures */
    .diagram-figure {{
      margin: 14px auto 16px auto;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
      max-width: 100%;
    }}
    
    .diagram-svg {{
      max-width: 96%;
      max-height: 420px;
      height: auto;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px;
      background: #f8fafc;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05);
      object-fit: contain;
    }}
    
    .diagram-caption {{
      font-size: 8.5pt;
      font-weight: 600;
      color: #64748b;
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }}
    
    /* Tables */
    .table-container {{
      margin: 10px 0 14px 0;
      page-break-inside: avoid;
      break-inside: avoid;
    }}
    
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      background: #ffffff;
    }}
    
    th, td {{
      padding: 6px 10px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }}
    
    th {{
      background: #f1f5f9;
      color: #0f172a;
      font-weight: 700;
    }}
    
    tr:nth-child(even) td {{
      background: #f8fafc;
    }}
    
    /* Code Blocks */
    code {{
      font-family: Consolas, "Courier New", monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
      color: #0f172a;
    }}
    
    pre.code-block {{
      background: #0f172a;
      color: #f8fafc;
      padding: 10px 14px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 8.5pt;
      line-height: 1.4;
      page-break-inside: avoid;
      break-inside: avoid;
      margin: 8px 0 12px 0;
    }}
    
    pre.code-block code {{
      background: transparent;
      color: inherit;
      padding: 0;
    }}
    
    hr {{
      border: 0;
      border-top: 1px solid #e2e8f0;
      margin: 18px 0;
    }}
  </style>
</head>
<body>
  {DISCLAIMER_HTML}
  {body_content}
</body>
</html>"""
    return full_html

def main():
    print("==================================================")
    print("      JSVCLE Documentation & PDF Builder         ")
    print("==================================================")
    
    ug_md_path = DOCS_DIR / "USER_GUIDE.md"
    dg_md_path = DOCS_DIR / "DEVELOPER_GUIDE.md"
    
    ug_text = ug_md_path.read_text(encoding="utf-8")
    dg_text = dg_md_path.read_text(encoding="utf-8")
    
    ug_mermaid_blocks = extract_mermaid_blocks(ug_text)
    dg_mermaid_blocks = extract_mermaid_blocks(dg_text)
    
    print(f"[*] Found {len(ug_mermaid_blocks)} diagrams in USER_GUIDE.md")
    print(f"[*] Found {len(dg_mermaid_blocks)} diagrams in DEVELOPER_GUIDE.md")
    
    ug_diagrams = {
        "ug_architecture.svg": ug_mermaid_blocks[0] if len(ug_mermaid_blocks) > 0 else "",
        "ug_installer_flow.svg": ug_mermaid_blocks[1] if len(ug_mermaid_blocks) > 1 else "",
        "ug_initial_config.svg": ug_mermaid_blocks[2] if len(ug_mermaid_blocks) > 2 else "",
        "ug_three_workflows.svg": ug_mermaid_blocks[3] if len(ug_mermaid_blocks) > 3 else ""
    }
    
    dg_diagrams = {
        "dev_architecture.svg": dg_mermaid_blocks[0] if len(dg_mermaid_blocks) > 0 else "",
        "dev_repo_tree.svg": dg_mermaid_blocks[1] if len(dg_mermaid_blocks) > 1 else "",
        "dev_capability_matrix.svg": dg_mermaid_blocks[2] if len(dg_mermaid_blocks) > 2 else "",
        "dev_toolchain_flow.svg": dg_mermaid_blocks[3] if len(dg_mermaid_blocks) > 3 else "",
        "dev_build_pipeline.svg": dg_mermaid_blocks[4] if len(dg_mermaid_blocks) > 4 else "",
        "dev_class_hierarchy.svg": dg_mermaid_blocks[5] if len(dg_mermaid_blocks) > 5 else "",
        "dev_lifecycle.svg": dg_mermaid_blocks[6] if len(dg_mermaid_blocks) > 6 else "",
        "dev_slicer_flow.svg": dg_mermaid_blocks[7] if len(dg_mermaid_blocks) > 7 else "",
        "dev_grayscale_flow.svg": dg_mermaid_blocks[8] if len(dg_mermaid_blocks) > 8 else "",
        "dev_telemetry_flow.svg": dg_mermaid_blocks[9] if len(dg_mermaid_blocks) > 9 else "",
        "dev_recovery_flow.svg": dg_mermaid_blocks[10] if len(dg_mermaid_blocks) > 10 else "",
        "dev_vault_flow.svg": dg_mermaid_blocks[11] if len(dg_mermaid_blocks) > 11 else ""
    }
    
    all_diagrams = {**ug_diagrams, **dg_diagrams}
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # 1. Render all SVG diagrams
        render_diagrams_with_playwright(page, all_diagrams)
        
        # 2. Update Markdown files to embed visual diagrams & preface disclaimer (only if missing)
        print("\n[*] Checking Markdown files for visual diagram embeds and disclaimer...")
        
        # Process USER_GUIDE.md
        if "RESEARCH EXPERIMENTATION & LIABILITY DISCLAIMER" not in ug_text or "ug_architecture.svg" not in ug_text:
            updated_ug_md = ug_text
            if "RESEARCH EXPERIMENTATION & LIABILITY DISCLAIMER" not in updated_ug_md:
                updated_ug_md = DISCLAIMER_MD + "\n" + updated_ug_md
                
            counter = 0
            ug_keys = list(ug_diagrams.keys())
            def repl_ug_md(m):
                nonlocal counter
                if counter < len(ug_keys):
                    k = ug_keys[counter]
                    counter += 1
                    return f'\n![{k}](diagrams/{k})\n\n```mermaid\n{m.group(1)}```\n'
                return m.group(0)
            
            if "ug_architecture.svg" not in updated_ug_md:
                updated_ug_md = re.sub(r"```mermaid\s*\n(.*?)```", repl_ug_md, updated_ug_md, flags=re.DOTALL)
            ug_md_path.write_text(updated_ug_md, encoding="utf-8")
            print(f"    [+] Updated {ug_md_path.name}")
        else:
            print(f"    [=] {ug_md_path.name} already contains disclaimer and diagram embeds.")
        
        # Process DEVELOPER_GUIDE.md
        if "RESEARCH EXPERIMENTATION & LIABILITY DISCLAIMER" not in dg_text or "dev_architecture.svg" not in dg_text:
            updated_dg_md = dg_text
            if "RESEARCH EXPERIMENTATION & LIABILITY DISCLAIMER" not in updated_dg_md:
                updated_dg_md = DISCLAIMER_MD + "\n" + updated_dg_md
                
            counter = 0
            dg_keys = list(dg_diagrams.keys())
            def repl_dg_md(m):
                nonlocal counter
                if counter < len(dg_keys):
                    k = dg_keys[counter]
                    counter += 1
                    return f'\n![{k}](diagrams/{k})\n\n```mermaid\n{m.group(1)}```\n'
                return m.group(0)
                
            if "dev_architecture.svg" not in updated_dg_md:
                updated_dg_md = re.sub(r"```mermaid\s*\n(.*?)```", repl_dg_md, updated_dg_md, flags=re.DOTALL)
            dg_md_path.write_text(updated_dg_md, encoding="utf-8")
            print(f"    [+] Updated {dg_md_path.name}")
        else:
            print(f"    [=] {dg_md_path.name} already contains disclaimer and diagram embeds.")
        
        # 3. Generate HTML and Print PDF
        print("\n[*] Generating PDF documents...")
        
        # User Guide PDF
        ug_html = convert_markdown_to_html(ug_text, "JSVCLE Studio — User Guide", ug_diagrams)
        ug_html_path = DOCS_DIR / "USER_GUIDE.html"
        ug_html_path.write_text(ug_html, encoding="utf-8")
        
        page.goto(ug_html_path.as_uri())
        page.wait_for_load_state("networkidle")
        ug_pdf_path = DOCS_DIR / "USER_GUIDE.pdf"
        page.pdf(
            path=str(ug_pdf_path),
            format="Letter",
            print_background=True,
            margin={"top": "14mm", "bottom": "14mm", "left": "14mm", "right": "14mm"}
        )
        print(f"    [+] Generated: {ug_pdf_path} ({ug_pdf_path.stat().st_size} bytes)")
        
        # Developer Guide PDF
        dg_html = convert_markdown_to_html(dg_text, "JSVCLE Studio — Developer Guide", dg_diagrams)
        dg_html_path = DOCS_DIR / "DEVELOPER_GUIDE.html"
        dg_html_path.write_text(dg_html, encoding="utf-8")
        
        page.goto(dg_html_path.as_uri())
        page.wait_for_load_state("networkidle")
        dg_pdf_path = DOCS_DIR / "DEVELOPER_GUIDE.pdf"
        page.pdf(
            path=str(dg_pdf_path),
            format="Letter",
            print_background=True,
            margin={"top": "14mm", "bottom": "14mm", "left": "14mm", "right": "14mm"}
        )
        print(f"    [+] Generated: {dg_pdf_path} ({dg_pdf_path.stat().st_size} bytes)")
        
        page.close()
        browser.close()
        
    import time
    time.sleep(1.0)
    # 4. Copy to docs_staging with shared read access to prevent file locking issues
    print("\n[*] Syncing to docs_staging for Inno Setup installer packaging...")
    staging_dir = ROOT_DIR / "docs_staging"
    staging_dir.mkdir(parents=True, exist_ok=True)
    for root, dirs, files in os.walk(DOCS_DIR):
        rel_root = Path(root).relative_to(DOCS_DIR)
        target_root = staging_dir / rel_root
        target_root.mkdir(parents=True, exist_ok=True)
        for f in files:
            if f.startswith(".~lock") or f.endswith(".tmp") or f.endswith(".bak"):
                continue
            src_file = Path(root) / f
            dst_file = target_root / f
            try:
                with open(src_file, "rb") as fin, open(dst_file, "wb") as fout:
                    fout.write(fin.read())
            except Exception as e:
                print(f"    [!] Warning copying {f}: {e}")
    print("    [+] docs_staging ready.")

    print("\n==================================================")
    print("      ALL DIAGRAMS & PDFS GENERATED SUCCESSFULLY  ")
    print("==================================================")

if __name__ == "__main__":
    main()

