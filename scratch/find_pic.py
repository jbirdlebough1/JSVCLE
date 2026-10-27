with open('Dev/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

pos = 11735200
idx = text.rfind('function An(', 0, pos)
print('An found at:', idx)
if idx != -1:
    print(text[idx:idx+1200])

