import type { NextConfig } from "next";

const port = process.env.PORT ?? "3000";

// Origins allowed to invoke Server Actions when the request is forwarded by a
// proxy/tunnel (Vercel, GitHub Codespaces, Gitpod, ngrok, Cloudflare, or VS
// Code port-forwarding to localhost). Next.js compares the request's `Origin`
// host against this list whenever it differs from the forwarded host.
//
// Note: `src/proxy.ts` already aligns `x-forwarded-host` with the request's
// `Origin` so Server Actions accept every origin; this list is kept as a
// second line of defense in case the proxy is bypassed or removed. Add your
// own with the ALLOWED_ORIGINS env var (comma-separated),
// e.g. "myapp.example.com".
// The exact public host GitHub Codespaces forwards this port to, if any. The
// `*.app.github.dev` wildcard below already covers it, but adding the concrete
// host keeps Server Actions working even if the wildcard match ever changes.
const codespaceName = process.env.CODESPACE_NAME;
const codespaceDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const codespaceOrigin =
  codespaceName && codespaceDomain
    ? `${codespaceName}-${port}.${codespaceDomain}`
    : null;

// Hosts Vercel serves this deployment on (deployment URL, branch alias,
// production domain), so sign-in works no matter which alias is visited.
const vercelOrigins = [
  process.env.VERCEL_URL,
  process.env.VERCEL_BRANCH_URL,
  process.env.VERCEL_PROJECT_PRODUCTION_URL,
].filter((s): s is string => Boolean(s));

// The custom domain configured via APP_URL (set by deploy.sh), if any.
const appUrlHost = (() => {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
  } catch {
    return null;
  }
})();

const allowedOrigins = [
  `localhost:${port}`,
  "localhost:3000",
  `127.0.0.1:${port}`,
  "127.0.0.1:3000",
  "*.vercel.app", // Vercel preview + default production domains
  "*.app.github.dev", // GitHub Codespaces
  "*.githubpreview.dev", // legacy Codespaces
  "*.gitpod.io",
  "*.ngrok-free.app",
  "*.ngrok.io",
  "*.trycloudflare.com",
  ...vercelOrigins,
  ...(appUrlHost ? [appUrlHost] : []),
  ...(codespaceOrigin ? [codespaceOrigin] : []),
  ...(process.env.ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? []),
];

const nextConfig: NextConfig = {
  // `next dev` blocks cross-origin asset/HMR requests unless the dev origin is
  // listed; mirror the proxy/tunnel domains so dev also works behind them.
  allowedDevOrigins: allowedOrigins,
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;
