import re

with open('scratch/vellum_v1.6.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

print('Title:', re.findall(r'<title>(.*?)</title>', text, re.I))

# Find functions related to SVG or export
export_funcs = set(re.findall(r'function\s+([a-zA-Z0-9_]*(?:export|svg|dxf|save)[a-zA-Z0-9_]*)', text, re.I))
print('Export / SVG funcs:', export_funcs)

# Find where exportSVG is defined or called
for line in text.split('\n'):
    if 'exportSVG' in line or 'exportSvg' in line or 'toSVG' in line or 'toSvg' in line or 'buildSVG' in line:
        print('SVG line:', line.strip()[:120])

# Find top toolbar or header buttons
matches = re.findall(r'<button[^>]*id=["\']([^"\']+)["\'][^>]*>(.*?)</button>', text, re.I)
print('\nButtons (first 30):')
for btn_id, label in matches[:30]:
    clean_lbl = re.sub(r'<[^>]+>', '', label).strip()
    print(f'  #{btn_id}: {clean_lbl}')

