with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

sub = text[11312274:11312274 + 30000]
import re
matches = [m.start() for m in re.finditer(r'VIEWS\s*[:=]', sub)]
for m in matches:
    print(sub[m-20:m+400])
