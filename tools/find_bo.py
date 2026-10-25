with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function bo(')
if idx != -1:
    print(text[idx:idx + 800])
else:
    # find where bo = or Vr =
    idx2 = text.find('Vr===')
    print(text[idx2-200:idx2+600])
