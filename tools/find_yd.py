with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('class Yd')
if idx == -1:
    idx = text.find('function Yd')
print("Found Yd at:", idx)
if idx != -1:
    print(text[idx:idx + 3500])
