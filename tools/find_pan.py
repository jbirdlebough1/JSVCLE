import re

with open('Dev/index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

for m in re.finditer(r'panBy', text):
    s = max(0, m.start() - 150)
    e = min(len(text), m.start() + 250)
    print("MATCH AT", m.start())
    print(text[s:e])
    print("="*40)
