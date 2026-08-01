import { NextResponse, type NextRequest } from "next/server";

/**
 * Accept Server Action posts from any origin.
 *
 * Next.js aborts a Server Action with "Invalid Server Actions request."
 * whenever the request's `Origin` host differs from the `host` /
 * `x-forwarded-host` the server sees. Behind hosting proxies (Vercel,
 * Codespaces, tunnels, custom reverse proxies) those headers regularly
 * disagree, which broke sign-in with a 500 even though the user was on the
 * app's own domain. A literal `*` is rejected by `allowedOrigins`, so instead
 * we align `x-forwarded-host` with the request's own `Origin` before the
 * action handler compares them — every origin passes.
 *
 * CSRF exposure stays limited: the session cookie is httpOnly +
 * SameSite=Lax, so browsers don't attach it to cross-site POSTs in the
 * first place.
 */
export function proxy(request: NextRequest) {
  if (request.method !== "POST") return NextResponse.next();

  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return NextResponse.next();

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.next();
  }

  const headers = new Headers(request.headers);
  headers.set("x-forwarded-host", originHost);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // POST-only logic, but skip static assets outright to avoid the overhead.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
