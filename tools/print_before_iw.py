with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx_iw = text.find('function iw(')
print(text[idx_iw - 1000:idx_iw])
