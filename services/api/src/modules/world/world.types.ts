export interface SceneModuleLink {
  moduleCode: string;
  sortOrder: number;
  requiresOptIn: boolean;
}

export interface LifeIntent {
  code: string;
  label: string;
  description?: string | null;
  sortOrder: number;
  modules: SceneModuleLink[];
}

export interface LifeScene {
  code: string;
  name: string;
  en?: string | null;
  theme: string;
  icon?: string | null;
  posX?: number | null;
  posY?: number | null;
  sortOrder: number;
  status: string;
  modules: SceneModuleLink[];
  intents: LifeIntent[];
}

export interface HumanWorld {
  scenes: LifeScene[];
  generatedAt: string;
}

export interface OrganizationMine {
  id: string;
  name: string;
  type: string;
  role: string;
  tags: string[];
  parentId?: string | null;
}

export interface ActivationContext {
  version: string;
  profile: {
    id: string;
    username?: string | null;
    name: string;
    email?: string | null;
    role: string;
    avatarUrl?: string | null;
  };
  orgs: OrganizationMine[];
  permissions: { roles: string[]; can: string[] };
  twin: {
    entityId: string;
    sceneCodes: string[];
    orgCount: number;
  };
}
