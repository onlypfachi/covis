import { useCallback, useState } from "react";
import { useClient } from "urql";
import type { GraphFilter } from "../gql/graphql";
import { GraphQuery } from "../lib/queries";
import { CANVAS_KINDS, type GEdge, type GNode } from "./types";

/** The backend's largest slice. */
const MAX_NODES = 5000;

/**
 * The functions of one snapshot loaded into the browser, with the edges that
 * touch them. Functions found by search are added on demand.
 */
export function useGraph(snapshotId: string) {
  const client = useClient();
  const [nodes, setNodes] = useState<Map<string, GNode>>(new Map());
  const [edges, setEdges] = useState<Map<string, GEdge>>(new Map());
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

  const loadInitial = useCallback(async () => {
    const slice = await fetchSlice({ kinds: CANVAS_KINDS, limit: MAX_NODES });
    if (!slice) return [];
    setTruncated(slice.truncated);
    return merge(slice);
  }, [fetchSlice, merge]);

  /** Load functions that are not on the canvas yet. Other kinds are ignored. */
  const reveal = useCallback(
    async (keys: string[]) => {
      const missing = keys.filter((k) => !nodes.has(k));
      if (!missing.length) return [];
      const slice = await fetchSlice({ keys: missing, kinds: CANVAS_KINDS });
      return slice ? merge(slice) : [];
    },
    [fetchSlice, merge, nodes],
  );

  const search = useCallback(
    async (text: string) => (await fetchSlice({ search: text, kinds: CANVAS_KINDS, limit: 40 }))?.nodes ?? [],
    [fetchSlice],
  );

  return { nodes, edges, truncated, error, loadInitial, reveal, search };
}
