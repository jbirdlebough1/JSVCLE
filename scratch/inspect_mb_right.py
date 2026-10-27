with open('Vellum/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

pos = text.find('id="stdbar"')
if pos != -1:
    print('stdbar:\n', text[pos-50:pos+800].encode('ascii', errors='replace').decode('ascii'))
