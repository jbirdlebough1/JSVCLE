import subprocess
import time
import urllib.request
import json
from pathlib import Path

sandbox = Path("D:/CLEJS/test_install_sandbox")
python_exe = sandbox / "tools" / "python_runtime" / "python.exe"
server_py = sandbox / "tools" / "CLE_server.py"

print("[TEST] Checking sandbox files...")
assert (sandbox / "Dev" / "index.htm").exists(), "Dev/index.htm missing in sandbox!"
assert (sandbox / "Vellum" / "index.htm").exists(), "Vellum/index.htm missing in sandbox!"
assert (sandbox / "cle_start.bat").exists(), "cle_start.bat missing in sandbox!"
assert (sandbox / "cle_server_start.bat").exists(), "cle_server_start.bat missing in sandbox!"
assert (sandbox / "vellum_start.bat").exists(), "vellum_start.bat missing in sandbox!"
assert python_exe.exists(), "Embedded python missing in sandbox!"
assert server_py.exists(), "CLE_server.py missing in sandbox!"
print("  [OK] All files verified in test sandbox.")

print("[TEST] Launching CLE_server from sandbox...")
proc = subprocess.Popen([str(python_exe), str(server_py)], cwd=str(sandbox))
time.sleep(2)

try:
    with urllib.request.urlopen("http://127.0.0.1:8765/api/status", timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        print("  [SERVER RESPONSE]:", data)
        assert data.get("server") == "CLE_server", "Invalid server response!"
        assert data.get("status") == "running", "Server not running!"
    print("  [OK] CLE_server started and responded on http://127.0.0.1:8765/api/status!")
finally:
    proc.terminate()
    proc.wait()
    print("[TEST] CLE_server terminated successfully.")

print("[TEST] ALL SANDBOX TESTS PASSED!")

