# apps/explorer —— 双维度 Explorer 首页（区域 × 行业）

GRI 首页（`/` → 302 `/explore/`）：顶栏（品牌 + 区域/行业切换 + **右上 SSO**）+ iframe 承载两个「域览」浏览器。

## 文件
- `index.html` —— **GRI 自渲染 Explorer（引擎 v2）**：顶栏（品牌 + 区域/行业切换 + **右上 SSO**）+ 左树 + 中舞台（**SVG 世界地图** / **行业 treemap**）+ 右明细。数据取 `data/*.json`。
- `data/regions.geo.json`（248 国精简国界 1MB）· `data/regions.json`（区域树 1.8MB）· `data/industry.json`（ISIC 832 节点）
- `slim-region.py` —— 几何精简脚本（供参考浏览器版复现）
- `region.html` / `industry.html` —— **参考浏览器（旧，不入库）**：早期 iframe 承载版，已由 `index.html` 自渲染取代，仅留作视觉对照。

## 现状
**方案 B（内嵌 embed，非 iframe）**：`index.html` 作为加载器，`fetch` 参考文件后把其 `<style>`+`<body>`+`<script>`（含数据块）**整体并入本文档**，再把 GRI 的**维度切换 + SSO** 注入其顶栏。切换维度用 `?dim=region|industry` 重载（**仍同文档、无 iframe**）。
- 区域：树 7 + 地图 92 path；行业：treemap **22 门类** + 树 24 —— 均渲染正常、异常 0。
- 保留了参考的**全部 UI/功能**（搜索/收藏/笔记/导出/范围说明/多视图），且**同文档**可后续接 C1 API / GRI 主题。

数据由 `python3 apps/explorer/prepare-data.py` 从 `scripts/reference-data/data/*` 派生（产物在 `data/`，体积大故 gitignore）。
后续：把内嵌实例的**数据源**从内嵌 JSON 换成 **C1 本体 API**、主题并入 GRI 令牌、接治理（S5/S6）。

## 复现（源文件在仓库外时）
```bash
D="/home/ubantu/文档/xwechat_files/kanlifeng_bfe0/msg/file/2026-10"
cp "$D/联合国区域划分地图_逐层展开_V1.0.html" apps/explorer/region.html
cp "$D/联合国行业分类_ISIC_Rev5_逐层展开_V1.0.html" apps/explorer/industry.html
chmod u+w apps/explorer/region.html apps/explorer/industry.html
sed -i 's/--teal:#247862/--teal:#1B7A3D/g; s/--teal-dark:#155c48/--teal-dark:#11562c/g' \
  apps/explorer/region.html apps/explorer/industry.html
# 几何精简（region 30MB → ~7MB，保最细下钻）
python3 apps/explorer/slim-region.py 0.02
```

## 部署
nginx（prod overlay）挂载 `./apps/explorer → /usr/share/nginx/html/explore`；`/` → 302 `/explore/`。

> ⚠️ 现状：iframe 直接承载参考浏览器（**第一阶段：先出效果**）。区域图 31.6MB（几何内嵌）首屏偏重——后续按 C 方案**引擎化**（自渲染 + 几何简化 + 切行业 treemap）。
