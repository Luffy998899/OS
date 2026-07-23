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

// 1) Redeem a reward as rohan (980 pts)
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(page, "rohan@auxa.app");
  await page.goto(`${BASE}/leaderboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const balanceBefore = await page
    .locator("text=points to spend")
    .locator("xpath=preceding-sibling::p[1]")
    .innerText()
    .catch(() => "?");
  await page.getByRole("button", { name: /^Redeem$/ }).first().click();
  await page.waitForTimeout(1500);
  const balanceAfter = await page
    .locator("text=points to spend")
    .locator("xpath=preceding-sibling::p[1]")
    .innerText()
    .catch(() => "?");
  const hasRedemption = /Your redemptions/i.test(
    await page.locator("body").innerText(),
  );
  console.log(`balance ${balanceBefore} -> ${balanceAfter}`);
  console.log("redemption recorded:", hasRedemption);
  await page.close();
}

// 2) Move rooms as admin
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(page, "admin@auxa.app");
  await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const moveReq = page.waitForRequest((r) =>
    r.url().includes("workspace.move"),
  );
  await page.getByText("Developer Room").first().click();
  await moveReq;
  await page.waitForTimeout(1500);
  // The Developer Room tile should now show "You're here"
  const devTile = page
    .locator("button", { hasText: "Developer Room" })
    .first();
  const here = /You/i.test(await devTile.innerText());
  console.log("moved into Developer Room:", here);
  await page.close();
}

await browser.close();
console.log("done");
