with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

sub = text[11312274:11312274 + 15000]
idx = sub.find('panBy(')
idx2 = sub.find('panBy(', idx + 1)
print(sub[idx2-20:idx2+400])
