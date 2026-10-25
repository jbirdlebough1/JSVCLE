import re

with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

matches = [m.start() for m in re.finditer(r'xe\.refreshUI\s*=', text)]
print("xe.refreshUI matches:", len(matches))
for idx in matches:
    print("--- Context around xe.refreshUI ---")
    start = max(0, idx - 100)
    end = min(len(text), idx + 800)
    print(text[start:end])
