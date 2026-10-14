export type TaxonomyName = 'region' | 'industry' | 'resource';

export interface TaxonomyNode {
  id: string;
  code: string | null;
  name: string;
  short: string | null;
  english: string | null;
  level: string;
  parentId: string | null;
  hasChildren: boolean;
  childCount: number;
  iso2?: string | null;
  iso3?: string | null;
  center?: unknown;
  section?: string | null;
  intro?: string | null;
  includes?: string | null;
  also?: string | null;
  excludes?: string | null;
  refs?: unknown;
  updated?: boolean | null;
}

export interface TaxonomyChildren {
  parent: TaxonomyNode;
  children: TaxonomyNode[];
}

export interface TaxonomySearch {
  query: string;
  limit: number;
  items: TaxonomyNode[];
}

export interface TaxonomyPath {
  nodes: TaxonomyNode[];
}

export interface RegionTaxonomyRow {
  id: string;
  code: string | null;
  name: string;
  short: string | null;
  english: string | null;
  level: string;
  iso2: string | null;
  iso3: string | null;
  center: unknown;
  parent_id: string | null;
  has_children: boolean;
  child_count: number | string;
}

export interface IndustryTaxonomyRow {
  id: string;
  code: string;
  name: string;
  short: string | null;
  english: string | null;
  level: string;
  parent_id: string | null;
  section: string | null;
  intro: string | null;
  includes: string | null;
  also: string | null;
  excludes: string | null;
  refs: unknown;
  updated: boolean | null;
  has_children: boolean;
  child_count: number | string;
}

export interface ResourceTaxonomyRow {
  id: string;
  code: string;
  name: string;
  level: string;
  parent_id: string | null;
  has_children: boolean;
  child_count: number | string;
}
