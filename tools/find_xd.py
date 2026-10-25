with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('class Xd')
if idx == -1:
    idx = text.find('Xd=class')
print("Xd found:", idx != -1)
if idx != -1:
    print(text[idx:idx + 1200])
