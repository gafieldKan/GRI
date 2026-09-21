# 更新日志

## [2026-05-23] - 穿透工具代理方案完善

### 新增功能

#### FRP Manager 低代码插件
- **FRPManagerPanel React 组件**: 完整的内网穿透管理界面，支持隧道创建、启动、停止、删除等操作
- **后端 API 路由**: 实现 `/api/frp/*` 路由，包括 status、tunnel CRUD、start/stop、stats 等接口
- **ngrok-controller.js**: 修复了 `exec` 安全问题，使用 `spawn` 替代，避免 shell 注入风险

#### GRI 点餐系统配置
- **setup-frp.sh**: FRP 穿透配置脚本，一键配置 Oracle Cloud + FRP 方案
- **start-ngrok.sh**: ngrok 快速启动脚本，简化开发调试流程
- **frpc.ini**: GRI 专用 FRP 配置文件模板
- **DEPLOYMENT.md**: GRI 点餐系统部署指南，包含 ngrok 和 FRP 两种方案

#### 文档更新
- **README.md**: 更新主文档，整合两种穿透方案
- **ngrok-solution.md**: 添加 GRI 点餐系统集成说明
- **deployment.md**: FRP 部署指南
- **usage-guide.md**: 使用指南

### 修复问题

#### 安全性修复
- 修复 `ngrok-controller.js` 中的 `DEP0190` 警告
- 使用 `spawn` 替代 `exec`，避免 shell 注入风险
- 所有命令参数分离传递，确保安全性

#### 代码改进
- FRPManagerPanel 组件添加完整的 API 调用逻辑
- 添加错误处理和降级处理
- 优化用户体验，添加 loading 和提示信息

### 文件清单

```
nat-proxy/
├── lowcode-plugin/frp-manager/
│   ├── index.js                  # 插件入口（已更新）
│   ├── FRPManagerPanel.jsx       # React 组件（已完成）
│   ├── ngrok-controller.js       # ngrok 控制器（已修复）
│   └── api/
│       └── frp-api.js            # 后端 API 路由（新增）
├── scripts/
│   ├── deploy-frps.sh            # frps 部署脚本
│   ├── configure-frpc.sh         # frpc 配置脚本
│   ├── start-tunnel.sh           # 启动隧道脚本
│   ├── install-frpc.sh           # 安装 frpc 脚本
│   └── install-ngrok.sh          # 安装 ngrok 脚本
├── config/
│   ├── frps.ini.tpl              # frps 配置模板
│   └── frpc.ini.tpl              # frpc 配置模板
├── docs/
│   ├── deployment.md             # FRP 部署指南
│   ├── ngrok-solution.md         # ngrok 方案（已更新）
│   ├── oracle-cloud-setup.md     # Oracle Cloud 设置
│   ├── usage-guide.md            # 使用指南
│   └── grl-deployment.md         # GRI 部署指南
├── README.md                     # 主文档（已更新）
└── CHANGELOG.md                  # 更新日志（本文件）

GRI/
├── DEPLOYMENT.md                 # GRI 部署文档（新增）
├── setup-frp.sh                  # FRP 配置脚本（新增）
├── start-ngrok.sh                # ngrok 启动脚本（新增）
└── frpc.ini                      # FRP 配置文件（新增）
```

### 使用方式

#### 方案 A: ngrok（临时/开发）

```bash
cd /home/ubantu/reactProject/GRI
./start-ngrok.sh
```

#### 方案 B: FRP（长期/生产）

```bash
cd /home/ubantu/reactProject/GRI
./setup-frp.sh --server-ip <IP> --token <TOKEN>
```

### 下一步计划

- [ ] 实现 FRP Manager 后端 API 的实际 FRP 调用逻辑
- [ ] 添加流量统计和监控功能
- [ ] 支持多隧道并行管理
- [ ] 添加告警和通知功能
