# P2-T2b identity 运营管理面文件清单

分支：`feat/stage-c-unified-auth-shell`

## 生产代码

| 文件 | 动作 | 说明 |
|------|------|------|
| `services/api/src/modules/identity/identity.types.ts` | 修改 | 新增 `USER_ROLES`/`Role`、`USER_STATUSES`/`UserStatus`、`ChangeRoleDto`、`ChangeStatusDto`、`ListUsersQuery`、`UserListResult`；收敛 `User.role/status` 类型。 |
| `services/api/src/modules/identity/identity.module.ts` | 修改 | 引入 `OrganizationModule`，使控制器可注入唯一授权门面 `OrganizationService`。 |
| `services/api/src/modules/identity/identity.service.ts` | 修改 | 实现 `listUsers`、`updateRole`、`updateStatus`；增加 `enableAuthIdentity`、`validateRole`、`validateStatus`、`normalizePaging`；状态变更按设计联动 auth-center，soft-delete 保留 `edu.students`。 |
| `services/api/src/modules/identity/identity.controller.ts` | 修改 | 删除 `READ_ANY_ELEVATED_ROLES` 与 `ReqAuth.roles`；新增 `externalId(req)`/`requireOperator(req)`；修正 `getById`；新增 `GET /identity`、`PATCH /identity/:id/role`、`PATCH /identity/:id/status`；保持 `me` 字面路由先于 `:id`；UUID 自身比较大小写无关，防 self-protection 绕过。 |
| `services/api/src/migrate/019_identity_role_check.sql` | 新增 | 幂等添加库侧 `ck_users_role`，约束 `public.users.role` 闭集。 |
| `services/auth-center/src/admin/identity-admin.service.ts` | 修改 | 新增 `enableIdentityByExternalId(externalId)`，按 `external_id` 幂等置 `active`。 |
| `services/auth-center/src/admin/identity-admin.controller.ts` | 修改 | 新增 `POST identities/:externalId/enable`，复用 `authorize()` 与 `x-service-token` 保护。 |
| `services/api/src/auth/public-routes.ts` | 未修改 | identity 三个运营端点均未加入匿名白名单，保持 401 兜底。 |

## 测试

| 文件 | 动作 | 说明 |
|------|------|------|
| `services/api/src/modules/identity/identity.controller.spec.ts` | 修改 | 重写旧 `getById` 授权用例，补齐 C1-C9、自身保护与 actor 来源断言，补 `OrganizationService` mock。 |
| `services/api/src/modules/identity/identity.service.spec.ts` | 修改 | 新增 S1-S13，覆盖角色/状态校验、auth-center 启停联动、分页筛选和软删列表语义。 |
| `services/auth-center/src/admin/identity-admin.controller.spec.ts` | 修改 | 补齐 enable 端点成功与缺 service token 用例。 |
| `services/auth-center/src/admin/identity-admin.service.spec.ts` | 修改 | 补齐 `enableIdentityByExternalId` 幂等 UPDATE 用例。 |

## 验收产出

| 文件 | 动作 | 说明 |
|------|------|------|
| `.agents/codex/outputs/p2-task-2-verify.sh` | 新增 | 覆盖 A1-A7、B1-B3、C1-C5、D1-D7、E1-E6、F/G 的 e2e 验收脚本；输出 `PASS/FAIL/VERIFY_EXIT`。 |
| `.agents/codex/outputs/p2-task-2-file-list.md` | 新增 | 本文件清单。 |

## 验证摘要

- API：`npx tsc --noEmit` 通过；`npm run lint` 通过；`npm test -- --runInBand` 为 25 suites / 370 tests 全绿。
- auth-center：`npm test -- --runInBand` 为 4 suites / 31 tests 全绿。
- 迁移：`services/api` 先 build 再 migrate，`019_identity_role_check.sql` 已应用且重复执行幂等跳过。
- e2e：`.agents/codex/outputs/p2-task-2-verify.sh` 输出 `PASS=88 FAIL=0 VERIFY_EXIT=0`。
- 回归：`.agents/codex/outputs/p2-task-1-verify.sh` 输出 `PASS=20 FAIL=0`。
