import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { FAKE_GITHUB_PORT } from "./fakeGithub";
import { createFixtureRepo } from "./fixtureRepo";

test("connect, explore, propose, review, approve into a pull request, then mirror the merge", async ({ page }) => {
  const repoPath = createFixtureRepo();

  // Connect and index.
  await page.goto("/");
  await page.getByLabel("Connect a GitHub repository").fill(repoPath);
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page).toHaveURL(/\/repos\/\d+$/);
  const canvas = page.getByLabel("Architecture canvas");
  const serviceFile = canvas.locator(".gnode", { hasText: "payment.service.ts" }).first();
  await expect(serviceFile).toBeVisible({ timeout: 45_000 });
  const baseSha = (await page.locator(".side .mono").first().textContent())!.match(/@([0-9a-f]{8})/)![1];

  // Expand a file into its symbols, then inspect the class.
  await serviceFile.dblclick();
  const serviceClass = canvas.locator(".gnode", { hasText: "PaymentService" }).filter({ hasText: "class" });
  await expect(serviceClass).toBeVisible();
  await serviceClass.click();
  const inspector = page.locator(".inspector");
  await expect(inspector.getByText("Source at this commit")).toBeVisible();
  await expect(inspector.locator("pre.source")).toContainText("class PaymentService");
  await expect(inspector.getByText("implements (1)")).toBeVisible();

  // Propose a change against the selected class. The graph is not edited.
  await page.getByRole("button", { name: "Propose change…" }).click();
  await expect(page.getByLabel("Selected components")).toContainText("PaymentService");
  await page.getByLabel("What should change?").fill("Add a refund method to PaymentService");
  await page.getByRole("button", { name: "Create change set" }).click();
  await expect(page).toHaveURL(/\/changesets\/\d+$/);

  // The fake agent edits the worktree; the diff comes back for review.
  await expect(page.getByRole("heading", { name: "Review the diff below, then decide" })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".diff-file header")).toContainText("COVIS_CHANGES.md");
  await expect(page.locator(".diff-file")).toContainText("Add a refund method to PaymentService");

  // Tests were not run (the fixture has no test script), so approval needs an explicit acknowledgement.
  const approve = page.getByRole("button", { name: "Approve & open pull request" });
  await expect(approve).toBeDisabled();
  await page.getByLabel(/I reviewed the diff and want a pull request/).check();
  await expect(approve).toBeEnabled();
  await approve.click();

  // A pull request is opened from the pushed branch. Nothing is merged.
  const gate = page.locator(".gate");
  await expect(gate).toContainText("Waiting for pull request #", { timeout: 30_000 });
  await expect(page.locator(".events")).toContainText("Approved by dev");
  const prNumber = (await gate.getByRole("link").textContent())!.match(/#(\d+)/)![1];
  const branch = (await page.locator(".kv").getByText(/^covis\/cs-\d+$/).textContent())!;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: repoPath }).toString().trim();
  expect(git("rev-parse", "main").startsWith(baseSha)).toBe(true);
  expect(git("rev-parse", `${branch}^`)).toBe(git("rev-parse", "main"));

  // The canvas still mirrors the base commit while the pull request is open.
  await page.getByRole("link", { name: "← Canvas" }).click();
  await expect(page.locator(".side .mono").first()).toContainText(`@${baseSha}`);
  await expect(page.locator(".cs-list")).toContainText("pr open");

  // A human merges the pull request on GitHub.
  git("-c", "commit.gpgsign=false", "-c", "user.name=e2e", "-c", "user.email=e2e@x", "merge", "--no-ff", "-q", "-m", `Merge pull request #${prNumber}`, branch);
  const mergeSha = git("rev-parse", "main");
  await fetch(`http://localhost:${FAKE_GITHUB_PORT}/__test/merge?number=${prNumber}&sha=${mergeSha}`, { method: "POST" });

  // Opening the change set checks the pull request and picks up the merge;
  // only then does the canvas move.
  await page.locator(".cs-list a").first().click();
  await expect(gate).toContainText("was merged on GitHub");
  await expect(page.locator(".events li").filter({ hasText: "merged into main" })).toHaveCount(1);
  await page.getByRole("link", { name: "← Canvas" }).click();
  await expect(page.locator(".side .mono").first()).toContainText(mergeSha.slice(0, 8), { timeout: 30_000 });
});
