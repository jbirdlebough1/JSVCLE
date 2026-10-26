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
            await ws.send(json.dumps({"id": 2, "method": "Log.enable"}))
            await asyncio.sleep(1)
            
            checks = [
                ("(() => { app.setMode('advanced'); return true; })()", False),
                ("(() => { document.getElementById('ws-cle').click(); return true; })()", False),
                ("(() => { return { rootZ: app.scene.root.position.z, bedVisible: window.CLE.bed.visible, spoilboardThickness: window.CLE.bed.config.spoilboardThickness }; })()", False),
                ("(() => { return window.CLE.bed.config; })()", False)
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
                    if "method" in data and "Console" in data["method"]:
                        print(f"CONSOLE: {data}")
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

