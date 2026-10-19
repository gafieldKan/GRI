/**
 * 公开读路由白名单 —— 「一处定义」。
 *
 * 施工图 §2：全局 `app.use('/api', requireAuth)`（默认强制）+ 公开读白名单（游客可匿名访问）。
 * 本文件是唯一授权决策点：新增要放开的匿名读端点，在这里加一行即可，不用改每个 controller。
 *
 * 匹配：method + path（相对 /api 的路径，如 /food/restaurants）。id 用 `[^/]+` 容忍 uuid/slug。
 * 语义：白名单命中 → OptionalAuth（无 token 放行，有 token 校验并注入 req.auth 供个性化）；
 *       未命中 → 强制鉴权（无/坏 token → 401）。
 */
export interface PublicRouteRule {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  pattern: RegExp;
}

function get(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH', pattern: RegExp): PublicRouteRule {
  return { method, pattern };
}

/** 匿名可读的公开目录。仅放真正「冷启动浏览」所需的读端点，个人数据/写操作绝不入内。 */
const PUBLIC_ROUTES: PublicRouteRule[] = [
  // 订餐公开目录（M2 food 门面）：游客未登录即可浏览餐厅菜单
  get('GET', /^\/food\/restaurants\/?$/),
  get('GET', /^\/food\/restaurants\/[^/]+\/?$/),
  get('GET', /^\/food\/restaurants\/[^/]+\/dishes\/?$/),
  get('GET', /^\/food\/restaurants\/[^/]+\/reviews\/?$/),
  get('GET', /^\/food\/coupons\/?$/),
  // 支付网关通知回调（M5 垂直一）：网关 POST 进来推收单结果。
  // 公开放行 BUT 强签名校验 + 幂等 + 金额锁库 —— 伪造/重放无效（public-routes 只决定鉴权，不抵消服务内验签）。
  get('POST', /^\/food\/payments\/notify\/?$/),
  // 学情公开题目库（M5 AI 垂直）：题目无个人隐私，用于冷启动浏览/首页示例。
  // 知识点/图谱已退役——K12 全学科由 /api/curriculum/* 承接（本体驱动）。
  get('GET', /^\/tuition\/questions\/?$/),
  get('GET', /^\/tuition\/questions\/[^/]+\/?$/),
  // 组织公开目录（M4 organization 门面）：组织清单/树/搜索/详情/子组织游客可看。
  // id 用显式 UUID 形态匹配，避免吞掉 /my、/tree、/search、members、roles、invitations 等受保护字面路径。
  get('GET', /^\/organizations\/?$/),
  get('GET', /^\/organizations\/tree\/?$/),
  get('GET', /^\/organizations\/search\/?$/),
  get('GET', /^\/organizations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/),
  get('GET', /^\/organizations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/children\/?$/),
  // 人本世界只读目录（W1）：场景/意向/模块映射匿名可读，个人激活上下文不入白名单。
  get('GET', /^\/world\/?$/),
  // 本体语义真源目录（M4 ontology 门面）：只读知识端点，游客可内省（不承载写）
  get('GET', /^\/ontology\/objects\/?$/),
  get('GET', /^\/ontology\/objects\/[^/]+(?:\/(?:chain|dispatch\/[^/]+))?\/?$/),
  // Explorer 区域/行业数据面：本体只读树/详情/搜索/路径与公开几何切片，游客冷启动可浏览。
  // 维度名只放行只读路由形状；未知 name 由 TaxonomyService 统一返回 404。
  get('GET', /^\/taxonomy\/[^/]+\/children\/?$/),
  get('GET', /^\/taxonomy\/[^/]+\/node\/[^/]+\/?$/),
  get('GET', /^\/taxonomy\/[^/]+\/search\/?$/),
  get('GET', /^\/taxonomy\/[^/]+\/path\/[^/]+\/?$/),
  get('GET', /^\/taxonomy\/[^/]+\/tree\/?$/),
  get('GET', /^\/geo\/regions\/[^/]+\/?$/),
  // 资源定位查询：只读列表公开；维度绑定 PUT 不入白名单，由 operator 门禁保护。
  get('GET', /^\/resources\/?$/),
  // K12 课程体系目录（curriculum 门面，本体驱动）：目录公开读（学科/学段/年级/教材/章节/知识点）。
  // knowledge-graph 游客可看结构、登录后叠加个人掌握度（OptionalAuth 语义）。
  // review 审核动作（POST）不入白名单 → 强制鉴权。
  get('GET', /^\/curriculum\/subjects\/?$/),
  get('GET', /^\/curriculum\/grades\/?$/),
  get('GET', /^\/curriculum\/textbooks\/?$/),
  get('GET', /^\/curriculum\/chapters\/?$/),
  get('GET', /^\/curriculum\/knowledge-points\/?$/),
  get('GET', /^\/curriculum\/knowledge-points\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/),
  // 知识点随堂练习（选择题含答案/解析）——公开学习材料，同 /tuition/questions 语义。
  get('GET', /^\/curriculum\/knowledge-points\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/questions\/?$/),
  get('GET', /^\/curriculum\/knowledge-graph\/?$/),
  // 学科知识版图（0.4.0 版图层）：登峰视图数据——游客可看山体结构，
  // 登录后叠加个人掌握度（OptionalAuth 语义，同 knowledge-graph）。
  get('GET', /^\/curriculum\/knowledge-map\/?$/),
  // 学科登顶双维度：匿名出结构，登录叠加掌握度；均为只读端点。
  get('GET', /^\/curriculum\/summit-branches\/?$/),
  get('GET', /^\/curriculum\/summit-grades\/?$/),
  // 学习路径（目标驱动先修闭包）：游客可看先修结构，登录叠加各步骤掌握度（OptionalAuth 语义）。
  get('GET', /^\/curriculum\/learning-path\/?$/),
  // W5-a 光脉学习链与洞窟聚合：只读；匿名出结构，登录叠加个人掌握度/错题/复习/成就。
  get('GET', /^\/curriculum\/learning-chain\/?$/),
  get('GET', /^\/curriculum\/kp-cave\/?$/),
  // Auth 代理端点（M1）：登录/注册/刷新/登出/当前用户/JWKS —— 必须公开，否则无法完成首次登录流程。
  // 这些端点仅作透传到 auth-center，不包含业务逻辑，安全由 auth-center 负责。
  get('POST', /^\/auth\/login\/?$/),
  get('POST', /^\/auth\/register\/?$/),
  get('POST', /^\/auth\/refresh\/?$/),
  get('POST', /^\/auth\/logout\/?$/),
  get('GET', /^\/auth\/me\/?$/),
  get('GET', /^\/auth\/jwks\/?$/),
  // 数据大屏统计（M5 dashboard 子切片）：只读聚合分析端点 —— 已从游客白名单移除，改强制鉴权，
  // 防游客看聚合运营数据（portal 组织/运营台加固）。登录用户经 /api/identity 鉴权后仍可访问。
];

export function isPublicRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return PUBLIC_ROUTES.some((r) => r.method === m && r.pattern.test(path));
}
