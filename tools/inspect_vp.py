with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('class Kd{')
if idx == -1:
    idx = text.find('function Kd(')
if idx != -1:
    print(text[idx:idx + 3500])
else:
    # search for e=xe.vp=new
    idx2 = text.find('xe.vp=new ')
    print(text[idx2-50:idx2+500])
