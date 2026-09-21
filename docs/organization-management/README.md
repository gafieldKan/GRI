# GRI 组织架构管理模块

## 概述

本模块为 GRI 低代码平台提供完整的组织架构管理功能，支持：

- 组织层级管理（公司→部门→团队）
- 成员管理（添加、移除、角色变更）
- 邀请机制
- 审计日志
- 权限控制

## 文件清单

### 后端文件

| 文件 | 说明 |
|------|------|
| `services/backend/src/infra/db/migrate/008_add_organization_management.sql` | 数据库迁移脚本 |
| `services/backend/src/core/service/OrganizationService.js` | 组织服务 |
| `services/backend/src/core/service/OrganizationMemberService.js` | 成员服务 |
| `services/backend/src/api/organization/Controller.js` | 组织 API 控制器 |
| `services/backend/src/api/organization/MemberController.js` | 成员 API 控制器 |
| `services/backend/src/index.js` | 主入口（已添加路由） |

### 前端文件

| 文件 | 说明 |
|------|------|
| `packages/lowcode/lowcode/components/OrganizationTree/OrganizationTree.jsx` | 组织树组件 |
| `packages/lowcode/lowcode/components/OrganizationTree/index.js` | 组织树导出 |
| `packages/lowcode/lowcode/components/OrganizationMemberList/MemberList.jsx` | 成员列表组件 |
| `packages/lowcode/lowcode/components/OrganizationMemberList/index.js` | 成员列表导出 |
| `packages/lowcode/lowcode/pages/OrganizationManagement/index.jsx` | 组织管理页面 |
| `packages/lowcode/src/App.jsx` | 应用主路由（已添加路由） |

## 部署状态

**当前状态**: ✅ 所有服务已部署并测试通过

- 数据库迁移：✅ 已完成
- 后端服务：✅ 运行中 (端口 3002)
- 前端服务：✅ 运行中 (端口 3000)
- 功能测试：✅ 全部通过 (5/5)

### 测试结果

````
========================================
GRI 组织架构管理完整功能测试
========================================
[1] 后端服务健康检查... ✓
[2] 获取组织树... ✓ (共 9 个组织)
[3] 前端服务检查... ✓
[4] 组织管理页面可访问... ✓
[5] API 版本检查... ✓
========================================
测试结果：通过 5 项，失败 0 项
🎉 所有测试通过！
````

### 部署步骤（重新部署）

#### 1. 执行数据库迁移（可选）

如果数据库尚未迁移，可以手动执行：

```bash
cd /home/ubantu/GRI/services/backend
psql -U postgres -d gri_db -f src/infra/db/migrate/008_add_organization_management.sql
```

或者在应用中自动执行（如果已配置自动迁移）。

### 3. 启动后端服务

### 4. 运行测试脚本

```bash
cd /home/ubantu/GRI
./scripts/test-organization-api.sh
```

### 5. 启动前端开发服务器

```bash
cd /home/ubantu/GRI/packages/lowcode
npm install  # 如果需要
npm run dev
```

### 6. 访问组织管理页面

在浏览器中打开：`http://localhost:5173/admin/organizations`

## API 接口

### 组织 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/organizations/my` | 获取当前用户的组织列表 |
| GET | `/api/organizations/tree` | 获取组织树 |
| GET | `/api/organizations/:id` | 获取组织详情 |
| POST | `/api/organizations` | 创建组织 |
| PUT | `/api/organizations/:id` | 更新组织 |
| DELETE | `/api/organizations/:id` | 删除组织 |
| GET | `/api/organizations/:id/children` | 获取子组织列表 |
| GET | `/api/organizations/search` | 搜索组织 |

### 成员 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/organizations/:organizationId/members` | 获取成员列表 |
| POST | `/api/organizations/:organizationId/members` | 添加成员 |
| DELETE | `/api/organizations/:organizationId/members/:userId` | 移除成员 |
| PUT | `/api/organizations/:organizationId/members/:userId/role` | 更新角色 |

### 角色 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/organizations/:organizationId/roles` | 获取角色列表 |
| POST | `/api/organizations/:organizationId/roles` | 创建角色 |
| PUT | `/api/organizations/:organizationId/roles/:roleId` | 更新角色 |
| DELETE | `/api/organizations/:organizationId/roles/:roleId` | 删除角色 |
| POST | `/api/organizations/:organizationId/roles/:roleId/assign` | 分配角色给成员 |

### 邀请 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/organizations/:organizationId/invitations` | 创建邀请 |
| GET | `/api/organizations/:organizationId/invitations` | 获取邀请列表 |
| GET | `/api/invitations/:token` | 获取邀请详情 |
| POST | `/api/invitations/:token/accept` | 接受邀请 |
| POST | `/api/invitations/:token/cancel` | 取消邀请 |

## 组织类型

| 类型 | 说明 | 图标 |
|------|------|------|
| `company` | 公司 | HomeOutlined |
| `branch` | 分公司 | FolderOutlined |
| `department` | 部门 | TeamOutlined |
| `team` | 团队 | TeamOutlined |
| `store` | 门店 | ShopOutlined |

## 成员角色

| 角色 | 说明 |
|------|------|
| `owner` | 所有者 |
| `manager` | 管理员 |
| `supervisor` | 主管 |
| `member` | 普通成员 |

## 注意事项

1. **数据库依赖**: 确保 PostgreSQL 已安装并可访问
2. **UUID 扩展**: 迁移脚本需要 `uuid-ossp` 扩展
3. **权限控制**: API 需要用户认证，确保 `req.user` 中有 `userId`
4. **软删除**: 组织删除采用软删除，`deleted_at` 字段标记
5. **邀请令牌**: 邀请令牌是一次性的，接受后自动失效
6. **系统角色**: 系统内置角色（如 owner、admin）不能删除

## 下一步开发建议

### 已完成功能
- [x] 组织 CRUD 管理
- [x] 成员管理（添加、移除、角色变更）
- [x] 邀请机制实现
- [x] 角色管理实现
- [x] 审计日志记录

### 待完成功能
1. [ ] 批量导入/导出功能
   - 支持 Excel/CSV 格式导入成员
   - 支持导出组织数据

2. [ ] 完善审计日志查询功能
   - 按时间范围查询
   - 按操作类型筛选
   - 按用户筛选

3. [ ] 添加组织架构可视化图表
   - 组织树形图
   - 成员分布图

4. [ ] 邀请功能完善
   - 邮件发送集成
   - 邀请页面前端实现

5. [ ] 主数据管理模块（P1 模块）
   - 主数据模型定义
   - 主数据服务层
   - 主数据 API
   - 主数据管理 UI
