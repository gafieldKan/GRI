# @gri/codegen

GRI 代码生成器 —— DSL → SQL/TS（确定性、可审阅、可回滚），含统一迁移器。

## 定位

对应方案 §4.4「双轨自动构建」的**编译期**一轨：把语义真源确定性地产出真实代码。
产物是检查进 git 的真文件（可审阅、可回滚），不是运行时魔法。

## API

```js
import {
  generate,            // 编排：generate(ontology, ['sql','typescript'])
  generateSQL,         // DSL → CREATE TABLE（单表继承 → 一张表 + order_type + extra）
  generateTypeScript,  // DSL → OrderBase + 判别联合 Order = A | B | C
  loadOntologyFile,    // 读 .yaml/.json → 解析 → schema+语义双重校验（硬门禁）
  generateMigrationFile, // 本体 → { fileName:'018_x.sql', content }
} from '@gri/codegen'
```

## 生成轨（可插拔，§7.4 扩展契约）

`generators` 注册表：新增生成轨（Vue 页面骨架 / OpenAPI 签名）= 登记一个
`{ name, run(ontology) => string }` 条目，不改骨架。

## 统一迁移器（§2.3）

`loadOntologyFile` 读 `*.ontology.{yaml,yml,json}`，跑 schema + 语义双重校验后产出
编号 `.sql` 文件，直接对接后端 `services/backend/src/infra/db/migrate.js` 的
`_migrations` 序号约定。产物可审阅、可回滚、可测试。

## 测试

```bash
npm test   # node --test，19 例（含「源唯一」契约：YAML 源与内存夹具产出 byte-identical SQL）
```