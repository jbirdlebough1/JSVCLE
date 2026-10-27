import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/cle_tools/cle_boot.js", "r", encoding="utf-8") as f:
    text = f.read()

idx3 = text.find("} else if (type === 'slicer') {", 70000)
print("idx3:", idx3)
print(text[idx3-150:idx3+150])

