# GRI 点餐系统 - uni-app 移动端

基于 uni-app 开发的 GRI 点餐系统移动端应用，支持小程序、H5、App 多端运行。

## 功能特性

- ✅ 商家列表展示
- ✅ 菜单浏览
- ✅ 购物车管理
- ✅ 订单管理
- ✅ 个人中心
- ✅ 多端适配（小程序/H5/App）

## 项目结构

```
gri-uni-app/
├── pages/             # 页面
│   ├── index/        # 首页（商家列表）
│   ├── menu/         # 菜单页
│   ├── cart/         # 购物车
│   ├── order/        # 订单
│   └── profile/      # 个人中心
├── components/        # 组件
├── store/            # 状态管理 (Pinia)
│   └── cart.js       # 购物车 Store
├── utils/            # 工具函数
│   ├── request.js    # 网络请求封装
│   └── config.js     # 全局配置
├── static/           # 静态资源
├── App.vue           # 应用入口
├── main.js           # 入口文件
├── pages.json        # 页面配置
├── manifest.json     # 应用配置
└── vite.config.js    # Vite 配置
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动项目

```bash
# H5 开发
npm run dev:h5

# 微信小程序
npm run dev:weapp

# App (需要 HBuilderX)
npm run dev:app
```

### 3. 构建发布

```bash
# 构建 H5
npm run build:h5

# 构建微信小程序
npm run build:weapp

# 构建 App
npm run build:app
```

## 多端配置

### H5 配置

修改 `manifest.json` 中的 `h5` 部分：

```json
{
  "h5": {
    "publicPath": "/",
    "router": {
      "mode": "hash"
    }
  }
}
```

### 小程序配置

修改 `manifest.json` 中的 `mp-weixin` 部分：

```json
{
  "mp-weixin": {
    "appid": "你的小程序 AppID",
    "setting": {
      "urlCheck": false
    }
  }
}
```

## 与低代码平台集成

### API 对接

修改 `utils/config.js` 中的 `apiBaseUrl`：

```javascript
export default {
  apiBaseUrl: 'http://your-lowcode-server/api'
}
```

### 数据模型

参考低代码平台的数据模型定义，确保数据结构一致。

## 开发规范

- 使用 Vue 3 Composition API
- 遵循 uni-app 开发规范
- 组件化开发
- 状态管理使用 Pinia

## 浏览器支持

- H5: Chrome, Firefox, Safari, Edge 最新版本
- 小程序：微信开发者工具
- App: iOS 12+, Android 5.0+

## License

MIT
