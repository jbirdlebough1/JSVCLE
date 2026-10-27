import os
import shutil

os.makedirs('Vellum', exist_ok=True)
src = 'VVSource/index.htm'
dest = 'Vellum/index.htm'
shutil.copyfile(src, dest)
print(f"Copied {src} to {dest} ({os.path.getsize(dest)} bytes)")

