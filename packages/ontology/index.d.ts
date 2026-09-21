/** @gri/ontology —— 语义真源 public 类型声明（CJS/Nest 产物 require(esm) 的最小裁定）。 */

export interface FieldDef {
  name: string;
  type: string;
  required?: boolean;
  unique?: boolean;
  description?: string;
  dbDefault?: string;
  variant?: boolean;
}

export interface ActionDef {
  name: string;
  abstract?: boolean;
  description?: string;
}

export interface ObjectDef {
  name: string;
  description?: string;
  abstract?: boolean;
  extends?: string;
  implements?: string[];
  discriminator?: { field: string; value: string };
  variantFields?: FieldDef[];
  fields?: FieldDef[];
  actions?: ActionDef[];
}

export interface InterfaceDef {
  name: string;
  description?: string;
  actions?: ActionDef[];
}

export interface OntologyData {
  schemaVersion?: string;
  name?: string;
  description?: string;
  interfaces?: InterfaceDef[];
  objects?: ObjectDef[];
}

export interface LoadOntologyOk {
  ok: true;
  ontology: OntologyData;
}
export interface LoadOntologyErr {
  ok: false;
  errors: { path: string; message: string }[];
}

export const OntologySchema: import('zod').ZodType<OntologyData>;

export function validateOntologySemantics(data: OntologyData): LoadOntologyOk | LoadOntologyErr;
export function loadOntology(data: unknown): LoadOntologyOk | LoadOntologyErr;