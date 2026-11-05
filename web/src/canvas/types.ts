import type { GraphEdgeFieldsFragment, GraphNodeFieldsFragment } from "../gql/graphql";

export type GNode = GraphNodeFieldsFragment;
export type GEdge = GraphEdgeFieldsFragment;
export type XY = { x: number; y: number };

export const NODE_W = 210;
export const NODE_H = 58;

/** Node kinds drawn on the canvas. Files are drawn as groups around them. */
export const CANVAS_KINDS = ["function", "method"];

/** File group box: header height and inner padding. */
export const GROUP_HEAD = 30;
export const GROUP_PAD = 14;
/** Space between functions inside a file box. */
export const FN_GAP = 14;

/** Stable key of the file a node belongs to (matches indexer.FileKey). */
export const fileKey = (path: string) => `file:${path}`;

/** A file node built on the client from its path, for groups on the canvas. */
export function fileNode(path: string): GNode {
  const key = fileKey(path);
  return { id: key, key, kind: "file", name: path.split("/").pop() ?? path, qualifiedName: path, filePath: path, startLine: 0, endLine: 0, parentKey: "", meta: {} };
}

/** Only calls connect functions; the other relationships are between files and classes. */
export const EDGE_KINDS = ["calls"] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const EDGE_STYLE: Record<string, { stroke: string; dash?: string; label: string }> = {
  imports: { stroke: "var(--line-strong)", label: "imports" },
  calls: { stroke: "var(--k-function)", label: "calls" },
  extends: { stroke: "var(--k-class)", dash: "2 3", label: "extends" },
  implements: { stroke: "var(--k-interface)", dash: "2 3", label: "implements" },
  tests: { stroke: "var(--ok)", dash: "6 3", label: "tests" },
  contains: { stroke: "var(--line)", label: "contains" },
};
