import { expect, test } from "@playwright/test";
import { createFixtureRepo } from "./fixtureRepo";

test("the canvas shows functions grouped by file, and finds them by search and by link", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Connect a GitHub repository").fill(createFixtureRepo());
  await page.getByRole("button", { name: "Connect" }).click();
  const canvas = page.getByLabel("Architecture canvas");
  const inspector = page.locator(".inspector");
  await expect(canvas.locator(".fgroup").first()).toBeVisible({ timeout: 45_000 });

  // One box per file that has functions; files without functions get none.
  await expect(canvas.locator(".fgroup")).toHaveCount(6);
  await expect(canvas.locator(".fgroup", { hasText: "types.ts" })).toHaveCount(0);
  await expect(canvas.locator(".fgroup", { hasText: "payment.controller.ts" })).toContainText("3 fn");
  // Only functions are nodes.
  for (const kind of await canvas.locator(".gnode .kind").allTextContents()) expect(kind).toMatch(/^(function|method)/);

  // Boxes are stacked to fill the canvas, not laid out in one row.
  const ys = new Set<number>();
  for (const box of await canvas.locator(".react-flow__node-file").all()) ys.add(Math.round((await box.boundingBox())!.y));
  expect(ys.size).toBeGreaterThan(1);

  // Search finds functions only and selects the one picked.
  await page.getByLabel("Search functions").fill("toCents");
  await page.locator(".side .edge-list").getByRole("button", { name: "toCents" }).click();
  await expect(canvas.locator(".gnode.selected")).toContainText("toCents");
  await expect(inspector.getByLabel("Description")).toContainText("toCents");

  // Select `start` through search, which also brings it into view.
  const selectStart = async () => {
    await page.getByLabel("Search functions").fill("start");
    await page.locator(".side .edge-list").getByRole("button", { name: "start", exact: true }).click();
    await expect(canvas.locator(".gnode.selected")).toContainText("start");
  };

  // A link to something that is not a function opens it in the inspector only.
  await selectStart();
  await inspector.getByRole("button", { name: "PaymentController", exact: true }).click();
  await expect(inspector.getByText("Source at this commit")).toBeVisible();
  await expect(inspector).toContainText("class");
  await expect(canvas.locator(".gnode", { hasText: /^class/ })).toHaveCount(0);

  // A link to a file selects its box.
  await selectStart();
  await inspector.getByRole("button", { name: "src/main.ts", exact: true }).click();
  await expect(canvas.locator(".fgroup.selected")).toContainText("main.ts");
  await expect(page.getByText("1 component selected.")).toBeVisible();
});

test("a selection rectangle can start inside a file box, and old saved positions stay inside their box", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Connect a GitHub repository").fill(createFixtureRepo());
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page).toHaveURL(/\/repos\/\d+$/);
  const repoId = page.url().match(/\/repos\/(\d+)$/)![1];
  const canvas = page.getByLabel("Architecture canvas");
  await expect(canvas.locator(".fgroup").first()).toBeVisible({ timeout: 45_000 });

  // A position saved by the old canvas, where functions were placed on the
  // whole canvas rather than inside their file's box.
  const validate = "method:src/payments/payment.service.ts#PaymentService.validate";
  const res = await page.request.post("/graphql", {
    data: {
      query: "mutation($r: ID!, $p: [PositionInput!]!) { saveLayout(repositoryId: $r, positions: $p) }",
      variables: { r: repoId, p: [{ key: validate, x: 4000, y: 3000 }] },
    },
  });
  expect(res.ok()).toBe(true);
  await page.reload();
  const service = canvas.locator(".react-flow__node-file", { hasText: "payment.service.ts" });
  await expect(service).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(500);
  const box = (await service.boundingBox())!;
  const fn = (await canvas.locator(`[data-id="${validate}"]`).boundingBox())!;
  expect(fn.x).toBeGreaterThanOrEqual(box.x);
  expect(fn.y).toBeGreaterThanOrEqual(box.y);
  expect(fn.x + fn.width).toBeLessThanOrEqual(box.x + box.width + 1);
  expect(fn.y + fn.height).toBeLessThanOrEqual(box.y + box.height + 1);

  // Drag a rectangle from inside the controller's box around its functions.
  const controller = canvas.locator(".react-flow__node-file", { hasText: "payment.controller.ts" });
  const c = (await controller.boundingBox())!;
  const head = (await controller.locator(".head").boundingBox())!;
  await page.mouse.move(c.x + 3, head.y + head.height + 2);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width - 3, c.y + c.height - 3, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByText("3 components selected.")).toBeVisible();
  // The box itself was not dragged.
  expect((await controller.boundingBox())!.x).toBeCloseTo(c.x, 0);
});
