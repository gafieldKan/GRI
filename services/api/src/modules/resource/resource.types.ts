export const RESOURCE_TYPES = ['restaurant', 'organization'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export interface ResourceFilter {
  region?: string;
  industry?: string;
  type?: string;
}

export interface ResourceDimensionInput {
  regionId?: string | null;
  industryId?: string | null;
}

export interface ResourceDimension {
  type: ResourceType;
  id: string;
  label: string;
  regionId: string | null;
  industryId: string | null;
}

export interface ResourceRow {
  resource_type: ResourceType;
  resource_id: string;
  label: string | null;
  region_id: string | null;
  industry_id: string | null;
}

export interface ResourceDimensionRow {
  resource_type: ResourceType;
  resource_id: string;
  region_id: string | null;
  industry_id: string | null;
  region_node_id: string | null;
  industry_code: string | null;
}
