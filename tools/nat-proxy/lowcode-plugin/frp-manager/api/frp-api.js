/**
 * FRP 内网穿透管理 API
 * 提供隧道管理、状态监控等接口
 * 实际通过 spawn frpc 进程 + frpc admin API (localhost:7400) 管理隧道
 */

import { Router } from 'express'
import { spawn, execSync } from 'child_process'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const router = Router()

// 内存存储隧道信息 + 进程引用
const tunnelStore = new Map()
// frpc 主进程引用（每个隧道一个 frpc 进程）
const frpcProcesses = new Map()

/**
 * 生成临时 frpc 配置文件
 */
function generateFrpcConfig(tunnelName, config) {
  const content = `[common]
server_addr = ${process.env.FRP_SERVER_ADDR || '127.0.0.1'}
server_port = ${process.env.FRP_SERVER_PORT || '7000'}
token = ${process.env.FRP_TOKEN || ''}
tls_enable = true
log_level = info

[${tunnelName}]
type = ${config.protocol || 'tcp'}
local_ip = 127.0.0.1
local_port = ${config.localPort}
remote_port = ${config.remotePort}
`
  const filePath = join(tmpdir(), `frpc_${tunnelName}.ini`)
  writeFileSync(filePath, content)
  return filePath
}

/**
 * 执行 FRP 命令的辅助函数（spawn 子进程）
 */
function executeFrpCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('frpc', args, { shell: false })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => { stdout += data })
    child.stderr.on('data', (data) => { stderr += data })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
      } else {
        reject(new Error(stderr || `Command exited with code ${code}`))
      }
    })

    child.on('error', reject)
  })
}

/**
 * 通过 frpc admin API 查询流量统计
 */
async function fetchFrpcStats() {
  try {
    const response = await fetch('http://127.0.0.1:7400/api/status')
    if (!response.ok) return null
    const data = await response.json()
    return data
  } catch (e) {
    return null
  }
}

/**
 * @api GET /api/frp/status
 * @desc 获取 FRP 服务状态和隧道列表
 */
router.get('/frp/status', async (req, res) => {
  try {
    // 检查 frpc 进程是否运行
    let frpcRunning = false
    let tunnels = []

    try {
      execSync('pgrep -x frpc', { stdio: 'ignore' })
      frpcRunning = true

      // 从 frpc admin 接口获取隧道信息
      const stats = await fetchFrpcStats()
      if (stats) {
        tunnels = Object.entries(stats.tunnels || {}).map(([name, t]) => ({
          id: name,
          name: name,
          protocol: t.type || 'tcp',
          localPort: t.local_port,
          remotePort: t.remote_port,
          status: t.status === 'online' ? 'running' : 'stopped',
          traffic: (t.todayinsen || 0) + (t.todayoutsen || 0) + 'B',
        }))
      }
    } catch (e) {
      // frpc 未运行或无 admin API
    }

    // 补充内存中的隧道（未通过 admin API 可见的）
    for (const [name, tunnel] of tunnelStore) {
      if (!tunnels.find(t => t.name === name)) {
        tunnels.push({
          id: name,
          name,
          protocol: tunnel.protocol || 'tcp',
          localPort: tunnel.localPort,
          remotePort: tunnel.remotePort,
          status: frpcProcesses.has(name) ? 'running' : tunnel.status || 'stopped',
          traffic: '0B',
        })
      }
    }

    res.json({
      success: true,
      connected: frpcRunning,
      tunnels,
      serverAddr: process.env.FRP_SERVER_ADDR || '',
      version: '0.61.1',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api POST /api/frp/tunnel
 * @desc 创建新隧道
 */
router.post('/frp/tunnel', async (req, res) => {
  try {
    const { name, protocol, localPort, remotePort } = req.body

    if (!name || !localPort || !remotePort) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数',
      })
    }

    // 保存隧道配置到内存
    tunnelStore.set(name, {
      protocol: protocol || 'tcp',
      localPort,
      remotePort,
      status: 'stopped',
    })

    res.json({
      success: true,
      message: '隧道配置已保存',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api DELETE /api/frp/tunnel/:name
 * @desc 删除隧道
 */
router.delete('/frp/tunnel/:name', async (req, res) => {
  try {
    const { name } = req.params

    if (tunnelStore.has(name)) {
      tunnelStore.delete(name)
    }

    res.json({
      success: true,
      message: '隧道已删除',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api POST /api/frp/tunnel/:name/start
 * @desc 启动隧道
 */
router.post('/frp/tunnel/:name/start', async (req, res) => {
  try {
    const { name } = req.params
    const tunnel = tunnelStore.get(name)

    if (!tunnel) {
      return res.status(404).json({
        success: false,
        error: '隧道不存在',
      })
    }

    // 检查是否已在运行
    if (frpcProcesses.has(name)) {
      return res.json({
        success: true,
        message: '隧道已在运行中',
      })
    }

    // 检查 frpc 是否可用
    let frpcAvailable = false
    try {
      execSync('which frpc', { stdio: 'ignore' })
      frpcAvailable = true
    } catch (e) {
      // frpc 未安装
    }

    if (frpcAvailable) {
      // 生成临时配置文件并启动 frpc 子进程
      const configPath = generateFrpcConfig(name, tunnel)
      const proc = spawn('frpc', ['-c', configPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
      })

      proc.on('error', (err) => {
        console.error(`[FRP] tunnel ${name} process error:`, err.message)
        frpcProcesses.delete(name)
        tunnel.status = 'stopped'
        tunnelStore.set(name, tunnel)
        try { unlinkSync(configPath) } catch (e) { /* ignore */ }
      })

      proc.on('close', (code) => {
        console.log(`[FRP] tunnel ${name} process exited with code ${code}`)
        frpcProcesses.delete(name)
        tunnel.status = 'stopped'
        tunnelStore.set(name, tunnel)
        try { unlinkSync(configPath) } catch (e) { /* ignore */ }
      })

      frpcProcesses.set(name, { process: proc, configPath })
    }

    tunnel.status = 'running'
    tunnelStore.set(name, tunnel)

    res.json({
      success: true,
      message: frpcAvailable ? '隧道已启动 (frpc 进程运行中)' : '隧道已标记为启动 (frpc 未安装，仅状态更新)',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api POST /api/frp/tunnel/:name/stop
 * @desc 停止隧道
 */
router.post('/frp/tunnel/:name/stop', async (req, res) => {
  try {
    const { name } = req.params
    const tunnel = tunnelStore.get(name)

    if (!tunnel) {
      return res.status(404).json({
        success: false,
        error: '隧道不存在',
      })
    }

    // 实际停止 frpc 子进程
    const procInfo = frpcProcesses.get(name)
    if (procInfo) {
      try {
        procInfo.process.kill('SIGTERM')
        // 清理临时配置文件
        try { unlinkSync(procInfo.configPath) } catch (e) { /* ignore */ }
      } catch (e) {
        console.error(`[FRP] Failed to kill frpc process for ${name}:`, e.message)
      }
      frpcProcesses.delete(name)
    }

    tunnel.status = 'stopped'
    tunnelStore.set(name, tunnel)

    res.json({
      success: true,
      message: '隧道已停止',
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * @api GET /api/frp/stats
 * @desc 获取流量统计
 */
router.get('/frp/stats', async (req, res) => {
  try {
    // 从 frpc admin API 获取真实流量统计
    const stats = await fetchFrpcStats()

    if (stats) {
      // 汇总所有隧道的流量
      const tunnels = stats.tunnels || {}
      let todayIn = 0
      let todayOut = 0
      let totalIn = 0
      let totalOut = 0

      for (const t of Object.values(tunnels)) {
        todayIn += t.todayinsen || 0
        todayOut += t.todayoutsen || 0
        totalIn += t.totalin || 0
        totalOut += t.totalout || 0
      }

      res.json({
        success: true,
        todayIn: formatBytes(todayIn),
        todayOut: formatBytes(todayOut),
        totalIn: formatBytes(totalIn),
        totalOut: formatBytes(totalOut),
        tunnelCount: Object.keys(tunnels).length,
        raw: { todayIn, todayOut, totalIn, totalOut },
      })
    } else {
      // frpc admin API 不可用，返回进程数作为替代指标
      const runningCount = frpcProcesses.size
      res.json({
        success: true,
        todayIn: 'N/A (frpc admin API 不可用)',
        todayOut: 'N/A',
        totalIn: 'N/A',
        totalOut: 'N/A',
        activeProcesses: runningCount,
      })
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

/**
 * 字节数格式化
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = (bytes / Math.pow(1024, i)).toFixed(1)
  return value + units[i]
}

export default router
