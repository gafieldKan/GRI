#!/usr/bin/env python3
"""slim-region.py —— 精简 region.html 的内嵌几何（Douglas-Peucker），减小首屏体积。

背景：参考文件「联合国区域划分地图」把全部几何（countryShapes + maps）以 base64(gzip(GeoJSON))
内嵌在 <script id="atlas-data">，原始 ~30MB。本脚本按容差简化各级 ring 后回写，保世界级细节
（下钻到最细颗粒度仍可用），体积降到 ~7MB。

用法：python3 apps/explorer/slim-region.py [tol]   # 默认 tol=0.02 度
"""
import re, json, base64, gzip, os, sys

TOL = float(sys.argv[1]) if len(sys.argv) > 1 else 0.02
F = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'region.html')

s = open(F, encoding='utf-8').read()
m = re.search(r'(<script id="atlas-data" type="application/json">)(.*?)(</script>)', s, re.S)
if not m:
    sys.exit('未找到 atlas-data')
data = json.loads(m.group(2))
dec = lambda b: gzip.decompress(base64.b64decode(b))
enc = lambda o: base64.b64encode(gzip.compress(json.dumps(o, separators=(',', ':')).encode(), mtime=0)).decode()


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop()
        if b <= a + 1:
            continue
        ax, ay = pts[a]; bx, by = pts[b]
        dx, dy = bx - ax, by - ay; seg = dx * dx + dy * dy
        imax = -1; dmax = tol * tol
        for i in range(a + 1, b):
            px, py = pts[i]
            if seg == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg
                t = 0 if t < 0 else (1 if t > 1 else t)
                d = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
            if d > dmax:
                dmax = d; imax = i
        if imax > 0:
            keep[imax] = True; st.append((a, imax)); st.append((imax, b))
    return [p for p, k in zip(pts, keep) if k]


def sg(g, tol):
    t = g['type']; c = g['coordinates']
    if t == 'Polygon':
        return {'type': t, 'coordinates': [dp(r, tol) for r in c]}
    if t == 'MultiPolygon':
        return {'type': t, 'coordinates': [[dp(r, tol) for r in poly] for poly in c]}
    return g


def proc(b64, tol):
    o = json.loads(dec(b64)); ft = o.get('type')
    if ft == 'Feature':
        o['geometry'] = sg(o['geometry'], tol)
    elif ft == 'FeatureCollection':
        for f in o['features']:
            f['geometry'] = sg(f['geometry'], tol)
    return enc(o)


before = os.path.getsize(F)
for key in ('countryShapes', 'maps'):
    if key in data:
        data[key] = {k: proc(v, TOL) for k, v in data[key].items()}
s2 = s[:m.start(2)] + json.dumps(data, separators=(',', ':')) + s[m.end(2):]
open(F, 'w', encoding='utf-8').write(s2)
print(f"tol={TOL} → {F}: {before/1024/1024:.1f}MB → {os.path.getsize(F)/1024/1024:.1f}MB")
