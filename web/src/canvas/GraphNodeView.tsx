import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { memo } from "react";
import type { GNode } from "./types";

export type GData = {
  node: GNode;
  /** Number of open change sets that target this component. */
  proposals: number;
  dim: boolean;
};
export type GFlowNode = Node<GData, "g">;

export type FileData = {
  node: GNode;
  /** Functions of this file on the canvas. */
  count: number;
  proposals: number;
  dim: boolean;
};
export type FileFlowNode = Node<FileData, "file">;

export type CanvasNode = GFlowNode | FileFlowNode;

function GraphNodeViewImpl({ data, selected }: NodeProps<GFlowNode>) {
  const { node, proposals, dim } = data;
  const isTest = node.meta?.isTest === true;
  const cls = ["gnode", selected && "selected", proposals > 0 && "proposed", dim && "dim", isTest && "test"].filter(Boolean).join(" ");
  return (
    <div className={cls} style={{ "--kind": `var(--k-${node.kind}, var(--line-strong))` } as React.CSSProperties} title={node.key}>
      <Handle type="target" position={Position.Left} />
      <div className="kind">{node.kind}{isTest ? " · test" : ""}</div>
      <div className="name">{node.kind === "method" ? node.qualifiedName : node.name}</div>
      {proposals > 0 && (
        <div className="foot">
          <span className="pill accent" title="Open change sets target this component">{proposals} proposed</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** A file, drawn as a box around its functions. */
function FileGroupViewImpl({ data, selected }: NodeProps<FileFlowNode>) {
  const { node, count, proposals, dim } = data;
  const slash = node.filePath.lastIndexOf("/");
  const dir = slash >= 0 ? node.filePath.slice(0, slash + 1) : "";
  const base = node.filePath.slice(slash + 1);
  const cls = ["fgroup", selected && "selected", proposals > 0 && "proposed", dim && "dim"].filter(Boolean).join(" ");
  return (
    <div className={cls} title={node.filePath}>
      <div className="head">
        <span className="path"><span className="dir">{dir}</span><span className="base">{base}</span></span>
        <span className="faint">{count} fn</span>
        {proposals > 0 && <span className="pill accent" title="Open change sets target this file">{proposals} proposed</span>}
      </div>
    </div>
  );
}

export const GraphNodeView = memo(GraphNodeViewImpl);
export const FileGroupView = memo(FileGroupViewImpl);
export const nodeTypes = { g: GraphNodeView, file: FileGroupView };
