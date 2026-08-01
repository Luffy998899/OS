// Walking up to a POI and pressing E must open its panel with the caret already
// in the panel's first field — no Escape, no click.
import { chromium } from "@playwright/test";
const BASE = process.env.APP_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const fails = [];
const ok = (n, c) => { console.log(`${c ? "✓" : "✗"} ${n}`); if (!c) fails.push(n); };

await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "admin@auxa.app");
await page.fill('input[name="password"]', "auxa1234");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/workspace`);
await page.getByRole("button", { name: /ENTER THE OFFICE/i }).click();
await page.locator("canvas").first().waitFor();
await page.waitForTimeout(1800);
await page.locator("canvas").first().click();
await page.waitForTimeout(400);

// Teleport straight onto a POI using the debug hook, then aim at it so the
// engine's raycast picks it up and E fires the real interaction path.
const aimed = await page.evaluate(async () => {
  const E = window.__bw;
  if (!E?.world) return null;
  // Pick a POI whose panel hosts a text field (docs = the writing desk).
  const poi =
    E.world.pois.find((p) => p.panel === "docs") ??
    E.world.pois.find((p) => !p.adminOnly && p.panel !== "rift");
  if (!poi) return null;
  const cx = (poi.min.x + poi.max.x) / 2;
  const cy = (poi.min.y + poi.max.y) / 2;
  const cz = (poi.min.z + poi.max.z) / 2;
  // Try standing on each side of it; the engine's own raycast tells us when a
  // stance actually looks at the block, so we don't have to guess the yaw
  // convention.
  const stances = [
    { dx: 0, dz: 2.2 },
    { dx: 0, dz: -2.2 },
    { dx: 2.2, dz: 0 },
    { dx: -2.2, dz: 0 },
  ];
  for (const s of stances) {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      E.st.pos = { x: cx + s.dx, y: Math.floor(poi.min.y), z: cz + s.dz };
      E.st.vel = { x: 0, y: 0, z: 0 };
      E.yaw = yaw;
      E.pitch = Math.atan2(cy - (E.st.pos.y + 1.62), Math.hypot(s.dx, s.dz));
      await new Promise((r) => setTimeout(r, 120));
      if (E.aimed?.id) {
        return { panel: poi.panel, label: poi.label, aimedId: E.aimed.id, aimedLabel: E.aimed.label };
      }
    }
  }
  return { panel: poi.panel, label: poi.label, aimedId: null };
});
console.log("target:", JSON.stringify(aimed));
ok("engine is aiming at the POI", !!aimed?.aimedId);

const lockedBefore = await page.evaluate(() => document.pointerLockElement !== null);
console.log("pointer locked before E:", lockedBefore);

await page.keyboard.press("KeyE");
await page.waitForTimeout(900);

const lockedAfter = await page.evaluate(() => document.pointerLockElement !== null);
ok("pointer lock released on interaction", !lockedAfter);

const panelOpen = await page.locator("h2.font-display").count();
ok("interaction opened a panel", panelOpen > 0);

const focus = await page.evaluate(() => {
  const el = document.activeElement;
  return { tag: el?.tagName ?? null, type: el?.getAttribute?.("type") ?? null };
});
console.log("focused element after E:", JSON.stringify(focus));
ok("caret landed in a typeable field", focus.tag === "INPUT" || focus.tag === "TEXTAREA");

// Type blind — the whole point of the task.
await page.keyboard.type("typed without escape");
const typed = await page.evaluate(() => document.activeElement?.value ?? "");
ok("keystrokes reach the panel field", typed === "typed without escape");

console.log(fails.length === 0 ? "\nALL PASS" : `\nFAILURES: ${fails.join(" | ")}`);
await browser.close();
process.exit(fails.length === 0 ? 0 : 1);
