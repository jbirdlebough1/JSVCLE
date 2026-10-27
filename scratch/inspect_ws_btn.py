import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/cle_tools/cle_boot.js", "r", encoding="utf-8") as f:
    text = f.read()

idx = text.find("const wsImgBtn = document.getElementById('cle-gray-ws-btn');")
print(text[idx-50:idx+2000])
