import { useMemo } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";

export function DiffView({ diff }: { diff: string }) {
  const files = useMemo(() => {
    try {
      return parseDiff(diff, { nearbySequences: "zip" });
    } catch {
      return null;
    }
  }, [diff]);
  if (!files) return <pre className="test-output">{diff}</pre>;
  return (
    <>
      {files.map((f) => {
        const path = f.type === "delete" ? f.oldPath : f.newPath;
        const adds = f.hunks.reduce((n, h) => n + h.changes.filter((c) => c.type === "insert").length, 0);
        const dels = f.hunks.reduce((n, h) => n + h.changes.filter((c) => c.type === "delete").length, 0);
        return (
          <section className="diff-file" key={`${f.oldRevision}-${f.newRevision}-${path}`}>
            <header>
              <span style={{ flex: 1 }}>{path}</span>
              {f.type !== "modify" && <span className="pill">{f.type}</span>}
              <span style={{ color: "var(--ok)" }}>+{adds}</span>
              <span style={{ color: "var(--bad)" }}>−{dels}</span>
            </header>
            <Diff viewType="unified" diffType={f.type} hunks={f.hunks}>
              {(hunks) => hunks.map((h) => <Hunk key={h.content} hunk={h} />)}
            </Diff>
          </section>
        );
      })}
    </>
  );
}
