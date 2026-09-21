/** M4 organization 切片的领域模型（tenant schema）。 */

export interface Organization {
  id: string;
  name: string;
  code: string | null;
  short_name: string | null;
  description: string | null;
  logo_url: string | null;
  parent_id: string | null;
  parent_path: string | null;
  level: number;
  type: string;
  status: string; // 'active' | 'archived'
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** 组织成员（人列 FK → public.users(id)）。 */
export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string; // ≡ public.users.id ≡ externalId
  role: string; // 'owner' | 'admin' | 'member' | 自定义角色 code
  status: string;
  department: string | null;
  title: string | null;
  employee_no: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** 组织树节点 = 组织 + 直接子节点。 */
export interface OrganizationNode extends Organization {
  children: OrganizationNode[];
}

export interface OrganizationRole {
  id: string;
  organization_id: string;
  name: string;
  code: string;
  description: string | null;
  permissions: string[] | Record<string, unknown>;
  is_system: boolean;
  sort_order: number;
  created_at: string;
}

export interface OrganizationInvitation {
  id: string;
  organization_id: string;
  email: string;
  role_id: string | null;
  inviter_id: string;
  status: string; // pending|accepted|rejected|expired|cancelled
  token: string;
  expires_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  message: string | null;
  created_at: string;
}

/** 用户在某组织的成员定位。 */
export interface Membership {
  organization: Organization;
  role: string;
  title: string | null;
}

/** 组织类型（目录浏览有效值）。 */
export const ORG_TYPES = ['school', 'university', 'institute', 'company', 'other'] as const;

export const INVITATION_TTL_DAYS = 7;