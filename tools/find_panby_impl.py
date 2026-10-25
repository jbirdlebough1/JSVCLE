with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

sub = text[11312274:11312274 + 30000]
idx = sub.find('panBy(')
# print definition
idx_def = sub.find('panBy(', idx + 1)
print(sub[idx_def - 40:idx_def + 400])
