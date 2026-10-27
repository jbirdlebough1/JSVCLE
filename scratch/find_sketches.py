import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/index.htm", "r", encoding="utf-8") as f:
    text = f.read()

idx = 11380794
print(text[idx:idx+1500])

