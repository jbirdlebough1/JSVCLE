import re

with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

# Search for switchMode or "advanced"
matches = [m.start() for m in re.finditer(r'switchMode', text)]
print("switchMode matches:", len(matches))
for idx in matches:
    print("--- Context around switchMode ---")
    start = max(0, idx - 100)
    end = min(len(text), idx + 600)
    print(text[start:end])
