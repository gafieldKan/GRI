/**
 * Claude Code CLI 适配器
 * 将 Claude Code CLI 封装为低代码平台的内部服务
 *
 * @author GRI Team
 * @version 1.0
 */

// 浏览器环境检测
const isBrowser = typeof window !== 'undefined'
const isNode = typeof process !== 'undefined' && process.versions?.node

import { EventEmitter } from 'events'

// 仅在 Node.js 环境中导入 Node.js 特有模块
let spawn, join, resolve
if (isNode) {
  const childProcess = await import('child_process')
  const path = await import('path')
  spawn = childProcess.spawn
  join = path.join
  resolve = path.resolve
}

/**
 * Claude Code 配置类
 */
export class ClaudeCodeConfig {
  constructor(config = {}) {
    // Claude Code CLI 路径
    this.cliPath = config.cliPath || 'claude'
    // 工作目录
    this.workDir = config.workDir || process.cwd()
    // 沙箱模式
    this.sandbox = config.sandbox ?? true
    // 允许的目录列表
    this.allowedDirs = config.allowedDirs || []
    // 最大执行时间（秒）
    this.timeout = config.timeout || 300
    // 模型名称
    this.model = config.model || 'claude-sonnet-4-6'
    // 系统提示词
    this.systemPrompt = config.systemPrompt || ''
    // 流式输出
    this.stream = config.stream ?? true
  }
}

/**
 * 执行结果类
 */
export class ExecutionResult {
  constructor() {
    this.success = false
    this.output = ''
    this.error = null
    this.duration = 0
    this.files = []
    this.changes = []
  }
}

/**
 * Claude Code CLI 适配器主类
 */
class ClaudeCodeAdapterClass extends EventEmitter {
  constructor() {
    super()
    this.config = null
    this.process = null
    this.ready = false
    this.queue = []
    this.processing = false
  }

  /**
   * 初始化适配器
   */
  async init(config = {}) {
    this.config = new ClaudeCodeConfig(config)

    // 检查 CLI 是否可用
    const available = await this.#checkCLI()
    if (!available) {
      throw new Error('Claude Code CLI 不可用，请确认已安装并配置')
    }

    this.ready = true
    this.emit('ready')
    return this
  }

  /**
   * 执行 AI 命令
   */
  async execute(prompt, options = {}) {
    if (!this.ready) {
      throw new Error('Claude Code 适配器未初始化')
    }

    const startTime = Date.now()
    const result = new ExecutionResult()

    try {
      this.emit('start', { prompt, options })

      // 构建完整提示
      const fullPrompt = this.#buildPrompt(prompt, options)

      // 执行 CLI
      const output = await this.#runCLI(fullPrompt, options)

      result.success = true
      result.output = output
      result.duration = Date.now() - startTime

      this.emit('complete', result)
      return result
    } catch (error) {
      result.success = false
      result.error = error.message
      result.duration = Date.now() - startTime

      this.emit('error', { error, result })
      throw error
    }
  }

  /**
   * 生成应用结构（DSL 生成）
   */
  async generateApp(description, options = {}) {
    const prompt = `
你是一个低代码平台应用架构师。
请根据用户描述生成应用结构（JSON DSL 格式）。

用户描述：${description}

要求：
1. 生成完整的应用结构，包含表单、字段、菜单、权限
2. 遵循平台 Schema 规范
3. 输出纯 JSON，不要其他解释

示例输出：
{
  "app": {
    "name": "employee_management",
    "label": "员工管理",
    "forms": [...],
    "menus": [...],
    "permissions": [...]
  }
}
`
    return this.execute(prompt, { type: 'generate_app', ...options })
  }

  /**
   * 生成/修改表单结构
   */
  async generateForm(description, context = {}) {
    const prompt = `
你是低代码平台表单设计专家。
根据用户描述生成或修改表单结构。

当前上下文：${JSON.stringify(context, null, 2)}
用户描述：${description}

要求：
1. 输出符合平台规范的表单 JSON
2. 包含字段定义、校验规则、布局配置
3. 如果是修改，使用 patch 格式
`
    return this.execute(prompt, { type: 'generate_form', context })
  }

  /**
   * 生成业务逻辑代码
   */
  async generateLogic(description, context = {}) {
    const prompt = `
你是低代码平台逻辑开发专家。
根据用户需求生成业务逻辑代码。

当前上下文：${JSON.stringify(context, null, 2)}
用户需求：${description}

要求：
1. 生成 JavaScript/Python 代码
2. 使用平台内置 API（API.query, Context.user 等）
3. 包含必要的错误处理
4. 输出代码和说明
`
    return this.execute(prompt, { type: 'generate_logic', context })
  }

  /**
   * 错误诊断与修复
   */
  async diagnoseError(errorLog, context = {}) {
    const prompt = `
你是低代码平台故障诊断专家。
分析错误日志并提供修复方案。

错误日志：
${errorLog}

当前上下文：${JSON.stringify(context, null, 2)}

要求：
1. 分析错误原因
2. 提供修复步骤
3. 如果可以，直接生成修复代码
4. 用通俗语言解释
`
    return this.execute(prompt, { type: 'diagnose_error', context })
  }

  /**
   * 批量操作（如字段批量修改）
   */
  async batchOperate(operations, context = {}) {
    const prompt = `
你是低代码平台批量操作专家。
执行批量修改操作。

操作列表：
${JSON.stringify(operations, null, 2)}

当前上下文：${JSON.stringify(context, null, 2)}

要求：
1. 按顺序执行操作
2. 保证数据一致性
3. 出错时回滚
4. 返回执行报告
`
    return this.execute(prompt, { type: 'batch_operate', context })
  }

  /**
   * 流式执行（实时反馈）
   */
  async executeStream(prompt, callbacks = {}) {
    const { onProgress, onOutput, onComplete, onError } = callbacks

    return new Promise((resolve, reject) => {
      if (!this.ready) {
        reject(new Error('Claude Code 适配器未初始化'))
        return
      }

      const fullPrompt = this.#buildPrompt(prompt)
      const result = new ExecutionResult()
      const outputBuffer = []

      try {
        this.emit('stream:start', { prompt: fullPrompt })

        // 启动进程
        const child = spawn(
          this.config.cliPath,
          ['--model', this.config.model, '--stream', '--system', this.config.systemPrompt],
          {
            cwd: this.config.workDir,
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
              ...process.env,
              CLAUDE_CODE_SANDBOX: this.config.sandbox ? '1' : '0',
              CLAUDE_CODE_ALLOWED_DIRS: this.config.allowedDirs.join(','),
            },
          }
        )

        // 处理输出流
        child.stdout.on('data', (data) => {
          const text = data.toString()
          outputBuffer.push(text)
          onOutput?.(text)

          // 解析进度
          const progressMatch = text.match(/\[进度 (\d+)%\]/)
          if (progressMatch) {
            onProgress?.({ percent: parseInt(progressMatch[1]) })
          }
        })

        child.stderr.on('data', (data) => {
          const text = data.toString()
          onOutput?.(`[ERROR] ${text}`)
        })

        // 完成处理
        child.on('close', (code) => {
          if (code === 0) {
            result.success = true
            result.output = outputBuffer.join('')
            onComplete?.(result)
            resolve(result)
          } else {
            result.success = false
            result.error = `进程退出码：${code}`
            onError?.(new Error(result.error))
            reject(new Error(result.error))
          }
        })

        // 超时处理
        const timeoutId = setTimeout(() => {
          child.kill('SIGTERM')
          result.error = '执行超时'
          onError?.(new Error(result.error))
          reject(new Error(result.error))
        }, this.config.timeout * 1000)

        child.on('exit', () => {
          clearTimeout(timeoutId)
        })

        // 写入提示词
        child.stdin.write(fullPrompt)
        child.stdin.end()
      } catch (error) {
        result.success = false
        result.error = error.message
        onError?.(error)
        reject(error)
      }
    })
  }

  /**
   * 获取状态
   */
  getStatus() {
    return {
      ready: this.ready,
      queueLength: this.queue.length,
      processing: this.processing,
      config: this.config
        ? {
            cliPath: this.config.cliPath,
            workDir: this.config.workDir,
            sandbox: this.config.sandbox,
            model: this.config.model,
          }
        : null,
    }
  }

  /**
   * 停止当前执行
   */
  stop() {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
    this.emit('stop')
  }

  /**
   * 清空队列
   */
  clearQueue() {
    this.queue = []
    this.processing = false
    this.emit('queue:clear')
  }

  // ==================== 私有方法 ====================

  async #checkCLI() {
    return new Promise((resolve) => {
      const { exec } = require('child_process')
      exec(`${this.config.cliPath} --version`, (error) => {
        resolve(!error)
      })
    })
  }

  #buildPrompt(prompt, options = {}) {
    const context = options.context
      ? `
上下文信息：
${JSON.stringify(options.context, null, 2)}
`
      : ''

    return `${context}
${prompt}
`
  }

  async #runCLI(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process')

      const command = `${this.config.cliPath} --model ${this.config.model} --stream`

      const child = exec(command, {
        cwd: this.config.workDir,
        timeout: this.config.timeout * 1000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      })

      let output = ''

      child.stdout?.on('data', (data) => {
        output += data.toString()
        this.emit('output', data.toString())
      })

      child.stderr?.on('data', (data) => {
        this.emit('stderr', data.toString())
      })

      child.on('exit', (code) => {
        if (code === 0) {
          resolve(output)
        } else {
          reject(new Error(`CLI 执行失败，退出码：${code}`))
        }
      })

      child.on('error', reject)

      // 写入提示
      if (child.stdin) {
        child.stdin.write(prompt)
        child.stdin.end()
      }
    })
  }
}

// 导出单例
export const claudeCodeAdapter = new ClaudeCodeAdapterClass()

// 导出工具函数
export function createClaudeCodeAdapter(config) {
  const adapter = new ClaudeCodeAdapterClass()
  if (config) {
    adapter.init(config)
  }
  return adapter
}

export default claudeCodeAdapter
