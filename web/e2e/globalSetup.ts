import { startFakeGithub } from "./fakeGithub";

/**
 * Refuse to run end-to-end tests against an agent-worker that would call
 * Claude. The specs create change sets and run the agent, so a real worker
 * would spend API credits and write real edits into whatever stack is running.
 * Also starts the fake GitHub API that approved change sets open pull requests on.
 */
export default async function globalSetup() {
  const url = process.env.AGENT_WORKER_URL ?? "http://localhost:8790";
  let health: { fake?: boolean };
  try {
    health = await (await fetch(`${url}/health`)).json();
  } catch {
    throw new Error(`agent-worker not reachable at ${url}. Start the stack with: COVIS_FAKE_AGENT=1 make dev`);
  }
  if (health.fake !== true) {
    throw new Error(`Refusing to run e2e: the agent-worker at ${url} is not in fake mode and would call Claude. Restart it with COVIS_FAKE_AGENT=1.`);
  }
  const github = await startFakeGithub();
  return () => new Promise<void>((resolve) => github.close(() => resolve()));
}
