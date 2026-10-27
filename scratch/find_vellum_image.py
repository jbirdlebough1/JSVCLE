with open('Vellum/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

import re
matches = [m.start() for m in re.finditer(r'type\s*===\s*[\'"]image[\'"]', text)]
for idx in matches[:10]:
    print('image match at', idx, ':\n', text[idx-20:idx+250])
