import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const ys = [];
page.on("request", (r) => {
  if (r.url().includes("workspace.move") && r.method() === "POST") {
    try {
      const d = r.postData();
      const m = d && d.match(/"y":\s*(-?\d+)/g);
      if (m) m.forEach((s) => ys.push(Number(s.replace(/[^0-9-]/g, ""))));
    } catch {}
  }
});

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);
await page.goto(`${BASE}/workspace`, { waitUntil: "networkidle" });
await page.locator("canvas").waitFor();
await page.waitForTimeout(1000);

// Spawn is common-board (~y366). Walk UP through the top doorway into the corridor.
await page.keyboard.down("ArrowUp");
await page.waitForTimeout(2600);
await page.keyboard.up("ArrowUp");
await page.waitForTimeout(400);

const minY = ys.length ? Math.min(...ys) : null;
console.log("recorded y samples:", ys.join(","));
console.log("min y reached:", minY);
// common-board top wall ~ y259 (rect.y 268 - wall 9). Passing the doorway means y < 250.
console.log(minY !== null && minY < 250 ? "PASS: walked through the doorway" : "CHECK: may be blocked");

await browser.close();
