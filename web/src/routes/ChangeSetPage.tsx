import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery } from "urql";
import { DiffView } from "../changesets/DiffView";
import { EventLog } from "../changesets/EventLog";
import {
  ApproveChangeSetMutation,
  CancelChangeSetMutation,
  ChangeSetQuery,
  RejectChangeSetMutation,
  RetryPullRequestMutation,
  ReviseChangeSetMutation,
  RunChangeSetMutation,
  SyncPullRequestMutation,
} from "../lib/queries";
import { BUSY, StatusPill, ago, short } from "../lib/status";
import { usePolling } from "../lib/usePolling";

export function ChangeSetPage() {
  const { csId } = useParams();
  const navigate = useNavigate();
  const [{ data, error }, refetch] = useQuery({ query: ChangeSetQuery, variables: { id: csId! } });
  const cs = data?.changeSet;
  usePolling(!!cs && BUSY.has(cs.status), useCallback(() => refetch({ requestPolicy: "network-only" }), [refetch]));

  const [run, runCS] = useMutation(RunChangeSetMutation);
  const [cancel, cancelCS] = useMutation(CancelChangeSetMutation);
  const [approve, approveCS] = useMutation(ApproveChangeSetMutation);
  const [reject, rejectCS] = useMutation(RejectChangeSetMutation);
  const [revise, reviseCS] = useMutation(ReviseChangeSetMutation);
  const [retry, retryPR] = useMutation(RetryPullRequestMutation);
  const [sync, syncPR] = useMutation(SyncPullRequestMutation);
  const [ack, setAck] = useState(false);

  // An open pull request may have been merged or closed on GitHub since; check once on open.
  const prOpen = cs?.status === "PR_OPEN";
  useEffect(() => {
    if (prOpen && csId) void syncPR({ id: csId });
  }, [prOpen, csId, syncPR]);
  const [reviewedHash, setReviewedHash] = useState<string | null>(null);

  if (error) return <div className="page error">{error.message}</div>;
  if (!cs) return <div className="page muted">Loading…</div>;

  // Links follow the change set's own repository, not whatever the URL claims.
  const repoId = cs.repositoryId;
  const ex = cs.latestExecution;
  const testsPassed = ex?.testExitCode === 0;
  const testsRan = ex?.testExitCode != null;
  const ready = cs.status === "READY_FOR_REVIEW" && !!ex?.diffHash;
  // The reviewer must have the diff on screen; a new attempt resets the acknowledgement.
  if (ex?.diffHash && reviewedHash !== ex.diffHash) {
    setReviewedHash(ex.diffHash);
    setAck(false);
  }
  const needsAck = !testsPassed;
  const mutError = run.error ?? cancel.error ?? approve.error ?? reject.error ?? revise.error ?? retry.error ?? sync.error;
  const lastError = [...cs.events].reverse().find((e) => e.type === "error")?.payload.error as string | undefined;
  const prLink = cs.prUrl && (
    <a href={cs.prUrl} target="_blank" rel="noreferrer">pull request #{cs.prNumber}</a>
  );

  async function doReject() {
    const reason = window.prompt("Why are you rejecting this change set? (optional)") ?? undefined;
    if (reason === undefined) return;
    await rejectCS({ id: cs!.id, reason });
  }
  async function doRevise() {
    const res = await reviseCS({ id: cs!.id });
    if (res.data) navigate(`/repos/${repoId}/changesets/${res.data.reviseChangeSet.id}`);
  }

  return (
    <div className="cs-page">
      <main className="cs-main stack">
        <div className="row wrap">
          <Link to={`/repos/${repoId}`} className="muted">← Canvas</Link>
          <span className="faint">/</span>
          <h1>Change set #{cs.id}</h1>
          <StatusPill status={cs.status} />
        </div>
        <p className="request">{cs.requestText}</p>
        {cs.acceptanceCriteria && (
          <div><h3>Acceptance criteria</h3><p className="request" style={{ fontSize: 13 }}>{cs.acceptanceCriteria}</p></div>
        )}
        <dl className="kv">
          <dt>base</dt><dd className="mono">{short(cs.baseCommitSha)} <span className="faint">(immutable)</span></dd>
          {cs.branchName && (<><dt>branch</dt><dd className="mono">{cs.branchName}</dd></>)}
          {cs.resultCommitSha && (<><dt>commit</dt><dd className="mono">{short(cs.resultCommitSha)}</dd></>)}
          {cs.prUrl && (<><dt>pull request</dt><dd>{prLink}</dd></>)}
          {cs.revisionOf && (<><dt>revises</dt><dd><Link to={`/repos/${repoId}/changesets/${cs.revisionOf}`}>#{cs.revisionOf}</Link></dd></>)}
          <dt>targets</dt>
          <dd>{cs.selectedKeys.length ? <span className="chips">{cs.selectedKeys.map((k) => <span className="chip" key={k}>{k}</span>)}</span> : <span className="faint">whole repository</span>}</dd>
        </dl>

        <section className={`gate ${ready ? "ready" : ""}`} aria-label="Review and approval">
          {cs.status === "PROPOSED" && (
            <div className="row"><span style={{ flex: 1 }}>Not started. The agent works in an isolated git worktree; nothing is committed until you approve.</span>
              <button className="primary" disabled={run.fetching} onClick={() => runCS({ id: cs.id })}>Run agent</button></div>
          )}
          {(cs.status === "EXECUTING" || cs.status === "VALIDATING") && (
            <div className="row"><span style={{ flex: 1 }}>{cs.status === "EXECUTING" ? "The agent is working in the worktree…" : "Running tests in the sandbox…"}</span>
              <button className="danger" disabled={cancel.fetching} onClick={() => cancelCS({ id: cs.id })}>Cancel</button></div>
          )}
          {cs.status === "READY_FOR_REVIEW" && ex && (
            <div className="stack">
              <h2>Review the diff below, then decide</h2>
              <div>
                Tests:{" "}
                {testsRan ? (testsPassed ? <span className="pill ok">passed</span> : <span className="pill bad">failed (exit {ex.testExitCode})</span>) : <span className="pill warn">not run</span>}
              </div>
              {needsAck && (
                <label className="row" style={{ margin: 0, color: "var(--ink)" }}>
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  I reviewed the diff and want a pull request even though tests {testsRan ? "failed" : "were not run"}.
                </label>
              )}
              <div className="row wrap">
                <button className="primary" disabled={approve.fetching || (needsAck && !ack)}
                  onClick={() => approveCS({ id: cs.id, diffHash: ex.diffHash })}
                  title="Commits exactly this diff on the change set branch, pushes it and opens a pull request. Nothing is merged.">
                  Approve &amp; open pull request
                </button>
                <button onClick={() => runCS({ id: cs.id })} disabled={run.fetching}>Re-run agent</button>
                <button className="danger" onClick={doReject} disabled={reject.fetching}>Reject</button>
                <span className="faint mono" style={{ fontSize: 11 }}>diff {ex.diffHash.slice(0, 12)}</span>
              </div>
            </div>
          )}
          {cs.status === "APPROVED" && <span>Approved. Pushing <span className="mono">{cs.branchName}</span> and opening a pull request…</span>}
          {cs.status === "PR_OPEN" && (
            <div className="row wrap"><span style={{ flex: 1 }}>Waiting for {prLink} to be reviewed and merged on GitHub. Nothing is merged here.</span>
              <button onClick={() => syncPR({ id: cs.id })} disabled={sync.fetching}>{sync.fetching ? "Checking…" : "Check status"}</button></div>
          )}
          {cs.status === "PR_FAILED" && (
            <div className="row wrap"><span className="error" style={{ flex: 1 }}>Could not open the pull request: {lastError ?? "unknown error"}</span>
              <button className="primary" onClick={() => retryPR({ id: cs.id })} disabled={retry.fetching}>Retry pull request</button>
              <button className="danger" onClick={() => cancelCS({ id: cs.id })}>Cancel</button></div>
          )}
          {cs.status === "MERGED" && <span>{prLink ?? "The pull request"} was merged on GitHub. The canvas updates once the merge commit is indexed.</span>}
          {cs.status === "PR_CLOSED" && (
            <div className="row"><span style={{ flex: 1 }} className="muted">{prLink} was closed without merging. Its history is kept.</span>
              <button onClick={doRevise} disabled={revise.fetching}>Start a revision</button></div>
          )}
          {cs.status === "FAILED" && (
            <div className="row wrap"><span className="error" style={{ flex: 1 }}>{ex?.error || "Failed."}</span>
              <button className="primary" onClick={() => runCS({ id: cs.id })} disabled={run.fetching}>Retry</button>
              <button onClick={doRevise} disabled={revise.fetching}>Revise on latest commit</button>
              <button className="danger" onClick={doReject}>Reject</button></div>
          )}
          {(cs.status === "REJECTED" || cs.status === "CANCELLED") && (
            <div className="row"><span style={{ flex: 1 }} className="muted">This change set is closed. Its history is kept.</span>
              <button onClick={doRevise} disabled={revise.fetching}>Start a revision</button></div>
          )}
          {mutError && <p className="error">{mutError.message.replace("[GraphQL] ", "")}</p>}
        </section>

        {ex && ex.diff && (
          <section>
            <h2>Diff <span className="faint" style={{ fontWeight: 400 }}>attempt {ex.attempt}</span></h2>
            <DiffView diff={ex.diff} />
          </section>
        )}
        {ex && (testsRan || ex.testOutput) && (
          <section>
            <h2>Test output</h2>
            <pre className="test-output">{ex.testOutput || "(no output)"}</pre>
          </section>
        )}
        {cs.executions.length > 1 && (
          <section>
            <h2>Attempts</h2>
            <ul className="edge-list">
              {cs.executions.map((e) => (
                <li key={e.id}><span className="mono">#{e.attempt}</span> <StatusPill status={e.status} /> <span className="faint">{ago(e.startedAt)}</span> {e.error && <span className="error">{e.error}</span>}</li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <aside className="cs-side">
        <div className="section"><h3>Activity</h3></div>
        <EventLog events={cs.events} />
      </aside>
    </div>
  );
}
