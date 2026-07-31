#!/usr/bin/env bash
#
# deploy.sh — set up, build, and start Auxa (Work OS CRM).
#
# Usage:
#   ./deploy.sh                 # production: install, migrate, (seed if fresh), build, start
#   ./deploy.sh dev             # development: install, migrate, (seed if fresh), next dev
#   ./deploy.sh --smoke         # setup + build + background start + health/unit tests, then stop
#
# First run (no .env yet) launches an interactive setup wizard that asks for
# your public domain, obtains a TLS certificate with certbot (automatic HTTP
# verification via nginx), and walks through the environment variables —
# required ones first, optional integrations can be skipped and configured
# later in .env.
#
# Flags (combine freely):
#   dev            run the dev server instead of a production build
#   --smoke        run health checks + unit tests against a temporary server, then exit
#   --seed         (re)seed the database with demo data (destructive)
#   --reset        reset the database (drops + re-migrates + seeds)
#   --no-install   skip dependency installation
#   --no-build     skip the production build (prod mode only)
#   --port N       port to serve on (default 3000, or $PORT)
#   --setup        (re)run the interactive setup wizard (backs up existing .env)
#   --domain D     public domain to serve on (skips the domain prompt)
#   --email E      email for Let's Encrypt registration (skips the prompt)
#   --no-tls       don't set up nginx/certbot even when a domain is given
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
DO_SETUP=0
DO_TLS=1
DOMAIN="${DOMAIN:-}"
LE_EMAIL="${LE_EMAIL:-}"
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
    --setup) DO_SETUP=1 ;;
    --no-tls) DO_TLS=0 ;;
    --domain) shift; DOMAIN="${1:-}" ;;
    --domain=*) DOMAIN="${1#*=}" ;;
    --email) shift; LE_EMAIL="${1:-}" ;;
    --email=*) LE_EMAIL="${1#*=}" ;;
    --port) shift; PORT="${1:-3000}" ;;
    --port=*) PORT="${1#*=}" ;;
    -h|--help)
      sed -n '2,29p' "$0"; exit 0 ;;
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

# sudo helper: empty when already root, "sudo" otherwise.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

gen_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32
  else
    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  fi
}

# ---- interactive setup wizard ----------------------------------------------
# ask VAR "Question" "default"  → sets $VAR (default kept on empty input)
ask() {
  local __var="$1" __q="$2" __def="${3:-}" __ans=""
  if [ -n "$__def" ]; then
    printf "  %s %s[%s]%s: " "$__q" "$DIM" "$__def" "$RESET"
  else
    printf "  %s: " "$__q"
  fi
  IFS= read -r __ans || true
  printf -v "$__var" '%s' "${__ans:-$__def}"
}

run_wizard() {
  step "Setup wizard"
  info "Press Enter to accept the [default] or to skip an optional value."
  info "Everything lands in .env — you can edit it again later."
  echo

  # --- domain + TLS ---
  if [ -z "$DOMAIN" ] && [ -t 0 ]; then
    ask DOMAIN "Public domain (e.g. crm.example.com — Enter to run on localhost only)" ""
  fi
  if [ -n "$DOMAIN" ] && [ "$DO_TLS" -eq 1 ] && [ -z "$LE_EMAIL" ] && [ -t 0 ]; then
    ask LE_EMAIL "Email for Let's Encrypt expiry notices (Enter to register without one)" ""
  fi

  # --- required settings ---
  echo
  info "Required settings"
  local W_DATABASE_URL="file:./dev.db" W_TIMEZONE="Asia/Kolkata"
  if [ -t 0 ]; then
    ask W_DATABASE_URL "Database URL (SQLite file works out of the box)" "$W_DATABASE_URL"
    ask W_TIMEZONE "App timezone" "$W_TIMEZONE"
  fi
  local W_AUTH_SECRET
  W_AUTH_SECRET="$(gen_secret)"
  info "AUTH_SECRET: generated automatically"

  local W_APP_URL
  if [ -n "$DOMAIN" ]; then
    W_APP_URL="https://${DOMAIN}"
  else
    W_APP_URL="http://localhost:${PORT}"
  fi

  # --- optional integrations (skippable, configurable later) ---
  local W_ANTHROPIC_API_KEY="" W_RESEND_API_KEY="" W_EMAIL_FROM="Auxa <noreply@auxa.local>"
  local W_TWILIO_ACCOUNT_SID="" W_TWILIO_AUTH_TOKEN="" W_TWILIO_WHATSAPP_FROM=""
  local W_WHATSAPP_VERIFY_TOKEN="auxa-verify" W_DEEPGRAM_API_KEY="" W_CRON_SECRET=""
  W_CRON_SECRET="$(gen_secret)"
  if [ -t 0 ]; then
    echo
    info "Optional integrations — Enter to skip any of these; the app runs"
    info "without them (features degrade gracefully). Configure later in .env."
    ask W_ANTHROPIC_API_KEY "Anthropic API key (AI features)" ""
    ask W_RESEND_API_KEY "Resend API key (outgoing email)" ""
    if [ -n "$W_RESEND_API_KEY" ]; then
      ask W_EMAIL_FROM "Email From address" "$W_EMAIL_FROM"
    fi
    ask W_TWILIO_ACCOUNT_SID "Twilio Account SID (WhatsApp)" ""
    if [ -n "$W_TWILIO_ACCOUNT_SID" ]; then
      ask W_TWILIO_AUTH_TOKEN "Twilio Auth Token" ""
      ask W_TWILIO_WHATSAPP_FROM "Twilio WhatsApp From (e.g. whatsapp:+14155238886)" ""
    fi
    ask W_DEEPGRAM_API_KEY "Deepgram API key (voice transcription)" ""
  fi

  # --- write .env ---
  if [ -f .env ]; then
    cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
    info "existing .env backed up"
  fi
  cat > .env <<ENV
# Generated by deploy.sh setup wizard. Safe to edit by hand.
DATABASE_URL="${W_DATABASE_URL}"
AUTH_SECRET="${W_AUTH_SECRET}"
APP_URL="${W_APP_URL}"
APP_TIMEZONE="${W_TIMEZONE}"

# Extra origins allowed to invoke Server Actions behind a proxy/tunnel
# (comma-separated). Every origin is already accepted via src/proxy.ts;
# this is a harmless extra allowance for the configured domain.
ALLOWED_ORIGINS="${DOMAIN}"

# Optional integrations — the app runs without these (features degrade gracefully).
ANTHROPIC_API_KEY="${W_ANTHROPIC_API_KEY}"
ANTHROPIC_MODEL="claude-sonnet-4-5"
RESEND_API_KEY="${W_RESEND_API_KEY}"
EMAIL_FROM="${W_EMAIL_FROM}"
TWILIO_ACCOUNT_SID="${W_TWILIO_ACCOUNT_SID}"
TWILIO_AUTH_TOKEN="${W_TWILIO_AUTH_TOKEN}"
TWILIO_WHATSAPP_FROM="${W_TWILIO_WHATSAPP_FROM}"
WHATSAPP_VERIFY_TOKEN="${W_WHATSAPP_VERIFY_TOKEN}"
DEEPGRAM_API_KEY="${W_DEEPGRAM_API_KEY}"
CRON_SECRET="${W_CRON_SECRET}"
ENV
  info "wrote .env"
}

# ---- environment ------------------------------------------------------------
step "Preparing environment (.env)"
if [ "$DO_SETUP" -eq 1 ] || { [ ! -f .env ] && { [ -t 0 ] || [ -n "$DOMAIN" ]; }; }; then
  run_wizard
elif [ ! -f .env ]; then
  # Non-interactive fallback (CI, --smoke in pipelines): copy the example and
  # generate a real signing secret.
  cp .env.example .env
  SECRET="$(gen_secret)"
  node -e "const fs=require('fs');const f='.env';let s=fs.readFileSync(f,'utf8');s=s.replace(/^AUTH_SECRET=.*$/m,'AUTH_SECRET=\"'+process.argv[1]+'\"');fs.writeFileSync(f,s);" "$SECRET"
  info "created .env with a fresh AUTH_SECRET"
else
  info ".env already present — leaving it untouched (re-run with --setup to change)"
  # Pick up a previously configured domain so TLS setup + URLs stay correct.
  if [ -z "$DOMAIN" ]; then
    APP_URL_LINE="$(grep -m1 '^APP_URL=' .env | sed -e 's/^[^=]*=//' -e 's/^"//' -e 's/"$//' || true)"
    case "$APP_URL_LINE" in
      https://*) DOMAIN="${APP_URL_LINE#https://}"; DOMAIN="${DOMAIN%%/*}" ;;
    esac
  fi
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

# ---- TLS: nginx + certbot ---------------------------------------------------
# When a domain is configured, put nginx in front of the app and obtain a
# Let's Encrypt certificate. certbot's nginx plugin answers the HTTP-01
# challenge automatically (the domain's DNS must already point at this server
# and ports 80/443 must be reachable). Renewal is automatic via the systemd
# timer/cron that the certbot package installs.
setup_tls() {
  step "Setting up TLS for ${DOMAIN} (nginx + certbot)"

  # Install nginx + certbot if missing.
  if ! command -v nginx >/dev/null 2>&1 || ! command -v certbot >/dev/null 2>&1; then
    info "installing nginx + certbot"
    if command -v apt-get >/dev/null 2>&1; then
      $SUDO apt-get update -y
      $SUDO apt-get install -y nginx certbot python3-certbot-nginx
    elif command -v dnf >/dev/null 2>&1; then
      $SUDO dnf install -y nginx certbot python3-certbot-nginx
    elif command -v yum >/dev/null 2>&1; then
      $SUDO yum install -y nginx certbot python3-certbot-nginx
    else
      die "cannot install nginx/certbot automatically (no apt/dnf/yum). Install them and re-run."
    fi
  fi

  # Reverse-proxy site: nginx terminates 80 (certbot upgrades it to 443).
  local site_conf
  if [ -d /etc/nginx/sites-available ]; then
    site_conf="/etc/nginx/sites-available/auxa.conf"
  else
    site_conf="/etc/nginx/conf.d/auxa.conf"
  fi
  $SUDO tee "$site_conf" >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;
    }
}
NGINX
  if [ -d /etc/nginx/sites-enabled ]; then
    $SUDO ln -sf "$site_conf" /etc/nginx/sites-enabled/auxa.conf
  fi
  $SUDO nginx -t
  $SUDO systemctl enable --now nginx 2>/dev/null || $SUDO nginx -s reload || $SUDO nginx
  $SUDO systemctl reload nginx 2>/dev/null || $SUDO nginx -s reload || true
  info "nginx reverse proxy configured → 127.0.0.1:${PORT}"

  # Obtain/renew the certificate. --nginx answers HTTP-01 automatically and
  # rewrites the site config for 443 + redirect.
  local email_args=(--register-unsafely-without-email)
  if [ -n "$LE_EMAIL" ]; then
    email_args=(-m "$LE_EMAIL")
  fi
  if $SUDO certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos \
      --redirect --keep-until-expiring "${email_args[@]}"; then
    info "certificate installed — auto-renewal handled by certbot's timer"
  else
    die "certbot failed. Check that ${DOMAIN} resolves to this server and ports 80/443 are open, then re-run."
  fi
}

if [ -n "$DOMAIN" ] && [ "$DO_TLS" -eq 1 ] && [ "$SMOKE" -eq 0 ]; then
  setup_tls
elif [ -n "$DOMAIN" ]; then
  info "skipping TLS setup"
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

# Prefer the configured domain; otherwise, in GitHub Codespaces the app is
# reached through a forwarded public URL, not localhost. Auto-detect it so we
# print the right address and emails/links work.
PUBLIC_URL="$BASE"
if [ -n "$DOMAIN" ]; then
  PUBLIC_URL="https://${DOMAIN}"
elif [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
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
  check "protected redirect" "${BASE}/my-work" 307
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
