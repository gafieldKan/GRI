import { Role } from '../identity/identity.types';

export const MODULE_CATEGORIES = ['business', 'tool', 'admin'] as const;
export type ModuleCategory = (typeof MODULE_CATEGORIES)[number];

export interface AppModule {
  code: string;
  name: string;
  short?: string | null;
  description?: string | null;
  icon?: string | null;
  entryUrl: string;
  category: ModuleCategory;
  allowedRoles: Role[];
  isCore: boolean;
  status: string;
  sortOrder?: number | null;
}

export interface AppModuleRow {
  code: string;
  name: string;
  short: string | null;
  description: string | null;
  icon: string | null;
  entry_url: string;
  category: ModuleCategory;
  allowed_roles: Role[] | null;
  is_core: boolean;
  status: string;
  sort_order: number | null;
}
