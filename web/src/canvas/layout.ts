import ELK from "elkjs/lib/elk.bundled.js";
import { NODE_H, NODE_W, type GEdge, type GNode, type XY } from "./types";

const elk = new ELK();

/** Layered left-to-right layout of the visible graph. Containment edges are
 * included so children sit next to their parents. */
export async function layout(nodes: GNode[], edges: GEdge[]): Promise<Record<string, XY>> {
  const ids = new Set(nodes.map((n) => n.key));
  const elkEdges = [
    ...edges.filter((e) => ids.has(e.sourceKey) && ids.has(e.targetKey)).map((e) => ({ id: e.id, sources: [e.sourceKey], targets: [e.targetKey] })),
    ...nodes.filter((n) => ids.has(n.parentKey)).map((n) => ({ id: `c:${n.key}`, sources: [n.parentKey], targets: [n.key] })),
  ];
  const res = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      "elk.spacing.nodeNode": "22",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": "50",
    },
    children: nodes.map((n) => ({ id: n.key, width: NODE_W, height: NODE_H })),
    edges: elkEdges,
  });
  const out: Record<string, XY> = {};
  for (const c of res.children ?? []) out[c.id] = { x: c.x ?? 0, y: c.y ?? 0 };
  return out;
}

/** Place newly revealed children in a column beside their parent. */
export function besideParent(parent: XY, index: number): XY {
  return { x: parent.x + NODE_W + 60, y: parent.y + index * (NODE_H + 14) };
}
