import re

with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('onclick:()=>bo(u)')
sub = text[idx - 25000:idx + 5000]
matches = [m.start() for m in re.finditer(r'(function\s+bo\b|\bbo\s*=)', sub)]
for m in matches:
    print("Def:", sub[max(0, m-20):min(len(sub), m+100)])
