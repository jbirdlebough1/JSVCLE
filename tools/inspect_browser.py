import subprocess
import time
import json
import urllib.request
import asyncio
import sys

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
proc = subprocess.Popen([
    edge_path,
    "--headless=new",
    "--remote-debugging-port=9222",
    "--allow-file-access-from-files",
    r"file:///D:/CLEJS/Dev/index.htm"
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

time.sleep(2)

try:
    with urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=3) as resp:
        targets = json.loads(resp.read().decode())
    print("Edge Targets:", len(targets))
    for t in targets:
        print(f"Target: {t.get('title')} ({t.get('url')})")
        print(f"WS URL: {t.get('webSocketDebuggerUrl')}")
except Exception as e:
    print("Error listing targets:", e)
finally:
    proc.terminate()
