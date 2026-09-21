# Awesome Lowcode - 企业级低代码开发平台

[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-brightgreen.svg)](https://vitejs.dev/)
[![Ant Design](https://img.shields.io/badge/Ant_Design-6-blue.svg)](https://ant.design/)

一个基于 React + Vite + Ant Design 的企业级低代码开发平台，支持拖拽式页面构建、数据模型设计、工作流编排和插件化扩展。

## 功能特性

### 核心能力
- 拖拽式页面构建器
- 丰富的组件库（输入框、按钮、表格、卡片等）
- 组件属性编辑和组件树管理
- JSON Schema 导出和导入
- 数据模型设计器
- 自动表单生成
- CRUD 操作钩子
- 工作流编排引擎

### 高级特性
- 插件化架构，支持自定义组件和功能扩展
- 元数据驱动，支持配置热更新和远程下发
- 精细化权限控制（RBAC/模型级/字段级/操作级/数据级）
- 统一的数据源管理
- 工作流节点自定义
- 事件驱动架构，支持钩子和拦截器
- 25+ 字段类型，完整验证规则

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| React | 19 | UI 框架 |
| Vite | 8 | 构建工具 |
| Ant Design | 6 | UI 组件库 |
| Zustand | 5 | 状态管理 |
| React Router | 7 | 路由管理 |

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 项目结构

```
awesome-lowcode/
├── src/                          # 前端 UI 层
│   ├── pages/                    # 页面组件
│   │   ├── Home.jsx              # 首页
│   │   ├── Editor.jsx            # 表单设计器页面
│   │   ├── Models.jsx            # 模型设计器页面
│   │   └── Workflow.jsx          # 工作流页面
│   ├── components/               # 通用 UI 组件
│   ├── hooks/                    # 自定义 Hooks
│   ├── store/                    # 全局状态管理
│   ├── utils/                    # 工具函数
│   ├── App.jsx                   # 应用入口
│   └── main.jsx                  # React 入口
│
├── lowcode/                      # 低代码核心层
│   ├── core/                     # 核心模块
│   │   ├── PluginRegistry.js     # 插件注册中心
│   │   ├── SchemaManager.js      # Schema 管理器
│   │   └── PermissionManager.js  # 权限管理器
│   │
│   ├── engine/                   # 引擎层
│   │   ├── ComponentEngine.js    # 组件引擎
│   │   └── index.js              # 引擎导出
│   │
│   ├── plugins/                  # 插件目录
│   │   ├── README.md             # 插件开发指南
│   │   └── examples/             # 插件示例
│   │       ├── custom-input/     # 自定义输入组件
│   │       └── data-source-api/  # API 数据源
│   │
│   ├── components/               # 内置组件
│   │   ├── DragDropEditor/       # 拖拽编辑器
│   │   ├── ModelDesigner/        # 模型设计器
│   │   └── WorkflowDesigner/     # 工作流设计器
│   │
│   ├── store/                    # 核心状态管理
│   │   ├── editorStore.js        # 编辑器状态
│   │   ├── modelStore.js         # 模型状态
│   │   └── workflowStore.js      # 工作流状态
│   │
│   ├── server/                   # 服务端代码
│   │   ├── models.js             # 数据模型定义
│   │   ├── crudWithHooks.js      # CRUD 操作
│   │   ├── index.js              # 服务入口
│   │   └── user.js               # 用户模型
│   │
│   └── utils/                    # 工具函数
│       └── schemaGenerator.js    # Schema 生成器
│
└── public/                       # 静态资源
```

## 核心模块说明

### 1. 插件系统 (PluginRegistry)

插件系统允许你扩展平台功能，支持以下插件类型：

- `component` - UI 组件插件
- `formComponent` - 表单组件插件
- `dataSource` - 数据源插件
- `workflowNode` - 工作流节点插件
- `toolbar` - 工具栏插件
- `panel` - 面板插件

**插件生命周期：**
- `init` - 插件初始化
- `onLoad` - 插件加载
- `onSave` - 插件保存
- `onDestroy` - 插件销毁
- `onActivate` - 插件激活
- `onDeactivate` - 插件停用

### 2. Schema 管理器 (SchemaManager)

负责管理所有组件和表单的元数据定义：

- 组件 Schema 注册
- 数据模型定义
- 支持热更新
- 支持远程 Schema 下发
- JSON 导入/导出

### 3. 权限管理器 (PermissionManager)

提供完整的 RBAC（基于角色的访问控制）权限控制：

- **角色管理** - 多角色支持、角色继承
- **模型权限** - 14 种操作权限（read/write/create/delete/approve 等）
- **字段权限** - 可见/可读/可写
- **数据权限** - 数据范围控制（全部/本人/本部门/自定义）
- **菜单权限** - 菜单项可见性控制
- 菜单权限
- 角色管理

### 4. 组件引擎 (ComponentEngine)

管理所有可用组件：

- 组件注册和注销
- 组件分类管理
- 组件属性定义
- 事件和插槽定义

### 5. 事件引擎 (EventEngine)

提供完整的事件驱动架构支持：

- **事件订阅/发布** - 支持优先级、一次性订阅
- **事件拦截器** - 可阻断事件执行
- **前后钩子** - before/after 钩子
- **事件历史** - 记录最近 100 条事件
- **调试模式** - 事件执行耗时追踪

### 6. 数据模型 (ModelSchema)

提供 25+ 种字段类型和完整验证规则：

- **基础类型** - string, text, number, boolean 等
- **日期时间** - date, datetime, time
- **选择类型** - select, multiSelect, radio, checkbox
- **文件类型** - image, file, images, files
- **高级类型** - json, code, color, currency, phone, email, formula 等
- **验证规则** - required, pattern, min/max, email, phone, custom 等

## 使用示例

### 注册自定义组件插件

```js
import { registerPlugin, PluginType } from 'lowcode/core/PluginRegistry'
import { componentEngine, ComponentCategory } from 'lowcode/engine/ComponentEngine'

registerPlugin({
  name: 'my-custom-input',
  type: PluginType.FORM_COMPONENT,
  version: '1.0.0',
  description: '自定义输入组件',

  async init() {
    componentEngine.registerComponent({
      id: 'customInput',
      name: '高级输入框',
      type: 'CustomInput',
      category: ComponentCategory.FORM,
      props: {
        placeholder: { type: 'string', default: '请输入' },
        maxLength: { type: 'number', default: 100 },
      },
    })
  },
})
```

### 使用权限控制

```js
import { permissionManager, PermissionLevel } from 'lowcode/core/PermissionManager'

// 设置模型权限
permissionManager.setModelPermission('user', 'admin', PermissionLevel.ADMIN)
permissionManager.setModelPermission('user', 'user', PermissionLevel.READ)

// 设置字段权限
permissionManager.setFieldPermission('user', 'salary', 'user', {
  visible: false,
  editable: false,
})

// 检查权限
const canEdit = permissionManager.checkModelPermission(
  'user',
  'admin',
  PermissionLevel.WRITE
)
```

### 使用 Schema 管理器

```js
import { schemaManager } from 'lowcode/core/SchemaManager'

// 注册数据模型
schemaManager.registerModel('user', {
  id: 'user',
  name: '用户',
  fields: [
    { name: 'name', type: 'string', label: '姓名' },
    { name: 'age', type: 'number', label: '年龄' },
    { name: 'email', type: 'string', label: '邮箱' },
  ],
})

// 获取模型
const userModel = schemaManager.getModel('user')

// 热更新
schemaManager.update('user', {
  fields: [...userModel.fields, { name: 'phone', type: 'string', label: '电话' }],
})
```

## 开发指南

### 插件开发

查看 [lowcode/plugins/README.md](lowcode/plugins/README.md) 了解详细的插件开发指南。

### 贡献代码

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 代码规范

```bash
# 代码格式化
npm run lint

# 类型检查（如启用 TypeScript）
npm run type-check

# 运行测试
npm run test
```

## 路由说明

| 路径 | 说明 |
|------|------|
| `/` | 首页 - 平台介绍 |
| `/editor` | 表单设计器 - 拖拽式页面构建 |
| `/models` | 模型设计器 - 数据模型和表单生成 |
| `/workflow` | 工作流 - 工作流编排和管理 |

## 开发进度

- [x] 项目基础架构搭建
- [x] 拖拽编辑器核心功能
- [x] 组件属性编辑
- [x] 状态管理和持久化
- [x] 模型设计器
- [x] 自动表单生成
- [x] CRUD API 集成
- [x] 工作流设计器
- [x] 插件化架构
- [x] 权限管理系统
- [x] Schema 元数据管理
- [ ] 数据源绑定
- [ ] 表达式编辑器
- [ ] 国际化支持
- [ ] 主题定制

## 许可证

ISC
