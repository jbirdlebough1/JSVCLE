import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/index.htm", "r", encoding="utf-8") as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'\.image\b', text)]
print(f"Found {len(matches)} .image matches:")
for m in matches[:10]:
    print("--- MATCH AT", m)
    print(text[m-50:m+250])
