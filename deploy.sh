#!/usr/bin/env bash
#
# deploy.sh — set up, build, and start Auxa (Work OS CRM).
#
# Usage:
#   ./deploy.sh                 # production: install, migrate, (seed if fresh), build, start
#   ./deploy.sh dev             # development: install, migrate, (seed if fresh), next dev
#   ./deploy.sh --smoke         # setup + build + background start + health/unit tests, then stop
#
# Flags (combine freely):
#   dev            run the dev server instead of a production build
#   --smoke        run health checks + unit tests against a temporary server, then exit
#   --seed         (re)seed the database with demo data (destructive)
#   --reset        reset the database (drops + re-migrates + seeds)
#   --no-install   skip dependency installation
#   --no-build     skip the production build (prod mode only)
#   --port N       port to serve on (default 3000, or $PORT)
#
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ---- parse args -------------------------------------------------------------
MODE="prod"
SMOKE=0
DO_SEED=0
DO_RESET=0
DO_INSTALL=1
DO_BUILD=1
PORT="${PORT:-3000}"

while [ $# -gt 0 ]; do
  case "$1" in
    dev|development) MODE="dev" ;;
    prod|production) MODE="prod" ;;
    --smoke) SMOKE=1 ;;
    --seed) DO_SEED=1 ;;
    --reset) DO_RESET=1 ;;
    --no-install) DO_INSTALL=0 ;;
    --no-build) DO_BUILD=0 ;;
    --port) shift; PORT="${1:-3000}" ;;
    --port=*) PORT="${1#*=}" ;;
    -h|--help)
      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

# ---- pretty logging ---------------------------------------------------------
BOLD="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"; RESET="$(printf '\033[0m')"
step() { echo; echo "${BOLD}▶ $*${RESET}"; }
info() { echo "  ${DIM}$*${RESET}"; }
die()  { echo "${BOLD}✗ $*${RESET}" >&2; exit 1; }

# ---- prerequisites ----------------------------------------------------------
step "Checking prerequisites"
command -v node >/dev/null 2>&1 || die "node is required"
info "node $(node --version)"

if command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
elif command -v npm >/dev/null 2>&1; then
  PM="npm"
else
  die "pnpm or npm is required"
fi
info "package manager: $PM"

# ---- environment ------------------------------------------------------------
step "Preparing environment (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  # Generate a real signing secret.
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -base64 32)"
  else
    SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
  fi
  # Replace the AUTH_SECRET line (portable sed).
  node -e "const fs=require('fs');const f='.env';let s=fs.readFileSync(f,'utf8');s=s.replace(/^AUTH_SECRET=.*$/m,'AUTH_SECRET=\"'+process.argv[1]+'\"');fs.writeFileSync(f,s);" "$SECRET"
  info "created .env with a fresh AUTH_SECRET"
else
  info ".env already present — leaving it untouched"
fi

# ---- dependencies -----------------------------------------------------------
if [ "$DO_INSTALL" -eq 1 ]; then
  step "Installing dependencies"
  if [ "$PM" = "pnpm" ]; then pnpm install; else npm install; fi
else
  info "skipping install (--no-install)"
fi

# ---- database ---------------------------------------------------------------
step "Setting up the database"
DB_FILE="prisma/dev.db"
FRESH=0
[ -f "$DB_FILE" ] || FRESH=1

npx prisma generate >/dev/null
info "prisma client generated"

if [ "$DO_RESET" -eq 1 ]; then
  info "resetting database (--reset)"
  npx prisma migrate reset --force  # runs migrations + seed
elif [ -d prisma/migrations ] && [ -n "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
  info "migrations applied"
else
  npx prisma db push
  info "schema pushed"
fi

# Seed on first setup, or when explicitly requested (reset already seeds).
if [ "$DO_RESET" -eq 0 ] && { [ "$FRESH" -eq 1 ] || [ "$DO_SEED" -eq 1 ]; }; then
  step "Seeding demo data"
  $PM run db:seed
fi

# ---- build (prod) -----------------------------------------------------------
if [ "$MODE" = "prod" ] && [ "$DO_BUILD" -eq 1 ]; then
  step "Building for production"
  $PM run build
fi

# ---- server command ---------------------------------------------------------
if [ "$MODE" = "dev" ]; then
  SERVER_CMD=(npx next dev -p "$PORT")
else
  SERVER_CMD=(npx next start -p "$PORT")
fi

BASE="http://localhost:${PORT}"

# In GitHub Codespaces the app is reached through a forwarded public URL, not
# localhost. Auto-detect it so we print the right address and emails/links work.
PUBLIC_URL="$BASE"
if [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
  PUBLIC_URL="https://${CODESPACE_NAME}-${PORT}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  info "Codespaces detected — public URL: ${PUBLIC_URL}"
  info "Make port ${PORT} 'Public' (Ports tab) so email links open for recipients."
fi

wait_for_ready() {
  info "waiting for ${BASE} to respond…"
  for _ in $(seq 1 60); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE}/sign-in" 2>/dev/null || true)"
    if [ "$code" = "200" ]; then return 0; fi
    sleep 1
  done
  return 1
}

print_ready() {
  echo
  echo "${BOLD}Auxa is running${RESET} at ${BOLD}${PUBLIC_URL}${RESET}"
  if [ "$PUBLIC_URL" != "$BASE" ]; then
    echo "  ${DIM}(locally: ${BASE})${RESET}"
  fi
  echo "  Sign in as the owner (password: auxa1234):"
  echo "    admin@auxa.app"
  echo "  Then create your team, clients, services and tasks from the app."
}

# ---- smoke test mode --------------------------------------------------------
if [ "$SMOKE" -eq 1 ]; then
  step "Smoke test: starting a temporary server"
  # Own process group so we can tear the whole tree down.
  setsid "${SERVER_CMD[@]}" >/tmp/auxa-smoke.log 2>&1 &
  SERVER_PID=$!
  SERVER_PGID="$(ps -o pgid= "$SERVER_PID" | tr -d ' ' || echo "$SERVER_PID")"
  cleanup() { kill -TERM "-${SERVER_PGID}" 2>/dev/null || kill "$SERVER_PID" 2>/dev/null || true; }
  trap cleanup EXIT

  if ! wait_for_ready; then
    echo "--- server log ---"; tail -n 40 /tmp/auxa-smoke.log
    die "server did not become ready"
  fi

  FAIL=0
  check() { # name url expected
    code="$(curl -s -o /dev/null -w '%{http_code}' "$2" 2>/dev/null || true)"
    if [ "$code" = "$3" ]; then echo "  ✓ $1 ($code)"; else echo "  ✗ $1 (got $code, want $3)"; FAIL=1; fi
  }

  step "Smoke test: HTTP checks"
  check "sign-in page" "${BASE}/sign-in" 200
  check "tRPC health" "${BASE}/api/trpc/health?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D" 200
  check "protected redirect" "${BASE}/dashboard" 307
  VERIFY_TOKEN="$(grep -m1 '^WHATSAPP_VERIFY_TOKEN' .env | sed -e 's/^[^=]*=//' -e 's/^"//' -e 's/"$//')"
  check "whatsapp webhook verify" "${BASE}/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=ok" 200

  step "Smoke test: unit tests"
  if $PM test >/tmp/auxa-tests.log 2>&1; then
    echo "  ✓ unit tests passed"
    grep -E "Test Files|Tests " /tmp/auxa-tests.log | sed 's/^/    /' || true
  else
    echo "  ✗ unit tests failed"; tail -n 30 /tmp/auxa-tests.log; FAIL=1
  fi

  echo
  if [ "$FAIL" -eq 0 ]; then
    echo "${BOLD}✓ Smoke test passed${RESET}"
  else
    die "Smoke test failed"
  fi
  exit 0
fi

# ---- foreground start -------------------------------------------------------
step "Starting Auxa (${MODE}) on port ${PORT}"
print_ready
echo
exec "${SERVER_CMD[@]}"
