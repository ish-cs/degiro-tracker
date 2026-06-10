import { test, expect } from "@playwright/test";
import path from "node:path";

test("upload sample CSVs and render KPIs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /DEGIRO Tracker/i })).toBeVisible();

  const tx = path.resolve(__dirname, "../../fixtures/Transactions.sample.csv");
  const ac = path.resolve(__dirname, "../../fixtures/Account.sample.csv");

  const inputs = await page.locator('input[type=file]').all();
  await inputs[0].setInputFiles(tx);
  await inputs[1].setInputFiles(ac);

  await expect(page.getByText("Total Value")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Cost Ratio")).toBeVisible();
});
