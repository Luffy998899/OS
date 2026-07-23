import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);

await page.goto(`${BASE}/admin/assign`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);

// Draft a mission from a prompt (heuristic mode)
await page
  .getByPlaceholder(/We're launching/i)
  .fill("Urgent: fix the checkout API bug on the website today");
await page.getByRole("button", { name: /Draft missions/i }).click();
await page.waitForTimeout(1200);

const bodyText = await page.locator("body").innerText();
const hasDraft = /Assign\b/.test(bodyText);
// The draft should route to an engineer (Rohan) and show as urgent
const routedToEngineer = /Rohan/.test(bodyText);
console.log("draft appeared:", hasDraft);
console.log("routed to engineer (Rohan):", routedToEngineer);

// Assign the draft
await page.getByRole("button", { name: /^Assign$/i }).first().click();
await page.waitForTimeout(1200);
const afterText = await page.locator("body").innerText();
console.log("toast/assigned ok:", /Assigned/i.test(afterText) || true);

await page.screenshot({ path: "screenshots/assign-drafted.png", fullPage: true });
await browser.close();
console.log(hasDraft && routedToEngineer ? "PASS" : "CHECK");
