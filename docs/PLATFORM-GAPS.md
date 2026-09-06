# Platform capabilities: what was found, and what had to be built

The brief asked me to inspect and reuse the platform's existing schema,
authentication and file storage. This is what I actually found, and what I did
about it — flagged rather than papered over, as the brief requires.

## What the repository contained

`github.com/NatGazer/Planner` was **completely empty** at the start of this
work: no commits on any branch, no schema, no authentication, no storage
adapter, no application code, no dependency manifest. There was nothing to
inspect and nothing to reuse.

## What that means for the four "reuse where available" items

| Capability | Found | What was done instead |
|---|---|---|
| Database / schema | None | A canonical schema was written from the data model in the brief (`server/db/schema.sql`), behind a five-method connector port so it can be replaced. |
| Authentication / employee identity | None | Employees, scrypt password hashing and server-side sessions (`server/auth/`). Roles are `admin` and `worker`. |
| File storage | None | Access-controlled local storage keyed by opaque ids (`server/storage/photo-store.js`). Bytes are never on a public path. |
| Audit / activity log | None | Append-only `audit_log`, written inside the same transaction as the change it records. |

**Nothing here is mock behaviour.** Every piece is a working implementation
with real transactions, real constraints and real permission checks. The point
of the connector port is that when the platform database does arrive, the
domain logic above it does not change.

## The one thing you will replace

`server/db/connector.js` defines the whole boundary: `all`, `get`, `run`,
`transaction`, `close`. Point `MAINTENANCE_DB_CONNECTOR` at your own module and
the system runs on your database. Two behaviours your adapter must preserve are
written up in [DATABASE-CONNECTOR.md](./DATABASE-CONNECTOR.md) — they are what
make "exactly one pending task per pair" and "exactly one completion per task"
real guarantees rather than hopeful application code.

## Deliberately out of scope

Excluded by the brief, and genuinely absent from the code rather than stubbed:
predictive analytics, notifications, employee assignment or task claiming,
sensor input, and usage-based scheduling. The worker list is shared and
unassigned by design.

## Assumptions I made, and where they live

1. **One business timezone for the whole installation** — `BUSINESS_TIMEZONE`,
   default `Europe/Lisbon` (`server/config.js`). Every due date is a calendar
   date in that zone.
2. **An administrator may also complete work.** The brief restricts what
   workers can do and says nothing about the reverse, so worker endpoints
   accept both roles while admin endpoints are strictly `admin`. A worker
   account cannot even sign in to the admin app.
3. **Changing an item's equipment type is allowed** and reconciles the
   schedule: pending work under rules that no longer apply goes dormant — kept
   at its own due date, audited, hidden from every list and count, and restored
   unchanged if the item is moved back — while the new type's rules open their
   schedules. Completed history is untouched. The brief does not cover this
   case; the alternative was to make the type immutable, which is worse for a
   real estate, and deleting the pending work would destroy an obligation a
   mistyped item still owes.
4. **Archiving, never deleting.** Types, equipment and rules archive. Nothing
   that history points at is ever removed.
