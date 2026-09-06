# HTTP API

Two origins. The admin app serves the admin surface plus everything below it;
the worker app serves only the shared and worker surfaces. An admin endpoint
requested from the worker origin returns **404** — it genuinely is not there.

Authentication is an HttpOnly, SameSite=Strict session cookie. A
`Authorization: Bearer <token>` header is also accepted, for scripts.

Errors are always `{ "error": { "code", "message", "detail?" } }`. `code` is
stable and safe to switch on; `message` is written to be shown to a person.

| Code | Status | |
|---|---|---|
| `UNAUTHORIZED` | 401 | No session, or it expired |
| `FORBIDDEN` | 403 | Wrong role, or someone else's photo |
| `NOT_FOUND` | 404 | Gone, or never existed |
| `VALIDATION` | 400 | `detail.field` names the offending field |
| `CONFIRMATION_REQUIRED` | 400 | The completion checkbox was not ticked |
| `PHOTO_REQUIRED` | 400 | No photo, or the reference was unknown |
| `PHOTO_TYPE` / `PHOTO_TOO_LARGE` / `PHOTO_EMPTY` | 400 | Rejected upload |
| `PHOTO_REUSED` | 400 | That photo already backs another completion |
| `ALREADY_COMPLETED` | 409 | Someone else submitted first |
| `EQUIPMENT_INACTIVE` / `RULE_INACTIVE` | 409 | Deactivated between opening and submitting |
| `DUPLICATE_CODE` / `DUPLICATE_NAME` | 409 | Asset code or type name already in use |
| `TYPE_IN_USE` | 409 | Equipment still uses this type |

## Shared — both apps

```
POST   /api/auth/sign-in        { email, password } -> { employee, today, timezone }
POST   /api/auth/sign-out
GET    /api/auth/me             -> { employee, today, timezone, app }
GET    /api/health              -> { ok, app, today, timezone }

POST   /api/photos              multipart/form-data, or a raw image body
                                -> { photoId, byteSize, mimeType }
GET    /api/photos/:id          the bytes. Admin: any. Worker: their own only.
```

Signing in to the admin app with a worker account is refused with 403 and the
session is discarded.

## Worker

The whole worker surface. There is deliberately nothing here that can create,
edit, reschedule or delete anything.

```
GET    /api/worker/tasks?search=      -> { today, timezone, counts, tasks[] }
GET    /api/worker/tasks/:id          -> { today, task }
POST   /api/worker/tasks/:id/complete { confirmed: true, photoId, comment? }
                                      -> { ok, completion, nextTask, today, tasks[] }
DELETE /api/worker/photos/:id         discards an unclaimed draft photo
```

`tasks` is the shared outstanding list, ascending by due date — which puts
overdue first by construction. Only tasks on active equipment under active
rules appear. Nothing is assigned to anybody.

`complete` requires `confirmed: true` and a `photoId`; `comment` is optional.
The completion instant is recorded by the server and cannot be supplied. The
response carries the refreshed list, so the app never needs a second round trip.

## Admin

Every route re-checks the `admin` role.

```
GET    /api/admin/dashboard           everything the overview screen renders

GET    /api/admin/tasks?bucket=&equipmentId=&typeId=&ruleId=&search=&includeHidden=
GET    /api/admin/tasks/:id
POST   /api/admin/tasks/:id/reschedule  { dueDate, reason? }

GET    /api/admin/types
POST   /api/admin/types                 { name, accent?, icon? }
PATCH  /api/admin/types/:id
POST   /api/admin/types/:id/archive

GET    /api/admin/equipment?typeId=&active=&search=
GET    /api/admin/equipment/:id         detail, schedule, history, rules, activity
POST   /api/admin/equipment             { code, name, typeId, location?, active?, firstDueDate? }
PATCH  /api/admin/equipment/:id
POST   /api/admin/equipment/:id/duplicate { code?, count?, firstDueDate? }
POST   /api/admin/equipment/:id/archive

GET    /api/admin/rules?typeId=&active=
GET    /api/admin/rules/:id
POST   /api/admin/rules                 { typeId, title, instructions?, intervalValue,
                                          intervalUnit, active?, firstDueDate? }
PATCH  /api/admin/rules/:id
POST   /api/admin/rules/:id/archive

GET    /api/admin/history?equipmentId=&ruleId=&employeeId=&typeId=&from=&to=&search=&limit=&offset=
GET    /api/admin/completions/:id
GET    /api/admin/activity?limit=
GET    /api/admin/employees
```

`bucket` is one of `overdue`, `today`, `week`, `later`, `due-or-overdue`.
`includeHidden=true` also returns pending tasks whose equipment or rule is
deactivated — they are excluded from every actionable count.

Creating equipment opens a pending task for every non-archived rule of its
type; creating a rule opens one on every non-archived item of that type.
`firstDueDate` overrides the default of setup date + interval. The response
reports `tasksOpened` so the interface can say what just happened.

`PATCH /api/admin/rules/:id` with a new interval affects only occurrences
generated after the next completion. Pending due dates do not move; use
`reschedule` for that, which is audited.

## Sign-in protection

Sign-in is throttled on the pair (client address, email): eight failures in
fifteen minutes locks that pair, and thirty failures locks the address across
all accounts. A throttled request answers **429 `TOO_MANY_ATTEMPTS`** with a
`Retry-After` header, and it refuses the *correct* password too — otherwise the
lock would be a way to test passwords faster than the limit allows. A
successful sign-in clears that person's slate.

Unknown addresses, deactivated accounts and wrong passwords are
indistinguishable in the response *and in how long it takes*: an address with
no account still pays for one scrypt verification against a decoy hash, so
latency is not an account-enumeration oracle. scrypt runs asynchronously on the
thread pool, so a burst of attempts queues rather than freezing the server.

`x-forwarded-for` is trusted only when `TRUST_PROXY=1` is set. Behind no proxy
it is a header the caller writes themselves, and an attacker who can choose the
key they are throttled on is not throttled at all.

Set `SECURE_COOKIES=1` when serving over TLS. It is off by default only because
the bundled setup is plain http on localhost, where a `Secure` cookie is
discarded and nobody can sign in at all.
