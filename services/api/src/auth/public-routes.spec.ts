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

  describe('学情公开知识图谱', () => {
    it('放行 GET 知识点列表与某点下的题', () => {
      expect(isPublicRoute('GET', '/tuition/knowledge-points')).toBe(true);
      expect(isPublicRoute('GET', '/tuition/knowledge-points/kp1/questions')).toBe(true);
    });

    it('M5 题目库/知识图谱公开读；个人数据与写操作不放行', () => {
      expect(isPublicRoute('GET', '/tuition/questions')).toBe(true);
      expect(isPublicRoute('GET', '/tuition/questions/q1')).toBe(true);
      expect(isPublicRoute('GET', '/tuition/knowledge-graph')).toBe(true);
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

  describe('引用主数据字典（M4 master-data）', () => {
    const EID = '90000000-0000-0000-0000-000000000001';

    it('放行 GET 分类概览 / 某字典条目 / 单条目(显式 UUID)', () => {
      expect(isPublicRoute('GET', '/master-data/kinds')).toBe(true);
      expect(isPublicRoute('GET', '/master-data/kinds/Subject')).toBe(true);
      expect(isPublicRoute('GET', `/master-data/${EID}`)).toBe(true);
    });

    it('写方法 / 非 UUID 单条目路径不放行', () => {
      expect(isPublicRoute('POST', '/master-data/kinds')).toBe(false);
      expect(isPublicRoute('PUT', '/master-data/kinds/Subject')).toBe(false);
      expect(isPublicRoute('GET', '/master-data/not-a-uuid')).toBe(false);
    });
  });

  describe('受保护端点一律不放行', () => {
    it('个人数据 / 写操作 / 未上榜路径都被强制鉴权', () => {
      expect(isPublicRoute('GET', '/identity/me')).toBe(false);
      expect(isPublicRoute('PUT', '/identity/me')).toBe(false);
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