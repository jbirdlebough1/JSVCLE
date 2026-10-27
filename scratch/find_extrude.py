with open('Dev/index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r't\s*:\s*["\']extrude["\']', text)]
for idx in matches:
    print('extrude at:', idx)
    print(text[max(0, idx-100):min(len(text), idx+300)])
