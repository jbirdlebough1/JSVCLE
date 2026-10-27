with open('Dev/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

pos = 11896467
idx = text.rfind('function H(', 0, pos)
print('H found at:', idx)
if idx != -1:
    print(text[idx:idx+600])
