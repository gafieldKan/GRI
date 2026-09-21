import { ForbiddenException } from '@nestjs/common';
import { AgentAdminCapabilityController, AgentAdminOverviewController, AgentAdminClassDiagnosisController } from './agent-admin.controller';
import { OrganizationService } from '../organization/organization.service';

// agent-admin.controller.ts 还导出 routes/tool-runs 控制器，其成员经 @gri/agent-core（ESM）构造。
// 与本仓其它 @gri/* 消费 spec 一致：jest.mock 重定向，避免预处理踩 ESM export 解析。
jest.mock('@gri/agent-core', () => ({
  ModelRouter: class {},
  storeFrom: () => ({}),
}));

function makeOrg(op: boolean): OrganizationService {
  return {
    assertSiteOperator: jest.fn(async (uid: string) => {
      if (!op) throw new ForbiddenException('你不是该组织成员');
    }),
  } as unknown as OrganizationService;
}

function req(uid: string): any {
  return { auth: { externalId: uid } as any };
}

describe('AgentAdminCapabilityController（运营探询，纯只读）', () => {
  it('站点运营（根组织 owner|admin）→ isOperator:true', async () => {
    const ctrl = new AgentAdminCapabilityController(makeOrg(true));
    const out = await ctrl.check(req('owner'));
    expect(out).toEqual({ success: true, isOperator: true });
  });

  it('非运营（guard 抛 Forbidden）→ isOperator:false，且不抛错', async () => {
    const org = makeOrg(false);
    const ctrl = new AgentAdminCapabilityController(org);
    const out = await ctrl.check(req('guest'));
    expect(out).toEqual({ success: true, isOperator: false });
    expect(org.assertSiteOperator).toHaveBeenCalledWith('guest');
  });
});

describe('AgentAdminOverviewController（运营总览，只读聚合）', () => {
  function fakeDb(): any {
    return {
      query: jest.fn(async (sql: string) => {
        if (/LIMIT 8/.test(sql)) return { rows: [{ entity_id: 'e1', tool_name: 'answer.grade', created_at: '2026-09-20T10:00:00Z' }] };
        if (/GROUP BY tool_name/.test(sql)) return { rows: [{ tool_name: 'answer.grade', n: 80 }, { tool_name: 'diagnosis.state', n: 40 }] };
        // 授课落盘聚合（lesson 型 count + DISTINCT kpId + AVG delta）—— SQL 别名带引号 "avgDelta"（pg 才保大小写），fake 忠实模拟该响应键
        if (/plan_type = 'lesson'/.test(sql)) return { rows: [{ n: 1, kps: 1, avgDelta: 12 }] };
        if (/wrong_questions/.test(sql)) return { rows: [{ n: 7 }] };
        if (/learning_plans/.test(sql)) return { rows: [{ n: 1 }] };
        if (/DISTINCT user_id/.test(sql)) return { rows: [{ n: 2 }] };
        if (/FROM agent\.tool_runs/.test(sql)) return { rows: [{ n: 120 }] };
        if (/agent\.entities/.test(sql)) return { rows: [{ n: 3 }] };
        return { rows: [] };
      }),
    } as any;
  }

  it('运营 → 一调带回计数/授课落盘聚合/工具排行/最近动态; guard 用 externalId', async () => {
    const org = makeOrg(true);
    const ctrl = new AgentAdminOverviewController(fakeDb(), org);
    const out = await ctrl.overview(req('owner'));
    expect(org.assertSiteOperator).toHaveBeenCalledWith('owner');
    expect(out.counts).toEqual({ activeStudents: 3, studentsWithData: 2, totalToolRuns: 120, unresolvedWrong: 7, activePlans: 1, lessonsRecorded: 1 });
    expect(out.lessons).toEqual({ count: 1, knowledgePoints: 1, avgDelta: 12 }); // 控制器从别名引号列 "avgDelta" 读,不随 pg 小写折叠
    expect(out.toolUsage[0]).toMatchObject({ toolName: 'answer.grade', n: 80 });
    expect(out.recent[0]).toMatchObject({ entityId: 'e1', toolName: 'answer.grade' });
    expect(out.success).toBe(true);
  });

  it('非运营 → guard 在守卫层抛 Forbidden(不触库)', async () => {
    const org = makeOrg(false);
    const db = fakeDb();
    const ctrl = new AgentAdminOverviewController(db, org);
    await expect(ctrl.overview(req('guest'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('AgentAdminClassDiagnosisController（全班学情，只读运营集合）', () => {
  function fakeDb(): any {
    return {
      query: jest.fn(async (sql: string) => {
        // 每题/每知识点集合准确率透视（跨全体学生）
        if (/GROUP BY kp\.id/.test(sql)) {
          return {
            rows: [
              { kp_id: 'kp_newton', kp_name: '牛顿运动定律', attempts: 10, correct: 7, students: 2 },
              { kp_id: 'kp_quadratic', kp_name: '二次函数', attempts: 12, correct: 3, students: 3 },
              { kp_id: 'kp_pythagorean', kp_name: '勾股定理', attempts: 8, correct: 8, students: 1 },
            ],
          };
        }
        // 每位学生总掌握（学生×累计作答准确率）
        if (/GROUP BY ar\.user_id/.test(sql)) {
          return {
            rows: [
              { student_id: 'e1', attempts: 20, correct: 12 },
              { student_id: 'e2', attempts: 10, correct: 6 },
            ],
          };
        }
        return { rows: [] };
      }),
    } as any;
  }

  it('运营 → 按掌握度弱到强排序 + weakest 前5 + 学生汇总; guard 用 externalId', async () => {
    const org = makeOrg(true);
    const ctrl = new AgentAdminClassDiagnosisController(fakeDb(), org);
    const out = await ctrl.diagnostic(req('owner'));
    expect(org.assertSiteOperator).toHaveBeenCalledWith('owner');
    expect(out.totalStudents).toBe(2);
    expect(out.hasData).toBe(true);
    // 排序：勾股(100) > 牛顿(70) > 二次(25)；弱在前
    expect(out.knowledgePoints.map((k: any) => k.kpId)).toEqual(['kp_quadratic', 'kp_newton', 'kp_pythagorean']);
    // accuracy 归一化为 0–100
    expect(out.knowledgePoints[0]).toMatchObject({ kpId: 'kp_quadratic', accuracy: 25, students: 3 });
    expect(out.weakest.map((k: any) => k.kpId)).toEqual(['kp_quadratic', 'kp_newton', 'kp_pythagorean']);
    expect(out.students[0]).toMatchObject({ studentId: 'e1', accuracy: 60 });
    expect(out.success).toBe(true);
  });

  it('无作答数据 → hasData:false 空集合，不崩', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) } as any;
    const ctrl = new AgentAdminClassDiagnosisController(db, makeOrg(true));
    const out = await ctrl.diagnostic(req('owner'));
    expect(out.hasData).toBe(false);
    expect(out.knowledgePoints).toEqual([]);
    expect(out.weakest).toEqual([]);
    expect(out.totalStudents).toBe(0);
  });

  it('非运营 → guard 在守卫层抛 Forbidden(不触库)', async () => {
    const org = makeOrg(false);
    const db = fakeDb();
    const ctrl = new AgentAdminClassDiagnosisController(db, org);
    await expect(ctrl.diagnostic(req('guest'))).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('知识点题目钻取 questions → 弱→强排(卡题为先) + kpName; 不透答案', async () => {
    function fakeDb(): any {
      return {
        query: jest.fn(async (sql: string, params?: any[]) => {
          if (/FROM edu\.knowledge_points/.test(sql)) return { rows: [{ name: '一元一次方程' }] };
          return {
            rows: [
              { question_id: 'q1', content: '3x+5=11', difficulty: 'easy', type: 'choice', attempts: 6, correct: 0 }, // 所有人答错 → 卡题优先
              { question_id: 'q2', content: '2(x-3)=10', difficulty: 'hard', type: 'bind', attempts: 2, correct: 2 }, // 全对 → 最后
              { question_id: 'q3', content: 'x+2=7', difficulty: 'easy', type: 'choice', attempts: 5, correct: 2 }, // 40%
            ],
          };
        }),
      } as any;
    }
    const ctrl = new AgentAdminClassDiagnosisController(fakeDb(), makeOrg(true));
    const out = await ctrl.questions(req('owner'), 'kp_abc');
    expect(out.success).toBe(true);
    expect(out.kpName).toBe('一元一次方程');
    // 卡题(q1, 0%)放最前 → 其次是 q3(40%) → 最后 q2(100%)
    expect(out.questions.map((x: any) => x.questionId)).toEqual(['q1', 'q3', 'q2']);
    expect(out.questions[0]).toMatchObject({ questionId: 'q1', accuracy: 0, indexed: true });
    // 不透答案：无 answer/explanation 字段
    expect(out.questions[0].answer).toBeUndefined();
    expect(out.questions[0].explanation).toBeUndefined();
  });

  it('知识点题目钻取缺 kpId → 空集合不崩', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) } as any;
    const ctrl = new AgentAdminClassDiagnosisController(db, makeOrg(true));
    const out = await ctrl.questions(req('owner'), undefined);
    expect(out.success).toBe(true);
    expect(out.questions).toEqual([]);
    expect(out.totalQuestions).toBe(0);
  });

  it('知识点题目钻取非运营 → guard 抛 Forbidden(不触库)', async () => {
    const org = makeOrg(false);
    const db = fakeDb();
    const ctrl = new AgentAdminClassDiagnosisController(db, org);
    await expect(ctrl.questions(req('guest'), 'kp_abc')).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('单题作答归因 question → kpName + 错法分布 + 答错学生(谁/写了什么)', async () => {
    function fakeDb(): any {
      return {
        query: jest.fn(async (sql: string, params?: any[]) => {
          if (/FROM edu\.questions q/.test(sql) && /WHERE q\.id = \$1/.test(sql)) {
            return { rows: [{ content: '解方程 3x - 5 = 10', difficulty: 'medium', type: 'fill', knowledge_point_id: 'kp-1', kp_name: '一元一次方程' }] };
          }
          if (/GROUP BY student_answer/.test(sql)) {
            return { rows: [{ student_answer: 'x=15', n: 3 }, { student_answer: 'x=5', n: 2 }, { student_answer: 'x=-5', n: 1 }] };
          }
          if (/FROM edu\.answer_records/.test(sql) && /count\(\*\)/.test(sql) && /is_correct = false/.test(sql)) {
            return { rows: [{ n: 6 }] };
          }
          return { rows: [{ user_id: 'e1', student_answer: 'x=15' }, { user_id: 'e2', student_answer: 'x=5' }] };
        }),
      } as any;
    }
    const ctrl = new AgentAdminClassDiagnosisController(fakeDb(), makeOrg(true));
    const out = await ctrl.questionBreakdown(req('owner'), 'q-1');
    expect(out.success).toBe(true);
    expect(out.kpName).toBe('一元一次方程');
    expect(out.wrongCount).toBe(6);
    // 最热错法在前
    expect(out.topWrong[0]).toEqual({ answer: 'x=15', count: 3 });
    expect(out.wrongStudents[0]).toMatchObject({ studentId: 'e1', answer: 'x=15' });
  });

  it('单题作答归因缺 questionId → 空不崩; 非运营 → guard 抛 Forbidden', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) } as any;
    const ctrl = new AgentAdminClassDiagnosisController(db, makeOrg(true));
    const empty = await ctrl.questionBreakdown(req('owner'), undefined);
    expect(empty.success).toBe(true);
    expect(empty.questionId).toBeNull();
    expect(db.query).not.toHaveBeenCalled();

    const org = makeOrg(false);
    const orgDb = fakeDb();
    const c2 = new AgentAdminClassDiagnosisController(orgDb, org);
    await expect(c2.questionBreakdown(req('guest'), 'q-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(orgDb.query).not.toHaveBeenCalled();
  });
});