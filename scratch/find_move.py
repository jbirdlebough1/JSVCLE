import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/index.htm", "r", encoding="utf-8") as f:
    text = f.read()

idx = 11371549
print(text[idx-500:idx+1000])

