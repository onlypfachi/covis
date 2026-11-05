import { expect, test } from "@playwright/test";
import { createFixtureRepo } from "./fixtureRepo";

test("selecting a function shows description, inputs, the function and its result in the sidebar", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Connect a GitHub repository").fill(createFixtureRepo());
  await page.getByRole("button", { name: "Connect" }).click();
  const canvas = page.getByLabel("Architecture canvas");
  const fit = () => page.getByRole("button", { name: "Fit", exact: true }).click();

  await canvas.locator(".gnode", { hasText: "payment.service.ts" }).first().dblclick({ timeout: 45_000 });
  await fit();
  await canvas.locator(".gnode", { hasText: "PaymentService" }).filter({ hasText: "class" }).dblclick();
  await fit();
  await canvas.locator(".gnode", { hasText: "PaymentService.charge" }).click();

  const sidebar = page.locator(".inspector");
  const description = sidebar.getByLabel("Description");
  const inputs = sidebar.getByLabel("Inputs");
  const fn = sidebar.getByLabel("Function");
  const result = sidebar.getByLabel("Result");

  // 1. Description: the doc summary, without its tags.
  await expect(description).toContainText("PaymentService.charge");
  await expect(description).toContainText("async method of PaymentService");
  await expect(description).toContainText("Charges the customer.");
  await expect(description).not.toContainText("@param");

  // 2. Inputs, with @param descriptions.
  await expect(inputs.locator("li")).toHaveCount(3);
  await expect(inputs.locator("li").nth(0)).toContainText("amount");
  await expect(inputs.locator("li").nth(0)).toContainText("number");
  await expect(inputs.locator("li").nth(0)).toContainText("Amount to charge, in cents.");
  await expect(inputs.locator("li").nth(1)).toContainText("default 'usd'");
  await expect(inputs.locator("li").nth(2)).toContainText("…tags");

  // 3. The whole function.
  await expect(fn).toContainText("async charge(amount: number");
  await expect(fn).toContainText("return this.gateway.createCharge");
  await expect(fn.locator(".ln").first()).toHaveText(/^\d+$/);

  // 4. Result, including its type.
  await expect(result).toContainText("Promise<unknown>");
  await expect(result).toContainText("The gateway's charge record.");
  await expect(result).toContainText("this.gateway.createCharge({ amount, currency })");

  // In that order, top to bottom.
  const y = async (l: typeof inputs) => (await l.boundingBox())!.y;
  const ys = [await y(description), await y(inputs), await y(fn), await y(result)];
  expect([...ys].sort((a, b) => a - b)).toEqual(ys);

  // A function without a return value: inferred void.
  await canvas.locator(".gnode", { hasText: "PaymentService.validate" }).click();
  await expect(result).toContainText("void");
  await expect(result).toContainText("inferred");
  await expect(result).toContainText("nothing (no return value)");

  // No popup on the canvas any more.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Non-function components keep the plain source view.
  await canvas.locator(".gnode", { hasText: "PaymentService" }).filter({ hasText: "class" }).click();
  await expect(sidebar.getByText("Source at this commit")).toBeVisible();
  await expect(sidebar.getByLabel("Inputs")).toHaveCount(0);
});
