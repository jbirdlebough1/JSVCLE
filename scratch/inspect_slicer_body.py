import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/cle_tools/cle_boot.js", "r", encoding="utf-8") as f:
    text = f.read()

idx = text.find("id=\"cle-gray-browse-btn\"")
print("idx browse-btn HTML:", idx)
print(text[idx-200:idx+400])

