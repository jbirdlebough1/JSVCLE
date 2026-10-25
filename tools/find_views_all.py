with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'\.VIEWS\b', text)]
for m in matches:
    print(text[m-30:m+200])
