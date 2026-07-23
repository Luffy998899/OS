// Dev screenshot utility. Logs in and captures pages at desktop + mobile widths.
// Usage: node scripts/shoot.mjs [email] [password] [route1 route2 ...]
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const BASE = process.env.APP_URL || "http://localhost:3000";
const email = process.argv[2] || "admin@auxa.app";
const password = process.argv[3] || "auxa1234";
const routes = process.argv.slice(4);
const paths = routes.length ? routes : ["/dashboard"];

const OUT = "screenshots";
await mkdir(OUT, { recursive: true });

const slug = (p) =>
  p === "/" ? "root" : p.replace(/^\//, "").replace(/[\/?=&]/g, "_");

const browser = await chromium.launch();

async function shoot(viewport, tag) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  // Sign in
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/sign-in-${tag}.png`, fullPage: true });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(800);

  for (const p of paths) {
    await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    await page.screenshot({
      path: `${OUT}/${slug(p)}-${tag}.png`,
      fullPage: true,
    });
    console.log(`shot ${p} @ ${tag}`);
  }
  await context.close();
}

await shoot({ width: 1440, height: 900 }, "desktop");
await shoot({ width: 390, height: 844 }, "mobile");

await browser.close();
console.log("done");
