#!/usr/bin/env python3
"""
CLEJS - Community GitHub Export Bundler
Prepares a clean, pristine export directory ready to initialize or push to community GitHub.
Sanitizes ephemeral files, personal configurations, scratch test files, and local logs.
"""

import os
import sys
import shutil
import hashlib
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
EXPORT_DIR = ROOT_DIR / "dist" / "github_export"

EXCLUDED_DIRS = {
    ".git",
    ".gemini",
    "scratch",
    "test_install_sandbox",
    "dist",
    "__pycache__",
    ".system_generated",
    "python_runtime",  # Downloaded on-demand by DevInstaller
    ".pytest_cache"
}

EXCLUDED_FILES = {
    "server.log",
    "server_test.log",
    "install.log",
    "setup_test.log"
}

EXCLUDED_EXTENSIONS = {
    ".tmp",
    ".log",
    ".pyc",
    ".pyd"
}

def should_exclude(rel_path: Path) -> bool:
    parts = rel_path.parts
    for part in parts:
        if part in EXCLUDED_DIRS:
            return True
    if rel_path.name in EXCLUDED_FILES:
        return True
    if rel_path.suffix.lower() in EXCLUDED_EXTENSIONS:
        return True
    return False

def export():
    print(f"[EXPORT] Preparing clean GitHub export from: {ROOT_DIR}")
    if EXPORT_DIR.exists():
        print(f"[EXPORT] Removing existing export directory: {EXPORT_DIR}")
        shutil.rmtree(EXPORT_DIR)

    EXPORT_DIR.mkdir(parents=True, exist_ok=True)

    copied_files = 0
    total_bytes = 0

    for root, dirs, files in os.walk(ROOT_DIR):
        # Exclude directories in-place
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]

        rel_root = Path(root).relative_to(ROOT_DIR)
        if should_exclude(rel_root):
            continue

        for f in files:
            src_file = Path(root) / f
            rel_file = src_file.relative_to(ROOT_DIR)
            if should_exclude(rel_file):
                continue

            target_file = EXPORT_DIR / rel_file
            target_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_file, target_file)
            copied_files += 1
            total_bytes += src_file.stat().st_size

    # Ensure clean standard LICENSE and .gitignore
    create_community_metadata()

    print(f"\n[EXPORT] Successfully bundled {copied_files} files ({total_bytes / (1024*1024):.2f} MB)")
    print(f"[EXPORT] Pristine export ready at: {EXPORT_DIR}")

def create_community_metadata():
    gitignore_content = """# CLEJS Community .gitignore
# Dependencies & Runtimes
tools/python_runtime/
tools/PrusaSlicer/
tools/__pycache__/
*.pyc
*.pyo
*.pyd

# Temporary test files & scratch
scratch/
test_install_sandbox/
*.log
*.tmp
*.bak
dist/

# System / Editor caches
.system_generated/
.gemini/
.vscode/
.idea/
Thumbs.db
Desktop.ini
"""
    (EXPORT_DIR / ".gitignore").write_text(gitignore_content, encoding="utf-8")

    license_content = """MIT License

Copyright (c) 2026 JSVCLE Community

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""
    (EXPORT_DIR / "LICENSE").write_text(license_content, encoding="utf-8")

if __name__ == "__main__":
    export()
