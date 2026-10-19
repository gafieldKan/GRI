import { isPublicRoute } from './public-routes';

describe('public-routes 公开读白名单', () => {
  describe('订餐公开目录', () => {
    it('放行 GET 餐厅列表 / 详情 / 菜品', () => {
      expect(isPublicRoute('GET', '/food/restaurants')).toBe(true);
      expect(isPublicRoute('GET', '/food/restaurants/abc')).toBe(true);
      expect(isPublicRoute('GET', '/food/restaurants/abc/dishes')).toBe(true);
    });

    it('暂不认菜品更深的子路径（未定义规则，保持保守不放行）', () => {
      expect(isPublicRoute('GET', '/food/restaurants/abc/dishes/xyz')).toBe(false);
    });

    it('餐厅目录的写方法不放行', () => {
      expect(isPublicRoute('POST', '/food/restaurants')).toBe(false);
      expect(isPublicRoute('DELETE', '/food/restaurants/abc')).toBe(false);
    });
  });

  describe('学情公开题目库', () => {
    it('M5 题目库公开读；个人数据与写操作不放行', () => {
      expect(isPublicRoute('GET', '/tuition/questions')).toBe(true);
      expect(isPublicRoute('GET', '/tuition/questions/q1')).toBe(true);
      // 题目的生成/REST 写不放行
      expect(isPublicRoute('POST', '/tuition/questions')).toBe(false);
      expect(isPublicRoute('POST', '/tuition/questions/generate')).toBe(false);
      // 会话 / 错题 / 计划 / 练习 / 报告 ->个人私有
      expect(isPublicRoute('POST', '/tuition/sessions')).toBe(false);
      expect(isPublicRoute('GET', '/tuition/sessions/s1')).toBe(false);
      expect(isPublicRoute('GET', '/tuition/wrong-questions')).toBe(false);
      expect(isPublicRoute('POST', '/tuition/exam/analyze')).toBe(false);
      expect(isPublicRoute('GET', '/tuition/analysis/report/latest/student')).toBe(false);
    });

    it('已退役的旧知识点/图谱端点不再放行（K12 由 /api/curriculum/* 承接）', () => {
      expect(isPublicRoute('GET', '/tuition/knowledge-points')).toBe(false);
      expect(isPublicRoute('GET', '/tuition/knowledge-points/kp1/questions')).toBe(false);
      expect(isPublicRoute('GET', '/tuition/knowledge-graph')).toBe(false);
    });
  });

  describe('K12 课程体系公开目录（curriculum / OptionalAuth 读）', () => {
    it('目录端点游客可读，含 knowledge-graph / knowledge-map / learning-path / summit 双维度', () => {
      expect(isPublicRoute('GET', '/curriculum/subjects')).toBe(true);
      expect(isPublicRoute('GET', '/curriculum/knowledge-points')).toBe(true);
      expect(isPublicRoute('GET', '/curriculum/knowledge-graph')).toBe(true);
      expect(isPublicRoute('GET', '/curriculum/knowledge-map')).toBe(true);
      expect(isPublicRoute('GET', '/curriculum/learning-path')).toBe(true);
      expect(isPublicRoute('GET', '/curriculum/summit-branches')).toBe(true);
      expect(isPublicRoute('GET', '/curriculum/summit-grades')).toBe(true);
      expect(isPublicRoute('GET', '/curriculum/learning-chain')).toBe(true);
      expect(isPublicRoute('GET', '/curriculum/kp-cave')).toBe(true);
    });

    it('学习路径/登顶维度非 GET 不放行，未定义路径保持保守', () => {
      expect(isPublicRoute('POST', '/curriculum/learning-path')).toBe(false);
      expect(isPublicRoute('POST', '/curriculum/summit-branches')).toBe(false);
      expect(isPublicRoute('POST', '/curriculum/summit-grades')).toBe(false);
      expect(isPublicRoute('GET', '/curriculum/learning-path/extra')).toBe(false);
      expect(isPublicRoute('POST', '/curriculum/learning-chain')).toBe(false);
      expect(isPublicRoute('GET', '/curriculum/learning-chain/extra')).toBe(false);
      expect(isPublicRoute('POST', '/curriculum/kp-cave')).toBe(false);
      expect(isPublicRoute('GET', '/curriculum/kp-cave/extra')).toBe(false);
    });

    it('知识点随堂练习题公开读（含答案/解析，学习材料）', () => {
      expect(isPublicRoute('GET', '/curriculum/knowledge-points/10000000-0000-0000-0000-000000000001/questions')).toBe(true);
      expect(isPublicRoute('POST', '/curriculum/knowledge-points/10000000-0000-0000-0000-000000000001/questions')).toBe(false);
    });
  });

  describe('组织公开目录（M4）', () => {
    const ORG_ID = '10000000-0000-0000-0000-000000000001';

    it('放行 GET 组织清单 / 树 / 搜索 / 详情(显式 UUID) / 子组织', () => {
      expect(isPublicRoute('GET', '/organizations')).toBe(true);
      expect(isPublicRoute('GET', '/organizations/tree')).toBe(true);
      expect(isPublicRoute('GET', '/organizations/search')).toBe(true);
      expect(isPublicRoute('GET', `/organizations/${ORG_ID}`)).toBe(true);
      expect(isPublicRoute('GET', `/organizations/${ORG_ID}/children`)).toBe(true);
    });

    it('泛 UUID 形态之外的受保护字面路径绝不放行', () => {
      // /my 是个人数据 → 强制鉴权
      expect(isPublicRoute('GET', '/organizations/my')).toBe(false);
      // 写操作
      expect(isPublicRoute('POST', '/organizations')).toBe(false);
      expect(isPublicRoute('PUT', `/organizations/${ORG_ID}`)).toBe(false);
      expect(isPublicRoute('DELETE', `/organizations/${ORG_ID}`)).toBe(false);
      // 成员 / 角色 / 邀请（个人与内部数据）
      expect(isPublicRoute('GET', `/organizations/${ORG_ID}/members`)).toBe(false);
      expect(isPublicRoute('POST', `/organizations/${ORG_ID}/members`)).toBe(false);
      expect(isPublicRoute('GET', `/organizations/${ORG_ID}/roles`)).toBe(false);
      expect(isPublicRoute('POST', `/organizations/${ORG_ID}/invitations`)).toBe(false);
      expect(isPublicRoute('PUT', '/organizations/invitations/accept/not-a-uuid-token')).toBe(false);
    });
  });

  describe('本体语义真源目录（M4 ontology）', () => {
    it('放行 GET 对象目录 / 详情 / 继承链 / 多态派发', () => {
      expect(isPublicRoute('GET', '/ontology/objects')).toBe(true);
      expect(isPublicRoute('GET', '/ontology/objects/CateringOrder')).toBe(true);
      expect(isPublicRoute('GET', '/ontology/objects/CateringOrder/chain')).toBe(true);
      expect(isPublicRoute('GET', '/ontology/objects/CateringOrder/dispatch/confirm')).toBe(true);
    });

    it('本体只读——写方法绝不放行', () => {
      expect(isPublicRoute('POST', '/ontology/objects')).toBe(false);
      expect(isPublicRoute('PUT', '/ontology/objects/CateringOrder')).toBe(false);
      expect(isPublicRoute('DELETE', '/ontology/objects/CateringOrder')).toBe(false);
    });
  });

  describe('区域/行业 Explorer 数据面', () => {
    it('放行 taxonomy 只读端点', () => {
      expect(isPublicRoute('GET', '/taxonomy/region/children')).toBe(true);
      expect(isPublicRoute('GET', '/taxonomy/region/node/100000')).toBe(true);
      expect(isPublicRoute('GET', '/taxonomy/industry/search')).toBe(true);
      expect(isPublicRoute('GET', '/taxonomy/industry/path/ISIC%20Rev.5')).toBe(true);
      expect(isPublicRoute('GET', '/taxonomy/resource/children')).toBe(true);
      expect(isPublicRoute('GET', '/taxonomy/resource/tree')).toBe(true);
      expect(isPublicRoute('GET', '/taxonomy/unknown/children')).toBe(true);
    });

    it('放行按国家加载的几何切片', () => {
      expect(isPublicRoute('GET', '/geo/regions/100000')).toBe(true);
      expect(isPublicRoute('GET', '/geo/regions/world')).toBe(true);
    });

    it('taxonomy/geo 写方法与未定义深路径不放行', () => {
      expect(isPublicRoute('POST', '/taxonomy/region/children')).toBe(false);
      expect(isPublicRoute('PUT', '/taxonomy/industry/node/A')).toBe(false);
      expect(isPublicRoute('POST', '/taxonomy/resource/node')).toBe(false);
      expect(isPublicRoute('GET', '/taxonomy/region/children/extra')).toBe(false);
      expect(isPublicRoute('POST', '/geo/regions/100000')).toBe(false);
      expect(isPublicRoute('GET', '/geo/regions/100000/extra')).toBe(false);
    });

    it('维度治理写路径（新建）与审计流水必须登录（P4-B）', () => {
      expect(isPublicRoute('POST', '/taxonomy/region/node')).toBe(false);
      expect(isPublicRoute('POST', '/taxonomy/industry/node')).toBe(false);
      // 审计流水含 actor_id，属治理内部视图，不对外开放
      expect(isPublicRoute('GET', '/taxonomy/region/changes')).toBe(false);
    });
  });

  describe('资源定位查询', () => {
    it('只放行 GET /resources，PUT 绑定维度必须登录', () => {
      expect(isPublicRoute('GET', '/resources')).toBe(true);
      expect(isPublicRoute('GET', '/resources/')).toBe(true);
      expect(isPublicRoute('PUT', `/resources/restaurant/${'b0000000-0000-0000-0000-000000000001'}/dimension`)).toBe(false);
      expect(isPublicRoute('GET', `/resources/restaurant/${'b0000000-0000-0000-0000-000000000001'}/dimension`)).toBe(false);
      expect(isPublicRoute('GET', '/resources/extra')).toBe(false);
    });
  });

  describe('人本世界读端点（W1）', () => {
    it('GET /world 匿名放行，写方法与未定义深路径不放行', () => {
      expect(isPublicRoute('GET', '/world')).toBe(true);
      expect(isPublicRoute('GET', '/world/')).toBe(true);
      expect(isPublicRoute('POST', '/world')).toBe(false);
      expect(isPublicRoute('GET', '/world/extra')).toBe(false);
    });

    it('个人激活上下文与我的组织必须登录', () => {
      expect(isPublicRoute('GET', '/context/me')).toBe(false);
      expect(isPublicRoute('GET', '/organizations/mine')).toBe(false);
    });
  });

  describe('受保护端点一律不放行', () => {
    it('注册公开；改密与注销必须登录', () => {
      expect(isPublicRoute('POST', '/auth/register')).toBe(true);
      expect(isPublicRoute('PUT', '/auth/password')).toBe(false);
      expect(isPublicRoute('DELETE', '/identity/me')).toBe(false);
    });

    it('个人数据 / 写操作 / 未上榜路径都被强制鉴权', () => {
      expect(isPublicRoute('GET', '/identity/me')).toBe(false);
      expect(isPublicRoute('PUT', '/identity/me')).toBe(false);
      expect(isPublicRoute('GET', '/modules')).toBe(false);
      expect(isPublicRoute('GET', '/food/orders/me')).toBe(false);
      expect(isPublicRoute('POST', '/food/orders')).toBe(false);
      expect(isPublicRoute('GET', '/tuition/wrong-questions')).toBe(false);
      expect(isPublicRoute('GET', '/tuition/plans')).toBe(false);
    });

    it('方法大小写不敏感但语义不变', () => {
      expect(isPublicRoute('get', '/food/restaurants')).toBe(true);
    });
  });
});
