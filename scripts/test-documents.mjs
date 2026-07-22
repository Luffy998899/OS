import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/dashboard`);

await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.screenshot({ path: "screenshots/documents-desktop.png", fullPage: true });

// Open the team whiteboard
await page.getByText("Q3 Roadmap Whiteboard").first().click();
await page.waitForTimeout(500);
const canvas = page.locator(".tl-container");
await canvas.waitFor({ timeout: 15000 });
await page.waitForTimeout(1500);
const canvasVisible = await canvas.isVisible();
console.log("tldraw canvas rendered:", canvasVisible);
await page.screenshot({ path: "screenshots/whiteboard-desktop.png", fullPage: true });

await browser.close();
// tldraw may emit benign warnings; report genuine errors only
const realErrors = errors.filter(
  (e) => !/watermark|license|Download the React DevTools/i.test(e),
);
console.log("console errors:", realErrors.length ? realErrors.join("\n") : "none");
console.log(canvasVisible ? "PASS" : "FAIL");
