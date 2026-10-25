with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

sub = text[11312274:11312274 + 15000]
print(sub[10400:10400 + 800])
