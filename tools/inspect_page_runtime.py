import subprocess
import time
import json
import urllib.request
import asyncio
import sys
import websockets

edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
proc = subprocess.Popen([
    edge_path,
    "--headless=new",
    "--remote-debugging-port=9222",
    "--allow-file-access-from-files",
    r"file:///D:/CLEJS/Dev/index.htm"
], stdout=subprocess.PIPE, stderr=subprocess.PIPE)

time.sleep(2)

async def run():
    try:
        with urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=3) as resp:
            targets = json.loads(resp.read().decode())
        js_target = next((t for t in targets if "JumpStart 3D" in t.get("title", "")), None)
        ws_url = js_target["webSocketDebuggerUrl"]
        async with websockets.connect(ws_url) as ws:
            await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
            await asyncio.sleep(1)
            
            checks = [
                ("typeof THREE", False),
                ("Boolean(window.CLE.bed && window.CLE.bed.bedGroup && window.CLE.bed.bedGroup.parent)", False),
                ("(() => { const slab = window.CLE.bed.bedGroup.getObjectByName('CLE_Spoilboard_Slab'); return { color: slab.material.color.getHexString(), opacity: slab.material.opacity, transparent: slab.material.transparent }; })()", False),
                ("Boolean(window.CLE.bed.bedGroup.getObjectByName('CLE_Bed_Grid_Major_Green_Squares'))", False),
                ("Boolean(window.CLE.bed.bedGroup.getObjectByName('CLE_Machine_Tool_Lines_XYZ'))", False),
                ("(() => { return window.CLE.bed.bedGroup.getObjectByName('CLE_Live_Toolhead_Cursor').getObjectByName('CLE_Tool_Tip_Lines_XYZ') !== null; })()", False),
                ("(() => { return app.vp.grid ? app.vp.grid.visible : 'no-grid'; })()", False),
                ("(() => { return Boolean(window.CLE.slicer.visualizerGroup && window.CLE.slicer.visualizerGroup.parent); })()", False),
                ("(() => { const vg = window.CLE.slicer.visualizerGroup; return { hasLines: vg.children.some(c => c.type === 'LineSegments'), hasPoints: vg.children.some(c => c.type === 'Points'), hasOrangePlane: vg.children.some(c => c.name === 'CLE_CNC_Top_Start_Surface') }; })()", False),
                ("(() => { window.CLE.openManualControlCenter(); window.CLE.fluidnc.connectionType = 'websocket'; window.CLE.fluidnc.updateConnectionUI(true); return document.getElementById('cle-man-conn-status').textContent; })()", False)
            ]
            for idx, (c, await_promise) in enumerate(checks, start=10):
                await ws.send(json.dumps({
                    "id": idx,
                    "method": "Runtime.evaluate",
                    "params": {"expression": c, "returnByValue": True, "awaitPromise": await_promise}
                }))
            
            while True:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    data = json.loads(msg)
                    if "id" in data and data["id"] >= 10:
                        req_idx = data["id"] - 10
                        res = data.get("result", {}).get("result", {})
                        val = res.get("value", res.get("description", res))
                        print(f"CHECK [{checks[req_idx][0]}]: {val}")
                except asyncio.TimeoutError:
                    break
    finally:
        proc.terminate()

asyncio.run(run())
