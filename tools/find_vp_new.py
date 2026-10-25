with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('xe.vp=new ')
print(text[idx-50:idx+400])
