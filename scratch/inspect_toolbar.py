import re

with open('VVSource/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# Look for topbar or header or menu bar
pos = text.find('exportOptSvg')
if pos != -1:
    print('Around exportOptSvg:')
    print(text[pos-400:pos+600])

# Find menu container
for m in re.finditer(r'<div[^>]*id=["\']([^"\']*(?:bar|menu|header|top)[^"\']*)["\']', text, re.I):
    print('Container id:', m.group(1), text[m.start():m.start()+150])

