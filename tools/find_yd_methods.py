with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('Found Yd at:') # or 11312274
sub = text[11312274:11312274 + 12000]
import re
methods = [m.start() for m in re.finditer(r'\n\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{', sub)]
for m in methods:
    print("Method:", sub[m:m+120])
