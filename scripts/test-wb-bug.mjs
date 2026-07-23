import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 680 } });

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
await page.getByRole("button", { name: /^New$/ }).click();
await page.getByLabel("Title").fill("BugTest2");
await page.getByText("Blank", { exact: true }).click();
await page.getByRole("button", { name: /^Create$/ }).click();
await page.waitForTimeout(1200);
await page.getByText("BugTest2").first().click();
await page.locator(".tl-container").waitFor({ timeout: 15000 });
await page.waitForTimeout(1200);

const present = async () =>
  (await page.locator(".tl-container").count()) > 0 &&
  (await page.locator(".tlui-toolbar, .tlui-layout").count()) > 0;

// draw a shape
await page.keyboard.press("r");
const box = await page.locator(".tl-container").boundingBox();
await page.mouse.move(box.x + 250, box.y + 200);
await page.mouse.down();
await page.mouse.move(box.x + 400, box.y + 320, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(600);
console.log("after draw: container+toolbar present:", await present());

// Type into the title (re-renders parent on every keystroke)
const titleInput = page.locator('input[value="BugTest2"]').first();
await titleInput.click();
await page.keyboard.type(" renamed", { delay: 60 });
await page.waitForTimeout(1500);
const shapeCount = await page.locator(".tl-shape").count();
console.log("after title typing: present:", await present(), "shapes:", shapeCount);

// Focus canvas and interact again
await page.mouse.click(box.x + 600, box.y + 400);
await page.waitForTimeout(800);
console.log("after re-click canvas: present:", await present());

await page.screenshot({ path: "screenshots/wb-bug.png", fullPage: true });
await browser.close();
console.log("console errors:", errors.length ? errors.slice(0, 8).join("\n") : "none");
