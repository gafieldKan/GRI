/**
 * 站点运营判定（site operator）—— **唯一真源**（W2.7）。
 *
 * 为什么单独成件：这条「actor 是否为根组织 owner|admin」的判定此前有**两份实现**
 * （`organization.service.assertSiteOperator` 正本、`food.service.assertSiteOperator` 私复刻），
 * 各自写同一段 SQL。两份=两个漂移点：改一处忘另一处，运营判定就会在订餐域与组织域**静默分叉**
 * （一处放行、一处拒绝，且无测试能同时抓到）。
 *
 * 本件只做**判定**（返回布尔，不抛）；抛出/降级是调用方语义：
 *   - `OrganizationService.assertSiteOperator`：非运营 → 抛 `ForbiddenException`（门禁正本）；
 *   - `FoodService.assertSiteOperator`：返回布尔，供「运营旁路 / 仅限本人数据」二分（不是门禁）。
 * 故此处**不**引入 `ForbiddenException`（Nest 依赖），保持成一个纯函数，谁都能用（含事务执行器）。
 *
 * 语义（与既有两份逐字节同）：根组织 = `parent_id IS NULL` 里创建最早的一个；actor 在该组织
 * `status='active'` 的成员角色为 owner|admin → 运营。不读 JWT roles（防缓存轮换丢角色的边缘）。
 */

/** 最小执行器接口：`DatabaseService` 与事务 `client` 都满足（故运营判定可入事务）。 */
export interface QueryExecutor {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * actor 是否为**站点运营**（根组织 owner|admin）。
 * 只读、不抛：无根组织 / 非成员 / 角色不符 一律 `false`（调用方决定抛不抛）。
 */
export async function isSiteOperator(executor: QueryExecutor, actorId: string): Promise<boolean> {
  const root = await executor.query(
    `SELECT id FROM tenant.organizations WHERE parent_id IS NULL ORDER BY created_at, id LIMIT 1`,
  );
  const rootId = root.rows[0]?.id;
  if (typeof rootId !== 'string') return false;

  const member = await executor.query(
    `SELECT role
       FROM tenant.organization_members
      WHERE organization_id = $1 AND user_id = $2 AND status = 'active'
      LIMIT 1`,
    [rootId, actorId],
  );
  const role = member.rows[0]?.role;
  return role === 'owner' || role === 'admin';
}
