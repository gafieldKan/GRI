export const USER_ROLES = ['consumer', 'student', 'merchant', 'operator'] as const;
export type Role = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  name?: string;
  avatar_url?: string;
  role: Role;
  status?: UserStatus;
  created_at?: Date;
  updated_at?: Date;
  deleted_at?: Date | null;
}

export interface Student {
  user_id: string;
  name?: string;
  grade?: number;
  parent_id?: string;
  avatar_url?: string;
  textbook_version?: string;
  school?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserProfile {
  user: User;
  student?: Student;
}

export interface ChangeRoleDto {
  role: Role;
}

export interface ChangeStatusDto {
  status: UserStatus;
}

export interface ListUsersQuery {
  page?: number | string;
  pageSize?: number | string;
  role?: Role;
  status?: UserStatus;
  q?: string;
}

export interface UserListResult {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
}
