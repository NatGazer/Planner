#!/usr/bin/env node
'use strict';
/**
 * Demo data. Everything here goes through the same domain functions the apps
 * use, so the seeded estate obeys exactly the same scheduling rules — the only
 * concession is that historic completions are written with backdated
 * timestamps, which the live API can never do.
 *
 *   node server/db/seed.js --reset
 */
const fs = require('node:fs');
const path = require('node:path');
const { encodePNG } = require('./png.js');
const { createConnector } = require('./connector.js');
const config = require('../config.js');
const { newId } = require('../domain/ids.js');
const t = require('../domain/time.js');
const catalog = require('../domain/catalog.js');
const { hashPassword } = require('../auth/passwords.js');

/** Deterministic PRNG so a reseed reproduces the same demo estate. */
function mulberry32(a) {
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const PEOPLE = [
  { email: 'ana@fieldworks.example', name: 'Ana Ribeiro', role: 'admin', password: 'admin1234' },
  { email: 'tomas@fieldworks.example', name: 'Tomás Alves', role: 'worker', password: 'worker1234' },
  { email: 'mariana@fieldworks.example', name: 'Mariana Costa', role: 'worker', password: 'worker1234' },
  { email: 'kwame@fieldworks.example', name: 'Kwame Osei', role: 'worker', password: 'worker1234' },
];

const TYPES = [
  { name: 'HVAC Unit', accent: 'ice', icon: 'fan', rules: [
    { title: 'Replace air filters', v: 3, u: 'months', instructions: 'Isolate the unit at the local disconnect. Slide out both return-air filters, note the size stamped on the frame, and fit new ones with the airflow arrow pointing towards the coil. Vacuum the filter track before closing the access panel.' },
    { title: 'Clean condenser coils', v: 6, u: 'months', instructions: 'Cut power at the disconnect and confirm dead. Comb out any bent fins, then wash the coil from the inside outwards with a low-pressure hose and approved coil cleaner. Clear the base pan drain before restoring power.' },
    { title: 'Full refrigerant and electrical service', v: 1, u: 'years', instructions: 'Log suction and discharge pressures and superheat. Check contactor pitting, tighten all terminal screws to spec, and megger the compressor windings. Record refrigerant charge on the unit label.' },
  ] },
  { name: 'Forklift', accent: 'gold', icon: 'lift', rules: [
    { title: 'Battery watering and terminal clean', v: 14, u: 'days', instructions: 'Charge fully before watering. Top each cell to the indicator ring with distilled water only. Clean terminals with a bicarbonate solution, dry, and re-grease. Never leave tools on the battery top.' },
    { title: 'Hydraulic and mast inspection', v: 30, u: 'days', instructions: 'Raise the mast fully and inspect chains for stretch, kinked links and even tension. Check every hose for weeping at the ferrules. Top the hydraulic reservoir with the mast fully lowered.' },
    { title: 'Annual load test and certification', v: 1, u: 'years', instructions: 'Carry out a rated-capacity load test with a calibrated weight. Verify the overload cut-out, the parking brake on a graded surface, and all lift and tilt limits. File the certificate and fit the new inspection sticker.' },
  ] },
  { name: 'Air Compressor', accent: 'cobalt', icon: 'wave', rules: [
    { title: 'Drain moisture trap', v: 7, u: 'days', instructions: 'Depressurise to below 1 bar. Open the tank drain until the discharge runs clear and dry, then close firmly. Note any oil carry-over in the comment — it is an early sign of ring wear.' },
    { title: 'Change compressor oil', v: 3, u: 'months', instructions: 'Run the compressor to temperature, then stop and isolate. Drain the sump completely, replace the separator O-ring, and refill to the sight-glass centre with the grade on the data plate.' },
    { title: 'Replace intake filter', v: 6, u: 'months', instructions: 'Remove the intake housing, discard the element, and wipe the housing clean. Fit the new element with the seal seated evenly. Reset the service counter on the controller.' },
  ] },
  { name: 'Fire Extinguisher', accent: 'ember', icon: 'flame', rules: [
    { title: 'Visual pressure and seal check', v: 1, u: 'months', instructions: 'Confirm the gauge needle sits in the green band, the pin and tamper seal are intact, the hose is clear, and the unit is unobstructed on its bracket. Photograph the gauge face.' },
    { title: 'Certified annual inspection', v: 1, u: 'years', instructions: 'Weigh the cylinder against its charged weight, inspect the shell for corrosion or dents, and service the head valve. Attach the dated certification tag before returning to the bracket.' },
  ] },
  { name: 'Cold Room', accent: 'orchid', icon: 'drop', rules: [
    { title: 'Defrost and evaporator clean', v: 2, u: 'months', instructions: 'Move stock to the backup room. Run a manual defrost, then clean the evaporator fins and drip tray with a food-safe sanitiser. Confirm the drain line is clear and the heater tape is working.' },
    { title: 'Door seal and temperature log audit', v: 1, u: 'months', instructions: 'Inspect gaskets for tears and compression set — a sheet of paper should drag when pulled through a closed door. Review the last month of logged temperatures for excursions and note anything over the limit.' },
  ] },
  { name: 'Standby Generator', accent: 'sunset', icon: 'bolt', rules: [
    { title: 'Load-bank test run', v: 1, u: 'months', instructions: 'Run under load for thirty minutes. Record voltage, frequency, oil pressure and coolant temperature at ten-minute intervals. Watch for wet stacking and note any unusual exhaust smoke.' },
    { title: 'Coolant and battery check', v: 3, u: 'months', instructions: 'Test coolant freeze point and inhibitor level. Load-test the starting battery and clean the terminals. Confirm the block heater is drawing current.' },
    { title: 'Oil and filter change', v: 6, u: 'months', instructions: 'Warm the engine, then drain the sump and change the oil, fuel and air filters. Prime the fuel system and check for leaks at idle before returning the set to auto.' },
  ] },
  { name: 'Conveyor Line', accent: 'lime', icon: 'gear', rules: [
    { title: 'Belt tension and tracking', v: 1, u: 'months', instructions: 'Run the belt empty and observe tracking over a full cycle. Adjust take-up bolts a quarter turn at a time, allowing several cycles between adjustments. Check for edge fraying and splice condition.' },
    { title: 'Bearing lubrication', v: 2, u: 'months', instructions: 'Grease each pillow-block bearing with two to three strokes of the specified grease while the line runs. Wipe purged grease away and listen for roughness on the idlers.' },
    { title: 'Emergency-stop function test', v: 3, u: 'months', instructions: 'Test every pull-cord and mushroom stop in turn, confirming the line halts and cannot be restarted without a deliberate reset. Log each device by its station number.' },
  ] },
];

const EQUIPMENT = [
  ['HVAC-01', 'Rooftop unit — North wing', 'HVAC Unit', 'Roof, North wing'],
  ['HVAC-02', 'Rooftop unit — South wing', 'HVAC Unit', 'Roof, South wing'],
  ['HVAC-03', 'Server room split unit', 'HVAC Unit', 'Level 1, Server room'],
  ['HVAC-04', 'Front office split unit', 'HVAC Unit', 'Level 2, Reception'],
  ['FLT-01', 'Counterbalance forklift', 'Forklift', 'Warehouse bay A'],
  ['FLT-02', 'Reach truck', 'Forklift', 'Warehouse bay B'],
  ['FLT-03', 'Pallet stacker', 'Forklift', 'Loading dock'],
  ['CMP-01', 'Main workshop compressor', 'Air Compressor', 'Workshop'],
  ['CMP-02', 'Paint line compressor', 'Air Compressor', 'Finishing hall'],
  ['CMP-03', 'Portable site compressor', 'Air Compressor', 'Yard store'],
  ['FE-01', 'CO₂ extinguisher — Server room', 'Fire Extinguisher', 'Level 1, Server room'],
  ['FE-02', 'Foam extinguisher — Workshop', 'Fire Extinguisher', 'Workshop, door 3'],
  ['FE-03', 'Powder extinguisher — Loading dock', 'Fire Extinguisher', 'Loading dock'],
  ['FE-04', 'Powder extinguisher — Warehouse A', 'Fire Extinguisher', 'Warehouse bay A'],
  ['FE-05', 'Water extinguisher — Reception', 'Fire Extinguisher', 'Level 2, Reception'],
  ['FE-06', 'CO₂ extinguisher — Plant room', 'Fire Extinguisher', 'Basement, Plant room'],
  ['CR-01', 'Chilled goods cold room', 'Cold Room', 'Level 1, Cold store'],
  ['CR-02', 'Frozen goods cold room', 'Cold Room', 'Level 1, Cold store'],
  ['GEN-01', 'Standby generator 250 kVA', 'Standby Generator', 'Basement, Plant room'],
  ['GEN-02', 'Yard generator 80 kVA', 'Standby Generator', 'Yard, Cabin 2'],
  ['CNV-01', 'Packing line conveyor', 'Conveyor Line', 'Packing hall'],
  ['CNV-02', 'Despatch sorter conveyor', 'Conveyor Line', 'Despatch'],
  ['CNV-03', 'Returns infeed conveyor', 'Conveyor Line', 'Returns area'],
  ['FLT-04', 'Spare forklift — awaiting parts', 'Forklift', 'Workshop', false],
  ['HVAC-05', 'Old annexe unit — decommissioned', 'HVAC Unit', 'Annexe', false],
];

const ACCENT_HUES = { ice: 190, gold: 42, cobalt: 220, ember: 12, orchid: 288, sunset: 26, lime: 96, aurora: 168 };

/** A distinct, deterministic image for each completion. */
function photoBytes(seed, accent) {
  const rng = mulberry32(seed);
  const hue = (ACCENT_HUES[accent] ?? 200) + (rng() * 40 - 20);
  const ax = 1.6 + rng() * 3.4, ay = 1.2 + rng() * 3.0, phase = rng() * 6.28;
  const q = (v) => Math.max(0, Math.min(255, Math.round(v / 7) * 7));
  const hsl = (h, s, l) => {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = ((h % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
      : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
    const m = l - c / 2;
    return [q((r + m) * 255), q((g + m) * 255), q((b + m) * 255)];
  };
  return encodePNG(400, 300, (u, v) => {
    const wave = Math.sin(u * ax + phase) * Math.cos(v * ay - phase) * 0.5 + 0.5;
    const vign = 1 - 0.45 * ((u - 0.5) ** 2 + (v - 0.5) ** 2) * 2;
    return hsl(hue + wave * 46, 0.42, (0.16 + wave * 0.36) * vign);
  });
}

/** The UTC instant corresponding to midday, business-local, on a given date. */
function localNoonInstant(dateISO, tz) {
  let guess = new Date(`${dateISO}T12:00:00Z`);
  for (let i = 0; i < 4; i += 1) {
    const local = t.businessToday(tz, guess);
    if (local === dateISO) return guess;
    guess = new Date(guess.getTime() + (local < dateISO ? 1 : -1) * 6 * 3600 * 1000);
  }
  return guess;
}

const NOTES = [
  null, null, null, null,
  'All within spec, nothing to report.',
  'Slight play on the left bearing — worth watching next cycle.',
  'Used the last filter from the store cupboard, please reorder.',
  'Access was blocked by pallets, took longer than usual.',
  'Found a small oil weep at the lower fitting, tightened and re-checked.',
  'Seal looks tired but still passing. Recommend replacing at the next service.',
  'Drain ran clear after about thirty seconds.',
  'Guard screw was missing, replaced from stock.',
];

function run({ reset = false } = {}) {
  const db = createConnector(config);
  db.migrate();

  if (reset) {
    for (const table of ['completions', 'photos', 'maintenance_tasks', 'maintenance_rules', 'equipment', 'equipment_types', 'audit_log', 'sessions', 'employees']) {
      db.run(`DELETE FROM ${table}`);
    }
    try { fs.rmSync(config.photoDir, { recursive: true, force: true }); } catch { /* fine */ }
  }
  if (db.get('SELECT COUNT(*) AS n FROM equipment').n > 0 && !reset) {
    process.stdout.write('Database already contains equipment — nothing seeded. Use --reset to rebuild.\n');
    db.close();
    return { skipped: true };
  }

  const today = t.businessToday(config.businessTimezone);
  const rng = mulberry32(20260906);

  // -- people ---------------------------------------------------------------
  const people = {};
  for (const p of PEOPLE) {
    const id = newId('emp');
    db.run(`INSERT INTO employees (id, email, display_name, role, password_hash, active, created_at) VALUES (?,?,?,?,?,1,?)`,
      [id, p.email, p.name, p.role, hashPassword(p.password), t.nowInstant()]);
    people[p.email] = { id, display_name: p.name, name: p.name, role: p.role };
  }
  const admin = people['ana@fieldworks.example'];
  const workers = PEOPLE.filter((p) => p.role === 'worker').map((p) => people[p.email]);

  // -- configuration --------------------------------------------------------
  const typeIds = {};
  const ruleRows = [];
  for (const spec of TYPES) {
    const created = catalog.createType(db, { name: spec.name, accent: spec.accent, icon: spec.icon }, admin);
    typeIds[spec.name] = created.id;
    for (const r of spec.rules) {
      const { rule } = catalog.createRule(db, {
        typeId: created.id, title: r.title, instructions: r.instructions,
        intervalValue: r.v, intervalUnit: r.u, active: true,
      }, admin, { today });
      ruleRows.push(rule);
    }
  }

  for (const [code, name, typeName, location, active = true] of EQUIPMENT) {
    catalog.createEquipment(db, { code, name, typeId: typeIds[typeName], location, active }, admin, { today });
  }

  // One deactivated rule, to demonstrate that deactivation hides pending work
  // without touching history.
  const dormant = ruleRows.find((r) => r.title === 'Replace intake filter');
  if (dormant) catalog.updateRule(db, dormant.id, { active: false }, admin);

  // -- history --------------------------------------------------------------
  // Rewind each equipment-rule pair and replay a plausible run of completions,
  // leaving exactly one pending task per pair at the end.
  const pairs = db.all(`
    SELECT e.id AS equipment_id, e.code, e.name AS equipment_name, e.location, e.active AS equipment_active,
           ty.id AS type_id, ty.name AS type_name, ty.accent,
           r.id AS rule_id, r.title, r.instructions, r.interval_value AS iv, r.interval_unit AS iu
      FROM equipment e
      JOIN equipment_types ty ON ty.id = e.type_id
      JOIN maintenance_rules r ON r.type_id = e.type_id
     WHERE e.archived = 0 AND r.archived = 0
     ORDER BY e.code, r.title`);

  let photoSeed = 1;
  let completions = 0;
  const dueToday = [];

  db.transaction((tx) => {
    for (const p of pairs) {
      tx.run(`DELETE FROM maintenance_tasks WHERE equipment_id = ? AND rule_id = ? AND status = 'pending'`, [p.equipment_id, p.rule_id]);

      const runningDays = 40 + Math.floor(rng() * 230);
      let due = t.addInterval(t.addDays(today, -runningDays), p.iv, p.iu);
      let guard = 0;

      while (t.compareDates(due, today) <= 0 && guard < 40) {
        guard += 1;
        // Sometimes the crew simply has not got to it yet. Only the most
        // recent occurrence is allowed to lapse, which is exactly how the real
        // engine behaves: one outstanding task per pair, never a backlog of
        // missed occurrences piling up behind it.
        if (rng() < 0.3 && t.daysBetween(due, today) < 55) break;
        const drift = [-3, -2, -1, -1, 0, 0, 0, 1, 1, 4][Math.floor(rng() * 10)];
        const completedOn = t.addDays(due, drift);
        if (t.compareDates(completedOn, today) > 0) break;

        const worker = workers[Math.floor(rng() * workers.length)];
        const instant = localNoonInstant(completedOn, config.businessTimezone);
        instant.setUTCMinutes(Math.floor(rng() * 60));
        instant.setUTCHours(instant.getUTCHours() - 3 + Math.floor(rng() * 7));
        const completedAt = instant.toISOString();

        const taskId = newId('task');
        tx.run(`INSERT INTO maintenance_tasks (id, equipment_id, rule_id, due_date, status, created_at, closed_at)
                VALUES (?,?,?,?, 'completed', ?, ?)`,
          [taskId, p.equipment_id, p.rule_id, due, t.nowInstant(t.toEpochDay(due) * 86400000), completedAt]);

        const bytes = photoBytes(photoSeed += 1, p.accent);
        const photoId = newId('pho');
        const key = `${photoId}.png`;
        fs.mkdirSync(config.photoDir, { recursive: true });
        fs.writeFileSync(path.join(config.photoDir, key), bytes, { mode: 0o600 });
        tx.run(`INSERT INTO photos (id, storage_key, mime_type, byte_size, checksum, uploaded_by, uploaded_at, claimed)
                VALUES (?,?,?,?,?,?,?,1)`,
          [photoId, key, 'image/png', bytes.length, require('node:crypto').createHash('sha256').update(bytes).digest('hex'), worker.id, completedAt]);

        tx.run(`INSERT INTO completions (
                  id, task_id, employee_id, completed_at, completed_on, photo_id, comment,
                  snap_equipment_id, snap_equipment_code, snap_equipment_name, snap_location,
                  snap_type_id, snap_type_name,
                  snap_rule_id, snap_rule_title, snap_instructions, snap_interval_value, snap_interval_unit,
                  snap_due_date, snap_employee_name
                ) VALUES (?,?,?,?,?,?,?, ?,?,?,?, ?,?, ?,?,?,?,?, ?,?)`,
          [newId('comp'), taskId, worker.id, completedAt, completedOn, photoId, NOTES[Math.floor(rng() * NOTES.length)],
            p.equipment_id, p.code, p.equipment_name, p.location,
            p.type_id, p.type_name,
            p.rule_id, p.title, p.instructions, p.iv, p.iu,
            due, worker.display_name]);
        completions += 1;

        due = t.addInterval(completedOn, p.iv, p.iu);
      }

      if (dueToday.length < 5 && rng() < 0.12 && t.compareDates(due, today) > 0) due = today;
      tx.run(`INSERT INTO maintenance_tasks (id, equipment_id, rule_id, due_date, status, created_at, closed_at)
              VALUES (?,?,?,?, 'pending', ?, NULL)`,
        [newId('task'), p.equipment_id, p.rule_id, due, t.nowInstant()]);
      if (due === today) dueToday.push(p.code);
    }
  });

  const summary = {
    employees: PEOPLE.length,
    types: TYPES.length,
    rules: ruleRows.length,
    equipment: EQUIPMENT.length,
    completions,
    pending: db.get(`SELECT COUNT(*) AS n FROM maintenance_tasks WHERE status = 'pending'`).n,
    overdue: db.get(`SELECT COUNT(*) AS n FROM maintenance_tasks t JOIN equipment e ON e.id = t.equipment_id
                     JOIN maintenance_rules r ON r.id = t.rule_id
                     WHERE t.status = 'pending' AND e.active = 1 AND r.active = 1 AND t.due_date < ?`, [today]).n,
    dueToday: db.get(`SELECT COUNT(*) AS n FROM maintenance_tasks t JOIN equipment e ON e.id = t.equipment_id
                      JOIN maintenance_rules r ON r.id = t.rule_id
                      WHERE t.status = 'pending' AND e.active = 1 AND r.active = 1 AND t.due_date = ?`, [today]).n,
  };
  db.close();
  return summary;
}

if (require.main === module) {
  const summary = run({ reset: process.argv.includes('--reset') });
  if (!summary.skipped) {
    process.stdout.write(`\n  Seeded the demo estate\n${Object.entries(summary).map(([k, v]) => `    ${k.padEnd(12)} ${v}`).join('\n')}\n\n`
      + '  Admin  ana@fieldworks.example / admin1234\n'
      + '  Worker tomas@fieldworks.example / worker1234\n\n');
  }
}

module.exports = { run };
