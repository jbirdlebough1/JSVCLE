import sys
sys.stdout.reconfigure(encoding="utf-8")
with open("Dev/cle_tools/cle_bed.js", "r", encoding="utf-8") as f:
    text = f.read()

print("Last 1000 characters of cle_bed.js:")
print(text[-1000:])

