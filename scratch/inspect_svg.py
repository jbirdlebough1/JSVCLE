with open('scratch/vellum_v1.6.htm', 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'function exportSVG' in line:
        print(f"exportSVG defined at line {i+1}:")
        for j in range(i, min(i + 80, len(lines))):
            print(lines[j], end='')
        break

