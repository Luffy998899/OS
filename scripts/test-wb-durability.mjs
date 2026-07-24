import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
const log = (...a) => console.log(...a);

async function signIn() {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "admin@auxa.app");
  await page.fill('input[name="password"]', "auxa1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/workspace`, { timeout: 20000 });
}

async function shapes() {
  return page.locator(".tl-shape").count();
}

await signIn();

// --- Scenario 1: normal open → edit → reload persists (server + local) ---
await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.getByRole("button", { name: /standup/i }).first().click();
await page.waitForURL(/\/documents\/[a-z0-9]+/i, { timeout: 20000 });
const url = page.url();
await page.locator(".tl-container").waitFor({ timeout: 20000 });
await page.waitForTimeout(2500);
log("[open] shapes:", await shapes());

const box = await page.locator(".tl-container").boundingBox();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.keyboard.press("r");
await page.mouse.move(box.x + 480, box.y + 250);
await page.mouse.down();
await page.mouse.move(box.x + 560, box.y + 330, { steps: 6 });
await page.mouse.up();
await page.keyboard.press("Escape");
await page.waitForTimeout(2000);
log("[edit] shapes:", await shapes());

await page.reload({ waitUntil: "networkidle" });
await page.locator(".tl-container").waitFor({ timeout: 20000 });
await page.waitForTimeout(2500);
const reload1 = await shapes();
log("[reload-normal] shapes:", reload1);

// --- Scenario 2: server saves FAIL (Codespaces-style) → local must survive ---
await page.route("**/api/trpc/document.updateContent**", (r) => r.abort());
log("[block] updateContent aborted from now on");

// add several shapes while saves fail
for (let i = 0; i < 3; i++) {
  await page.keyboard.press("r");
  await page.mouse.move(box.x + 200 + i * 60, box.y + 500);
  await page.mouse.down();
  await page.mouse.move(box.x + 250 + i * 60, box.y + 560, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}
const beforeReload2 = await shapes();
log("[edit-offline] shapes:", beforeReload2);
await page.waitForTimeout(1500);

// reload with saves still failing — content must come back from IndexedDB
await page.reload({ waitUntil: "networkidle" });
await page.locator(".tl-container").waitFor({ timeout: 20000 });
await page.waitForTimeout(2500);
const reload2 = await shapes();
log("[reload-offline] shapes:", reload2);
await page.screenshot({ path: "screenshots/repro-offline.png" });

await browser.close();
const real = errors.filter((e) => !/watermark|license|DevTools|Failed to fetch|aborted|ERR_FAILED|updateContent/i.test(e));
log("console errors:", real.length ? real.slice(0, 6).join("\n---\n") : "none");
const pass = reload1 > 0 && beforeReload2 > reload1 && reload2 >= beforeReload2;
log(pass ? "PASS" : "FAIL", { reload1, beforeReload2, reload2 });
