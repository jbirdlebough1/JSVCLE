import re

with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

# find bo(u)
idx = text.find('onclick:()=>bo(u)')
print(text[idx - 50:idx + 50])
# search backward from idx for "function bo" or "bo="
sub = text[idx - 10000:idx + 5000]
matches = [m.start() for m in re.finditer(r'bo\s*\(', sub)]
for m in matches:
    print("Match:", sub[max(0, m-20):min(len(sub), m+40)])
