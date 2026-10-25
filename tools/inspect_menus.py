import re

with open(r'D:\CLEJS\Dev\index.htm', 'r', encoding='utf-8') as f:
    text = f.read()

print("File size:", len(text))
matches = [m.start() for m in re.finditer(r'id=["\']mode-advanced["\']', text)]
print("mode-advanced matches:", len(matches))
for idx in matches:
    print("--- Context around mode-advanced ---")
    start = max(0, idx - 200)
    end = min(len(text), idx + 400)
    print(text[start:end])

# Also search for how menus/ribbons are structured in the HTML
matches_ribbon = [m.start() for m in re.finditer(r'class=["\']ribbon["\']', text)]
print("\nribbon matches:", len(matches_ribbon))
for idx in matches_ribbon:
    print("--- Context around ribbon ---")
    start = max(0, idx - 100)
    end = min(len(text), idx + 500)
    print(text[start:end])
