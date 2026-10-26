/**
 * authz —— 授权**策略插件**（W2.7；`kind="policy"`，装配清单**末位**）。
 *
 * 为什么是「插件」而不是在每处写死：鉴权/授权是**横切关注点**。若每个工具/端点各自写一遍
 * 「你得是运营」，则①判定口径会漂移（本项目已发生过：订餐域与组织域各写一份 site-operator 判定）；
 * ②**组件测试被迫先搭一套权限**才能测别的——正是用户点名的痛点。
 *
 * 故契约（docs/AGENT_SKILL_PLUGIN_CONTRACT.md §一 · plan §四）：工具/插件只**声明所需能力**
 * （这里是 `action.requiresOperator`），宿主在**工具调用处**统一问 `policy.authorize(ctx, action)`。
 * 本插件实现**唯一裁决**。装配清单里 `policy` 恒最后（kind 优先级 900）；**组件测试档**
 * 以 `skipKinds:['policy']` 整体跳过 → `PluginHost.authorize()` 直接放行，免搭权限。
 *
 * **后组装 ≠ 生产可缺省**：生产装配**恒含**本插件（宿主 `assemble({requirePolicy:true})` fail-closed，
 * 缺 policy 即拒绝装配）。只有**测试档**才允许省略/换 no-op 桩。
 *
 * 依赖方向：本插件**不 import** 任何 `@gri/*` 业务模块、不碰 SQL/密钥（契约 §一 红线）。运营判定
 * 的真源（`modules/authz/site-operator.ts`）由**宿主经 ctx 注入**（`ctx.authz.isSiteOperator`）——
 * 与 `ctx.memory` 同一姿势。注入缺失 → **fail-closed**（拒绝），绝不因「拿不到判定」而放行。
 */

/** 从 ctx 取 actor 标识（宿主注入；与 entityId 同源，见 platform 身份不变量 external_id ≡ users.id）。 */
function actorOf(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  const id = ctx.actorId ?? ctx.entityId ?? ctx.externalId ?? null;
  return id == null ? null : String(id);
}

module.exports = {
  /**
   * 授权闸门。**只对显式声明需要运营身份的动作设闸**（`action.requiresOperator === true`），其余放行——
   * 教学、自习、记忆等学生面动作无需运营身份，不该被闸门拦下（否则每加一个工具都要先配权限）。
   *
   * @param {object} ctx   宿主注入的上下文（含 `ctx.authz.isSiteOperator`）
   * @param {{tool?: string, requiresOperator?: boolean}} action
   * @returns {Promise<{allowed: boolean, reason?: string}>}
   */
  async authorize(ctx, action) {
    const act = action && typeof action === 'object' ? action : {};
    if (act.requiresOperator !== true) return { allowed: true };

    // 需要运营身份 → 问真源；**判定不可得即拒绝**（fail-closed，不因注入缺失而放行）。
    const isOp = ctx && ctx.authz && typeof ctx.authz.isSiteOperator === 'function';
    const allowed = isOp ? await ctx.authz.isSiteOperator(actorOf(ctx)) : false;
    return allowed
      ? { allowed: true }
      : { allowed: false, reason: '需要站点运营权限（根组织 owner/admin）' };
  },
};
