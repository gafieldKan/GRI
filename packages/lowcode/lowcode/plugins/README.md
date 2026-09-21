# 插件开发指南

本目录包含 awesome-lowcode 平台的插件示例和模板。

## 插件类型

| 类型 | 说明 | 示例 |
|------|------|------|
| component | UI 组件插件 | 自定义图表、业务组件 |
| formComponent | 表单组件插件 | 自定义输入框、选择器 |
| dataSource | 数据源插件 | API 数据源、数据库连接器 |
| workflowNode | 工作流节点插件 | 自定义审批节点、自动化动作 |
| toolbar | 工具栏插件 | 快捷操作按钮 |
| panel | 面板插件 | 侧边栏面板 |

## 插件结构

```js
import { registerPlugin, PluginType } from 'lowcode/core/PluginRegistry'

registerPlugin({
  name: 'my-custom-plugin',
  type: PluginType.COMPONENT,
  version: '1.0.0',
  description: '我的自定义插件',
  author: 'Your Name',
  
  // 生命周期钩子
  async init() {
    // 插件初始化时调用
    console.log('插件初始化')
  },
  
  async onLoad(context) {
    // 插件加载时调用
    console.log('插件加载', context)
  },
  
  async onSave(data) {
    // 插件保存时调用
    console.log('插件保存', data)
  },
  
  async onDestroy() {
    // 插件销毁时调用
    console.log('插件销毁')
  },
  
  async onActivate() {
    // 插件激活时调用
  },
  
  async onDeactivate() {
    // 插件停用时调用
  },
})
```

## 示例插件

- `custom-input/` - 自定义输入组件示例
- `data-source-api/` - API 数据源示例
- `workflow-approval/` - 审批工作流节点示例

## 开发规范

1. 每个插件应独立打包
2. 提供完整的 TypeScript 类型定义
3. 包含单元测试
4. 提供 README 文档
