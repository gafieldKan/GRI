/**
 * 领域模型基类
 * 所有领域模型继承自此类，提供通用属性和方法
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseEntity } from '../core/BaseEntity.js'

/**
 * 领域模型基类
 * 提供领域驱动设计 (DDD) 的基础能力
 */
export class BaseDomain extends BaseEntity {
  // 私有字段
  #domainType = ''
  #aggregateRoot = null

  constructor(config = {}) {
    super(config)
    this.#domainType = config.domainType || 'default'
  }

  // Getter
  get domainType() {
    return this.#domainType
  }
  get aggregateRoot() {
    return this.#aggregateRoot
  }

  /**
   * 设置聚合根
   */
  setAggregateRoot(root) {
    this.#aggregateRoot = root
    return this
  }

  /**
   * 业务规则验证
   * 子类必须实现
   */
  validate() {
    throw new Error('子类必须实现 validate 方法')
  }

  /**
   * 应用业务规则
   * 子类实现具体业务逻辑
   */
  applyBusinessRules() {
    // 模板方法，子类可重写
  }

  /**
   * 领域事件触发
   */
  raiseEvent(eventType, data) {
    console.log(`[Domain Event] ${this.constructor.name}.${eventType}`, data)
    // 子类可以实现具体的事件触发逻辑
  }

  /**
   * 转换为 DTO
   */
  toDTO() {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      status: this.status,
    }
  }

  /**
   * 从 DTO 创建领域对象
   */
  static fromDTO(dto) {
    return new this(dto)
  }
}

/**
 * 值对象基类
 * 不可变对象，用于表示值类型
 */
export class ValueObject {
  constructor(values = {}) {
    Object.freeze(values)
    this._values = values
  }

  get(key) {
    return this._values[key]
  }

  equals(other) {
    if (!(other instanceof ValueObject)) return false
    return JSON.stringify(this._values) === JSON.stringify(other._values)
  }

  toString() {
    return JSON.stringify(this._values)
  }
}

export default BaseDomain
