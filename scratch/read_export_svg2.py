with open('VVSource/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for i, l in enumerate(lines):
    if 'async function exportSVG' in l:
        for j in range(i+70, min(i+85, len(lines))):
            print(lines[j], end='')
        break
