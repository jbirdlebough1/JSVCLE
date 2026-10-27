with open('Dev/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

idx1 = text.find('["cle","CLE"]')
print('idx1:', idx1, repr(text[idx1-20:idx1+80]))

idx2 = text.find('if(Vr==="cle")')
print('idx2:', idx2, repr(text[idx2-20:idx2+120]))
