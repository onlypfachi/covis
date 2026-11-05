import type { GraphEdgeFieldsFragment, GraphNodeFieldsFragment } from "../gql/graphql";

export type GNode = GraphNodeFieldsFragment;
export type GEdge = GraphEdgeFieldsFragment;
export type XY = { x: number; y: number };

export const NODE_W = 210;
export const NODE_H = 58;

/** Kinds a node can be expanded into children for. */
export const EXPANDABLE = new Set(["file", "class", "directory"]);

export const EDGE_KINDS = ["imports", "calls", "extends", "implements", "tests"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const EDGE_STYLE: Record<string, { stroke: string; dash?: string; label: string }> = {
  imports: { stroke: "var(--line-strong)", label: "imports" },
  calls: { stroke: "var(--k-function)", label: "calls" },
  extends: { stroke: "var(--k-class)", dash: "2 3", label: "extends" },
  implements: { stroke: "var(--k-interface)", dash: "2 3", label: "implements" },
  tests: { stroke: "var(--ok)", dash: "6 3", label: "tests" },
  contains: { stroke: "var(--line)", label: "contains" },
};
