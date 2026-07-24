import type { NextConfig } from "next";

const port = process.env.PORT ?? "3000";

// Origins allowed to invoke Server Actions when the request is forwarded by a
// proxy/tunnel (GitHub Codespaces, Gitpod, ngrok, Cloudflare, or VS Code
// port-forwarding to localhost). Next.js compares the request's `Origin` host
// against this list whenever it differs from the forwarded host, so we include
// both the local origins and the common tunnel domains. Add your own with the
// ALLOWED_ORIGINS env var (comma-separated), e.g. "myapp.example.com".
// The exact public host GitHub Codespaces forwards this port to, if any. The
// `*.app.github.dev` wildcard below already covers it, but adding the concrete
// host keeps Server Actions working even if the wildcard match ever changes.
const codespaceName = process.env.CODESPACE_NAME;
const codespaceDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const codespaceOrigin =
  codespaceName && codespaceDomain
    ? `${codespaceName}-${port}.${codespaceDomain}`
    : null;

const allowedOrigins = [
  `localhost:${port}`,
  "localhost:3000",
  `127.0.0.1:${port}`,
  "127.0.0.1:3000",
  "*.app.github.dev", // GitHub Codespaces
  "*.githubpreview.dev", // legacy Codespaces
  "*.gitpod.io",
  "*.ngrok-free.app",
  "*.ngrok.io",
  "*.trycloudflare.com",
  ...(codespaceOrigin ? [codespaceOrigin] : []),
  ...(process.env.ALLOWED_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? []),
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
};

export default nextConfig;
