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
  // 支付网关通知回调（M5 垂直一）：网关 POST 进来推收单结果。
  // 公开放行 BUT 强签名校验 + 幂等 + 金额锁库 —— 伪造/重放无效（public-routes 只决定鉴权，不抵消服务内验签）。
  get('POST', /^\/food\/payments\/notify\/?$/),
  // 学情公开知识图谱（M3 tuition 门面）：知识点目录游客可看
  get('GET', /^\/tuition\/knowledge-points\/?$/),
  get('GET', /^\/tuition\/knowledge-points\/[^/]+\/questions\/?$/),
  // M5 AI 垂直：题目库 + 知识图谱公开读（题目无个人隐私，用于冷启动浏览/首页示例）
  get('GET', /^\/tuition\/questions\/?$/),
  get('GET', /^\/tuition\/questions\/[^/]+\/?$/),
  get('GET', /^\/tuition\/knowledge-graph\/?$/),
  // 组织公开目录（M4 organization 门面）：组织清单/树/搜索/详情/子组织游客可看。
  // id 用显式 UUID 形态匹配，避免吞掉 /my、/tree、/search、members、roles、invitations 等受保护字面路径。
  get('GET', /^\/organizations\/?$/),
  get('GET', /^\/organizations\/tree\/?$/),
  get('GET', /^\/organizations\/search\/?$/),
  get('GET', /^\/organizations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/),
  get('GET', /^\/organizations\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/children\/?$/),
  // 本体语义真源目录（M4 ontology 门面）：只读知识端点，游客可内省（不承载写）
  get('GET', /^\/ontology\/objects\/?$/),
  get('GET', /^\/ontology\/objects\/[^/]+(?:\/(?:chain|dispatch\/[^/]+))?\/?$/),
  // 引用主数据字典（M4 master-data 门面）：只读参考数据，游客可读（分类/条目）
  get('GET', /^\/master-data\/kinds\/?$/),
  get('GET', /^\/master-data\/kinds\/[^/]+\/?$/),
  get('GET', /^\/master-data\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/?$/),
  // 数据大屏统计（M5 dashboard 子切片）：只读聚合分析端点 —— 已从游客白名单移除，改强制鉴权，
  // 防游客看聚合运营数据（portal 组织/运营台加固）。登录用户经 /api/identity 鉴权后仍可访问。
];

export function isPublicRoute(method: string, path: string): boolean {
  const m = method.toUpperCase();
  return PUBLIC_ROUTES.some((r) => r.method === m && r.pattern.test(path));
}