# Awesome Lowcode Playground

在线体验 Awesome Lowcode 低代码开发平台，无需安装任何软件。

## 部署到 Vercel

```bash
# 安装 Vercel CLI
npm install -g vercel

# 部署
vercel --prod
```

## 部署到 Netlify

```bash
# 安装 Netlify CLI
npm install -g netlify-cli

# 部署
netlify deploy --prod --dir=playground
```

## 部署到 GitHub Pages

```bash
# 安装 gh-pages
npm install -g gh-pages

# 部署
gh-pages -d playground
```

## 功能特性

- 在线体验所有核心功能
- 无需注册即可使用
- 项目数据本地存储
- 支持导出/导入项目
- 一键部署到云平台

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PLAYGROUND_MODE` | 运行模式 | `demo` |
| `PLAYGROUND_STORAGE` | 存储类型 | `local` |
| `ENABLE_EXPORT` | 启用导出 | `true` |

## 本地开发

```bash
# 启动开发服务器
npm run dev:playground

# 构建生产版本
npm run build:playground
```

## 限制

- 项目数据保存在浏览器本地
- 单个项目最大 10MB 存储空间
- 部分高级功能不可用
