import { createServer, type Server } from "node:http";

/**
 * Minimal stand-in for the GitHub pull request API, so end-to-end tests never
 * touch github.com. The backend reaches it via GITHUB_API_URL. Tests "merge" a
 * pull request through POST /__test/merge?number=N&sha=SHA.
 */
interface PR {
  number: number;
  html_url: string;
  state: "open" | "closed";
  merged: boolean;
  merge_commit_sha: string | null;
  head: string;
  base: string;
  title: string;
  body: string;
}

export const FAKE_GITHUB_PORT = Number(process.env.FAKE_GITHUB_PORT ?? 8798);

export function startFakeGithub(): Promise<Server> {
  const prs: PR[] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${FAKE_GITHUB_PORT}`);
    const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
    let raw = "";
    for await (const c of req) raw += c;

    if (url.pathname === "/__test/merge" && req.method === "POST") {
      const pr = prs.find((p) => p.number === Number(url.searchParams.get("number")));
      if (!pr) return send(404, { message: "Not Found" });
      Object.assign(pr, { state: "closed", merged: true, merge_commit_sha: url.searchParams.get("sha") });
      return send(200, pr);
    }
    if (!/^Bearer \S+/.test(req.headers.authorization ?? "")) return send(401, { message: "Bad credentials" });

    const m = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/pulls(?:\/(\d+))?$/);
    if (!m) return send(404, { message: "Not Found" });
    if (req.method === "POST" && !m[1]) {
      const input = JSON.parse(raw);
      if (prs.some((p) => p.head === input.head && p.state === "open")) {
        return send(422, { message: "Validation Failed", errors: [{ message: `A pull request already exists for ${input.head}.` }] });
      }
      const number = prs.length + 1;
      const pr: PR = { number, html_url: `http://localhost:${FAKE_GITHUB_PORT}/pull/${number}`, state: "open", merged: false, merge_commit_sha: null, ...input };
      prs.push(pr);
      return send(201, pr);
    }
    if (req.method === "GET" && m[1]) {
      const pr = prs.find((p) => p.number === Number(m[1]));
      return pr ? send(200, pr) : send(404, { message: "Not Found" });
    }
    if (req.method === "GET") {
      const head = url.searchParams.get("head")?.split(":").pop();
      return send(200, prs.filter((p) => p.head === head && p.state === "open"));
    }
    send(405, { message: "Method Not Allowed" });
  });
  return new Promise((resolve) => server.listen(FAKE_GITHUB_PORT, "127.0.0.1", () => resolve(server)));
}
