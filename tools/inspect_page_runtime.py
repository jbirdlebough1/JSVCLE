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
                ("window.CLE.bed.bedGroup.children.length", False),
                ("window.CLE.bed.config.spoilboardThickness", False),
                ("window.CLE.vault.getActiveMachine().wifiIP", False),
                ("window.CLE.vault.getActiveMachine().spoilboardThickness", False),
                ("window.CLE.gamepad.mode", False),
                ("(() => { window.CLE.slicer.slicedLayers = [{ z: 0, points: [{x:0,y:0,z:0},{x:100,y:100,z:0}] }, { z: -1, points: [{x:0,y:0,z:-1},{x:100,y:100,z:-1}] }]; window.CLE.slicer.renderSlicedStackToVisualizer(); return Boolean(window.CLE.slicer.visualizerGroup && window.CLE.slicer.visualizerGroup.parent); })()", False),
                ("typeof window.CLE.slicer.sliceGrayscaleHeightmap === 'function'", False),
                ("(async () => { const layers = await window.CLE.slicer.sliceGrayscaleHeightmap(null, { sliceCount: 4, bitDepth: '8bit', mode: 'cnc' }); return layers.length; })()", True),
                ("Boolean(window.CLE.fluidnc.triggerToolChange && window.CLE.fluidnc.continueAfterToolChange && window.CLE.fluidnc.compensateAxis && window.CLE.moveCurrentPoint)", False),
                ("Boolean(window.CLE.vault.getCameraConfig && window.CLE.vault.saveCameraConfig)", False),
                ("(() => { window.CLE.slicer.mode = 'cnc'; window.CLE.slicer.slicedLayers = [{ z: 5, points: [{x:0,y:0,z:5},{x:10,y:10,z:5}] }, { z: 0, points: [{x:0,y:0,z:0},{x:10,y:10,z:0}] }]; window.CLE.slicer.renderSlicedStackToVisualizer(); return window.CLE.slicer.visualizerGroup.children.some(c => c.name === 'CLE_CNC_Top_Start_Surface'); })()", False)
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
