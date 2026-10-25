with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

idx = text.find('class:"wstabs"')
idx_wb = text.find('function Wb(')
print("idx wstabs:", idx, "idx Wb:", idx_wb)
# Search backward from idx to find where bo is defined
sub = text[idx - 5000:idx]
for line in sub.split(';'):
    if 'bo' in line:
        print("Line with bo:", line)
