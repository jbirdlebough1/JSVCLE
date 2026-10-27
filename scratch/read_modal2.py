with open('Vellum/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

pos = text.find('id="jsExportModal"')
if pos != -1:
    print('Modal HTML 2:\n', text[pos+1800:pos+4000].encode('ascii', errors='replace').decode('ascii'))
