#!/usr/bin/env python3
"""
CLEJS Local Background Server
Runs on CL3 (localhost:8765) using Python standard library only.
Handles Git Design Vault (MEAGCLE architecture), PrusaSlicer CLI invocation,
Controller Profile storage, and hardware IO fallback.
"""

import sys
import os
import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = 8765
PROJECT_ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = PROJECT_ROOT / "tools"
VAULT_DIR = PROJECT_ROOT / "vault"
PROJECTS_DIR = VAULT_DIR / "projects"
PROFILES_DIR = VAULT_DIR / "profiles"
MACHINES_DIR = VAULT_DIR / "machines"
PRUSA_BINARY_DIR = TOOLS_DIR / "PrusaSlicer"

VAULT_DIR.mkdir(parents=True, exist_ok=True)
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
PROFILES_DIR.mkdir(parents=True, exist_ok=True)
MACHINES_DIR.mkdir(parents=True, exist_ok=True)


class GitVaultEngine:
    def __init__(self, git_bin=None):
        self.git_bin = git_bin or shutil.which("git") or "git"

    def _run_git(self, repo_dir: Path, args):
        cmd = [self.git_bin] + args
        cflags = getattr(subprocess, "CREATE_NO_WINDOW", 0x08000000)
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "echo"}
        try:
            res = subprocess.run(
                cmd,
                cwd=str(repo_dir),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=cflags,
                env=env,
                timeout=20
            )
            return res.returncode, res.stdout.strip(), res.stderr.strip()
        except Exception as e:
            return -1, "", str(e)

    def ensure_repo(self, project_dir: Path):
        project_dir.mkdir(parents=True, exist_ok=True)
        git_dir = project_dir / ".git"
        if not git_dir.exists():
            code, _, _ = self._run_git(project_dir, ["init", "-b", "main"])
            if code != 0:
                self._run_git(project_dir, ["init"])
            self._run_git(project_dir, ["config", "user.name", "CLE Operator"])
            self._run_git(project_dir, ["config", "user.email", "cle@localhost"])
            gitignore = project_dir / ".gitignore"
            if not gitignore.exists():
                gitignore.write_text("*.tmp\n*.bak\nThumbs.db\n", encoding="utf-8")
            return {"status": "initialized", "path": str(project_dir)}
        return {"status": "exists", "path": str(project_dir)}

    def take_snapshot(self, project_dir: Path, description: str, payload_data: dict, author="CLE Operator"):
        self.ensure_repo(project_dir)
        
        # Write project data files
        if payload_data:
            if "doc" in payload_data:
                (project_dir / "project_doc.json").write_text(json.dumps(payload_data["doc"], indent=2), encoding="utf-8")
            if "slicer" in payload_data:
                (project_dir / "slicer_settings.json").write_text(json.dumps(payload_data["slicer"], indent=2), encoding="utf-8")
            if "profile" in payload_data:
                (project_dir / "controller_profile.json").write_text(json.dumps(payload_data["profile"], indent=2), encoding="utf-8")
            if "machine" in payload_data:
                (project_dir / "machine_config.json").write_text(json.dumps(payload_data["machine"], indent=2), encoding="utf-8")

        self._run_git(project_dir, ["add", "."])
        commit_msg = (description or "Project checkpoint").strip()
        code, out, err = self._run_git(project_dir, ["commit", "-m", commit_msg])

        if code != 0 and "nothing to commit" in (out + err):
            return {"status": "clean", "message": "No changes to snapshot (working tree clean)."}

        _, rev_hash, _ = self._run_git(project_dir, ["rev-parse", "HEAD"])
        _, rev_date, _ = self._run_git(project_dir, ["log", "-1", "--format=%ad", "--date=iso"])

        return {
            "status": "ok",
            "commit_hash": rev_hash,
            "short_hash": rev_hash[:7] if rev_hash else "",
            "date": rev_date,
            "message": commit_msg,
            "project_dir": str(project_dir)
        }

    def get_history(self, project_dir: Path, query="", limit=50):
        if not (project_dir / ".git").exists():
            return []
        fmt = "%H|%h|%an|%ad|%s"
        code, out, _ = self._run_git(project_dir, ["log", f"-n{limit}", f"--format={fmt}", "--date=relative"])
        if code != 0 or not out:
            return []

        records = []
        q = (query or "").strip().lower()
        for line in out.splitlines():
            parts = line.split("|", 4)
            if len(parts) == 5:
                fhash, shash, author, date_rel, msg = parts
                if q and q not in msg.lower() and q not in shash.lower():
                    continue
                records.append({
                    "commit_hash": fhash,
                    "short_hash": shash,
                    "author": author,
                    "date": date_rel,
                    "message": msg
                })
        return records

    def restore_snapshot(self, project_dir: Path, commit_hash: str):
        if not (project_dir / ".git").exists():
            raise RuntimeError(f"No Git repository in {project_dir}")

        # Safety checkpoint before restore
        self.take_snapshot(project_dir, f"Auto-checkpoint before restore to {commit_hash[:7]}", {})

        # Checkout snapshot files
        code, _, err = self._run_git(project_dir, ["checkout", commit_hash, "--", "."])
        if code != 0:
            raise RuntimeError(f"Failed to restore: {err}")

        # Read restored project data
        restored = {}
        doc_file = project_dir / "project_doc.json"
        if doc_file.exists():
            try:
                restored["doc"] = json.loads(doc_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        slicer_file = project_dir / "slicer_settings.json"
        if slicer_file.exists():
            try:
                restored["slicer"] = json.loads(slicer_file.read_text(encoding="utf-8"))
            except Exception:
                pass
        profile_file = project_dir / "controller_profile.json"
        if profile_file.exists():
            try:
                restored["profile"] = json.loads(profile_file.read_text(encoding="utf-8"))
            except Exception:
                pass

        return {
            "status": "ok",
            "restored_hash": commit_hash,
            "data": restored
        }


vault_engine = GitVaultEngine()


class CLERequestHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors_headers()
        self.end_headers()

    def _get_project_dir(self, name):
        safe_name = "".join([c if c.isalnum() or c in ("-", "_") else "_" for c in (name or "JumpStart_Project")]).strip("_")
        return PROJECTS_DIR / (safe_name or "JumpStart_Project")

    def do_GET(self):
        parsed = urlparse(self.path)
        clean_path = parsed.path
        query = parse_qs(parsed.query)

        if clean_path == "/api/status":
            prusa_path = self._find_prusa_cli()
            data = {
                "server": "CLE_server",
                "status": "running",
                "host": "CL3",
                "python": sys.version,
                "git_available": bool(shutil.which("git")),
                "prusa_cli_found": prusa_path is not None,
                "prusa_path": str(prusa_path) if prusa_path else None
            }
            self._send_json(200, data)

        elif clean_path == "/api/vault/status":
            proj_name = query.get("project", ["JumpStart_Project"])[0]
            pdir = self._get_project_dir(proj_name)
            has_repo = (pdir / ".git").exists()
            self._send_json(200, {
                "status": "ok",
                "project_name": proj_name,
                "project_dir": str(pdir).replace("\\", "/"),
                "has_repo": has_repo,
                "git_available": bool(shutil.which("git"))
            })

        elif clean_path == "/api/vault/history":
            proj_name = query.get("project", ["JumpStart_Project"])[0]
            q = query.get("query", [""])[0]
            limit = int(query.get("limit", [50])[0])
            pdir = self._get_project_dir(proj_name)
            records = vault_engine.get_history(pdir, query=q, limit=limit)
            self._send_json(200, {"status": "ok", "history": records})

        elif clean_path == "/api/vault/profiles":
            profiles = []
            for pfile in PROFILES_DIR.glob("*.json"):
                try:
                    data = json.loads(pfile.read_text(encoding="utf-8"))
                    profiles.append({"name": pfile.stem, "profile": data})
                except Exception:
                    pass
            self._send_json(200, {"status": "ok", "profiles": profiles})

        elif clean_path == "/api/vault/machines":
            machines = []
            for mfile in MACHINES_DIR.glob("*.json"):
                try:
                    data = json.loads(mfile.read_text(encoding="utf-8"))
                    machines.append(data)
                except Exception:
                    pass
            self._send_json(200, {"status": "ok", "machines": machines})

        elif clean_path == "/api/vault":
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

        parsed = urlparse(self.path)
        clean_path = parsed.path

        if clean_path == "/api/vault/snapshot":
            proj_name = payload.get("project", "JumpStart_Project")
            desc = payload.get("description", "Manual snapshot")
            data = payload.get("data", {})
            pdir = self._get_project_dir(proj_name)
            res = vault_engine.take_snapshot(pdir, desc, data)
            self._send_json(200, res)

        elif clean_path == "/api/vault/restore":
            proj_name = payload.get("project", "JumpStart_Project")
            commit_hash = payload.get("commit_hash", "")
            pdir = self._get_project_dir(proj_name)
            try:
                res = vault_engine.restore_snapshot(pdir, commit_hash)
                self._send_json(200, res)
            except Exception as e:
                self._send_json(500, {"status": "error", "message": str(e)})

        elif clean_path == "/api/vault/profile/save":
            name = payload.get("name", "Default_Profile")
            mapping = payload.get("mapping", {})
            safe_name = "".join([c if c.isalnum() or c in ("-", "_") else "_" for c in name]).strip("_")
            pfile = PROFILES_DIR / f"{safe_name}.json"
            pfile.write_text(json.dumps(mapping, indent=2), encoding="utf-8")
            self._send_json(200, {"status": "ok", "name": safe_name, "path": str(pfile)})

        elif clean_path == "/api/vault/machine/save":
            mach = payload.get("machine", {})
            mid = mach.get("id") or ("mach_" + str(int(payload.get("timestamp", 1))))
            safe_id = "".join([c if c.isalnum() or c in ("-", "_") else "_" for c in mid]).strip("_")
            mach["id"] = safe_id
            mfile = MACHINES_DIR / f"{safe_id}.json"
            mfile.write_text(json.dumps(mach, indent=2), encoding="utf-8")
            self._send_json(200, {"status": "ok", "machine": mach})

        elif clean_path == "/api/vault/machine/delete":
            mid = payload.get("id", "")
            safe_id = "".join([c if c.isalnum() or c in ("-", "_") else "_" for c in mid]).strip("_")
            mfile = MACHINES_DIR / f"{safe_id}.json"
            if mfile.exists():
                mfile.unlink()
            self._send_json(200, {"status": "ok", "id": safe_id})

        elif clean_path == "/api/vault/sync":
            vault_file = VAULT_DIR / "vault_data.json"
            with open(vault_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2)
            self._send_json(200, {"success": True, "saved_to": str(vault_file)})

        elif clean_path == "/api/slice/prusa":
            stl_content = payload.get("stl", "")
            if not stl_content:
                self._send_json(400, {"error": "No STL geometry provided."})
                return

            options = payload.get("options", {})
            layer_height = options.get("layerHeight", 0.2)
            infill = options.get("infill", 20)
            mode = options.get("mode", "cnc")

            prusa_exe = self._find_prusa_cli()
            if not prusa_exe:
                # Structured fallback
                fallback_gcode = (
                    f"; --- CLEJS Slicer Fallback Toolpath ({mode.upper()}) ---\n"
                    f"G21 ; Millimeters\n"
                    f"G90 ; Absolute coordinates\n"
                    f"G0 Z5 F1000\n"
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
                    "warning": "PrusaSlicer binary not in tools/PrusaSlicer. Using native JS fallback.",
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
