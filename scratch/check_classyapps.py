import urllib.request
import re

req = urllib.request.Request('https://classyapps.org/', headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
    
    print("Page fetched successfully. Length:", len(html))
    links = re.findall(r'href\s*=\s*["\']([^"\']+)["\']', html, re.I)
    for l in links:
        if any(k in l.lower() for k in ['vellum', 'vector', 'studio', 'jumpstart', 'assets']):
            print("Link:", l)
            
    # Also find text mentions
    for line in html.split('\n'):
        if any(k in line.lower() for k in ['vellum', 'vector']):
            print("Text line:", line.strip())
except Exception as e:
    print("Error:", e)

