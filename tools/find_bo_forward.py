with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('onclick:()=>bo(u)')
# search forward for "function bo"
sub = text[idx:idx + 50000]
import re
matches = [m.start() for m in re.finditer(r'(function\s+bo\b|\bbo\s*=)', sub)]
for m in matches:
    print("Forward Def:", sub[max(0, m-20):min(len(sub), m+100)])
