import re

with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function Wb(')
if idx != -1:
    # Look for return inside Wb or ribbon rendering
    sub = text[idx:idx+15000]
    # find ribbon references
    ribbon_matches = [m.start() for m in re.finditer(r'ribbon', sub)]
    for rm in ribbon_matches:
        print("Ribbon ref:", sub[max(0, rm-60):min(len(sub), rm+120)])
