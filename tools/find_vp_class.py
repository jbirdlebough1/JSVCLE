import re
with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx_iw = text.find('function iw(')
sub = text[idx_iw - 35000:idx_iw]
matches = [m.start() for m in re.finditer(r'(class\s+Kd\b|function\s+Kd\b|var\s+Kd\s*=|let\s+Kd\s*=|const\s+Kd\s*=)', sub)]
for m in matches:
    print(sub[m:m+500])
