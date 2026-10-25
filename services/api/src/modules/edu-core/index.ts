/**
 * @edu-core —— 教育域**唯一数据所有者**（W2.1）。
 *
 * 「单一领域组件」的落地：agent / tuition / curriculum / twin / identity 不再各自直取 `edu.*`；
 * 域内逻辑与 SQL 语句收敛到本模块。当前已收敛：SM-2 间隔重复（{@link ./sm2}）。
 *
 * 传输无关：读写口由调用方注入，Nest `DatabaseService` 与 agent-core `Store` 同形皆可。
 */
export * from './sm2';
