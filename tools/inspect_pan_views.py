with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('Yd.VIEWS')
if idx != -1:
    print("Yd.VIEWS:", text[idx:idx + 500])

idx_pan = text.find('panBy(')
idx_pan2 = text.find('panBy(', idx_pan + 1)
print("panBy def:", text[idx_pan2-30:idx_pan2+600])
