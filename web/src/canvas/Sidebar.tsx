import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useMutation } from "urql";
import type { RepositoryQuery as RepositoryQueryResult } from "../gql/graphql";
import { SetTestCommandMutation } from "../lib/queries";
import { StatusPill, ago, short } from "../lib/status";
import { EDGE_STYLE, type EdgeKind, type GNode } from "./types";

type Repo = NonNullable<RepositoryQueryResult["repository"]>;

interface Props {
  repo: Repo;
  edgeKinds: Set<EdgeKind>;
  allEdgeKinds: readonly EdgeKind[];
  onToggleEdgeKind: (k: EdgeKind) => void;
  showModules: boolean;
  onToggleModules: (on: boolean) => void;
  focusNeighbours: boolean;
  onToggleFocus: (on: boolean) => void;
  onSearch: (text: string) => Promise<GNode[]>;
  onReveal: (key: string) => void;
  onRelayout: () => void;
  onFit: () => void;
  onReindex: () => void;
}

export function Sidebar(p: Props) {
  const { repo } = p;
  const current = repo.currentSnapshot!;
  const latest = repo.latestSnapshot;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GNode[] | null>(null);
  const [testCmd, setTestCmd] = useState(repo.testCommand);
  const [saveCmd, setTestCommand] = useMutation(SetTestCommandMutation);

  useEffect(() => {
    if (q.trim().length < 2) return setResults(null);
    const t = setTimeout(() => p.onSearch(q.trim()).then(setResults), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <>
      <div className="section">
        <h2>{repo.name}</h2>
        <div className="muted mono" title={current.commitSha}>
          {repo.defaultBranch}@{short(current.commitSha)} <span className="faint">· indexed {ago(current.createdAt)}</span>
        </div>
        {latest && latest.id !== current.id && (
          <div style={{ marginTop: 6 }}>
            <StatusPill status={latest.status} /> <span className="mono faint">{short(latest.commitSha)}</span>
            {latest.status === "failed" && <div className="error" style={{ fontSize: 12 }}>{latest.error}</div>}
          </div>
        )}
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={p.onReindex} title="Fetch the default branch and index its head">Re-index</button>
          <button onClick={p.onRelayout} title="Lay out everything on the canvas and save positions">Layout</button>
          <button onClick={p.onFit} title="Fit the canvas to the screen">Fit</button>
        </div>
      </div>

      <div className="section">
        <h3>Find</h3>
        <input aria-label="Search components" placeholder="Class, function, file…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results && (
          <ul className="edge-list" style={{ marginTop: 6 }}>
            {results.length === 0 && <li className="faint">No matches</li>}
            {results.map((n) => (
              <li key={n.key}>
                <span className="pill">{n.kind}</span>
                <button className="link" onClick={() => p.onReveal(n.key)} title={n.key}>{n.kind === "method" ? n.qualifiedName : n.name}</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="section checks">
        <h3>Relationships</h3>
        {p.allEdgeKinds.map((k) => (
          <label key={k}>
            <input type="checkbox" checked={p.edgeKinds.has(k)} onChange={() => p.onToggleEdgeKind(k)} />
            <span className="swatch" style={{ background: EDGE_STYLE[k].stroke }} /> {k}
          </label>
        ))}
        <label style={{ marginTop: 6 }}>
          <input type="checkbox" checked={p.showModules} onChange={(e) => p.onToggleModules(e.target.checked)} /> external packages
        </label>
        <label>
          <input type="checkbox" checked={p.focusNeighbours} onChange={(e) => p.onToggleFocus(e.target.checked)} /> dim unrelated when focused
        </label>
      </div>

      <div className="section">
        <h3>Change sets</h3>
        {repo.changeSets.length === 0 ? (
          <p className="faint" style={{ margin: 0 }}>None yet. Select components and describe a change.</p>
        ) : (
          <ul className="cs-list">
            {repo.changeSets.map((cs) => (
              <li key={cs.id}>
                <Link to={`/repos/${repo.id}/changesets/${cs.id}`}>
                  <span className="cs-title">#{cs.id} {cs.requestText}</span>
                  <span className="row"><StatusPill status={cs.status} /><span className="faint">{ago(cs.createdAt)}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="section">
        <h3>Validation</h3>
        <form onSubmit={(e) => { e.preventDefault(); setTestCommand({ id: repo.id, command: testCmd }); }}>
          <label htmlFor="test-cmd">Test command (blank = detect from package.json)</label>
          <div className="row">
            <input id="test-cmd" className="mono" placeholder="npm test" value={testCmd} onChange={(e) => setTestCmd(e.target.value)} />
            <button disabled={saveCmd.fetching || testCmd === repo.testCommand}>Save</button>
          </div>
        </form>
        <p className="faint" style={{ margin: "6px 0 0", fontSize: 12 }}>Runs in a Docker container with no network. Install scripts are disabled.</p>
      </div>
    </>
  );
}
