with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('["cle","CLE"]')
print("Found wstabs CLE:", idx != -1)
if idx != -1:
    print(text[idx-50:idx+150])

idx2 = text.find('if(Vr==="cle")')
print("Found router CLE:", idx2 != -1)
if idx2 != -1:
    print(text[idx2:idx2+150])

print("\nLast 200 characters:")
print(text[-200:])
