import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/index.htm", "r", encoding="utf-8") as f:
    text = f.read()

# Check how sketch.plane works
idx = text.find("plane:")
print("plane: occurrences:")
while idx != -1:
    print(text[idx-20:idx+120])
    idx = text.find("plane:", idx+1)
    if idx > 10500000:
        break

