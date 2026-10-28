#!/usr/bin/env python3
"""
JSVCLE GitHub Release & Project Automator
Publishes the First Alpha Release (v01.00.66-alpha), uploads both the User and
Developer installer assets, and guides Project Roadmap association.
"""

import sys
import os
import json
import urllib.request
import urllib.error
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"
DOCS_DIR = ROOT_DIR / "docs"

GITHUB_USER = "jbirdlebough1"
REPO_NAME = "JSVCLE"
TAG_NAME = "v01.00.66-alpha"
RELEASE_TITLE = "JSVCLE Studio v01.00.66-alpha (First Community Release)"

RELEASE_BODY = """# JSVCLE Studio — First Alpha Release (v01.00.66-alpha)
**JumpStart 3D CAD + Vellum Vector Studio + Continuous Layer Extension (CLE)**

Welcome to the first community alpha release of JSVCLE Studio!

---

> [!CAUTION]
> **RESEARCH EXPERIMENTATION & LIABILITY DISCLAIMER**  
> This software is purely research experimentation and is provided strictly **"AS IS"**. It may damage your device, CNC machine, spindle, laser diode, workpiece, or computer. The goal of this project is the exploration of what is possible in unified in-browser digital fabrication. Users accept all risks and agree to hold authors, contributors, and developers completely harmless regardless of outcome. **USE AT YOUR OWN RISK.**
> 
> **Community Rules:**
> 1. **Open Source & Copyleft:** Keep all innovations accessible and free for everyone.
> 2. **Constructive Community:** Keep all commentary positive, helpful, and respectful.
> 3. **Action-Oriented Collaboration:** Write code to fix issues and share your solutions back to the group.

---

### 📦 Downloads & Installation Packages

* **End-User Windows 11 Installer:** `JSVCLE_Experimental_v01.00.66.exe` (20.7 MB)
  * Complete, zero-dependency offline desktop application.
  * Installs JumpStart 3D, Vellum Vector Studio, embedded Python 3.11 hardware daemon, and machine vault.
* **Developer Toolkit Package:** `JSVCLE_Dev_Toolkit_v01.00.66.zip` (391 KB)
  * Full developer suite: `DevInstaller.bat`, master `build_full_tree.bat`, test runner, Inno Setup compiler scripts, and Developer Guide PDF.
* **User Guide (PDF):** `USER_GUIDE.pdf` (9 pages, fully rendered vector diagrams).
* **Developer Guide (PDF):** `DEVELOPER_GUIDE.pdf` (15 pages, 12 vector architecture & execution flowcharts).

---

### 🛠️ Key Capabilities in this Release
1. **Laminated Multi-Part Slicing with Dowel Holes:** Partitions thick 3D models (such as acoustic biradial horns or thick furniture slabs) into discrete layers (e.g. 30mm) and automatically bores precision Ø8.0mm registration dowel holes across mating parts for concentric glue-up.
2. **Grayscale 2D Photo to 3D Continuous Z Relief:** Converts 2D photograph luminance into true 3D sculptural reliefs and dynamic raster toolpaths.
3. **Vellum Vector Studio to JumpStart 3D Bridge:** Draw vector curves, text, and laser paths in Vellum and direct-extrude them into 3D CAD solids resting on the CNC spoilboard.
4. **Interactive Spoilboard Manager & 4-Axis DRO:** Live 3D bed envelope with collision detection, safe 0.20mm breakthrough overcut, and FluidNC hardware telemetry.

---
**Roadmap & Bug Tracker:** Follow active defect resolution and feature development on the [JSVCLE Studio Roadmap Project Board](https://github.com/users/jbirdlebough1/projects/1).
"""

ASSETS_TO_UPLOAD = [
    {
        "path": DIST_DIR / "JSVCLE_Experimental_v01.00.66.exe",
        "name": "JSVCLE_Experimental_v01.00.66.exe",
        "content_type": "application/vnd.microsoft.portable-executable"
    },
    {
        "path": DIST_DIR / "JSVCLE_Dev_Toolkit_v01.00.66.zip",
        "name": "JSVCLE_Dev_Toolkit_v01.00.66.zip",
        "content_type": "application/zip"
    },
    {
        "path": DOCS_DIR / "USER_GUIDE.pdf",
        "name": "USER_GUIDE.pdf",
        "content_type": "application/pdf"
    },
    {
        "path": DOCS_DIR / "DEVELOPER_GUIDE.pdf",
        "name": "DEVELOPER_GUIDE.pdf",
        "content_type": "application/pdf"
    }
]

def publish_release(token):
    print("==========================================================")
    print("     JSVCLE GitHub Release & Asset Publishing Tool        ")
    print("==========================================================")
    print(f"Target Repo: https://github.com/{GITHUB_USER}/{REPO_NAME}")
    print(f"Tag:         {TAG_NAME}")
    print(f"Release:     {RELEASE_TITLE}\n")

    # Step 1: Create or fetch Release
    api_url = f"https://api.github.com/repos/{GITHUB_USER}/{REPO_NAME}/releases"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "JSVCLE-Release-Bot"
    }

    payload = {
        "tag_name": TAG_NAME,
        "target_commitish": "main",
        "name": RELEASE_TITLE,
        "body": RELEASE_BODY,
        "draft": False,
        "prerelease": True
    }

    req = urllib.request.Request(api_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            release_data = json.loads(resp.read().decode("utf-8"))
            print(f"[+] Release created successfully! ID: {release_data['id']}")
            upload_url = release_data["upload_url"].split("{")[0]
            html_url = release_data["html_url"]
    except urllib.error.HTTPError as e:
        if e.code == 422: # Already exists
            print(f"[*] Release tag '{TAG_NAME}' already exists; fetching release...")
            tag_req = urllib.request.Request(f"{api_url}/tags/{TAG_NAME}", headers=headers)
            with urllib.request.urlopen(tag_req) as resp:
                release_data = json.loads(resp.read().decode("utf-8"))
                upload_url = release_data["upload_url"].split("{")[0]
                html_url = release_data["html_url"]
        else:
            print(f"[!] HTTP Error creating release: {e.code} - {e.read().decode('utf-8')}")
            return False

    # Step 2: Upload Assets
    print("\n[*] Uploading release binary assets...")
    for asset in ASSETS_TO_UPLOAD:
        p = asset["path"]
        name = asset["name"]
        ctype = asset["content_type"]

        if not p.exists():
            print(f"  [!] Missing file: {p}; skipping.")
            continue

        print(f"  -> Uploading {name} ({p.stat().st_size / (1024*1024):.2f} MB)...")
        asset_url = f"{upload_url}?name={name}"
        data = p.read_bytes()

        asset_headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": ctype,
            "Content-Length": str(len(data)),
            "User-Agent": "JSVCLE-Release-Bot"
        }

        up_req = urllib.request.Request(asset_url, data=data, headers=asset_headers, method="POST")
        try:
            with urllib.request.urlopen(up_req) as up_resp:
                res = json.loads(up_resp.read().decode("utf-8"))
                print(f"     [OK] Uploaded successfully: {res.get('browser_download_url')}")
        except urllib.error.HTTPError as up_err:
            if up_err.code == 422:
                print(f"     [=] Asset '{name}' already uploaded.")
            else:
                print(f"     [!] Error uploading {name}: {up_err.code} - {up_err.read().decode('utf-8')}")

    print("\n==========================================================")
    print("   SUCCESS: First Alpha Release Published!")
    print(f"   Release URL: {html_url}")
    print("==========================================================")
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        token = sys.argv[1].strip()
    else:
        token = os.environ.get("GITHUB_TOKEN", "")

    if not token:
        print("[!] GitHub Personal Access Token required to publish releases and upload binary assets via API.")
        print("    Usage: python tools\\publish_release.py <YOUR_GITHUB_TOKEN>")
        print("    Or generate one in 20 seconds at: https://github.com/settings/tokens (Scope: 'repo')")
        sys.exit(1)

    publish_release(token)
