with open('Vellum/index.htm', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

pos = text.find('id="jsExportModal"')
if pos != -1:
    print('Modal HTML:\n', text[pos-50:pos+2500].encode('ascii', errors='replace').decode('ascii'))

