import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);

await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^New$/ }).click();
await page.getByLabel("Title").fill("E2E Board");
await page.getByRole("button", { name: /^Create$/ }).click();
await page.waitForTimeout(1000);
await page.getByText("E2E Board").first().click();

await page.locator(".tl-container").waitFor({ timeout: 15000 });
await page.waitForTimeout(1500);

// Draw a rectangle (r = rectangle tool)
await page.keyboard.press("r");
const box = await page.locator(".tl-container").boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;
await page.mouse.move(cx - 120, cy - 80);
await page.mouse.down();
await page.mouse.move(cx + 120, cy + 80, { steps: 8 });
await page.mouse.up();

// Autosave should fire a document.updateContent tRPC call
const saved = await page
  .waitForRequest(
    (r) => r.url().includes("document.updateContent"),
    { timeout: 8000 },
  )
  .then(() => true)
  .catch(() => false);

console.log("autosave request fired:", saved);
await page.waitForTimeout(500);

// Reload and confirm a shape persisted (svg shape present in canvas)
await page.reload({ waitUntil: "networkidle" });
await page.locator(".tl-container").waitFor({ timeout: 15000 });
await page.waitForTimeout(2000);
const shapeCount = await page.locator(".tl-shape").count();
console.log("persisted shapes after reload:", shapeCount);

await browser.close();
console.log(saved && shapeCount > 0 ? "PASS" : "CHECK");
