with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('onclick:()=>bo(u)')
if idx != -1:
    print(text[max(0, idx - 400):min(len(text), idx + 200)])
