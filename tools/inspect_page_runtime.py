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
                "typeof THREE",
                "Boolean(window.CLE.bed && window.CLE.bed.bedGroup && window.CLE.bed.bedGroup.parent)",
                "window.CLE.bed.bedGroup.children.length",
                "window.CLE.bed.config.spoilboardThickness",
                "window.CLE.vault.getActiveMachine().wifiIP",
                "window.CLE.vault.getActiveMachine().spoilboardThickness",
                "window.CLE.gamepad.mode",
                "(() => { window.CLE.slicer.slicedLayers = [{ z: 0, points: [{x:0,y:0,z:0},{x:100,y:100,z:0}] }, { z: -1, points: [{x:0,y:0,z:-1},{x:100,y:100,z:-1}] }]; window.CLE.slicer.renderSlicedStackToVisualizer(); return Boolean(window.CLE.slicer.visualizerGroup && window.CLE.slicer.visualizerGroup.parent); })()"
            ]
            for idx, c in enumerate(checks, start=10):
                await ws.send(json.dumps({
                    "id": idx,
                    "method": "Runtime.evaluate",
                    "params": {"expression": c, "returnByValue": True}
                }))
            
            while True:
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    data = json.loads(msg)
                    if "id" in data and data["id"] >= 10:
                        req_idx = data["id"] - 10
                        val = data.get("result", {}).get("result", {}).get("value")
                        print(f"CHECK [{checks[req_idx]}]: {val}")
                except asyncio.TimeoutError:
                    break
    finally:
        proc.terminate()

asyncio.run(run())
