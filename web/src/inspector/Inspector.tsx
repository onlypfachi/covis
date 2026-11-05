import { Link } from "react-router";
import { useQuery } from "urql";
import { FUNCTION_KINDS, readSignature } from "../canvas/signature";
import type { GEdge } from "../canvas/types";
import { EXPANDABLE } from "../canvas/types";
import { NodeQuery } from "../lib/queries";
import { OPEN, StatusPill } from "../lib/status";
import { FunctionCode, FunctionDescription, FunctionInputs, FunctionResult } from "./FunctionSections";

interface Props {
  snapshotId: string;
  nodeKey: string | null;
  changeSets: { id: string; status: string; requestText: string; selectedKeys: string[] }[];
  expanded: boolean;
  onExpand: (key: string) => void;
  onReveal: (key: string) => void;
}

/** Label for a stable key, e.g. "method:src/a.ts#A.run" -> "A.run". */
function keyLabel(key: string) {
  const hash = key.indexOf("#");
  if (hash >= 0) return key.slice(hash + 1);
  const colon = key.indexOf(":");
  return key.slice(colon + 1) || key;
}

function EdgeGroup({ title, edges, other, onReveal }: { title: string; edges: GEdge[]; other: (e: GEdge) => string; onReveal: (k: string) => void }) {
  if (!edges.length) return null;
  const byKind = new Map<string, GEdge[]>();
  for (const e of edges) byKind.set(e.kind, [...(byKind.get(e.kind) ?? []), e]);
  return (
    <div className="section">
      <h3>{title}</h3>
      {[...byKind].map(([kind, list]) => (
        <div key={kind} style={{ marginBottom: 6 }}>
          <div className="faint" style={{ fontSize: 11 }}>{kind} ({list.length})</div>
          <ul className="edge-list">
            {list.slice(0, 50).map((e) => (
              <li key={e.id}>
                <button className="link" onClick={() => onReveal(other(e))} title={other(e)}>{keyLabel(other(e))}</button>
                {e.inferred && <span className="pill" title="Matched by name only">inferred</span>}
                {e.line > 0 && <span className="faint mono">:{e.line}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function Inspector({ snapshotId, nodeKey, changeSets, expanded, onExpand, onReveal }: Props) {
  const [{ data, fetching, error }] = useQuery({ query: NodeQuery, variables: { snapshotId, key: nodeKey ?? "" }, pause: !nodeKey });
  if (!nodeKey) {
    return (
      <div className="section muted">
        <p style={{ marginTop: 0 }}>Click a component to inspect it. Double-click files and classes to expand them.</p>
        <p>Shift-click or drag a box to select several, then describe a change in the panel below the canvas.</p>
      </div>
    );
  }
  if (error) return <div className="section error">{error.message}</div>;
  const n = data?.node;
  if (!n) return <div className="section muted">{fetching ? "Loading…" : "Not in this snapshot."}</div>;
  const related = changeSets.filter((c) => c.selectedKeys.includes(n.key));
  // Functions get four sections: description, inputs, the function, result.
  const sig = FUNCTION_KINDS.has(n.kind) ? readSignature(n.meta) : null;

  return (
    <>
      {sig ? (
        <>
          <FunctionDescription node={n} sig={sig} />
          <FunctionInputs sig={sig} />
          {n.source && <FunctionCode source={n.source} startLine={n.startLine} />}
          <FunctionResult node={n} sig={sig} />
        </>
      ) : (
        <div className="section">
          <div className="faint mono" style={{ fontSize: 11 }}>{n.kind}</div>
          <h2 className="mono" style={{ overflowWrap: "anywhere" }}>{n.kind === "method" ? n.qualifiedName : n.name}</h2>
          <dl className="kv" style={{ marginTop: 8 }}>
            {n.filePath && (<><dt>path</dt><dd className="mono">{n.filePath}</dd></>)}
            {n.startLine > 0 && (<><dt>lines</dt><dd className="mono">{n.startLine}–{n.endLine}</dd></>)}
            <dt>key</dt><dd className="mono faint" style={{ fontSize: 11 }}>{n.key}</dd>
          </dl>
          {EXPANDABLE.has(n.kind) && (
            <div className="row" style={{ marginTop: 10 }}>
              <button onClick={() => onExpand(n.key)}>{expanded ? "Collapse" : "Expand"}</button>
            </div>
          )}
        </div>
      )}
      {related.length > 0 && (
        <div className="section">
          <h3>Change sets targeting this</h3>
          <ul className="cs-list">
            {related.map((c) => (
              <li key={c.id}>
                <Link to={`changesets/${c.id}`} relative="path">
                  <span className="cs-title">#{c.id} {c.requestText}</span>
                  <StatusPill status={c.status} /> {OPEN.has(c.status) && <span className="faint">not in the code yet</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!sig && n.source && (
        <div className="section">
          <h3>Source at this commit</h3>
          <pre className="source">{n.source}</pre>
        </div>
      )}
      <EdgeGroup title="Outgoing" edges={n.outgoing} other={(e) => e.targetKey} onReveal={onReveal} />
      <EdgeGroup title="Incoming" edges={n.incoming} other={(e) => e.sourceKey} onReveal={onReveal} />
    </>
  );
}
