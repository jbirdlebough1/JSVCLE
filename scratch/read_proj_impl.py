with open('Dev/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

pos = text.find('we=>H(null,we)')
print('pos:', pos)
if pos != -1:
    print(text[pos-1500:pos+300])
