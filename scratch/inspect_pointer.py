import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/index.htm", "r", encoding="utf-8") as f:
    text = f.read()

idx = text.find("function Wb(")
print("function Wb at:", idx)
print(text[idx:idx+2500])

