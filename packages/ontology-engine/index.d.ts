/** @gri/ontology-engine —— 本体 OO 引擎 public 类型声明（CJS/Nest 产物 require(esm) 的最小裁定）。 */

import type { OntologyData, ObjectDef, FieldDef } from '@gri/ontology';

export interface SingleTableResult {
  table?: string;
  discriminatorColumn?: string;
  extraColumn?: string;
  [k: string]: unknown;
}

export interface DispatchResult {
  action?: { name: string; abstract?: boolean };
  owner?: string;
  [k: string]: unknown;
}

export class OntologyEngine {
  constructor(data: OntologyData);
  ontology: OntologyData;
  objects: ObjectDef[];
  objByName: Map<string, ObjectDef>;
  isAbstract(name: string): boolean;
  inheritedFields(name: string): FieldDef[];
  chain(name: string): string[];
  dispatch(name: string, actionName: string): DispatchResult | null;
  missingAbstractActions(name: string): string[];
  instantiate(name: string): {
    name: string;
    object: ObjectDef;
    inheritedFields: FieldDef[];
    singleTable: SingleTableResult;
  };
}

export function createEngine(data: OntologyData): OntologyEngine;

export function resolveInheritedFields(name: string, objByName: Map<string, ObjectDef>): FieldDef[];
export function inheritanceChain(name: string, objByName: Map<string, ObjectDef>): ObjectDef[];
export function collectAbstractActions(name: string, objByName: Map<string, ObjectDef>): ActionDefLike[];
export function resolveActionImplementation(
  name: string,
  actionName: string,
  objByName: Map<string, ObjectDef>,
): DispatchResult | null;

type ActionDefLike = { name: string; abstract?: boolean; [k: string]: unknown };