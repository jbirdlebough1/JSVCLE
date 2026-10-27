import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/cle_tools/cle_slicer.js", "r", encoding="utf-8") as f:
    text = f.read()

idx = text.find("getActiveBodyGeometry(")
print("getActiveBodyGeometry at:", idx)
print(text[idx:idx+1500])
