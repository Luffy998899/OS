# Auxa — Work OS CRM

Auxa is a **Work OS CRM** for small studios and teams. It opens straight to a
**Sign In** screen (no public sign‑up — the admin creates accounts), then puts the
whole team on one floor: missions instead of tickets, an AI senior manager that
routes work, whiteboards for every idea, attendance with end‑of‑day reports, a
CRM pipeline, and a gamified virtual office with points, rewards, and a
leaderboard.

The UI is a deliberate **monochrome ink‑on‑paper** system (inspired by the Ryven
reference), not a generic dashboard template.

---

## Features

- **Sign in only** — bcrypt + JWT sessions, RBAC (Admin / Manager / Employee +
  custom roles). No public registration.
- **Dashboard** — personal missions, standing/rank, due‑soon, and an admin
  "Floor overview" (on‑shift, reports today, pending reviews, work‑by‑status,
  top performers).
- **My Work** — kanban board + list of your missions, quick status moves, detail
  sheet with comments. Completing a mission awards points.
- **Attendance** — start‑shift check‑in with a live timer; **check‑out requires a
  day report**. A **5:55 PM IST** email reminder nudges anyone still checked in
  without a report (Resend + in‑app notification, degrades gracefully).
- **Timesheet** — hours worked / invoiced / not‑invoiced, entries table, and
  attendance history.
- **Clients (CRM)** — pipeline with hot/warm/cold status, account managers,
  outreach logging, and per‑client missions.
- **Assign & Plan (AI‑assisted)** — describe work in plain language; the AI
  drafts missions and routes each to the best‑fit teammate. **Nothing is assigned
  until the owner approves it** in the review queue.
- **Reports & Workload** — throughput, distribution by vertical/status, and a
  per‑member workload table.
- **Documents & Whiteboards** — Miro‑like [tldraw](https://tldraw.dev) canvases
  and docs with **private / team / public** visibility and server‑side autosave.
- **Settings + WhatsApp** — message a task from WhatsApp → AI drafts it → it lands
  in the owner's review queue. Includes a webhook (Meta/Twilio) and an in‑app
  simulator so you can try the flow without credentials.
- **Gamified Workspace** — a virtual office floor plan by department, avatars with
  presence, click‑to‑enter rooms, an AI "floor manager" (memory of the day), and
  per‑room missions.
- **Leaderboard & Rewards** — ranked by points; redeem points for rewards.

## The 5 work verticals & the rooms

Missions are classified into: **Website dev · Digital marketing · Roadmap & team ·
Client outreach · Billing & data**. The virtual office has seven rooms:
Developer, Creative, Video Editing, Managing Heads, Common Board, Client, and
Creativity. (The brief flagged "Creative" vs "Creativity" as possible duplicates —
they are kept distinct here: **Creative Room** is the design/marketing team's
space, **Creativity Room** is a shared ideation/brainstorming lounge open to
everyone.)

---

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind v4 + shadcn/ui (Base UI primitives), Space Grotesk / IBM Plex Sans / IBM Plex Mono |
| API | tRPC v11 (end‑to‑end typesafe) + TanStack Query, Zustand for light client state |
| Data | Prisma + **SQLite** for zero‑setup local dev (schema kept Postgres‑portable) |
| Auth | `bcryptjs` + `jose` JWT sessions (credentials, admin‑created users) |
| Whiteboard | tldraw with server‑side snapshot persistence |
| AI | Claude (Anthropic Messages API) with a deterministic keyword‑routing fallback |
| Email | Resend (report reminders) with graceful no‑op fallback |
| WhatsApp | Meta / Twilio webhook → AI draft → owner review |
| Jobs | Cron endpoint + `vercel.json` cron (5:55 PM IST = 12:25 UTC) |

> **Why SQLite for dev?** It runs anywhere with no server. The schema avoids
> enums and scalar lists so switching `provider` to `postgresql` (and adding
> pgvector for `DailyJournal.embedding`) is a drop‑in change for production.

---

## Quickstart

```bash
pnpm install
cp .env.example .env        # then set AUTH_SECRET (openssl rand -base64 32)
pnpm db:migrate             # create the SQLite db
pnpm db:seed                # load demo data
pnpm dev                    # http://localhost:3000
```

### Demo logins (password `auxa1234`)

| Email | Role |
| --- | --- |
| `admin@auxa.app` | Admin / owner (full access) |
| `manager@auxa.app` | Manager (assign, review, reports) |
| `rohan@auxa.app` | Employee |

### Scripts

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm typecheck` — `tsc --noEmit`
- `pnpm test` — Vitest unit tests
- `pnpm db:migrate` / `db:seed` / `db:studio` / `db:reset`

End‑to‑end checks used during development live in `scripts/` (Playwright), e.g.
`node scripts/shoot.mjs <email> <password> /dashboard` captures screenshots.

---

## Optional integrations

Everything runs without these — features degrade gracefully and the UI shows an
"offline / simulation" state.

| Env var | Enables |
| --- | --- |
| `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`) | Claude for Assign & Plan / WhatsApp parsing (else keyword routing) |
| `RESEND_API_KEY`, `EMAIL_FROM` | Real report‑reminder emails |
| `TWILIO_*` / WhatsApp Cloud API + `WHATSAPP_VERIFY_TOKEN` | Inbound WhatsApp task intake |
| `DEEPGRAM_API_KEY` | (Reserved) voice‑to‑task |
| `CRON_SECRET` | Protects the reminder cron endpoint |

**Report reminder** is scheduled via `vercel.json` (`25 12 * * *` UTC = 17:55 IST)
hitting `GET /api/cron/report-reminder`. You can trigger it manually:

```bash
curl "http://localhost:3000/api/cron/report-reminder?secret=$CRON_SECRET"
```

**WhatsApp webhook**: `POST /api/webhooks/whatsapp` (Meta verify handshake on
`GET`). Point your Meta/Twilio number's callback at it and set the owner phone in
Settings; only the owner's number is accepted.

---

## Architecture

```
src/
  app/                     # App Router
    (auth)/sign-in         # public sign-in
    (app)/                 # authenticated shell (sidebar + topbar)
      dashboard, my-work, timesheet, documents, clients, leaderboard, workspace
      admin/               # assign, reports, people, settings (permission-gated)
    api/trpc, api/cron, api/webhooks
  server/
    trpc.ts                # context + protected/permission procedures
    routers/               # task, dashboard, attendance, timesheet, user, role,
                           # clients, assign, report, document, setting,
                           # workspace, leaderboard, notification
  lib/
    auth/                  # sessions, permissions (RBAC), guards
    ai/                    # Claude client + planner + testable heuristics
    whatsapp.ts, email.ts, reminders.ts, time.ts
  components/              # ui/ (shadcn) + feature components
```

RBAC permissions (`workspace:admin`, `people:manage`, `tasks:assign`,
`tasks:review`, `reports:view`, `settings:manage`, `clients:manage`,
`rewards:manage`) are stored per role and enforced both in the sidebar and at the
procedure / route level. The Admin role is locked to full access.

---

## Deployment

Deploy the Next.js app to Vercel. For production:

1. Switch Prisma `datasource` to `postgresql` (Neon/Supabase) and run migrations;
   add pgvector for journal embeddings if you want semantic memory.
2. Set the integration env vars you want (Claude, Resend, WhatsApp).
3. The `vercel.json` cron runs the 5:55 PM IST reminder automatically.

### Production upgrade paths (wired to be swappable)

- Real‑time multiplayer whiteboard & office presence → Liveblocks / Colyseus +
  PixiJS (currently persistence + polling).
- Voice‑to‑task → Deepgram/Whisper into the same AI planner.

---

## Testing

- **Unit** (Vitest): RBAC permissions, formatting, IST time math, AI routing
  heuristics.
- **E2E** (Playwright scripts in `scripts/`): auth + RBAC redirects, check‑in →
  day‑report → check‑out, AI draft → assign, WhatsApp simulate → review queue,
  whiteboard edit + autosave persistence, reward redemption, room movement.

Every phase was built and verified independently (build, typecheck, tests, and a
screenshot/console pass at desktop + mobile).
