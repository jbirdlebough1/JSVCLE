import re
with open('Dev/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

matches = [m.start() for m in re.finditer(r't:\s*["\']extrude["\']', text)]
for idx in matches[:10]:
    print('extrude at', idx, ':', text[idx-40:idx+200])

