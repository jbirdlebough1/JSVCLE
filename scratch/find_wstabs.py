with open('Dev/index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

pos = 0
while True:
    pos = text.find('wstabs', pos)
    if pos == -1:
        break
    print(f"Found wstabs at {pos}:")
    print(text[max(0, pos-100):min(len(text), pos+300)])
    print("-" * 50)
    pos += 6
