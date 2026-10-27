import re
import math

def parse_svg_to_jumpstart_entities(svg_str):
    # Regex to find <rect>, <circle>, <line>, and <path>
    pts = []
    ents = []
    pt_map = {}
    
    def add_pt(x, y):
        k = f"{round(x, 4)},{round(y, 4)}"
        if k in pt_map:
            return pt_map[k]
        pid = f"p_{len(pts)+1}"
        pts.append({"id": pid, "x": round(x, 4), "y": round(y, 4)})
        pt_map[k] = pid
        return pid

    # 1. Rectangles: <rect x=".." y=".." width=".." height=".."/>
    for m in re.finditer(r'<rect\s+([^>]+)/?>', svg_str):
        attrs = dict(re.findall(r'(\w+)=["\']([^"\']+)["\']', m.group(1)))
        x = float(attrs.get('x', 0))
        y = -float(attrs.get('y', 0)) # flip SVG Y to CAD Y
        w = float(attrs.get('width', 0))
        h = float(attrs.get('height', 0))
        p1 = add_pt(x, y)
        p2 = add_pt(x + w, y)
        p3 = add_pt(x + w, y - h)
        p4 = add_pt(x, y - h)
        ents.append({"id": f"e_{len(ents)+1}", "t": "line", "a": p1, "b": p2})
        ents.append({"id": f"e_{len(ents)+1}", "t": "line", "a": p2, "b": p3})
        ents.append({"id": f"e_{len(ents)+1}", "t": "line", "a": p3, "b": p4})
        ents.append({"id": f"e_{len(ents)+1}", "t": "line", "a": p4, "b": p1})

    # 2. Circles: <circle cx=".." cy=".." r=".."/>
    for m in re.finditer(r'<circle\s+([^>]+)/?>', svg_str):
        attrs = dict(re.findall(r'(\w+)=["\']([^"\']+)["\']', m.group(1)))
        cx = float(attrs.get('cx', 0))
        cy = -float(attrs.get('cy', 0))
        r = float(attrs.get('r', 0))
        c = add_pt(cx, cy)
        ents.append({"id": f"e_{len(ents)+1}", "t": "circle", "c": c, "r": r})

    return pts, ents

svg_sample = '''<svg viewBox="0 0 100 100">
  <rect x="10" y="10" width="80" height="80"/>
  <circle cx="50" cy="50" r="15"/>
</svg>'''

pts, ents = parse_svg_to_jumpstart_entities(svg_sample)
print("Points count:", len(pts), "Ents count:", len(ents))
print("Ents:", ents)

