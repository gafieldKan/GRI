// 'core' = 域无关的统一主体身份（平台级自注册），订餐/学情为其 identity_links 链接；
// 'food' | 'tutor' 保留为历史/特定域身份的描述值。
export type Domain = 'food' | 'tutor' | 'core';

/**
 * 统一主体身份（对应 identities 表）。
 * 订餐账户有 password_hash，AI 学生无密码。
 */
export interface Identity {
  id: string;
  domain: Domain;
  username: string | null;
  email: string | null;
  phone: string | null;
  passwordHash: string | null;
  name: string | null;
  externalId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export function mapRow(row: Record<string, unknown>): Identity {
  return {
    id: row.id as string,
    domain: row.domain as Domain,
    username: (row.username as string) ?? null,
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    passwordHash: (row.password_hash as string) ?? null,
    name: (row.name as string) ?? null,
    externalId: (row.external_id as string) ?? null,
    status: (row.status as string) ?? 'active',
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}