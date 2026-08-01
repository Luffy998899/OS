// Renders named atlas tiles side by side, scaled up, so painted textures can be
// compared against the references they were painted from.
import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const OUT = process.env.OUT || "/tmp/shots";
const WANT = (process.env.TILES || "").split(",").filter(Boolean);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);

await page.evaluate(
  async ([tiles]) => {
    const mod = await import("/_next/static/chunks/nonexistent.js").catch(() => null);
    void mod;
  },
  [WANT],
);

// The atlas painter is bundled in the workspace chunk; easiest reliable route
// is to enter the world (which paints it) and read it back off a swatch.
await page.getByRole("button", { name: /ENTER THE OFFICE/i }).click();
await page.locator("canvas").first().waitFor();
await page.waitForTimeout(3000);
await page.keyboard.press("KeyG");
await page.waitForTimeout(500);
await page.keyboard.press("KeyE");
await page.waitForTimeout(1200);

const shot = await page.evaluate(async (want) => {
  // Every swatch in the picker is a canvas next to its label.
  const buttons = [...document.querySelectorAll("button[title]")].filter((b) =>
    b.querySelector("canvas"),
  );
  const pick = buttons.filter((b) => want.includes(b.getAttribute("title")));
  const chosen = pick.length ? pick : buttons.slice(0, 10);
  const SCALE = 5;
  const CELL = 32 * SCALE;
  const PAD = 26;
  const cols = Math.min(chosen.length, 5);
  const rows = Math.ceil(chosen.length / cols);
  const out = document.createElement("canvas");
  out.width = cols * (CELL + PAD);
  out.height = rows * (CELL + PAD + 22);
  const ctx = out.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#15171b";
  ctx.fillRect(0, 0, out.width, out.height);
  chosen.forEach((b, i) => {
    const cx = (i % cols) * (CELL + PAD) + PAD / 2;
    const cy = Math.floor(i / cols) * (CELL + PAD + 22) + PAD / 2;
    ctx.drawImage(b.querySelector("canvas"), cx, cy, CELL, CELL);
    ctx.fillStyle = "#e8eaee";
    ctx.font = "13px monospace";
    ctx.textAlign = "center";
    ctx.fillText(b.getAttribute("title"), cx + CELL / 2, cy + CELL + 16);
  });
  return out.toDataURL("image/png");
}, WANT);

const fs = await import("node:fs");
fs.writeFileSync(`${OUT}/tiles.png`, Buffer.from(shot.split(",")[1], "base64"));
console.log("wrote", `${OUT}/tiles.png`);
await browser.close();
