type Ev = { id: string; type: string; payload: Record<string, unknown>; createdAt: string };

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const str = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

function describe(e: Ev): React.ReactNode {
  const p = e.payload;
  switch (e.type) {
    case "created":
      return <>Proposed against <span className="mono">{str(p.baseCommit).slice(0, 8)}</span>{p.revisionOf ? <> (revision of #{str(p.revisionOf)})</> : null}</>;
    case "status_changed":
      return <>{str(p.from)} → <b>{str(p.to)}</b>{p.error ? <div className="error">{str(p.error)}</div> : null}{p.reason ? <div className="muted">{str(p.reason)}</div> : null}</>;
    case "agent":
      switch (p.type) {
        case "started": return <>Agent started <span className="faint mono">{str(p.model)}</span></>;
        case "assistant_text": return <span style={{ whiteSpace: "pre-wrap" }}>{str(p.text)}</span>;
        case "tool_use": {
          const input = (p.input ?? {}) as Record<string, unknown>;
          const target = input.file_path ?? input.path ?? input.pattern ?? "";
          return <span className="tool">{str(p.tool)} <span className="faint">{str(target)}</span></span>;
        }
        case "tool_denied": return <span className="error">Denied {str(p.tool)}: {str(p.reason)}</span>;
        case "tool_result": return p.isError ? <span className="error">{str(p.preview)}</span> : null;
        case "result":
          return (
            <>Agent finished: <b>{str(p.status)}</b>{p.costUsd != null ? <span className="faint"> · ${Number(p.costUsd).toFixed(2)} · {str(p.turns)} turns</span> : null}
              {p.summary ? <div style={{ whiteSpace: "pre-wrap" }}>{str(p.summary)}</div> : null}{p.error ? <div className="error">{str(p.error)}</div> : null}</>
          );
      }
      return <span className="faint">{str(p.type)}</span>;
    case "tests":
      return p.skipped ? <>Tests skipped: {str(p.skipped)}</> : <>Tests <span className="mono">{str(p.command)}</span> exited {str(p.exitCode)}</>;
    case "approved":
      return <>Approved by {str(p.by)} <span className="faint mono">diff {str(p.diffHash).slice(0, 10)}</span></>;
    case "rejected":
      return <>Rejected by {str(p.by)}{p.reason ? `: ${str(p.reason)}` : ""}</>;
    case "pr_opened":
      return <>Pushed <span className="mono">{str(p.branch)}</span> and opened <a href={str(p.url)} target="_blank" rel="noreferrer">pull request #{str(p.number)}</a> into {str(p.base)}</>;
    case "merged":
      return <><a href={str(p.url)} target="_blank" rel="noreferrer">Pull request #{str(p.number)}</a> merged into {str(p.branch)}{p.commit ? <> as <span className="mono">{str(p.commit).slice(0, 8)}</span></> : null}</>;
    case "pr_closed":
      return <><a href={str(p.url)} target="_blank" rel="noreferrer">Pull request #{str(p.number)}</a> closed without merging</>;
    case "error":
      return <span className="error">{str(p.error)}</span>;
  }
  return <span className="faint">{e.type}</span>;
}

export function EventLog({ events }: { events: Ev[] }) {
  const rows = events.map((e) => ({ e, body: describe(e) })).filter((r) => r.body !== null);
  return (
    <ol className="events" aria-label="Activity">
      {rows.map(({ e, body }) => (
        <li key={e.id}>
          <div className="t">{time(e.createdAt)} · {e.type === "agent" ? str(e.payload.type) : e.type}</div>
          <div className="body">{body}</div>
        </li>
      ))}
    </ol>
  );
}
