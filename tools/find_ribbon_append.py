import re

with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('function Wb(')
if idx != -1:
    sub = text[idx:idx+45000]
    refs = [m.start() for m in re.finditer(r's\.(append|innerHTML|replaceChildren)', sub)]
    for rm in refs:
        print("s.append/innerHTML:", sub[max(0, rm-40):min(len(sub), rm+100)])
