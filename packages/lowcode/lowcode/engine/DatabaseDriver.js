/**
 * 数据库驱动器
 * 支持 MySQL、PostgreSQL、SQLite 等数据库直连
 *
 * @author GRI Team
 * @version 1.0
 */

import { EventEmitter } from 'events'

/**
 * 数据库类型枚举
 */
export const DatabaseType = {
  MYSQL: 'mysql',
  POSTGRESQL: 'postgresql',
  SQLITE: 'sqlite',
  MONGODB: 'mongodb',
}

/**
 * 数据库配置类
 */
export class DatabaseConfig {
  constructor(config = {}) {
    this.id = config.id || `db_${Date.now()}`
    this.name = config.name || '未命名数据库'
    this.type = config.type || DatabaseType.MYSQL
    this.host = config.host || 'localhost'
    this.port = config.port || 3306
    this.database = config.database || ''
    this.username = config.username || ''
    this.password = config.password || ''
    this.ssl = config.ssl || false
    this.pool = config.pool || {
      min: 2,
      max: 10,
      idleTimeout: 30000,
    }
    this.options = config.options || {}
  }

  getConnectionString() {
    switch (this.type) {
      case DatabaseType.MYSQL:
        return `mysql://${this.username}:***@${this.host}:${this.port}/${this.database}`
      case DatabaseType.POSTGRESQL:
        return `postgresql://${this.username}:***@${this.host}:${this.port}/${this.database}`
      case DatabaseType.SQLITE:
        return `sqlite://${this.database}`
      default:
        return 'unknown'
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      host: this.host,
      port: this.port,
      database: this.database,
      username: this.username,
      ssl: this.ssl,
      pool: this.pool,
    }
  }
}

/**
 * 查询构建器
 */
class QueryBuilder {
  constructor(table, driver) {
    this.table = table
    this.driver = driver
    this.conditions = []
    this.params = []
    this.orderByFields = []
    this.limitValue = null
    this.offsetValue = null
  }

  where(field, operator, value) {
    this.conditions.push({ field, operator, value })
    return this
  }

  whereEq(field, value) {
    return this.where(field, '=', value)
  }

  whereIn(field, values) {
    return this.where(field, 'IN', values)
  }

  orderBy(field, direction = 'ASC') {
    this.orderByFields.push({ field, direction })
    return this
  }

  limit(count) {
    this.limitValue = count
    return this
  }

  offset(count) {
    this.offsetValue = count
    return this
  }

  buildQuery() {
    let sql = `SELECT * FROM ${this.table}`

    if (this.conditions.length > 0) {
      const whereClauses = this.conditions.map((cond) => {
        if (cond.operator === 'IN') {
          return `${cond.field} IN (${cond.value.map(() => '?').join(', ')})`
        }
        return `${cond.field} ${cond.operator} ?`
      })
      sql += ` WHERE ${whereClauses.join(' AND ')}`
    }

    if (this.orderByFields.length > 0) {
      sql += ` ORDER BY ${this.orderByFields.map((o) => `${o.field} ${o.direction}`).join(', ')}`
    }

    if (this.limitValue) {
      sql += ' LIMIT ?'
    }

    if (this.offsetValue) {
      sql += ' OFFSET ?'
    }

    return sql
  }

  getParams() {
    const params = []
    for (const cond of this.conditions) {
      if (cond.operator === 'IN' && Array.isArray(cond.value)) {
        params.push(...cond.value)
      } else {
        params.push(cond.value)
      }
    }
    if (this.limitValue) {
      params.push(this.limitValue)
    }
    if (this.offsetValue) {
      params.push(this.offsetValue)
    }
    return params
  }
}

/**
 * 数据库驱动基类
 */
class DatabaseDriver extends EventEmitter {
  constructor(config) {
    super()
    this.config = config
    this.connected = false
    this.connection = null
  }

  async connect() {
    throw new Error('子类必须实现 connect 方法')
  }

  async disconnect() {
    throw new Error('子类必须实现 disconnect 方法')
  }

  async query(sql, params = []) {
    throw new Error('子类必须实现 query 方法')
  }

  async execute(sql, params = []) {
    throw new Error('子类必须实现 execute 方法')
  }

  table(name) {
    return new QueryBuilder(name, this)
  }
}

/**
 * MySQL 驱动实现
 */
class MySqlDriver extends DatabaseDriver {
  async connect() {
    // 模拟连接
    this.connected = true
    this.emit('connect', { config: this.config })
    return true
  }

  async disconnect() {
    this.connected = false
    this.emit('disconnect')
  }

  async query(sql, params = []) {
    if (!this.connected) {
      throw new Error('数据库未连接')
    }
    console.log('[MySQL]', sql, params)
    return []
  }

  async execute(sql, params = []) {
    return this.query(sql, params)
  }

  async getTables() {
    const result = await this.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = database()'
    )
    return result.map((r) => r.table_name)
  }

  async getTableSchema(tableName) {
    const result = await this.query(`DESCRIBE ${tableName}`)
    return result
  }
}

/**
 * PostgreSQL 驱动实现
 */
class PostgreSQLDriver extends DatabaseDriver {
  async connect() {
    this.connected = true
    this.emit('connect', { config: this.config })
    return true
  }

  async disconnect() {
    this.connected = false
    this.emit('disconnect')
  }

  async query(sql, params = []) {
    if (!this.connected) {
      throw new Error('数据库未连接')
    }
    console.log('[PostgreSQL]', sql, params)
    return []
  }

  async execute(sql, params = []) {
    return this.query(sql, params)
  }

  async getTables() {
    const result = await this.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    )
    return result.map((r) => r.table_name)
  }

  async getTableSchema(tableName) {
    const result = await this.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = '${tableName}'`
    )
    return result
  }
}

/**
 * SQLite 驱动实现
 */
class SQLiteDriver extends DatabaseDriver {
  async connect() {
    this.connected = true
    this.emit('connect', { config: this.config })
    return true
  }

  async disconnect() {
    this.connected = false
    this.emit('disconnect')
  }

  async query(sql, params = []) {
    if (!this.connected) {
      throw new Error('数据库未连接')
    }
    console.log('[SQLite]', sql, params)
    return []
  }

  async execute(sql, params = []) {
    return this.query(sql, params)
  }
}

/**
 * 数据库管理器
 */
class DatabaseManagerClass extends EventEmitter {
  constructor() {
    super()
    this.connections = new Map()
    this.drivers = {
      [DatabaseType.MYSQL]: MySqlDriver,
      [DatabaseType.POSTGRESQL]: PostgreSQLDriver,
      [DatabaseType.SQLITE]: SQLiteDriver,
    }
  }

  /**
   * 注册数据库连接
   */
  register(config) {
    const dbConfig = new DatabaseConfig(config)
    this.connections.set(dbConfig.id, dbConfig)
    this.emit('register', { config: dbConfig })
    return dbConfig
  }

  /**
   * 获取数据库驱动
   */
  async getConnection(dbId) {
    const config = this.connections.get(dbId)
    if (!config) {
      throw new Error(`数据库连接不存在：${dbId}`)
    }

    const DriverClass = this.drivers[config.type]
    if (!DriverClass) {
      throw new Error(`不支持的数据库类型：${config.type}`)
    }

    const driver = new DriverClass(config)
    await driver.connect()
    return driver
  }

  /**
   * 测试连接
   */
  async testConnection(dbId) {
    try {
      const driver = await this.getConnection(dbId)
      const tables = await driver.getTables()
      return {
        success: true,
        message: '连接成功',
        tables: tables,
      }
    } catch (error) {
      return {
        success: false,
        message: error.message,
      }
    }
  }

  /**
   * 执行查询
   */
  async query(dbId, sql, params = []) {
    const driver = await this.getConnection(dbId)
    return driver.query(sql, params)
  }

  /**
   * 执行插入
   */
  async insert(dbId, table, data) {
    const driver = await this.getConnection(dbId)
    const keys = Object.keys(data)
    const values = Object.values(data)
    const placeholders = keys.map(() => '?').join(', ')

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`
    return driver.execute(sql, values)
  }

  /**
   * 执行更新
   */
  async update(dbId, table, data, where) {
    const driver = await this.getConnection(dbId)
    const setClause = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(', ')
    const whereClause = Object.keys(where)
      .map((key) => `${key} = ?`)
      .join(' AND ')

    const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`
    const params = [...Object.values(data), ...Object.values(where)]

    return driver.execute(sql, params)
  }

  /**
   * 执行删除
   */
  async delete(dbId, table, where) {
    const driver = await this.getConnection(dbId)
    const whereClause = Object.keys(where)
      .map((key) => `${key} = ?`)
      .join(' AND ')
    const sql = `DELETE FROM ${table} WHERE ${whereClause}`
    const params = Object.values(where)

    return driver.execute(sql, params)
  }

  /**
   * 查询构建器
   */
  table(dbId, tableName) {
    return new QueryBuilder(tableName, this.getConnection(dbId))
  }

  /**
   * 获取所有连接
   */
  getConnections() {
    return Array.from(this.connections.values())
  }

  /**
   * 删除连接
   */
  delete(dbId) {
    return this.connections.delete(dbId)
  }
}

// 导出单例
export const databaseManager = new DatabaseManagerClass()
export { MySqlDriver, PostgreSQLDriver, SQLiteDriver, QueryBuilder }
export default databaseManager
