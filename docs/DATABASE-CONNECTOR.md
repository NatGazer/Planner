# Swapping in your own database

Everything above the data layer talks to the database through five methods.
Implement them and the whole system moves, with no change to the domain logic,
the API, or either app.

## The port

```js
// my-platform-connector.js
exports.createConnector = (config) => ({
  all(sql, params)  { /* -> Row[]              */ },
  get(sql, params)  { /* -> Row | undefined    */ },
  run(sql, params)  { /* -> { changes: number} */ },
  transaction(fn)   { /* -> fn(txScopedConnector), atomic */ },
  close()           { /* release resources     */ },
});
```

Point the servers at it:

```bash
MAINTENANCE_DB_CONNECTOR=./my-platform-connector.js npm start
```

`params` is a positional array bound to `?` placeholders. Only strings,
numbers, `null` and integers-standing-in-for-booleans cross the boundary — no
driver types leak upward.

## Two behaviours the domain layer depends on

Everything else is ordinary SQL plumbing. These two are load-bearing:

### 1. Unique violations must be recognisable

`isUniqueViolation(err)` in `server/db/connector.js` already matches SQLite,
Postgres, MySQL and generic "duplicate key" wording. Extend it if your driver
phrases things differently.

This is not decoration. Two guarantees are enforced by unique indexes rather
than by application code, which is what makes them hold under concurrency:

- `uniq_pending_task_per_pair` — a partial unique index on
  `(equipment_id, rule_id) WHERE status = 'pending'`. One outstanding task per
  equipment–rule pair, always.
- `completions.task_id UNIQUE` — one completion per task, ever.

If your database does not support **partial** unique indexes, use a filtered
equivalent (SQL Server), a unique index on an expression that is `NULL` for
completed rows, or a trigger. Do not drop it and rely on the `SELECT` above the
`INSERT`: that check is an optimisation, not the guarantee.

### 2. Transactions must take the write lock up front

`submitCompletion` runs inside one transaction that closes the task, writes the
completion, claims the photo and opens the next occurrence. Two workers
submitting the same task at the same instant must serialise, not deadlock on a
lock upgrade.

- SQLite: `BEGIN IMMEDIATE` (what the bundled adapter does)
- Postgres / MySQL: the default is fine
- Anything else: take a write-intent lock at `BEGIN`

Nested `transaction()` calls must join the outer transaction rather than start
a new one — several domain helpers compose.

## Mapping onto tables you already have

If your platform has its own `employees` or `users` table, the least invasive
route is a view named `employees` exposing
`id, email, display_name, role, password_hash, active, created_at`, plus a
`sessions` table. If your platform issues its own session tokens, replace
`server/auth/sessions.js:resolve()` with a call into your identity service —
it is the only function that turns a token into an actor.

The schema is in `server/db/schema.sql`, commented table by table.

## Checking your adapter

```bash
MAINTENANCE_DB_CONNECTOR=./my-platform-connector.js npm test
```

The suite covers calendar arithmetic, the scheduling rules, the completion
transaction, permissions, and a genuine four-process race on a single task. If
it passes against your connector, the swap is sound.
