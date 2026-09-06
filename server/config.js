'use strict';
const path = require('node:path');

/**
 * One configured business timezone governs every due date in the system.
 * Change it here (or via BUSINESS_TIMEZONE) and the whole schedule follows.
 */
const config = {
  businessTimezone: process.env.BUSINESS_TIMEZONE || 'Europe/Lisbon',
  dataDir: process.env.MAINTENANCE_DATA_DIR || path.join(process.cwd(), '.data'),
  get databaseFile() { return process.env.MAINTENANCE_DB_FILE || path.join(this.dataDir, 'maintenance.db'); },
  get photoDir() { return process.env.MAINTENANCE_PHOTO_DIR || path.join(this.dataDir, 'photos'); },
  connectorModule: process.env.MAINTENANCE_DB_CONNECTOR || null,
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 24 * 14),
  maxPhotoBytes: Number(process.env.MAX_PHOTO_BYTES || 12 * 1024 * 1024),
  allowedPhotoTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif'],
  ports: {
    admin: Number(process.env.ADMIN_PORT || 4310),
    worker: Number(process.env.WORKER_PORT || 4320),
  },
};

// Fail fast on a typo'd timezone rather than silently drifting the schedule.
try { new Intl.DateTimeFormat('en-CA', { timeZone: config.businessTimezone }); }
catch { throw new Error(`BUSINESS_TIMEZONE is not a valid IANA timezone: ${config.businessTimezone}`); }

module.exports = config;
