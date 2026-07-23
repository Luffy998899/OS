import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const ys = [];
page.on("request", (r) => {
  if (r.url().includes("workspace.move") && r.method() === "POST") {
    const d = r.postData();
    const m = d && d.match(/"y":\s*(-?\d+)/g);
    if (m) m.forEach((s) => ys.push(Number(s.replace(/[^0-9-]/g, ""))));
  }
});

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);

// Create a client
await page.goto(`${BASE}/clients`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /Add client/i }).click();
await page.getByLabel("Company").fill("Nova Corp");
await page.getByRole("button", { name: /^Add client$/ }).click();
await page.waitForTimeout(800);

// Expand the map with a client area
await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
await page.locator("canvas").waitFor();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Add client area/i }).click();
await page.getByText("Select a client").click();
await page
  .getByRole("option", { name: "Nova Corp" })
  .first()
  .click()
  .catch(async () => {
    await page.locator('[data-slot="select-item"]', { hasText: "Nova Corp" }).first().click();
  });
await page.getByRole("button", { name: /^Add area$/ }).click();
await page.waitForTimeout(1500);
const roomsText = await page.locator("body").innerText();
const hasNovaRoom = /Nova Corp/.test(roomsText);
console.log("[expandable] client area added (room appears):", hasNovaRoom);
await page.screenshot({ path: "screenshots/iso-expanded.png", fullPage: true });

// Movement
await page.mouse.click(640, 320); // focus canvas area
await page.keyboard.down("ArrowUp");
await page.waitForTimeout(2200);
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(400);
const moved = ys.length >= 2 && Math.min(...ys) < ys[0];
console.log("[movement] samples:", ys.join(","), "| moved up:", moved);

// Whiteboard template count
await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
await page.getByRole("button", { name: /^New$/ }).click();
await page.waitForTimeout(500);
const cards = await page.locator('[data-slot="dialog-content"] button').filter({ hasText: /./ }).count();
const tmplText = await page.locator('[data-slot="dialog-content"]').innerText();
const tmplCount = (tmplText.match(/Kanban|Sprint retro|Weekly planner|Lean canvas|Persona|Risk matrix/g) || []).length;
console.log("[whiteboard] recognisable templates visible:", tmplCount, "(expect several)");

await browser.close();
console.log("done");
