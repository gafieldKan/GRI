/**
 * Identity 模块不定义类实体，因为直接操作 PG Pool。
 * 此文件用于定义数据库表与 TypeScript 类型的映射关系。
 */
export const IDENTITY_TABLES = {
  USERS: 'public.users',
  STUDENTS: 'edu.students',
} as const;
