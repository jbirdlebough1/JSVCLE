with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('class:"wstabs"')
if idx != -1:
    print(text[max(0, idx - 600):min(len(text), idx + 800)])
