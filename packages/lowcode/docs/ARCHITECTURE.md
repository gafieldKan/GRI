# Awesome Lowcode 架构文档

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                     UI Layer (src/)                         │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐ │
│  │   Pages     │ Components  │   Hooks     │   Store     │ │
│  └─────────────┴─────────────┴─────────────┴─────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Core Layer (lowcode/)                      │
│  ┌───────────────────────────────────────────────────────── │
│  │  Engine          引擎层                                  │
│  │  - ComponentEngine   组件引擎                           │
│  │  - Runtime         运行时                               │
│  └───────────────────────────────────────────────────────── │
│  ┌───────────────────────────────────────────────────────── │
│  │  Core            核心模块                                │
│  │  - PluginRegistry  插件注册中心                         │
│  │  - SchemaManager   元数据管理                           │
│  │  - PermissionMgr   权限管理                             │
│  └───────────────────────────────────────────────────────── │
│  ┌───────────────────────────────────────────────────────── │
│  │  Components      内置组件                               │
│  │  - DragDropEditor  拖拽编辑器                           │
│  │  - ModelDesigner   模型设计器                           │
│  │  - WorkflowDesigner 工作流设计器                        │
│  └───────────────────────────────────────────────────────── │
│  ┌───────────────────────────────────────────────────────── │
│  │  Plugins         插件系统                               │
│  │  - examples/       示例插件                             │
│  └───────────────────────────────────────────────────────── │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
awesome-lowcode/
├── src/                          # 前端 UI 层
│   ├── pages/                    # 页面组件
│   │   ├── Home.jsx              # 首页
│   │   ├── Editor.jsx            # 表单设计器页面
│   │   ├── Models.jsx            # 模型设计器页面
│   │   └── Workflow.jsx          # 工作流页面
│   │
│   ├── components/               # 通用 UI 组件
│   │   └── ...
│   │
│   ├── hooks/                    # 自定义 Hooks
│   │   └── ...
│   │
│   ├── store/                    # 全局状态管理
│   │   └── ...
│   │
│   ├── utils/                    # 工具函数
│   │   └── ...
│   │
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
│   │       ├── data-source-api/  # API 数据源
│   │       └── workflow-approval/# 审批工作流
│   │
│   ├── components/               # 内置业务组件
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
├── tests/                        # 测试文件
│   ├── setup.js                  # 测试配置
│   └── core/                     # 核心模块测试
│
├── docs/                         # 文档
│   ├── ARCHITECTURE.md           # 架构文档
│   └── ...
│
└── .github/
    └── workflows/
        └── ci.yml                # CI 配置
```

## 核心模块说明

### 1. PluginRegistry (插件注册中心)

插件系统是 awesome-lowcode 的核心扩展机制。

**主要功能：**
- 插件注册和注销
- 插件生命周期管理
- 插件类型管理
- 插件依赖管理

**插件类型：**
```js
PluginType = {
  COMPONENT: 'component',        // UI 组件
  FORM_COMPONENT: 'formComponent', // 表单组件
  DATA_SOURCE: 'dataSource',     // 数据源
  WORKFLOW_NODE: 'workflowNode',  // 工作流节点
  TOOLBAR: 'toolbar',            // 工具栏
  PANEL: 'panel',                // 面板
  MIDDLEWARE: 'middleware',      // 中间件
}
```

### 2. SchemaManager (元数据管理器)

负责管理所有组件和表单的元数据定义。

**主要功能：**
- 组件 Schema 注册
- 数据模型定义
- 支持热更新
- 支持远程 Schema 下发
- JSON 导入/导出

**字段类型：**
```js
FieldTypes = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  DATE: 'date',
  DATETIME: 'datetime',
  SELECT: 'select',
  MULTI_SELECT: 'multiSelect',
  RADIO: 'radio',
  CHECKBOX: 'checkbox',
  TEXT: 'text',
  RICH_TEXT: 'richText',
  UPLOAD: 'upload',
  REFERENCE: 'reference',
  JSON: 'json',
}
```

### 3. PermissionManager (权限管理器)

提供精细化的权限控制。

**权限级别：**
```js
PermissionLevel = {
  NONE: 'none',    // 无权限
  READ: 'read',    // 只读
  WRITE: 'write',  // 读写
  ADMIN: 'admin',  // 管理员
}
```

**权限类型：**
- 模型级权限
- 字段级权限
- 操作级权限
- 菜单权限

### 4. ComponentEngine (组件引擎)

管理所有可用组件。

**组件分类：**
```js
ComponentCategory = {
  BASIC: 'basic',      // 基础组件
  FORM: 'form',        // 表单组件
  LAYOUT: 'layout',    // 布局组件
  DISPLAY: 'display',  // 展示组件
  FEEDBACK: 'feedback',// 反馈组件
  CUSTOM: 'custom',    // 自定义组件
}
```

## 数据流

```
用户操作
   │
   ▼
┌─────────────┐
│  UI Layer   │  React 组件
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Store     │  Zustand 状态管理
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Engine    │  组件事件处理
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Server    │  CRUD 操作
└─────────────┘
```

## 扩展机制

### 插件扩展

```js
import { registerPlugin, PluginType } from 'lowcode/core/PluginRegistry'

registerPlugin({
  name: 'my-plugin',
  type: PluginType.COMPONENT,
  async init() { /* ... */ },
  async onLoad(context) { /* ... */ },
  async onSave(data) { /* ... */ },
  async onDestroy() { /* ... */ },
})
```

### Schema 扩展

```js
import { schemaManager } from 'lowcode/core/SchemaManager'

schemaManager.registerModel('myModel', {
  id: 'myModel',
  name: '我的模型',
  fields: [
    { name: 'field1', type: 'string', label: '字段 1' },
  ],
})
```

### 权限扩展

```js
import { permissionManager, PermissionLevel } from 'lowcode/core/PermissionManager'

permissionManager.setModelPermission('myModel', 'admin', PermissionLevel.ADMIN)
permissionManager.setFieldPermission('myModel', 'sensitiveField', 'user', {
  visible: false,
  editable: false,
})
```

## 最佳实践

1. **组件化**: 保持组件小而专注
2. **插件化**: 通过插件扩展功能，而非修改核心代码
3. **元数据驱动**: 使用 Schema 管理配置，支持热更新
4. **权限分离**: 使用统一的权限管理接口
5. **测试覆盖**: 为核心功能编写单元测试
