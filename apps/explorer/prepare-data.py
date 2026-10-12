#!/usr/bin/env python3
"""prepare-data.py —— 生成 Explorer 首页所需数据（从 scripts/reference-data/data/* 派生）。

产物（apps/explorer/data/，体积大故 gitignore）：
  - regions.geo.json     世界国界（精简，248 国）
  - regions.json         区域树（7999 节点）
  - industry.json        ISIC Rev.5 树（832 节点）
  - geo/<countryId>.json 各国下级几何切片（244 国；点国家→地图下钻省/市/区用）

用法：python3 apps/explorer/prepare-data.py
"""
import json, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(REPO, 'scripts', 'reference-data', 'data')
OUT = os.path.join(HERE, 'data')
GEO = os.path.join(OUT, 'geo')


def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop()
        if b <= a + 1:
            continue
        ax, ay = pts[a]; bx, by = pts[b]; dx, dy = bx - ax, by - ay; seg = dx * dx + dy * dy; imax = -1; dmax = tol * tol
        for i in range(a + 1, b):
            px, py = pts[i]
            if seg == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg; t = 0 if t < 0 else (1 if t > 1 else t)
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


def main():
    os.makedirs(GEO, exist_ok=True)
    # 世界国界（精简）
    fc = json.load(open(os.path.join(SRC, 'un-regions.geo.json')))
    for f in fc['features']:
        f['geometry'] = sg(f['geometry'], 0.08)
    json.dump(fc, open(os.path.join(OUT, 'regions.geo.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('regions.geo.json', len(fc['features']))
    # 树
    shutil.copy(os.path.join(SRC, 'un-regions.json'), os.path.join(OUT, 'regions.json'))
    shutil.copy(os.path.join(SRC, 'isic-rev5.json'), os.path.join(OUT, 'industry.json'))
    # 下级几何切片（按国家分组）
    tree = json.load(open(os.path.join(SRC, 'un-regions.json')))['nodes']
    byid = {str(n['id']): n for n in tree}

    def country(nid):
        cur = byid.get(str(nid)); g = 0
        while cur and g < 30:
            if cur.get('level') == 'country':
                return str(cur['id'])
            cur = byid.get(str(cur.get('parent'))) if cur.get('parent') is not None else None
            g += 1
        return None

    sub = json.load(open(os.path.join(SRC, 'un-regions-maps.geo.json')))
    groups = {}
    for f in sub['features']:
        c = country(f.get('properties', {}).get('adcode'))
        if not c:
            continue
        f['geometry'] = sg(f['geometry'], 0.02)
        groups.setdefault(c, []).append(f)
    for c, fs in groups.items():
        json.dump({'type': 'FeatureCollection', 'features': fs}, open(os.path.join(GEO, c + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('geo slices:', len(groups), 'countries')


if __name__ == '__main__':
    main()
