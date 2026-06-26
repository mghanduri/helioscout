/**
 * SQLite persistence for HelioScout user accounts + personalization.
 *
 * Uses Node's built-in `node:sqlite` (no native build step). The database file
 * lives at DATA_DIR/helioscout.db (DATA_DIR defaults to ./data). On Railway,
 * point DATA_DIR at a mounted volume so the file survives redeploys — the
 * container filesystem is otherwise ephemeral.
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const dbPath = path.join(DATA_DIR, 'helioscout.db');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT,
    role          TEXT,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS points_of_interest (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    lat        REAL NOT NULL,
    lon        REAL NOT NULL,
    type       TEXT,
    notes      TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_poi_user ON points_of_interest(user_id);

  CREATE TABLE IF NOT EXISTS heat_rate_overrides (
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    turbine_id    TEXT NOT NULL,
    iso_heat_rate REAL NOT NULL,
    updated_at    TEXT NOT NULL,
    PRIMARY KEY (user_id, turbine_id)
  );

  CREATE TABLE IF NOT EXISTS pinned_sites (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id    TEXT NOT NULL,
    payload    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, site_id)
  );

  CREATE TABLE IF NOT EXISTS financial_defaults (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    payload    TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

module.exports = db;
