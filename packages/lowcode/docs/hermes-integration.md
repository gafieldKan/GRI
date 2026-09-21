# Hermes Agent 集成指南

## 概述

Hermes Agent 是一个基于 Claude API 的智能代理模块，可以让您的应用具备 AI 辅助能力。

## 快速开始

### 1. 获取 API Key

访问 [Anthropic 官网](https://www.anthropic.com/) 获取 API Key

### 2. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

填入你的 API Key：

```env
VITE_ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### 3. 使用示例

```typescript
import { HermesAgent } from './utils/hermesAgent'

const agent = new HermesAgent({ verbose: true })

// 执行任务
const result = await agent.execute('帮我写一个求和函数')
console.log(result)
```

## API 文档

### HermesAgent

#### 构造函数参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| name | string | 'Hermes' | Agent 名称 |
| autoExecute | boolean | true | 是否自动执行队列中的任务 |
| verbose | boolean | false | 是否输出详细日志 |

#### 方法

##### `execute(description, context?)`

执行单个任务

```typescript
await agent.execute('生成一个排序函数', {
  language: 'typescript',
  requirements: ['升序', '处理空数组']
})
```

##### `addTask(task)`

添加单个任务到队列

```typescript
agent.addTask({
  id: 'task-1',
  description: '分析代码',
  priority: 'high',
  context: { code: '...' }
})
```

##### `addTasks(tasks)`

批量添加任务

##### `getQueueStatus()`

获取队列状态

## 使用场景

1. **代码生成** - 根据描述生成代码
2. **代码分析** - 分析代码结构和潜在问题
3. **Bug 修复** - 定位并修复代码问题
4. **文档生成** - 为代码生成注释和文档

## 注意事项

- API Key 请妥善保管，不要提交到代码仓库
- 生产环境建议通过后端代理 API 请求
- 注意 API 调用频率限制
