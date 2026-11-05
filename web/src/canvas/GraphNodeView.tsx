import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { memo } from "react";
import type { GNode } from "./types";

export type GData = {
  node: GNode;
  expanded: boolean;
  expandable: boolean;
  /** Number of open change sets that target this component. */
  proposals: number;
  dim: boolean;
};
export type GFlowNode = Node<GData, "g">;

function GraphNodeViewImpl({ data, selected }: NodeProps<GFlowNode>) {
  const { node, expanded, expandable, proposals, dim } = data;
  const isTest = node.meta?.isTest === true;
  const loc = node.kind === "file" || node.kind === "directory" ? node.filePath.split("/").slice(0, -1).join("/") : node.filePath;
  const cls = ["gnode", selected && "selected", proposals > 0 && "proposed", dim && "dim", isTest && "test"].filter(Boolean).join(" ");
  return (
    <div className={cls} style={{ "--kind": `var(--k-${node.kind}, var(--line-strong))` } as React.CSSProperties} title={node.qualifiedName}>
      <Handle type="target" position={Position.Left} />
      <div className="kind">{node.kind}{isTest ? " · test" : ""}</div>
      <div className="name">{node.kind === "method" ? node.qualifiedName : node.name}</div>
      {loc && <div className="path">{loc || "/"}</div>}
      {(expandable || proposals > 0) && (
        <div className="foot">
          {expandable && <span className="faint mono" style={{ fontSize: 10 }}>{expanded ? "▾ expanded" : "▸ double-click to expand"}</span>}
          {proposals > 0 && <span className="pill accent" title="Open change sets target this component">{proposals} proposed</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export const GraphNodeView = memo(GraphNodeViewImpl);
export const nodeTypes = { g: GraphNodeView };
