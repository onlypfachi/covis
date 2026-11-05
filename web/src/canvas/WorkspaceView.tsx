import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useNodesState,
  useReactFlow,
  type Edge,
  type NodeMouseHandler,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "urql";
import { ProposePanel } from "../changesets/ProposePanel";
import type { RepositoryQuery as RepositoryQueryResult } from "../gql/graphql";
import { Inspector } from "../inspector/Inspector";
import { ClearLayoutMutation, SaveLayoutMutation } from "../lib/queries";
import { OPEN } from "../lib/status";
import { nodeTypes, type CanvasNode } from "./GraphNodeView";
import { layout } from "./layout";
import { Sidebar } from "./Sidebar";
import { EDGE_KINDS, EDGE_STYLE, FN_GAP, GROUP_HEAD, GROUP_PAD, NODE_H, NODE_W, fileKey, fileNode, type EdgeKind, type GNode, type XY } from "./types";
import { useGraph } from "./useGraph";

type Repo = NonNullable<RepositoryQueryResult["repository"]>;

/** A file box takes clicks and drags on its header only; its body lets them
 * through to the pane, so a selection rectangle can start anywhere. */
const GROUP_STYLE = { pointerEvents: "none" } as const;

export function WorkspaceView({ repo, snapshotId, onReindex }: { repo: Repo; snapshotId: string; onReindex: () => void }) {
  const graph = useGraph(snapshotId);
  const flow = useReactFlow();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [, saveLayout] = useMutation(SaveLayoutMutation);
  const [, clearLayout] = useMutation(ClearLayoutMutation);

  const [edgeKinds, setEdgeKinds] = useState<Set<EdgeKind>>(new Set(["calls"]));
  const [focusNeighbours, setFocusNeighbours] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Fit after React Flow has rendered the new positions, not in the same tick.
  const [fitRequested, setFitRequested] = useState(0);
  useEffect(() => {
    if (!fitRequested) return;
    const t = setTimeout(() => flow.fitView({ padding: 0.15, maxZoom: 1.2, duration: 250 }), 30);
    return () => clearTimeout(t);
  }, [fitRequested, flow]);
  const requestFit = useCallback(() => setFitRequested((n) => n + 1), []);

  // Positions the user placed by hand are pinned and persisted. Everything else
  // is laid out automatically whenever the visible graph changes shape.
  const pinned = useRef(new Map(repo.layout.map((p) => [p.key, { x: p.x, y: p.y }])));
  // File groups and functions inside them use React Flow's sub-flows: a group's
  // position is absolute, a function's is relative to its group.
  const hints = useRef(new Map<string, XY>());
  const sizes = useRef(new Map<string, { width: number; height: number }>());
  const canvasRef = useRef<HTMLElement>(null);
  const [layoutNonce, setLayoutNonce] = useState(0);
  const requestLayout = useCallback(() => setLayoutNonce((n) => n + 1), []);

  // Open change sets per component: shown as proposals, never as code.
  const proposals = useMemo(() => {
    const m = new Map<string, number>();
    for (const cs of repo.changeSets) if (OPEN.has(cs.status)) for (const k of cs.selectedKeys) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, [repo.changeSets]);

  // Initial view: every function, grouped by file.
  useEffect(() => {
    let cancelled = false;
    graph.loadInitial().then(() => {
      if (cancelled) return;
      setLoading(false);
      requestLayout();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotId]);

  useEffect(() => {
    if (!layoutNonce) return;
    // Stack the files to fill the canvas's shape.
    const box = canvasRef.current?.getBoundingClientRect();
    const aspect = box && box.height > 0 ? box.width / box.height : undefined;
    const { positions, sizes: sz } = layout([...graph.nodes.values()], aspect);
    // A function's position is relative to its file box. Pins saved before
    // functions were grouped by file are absolute, so drop any that fall
    // outside the box and let the layout place the function instead.
    for (const n of graph.nodes.values()) {
      const p = pinned.current.get(n.key);
      const box = sz[fileKey(n.filePath)];
      if (p && box && (p.x < 0 || p.y < 0 || p.x + NODE_W > box.width || p.y + NODE_H > box.height)) pinned.current.delete(n.key);
    }
    for (const [k, p] of Object.entries(positions)) if (!pinned.current.has(k)) hints.current.set(k, p);
    for (const [k, s] of Object.entries(sz)) sizes.current.set(k, s);
    setRfNodes((prev) =>
      prev.map((n) => {
        const size = sz[n.id];
        const next = size ? { ...n, style: { ...n.style, ...size } } : n;
        return pinned.current.has(n.id) || !positions[n.id] ? next : { ...next, position: positions[n.id] };
      }),
    );
    requestFit();
    // Only re-layout when asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutNonce]);

  // Neighbourhood of the focused node, for optional dimming.
  const neighbours = useMemo(() => {
    if (!focusKey || !focusNeighbours) return null;
    const s = new Set([focusKey]);
    for (const e of graph.edges.values()) {
      if (e.sourceKey === focusKey) s.add(e.targetKey);
      if (e.targetKey === focusKey) s.add(e.sourceKey);
    }
    return s;
  }, [focusKey, focusNeighbours, graph.edges]);

  // Sync the semantic graph into React Flow nodes, keeping positions the user set.
  // Groups come first: React Flow needs a parent before its children.
  useEffect(() => {
    setRfNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      const byFile = new Map<string, GNode[]>();
      for (const n of graph.nodes.values()) {
        const k = fileKey(n.filePath);
        byFile.set(k, [...(byFile.get(k) ?? []), n]);
      }
      const place = (key: string, fallback: XY) => pinned.current.get(key) ?? hints.current.get(key) ?? fallback;
      const out: CanvasNode[] = [];
      for (const [key, fns] of byFile) {
        const data = {
          node: fileNode(fns[0].filePath),
          count: fns.length,
          proposals: proposals.get(key) ?? 0,
          dim: neighbours ? !fns.some((f) => neighbours.has(f.key)) : false,
        };
        const size = sizes.current.get(key) ?? { width: NODE_W + 2 * GROUP_PAD, height: GROUP_HEAD + fns.length * (NODE_H + FN_GAP) + GROUP_PAD };
        const p = prevMap.get(key);
        out.push(p ? { ...p, type: "file", data } as CanvasNode : { id: key, type: "file", position: place(key, { x: 0, y: 0 }), style: { ...size, ...GROUP_STYLE }, dragHandle: ".head", data });
      }
      for (const [key, fns] of byFile) {
        fns.forEach((n, i) => {
          const data = { node: n, proposals: proposals.get(n.key) ?? 0, dim: neighbours ? !neighbours.has(n.key) : false };
          const p = prevMap.get(n.key);
          out.push(
            p
              ? ({ ...p, type: "g", data } as CanvasNode)
              : { id: n.key, type: "g", parentId: key, extent: "parent", position: place(n.key, { x: GROUP_PAD, y: GROUP_HEAD + i * (NODE_H + FN_GAP) }), data },
          );
        });
      }
      return out;
    });
  }, [graph.nodes, proposals, neighbours, setRfNodes]);

  const rfEdges = useMemo<Edge[]>(() => {
    const visible = new Set(graph.nodes.keys());
    const out: Edge[] = [];
    for (const e of graph.edges.values()) {
      if (!edgeKinds.has(e.kind as EdgeKind) || !visible.has(e.sourceKey) || !visible.has(e.targetKey)) continue;
      const st = EDGE_STYLE[e.kind] ?? EDGE_STYLE.imports;
      const dim = neighbours && !(neighbours.has(e.sourceKey) && neighbours.has(e.targetKey));
      out.push({
        id: e.id,
        source: e.sourceKey,
        target: e.targetKey,
        style: { stroke: st.stroke, strokeWidth: e.kind === "calls" ? 1.6 : 1.2, strokeDasharray: e.inferred ? "3 3" : st.dash, opacity: dim ? 0.15 : 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: st.stroke, width: 14, height: 14 },
        // Above the file group boxes.
        zIndex: 1,
        label: e.inferred ? "inferred" : undefined,
        labelStyle: { fontSize: 9, fill: "var(--ink-3)" },
        labelBgStyle: { fill: "var(--bg)" },
      });
    }
    return out;
  }, [graph.edges, graph.nodes, edgeKinds, neighbours]);

  /** Bring a function onto the canvas (loading it if needed), select and centre it.
   * Other components (files, classes) only open in the inspector, unless the
   * key is a file already drawn as a group. */
  const reveal = useCallback(
    async (key: string) => {
      const added = await graph.reveal([key]);
      added.forEach((n) => hints.current.delete(n.key));
      if (added.length) requestLayout();
      setFocusKey(key);
      const onCanvas = graph.nodes.has(key) || added.some((n) => n.key === key) || !!flow.getNode(key);
      if (!onCanvas) return;
      setRfNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === key })));
      setTimeout(() => {
        const n = flow.getInternalNode(key);
        if (!n) return;
        const p = n.internals.positionAbsolute;
        const w = n.measured.width ?? NODE_W;
        const h = n.measured.height ?? NODE_H;
        flow.setCenter(p.x + w / 2, p.y + h / 2, { zoom: Math.max(flow.getZoom(), 0.9), duration: 300 });
      }, 300);
    },
    [graph, flow, requestLayout, setRfNodes],
  );

  const onNodeClick: NodeMouseHandler<CanvasNode> = useCallback((_, node) => setFocusKey(node.id), []);
  const onSelectionChange: OnSelectionChangeFunc<CanvasNode> = useCallback(({ nodes }) => {
    setSelectedKeys(nodes.map((n) => n.id));
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, __: CanvasNode, nodes: CanvasNode[]) => {
      for (const n of nodes) pinned.current.set(n.id, n.position);
      void saveLayout({ repositoryId: repo.id, positions: nodes.map((n) => ({ key: n.id, x: n.position.x, y: n.position.y })) });
    },
    [repo.id, saveLayout],
  );

  /** Unpin everything and lay the whole canvas out again. */
  const relayout = useCallback(async () => {
    pinned.current.clear();
    await clearLayout({ repositoryId: repo.id });
    requestLayout();
  }, [clearLayout, repo.id, requestLayout]);

  const selectedNodes = useMemo(
    () => selectedKeys.map((k) => graph.nodes.get(k) ?? (k.startsWith("file:") ? fileNode(k.slice("file:".length)) : undefined)).filter((n): n is GNode => !!n),
    [selectedKeys, graph.nodes],
  );

  return (
    <div className="workspace">
      <aside className="side">
        <Sidebar
          repo={repo}
          edgeKinds={edgeKinds}
          onToggleEdgeKind={(k) => setEdgeKinds((prev) => { const s = new Set(prev); if (s.has(k)) s.delete(k); else s.add(k); return s; })}
          allEdgeKinds={EDGE_KINDS}
          focusNeighbours={focusNeighbours}
          onToggleFocus={setFocusNeighbours}
          onSearch={graph.search}
          onReveal={(k) => reveal(k)}
          onRelayout={relayout}
          onFit={requestFit}
          onReindex={onReindex}
        />
      </aside>
      <main ref={canvasRef} className="canvas" aria-label="Architecture canvas">
        {(loading || graph.error || graph.truncated) && (
          <div className="banner">
            {loading ? "Loading graph…" : graph.error ? <span className="error">{graph.error}</span> : "Large repository: showing the first 5,000 functions. Use search to find others."}
          </div>
        )}
        {!loading && graph.nodes.size === 0 ? (
          <div className="empty">No TypeScript or JavaScript functions were found at this commit.</div>
        ) : (
          <ReactFlow<CanvasNode>
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            onSelectionChange={onSelectionChange}
            onPaneClick={() => setFocusKey(null)}
            nodesConnectable={false}
            edgesFocusable={false}
            zoomOnDoubleClick={false}
            selectionOnDrag
            panOnDrag={[1, 2]}
            multiSelectionKeyCode={["Shift", "Meta", "Control"]}
            minZoom={0.05}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="var(--line)" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeColor={(n) => (n.type === "file" ? "var(--line)" : `var(--k-${(n.data as CanvasNode["data"]).node.kind}, var(--line-strong))`)} maskColor="rgb(0 0 0 / 0.06)" />
          </ReactFlow>
        )}
        <div className="legend" aria-hidden>
          {[...edgeKinds].map((k) => (
            <span key={k}><i style={{ borderColor: EDGE_STYLE[k].stroke, borderTopStyle: EDGE_STYLE[k].dash ? "dashed" : "solid" }} />{k}</span>
          ))}
          <span><i style={{ borderColor: "var(--ink-3)", borderTopStyle: "dotted" }} />inferred</span>
          <span><i style={{ borderColor: "var(--accent)", borderTopStyle: "dashed" }} />proposed change</span>
        </div>
      </main>
      <aside className="inspector">
        <Inspector
          snapshotId={snapshotId}
          nodeKey={focusKey}
          changeSets={repo.changeSets}
          onReveal={(k) => reveal(k)}
        />
      </aside>
      <section className="bottom">
        <ProposePanel repoId={repo.id} selected={selectedNodes} onClear={() => setRfNodes((prev) => prev.map((n) => ({ ...n, selected: false })))} />
      </section>
    </div>
  );
}
