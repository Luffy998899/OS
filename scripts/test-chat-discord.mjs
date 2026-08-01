// Discord-parity checks: channel creation, space creation, space settings and
// a real two-browser voice call (fake mic/speaker devices, so WebRTC actually
// negotiates and we can assert the audio track arrives).
import { chromium } from "@playwright/test";

const BASE = process.env.APP_URL || "http://localhost:3000";
const EXE = process.env.CHROMIUM || undefined;
const fails = [];
const ok = (n, c) => {
  console.log(`${c ? "✓" : "✗"} ${n}`);
  if (!c) fails.push(n);
};

// Fake devices let getUserMedia resolve headlessly with a real audio track.
const launch = () =>
  chromium.launch({
    executablePath: EXE,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

async function signIn(page, email) {
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', "auxa1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/workspace`);
  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
}

const browser = await launch();
const ctxA = await browser.newContext({ permissions: ["microphone"] });
const a = await ctxA.newPage();
await signIn(a, "admin@auxa.app");

// ---------------------------------------------------------------------------
// Channel creation
// ---------------------------------------------------------------------------
const stamp = Date.now().toString().slice(-5);
const chanName = `qa text ${stamp}`;
const chanSlug = `qa-text-${stamp}`;

await a.locator('button[aria-label="Create channel"]').click();
await a.getByLabel("Name").fill(chanName);
await a.getByRole("button", { name: "Create channel" }).click();
await a.waitForTimeout(1500);
ok("text channel created and listed", (await a.getByRole("button", { name: chanSlug }).count()) > 0);

// The new channel should be selected and typeable straight away.
await a.waitForTimeout(400);
const placeholderNow = await a.locator("textarea").first().getAttribute("placeholder");
ok("new channel is selected for typing", placeholderNow === `Message #${chanSlug}`);

// ---------------------------------------------------------------------------
// Voice channel creation
// ---------------------------------------------------------------------------
const voiceName = `qa voice ${stamp}`;
const voiceSlug = `qa-voice-${stamp}`;
await a.locator('button[aria-label="Create channel"]').click();
await a.getByRole("button", { name: /^Voice/ }).click();
await a.getByLabel("Name").fill(voiceName);
await a.getByRole("button", { name: "Create channel" }).click();
await a.waitForTimeout(1500);
ok("voice channel created", (await a.getByRole("button", { name: voiceSlug }).count()) > 0);

// ---------------------------------------------------------------------------
// Space creation + settings
// ---------------------------------------------------------------------------
const spaceName = `QA Space ${stamp}`;
await a.locator('button[aria-label="Create a space"]').click();
await a.getByLabel("Space name").fill(spaceName);
await a.getByRole("button", { name: "Create space" }).click();
await a.waitForTimeout(1600);
ok("space created and opened", (await a.getByText(spaceName).count()) > 0);
ok("new space opens with #general", (await a.getByRole("button", { name: "general" }).count()) > 0);

await a.locator('button[aria-label="Space settings"]').click();
await a.waitForTimeout(700);
ok("space settings opens", (await a.getByText(/settings$/).count()) > 0);
ok("settings lists channels", (await a.getByRole("button", { name: "Rename" }).count()) > 0);
ok(
  "a user-made space can be deleted",
  (await a.getByRole("button", { name: /Delete this space/ }).count()) > 0,
);
// Rename the space.
await a.getByLabel("Space name").fill(`${spaceName} Renamed`);
await a.getByRole("button", { name: "Save changes" }).click();
await a.waitForTimeout(1400);
ok("space renamed", (await a.getByText(`${spaceName} Renamed`).count()) > 0);
// Delete it again so the run leaves nothing behind.
await a.getByRole("button", { name: /Delete this space/ }).click();
await a.getByRole("button", { name: /Delete .* permanently/ }).click();
await a.waitForTimeout(1600);
ok("space deleted", (await a.getByText(`${spaceName} Renamed`).count()) === 0);

// Built-in spaces must not offer deletion.
await a.locator("div.w-14 button").nth(2).click();
await a.waitForTimeout(600);
await a.locator('button[aria-label="Space settings"]').click();
await a.waitForTimeout(600);
ok(
  "built-in space cannot be deleted",
  (await a.getByText(/Built-in spaces can be renamed but not deleted/).count()) > 0,
);
await a.keyboard.press("Escape");
await a.waitForTimeout(400);

// ---------------------------------------------------------------------------
// Two-party voice call
// ---------------------------------------------------------------------------
const ctxB = await browser.newContext({ permissions: ["microphone"] });
const b = await ctxB.newPage();
await signIn(b, "dustin@auxa.app");

// Back to the first space — that's where the QA voice channel lives. The rail
// is [DM home, Auxa HQ, Clients, +], so index 1 is the first real space.
await a.locator("div.w-14 button").nth(1).click();
await a.waitForTimeout(800);

// A joins the voice channel.
await a.getByRole("button", { name: voiceSlug }).click();
await a.waitForTimeout(2500);
ok("A shows voice connected", (await a.getByText("Voice connected").count()) > 0);

// B joins the same one.
await b.getByRole("button", { name: voiceSlug }).click();
await b.waitForTimeout(2500);
ok("B shows voice connected", (await b.getByText("Voice connected").count()) > 0);

// Give the mesh time to negotiate through the tRPC mailbox.
await a.waitForTimeout(7000);

const peerState = async (page) =>
  page.evaluate(async () => {
    const els = [...document.querySelectorAll("audio[data-voice-peer]")];
    const withStream = els.filter((e) => e.srcObject && e.srcObject.getAudioTracks().length > 0);
    return { audioEls: els.length, live: withStream.length };
  });
const sa = await peerState(a);
const sb = await peerState(b);
console.log("A audio elements:", JSON.stringify(sa), " B:", JSON.stringify(sb));
ok("A received B's audio track", sa.live > 0);
ok("B received A's audio track", sb.live > 0);

// Each side should see the other listed under the channel. Scope to the
// channel list — "Admin" also appears in the top navigation.
const roster = (page) => page.locator("div.w-52");
ok("A sees B in the voice channel", (await roster(a).getByText("Dustin Henderson").count()) > 0);
ok("B sees A in the voice channel", (await roster(b).getByText("Admin").count()) > 0);

// Mute propagates to the other side's roster.
await a.locator('button[aria-label="Mute"]').click();
await a.waitForTimeout(5000);
const mutedIcons = await b.locator("svg.lucide-mic-off").count();
ok("B sees A muted", mutedIcons > 0);

// Disconnect clears both the dock and the other side's roster.
await a.locator('button[aria-label="Disconnect from voice"]').click();
await a.waitForTimeout(1200);
ok("A disconnected", (await a.getByText("Voice connected").count()) === 0);
await b.waitForTimeout(9000);
ok("B no longer sees A in voice", (await roster(b).getByText("Admin").count()) === 0);

await b.locator('button[aria-label="Disconnect from voice"]').click();
await a.waitForTimeout(500);

console.log(fails.length === 0 ? "\nALL PASS" : `\nFAILURES: ${fails.join(" | ")}`);
await browser.close();
process.exit(fails.length === 0 ? 0 : 1);
