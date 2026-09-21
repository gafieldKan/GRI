import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { createEngine, OntologyEngine } from '@gri/ontology-engine';
import type { OntologyData } from '@gri/ontology';

// yaml v1 的最小裁定（避免引入 @types/yaml）：仅需 .parse。
// CJS 产物里 require 可用；ESM/类型不在此文件织入。
// eslint-disable-next-line @typescript-eslint/no-var-requires
const YAML = require('yaml') as { parse(src: string): unknown };

/**
 * 本体注册表（M4 ontology 门面）——唯一语义真源的装载点。
 *
 * 单一可信源：默认读 `@gri/ontology` 包内 shipped 的 orders.ontology.yaml；
 * 可用 ONTOLOGY_FILE env 覆盖（未来接入其它本体文件 / 数据库读取）。
 * 装载 = parse(yaml) → OntologyEngine 构造（schema 门禁），fail-fast。
 * 门面只读；不在服务内置集群存储，运行时统一消费同一引擎实例（无多源分歧）。
 */
@Injectable()
export class OntologyRegistry {
  private readonly logger = new Logger(OntologyRegistry.name);
  readonly engine: OntologyEngine;
  readonly sourceFile: string;

  constructor() {
    this.sourceFile = process.env.ONTOLOGY_FILE ?? require.resolve('@gri/ontology/ontologies/orders.ontology.yaml');
    try {
      const raw = readFileSync(this.sourceFile, 'utf8');
      const data = YAML.parse(raw);
      this.engine = createEngine(data as OntologyData);
      this.logger.log(`本体已装载: ${this.engine.ontology.name ?? '(unnamed)'}（${this.engine.objects.length} objects） <- ${this.sourceFile}`);
    } catch (e) {
      throw new Error(`本体装载失败: ${(e as Error).message}`);
    }
  }
}