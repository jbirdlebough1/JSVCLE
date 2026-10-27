with open('Vellum/index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

import re
types = set(re.findall(r"type\s*[:=]\s*['\"]([a-zA-Z0-9_-]+)['\"]", text))
print('Object types in Vellum:', types)

