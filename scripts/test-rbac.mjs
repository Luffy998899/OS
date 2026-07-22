import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();

async function check(email, path, expectRedirectTo) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "auxa1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const url = page.url().replace(BASE, "");
  const ok = url === expectRedirectTo;
  console.log(
    `${email} -> ${path} : landed on ${url} ${ok ? "PASS" : "FAIL (expected " + expectRedirectTo + ")"}`,
  );
  await ctx.close();
  return ok;
}

const results = [];
// Employees & managers must be redirected away from People & Role (PEOPLE_MANAGE = admin only)
results.push(await check("rohan@auxa.app", "/admin/people", "/dashboard"));
results.push(await check("manager@auxa.app", "/admin/people", "/dashboard"));
// Admin can access
results.push(await check("admin@auxa.app", "/admin/people", "/admin/people"));

await browser.close();
console.log(results.every(Boolean) ? "ALL PASS" : "SOME FAILED");
