#!/usr/bin/env python3
"""
CLEJS Local Background Server
Runs on CL3 (localhost:8765) using Python standard library only.
Handles PrusaSlicer CLI invocation, local vault disk persistence, and hardware IO fallback.
"""

import sys
import os
import json
import subprocess
import tempfile
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 8765
PROJECT_ROOT = Path("D:/CLEJS")
TOOLS_DIR = PROJECT_ROOT / "tools"
VAULT_DIR = PROJECT_ROOT / "vault"
PRUSA_BINARY_DIR = TOOLS_DIR / "PrusaSlicer"

VAULT_DIR.mkdir(parents=True, exist_ok=True)

class CLERequestHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/status":
            prusa_path = self._find_prusa_cli()
            data = {
                "server": "CLE_server",
                "status": "running",
                "host": "CL3",
                "python": sys.version,
                "prusa_cli_found": prusa_path is not None,
                "prusa_path": str(prusa_path) if prusa_path else None
            }
            self._send_json(200, data)
        elif self.path == "/api/vault":
            vault_file = VAULT_DIR / "vault_data.json"
            if vault_file.exists():
                with open(vault_file, "r", encoding="utf-8") as f:
                    self._send_json(200, json.load(f))
            else:
                self._send_json(404, {"error": "Vault file not initialized yet."})
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        content_len = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_len).decode("utf-8")
        try:
            payload = json.loads(body) if body else {}
        except Exception:
            payload = {}

        if self.path == "/api/vault/sync":
            vault_file = VAULT_DIR / "vault_data.json"
            with open(vault_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            self._send_json(200, {"success": True, "saved_to": str(vault_file)})

        elif self.path == "/api/slice/prusa":
            stl_content = payload.get("stl", "")
            if not stl_content:
                self._send_json(400, {"error": "No STL geometry provided."})
                return

            options = payload.get("options", {})
            layer_height = options.get("layerHeight", 0.2)
            infill = options.get("infill", 20)

            prusa_exe = self._find_prusa_cli()
            if not prusa_exe:
                # Provide a structured fallback G-code preview and instructions
                fallback_gcode = (
                    f"; --- CLEJS Slicer Fallback Toolpath ---\n"
                    f"; PrusaSlicer CLI binary not found in {PRUSA_BINARY_DIR}\n"
                    f"; To enable full slicing, place free open-source PrusaSlicer in {PRUSA_BINARY_DIR}\n"
                    f"G21 ; Millimeters\n"
                    f"G90 ; Absolute coordinates\n"
                    f"; Sliced at layer height: {layer_height}mm, infill: {infill}%\n"
                    f"G0 Z5 F1000\n"
                    f"G0 X0 Y0 F3000\n"
                    f"M3 S12000\n"
                    f"G1 Z-{layer_height} F400\n"
                    f"G1 X50 Y0 F1500\n"
                    f"G1 X50 Y50\n"
                    f"G1 X0 Y50\n"
                    f"G1 X0 Y0\n"
                    f"G0 Z10\n"
                    f"M5\n"
                )
                self._send_json(200, {
                    "warning": "PrusaSlicer binary not yet installed in tools/PrusaSlicer. Using internal fallback preview.",
                    "gcode": fallback_gcode,
                    "lineCount": len(fallback_gcode.splitlines())
                })
                return

            # Execute PrusaSlicer CLI locally
            with tempfile.TemporaryDirectory() as tmpdir:
                tmp_stl = Path(tmpdir) / "input.stl"
                tmp_gcode = Path(tmpdir) / "output.gcode"
                tmp_stl.write_text(stl_content, encoding="utf-8")

                cmd = [
                    str(prusa_exe),
                    "--export-gcode",
                    "--layer-height", str(layer_height),
                    "--fill-density", f"{infill}%",
                    "--output", str(tmp_gcode),
                    str(tmp_stl)
                ]

                try:
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                    if tmp_gcode.exists():
                        gcode_out = tmp_gcode.read_text(encoding="utf-8")
                        self._send_json(200, {
                            "success": True,
                            "gcode": gcode_out,
                            "lineCount": len(gcode_out.splitlines())
                        })
                    else:
                        self._send_json(500, {
                            "error": "PrusaSlicer finished without generating output.",
                            "stderr": result.stderr,
                            "stdout": result.stdout
                        })
                except Exception as ex:
                    self._send_json(500, {"error": str(ex)})
        else:
            self._send_json(404, {"error": "Not found"})

    def _send_json(self, status_code, data):
        self.send_response(status_code)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def _find_prusa_cli(self):
        candidates = [
            PRUSA_BINARY_DIR / "prusa-slicer-console.exe",
            PRUSA_BINARY_DIR / "prusa-slicer.exe",
            Path("C:/Program Files/Prusa3D/PrusaSlicer/prusa-slicer-console.exe")
        ]
        for c in candidates:
            if c.exists():
                return c
        return None

def main():
    server = HTTPServer(("127.0.0.1", PORT), CLERequestHandler)
    print(f"[CLE_server] Serving locally on http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[CLE_server] Shutting down.")

if __name__ == "__main__":
    main()

