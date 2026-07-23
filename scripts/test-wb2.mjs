import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);

await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const stripText = await page.locator("body").innerText();
console.log("[docs] template strip visible:", /Start from a template/.test(stripText));

await page.getByRole("button", { name: /Kanban/ }).first().click();
await page.waitForURL(/\/documents\/[a-z0-9]+/i, { timeout: 15000 });
await page.locator(".tl-container").waitFor({ timeout: 15000 });
await page.waitForTimeout(2500);
const shapes1 = await page.locator(".tl-shape").count();
const present1 = (await page.locator(".tl-container").count()) > 0;
console.log("[wb] after open - container:", present1, "shapes:", shapes1);

await page.mouse.click(700, 450);
await page.waitForTimeout(1200);
await page.keyboard.press("r");
const box = await page.locator(".tl-container").boundingBox();
await page.mouse.move(box.x + 250, box.y + 200);
await page.mouse.down();
await page.mouse.move(box.x + 360, box.y + 300, { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(3000);
const present2 = (await page.locator(".tl-container").count()) > 0;
const toolbar = (await page.locator(".tlui-toolbar, .tlui-layout").count()) > 0;
console.log("[wb] after edit - container:", present2, "toolbar:", toolbar);

await page.reload({ waitUntil: "networkidle" });
await page.locator(".tl-container").waitFor({ timeout: 15000 });
await page.waitForTimeout(2000);
const shapes2 = await page.locator(".tl-shape").count();
console.log("[wb] after reload - shapes:", shapes2);
await page.screenshot({ path: "screenshots/wb2.png", fullPage: true });

await browser.close();
const real = errors.filter((e) => !/watermark|license|DevTools/i.test(e));
console.log("console errors:", real.length ? real.slice(0, 6).join("\n") : "none");
console.log(present1 && present2 && shapes1 > 0 && shapes2 > 0 ? "PASS" : "FAIL");
