#!/usr/bin/env bash
# CLEJS Daily JumpStart Upstream Tracking Script
set -e

if (pwd -W) >/dev/null 2>&1; then
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"
else
    PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

ORIGINAL="$PROJECT_ROOT/JSoriginal/index.htm"
DEV="$PROJECT_ROOT/Dev/index.htm"
HISTORY="$PROJECT_ROOT/JSoriginal_history"
REPORTS="$PROJECT_ROOT/upstream-reports"

mkdir -p "$HISTORY" "$REPORTS"

PYTHON_CMD="python"
if ! command -v python >/dev/null 2>&1; then
    PYTHON_CMD="python3"
fi

$PYTHON_CMD -c "
import urllib.request
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

matches = re.findall(r'href\s*=\s*[\"\']([^\"\']*jumpstart_3d_v[\d.]+\.htm)[\"\']', html, re.I)
if not matches:
    print('[ERROR] Could not find jumpstart_3d_v*.htm download link.')
    sys.exit(1)

app_url = urllib.parse.urljoin(site_url, matches[0])
print(f'[CLEJS] Found upstream app: {app_url}')

temp_file = os.path.join(r'$PROJECT_ROOT', '.jumpstart_temp.htm')
urllib.request.urlretrieve(app_url, temp_file)

with open(temp_file, 'rb') as f:
    temp_bytes = f.read()

if len(temp_bytes) < 1000000:
    print('[ERROR] Downloaded file is too small.')
    os.remove(temp_file)
    sys.exit(1)

upstream_hash = hashlib.sha256(temp_bytes).hexdigest().upper()
original_path = os.path.join(r'$ORIGINAL')
history_path = os.path.join(r'$HISTORY')
dev_path = os.path.join(r'$DEV')

prev_hash = None
prev_size = 0
if os.path.exists(original_path):
    with open(original_path, 'rb') as f:
        prev_bytes = f.read()
    prev_hash = hashlib.sha256(prev_bytes).hexdigest().upper()
    prev_size = len(prev_bytes)

changed = (upstream_hash != prev_hash)
stamp = datetime.now().strftime('%Y%m%d-%H%M%S')

if changed:
    if prev_hash and os.path.exists(original_path):
        backup_name = f'index-{stamp}-{prev_hash[:12]}.htm'
        backup_path = os.path.join(history_path, backup_name)
        os.replace(original_path, backup_path)
        print(f'[CLEJS] Backed up prior upstream to {backup_name}')
    os.replace(temp_file, original_path)
    print('[CLEJS] Updated JSoriginal/index.htm with latest release.')
else:
    if os.path.exists(temp_file):
        os.remove(temp_file)
    print('[CLEJS] Upstream is unchanged.')

# Dev comparison
dev_hash = None
dev_size = 0
if os.path.exists(dev_path):
    with open(dev_path, 'rb') as f:
        dev_bytes = f.read()
    dev_hash = hashlib.sha256(dev_bytes).hexdigest().upper()
    dev_size = len(dev_bytes)

dev_status = 'Identical to upstream' if dev_hash == upstream_hash else 'Different from upstream'
upstream_status = 'Updated' if changed else 'No change'
today = datetime.now().strftime('%Y-%m-%d')
report_file = os.path.join(r'$REPORTS', f'{today}.md')

version_match = re.search(r'v[\d.]+', app_url)
version = version_match.group(0) if version_match else 'latest'

report_md = f'''# JumpStart 3D Upstream Check - {today}

- Source page: {site_url}
- Downloaded app: {app_url}
- Upstream version from filename: {version}
- Upstream status vs previous JSoriginal: {upstream_status}
- Dev was not modified.

| File | Previous JSoriginal SHA-256 | Previous size (bytes) | Upstream SHA-256 | Upstream size (bytes) | Dev SHA-256 | Dev size (bytes) | Upstream vs Dev |
|---|---|---:|---|---:|---|---:|---|
| index.htm | {prev_hash or 'None'} | {prev_size} | {upstream_hash} | {len(temp_bytes)} | {dev_hash or 'None'} | {dev_size} | {dev_status} |

## Review notes
The source is a single bundled HTML file. The automated check tracks upstream releases and never modifies Dev.
'''

with open(report_file, 'w', encoding='utf-8') as f:
    f.write(report_md)

print(f'[CLEJS] Upstream report written to: {report_file}')
"
