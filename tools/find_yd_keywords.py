with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

sub = text[11312274:11312274 + 15000]
import re
for name in ['setView', 'orbit', 'pan', 'zoom', 'bindInput', 'updateCamera', 'lookAt']:
    idx = sub.find(name)
    if idx != -1:
        print(f"Found {name} at {idx}:", sub[max(0, idx-20):min(len(sub), idx+200)])
