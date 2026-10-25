with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('if(Vr==="simulate"){')
if idx != -1:
    print(text[idx:idx + 1500])
