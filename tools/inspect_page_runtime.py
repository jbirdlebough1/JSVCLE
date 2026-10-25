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
                ("(() => { return { camTarget: [app.vp.view.target.x, app.vp.view.target.y, app.vp.view.target.z], gridVisible: app.vp.grid ? app.vp.grid.visible : false }; })()", False),
                ("Boolean(window.CLE.bed.bedGroup.getObjectByName('CLE_MM_LB_Tool_Lines_Overlay'))", False),
                ("Boolean(window.CLE.bed.bedGroup.getObjectByName('CLE_T1_Bed_Boundary'))", False),
                ("Boolean(window.CLE.bed.bedGroup.getObjectByName('CLE_T2_Keepout_Buffer'))", False),
                ("Boolean(window.CLE.bed.bedGroup.getObjectByName('CLE_Clamp_Keepout_Zones'))", False),
                ("(() => { const slab = window.CLE.bed.bedGroup.getObjectByName('CLE_Spoilboard_Slab'); return { renderOrder: slab.renderOrder, opacity: slab.material.opacity }; })()", False),
                ("(() => { window.CLE.bed.toggle(); const hidden = !window.CLE.bed.bedGroup.visible; window.CLE.bed.toggle(); const shown = window.CLE.bed.bedGroup.visible; return { toggleHides: hidden, toggleShows: shown }; })()", False)
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
