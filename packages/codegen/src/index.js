/**
 * @gri/codegen —— 公共入口
 */

export { generate, generators } from './generate.js'
export {
  generateSQL,
  generateCreateTableSQL,
  fieldToColumn,
  sqlLiteral,
  PG_TYPE_MAP,
  resolveObjectLinks,
  uniqueConstraintSQL,
} from './sql.js'
export { generateTypeScript, fieldToTS, TS_TYPE_MAP } from './typescript.js'
export {
  loadOntologyFile,
  generateMigrationBody,
  generateMigrationFile,
  migrationFileName,
} from './migrate.js'
export { toSnakeCase } from '@gri/ontology-engine'