const TONE: Record<string, string> = {
  PROPOSED: "accent",
  EXECUTING: "warn",
  VALIDATING: "warn",
  READY_FOR_REVIEW: "accent",
  APPROVED: "warn",
  PR_OPEN: "accent",
  PR_FAILED: "bad",
  PR_CLOSED: "",
  MERGED: "ok",
  REJECTED: "",
  CANCELLED: "",
  FAILED: "bad",
  ready: "ok",
  indexing: "warn",
  pending: "warn",
  failed: "bad",
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${TONE[status] ?? ""}`}>{status.toLowerCase().replaceAll("_", " ")}</span>;
}

/** Statuses in which the backend is doing work and the UI should poll. */
export const BUSY = new Set(["EXECUTING", "VALIDATING", "APPROVED"]);
/** Change sets that still represent a live proposal: not in the code yet. */
export const OPEN = new Set(["PROPOSED", "EXECUTING", "VALIDATING", "READY_FOR_REVIEW", "APPROVED", "PR_OPEN", "PR_FAILED", "FAILED"]);

export const short = (sha: string) => sha.slice(0, 8);

export function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
