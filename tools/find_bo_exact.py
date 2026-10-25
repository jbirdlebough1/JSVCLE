with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('class:"wstabs"')
print(text[idx - 200:idx + 50])
