import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const fails = [];
const ok = (name, cond) => {
  console.log(`${cond ? "✓" : "✗"} ${name}`);
  if (!cond) fails.push(name);
};

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);

// --- Enter the 3D office ---
await page.getByRole("button", { name: /ENTER THE OFFICE/i }).click();
await page.locator("canvas").first().waitFor();
await page.waitForTimeout(1500);

// Capture the mouse like a player would.
await page.locator("canvas").first().click();
await page.waitForTimeout(400);
const lockedBefore = await page.evaluate(() => document.pointerLockElement !== null);
console.log("pointer locked after click:", lockedBefore);

// --- Press C: chat must open AND typing must land in the input immediately ---
await page.keyboard.press("KeyC");
await page.waitForTimeout(600);
const lockedAfter = await page.evaluate(() => document.pointerLockElement !== null);
ok("pointer lock released when chat opens", !lockedAfter);

const textarea = page.locator("textarea");
await textarea.first().waitFor({ timeout: 5000 });
await page.waitForTimeout(700); // autofocus tick
const focused = await page.evaluate(() => document.activeElement?.tagName === "TEXTAREA");
ok("chat input focused without pressing Escape", focused);

// Type WITHOUT clicking anything — this is the whole point.
await page.keyboard.type("hello from the office");
const value = await textarea.first().inputValue();
ok("keystrokes go straight into the chat input", value === "hello from the office");

// Enter sends it.
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
const sent = await page.getByText("hello from the office").count();
ok("message sent with Enter", sent > 0);

// --- Discord bits: DM home in rail, member toggle, date divider ---
ok("date divider shows Today", (await page.getByText("Today", { exact: true }).count()) > 0);
const dmBtn = page.locator('button[title="Direct messages"]');
ok("DM home button exists in rail", (await dmBtn.count()) > 0);
await dmBtn.click();
await page.waitForTimeout(400);
ok("DM pane lists teammates", (await page.getByText("Direct Messages").count()) > 0);

// Open a DM with the first teammate and send a line.
const teammate = page.locator('div.w-52 button:has(span.relative)').first();
const teammateCount = await teammate.count();
if (teammateCount > 0) {
  await teammate.click();
  await page.waitForTimeout(900);
  await page.keyboard.type("dm test line");
  const dmVal = await textarea.first().inputValue();
  ok("DM input focused and typeable", dmVal === "dm test line");
  await page.keyboard.press("Enter");
  await page
    .getByText("dm test line")
    .first()
    .waitFor({ timeout: 8000 })
    .catch(() => {});
  ok("DM message visible", (await page.getByText("dm test line").count()) > 0);
} else {
  console.log("(no teammates seeded — skipping DM send)");
}

// Member sidebar toggle on a server pane.
await page.locator('div.w-14 button').nth(2).click(); // first server after DM home + divider
await page.waitForTimeout(400);
const membersToggle = page.locator('button[aria-label="Toggle member list"]');
ok("member list toggle exists", (await membersToggle.count()) > 0);
await membersToggle.click();
await page.waitForTimeout(400);
ok("member list opens with presence buckets", (await page.getByText(/online — \d/i).count()) > 0);

// --- Escape closes chat and returns to the game ---
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
ok("Escape closes the chat overlay", (await page.locator("textarea").count()) === 0);

// --- E-interaction: walk up to a POI is hard blind; instead open via hotbar to
// confirm generic autofocus targets panels' first field (docs has inputs). ---
console.log(fails.length === 0 ? "\nALL PASS" : `\nFAILURES: ${fails.join(" | ")}`);
await browser.close();
process.exit(fails.length === 0 ? 0 : 1);
