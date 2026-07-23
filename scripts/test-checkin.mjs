import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

async function login(email, password) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/workspace`);
}

// Use manager (no seeded active shift) to test the full cycle
await login("manager@auxa.app", "auxa1234");
await page.waitForTimeout(1000);

const checkInBtn = page.getByRole("button", { name: /check in/i });
console.log("check-in button visible:", await checkInBtn.isVisible());
await checkInBtn.click();
await page.getByLabel(/focusing on/i).fill("Testing the check-in flow end to end.");
await page.getByRole("button", { name: /^check in$/i }).click();
await page.waitForTimeout(1500);

// Timer pill should now be present (contains a time like 00:00:xx)
const pill = page.locator('button[title="Check out & submit report"]');
await pill.waitFor({ timeout: 5000 });
console.log("timer pill visible after check-in:", await pill.isVisible());

// Check out
await pill.click();
await page.getByLabel(/what did you get done/i).fill("Shipped the timesheet, reviewed the reminder job.");
await page.getByRole("button", { name: /submit .* check out/i }).click();
await page.waitForTimeout(1500);

const backToCheckIn = await page
  .getByRole("button", { name: /check in/i })
  .isVisible();
console.log("check-in button back after check-out:", backToCheckIn);

await browser.close();
console.log(backToCheckIn ? "PASS" : "FAIL");
