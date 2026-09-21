/**
 * 低代码平台 Repository 层导出
 *
 * Repository 模式实现
 * 提供数据访问与持久化抽象层
 *
 * @author GRI Team
 * @version 1.0
 */

import { BaseRepository, DataSource } from './BaseRepository.js'
import { OrganizationRepository, OrganizationMemberRepository, RoleRepository } from './OrganizationRepository.js'
import { RestaurantRepository } from './RestaurantRepository.js'
import { DishRepository } from './DishRepository.js'

// 基础 Repository
export { BaseRepository, DataSource } from './BaseRepository.js'
export { DataSourceType } from '../engine/DataSourceManager.js'

// 组织与角色
export {
  OrganizationRepository,
  OrganizationMemberRepository,
  RoleRepository,
  organizationRepository,
  organizationMemberRepository,
  roleRepository,
} from './OrganizationRepository.js'

// 餐厅
export { RestaurantRepository, restaurantRepository } from './RestaurantRepository.js'

// 菜品
export { DishRepository, dishRepository } from './DishRepository.js'

/**
 * Repository 统一导出类
 */
export class RepositoryFactory {
  constructor() {
    this.repositories = new Map()
  }

  /**
   * 注册 Repository
   */
  register(name, repository) {
    this.repositories.set(name, repository)
    return this
  }

  /**
   * 获取 Repository
   */
  get(name) {
    return this.repositories.get(name)
  }

  /**
   * 批量注册
   */
  registerAll(repositories) {
    Object.entries(repositories).forEach(([name, repo]) => {
      this.register(name, repo)
    })
    return this
  }

  /**
   * 清空所有 Repository
   */
  clear() {
    this.repositories.clear()
  }
}

// 导出工厂单例
export const repositoryFactory = new RepositoryFactory()
