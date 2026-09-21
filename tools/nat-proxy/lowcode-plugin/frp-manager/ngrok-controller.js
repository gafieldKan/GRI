/**
 * ngrok 控制器
 * 用于在低代码平台中管理 ngrok 隧道
 */

import { EventEmitter } from 'events'
import { spawn, spawnSync } from 'child_process'
import { existsSync, statSync } from 'fs'
import { homedir } from 'os'

// 执行命令的辅助函数（安全版本，命令和参数分离）
function executeCommand (cmd, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...options, shell: false })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => { stdout += data })
    child.stderr.on('data', (data) => { stderr += data })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code })
      } else {
        reject(new Error(stderr || `Command exited with code ${code}`))
      }
    })

    child.on('error', reject)
  })
}

// 同步执行命令的辅助函数（用于初始化检查）
// 注意：仅用于 'which' 等简单命令，不传递用户输入
function executeCommandSync (cmd, args = []) {
  const result = spawnSync(cmd, args, { encoding: 'utf8', shell: false })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `Command exited with code ${result.status}`)
  }
  return { stdout: result.stdout.trim(), stderr: result.stderr.trim() }
}

class NgrokController extends EventEmitter {
  constructor () {
    super()
    this.authtoken = ''
    this.tunnels = new Map()
    this.ngrokPath = this._findNgrok()
    this.apiPort = 4040 // ngrok 本地 API 端口
  }

  /**
   * 查找 ngrok 可执行文件
   */
  _findNgrok () {
    // 常见路径
    const paths = [
      '/usr/local/bin/ngrok',
      '/usr/bin/ngrok',
      homedir() + '/.ngrok/ngrok',
      homedir() + '/.local/bin/ngrok',
    ]

    // 首先检查固定路径
    for (const ngrokPath of paths) {
      try {
        if (existsSync(ngrokPath) && statSync(ngrokPath).isFile()) {
          return ngrokPath
        }
      } catch (e) {
        continue
      }
    }

    // 在 PATH 中查找 ngrok
    try {
      const { stdout } = executeCommandSync('which', ['ngrok'])
      const ngrokInPath = stdout.trim()
      if (ngrokInPath && existsSync(ngrokInPath)) {
        return ngrokInPath
      }
    } catch (e) {
      // 忽略错误，继续检查
    }

    throw new Error('未找到 ngrok 可执行文件，请先安装 ngrok')
  }

  /**
   * 设置 authtoken
   */
  async setAuthtoken (token) {
    this.authtoken = token
    try {
      // 使用 spawn 执行命令，参数分离传递，避免 shell 注入风险
      await executeCommand(this.ngrokPath, ['config', 'add-authtoken', token])
      this.emit('config:change', { type: 'authtoken', value: token })
      return { success: true }
    } catch (error) {
      this.emit('error', { type: 'config', error: error.message })
      return { success: false, error: error.message }
    }
  }

  /**
   * 启动 HTTP 隧道
   */
  async startHttpTunnel (localPort, options = {}) {
    const { name = 'default', domain = null } = options
    const args = ['http', localPort.toString()]

    if (domain) {
      args.push('--domain', domain)
    }

    try {
      const process = spawn(this.ngrokPath, args, {
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      // 等待 ngrok 启动
      await this._waitForTunnelReady(process)

      const tunnelInfo = await this.getTunnelInfo()
      this.tunnels.set(name, { process, ...tunnelInfo })

      this.emit('tunnel:start', { name, ...tunnelInfo })
      return { success: true, ...tunnelInfo }
    } catch (error) {
      this.emit('error', { type: 'start', error: error.message })
      return { success: false, error: error.message }
    }
  }

  /**
   * 停止隧道
   */
  async stopTunnel (name) {
    const tunnel = this.tunnels.get(name)
    if (tunnel) {
      tunnel.process.kill()
      this.tunnels.delete(name)
      this.emit('tunnel:stop', { name })
      return { success: true }
    }
    return { success: false, error: '隧道不存在' }
  }

  /**
   * 停止所有隧道
   */
  async stopAll () {
    const promises = Array.from(this.tunnels.keys()).map((name) =>
      this.stopTunnel(name)
    )
    await Promise.all(promises)
    return { success: true }
  }

  /**
   * 获取隧道信息（通过 ngrok API）
   */
  async getTunnelInfo () {
    try {
      const response = await fetch(`http://127.0.0.1:${this.apiPort}/api/tunnels`)
      const data = await response.json()
      return {
        tunnels: data.tunnels,
        publicUrl: data.tunnels[0]?.public_url || '',
      }
    } catch (error) {
      return { error: error.message }
    }
  }

  /**
   * 获取所有运行中的隧道
   */
  async getTunnels () {
    return Array.from(this.tunnels.entries()).map(([name, data]) => ({
      name,
      ...data,
    }))
  }

  /**
   * 等待隧道准备就绪
   */
  async _waitForTunnelReady (process, maxRetries = 10) {
    let retries = 0
    while (retries < maxRetries) {
      try {
        const response = await fetch(`http://127.0.0.1:${this.apiPort}/api/tunnels`)
        if (response.ok) {
          return true
        }
      } catch (e) {
        // 等待重试
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
      retries++
    }
    throw new Error('ngrok 启动超时')
  }

  /**
   * 获取 ngrok 状态
   */
  async getStatus () {
    try {
      // 使用 spawn 执行命令，参数分离传递，避免 shell 注入风险
      const { stdout } = await executeCommand(this.ngrokPath, ['version'])
      return {
        installed: true,
        version: stdout.trim(),
        running: this.tunnels.size > 0,
        tunnelCount: this.tunnels.size,
      }
    } catch (e) {
      return {
        installed: false,
        running: false,
        tunnelCount: 0,
      }
    }
  }
}

// 导出单例
export const ngrokController = new NgrokController()
export default ngrokController
