with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'\b(class|function|var|let|const)\s+Kd\b', text)]
for m in matches:
    print("Match at:", m, text[m:m+200])
