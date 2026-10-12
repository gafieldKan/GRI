# apps/explorer —— 双维度 Explorer 首页（区域 × 行业）

GRI 首页（`/` → 302 `/explore/`）：顶栏（品牌 + 区域/行业切换 + **右上 SSO**）+ iframe 承载两个「域览」浏览器。

## 文件
- `index.html` —— **GRI 首页外壳**（本目录唯一入库文件）：顶栏 + 维度切换 + SSO（读同源 `gri-auth-token`）+ iframe。
- `region.html` / `industry.html` —— 两个参考浏览器（**不入库**，从源文件复制并做 GRI 皮肤轻量对齐）。

## 复现（源文件在仓库外时）
```bash
D="/home/ubantu/文档/xwechat_files/kanlifeng_bfe0/msg/file/2026-10"
cp "$D/联合国区域划分地图_逐层展开_V1.0.html" apps/explorer/region.html
cp "$D/联合国行业分类_ISIC_Rev5_逐层展开_V1.0.html" apps/explorer/industry.html
sed -i 's/--teal:#247862/--teal:#1B7A3D/g; s/--teal-dark:#155c48/--teal-dark:#11562c/g' \
  apps/explorer/region.html apps/explorer/industry.html
```

## 部署
nginx（prod overlay）挂载 `./apps/explorer → /usr/share/nginx/html/explore`；`/` → 302 `/explore/`。

> ⚠️ 现状：iframe 直接承载参考浏览器（**第一阶段：先出效果**）。区域图 31.6MB（几何内嵌）首屏偏重——后续按 C 方案**引擎化**（自渲染 + 几何简化 + 切行业 treemap）。
