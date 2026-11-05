import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation } from "urql";
import type { GNode } from "../canvas/types";
import { CreateChangeSetMutation, RunChangeSetMutation } from "../lib/queries";

/** Records a proposal. It does not change the graph: the graph only reflects
 * commits that have actually landed in the repository. */
export function ProposePanel({ repoId, selected, onClear }: { repoId: string; selected: GNode[]; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState("");
  const [criteria, setCriteria] = useState("");
  const [runNow, setRunNow] = useState(true);
  const [create, createChangeSet] = useMutation(CreateChangeSetMutation);
  const [run, runChangeSet] = useMutation(RunChangeSetMutation);
  const navigate = useNavigate();

  if (!open) {
    return (
      <div className="inner row">
        <span className="muted" style={{ flex: 1 }}>
          {selected.length ? `${selected.length} component${selected.length > 1 ? "s" : ""} selected.` : "Select components to give the agent context, or propose a change without a selection."}
        </span>
        {selected.length > 0 && <button className="link" onClick={onClear}>Clear</button>}
        <button className="primary" onClick={() => setOpen(true)}>Propose change…</button>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await createChangeSet({
      input: { repositoryId: repoId, request, acceptanceCriteria: criteria || null, selectedKeys: selected.map((n) => n.key) },
    });
    if (!res.data) return;
    const id = res.data.createChangeSet.id;
    if (runNow) await runChangeSet({ id });
    navigate(`/repos/${repoId}/changesets/${id}`);
  }

  return (
    <form className="inner stack" onSubmit={submit}>
      <div className="row">
        <h2 style={{ flex: 1 }}>Propose a change</h2>
        <button type="button" className="link" onClick={() => setOpen(false)}>Close</button>
      </div>
      {selected.length > 0 && (
        <div className="chips" aria-label="Selected components">
          {selected.map((n) => <span key={n.key} className="chip" title={n.key}>{n.kind}: {n.kind === "method" ? n.qualifiedName : n.name}</span>)}
        </div>
      )}
      <div>
        <label htmlFor="cs-request">What should change?</label>
        <textarea id="cs-request" required value={request} onChange={(e) => setRequest(e.target.value)} placeholder="Add a refund(chargeId) method to PaymentService that calls the gateway…" />
      </div>
      <div>
        <label htmlFor="cs-criteria">Acceptance criteria (optional)</label>
        <textarea id="cs-criteria" style={{ minHeight: 50 }} value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="Unit test covers a successful refund and an unknown charge." />
      </div>
      <div className="row">
        <label className="row" style={{ margin: 0, flex: 1 }}>
          <input type="checkbox" checked={runNow} onChange={(e) => setRunNow(e.target.checked)} /> Start the agent in an isolated worktree now
        </label>
        <button className="primary" disabled={!request.trim() || create.fetching || run.fetching}>
          {create.fetching || run.fetching ? "Creating…" : "Create change set"}
        </button>
      </div>
      {(create.error || run.error) && <p className="error">{(create.error ?? run.error)!.message}</p>}
    </form>
  );
}
