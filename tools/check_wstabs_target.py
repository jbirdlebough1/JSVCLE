with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

target = '...[["design","Design"],["print","3D Print Sim"],["simulate","Simulate"]]'
idx = text.find(target)
print("target found:", idx != -1)
if idx != -1:
    print(text[idx-100:idx+250])
