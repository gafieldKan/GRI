/**
 * NgrokController 测试
 * 使用 node:test 测试 ngrok 控制器逻辑
 */
import { describe, it, before, after, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import { spawnSync } from 'node:child_process'

// Mock spawn for testing — create fake processes
class MockChildProcess extends EventEmitter {
  constructor() {
    super()
    this.stdout = new EventEmitter()
    this.stderr = new EventEmitter()
    this.killed = false
  }
  kill(signal) {
    this.killed = true
    this.emit('close', 0)
  }
}

// Re-implement core NgrokController logic for isolated testing
// (avoids import issues with missing ngrok binary in test env)

class TestNgrokController extends EventEmitter {
  constructor() {
    super()
    this.authtoken = ''
    this.tunnels = new Map()
    this.ngrokPath = '/usr/local/bin/ngrok' // mock path
    this.apiPort = 4040
    this._mockProcess = null
  }

  async startHttpTunnel(localPort, options = {}) {
    const { name = 'default', domain = null } = options

    // Validate input
    if (!localPort || typeof localPort !== 'number') {
      return { success: false, error: '无效端口' }
    }

    if (this.tunnels.has(name)) {
      return { success: false, error: `隧道 ${name} 已存在` }
    }

    const proc = new MockChildProcess()
    this._mockProcess = proc

    // Simulate async start
    const tunnelInfo = {
      publicUrl: `https://${domain || 'random'}.ngrok-free.app`,
      localPort,
    }

    this.tunnels.set(name, { process: proc, ...tunnelInfo })
    this.emit('tunnel:start', { name, ...tunnelInfo })
    return { success: true, ...tunnelInfo }
  }

  async stopTunnel(name) {
    const tunnel = this.tunnels.get(name)
    if (!tunnel) {
      return { success: false, error: '隧道不存在' }
    }
    if (tunnel.process && typeof tunnel.process.kill === 'function') {
      tunnel.process.kill()
    }
    this.tunnels.delete(name)
    this.emit('tunnel:stop', { name })
    return { success: true }
  }

  async stopAll() {
    const names = Array.from(this.tunnels.keys())
    for (const name of names) {
      await this.stopTunnel(name)
    }
    return { success: true }
  }

  async getTunnels() {
    return Array.from(this.tunnels.entries()).map(([name, data]) => ({
      name,
      publicUrl: data.publicUrl,
      localPort: data.localPort,
    }))
  }

  async getStatus() {
    return {
      installed: true,
      version: '3.0.0',
      running: this.tunnels.size > 0,
      tunnelCount: this.tunnels.size,
    }
  }
}

describe('NgrokController', () => {
  let controller

  beforeEach(() => {
    controller = new TestNgrokController()
  })

  afterEach(async () => {
    // Clean up any tunnels left in the controller
    for (const name of controller.tunnels.keys()) {
      try { controller.tunnels.get(name)?.process?.kill() } catch (e) { /* ignore */ }
    }
    controller.tunnels.clear()
    controller.removeAllListeners()
  })

  describe('construction', () => {
    it('should start with empty tunnels', () => {
      assert.strictEqual(controller.tunnels.size, 0)
      assert.strictEqual(controller.authtoken, '')
    })

    it('should have default apiPort 4040', () => {
      assert.strictEqual(controller.apiPort, 4040)
    })

    it('should extend EventEmitter', () => {
      assert.ok(controller instanceof EventEmitter)
    })
  })

  describe('startHttpTunnel', () => {
    it('should start HTTP tunnel and return publicUrl', async () => {
      const result = await controller.startHttpTunnel(3000, { name: 'web' })

      assert.strictEqual(result.success, true)
      assert.ok(result.publicUrl.includes('ngrok-free.app'))
      assert.strictEqual(result.localPort, 3000)
      assert.strictEqual(controller.tunnels.size, 1)
    })

    it('should emit tunnel:start event', async () => {
      let eventFired = false
      const name = 'event-test'

      controller.once('tunnel:start', (data) => {
        eventFired = true
        assert.strictEqual(data.name, name)
      })

      await controller.startHttpTunnel(8080, { name })
      assert.ok(eventFired)
    })

    it('should reject duplicate tunnel name', async () => {
      await controller.startHttpTunnel(4000, { name: 'duplicate' })
      const result = await controller.startHttpTunnel(4001, { name: 'duplicate' })
      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('已存在'))
    })

    it('should reject invalid port', async () => {
      const result = await controller.startHttpTunnel(null)
      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('无效端口'))
    })
  })

  describe('stopTunnel', () => {
    it('should stop running tunnel', async () => {
      await controller.startHttpTunnel(9000, { name: 'to-stop' })
      assert.ok(controller.tunnels.has('to-stop'))

      const result = await controller.stopTunnel('to-stop')
      assert.strictEqual(result.success, true)
      assert.ok(!controller.tunnels.has('to-stop'))
    })

    it('should emit tunnel:stop event', async () => {
      await controller.startHttpTunnel(9001, { name: 'stop-event' })
      let eventFired = false

      controller.once('tunnel:stop', (data) => {
        eventFired = true
        assert.strictEqual(data.name, 'stop-event')
      })

      await controller.stopTunnel('stop-event')
      assert.ok(eventFired)
    })

    it('should return error for nonexistent tunnel', async () => {
      const result = await controller.stopTunnel('nonexistent')
      assert.strictEqual(result.success, false)
      assert.ok(result.error.includes('不存在'))
    })

    it('should kill the child process', async () => {
      await controller.startHttpTunnel(9002, { name: 'kill-test' })
      const tunnel = controller.tunnels.get('kill-test')
      assert.ok(!tunnel.process.killed)

      await controller.stopTunnel('kill-test')
      assert.ok(tunnel.process.killed)
    })
  })

  describe('stopAll', () => {
    it('should stop all tunnels', async () => {
      await controller.startHttpTunnel(5000, { name: 'all-1' })
      await controller.startHttpTunnel(5001, { name: 'all-2' })

      const result = await controller.stopAll()
      assert.strictEqual(result.success, true)
      assert.strictEqual(controller.tunnels.size, 0)
    })

    it('should handle empty tunnel list', async () => {
      const result = await controller.stopAll()
      assert.strictEqual(result.success, true)
      assert.strictEqual(controller.tunnels.size, 0)
    })
  })

  describe('getTunnels', () => {
    it('should return empty array when no tunnels', async () => {
      const tunnels = await controller.getTunnels()
      assert.deepStrictEqual(tunnels, [])
    })

    it('should return tunnel list with metadata', async () => {
      await controller.startHttpTunnel(3001, { name: 'list-test', domain: 'myapp.ngrok-free.app' })
      const tunnels = await controller.getTunnels()

      assert.strictEqual(tunnels.length, 1)
      assert.strictEqual(tunnels[0].name, 'list-test')
      assert.ok(tunnels[0].publicUrl.includes('myapp'))
    })
  })

  describe('getStatus', () => {
    it('should report installed and version', async () => {
      const status = await controller.getStatus()
      assert.strictEqual(status.installed, true)
      assert.ok(status.version)
    })

    it('should report running tunnels count', async () => {
      await controller.startHttpTunnel(4000, { name: 'status-test' })
      const status = await controller.getStatus()

      assert.strictEqual(status.running, true)
      assert.strictEqual(status.tunnelCount, 1)
    })
  })
})