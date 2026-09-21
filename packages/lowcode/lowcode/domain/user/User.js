/**
 * 用户领域模型
 * 包含用户的核心业务逻辑和规则
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseDomain, ValueObject } from '../BaseDomain.js'

/**
 * 用户资料值对象
 */
export class UserProfile extends ValueObject {
  constructor({ avatar, nickname, phone, email, gender, birthday }) {
    super({ avatar, nickname, phone, email, gender, birthday })
    Object.freeze(this)
  }

  get avatar() {
    return this._values.avatar
  }
  get nickname() {
    return this._values.nickname
  }
  get phone() {
    return this._values.phone
  }
  get email() {
    return this._values.email
  }
  get gender() {
    return this._values.gender
  }
  get birthday() {
    return this._values.birthday
  }
}

/**
 * 用户实体
 */
export class User extends BaseDomain {
  #username = ''
  #password = ''
  #profile = null
  #roles = []
  #organizationId = null
  #lastLoginAt = null

  constructor(config = {}) {
    super({ ...config, domainType: 'user' })

    this.#username = config.username || ''
    this.#password = config.password || ''
    this.#roles = config.roles || []
    this.#organizationId = config.organizationId || null
    this.#lastLoginAt = config.lastLoginAt || null

    if (config.profile) {
      this.#profile =
        config.profile instanceof UserProfile ? config.profile : new UserProfile(config.profile)
    }
  }

  // Getter
  get username() {
    return this.#username
  }
  get password() {
    return this.#password
  }
  get profile() {
    return this.#profile
  }
  get roles() {
    return [...this.#roles]
  }
  get organizationId() {
    return this.#organizationId
  }
  get lastLoginAt() {
    return this.#lastLoginAt
  }

  // 业务方法
  validate() {
    const errors = []
    if (!this.#username) errors.push('用户名不能为空')
    if (errors.length > 0) {
      throw new Error(`用户验证失败：${errors.join('，')}`)
    }
    return true
  }

  hasRole(role) {
    return this.#roles.includes(role)
  }

  addRole(role) {
    if (!this.#roles.includes(role)) {
      this.#roles.push(role)
    }
    return this
  }

  // 序列化
  toDTO() {
    return {
      ...super.toDTO(),
      username: this.#username,
      profile: this.#profile?._values,
      roles: this.#roles,
      organizationId: this.#organizationId,
      lastLoginAt: this.#lastLoginAt,
    }
  }

  static fromDTO(dto) {
    return new User(dto)
  }
}

export default User
