import re

with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

# Search for "Extrude" or "Sketch" in ribbon
matches = [m.start() for m in re.finditer(r'title=["\']Extrude|Extrude \(E\)|>Extrude<|title=["\']New sketch', text, re.I)]
print("Extrude/Sketch matches:", len(matches))
for idx in matches:
    print("Match:", text[max(0, idx-100):min(len(text), idx+150)])
