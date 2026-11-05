import { useCallback, useState } from "react";
import { useClient } from "urql";
import type { GraphFilter } from "../gql/graphql";
import { GraphQuery } from "../lib/queries";
import type { GEdge, GNode } from "./types";

/**
 * The part of one snapshot's graph loaded into the browser so far. Large repos
 * are never loaded whole: we start with files and expand on demand.
 */
export function useGraph(snapshotId: string) {
  const client = useClient();
  const [nodes, setNodes] = useState<Map<string, GNode>>(new Map());
  const [edges, setEdges] = useState<Map<string, GEdge>>(new Map());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSlice = useCallback(
    async (filter: GraphFilter) => {
      const res = await client.query(GraphQuery, { snapshotId, filter }, { requestPolicy: "network-only" }).toPromise();
      if (res.error) {
        setError(res.error.message);
        return null;
      }
      return res.data!.graph;
    },
    [client, snapshotId],
  );

  /** Merge a slice into the loaded graph and return the nodes it added. */
  const merge = useCallback((slice: { nodes: GNode[]; edges: GEdge[] }) => {
    setNodes((prev) => {
      const next = new Map(prev);
      for (const n of slice.nodes) next.set(n.key, n);
      return next;
    });
    setEdges((prev) => {
      const next = new Map(prev);
      for (const e of slice.edges) next.set(e.id, e);
      return next;
    });
    return slice.nodes;
  }, []);

  const loadInitial = useCallback(
    async (kinds: string[]) => {
      const slice = await fetchSlice({ kinds, limit: 1500 });
      if (!slice) return [];
      setTruncated(slice.truncated);
      return merge(slice);
    },
    [fetchSlice, merge],
  );

  const expand = useCallback(
    async (key: string) => {
      const slice = await fetchSlice({ parentKey: key, limit: 400 });
      if (!slice) return [];
      setExpanded((prev) => new Set(prev).add(key));
      return merge(slice);
    },
    [fetchSlice, merge],
  );

  /** Remove a node's loaded descendants from the view. */
  const collapse = useCallback((key: string) => {
    setNodes((prev) => {
      const drop = new Set<string>();
      let frontier = [key];
      while (frontier.length) {
        const next: string[] = [];
        for (const n of prev.values()) if (frontier.includes(n.parentKey) && !drop.has(n.key)) (drop.add(n.key), next.push(n.key));
        frontier = next;
      }
      setExpanded((e) => new Set([...e].filter((k) => k !== key && !drop.has(k))));
      return new Map([...prev].filter(([k]) => !drop.has(k)));
    });
  }, []);

  const reveal = useCallback(
    async (keys: string[]) => {
      const missing = keys.filter((k) => !nodes.has(k));
      if (!missing.length) return [];
      const slice = await fetchSlice({ keys: missing });
      return slice ? merge(slice) : [];
    },
    [fetchSlice, merge, nodes],
  );

  const search = useCallback(
    async (text: string) => (await fetchSlice({ search: text, limit: 40 }))?.nodes ?? [],
    [fetchSlice],
  );

  const remove = useCallback((kinds: string[]) => {
    setNodes((prev) => new Map([...prev].filter(([, n]) => !kinds.includes(n.kind))));
  }, []);

  return { nodes, edges, expanded, truncated, error, loadInitial, expand, collapse, reveal, search, remove };
}
