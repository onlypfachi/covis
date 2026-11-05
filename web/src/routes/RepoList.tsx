import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery } from "urql";
import { ConnectRepositoryMutation, RepositoriesQuery } from "../lib/queries";
import { StatusPill, short } from "../lib/status";
import { usePolling } from "../lib/usePolling";

export function RepoList() {
  const [{ data, fetching, error }, refetch] = useQuery({ query: RepositoriesQuery });
  const [connect, connectRepo] = useMutation(ConnectRepositoryMutation);
  const [url, setUrl] = useState("");
  const navigate = useNavigate();

  const indexing = data?.repositories.some((r) => r.latestSnapshot?.status !== "ready" && r.latestSnapshot?.status !== "failed") ?? false;
  usePolling(indexing, useCallback(() => refetch({ requestPolicy: "network-only" }), [refetch]), 2000);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await connectRepo({ cloneUrl: url });
    if (res.data) navigate(`/repos/${res.data.connectRepository.id}`);
  }

  return (
    <div className="page stack">
      <h1>Repositories</h1>
      <form className="panel pad stack" onSubmit={submit}>
        <div>
          <label htmlFor="clone-url">Connect a GitHub repository</label>
          <div className="row">
            <input id="clone-url" placeholder="https://github.com/owner/repo.git" value={url} onChange={(e) => setUrl(e.target.value)} />
            <button className="primary" disabled={!url.trim() || connect.fetching}>
              {connect.fetching ? "Connecting…" : "Connect"}
            </button>
          </div>
        </div>
        <p className="faint" style={{ margin: 0 }}>
          The repo is cloned and its default branch is indexed into a graph. Private repos use GITHUB_TOKEN from the backend's environment.
        </p>
        {connect.error && <p className="error">{connect.error.message}</p>}
      </form>

      {error && <p className="error">{error.message}</p>}
      {fetching && !data && <p className="muted">Loading…</p>}
      {data && data.repositories.length === 0 && <p className="muted">No repositories yet.</p>}
      {data && data.repositories.length > 0 && (
        <ul className="repo-list panel">
          {data.repositories.map((r) => (
            <li key={r.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Link to={`/repos/${r.id}`}>{r.name}</Link>
                <div className="faint mono" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.cloneUrl}</div>
              </div>
              {r.currentSnapshot && <span className="mono muted">{r.defaultBranch}@{short(r.currentSnapshot.commitSha)}</span>}
              {r.latestSnapshot ? <StatusPill status={r.latestSnapshot.status} /> : <StatusPill status="pending" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
