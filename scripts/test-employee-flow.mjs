import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();

async function login(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "auxa1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/workspace`);
  return { ctx, page };
}
async function pick(page, name) {
  const o = page.getByRole("option", { name }).first();
  if (await o.isVisible().catch(() => false)) return o.click();
  await page.locator('[data-slot="select-item"]', { hasText: name }).first().click();
}

// ---- Admin setup ----
{
  const { ctx, page } = await login("admin@auxa.app");
  await page.goto(`${BASE}/admin/people`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Add employee/i }).click();
  await page.getByLabel("Full name").fill("Emp One");
  await page.getByLabel("Email").fill("emp@auxa.app");
  await page.locator("#u-role").click();
  await pick(page, "Employee");
  await page.getByLabel("Temporary password").fill("auxa1234");
  await page.getByRole("button", { name: /^Create$/ }).click();
  await page.waitForTimeout(900);

  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Add client/i }).click();
  await page.getByLabel("Company").fill("Managed Co");
  await page.getByText("Unassigned").click();
  await pick(page, "Emp One");
  await page.getByRole("button", { name: /^Add client$/ }).click();
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /Add client/i }).click();
  await page.getByLabel("Company").fill("Other Co");
  await page.getByRole("button", { name: /^Add client$/ }).click();
  await page.waitForTimeout(700);

  await page.goto(`${BASE}/admin/assign`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /New mission/i }).click();
  await page.getByLabel("Title").fill("Build homepage");
  await page.getByText("Unassigned").click();
  await pick(page, "Emp One");
  await page.getByRole("button", { name: /^Create$/ }).click();
  await page.waitForTimeout(900);
  console.log("[setup] done");
  await ctx.close();
}

// ---- Employee ----
{
  const { ctx, page } = await login("emp@auxa.app");
  await page.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const t = await page.locator("body").innerText();
  console.log("[employee] sees Managed Co:", /Managed Co/.test(t), "| sees Other Co:", /Other Co/.test(t));

  await page.goto(`${BASE}/my-work`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.getByText("Build homepage").first().click();
  await page.waitForTimeout(600);
  // Employee publishes for review
  await page.getByRole("button", { name: "In review", exact: true }).first().click();
  await page.waitForTimeout(800);
  // Attempt to self-complete -> should be blocked
  await page.getByRole("button", { name: "Done", exact: true }).first().click();
  await page.waitForTimeout(900);
  await ctx.close();
}

// ---- Admin approves ----
{
  const { ctx, page } = await login("admin@auxa.app");
  await page.goto(`${BASE}/admin/assign`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const hasCompletion = /Completions to approve/.test(await page.locator("body").innerText());
  console.log("[admin] completion awaiting approval:", hasCompletion);
  const approved = await page
    .getByRole("button", { name: /^Approve$/ })
    .first()
    .click()
    .then(() => page.getByText(/XP awarded/i).waitFor({ timeout: 5000 }))
    .then(() => true)
    .catch(() => false);
  console.log("[admin] approved -> XP awarded:", approved);
  await ctx.close();
}

await browser.close();
console.log("done");
