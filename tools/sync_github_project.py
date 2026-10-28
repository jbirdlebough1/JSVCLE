#!/usr/bin/env python3
"""
JSVCLE GitHub Project & Issues Automator
Creates issues for CLEJS-001 through CLEJS-005 on https://github.com/jbirdlebough1/JSVCLE
and prints direct setup links for the Project Roadmap Board.
"""

import sys
import os
import json
import sqlite3
import urllib.request
import urllib.error
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = Path("D:/CLEBUGGER/bugs.db")

GITHUB_USER = "jbirdlebough1"
REPO_NAME = "JSVCLE"

def sync_issues_to_github(token):
    print("==========================================================")
    print("     JSVCLE GitHub Issues & Roadmap Sync Tool             ")
    print("==========================================================")
    print(f"Target: https://github.com/{GITHUB_USER}/{REPO_NAME}\n")

    if not DB_PATH.exists():
        print(f"[!] CLEBUGGER database not found at {DB_PATH}")
        return

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    bugs = conn.execute("SELECT * FROM bugs WHERE project_name = 'CLEJS' ORDER BY bug_number ASC").fetchall()
    conn.close()

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "JSVCLE-Issue-Sync"
    }

    # Fetch existing issues to avoid duplicates
    existing_url = f"https://api.github.com/repos/{GITHUB_USER}/{REPO_NAME}/issues?state=all"
    req = urllib.request.Request(existing_url, headers=headers)
    existing_titles = set()
    try:
        with urllib.request.urlopen(req) as resp:
            issues = json.loads(resp.read().decode("utf-8"))
            for iss in issues:
                existing_titles.add(iss["title"])
    except Exception as e:
        print(f"[!] Warning fetching existing issues: {e}")

    # Create issues for each bug
    api_url = f"https://api.github.com/repos/{GITHUB_USER}/{REPO_NAME}/issues"
    for b in bugs:
        title = f"[{b['bug_code']}] {b['title']}"
        if any(b['bug_code'] in t for t in existing_titles):
            print(f"  [=] Issue already exists: {title}")
            continue

        body = f"""### Defect / Feature Tracking: {b['bug_code']}
* **Build:** `{b['build_number']}`
* **Component:** `{b['component'] or 'Core'}`
* **Status:** `{b['status']}`
* **Impact (LOC):** `{b['bug_loc']}`

#### Description:
{b['comments'] or b['title']}

---
*Tracked in local CLEBUGGER database (D:\\CLEBUGGER\\bugs.db)*
"""
        payload = {
            "title": title,
            "body": body,
            "labels": ["bug" if b['status'] == "OPEN" else "enhancement"]
        }

        print(f"  -> Creating GitHub issue: {title}...")
        iss_req = urllib.request.Request(api_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(iss_req) as resp:
                created = json.loads(resp.read().decode("utf-8"))
                print(f"     [OK] Created #{created['number']}: {created['html_url']}")
                # If resolved in CLEBUGGER, close it on GitHub
                if b['status'] == "RESOLVED":
                    close_url = f"https://api.github.com/repos/{GITHUB_USER}/{REPO_NAME}/issues/{created['number']}"
                    close_payload = {"state": "closed"}
                    close_req = urllib.request.Request(close_url, data=json.dumps(close_payload).encode("utf-8"), headers=headers, method="PATCH")
                    with urllib.request.urlopen(close_req):
                        print(f"     [OK] Closed resolved issue #{created['number']}")
        except urllib.error.HTTPError as err:
            print(f"     [!] HTTP Error: {err.code} - {err.read().decode('utf-8')}")

    print("\n==========================================================")
    print("   All CLEBUGGER issues are now synchronized on GitHub!")
    print(f"   View Issues: https://github.com/{GITHUB_USER}/{REPO_NAME}/issues")
    print(f"   View Projects: https://github.com/{GITHUB_USER}/{REPO_NAME}/projects")
    print("==========================================================")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        token = sys.argv[1].strip()
    else:
        token = os.environ.get("GITHUB_TOKEN", "")

    if not token:
        print("[!] GitHub Personal Access Token required.")
        print("    Usage: python tools\\sync_github_project.py <YOUR_GITHUB_TOKEN>")
        sys.exit(1)

    sync_issues_to_github(token)
