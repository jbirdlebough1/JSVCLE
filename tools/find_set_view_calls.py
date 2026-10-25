with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'\.setView\(', text)]
for m in matches[:15]:
    print(text[m-20:m+80])
