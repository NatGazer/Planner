-- ============================================================================
--  Maintenance Management — canonical schema
--  Portable ANSI-leaning SQL. The default adapter runs it on SQLite.
--  If you are wiring this to an existing platform database, map these tables
--  onto your own in server/db/connector.js (see docs/DATABASE-CONNECTOR.md).
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Identity. Reuse the platform's employee/user table where one exists.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('admin', 'worker')),
  password_hash TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees (email);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  issued_at   TEXT NOT NULL,
  expires_at  TEXT NOT NULL,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_employee ON sessions (employee_id);

-- ---------------------------------------------------------------------------
-- Configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment_types (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  -- Cosmetic only: lets the UI colour-code a type consistently everywhere.
  accent     TEXT NOT NULL DEFAULT 'aurora',
  icon       TEXT NOT NULL DEFAULT 'cube',
  archived   INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS equipment (
  id          TEXT PRIMARY KEY,
  -- Human-facing asset tag. Unique across the estate.
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  type_id     TEXT NOT NULL REFERENCES equipment_types (id),
  location    TEXT,
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_equipment_type ON equipment (type_id);
CREATE INDEX IF NOT EXISTS idx_equipment_active ON equipment (active);

CREATE TABLE IF NOT EXISTS maintenance_rules (
  id             TEXT PRIMARY KEY,
  type_id        TEXT NOT NULL REFERENCES equipment_types (id),
  title          TEXT NOT NULL,
  instructions   TEXT NOT NULL DEFAULT '',
  interval_value INTEGER NOT NULL CHECK (interval_value > 0),
  interval_unit  TEXT NOT NULL CHECK (interval_unit IN ('days', 'weeks', 'months', 'years')),
  active         INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  archived       INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_type ON maintenance_rules (type_id);

-- ---------------------------------------------------------------------------
-- Work
-- ---------------------------------------------------------------------------
-- One row per occurrence. The partial unique index below is the mechanism that
-- guarantees "exactly one pending task per equipment-rule pair".
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id           TEXT PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES equipment (id),
  rule_id      TEXT NOT NULL REFERENCES maintenance_rules (id),
  due_date     TEXT NOT NULL,                      -- business-local calendar date, YYYY-MM-DD
  status       TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  created_at   TEXT NOT NULL,
  closed_at    TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_task_per_pair
  ON maintenance_tasks (equipment_id, rule_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON maintenance_tasks (status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_equipment ON maintenance_tasks (equipment_id);

-- Immutable. Carries a denormalised snapshot so history survives any later
-- rename, reconfiguration or archival of the equipment or rule it refers to.
CREATE TABLE IF NOT EXISTS completions (
  id                  TEXT PRIMARY KEY,
  task_id             TEXT NOT NULL UNIQUE REFERENCES maintenance_tasks (id),
  employee_id         TEXT NOT NULL REFERENCES employees (id),
  completed_at        TEXT NOT NULL,               -- server-recorded UTC instant
  completed_on        TEXT NOT NULL,               -- business-local calendar date
  photo_id            TEXT NOT NULL REFERENCES photos (id),
  comment             TEXT,
  -- Snapshot ---------------------------------------------------------------
  snap_equipment_id   TEXT NOT NULL,
  snap_equipment_code TEXT NOT NULL,
  snap_equipment_name TEXT NOT NULL,
  snap_location       TEXT,
  snap_type_id        TEXT NOT NULL,
  snap_type_name      TEXT NOT NULL,
  snap_rule_id        TEXT NOT NULL,
  snap_rule_title     TEXT NOT NULL,
  snap_instructions   TEXT NOT NULL DEFAULT '',
  snap_interval_value INTEGER NOT NULL,
  snap_interval_unit  TEXT NOT NULL,
  snap_due_date       TEXT NOT NULL,
  snap_employee_name  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_completions_equipment ON completions (snap_equipment_id);
CREATE INDEX IF NOT EXISTS idx_completions_time ON completions (completed_at);

-- Access-controlled binary references. Bytes live in platform storage; this
-- table holds only the pointer plus the metadata needed to authorise reads.
CREATE TABLE IF NOT EXISTS photos (
  id           TEXT PRIMARY KEY,
  storage_key  TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  byte_size    INTEGER NOT NULL,
  checksum     TEXT NOT NULL,
  uploaded_by  TEXT NOT NULL REFERENCES employees (id),
  uploaded_at  TEXT NOT NULL,
  -- Until a completion claims it, a photo is a private draft of its uploader.
  claimed      INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1))
);

-- ---------------------------------------------------------------------------
-- Audit — every administrative reschedule and configuration change.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  at          TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  actor_name  TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  summary     TEXT NOT NULL,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log (at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id);
