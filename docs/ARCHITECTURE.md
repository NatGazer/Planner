# Architecture

## Two apps, one database, no role toggle

`server/app.js` builds an HTTP server for a role. `--app admin` mounts the
admin router; `--app worker` does not. Both mount the shared router (session,
identity, authorised photo reads) and the worker router, because an
administrator is a superset of a worker and may also carry out work.

That asymmetry is the outer half of the permission story: on the worker origin
there is no admin endpoint to reach, so a hand-crafted request gets a 404
rather than a 403. The inner half is a role check inside every handler, run on
every request, independent of anything the browser did. A third layer refuses a
worker account at the admin app's sign-in, so no admin-origin session is ever
issued to a worker.

Both processes open the same SQLite file. WAL mode plus `BEGIN IMMEDIATE` on
every transaction makes that safe, and the test suite proves it with four real
OS processes racing on one task.

## The database boundary

`server/db/connector.js` is the whole data-layer contract: `all`, `get`, `run`,
`transaction`, `close`. The bundled adapter uses Node 22's built-in
`node:sqlite`, so the system runs with zero third-party server dependencies.
Replacing it is one environment variable — see
[DATABASE-CONNECTOR.md](./DATABASE-CONNECTOR.md).

Domain code never touches a driver type. Only strings, numbers, `null` and
integer booleans cross the boundary.

## Dates are calendar dates

Every scheduling decision happens on a `'YYYY-MM-DD'` string in one configured
business timezone. Nothing in the scheduler ever touches a wall clock, so no
DST transition, server relocation or daylight boundary can move a due date.

`server/domain/time.js` implements the arithmetic: days and weeks are day
counts; months and years are calendar hops clamped to the destination month's
last valid day, applied per hop rather than accumulated. Only completion
instants are absolute UTC timestamps, and those are stamped by the server.

## Exactly one pending task per pair

The rule is enforced by a partial unique index:

```sql
CREATE UNIQUE INDEX uniq_pending_task_per_pair
  ON maintenance_tasks (equipment_id, rule_id) WHERE status = 'pending';
```

`ensurePendingTask` still does a `SELECT` first, but that is an optimisation.
The index is the guarantee: when two callers race, the loser catches the unique
violation and adopts the winner's row.

This is also why missed occurrences never accumulate. There is no generator
walking forward creating one task per elapsed interval — an overdue task simply
stays open until somebody completes it, and only then is the next one created.

## Completion is one transaction

`submitCompletion` closes the task, writes the immutable completion with its
snapshot, claims the photo and opens the next occurrence — all or nothing.

Exactly-once holds three independent ways:

1. `BEGIN IMMEDIATE` takes the write lock up front, so concurrent submissions
   serialise instead of deadlocking.
2. The task is closed with `UPDATE ... WHERE status = 'pending'`. Zero rows
   changed means somebody else got there first.
3. `completions.task_id` is `UNIQUE` — the final backstop.

The loser is told "Already completed" with a 409 and handed a refreshed list.

## History cannot be rewritten

A completion stores its own copy of the equipment code, name, location, type
name, rule title, instructions, interval and the employee's name. Renaming
equipment, changing a frequency or archiving a type afterwards changes nothing
about what a historical record says. Types, equipment and rules archive; they
are never deleted, so nothing history points at can vanish.

## The audit log

Every configuration change and every reschedule is written to `audit_log`
**inside the same transaction as the change itself**. The log cannot disagree
with the data: either both landed or neither did.

## Photos

Bytes are written under the private data directory with an opaque key and mode
`0600`. The only route back out is `GET /api/photos/:id`, which authenticates
first: administrators may read any photo, a worker only their own. An uploaded
photo is a private draft until a completion claims it, so an abandoned upload
never becomes evidence for anything.

The worker app downscales to 1800px and re-encodes as JPEG on the device before
uploading — a warehouse connection makes the difference obvious.

## Front end

React 19, Vite, framer-motion and hand-written CSS. No UI kit, no icon font, no
web fonts, no CDN. Both apps run entirely offline once built.

`packages/ui` is source-only, aliased into each app by Vite — no build step, no
publishing, no version skew. It holds the design tokens, the animation
vocabulary, the API client and the primitives both apps share.

Motion is composited: transforms, opacity and filters only. The pointer-driven
tilt writes to motion values rather than React state, so nothing re-renders
while a card is being hovered. The WebGL background renders at 45% scale,
capped at 30fps, and pauses when the tab is hidden. Every animation has a
`prefers-reduced-motion` path that removes travel rather than removing meaning.
