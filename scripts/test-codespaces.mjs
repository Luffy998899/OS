// Reproduces the Codespaces/proxy Server Actions CSRF error by injecting a
// mismatched x-forwarded-host, then checks whether sign-in (a Server Action)
// succeeds. PASS = reached the dashboard.
import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const FWD = process.env.FWD_HOST || "fantastic-orbit-7v7vwvv7vqgq3g7q-3000.app.github.dev";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  extraHTTPHeaders: { "x-forwarded-host": FWD },
});
const page = await ctx.newPage();

let aborted = false;
page.on("console", (m) => {
  if (/Invalid Server Actions request|does not match/i.test(m.text()))
    aborted = true;
});

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');

const reached = await page
  .waitForURL(`${BASE}/workspace`, { timeout: 8000 })
  .then(() => true)
  .catch(() => false);

console.log(`x-forwarded-host: ${FWD}`);
console.log(`reached dashboard: ${reached}`);
await browser.close();
console.log(reached ? "PASS (server action accepted)" : "FAIL (server action blocked)");
process.exit(reached ? 0 : 1);
