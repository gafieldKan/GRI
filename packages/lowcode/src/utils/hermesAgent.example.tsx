/**
 * Hermes Agent 使用示例
 *
 * 展示如何在项目中使用 Hermes Agent 调用 Claude 完成任务
 */

import { useEffect, useState } from 'react'
import HermesAgent from './hermesAgent'

// =====================
// 示例 1: 基础用法
// =====================
async function basicUsage() {
  const agent = new HermesAgent({ verbose: true })

  // 执行代码分析任务
  const code = `function add(a, b) { return a + b }`
  await agent.execute('分析这段代码的功能和潜在问题', { code })

  // 执行代码生成任务
  await agent.execute('生成一个 React 组件，实现计数器功能')

  // 执行 Bug 修复任务
  await agent.execute('修复以下代码中的问题', {
    code: 'function divide(a, b) { return a / b }',
    bugDescription: '当 b 为 0 时会出错',
  })
}

// =====================
// 示例 2: React 组件中使用
// =====================
interface CodeAnalyzerProps {
  code: string
}

export function CodeAnalyzer({ code }: CodeAnalyzerProps) {
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [agent] = useState(() => new HermesAgent({ verbose: true }))

  const handleAnalyze = async () => {
    setLoading(true)
    const output = await agent.execute(`分析以下代码：${code}`)
    setResult(output)
    setLoading(false)
  }

  return (
    <div>
      <button onClick={handleAnalyze} disabled={loading}>
        {loading ? '分析中...' : '使用 Claude 分析代码'}
      </button>
      {result && <pre>{result}</pre>}
    </div>
  )
}

// =====================
// 示例 3: 任务队列模式
// =====================
async function taskQueueUsage() {
  const agent = new HermesAgent({ verbose: true })

  // 添加多个任务到队列，自动按顺序执行
  agent.addTasks([
    {
      id: '1',
      description: '分析项目结构',
      priority: 'high',
    },
    {
      id: '2',
      description: '生成类型定义文件',
      priority: 'medium',
      context: { language: 'typescript' },
    },
    {
      id: '3',
      description: '优化代码性能',
      priority: 'low',
    },
  ])

  // 查看队列状态
  console.log(agent.getQueueStatus())
}

// =====================
// 示例 4: 在低代码平台中集成
// =====================
export function LowcodeAIAssistant() {
  const [agent] = useState(() => new HermesAgent({ verbose: true }))

  // 生成组件代码
  const generateComponent = async (description: string) => {
    return agent.execute(`生成一个 React 组件：${description}`)
  }

  // 分析模型结构
  const analyzeModel = async (modelDefinition: string) => {
    return agent.execute(`分析数据模型结构：${modelDefinition}`)
  }

  // 生成工作流逻辑
  const generateWorkflow = async (requirements: string) => {
    return agent.execute(`根据需求生成工作流：${requirements}`)
  }

  return {
    generateComponent,
    analyzeModel,
    generateWorkflow,
  }
}

export default {
  basicUsage,
  CodeAnalyzer,
  taskQueueUsage,
  LowcodeAIAssistant,
}
