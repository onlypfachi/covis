import { createServer, type IncomingMessage, type Server } from "node:http";
import { stat } from "node:fs/promises";
import path from "node:path";
import { runFakeAgent } from "./fakeAgent.js";
import { runAgent } from "./runAgent.js";
import type { RunRequest, WorkerEvent } from "./types.js";

export interface ServerConfig {
  /** Every worktree must live under this directory. */
  worktreesRoot: string;
  model: string;
  maxTurns: number;
  maxBudgetUsd?: number;
  timeoutMs: number;
  fake: boolean;
}

async function readJSON(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 1 << 20) throw new Error("request too large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function validateRun(body: unknown, worktreesRoot: string): RunRequest {
  const b = body as Partial<RunRequest>;
  if (!b || typeof b.runId !== "string" || !/^[\w.-]{1,64}$/.test(b.runId)) throw new Error("invalid runId");
  if (typeof b.worktreePath !== "string" || !path.isAbsolute(b.worktreePath)) throw new Error("worktreePath must be absolute");
  const rel = path.relative(path.resolve(worktreesRoot), path.resolve(b.worktreePath));
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("worktreePath is outside the worktrees root");
  if (typeof b.request !== "string" || !b.request.trim()) throw new Error("request is required");
  return {
    runId: b.runId,
    worktreePath: path.resolve(b.worktreePath),
    request: b.request,
    acceptanceCriteria: typeof b.acceptanceCriteria === "string" ? b.acceptanceCriteria : "",
    baseCommit: typeof b.baseCommit === "string" ? b.baseCommit : "",
    nodes: Array.isArray(b.nodes) ? b.nodes : [],
  };
}

export function createWorkerServer(cfg: ServerConfig): Server {
  const runs = new Map<string, AbortController>();

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, fake: cfg.fake, active: runs.size }));
        return;
      }
      if (req.method === "DELETE" && url.pathname.startsWith("/runs/")) {
        const id = decodeURIComponent(url.pathname.slice("/runs/".length));
        runs.get(id)?.abort("cancelled by user");
        res.writeHead(204).end();
        return;
      }
      if (req.method === "POST" && url.pathname === "/runs") {
        let run: RunRequest;
        try {
          run = validateRun(await readJSON(req), cfg.worktreesRoot);
          if (!(await stat(run.worktreePath)).isDirectory()) throw new Error("worktree does not exist");
        } catch (err) {
          res.writeHead(400, { "content-type": "text/plain" }).end(err instanceof Error ? err.message : String(err));
          return;
        }
        if (runs.has(run.runId)) {
          res.writeHead(409, { "content-type": "text/plain" }).end("run already in progress");
          return;
        }
        const ac = new AbortController();
        runs.set(run.runId, ac);
        const timer = setTimeout(() => ac.abort("timed out"), cfg.timeoutMs);
        // The backend closing the stream (e.g. its job was cancelled) stops the agent.
        res.on("close", () => {
          if (!res.writableFinished) ac.abort("client disconnected");
        });
        res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache" });
        const send = (e: WorkerEvent) => res.write(JSON.stringify(e) + "\n");
        send({ type: "started", runId: run.runId, model: cfg.fake ? "fake" : cfg.model });
        try {
          const events = cfg.fake
            ? runFakeAgent(run, ac.signal)
            : runAgent(run, { signal: ac.signal, model: cfg.model, maxTurns: cfg.maxTurns, maxBudgetUsd: cfg.maxBudgetUsd });
          for await (const ev of events) send(ev);
        } catch (err) {
          send({ type: "result", status: "error", error: err instanceof Error ? err.message : String(err) });
        } finally {
          clearTimeout(timer);
          runs.delete(run.runId);
          res.end();
        }
        return;
      }
      res.writeHead(404).end();
    } catch (err) {
      if (!res.headersSent) res.writeHead(500).end(String(err));
    }
  });
}
