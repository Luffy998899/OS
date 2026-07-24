/**
 * Resolves the app's public base URL (never a trailing slash).
 *
 * The important case is GitHub Codespaces / cloud IDEs: the server runs on
 * `localhost:3000` internally, but the browser (and anyone who receives an
 * email link) reaches it through a forwarded public URL like
 * `https://<name>-3000.app.github.dev`. If we naively used `localhost`, every
 * link we put in an email (or the WhatsApp webhook URL) would be dead for the
 * recipient. So we auto-detect the public address.
 *
 * Priority:
 *  1. An explicit, non-localhost `APP_URL` — you set it, we trust it.
 *  2. GitHub Codespaces — built from the injected `CODESPACE_NAME` +
 *     `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN` (+ `PORT`).
 *  3. Vercel — `VERCEL_PROJECT_PRODUCTION_URL` / `VERCEL_URL`.
 *  4. Fallback — whatever `APP_URL` was (localhost) or `http://localhost:3000`.
 *
 * These env vars only exist on the server; in the browser callers should prefer
 * relative URLs (this returns the localhost fallback there).
 */

const DEFAULT_URL = "http://localhost:3000";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isLocalhost(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?\/?$/i.test(
    url.trim(),
  );
}

/**
 * The public host GitHub Codespaces forwards a given port to, or `null` when
 * not running inside Codespaces. Format:
 * `<CODESPACE_NAME>-<port>.<GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN>`.
 */
export function codespacesHost(port = process.env.PORT?.trim() || "3000"):
  | string
  | null {
  const name = process.env.CODESPACE_NAME?.trim();
  const domain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?.trim();
  if (!name || !domain) return null;
  return `${name}-${port}.${domain}`;
}

export function getAppUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit && !isLocalhost(explicit)) {
    return stripTrailingSlash(explicit);
  }

  const cs = codespacesHost();
  if (cs) return `https://${cs}`;

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;

  return stripTrailingSlash(explicit || DEFAULT_URL);
}
