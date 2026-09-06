# Maintenance Management

Two separately launchable applications over one shared database.

* **Admin** — configure equipment and maintenance, watch the schedule, review history.
* **Worker** — see what is outstanding, submit completed work from a phone.

They are genuinely separate apps: separate builds, separate servers, separate
ports. They share a database and a small UI package, and nothing else. There is
no role toggle.

---

## Run it

Requires **Node 22.5 or newer**. Nothing else — no database server, no Docker,
no native build step, and no network connection.

```bash
npm start
```

That is the whole thing. Both apps are already built, and the demo estate is
already in the box: 25 pieces of equipment, 19 maintenance tasks and 220
completed jobs with real photographs. The server has **no third-party
dependencies at all**, so `npm install` is only needed if you want to rebuild
the front ends.

Then open:

| | |
|---|---|
| **Admin** | <http://localhost:4310> — `ana@fieldworks.example` / `admin1234` |
| **Worker** | <http://localhost:4320> — `tomas@fieldworks.example` / `worker1234` |

The worker app is built for a phone. Open it on one, or use your browser's
device toolbar — it is designed for a thumb, not a mouse.

Two more demo workers exist (`mariana@` and `kwame@`, same password) if you
want to watch two people race for the same job.

### Languages

Both apps run in **English, European Portuguese and French**, switchable at any
time with no reload. The picker sits on the sign-in screen of both apps — so
somebody who reads no English can change it before signing in — and afterwards
in the admin account menu, and in the worker's account sheet as full-width rows
labelled in their own language.

Dates, plurals and even the weekday initials on the workload chart follow the
choice; so do the errors the server sends. [docs/I18N.md](docs/I18N.md) explains
how, and why a missing translation is a build failure rather than a surprise in
production.

### Working on it

```bash
npm install          # front-end dependencies (the server needs none)
npm run dev          # both API servers and both Vite dev servers, one terminal
npm run build        # rebuild both apps
npm test             # 70 tests
npm run seed:reset   # wipe and rebuild the demo estate
```

Admin UI on <http://localhost:5310>, worker UI on <http://localhost:5320>.

Starting from an empty database instead? Delete `.data/` and run
`npm run start:admin` — the overview will walk you through creating your first
equipment type.

---

## How it is put together

```
server/           No third-party dependencies at all.
  db/             Schema, the connector port, the bundled SQLite adapter, seed
  domain/         Calendar maths, scheduling, completion, catalog, read models
  auth/           scrypt passwords, sessions, role checks
  storage/        Access-controlled photo storage
  api/            admin.js and worker.js — mounted separately, never together
  tests/
apps/admin/       React + Vite
apps/worker/      React + Vite
packages/ui/      Shared design system, animation toolkit, API client
tools/            Contrast audit, performance trace, end-to-end flows
docs/
```

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the reasoning,
[`docs/DATABASE-CONNECTOR.md`](docs/DATABASE-CONNECTOR.md) to point it at your
own database, and [`docs/PLATFORM-GAPS.md`](docs/PLATFORM-GAPS.md) for exactly
what the platform did and did not provide.

---

## The scheduling rules, in one place

* One pending task per equipment–rule pair. An overdue task stays outstanding;
  missed occurrences never pile up behind it.
* First due date defaults to **setup date + interval**, and an administrator
  can set it explicitly. No previous completion is ever invented.
* After a completion the next due date is **the actual completion date +
  that rule's interval**. Finishing early or late re-bases that one pair's
  schedule and nothing else.
* A frequency change applies to the **next** occurrence. Existing pending due
  dates are left alone unless an administrator reschedules them explicitly.
* Deactivating equipment or a rule **hides** its pending tasks. Nothing is
  deleted, and reactivating restores the original dates, overdue ones included.
* Months and years are calendar intervals, clamped to the destination month's
  last valid day: 31 January + 1 month is 28 February.
* One configured business timezone (`BUSINESS_TIMEZONE`) decides what "today"
  means. A task is overdue when its due date is before today.

## Permissions

Enforced in the backend, three ways over:

1. The worker server never mounts the admin router. Those endpoints do not
   exist on that origin — a hand-written request gets a 404, not a 403.
2. Every handler re-checks the role on every request, independently of the UI.
3. A worker account cannot sign in to the admin app at all.

Completion times are recorded by the server. Photos live outside any public
path and are served only through an authenticated endpoint: administrators see
every photo, a worker sees only their own.

## Configuration

| Variable | Default | |
|---|---|---|
| `BUSINESS_TIMEZONE` | `Europe/Lisbon` | Governs every due date |
| `ADMIN_PORT` / `WORKER_PORT` | `4310` / `4320` | |
| `MAINTENANCE_DATA_DIR` | `./.data` | Database and photos |
| `MAINTENANCE_DB_CONNECTOR` | — | Path to your own connector module |
| `MAX_PHOTO_BYTES` | `12582912` | 12 MB |
| `MAX_DRAFT_PHOTOS` | `6` | Unsubmitted photos one employee may hold |
| `SESSION_TTL_HOURS` | `336` | Two weeks |
| `SECURE_COOKIES` | off | Set to `1` when serving over TLS |
| `TRUST_PROXY` | off | Set to `1` only behind a proxy that sets `x-forwarded-for` |
