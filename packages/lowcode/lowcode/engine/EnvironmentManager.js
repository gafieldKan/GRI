/**
 * 环境管理器
 * 支持开发/测试/生产环境隔离、一键部署
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 环境类型枚举
 */
export const EnvironmentType = {
  DEVELOPMENT: 'development',
  TESTING: 'testing',
  STAGING: 'staging',
  PRODUCTION: 'production',
}

/**
 * 部署状态枚举
 */
export const DeployStatus = {
  PENDING: 'pending',
  DEPLOYING: 'deploying',
  SUCCESS: 'success',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back',
}

/**
 * 环境配置类
 */
export class Environment {
  constructor(config = {}) {
    this.id = config.id || `env_${Date.now()}`
    this.name = config.name || '未命名环境'
    this.type = config.type || EnvironmentType.DEVELOPMENT
    this.description = config.description || ''
    this.url = config.url || ''
    this.apiKey = config.apiKey || ''
    this.variables = config.variables || {}
    this.deployments = config.deployments || []
    this.status = config.status || 'active'
    this.isDefault = config.isDefault || false
    this.createdAt = config.createdAt || Date.now()
    this.updatedAt = config.updatedAt || Date.now()
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      url: this.url,
      variables: this.variables,
      status: this.status,
      isDefault: this.isDefault,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

/**
 * 部署记录类
 */
export class Deployment {
  constructor(config = {}) {
    this.id = config.id || `deploy_${Date.now()}`
    this.environmentId = config.environmentId
    this.applicationId = config.applicationId
    this.version = config.version || '1.0.0'
    this.status = config.status || DeployStatus.PENDING
    this.message = config.message || ''
    this.deployedBy = config.deployedBy || 'system'
    this.startedAt = config.startedAt
    this.completedAt = config.completedAt
    this.error = config.error || null
    this.rollbackTo = config.rollbackTo || null
  }

  toJSON() {
    return {
      id: this.id,
      environmentId: this.environmentId,
      applicationId: this.applicationId,
      version: this.version,
      status: this.status,
      message: this.message,
      deployedBy: this.deployedBy,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error,
      rollbackTo: this.rollbackTo,
    }
  }
}

/**
 * 环境管理器主类
 */
class EnvironmentManagerClass extends EventEmitter {
  constructor() {
    super()
    this.environments = new Map()
    this.deployments = new Map()
    this.currentEnvId = null
    this.#initDefaultEnvironments()
  }

  #initDefaultEnvironments() {
    // 开发环境
    const devEnv = new Environment({
      id: 'env_dev',
      name: '开发环境',
      type: EnvironmentType.DEVELOPMENT,
      description: '本地开发环境',
      url: 'http://localhost:3000',
      isDefault: true,
    })

    // 测试环境
    const testEnv = new Environment({
      id: 'env_test',
      name: '测试环境',
      type: EnvironmentType.TESTING,
      description: '测试环境',
      url: 'http://localhost:3001',
    })

    // 生产环境
    const prodEnv = new Environment({
      id: 'env_prod',
      name: '生产环境',
      type: EnvironmentType.PRODUCTION,
      description: '生产环境',
      url: 'https://app.example.com',
    })

    this.environments.set(devEnv.id, devEnv)
    this.environments.set(testEnv.id, testEnv)
    this.environments.set(prodEnv.id, prodEnv)

    // 默认使用开发环境
    this.currentEnvId = devEnv.id
  }

  /**
   * 创建环境
   */
  create(config) {
    const env = new Environment(config)
    this.environments.set(env.id, env)
    this.emit('environment:create', { env })
    return env
  }

  /**
   * 获取环境
   */
  get(id) {
    return this.environments.get(id)
  }

  /**
   * 获取所有环境
   */
  getAll() {
    return Array.from(this.environments.values())
  }

  /**
   * 获取当前环境
   */
  getCurrent() {
    return this.environments.get(this.currentEnvId)
  }

  /**
   * 设置当前环境
   */
  setCurrent(id) {
    const env = this.environments.get(id)
    if (!env) {
      throw new Error(`环境不存在：${id}`)
    }
    this.currentEnvId = id
    this.emit('environment:switch', { env })
    return env
  }

  /**
   * 更新环境变量
   */
  updateVariables(envId, variables) {
    const env = this.environments.get(envId)
    if (!env) {
      throw new Error(`环境不存在：${envId}`)
    }
    env.variables = { ...env.variables, ...variables }
    env.updatedAt = Date.now()
    this.emit('environment:update', { env })
    return env
  }

  /**
   * 获取环境变量
   */
  getVariables(envId) {
    const env = this.environments.get(envId)
    return env ? env.variables : {}
  }

  /**
   * 部署应用
   */
  async deploy(envId, applicationId, options = {}) {
    const env = this.environments.get(envId)
    if (!env) {
      throw new Error(`环境不存在：${envId}`)
    }

    const deployment = new Deployment({
      environmentId: envId,
      applicationId,
      version: options.version || '1.0.0',
      status: DeployStatus.DEPLOYING,
      message: options.message || '',
      deployedBy: options.deployedBy || 'system',
      startedAt: Date.now(),
    })

    this.deployments.set(deployment.id, deployment)
    this.emit('deploy:start', { deployment, env })

    try {
      // 模拟部署过程
      await this.#executeDeploy(deployment, env, options)

      deployment.status = DeployStatus.SUCCESS
      deployment.completedAt = Date.now()

      env.deployments.push(deployment.id)
      this.emit('deploy:success', { deployment, env })
    } catch (error) {
      deployment.status = DeployStatus.FAILED
      deployment.error = error.message
      deployment.completedAt = Date.now()
      this.emit('deploy:error', { deployment, env, error })
      throw error
    }

    return deployment
  }

  /**
   * 执行部署（模拟）
   */
  async #executeDeploy(deployment, env, options) {
    // 模拟部署步骤
    const steps = [
      { name: '构建资源', duration: 1000 },
      { name: '上传文件', duration: 1500 },
      { name: '更新配置', duration: 500 },
      { name: '重启服务', duration: 2000 },
      { name: '健康检查', duration: 1000 },
    ]

    for (const step of steps) {
      this.emit('deploy:progress', {
        deployment,
        step: step.name,
        progress: Math.round(((steps.indexOf(step) + 1) / steps.length) * 100),
      })
      await new Promise((resolve) => setTimeout(resolve, step.duration))
    }

    return true
  }

  /**
   * 回滚部署
   */
  async rollback(deploymentId, targetDeploymentId) {
    const deployment = this.deployments.get(deploymentId)
    if (!deployment) {
      throw new Error(`部署记录不存在：${deploymentId}`)
    }

    const targetDeployment = this.deployments.get(targetDeploymentId)
    if (!targetDeployment) {
      throw new Error(`目标部署记录不存在：${targetDeploymentId}`)
    }

    deployment.status = DeployStatus.ROLLED_BACK
    deployment.rollbackTo = targetDeploymentId

    this.emit('deploy:rollback', { deployment, targetDeployment })
    return deployment
  }

  /**
   * 获取部署历史
   */
  getDeploymentHistory(envId, limit = 10) {
    const env = this.environments.get(envId)
    if (!env) return []

    return env.deployments
      .map((id) => this.deployments.get(id))
      .filter(Boolean)
      .slice(-limit)
  }

  /**
   * 获取部署状态
   */
  getDeployStatus(deploymentId) {
    return this.deployments.get(deploymentId)
  }

  /**
   * 删除环境
   */
  delete(id) {
    const env = this.environments.get(id)
    if (!env) {
      return false
    }
    if (env.isDefault) {
      throw new Error('不能删除默认环境')
    }
    this.environments.delete(id)
    this.emit('environment:delete', { env })
    return true
  }

  /**
   * 导出环境配置
   */
  export(envId) {
    const env = this.environments.get(envId)
    if (!env) return null
    return JSON.stringify(env.toJSON(), null, 2)
  }

  /**
   * 导入环境配置
   */
  import(jsonString) {
    try {
      const data = JSON.parse(jsonString)
      const env = new Environment(data)
      this.environments.set(env.id, env)
      return env
    } catch (error) {
      throw new Error(`导入环境失败：${error.message}`)
    }
  }

  /**
   * 比较环境差异
   */
  compareEnv(sourceId, targetId) {
    const source = this.environments.get(sourceId)
    const target = this.environments.get(targetId)

    if (!source || !target) {
      throw new Error('环境不存在')
    }

    const diff = {
      variables: {
        added: [],
        removed: [],
        changed: [],
      },
    }

    const sourceKeys = new Set(Object.keys(source.variables))
    const targetKeys = new Set(Object.keys(target.variables))

    // 添加的变量
    targetKeys.forEach((key) => {
      if (!sourceKeys.has(key)) {
        diff.variables.added.push(key)
      }
    })

    // 移除的变量
    sourceKeys.forEach((key) => {
      if (!targetKeys.has(key)) {
        diff.variables.removed.push(key)
      }
    })

    // 变化的变量
    targetKeys.forEach((key) => {
      if (sourceKeys.has(key) && source.variables[key] !== target.variables[key]) {
        diff.variables.changed.push(key)
      }
    })

    return diff
  }
}

/**
 * 部署构建器
 */
class DeploymentBuilder {
  constructor(manager) {
    this.manager = manager
    this.envId = null
    this.appId = null
    this.version = '1.0.0'
    this.message = ''
    this.deployedBy = 'system'
  }

  environment(envId) {
    this.envId = envId
    return this
  }

  application(appId) {
    this.appId = appId
    return this
  }

  version(version) {
    this.version = version
    return this
  }

  message(msg) {
    this.message = msg
    return this
  }

  deployer(deployedBy) {
    this.deployedBy = deployedBy
    return this
  }

  async deploy() {
    if (!this.envId || !this.appId) {
      throw new Error('缺少必要参数')
    }
    return this.manager.deploy(this.envId, this.appId, {
      version: this.version,
      message: this.message,
      deployedBy: this.deployedBy,
    })
  }
}

// 导出单例
export const environmentManager = new EnvironmentManagerClass()
export { DeploymentBuilder }
export default environmentManager
