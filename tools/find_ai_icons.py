with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('ai[O.icon]')
print(text[idx - 50:idx + 50])

# find where ai= or var ai= is defined
import re
matches = [m.start() for m in re.finditer(r'var\s+ai\s*=|let\s+ai\s*=|const\s+ai\s*=', text)]
for m in matches:
    print(text[m:m+200])
