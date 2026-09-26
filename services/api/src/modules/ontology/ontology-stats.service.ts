import { Injectable, Logger } from '@nestjs/common';
import { readdirSync } from 'fs';
import * as path from 'path';
import { DatabaseService } from '../../database/database.service';
import { createEngine, OntologyEngine } from '@gri/ontology-engine';
import type { OntologyData } from '@gri/ontology';

// yaml v1 的最小裁定（避免引入 @types/yaml）：仅需 .parse。CJS 产物里 require 可用。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const YAML = require('yaml') as { parse(src: string): unknown };

/**
 * 开发全流程统计门面 —— 一端点聚合多源（§展示页面施工定稿）：
 *
 *  1. 本体统计：运行时真实内省「全部 3 份」ontology YAML（补 registry 只装
 *     orders 一份的缺口，不改既有内省端点契约——加性）。
 *  2. DB 统计：information_schema 读 schema/表数（DatabaseService @Global 已导出）。
 *  3. 迁移清单：readdir dist/migrate（nest-cli assets 已 COPY），try/catch 容忍失败。
 *  4. 开发全流程清单：gri-api 容器无 git/docs/（实测），以内置结构化常量承载，
 *     注明快照日期；快照来源 = git log + docs 清单（2026-09-25）。
 *
 * 设计模式落点（本功能自身）：门面（多源聚合一端点）、工厂（createEngine 每 YAML
 * 一引擎）、单例（Nest provider）。只读，无写路径。
 */

/** 本体目录：默认 @gri/ontology 包内 shipped 目录（容器内 /app/node_modules/... 三份齐）。 */
const ONTOLOGY_DIR = path.dirname(
  require.resolve('@gri/ontology/ontologies/orders.ontology.yaml'),
);

/** 开发全流程内置清单（curated，快照 2026-09-25，来源 git log + docs/ 清单）。 */
const DEV_PROCESS_SNAPSHOT = {
  snapshotDate: '2026-09-25',
  /** 方案文档：4 篇现役 + 21 篇归档（docs/archive/）+ ai-tutor 15 篇。 */
  plans: {
    active: [
      { name: 'GRI_REWRITE_TARGET_BLUEPRINT', desc: '重写蓝图（单一后端+单库多 schema）' },
      { name: 'GRI_REWRITE_CONSTRUCTION_PLAN', desc: '重写施工图（鉴权/切片/迁移管线）' },
      { name: 'GRI_LEGACY_RENOVATION_PLAN', desc: '旧资产改造定稿（底线=本体驱动+OO+GoF）' },
      { name: 'P2_PLAN', desc: '统一鉴权三阶段（拓扑/签发中心/统一鉴权壳）' },
    ],
    archivedCount: 21,
    aiTutorDocsCount: 15,
  },
  /** 计划切片：P1 四件套 → P2 三阶段 → P3 agent-core + 37 片连叠 → 旧资产改造六片。 */
  milestones: [
    { stage: 'P1', name: '本体底座四件套 + 本体样板端到端打通', status: '已完成' },
    { stage: 'P2', name: '统一鉴权三阶段（A 拓扑 / B 签发中心 / C 统一鉴权壳）', status: '已完成' },
    { stage: 'P3', name: 'agent-core 浓缩底座 + 每生 AI 教师 37 片连叠', status: '已完成' },
    { stage: '改造', name: '旧资产改造六片（lowcode 删 / tuition·master-data 退役 / k12 四特性 / docs 归档）', status: '已完成' },
  ],
  /** commits：15（全部 2026-09，按 conventional type）。 */
  commits: { total: 15, fix: 7, feat: 4, chore: 3, refactor: 1 },
  /** 测试：api jest + packages node --test。 */
  tests: { jestApi: 230, nodeTest: 82 },
};

/** 设计模式清单（GoF 三大类，项目实际落点——非为模式而模式）。 */
const DESIGN_PATTERNS = {
  creational: [
    { name: '工厂方法', sites: 'createEngine（packages/ontology-engine/src/engine.js:153）；makeTool（packages/agent-core/src/tool.js:18）；generators 可插拔注册表（packages/codegen/src/generate.js:16）', why: 'YAML→引擎/工具→闭包/生成器按名注册，创建逻辑集中' },
    { name: '单例', sites: 'Nest @Injectable provider 默认单例：DatabaseService / OntologyRegistry / 各门面 service', why: '本体引擎与连接池全局唯一，运行时无多源分歧' },
  ],
  structural: [
    { name: '外观', sites: 'OntologyService / TuitionService / CurriculumService / DashboardService 门面', why: '把引擎内省/SQL 细节/多表聚合封装为窄端点' },
    { name: '适配器', sites: 'JwtAuthMiddleware Express→Nest 包装（services/api/src/auth/jwt-auth.middleware.ts:44）；storeFrom 查询函数→MemoryStore（packages/agent-core/src/store.js:10）', why: '异构接口对齐到框架内统一形态' },
    { name: '组合', sites: 'TextbookChapter 自引用树 parentChapter（k12 本体 + 012 迁移）', why: '章节层级「部分-整体」一致处理' },
  ],
  behavioral: [
    { name: '策略', sites: 'AuthRouterMiddleware isPublicRoute 分派强制/可选（jwt-auth.middleware.ts:36）；ModelRouter 按路由键切模型（packages/agent-core/src/model-router.js:11）', why: '鉴权强度与模型选型可插拔切换' },
    { name: '模板方法', sites: 'generateSQL 混合分派：单表基表+普通对象并存（packages/codegen/src/sql.js:156）', why: '骨架固定、分派可变，orders+k12 双防漂移锚点' },
    { name: '状态', sites: 'DSL stateMachine YAML→CHECK 同源落库（013 迁移 4 CHECK）+ lesson.current 授课状态机', why: '生命周期三态机约束与运行态同源' },
    { name: '观察者', sites: 'ToolRegistry onRun 钩子→agent.tool_runs 审计（packages/agent-core/src/tool-registry.js:11）', why: '工具执行副作用可观测' },
    { name: '责任链', sites: 'axios 拦截器链（apps/portal/src/api/index.js）；main.ts ValidationPipe→AuthRouter 中间件链', why: '请求逐级加工与短路' },
  ],
};

/** OO 四特性落点（本体驱动的实现体现）。 */
const OO_FEATURES = [
  { name: '多态', sites: 'Textbook 抽象基类+六学科子类（discriminator textbook_type）/ Order+三行业子类（order_type）', how: 'dispatch 按判别值路由最具体实现；单表继承一行存多形态' },
  { name: '继承', sites: 'extends 链展开：inheritedFields / chain 递归父类字段扁平化（packages/ontology-engine/src/engine.js:65）', how: '子类只声明 variantFields，公共字段从基类继承' },
  { name: '封装', sites: '本体引擎封装继承/接口/抽象解析；门面服务封装 SQL 细节；registry 封装装载（parse→门禁 fail-fast）', how: '语义真源唯一，消费方只见窄接口' },
  { name: '生命周期', sites: '三态机 draft→published→archived（013 迁移 4 CHECK 落库）/ 订单状态机 / 授课状态机', how: '状态迁移受 CHECK 与状态机双重约束' },
];

/** 现实世界的事物 → 本体映射（冷启动示例，展示页 §2 用）。 */
const REAL_WORLD_MAPPINGS = [
  { domain: '订餐', things: '餐厅/菜单/订单/用户', ontology: 'gri-orders（orders.ontology.yaml）', note: 'Order 抽象基类 + 三行业子类，Confirmable 接口' },
  { domain: 'K12 教育', things: '学科/学段/年级/教材/章节/知识点/前置依赖', ontology: 'k12-curriculum（k12-curriculum.ontology.yaml）', note: 'Textbook 抽象基类 + 六学科子类，前置依赖桥表' },
  { domain: '落库验证', things: 'orders 表 + 判别列 + extra JSONB', ontology: 'gri-ontology-orders（database-orders.ontology.yaml）', note: 'codegen 防漂移锚点（契约测试以此为准）' },
];

/** 单份本体的统计形态（引擎内省 → 展示结构）。 */
function introspectOntology(engine: OntologyEngine, sourceFile: string) {
  // 引擎是 JS 包（无完善 d.ts）——OntologyData/引擎内省面按 any 读取，形态在映射处固定。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ontology = engine.ontology as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objects = (engine.objects ?? []) as any[];

  const abstractClasses = objects
    .filter((o) => o.abstract === true)
    .map((o) => o.name as string);
  const subclasses = objects
    .filter((o) => Boolean(o.extends))
    .map((o) => ({
      name: o.name as string,
      base: o.extends as string,
      discriminator: (o.discriminator as Record<string, unknown>)?.field ?? null,
    }));
  const discriminators = subclasses.filter((s) => s.discriminator).length;
  const stateMachines = objects.filter((o) => o.stateMachine).length;
  const interfaces = ((ontology.interfaces as Array<Record<string, unknown>>) ?? []).map(
    (i) => i.name as string,
  );
  // 关系两处声明：本体级 links（orders 样板，纯语义）+ 对象级 links（k12 实测 9 条）。
  // 同形（source/target/name/cardinality/foreignKey），两处不重叠，合并即全量。
  const ontoLinks = ((ontology.links as Array<Record<string, unknown>>) ?? []).map((l) => ({
    source: l.source as string,
    target: l.target as string,
    name: l.name as string,
    cardinality: l.cardinality as string,
    foreignKey: (l.foreignKey as string) ?? null,
  }));
  const objLinks = objects.flatMap((o) =>
    (((o.links ?? []) as Array<Record<string, unknown>>) as Array<Record<string, unknown>>).map(
      (l) => ({
        source: o.name as string,
        target: l.target as string,
        name: l.name as string,
        cardinality: l.cardinality as string,
        foreignKey: (l.foreignKey as string) ?? null,
      }),
    ),
  );
  const links = [...ontoLinks, ...objLinks];

  // 单表继承建模结果：base 是完整基类对象、判别键名 discriminatorField（实测 orders/k12）。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const st = (engine as any).singleTableInheritance() as {
    base: { name?: string; table?: string };
    discriminatorField: string;
    subclasses: string[];
  } | null;

  return {
    name: ontology.name ?? '(unnamed)',
    schemaVersion: ontology.schemaVersion ?? null,
    description: ontology.description ?? null,
    sourceFile: path.basename(sourceFile),
    objectCount: objects.length,
    abstractClasses,
    subclassCount: subclasses.length,
    subclasses,
    discriminatorCount: discriminators,
    stateMachineCount: stateMachines,
    interfaces,
    linkCount: links.length,
    links,
    singleTable: st
      ? {
          baseName: st.base?.name ?? '(unnamed)',
          baseTable: st.base?.table ?? null,
          discriminatorColumn: st.discriminatorField,
          subclassCount: st.subclasses.length,
        }
      : null,
  };
}

@Injectable()
export class OntologyStatsService {
  private readonly logger = new Logger(OntologyStatsService.name);
  /** 装载全部 3 份 YAML（parse → createEngine fail-fast），与 registry 装载同一模式。 */
  private readonly engines: Array<{ engine: OntologyEngine; sourceFile: string }> = [];

  constructor(private readonly db: DatabaseService) {
    try {
      const files = readdirSync(ONTOLOGY_DIR)
        .filter((f) => f.endsWith('.ontology.yaml'))
        .sort();
      for (const file of files) {
        const sourceFile = path.join(ONTOLOGY_DIR, file);
        const data = YAML.parse(require('fs').readFileSync(sourceFile, 'utf8')) as OntologyData;
        this.engines.push({ engine: createEngine(data), sourceFile });
      }
      this.logger.log(`统计装载 ${this.engines.length} 份本体 <- ${ONTOLOGY_DIR}`);
    } catch (e) {
      // 求稳：装载失败不崩启动，stats 返回空本体清单（DB/迁移/开发流程照常）。
      this.logger.error(`本体统计装载失败: ${(e as Error).message}`);
    }
  }

  /** 聚合端点：本体 + DB + 迁移 + 开发全流程（四段）。 */
  async stats() {
    const [ontologies, database, migrations] = await Promise.all([
      this.ontologyStats(),
      this.dbStats(),
      this.migrationStats(),
    ]);

    // 关系统计：一对多（many 落列）/ 一对一（unique FK）/ 桥表（复合唯一锚点）。
    const linkStats = ontologies.reduce(
      (acc, o) => {
        acc.total += o.linkCount;
        acc.oneToMany += o.links.filter((l) => l.cardinality === 'many').length;
        acc.oneToOne += o.links.filter((l) => l.cardinality === 'one').length;
        return acc;
      },
      { total: 0, oneToMany: 0, oneToOne: 0 },
    );

    return {
      ontologies,
      ontologyTotals: {
        ontologyCount: ontologies.length,
        objectCount: ontologies.reduce((a, o) => a + o.objectCount, 0),
        abstractCount: ontologies.reduce((a, o) => a + o.abstractClasses.length, 0),
        subclassCount: ontologies.reduce((a, o) => a + o.subclassCount, 0),
        discriminatorCount: ontologies.reduce((a, o) => a + o.discriminatorCount, 0),
        interfaceCount: ontologies.reduce((a, o) => a + o.interfaces.length, 0),
        stateMachineCount: ontologies.reduce((a, o) => a + o.stateMachineCount, 0),
        links: linkStats,
      },
      database,
      migrations,
      designPatterns: DESIGN_PATTERNS,
      ooFeatures: OO_FEATURES,
      realWorldMappings: REAL_WORLD_MAPPINGS,
      devProcess: DEV_PROCESS_SNAPSHOT,
    };
  }

  /** 本体统计：运行时真实内省全部已装载引擎。 */
  private async ontologyStats() {
    return this.engines.map(({ engine, sourceFile }) => introspectOntology(engine, sourceFile));
  }

  /** DB 统计：information_schema（schema 数 + 表数）。求稳：失败回空不崩。 */
  private async dbStats() {
    try {
      const schemas = await this.db.query(
        `SELECT count(*)::text AS count FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema')`,
      );
      const tables = await this.db.query(
        `SELECT count(*)::text AS count FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')`,
      );
      return {
        schemaCount: Number((schemas.rows[0] as { count?: string })?.count ?? 0),
        tableCount: Number((tables.rows[0] as { count?: string })?.count ?? 0),
      };
    } catch (e) {
      this.logger.warn(`DB 统计失败（回空）: ${(e as Error).message}`);
      return { schemaCount: 0, tableCount: 0 };
    }
  }

  /** 迁移清单：readdir dist/migrate（dist/modules/ontology → dist/migrate）。求稳：失败回空。 */
  private async migrationStats() {
    try {
      const dir = path.join(__dirname, '../../migrate');
      const files = readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort();
      let appliedCount = 0;
      try {
        const applied = await this.db.query(
          `SELECT count(*)::text AS count FROM _api_migrations`,
        );
        appliedCount = Number((applied.rows[0] as { count?: string })?.count ?? 0);
      } catch {
        // _api_migrations 表不存在（未跑迁移）——容忍。
      }
      return { dir: 'services/api/migrate', files, fileCount: files.length, appliedCount };
    } catch (e) {
      this.logger.warn(`迁移清单读取失败（回空）: ${(e as Error).message}`);
      return { dir: 'services/api/migrate', files: [], fileCount: 0, appliedCount: 0 };
    }
  }
}
