import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const routes = process.argv.slice(2);
const paths = routes.length ? routes : ["/dashboard", "/my-work"];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const msgs = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    msgs.push(`[${m.type()}] ${m.text()}`);
});
page.on("pageerror", (e) => msgs.push(`[pageerror] ${e.message}`));

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);

for (const p of paths) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
}

await browser.close();
console.log(msgs.length ? msgs.join("\n") : "NO CONSOLE ERRORS/WARNINGS");
