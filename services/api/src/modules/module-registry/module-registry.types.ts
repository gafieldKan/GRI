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
  selected: boolean;
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
  selected: boolean;
}

export interface ModuleSelection {
  code: string;
  selected: boolean;
}

export interface ModuleFilter {
  region?: string;
  industry?: string;
}

export interface ModuleRegionOption {
  nodeId: string;
  code: string | null;
  name: string;
  level: 'country' | 'province';
  parentId: string | null;
}

export interface ModuleIndustryOption {
  code: string;
  name: string;
  level: 'section';
  section: string | null;
}

export interface ModuleDimensionOptions {
  regions: ModuleRegionOption[];
  industries: ModuleIndustryOption[];
}

export interface ModuleBindings {
  code: string;
  regionNodeIds: string[];
  industryCodes: string[];
}

export interface ModuleBindingInput {
  regionNodeIds?: string[];
  industryCodes?: string[];
}

export interface ModuleRegionOptionRow {
  node_id: string;
  code: string | null;
  name: string;
  level: 'country' | 'province';
  parent_id: string | null;
}

export interface ModuleIndustryOptionRow {
  code: string;
  name: string;
  level: 'section';
  section: string | null;
}

export interface ModuleBindingsRow {
  code: string;
  region_node_ids: string[] | null;
  industry_codes: string[] | null;
}
