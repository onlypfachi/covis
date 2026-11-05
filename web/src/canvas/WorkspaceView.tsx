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
import { nodeTypes, type GFlowNode } from "./GraphNodeView";
import { besideParent, layout } from "./layout";
import { Sidebar } from "./Sidebar";
import { EDGE_KINDS, EDGE_STYLE, EXPANDABLE, type EdgeKind, type GNode, type XY } from "./types";
import { useGraph } from "./useGraph";

type Repo = NonNullable<RepositoryQueryResult["repository"]>;

export function WorkspaceView({ repo, snapshotId, onReindex }: { repo: Repo; snapshotId: string; onReindex: () => void }) {
  const graph = useGraph(snapshotId);
  const flow = useReactFlow();
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<GFlowNode>([]);
  const [, saveLayout] = useMutation(SaveLayoutMutation);
  const [, clearLayout] = useMutation(ClearLayoutMutation);

  const [edgeKinds, setEdgeKinds] = useState<Set<EdgeKind>>(new Set(["imports", "calls", "extends", "implements"]));
  const [showModules, setShowModules] = useState(false);
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
  const hints = useRef(new Map<string, XY>());
  const [layoutNonce, setLayoutNonce] = useState(0);
  const requestLayout = useCallback(() => setLayoutNonce((n) => n + 1), []);

  // Open change sets per component: shown as proposals, never as code.
  const proposals = useMemo(() => {
    const m = new Map<string, number>();
    for (const cs of repo.changeSets) if (OPEN.has(cs.status)) for (const k of cs.selectedKeys) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  }, [repo.changeSets]);

  // Initial view: files and their import graph.
  useEffect(() => {
    let cancelled = false;
    graph.loadInitial(["file"]).then(() => {
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
    let cancelled = false;
    const nodes = [...graph.nodes.values()];
    const visible = new Set(nodes.map((n) => n.key));
    const edges = [...graph.edges.values()].filter((e) => edgeKinds.has(e.kind as EdgeKind) && visible.has(e.sourceKey) && visible.has(e.targetKey));
    layout(nodes, edges).then((pos) => {
      if (cancelled) return;
      for (const [k, p] of Object.entries(pos)) if (!pinned.current.has(k)) hints.current.set(k, p);
      setRfNodes((prev) => prev.map((n) => (pinned.current.has(n.id) || !pos[n.id] ? n : { ...n, position: pos[n.id] })));
      requestFit();
    });
    return () => {
      cancelled = true;
    };
    // Only re-layout when asked, not on every edge-filter toggle.
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
    for (const n of graph.nodes.values()) if (n.parentKey === focusKey || n.key === graph.nodes.get(focusKey)?.parentKey) s.add(n.key);
    return s;
  }, [focusKey, focusNeighbours, graph.edges, graph.nodes]);

  // Sync the semantic graph into React Flow nodes, keeping positions the user set.
  useEffect(() => {
    setRfNodes((prev) => {
      const prevMap = new Map(prev.map((n) => [n.id, n]));
      return [...graph.nodes.values()].map((n): GFlowNode => {
        const data = {
          node: n,
          expanded: graph.expanded.has(n.key),
          expandable: EXPANDABLE.has(n.kind),
          proposals: proposals.get(n.key) ?? 0,
          dim: neighbours ? !neighbours.has(n.key) : false,
        };
        const p = prevMap.get(n.key);
        if (p) return { ...p, data };
        return { id: n.key, type: "g", position: pinned.current.get(n.key) ?? hints.current.get(n.key) ?? { x: 0, y: 0 }, data };
      });
    });
  }, [graph.nodes, graph.expanded, proposals, neighbours, setRfNodes]);

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
        label: e.inferred ? "inferred" : undefined,
        labelStyle: { fontSize: 9, fill: "var(--ink-3)" },
        labelBgStyle: { fill: "var(--bg)" },
      });
    }
    for (const n of graph.nodes.values()) {
      if (visible.has(n.parentKey)) {
        out.push({ id: `c:${n.key}`, source: n.parentKey, target: n.key, style: { stroke: EDGE_STYLE.contains.stroke, strokeWidth: 1 }, type: "smoothstep" });
      }
    }
    return out;
  }, [graph.edges, graph.nodes, edgeKinds, neighbours]);

  const positionOf = useCallback((key: string) => flow.getNode(key)?.position ?? pinned.current.get(key), [flow]);

  const expandOrCollapse = useCallback(
    async (key: string) => {
      if (graph.expanded.has(key)) {
        graph.collapse(key);
        return requestLayout();
      }
      const added = await graph.expand(key);
      // Start children beside the parent, then let the layout settle them.
      const origin = positionOf(key) ?? { x: 0, y: 0 };
      added.forEach((n, i) => hints.current.set(n.key, besideParent(origin, i)));
      requestLayout();
    },
    [graph, positionOf, requestLayout],
  );

  /** Bring a node onto the canvas (loading it if needed), select and centre it. */
  const reveal = useCallback(
    async (key: string, near?: string) => {
      const origin = (near && positionOf(near)) || flow.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const added = await graph.reveal([key]);
      added.forEach((n, i) => hints.current.set(n.key, { x: origin.x + 260, y: origin.y + 80 * (i + 1) }));
      if (added.length) requestLayout();
      setFocusKey(key);
      setRfNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === key })));
      setTimeout(() => {
        const p = flow.getNode(key)?.position;
        if (p) flow.setCenter(p.x + 100, p.y + 30, { zoom: Math.max(flow.getZoom(), 0.9), duration: 300 });
      }, 50);
    },
    [graph, flow, positionOf, requestLayout, setRfNodes],
  );

  const onNodeClick: NodeMouseHandler<GFlowNode> = useCallback((_, node) => setFocusKey(node.id), []);
  const onNodeDoubleClick: NodeMouseHandler<GFlowNode> = useCallback(
    (_, node) => {
      if (EXPANDABLE.has(node.data.node.kind)) void expandOrCollapse(node.id);
    },
    [expandOrCollapse],
  );
  const onSelectionChange: OnSelectionChangeFunc<GFlowNode> = useCallback(({ nodes }) => {
    setSelectedKeys(nodes.map((n) => n.id));
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, __: GFlowNode, nodes: GFlowNode[]) => {
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

  const toggleModules = useCallback(
    async (on: boolean) => {
      setShowModules(on);
      if (!on) return graph.remove(["module"]);
      await graph.loadInitial(["module"]);
      requestLayout();
    },
    [graph, requestLayout],
  );

  const selectedNodes = useMemo(
    () => selectedKeys.map((k) => graph.nodes.get(k)).filter((n): n is GNode => !!n),
    [selectedKeys, graph.nodes],
  );

  return (
    <div className="workspace">
      <aside className="side">
        <Sidebar
          repo={repo}
          edgeKinds={edgeKinds}
          onToggleEdgeKind={(k) => setEdgeKinds((prev) => { const s = new Set(prev); s.has(k) ? s.delete(k) : s.add(k); return s; })}
          allEdgeKinds={EDGE_KINDS}
          showModules={showModules}
          onToggleModules={toggleModules}
          focusNeighbours={focusNeighbours}
          onToggleFocus={setFocusNeighbours}
          onSearch={graph.search}
          onReveal={(k) => reveal(k)}
          onRelayout={relayout}
          onFit={requestFit}
          onReindex={onReindex}
        />
      </aside>
      <main className="canvas" aria-label="Architecture canvas">
        {(loading || graph.error || graph.truncated) && (
          <div className="banner">
            {loading ? "Loading graph…" : graph.error ? <span className="error">{graph.error}</span> : "Large repository: showing the first 1,500 files. Use search to find others."}
          </div>
        )}
        {!loading && graph.nodes.size === 0 ? (
          <div className="empty">No TypeScript or JavaScript files were found at this commit.</div>
        ) : (
          <ReactFlow<GFlowNode>
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
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
            <MiniMap pannable zoomable nodeColor={(n) => `var(--k-${(n.data as GFlowNode["data"]).node.kind}, var(--line-strong))`} maskColor="rgb(0 0 0 / 0.06)" />
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
          expanded={focusKey ? graph.expanded.has(focusKey) : false}
          onExpand={expandOrCollapse}
          onReveal={(k) => reveal(k, focusKey ?? undefined)}
        />
      </aside>
      <section className="bottom">
        <ProposePanel repoId={repo.id} selected={selectedNodes} onClear={() => setRfNodes((prev) => prev.map((n) => ({ ...n, selected: false })))} />
      </section>
    </div>
  );
}
