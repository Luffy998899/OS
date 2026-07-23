import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();

async function login(page) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "admin@auxa.app");
  await page.fill('input[name="password"]', "auxa1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/workspace`);
}

// Mobile sweep of dense pages
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await login(page);
  for (const p of ["/workspace", "/clients", "/timesheet", "/admin/reports"]) {
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const slug = p.replace(/\//g, "_").replace(/^_/, "");
    await page.screenshot({ path: `screenshots/m-${slug}.png`, fullPage: true });
  }
  // check horizontal overflow on workspace
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  console.log("mobile horizontal overflow (workspace):", overflow);
  await ctx.close();
}

// Dark mode
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page);
  await page.getByRole("button", { name: /toggle theme/i }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "screenshots/dark-dashboard.png", fullPage: true });
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: "screenshots/dark-workspace.png", fullPage: true });
  await ctx.close();
}

await browser.close();
console.log("review shots done");
