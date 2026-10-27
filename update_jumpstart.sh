#!/usr/bin/env bash
# CLEJS Daily Upstream Tracking Script (JumpStart 3D & Vellum Vector Studio)
set -e

if (pwd -W) >/dev/null 2>&1; then
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"
else
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

JS_ORIGINAL="$PROJECT_ROOT/JSoriginal/index.htm"
JS_DEV="$PROJECT_ROOT/Dev/index.htm"
JS_HISTORY="$PROJECT_ROOT/JSoriginal_history"

VV_ORIGINAL="$PROJECT_ROOT/VVSource/index.htm"
VV_DEV="$PROJECT_ROOT/Vellum/index.htm"
VV_HISTORY="$PROJECT_ROOT/VVSource_history"

REPORTS="$PROJECT_ROOT/upstream-reports"

mkdir -p "$JS_HISTORY" "$VV_HISTORY" "$REPORTS"

PYTHON_CMD="python"
if ! command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python3"
fi

$PYTHON_CMD -c "
import urllib.request
import urllib.parse
import re
import hashlib
import os
import sys
from datetime import datetime

site_url = 'https://classyapps.org/'
req = urllib.request.Request(site_url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
except Exception as ex:
    print(f'[ERROR] Could not fetch {site_url}: {ex}')
    sys.exit(1)

def track_app(name, pattern, orig_path, hist_dir, dev_path, min_size=50000):
    matches = re.findall(pattern, html, re.I)
    if not matches:
        print(f'[ERROR] Could not find {name} download link on {site_url}.')
        return None
    
    app_url = urllib.parse.urljoin(site_url, matches[0])
    print(f'[CLEJS] Found upstream {name}: {app_url}')
    
    temp_file = os.path.join(r'$PROJECT_ROOT', f'.{name.lower()}_temp.htm')
    urllib.request.urlretrieve(app_url, temp_file)
    
    with open(temp_file, 'rb') as f:
        temp_bytes = f.read()
    
    if len(temp_bytes) < min_size:
        print(f'[ERROR] Downloaded {name} file is too small ({len(temp_bytes)} bytes).')
        if os.path.exists(temp_file):
            os.remove(temp_file)
        return None
        
    upstream_hash = hashlib.sha256(temp_bytes).hexdigest().upper()
    prev_hash = None
    prev_size = 0
    if os.path.exists(orig_path):
        with open(orig_path, 'rb') as f:
            prev_bytes = f.read()
        prev_hash = hashlib.sha256(prev_bytes).hexdigest().upper()
        prev_size = len(prev_bytes)
        
    changed = (upstream_hash != prev_hash)
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    
    if changed:
        if prev_hash and os.path.exists(orig_path):
            backup_name = f'index-{stamp}-{prev_hash[:12]}.htm'
            backup_path = os.path.join(hist_dir, backup_name)
            os.replace(orig_path, backup_path)
            print(f'[CLEJS] Backed up prior {name} upstream to {backup_name}')
        os.replace(temp_file, orig_path)
        print(f'[CLEJS] Updated {orig_path} with latest release.')
    else:
        if os.path.exists(temp_file):
            os.remove(temp_file)
        print(f'[CLEJS] Upstream {name} is unchanged.')
        
    dev_hash = None
    dev_size = 0
    if os.path.exists(dev_path):
        with open(dev_path, 'rb') as f:
            dev_bytes = f.read()
        dev_hash = hashlib.sha256(dev_bytes).hexdigest().upper()
        dev_size = len(dev_bytes)
        
    dev_status = 'Identical to upstream' if dev_hash == upstream_hash else 'Customized / Different'
    upstream_status = 'Updated' if changed else 'No change'
    ver_m = re.search(r'v[\d.]+', app_url, re.I)
    version = ver_m.group(0) if ver_m else 'latest'
    
    return {
        'name': name,
        'app_url': app_url,
        'version': version,
        'upstream_status': upstream_status,
        'prev_hash': prev_hash,
        'prev_size': prev_size,
        'upstream_hash': upstream_hash,
        'upstream_size': len(temp_bytes),
        'dev_hash': dev_hash,
        'dev_size': dev_size,
        'dev_status': dev_status
    }

# 1. Track JumpStart 3D
js_info = track_app(
    'JumpStart_3D',
    r'href\s*=\s*[\"\']([^\"\']*jumpstart_3d_v[\d.]+\.htm)[\"\']',
    r'$JS_ORIGINAL',
    r'$JS_HISTORY',
    r'$JS_DEV',
    min_size=1000000
)

# 2. Track Vellum Vector Studio
vv_info = track_app(
    'Vellum_Vector_Studio',
    r'href\s*=\s*[\"\']([^\"\']*(?:Vellum_Vector_Studio|vellum)[^\"\']*\.htm)[\"\']',
    r'$VV_ORIGINAL',
    r'$VV_HISTORY',
    r'$VV_DEV',
    min_size=200000
)

today = datetime.now().strftime('%Y-%m-%d')
report_file = os.path.join(r'$REPORTS', f'{today}.md')

report_lines = [
    f'# ClassyApps Daily Upstream Check - {today}',
    '',
    f'- Source page: {site_url}',
    f'- Automated check tracks clean upstream releases daily for both JumpStart 3D and Vellum Vector Studio.',
    f'- Dev and Vellum working directories are never overwritten automatically.',
    ''
]

for info in [js_info, vv_info]:
    if not info:
        continue
    report_lines.extend([
        f'## {info[\"name\"]} (Upstream: {info[\"version\"]})',
        f'- App URL: {info[\"app_url\"]}',
        f'- Status vs previous pristine archive: **{info[\"upstream_status\"]}**',
        '',
        '| File | Previous Upstream SHA-256 | Prev size (bytes) | Current Upstream SHA-256 | Current size (bytes) | Workspace SHA-256 | Workspace size (bytes) | Upstream vs Workspace |',
        '|---|---|---:|---|---:|---|---:|---|',
        f'| index.htm | {info[\"prev_hash\"] or \"None\"} | {info[\"prev_size\"]} | {info[\"upstream_hash\"]} | {info[\"upstream_size\"]} | {info[\"dev_hash\"] or \"None\"} | {info[\"dev_size\"]} | {info[\"dev_status\"]} |',
        ''
    ])

with open(report_file, 'w', encoding='utf-8') as f:
    f.write('\\n'.join(report_lines))

print(f'[CLEJS] Daily upstream report written to: {report_file}')
"
