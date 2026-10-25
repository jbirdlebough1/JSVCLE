import re
with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function Wb(')
sub = text[idx:idx+35000]
matches = [m.start() for m in re.finditer(r'Vr\s*=', sub)]
for m in matches:
    print(sub[max(0, m-50):min(len(sub), m+200)])
