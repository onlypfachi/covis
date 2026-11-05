import { ReactFlowProvider } from "@xyflow/react";
import { useCallback } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "urql";
import { WorkspaceView } from "../canvas/WorkspaceView";
import { IndexRepositoryMutation, RepositoryQuery } from "../lib/queries";
import { BUSY, StatusPill, short } from "../lib/status";
import { usePolling } from "../lib/usePolling";

export function Workspace() {
  const { repoId } = useParams();
  const [{ data, error, fetching }, refetch] = useQuery({ query: RepositoryQuery, variables: { id: repoId! } });
  const [, reindex] = useMutation(IndexRepositoryMutation);
  const repo = data?.repository;

  const indexing = !!repo?.latestSnapshot && ["pending", "indexing"].includes(repo.latestSnapshot.status);
  const busy = repo?.changeSets.some((c) => BUSY.has(c.status)) ?? false;
  usePolling(!repo?.latestSnapshot || indexing || busy, useCallback(() => refetch({ requestPolicy: "network-only" }), [refetch]), 2000);

  if (error) return <div className="page error">{error.message}</div>;
  if (!repo) return <div className="page muted">{fetching ? "Loading…" : "Repository not found."}</div>;

  if (!repo.currentSnapshot) {
    const s = repo.latestSnapshot;
    return (
      <div className="page stack">
        <h1>{repo.name}</h1>
        {!s || s.status !== "failed" ? (
          <p className="muted">Cloning and indexing <span className="mono">{repo.cloneUrl}</span>… {s && <StatusPill status={s.status} />}</p>
        ) : (
          <div className="panel pad stack">
            <p className="error">Indexing {short(s.commitSha)} failed: {s.error}</p>
            <button onClick={() => reindex({ id: repo.id })}>Retry</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      {/* Remount per snapshot: a new commit is a new mirror, not an edit of the old one. */}
      <WorkspaceView key={repo.currentSnapshot.id} repo={repo} snapshotId={repo.currentSnapshot.id} onReindex={() => reindex({ id: repo.id })} />
    </ReactFlowProvider>
  );
}
