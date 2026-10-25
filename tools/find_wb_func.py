import re

with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

matches = [m.start() for m in re.finditer(r'function\s+Wb\(', text)]
print("function Wb matches:", len(matches))
for idx in matches:
    print("--- Context around function Wb ---")
    start = max(0, idx - 50)
    end = min(len(text), idx + 1000)
    print(text[start:end])
