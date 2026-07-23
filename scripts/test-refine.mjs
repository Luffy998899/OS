import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();

async function login(page, email) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "auxa1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`);
}

// ---- 1) Game: move + interact + complete a mission for XP -------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  await login(page, "rohan@auxa.app");
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.locator("canvas").waitFor({ timeout: 10000 });
  await page.waitForTimeout(1000);

  const moveReq = page.waitForRequest((r) => r.url().includes("workspace.move"));
  // Walk up toward the Developer room mission board.
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(1100);
  await page.keyboard.up("ArrowUp");
  const moved = await moveReq.then(() => true).catch(() => false);
  console.log("[game] movement persisted:", moved);

  // Interact.
  await page.keyboard.press("e");
  await page.waitForTimeout(600);
  const panelOpen = await page
    .getByText(/Missions assigned by the owner/i)
    .isVisible()
    .catch(() => false);
  console.log("[game] mission panel opened:", panelOpen);

  const completeBtn = page.getByRole("button", { name: /^Complete$/ }).first();
  let completed = false;
  if (await completeBtn.isVisible().catch(() => false)) {
    await completeBtn.click();
    completed = await page
      .getByText(/\+\d+ XP/i)
      .first()
      .waitFor({ timeout: 6000 })
      .then(() => true)
      .catch(() => false);
  }
  console.log("[game] completed a mission for XP:", completed);
  await page.screenshot({ path: "screenshots/game-play.png", fullPage: true });
  await page.close();
}

// ---- 2) Whiteboard templates ----------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(page, "admin@auxa.app");
  await page.goto(`${BASE}/documents`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^New$/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "screenshots/wb-template-picker.png" });

  await page.getByLabel("Title").fill("Kanban Test");
  await page.getByRole("button", { name: /Kanban/ }).first().click();
  await page.getByRole("button", { name: /^Create$/ }).click();
  await page.waitForTimeout(1200);
  await page.getByText("Kanban Test").first().click();

  await page.locator(".tl-container").waitFor({ timeout: 15000 });
  await page.waitForTimeout(2500); // materialize + autosave
  const shapes = await page.locator(".tl-shape").count();
  console.log("[whiteboard] shapes materialized from template:", shapes);
  await page.screenshot({ path: "screenshots/wb-kanban.png", fullPage: true });

  // Reload to confirm persistence (template marker -> real snapshot).
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".tl-container").waitFor({ timeout: 15000 });
  await page.waitForTimeout(2000);
  const afterReload = await page.locator(".tl-shape").count();
  console.log("[whiteboard] shapes after reload:", afterReload);
  await page.close();
}

await browser.close();
console.log("done");
