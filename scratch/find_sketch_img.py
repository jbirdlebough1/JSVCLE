with open('Dev/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'\.image\b', text[11000000:12000000])]
for idx in matches:
    pos = 11000000 + idx
    print('pos:', pos, text[pos-30:pos+150])

