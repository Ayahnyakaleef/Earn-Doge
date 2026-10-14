// bahasa: JavaScript (ESM), file: db.js
// SQLite via better-sqlite3 — synchronous, single-file, no server
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'dogeclick.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint   TEXT UNIQUE NOT NULL,   -- hash(ip + user-agent)
    balance       REAL DEFAULT 0,
    total_clicks  INTEGER DEFAULT 0,
    created_at    INTEGER DEFAULT (strftime('%s','now')),
    last_click    INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS clicks (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    button_idx    INTEGER NOT NULL,
    reward        REAL NOT NULL,
    clicked_at    INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    address       TEXT NOT NULL,
    amount        REAL NOT NULL,
    status        TEXT DEFAULT 'pending',  -- pending|sent|failed
    tx_ref        TEXT,
    created_at    INTEGER DEFAULT (strftime('%s','now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pending_ads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    button_idx    INTEGER NOT NULL,
    token         TEXT UNIQUE NOT NULL,
    created_at    INTEGER DEFAULT (strftime('%s','now')),
    used          INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_clicks_user ON clicks(user_id);
  CREATE INDEX IF NOT EXISTS idx_pending_token ON pending_ads(token);
`);

export default db;
