import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { getAppUrl, codespacesHost } from "./app-url";

// getAppUrl reads process.env; snapshot and restore the keys we touch.
const KEYS = [
  "APP_URL",
  "PORT",
  "CODESPACE_NAME",
  "GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN",
  "VERCEL_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("getAppUrl", () => {
  it("defaults to localhost when nothing is configured", () => {
    expect(getAppUrl()).toBe("http://localhost:3000");
  });

  it("honours an explicit non-localhost APP_URL and trims trailing slashes", () => {
    process.env.APP_URL = "https://auxa.example.com/";
    expect(getAppUrl()).toBe("https://auxa.example.com");
  });

  it("auto-detects the GitHub Codespaces public URL over a localhost APP_URL", () => {
    process.env.APP_URL = "http://localhost:3000";
    process.env.CODESPACE_NAME = "fantastic-orbit-abc123";
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";
    expect(getAppUrl()).toBe(
      "https://fantastic-orbit-abc123-3000.app.github.dev",
    );
  });

  it("uses PORT for the forwarded Codespaces host", () => {
    process.env.PORT = "8080";
    process.env.CODESPACE_NAME = "space";
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";
    expect(codespacesHost()).toBe("space-8080.app.github.dev");
    expect(getAppUrl()).toBe("https://space-8080.app.github.dev");
  });

  it("prefers an explicit non-localhost APP_URL even inside Codespaces", () => {
    process.env.APP_URL = "https://auxa.example.com";
    process.env.CODESPACE_NAME = "space";
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN = "app.github.dev";
    expect(getAppUrl()).toBe("https://auxa.example.com");
  });

  it("falls back to the Vercel production URL", () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "auxa.vercel.app";
    expect(getAppUrl()).toBe("https://auxa.vercel.app");
  });

  it("returns null host when not in Codespaces", () => {
    expect(codespacesHost()).toBeNull();
  });
});
