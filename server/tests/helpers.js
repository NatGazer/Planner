'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** Each test file gets an isolated database and photo directory. */
function sandbox(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mm-${label}-`));
  process.env.MAINTENANCE_DATA_DIR = dir;
  process.env.MAINTENANCE_DB_FILE = path.join(dir, 'test.db');
  process.env.MAINTENANCE_PHOTO_DIR = path.join(dir, 'photos');
  delete require.cache[require.resolve('../config.js')];
  const config = require('../config.js');
  const { createConnector } = require('../db/connector.js');
  const db = createConnector(config);
  db.migrate();
  return {
    db,
    config,
    dir,
    cleanup() { try { db.close(); } catch { /* already closed */ } fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

const { newId } = require('../domain/ids.js');
const { nowInstant } = require('../domain/time.js');
const { hashPassword } = require('../auth/passwords.js');

function makeEmployee(db, { name = 'Test Person', role = 'worker', email = null, password = 'pw123456' } = {}) {
  const id = newId('emp');
  db.run('INSERT INTO employees (id, email, display_name, role, password_hash, active, created_at) VALUES (?,?,?,?,?,1,?)',
    [id, email || `${id}@test.example`, name, role, hashPassword(password), nowInstant()]);
  return { id, display_name: name, name, role, email: email || `${id}@test.example`, password };
}

const { encodePNG } = require('../db/png.js');
const photoStore = require('../storage/photo-store.js');

function makePhoto(db, employeeId, tint = 0) {
  const bytes = encodePNG(16, 16, () => [tint & 255, 120, 200]);
  return photoStore.put(db, { bytes, mimeType: 'image/png', uploaderId: employeeId });
}

module.exports = { sandbox, makeEmployee, makePhoto };
