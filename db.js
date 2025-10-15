const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const DB_PATH = path.join(__dirname, '..', 'data.sqlite');

function getDb() { return new sqlite3.Database(DB_PATH); }
function run(db, sql, params=[]) { return new Promise((res, rej)=>db.run(sql, params, function(e){ e?rej(e):res(this); })); }
function all(db, sql, params=[]) { return new Promise((res, rej)=>db.all(sql, params, function(e, rows){ e?rej(e):res(rows); })); }
function get(db, sql, params=[]) { return new Promise((res, rej)=>db.get(sql, params, function(e, row){ e?rej(e):res(row); })); }

async function migrate() {
  const db = getDb();
  await run(db, `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await run(db, `CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    answers TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
  await run(db, `CREATE INDEX IF NOT EXISTS idx_results_user ON results(user_id)`);
  await run(db, `CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    payload TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // seed default questions if empty
  const existing = await all(db, `SELECT COUNT(*) as c FROM questions`);
  if (!existing[0] || !existing[0].c) {
    const defaultQs = [
      { id: 1, text: "Je recommande souvent ce service à mes proches", scale: 5 },
      { id: 2, text: "Je suis satisfait de la qualité globale", scale: 5 },
      { id: 3, text: "Je continuerai à utiliser ce service à l'avenir", scale: 5 }
    ];
    await run(db, `INSERT INTO questions(id, payload) VALUES(1, ?)`, [JSON.stringify(defaultQs)]);
  }
  db.close();
}

async function getUserByEmail(email) {
  const db = getDb();
  const row = await get(db, `SELECT id, name, email, password_hash, is_admin FROM users WHERE email = ?`, [email]);
  db.close();
  return row || null;
}

async function createUser({ name, email, password_hash, is_admin = 0 }) {
  const db = getDb();
  const res = await run(db, `INSERT INTO users(name, email, password_hash, is_admin) VALUES(?,?,?,?)`, [name, email, password_hash, is_admin ? 1 : 0]);
  const row = await get(db, `SELECT id, name, email, is_admin FROM users WHERE id = ?`, [res.lastID]);
  db.close();
  return row;
}

async function setAdmin(userId, isAdmin) {
  const db = getDb();
  await run(db, `UPDATE users SET is_admin = ? WHERE id = ?`, [isAdmin ? 1 : 0, userId]);
  db.close();
}

async function saveResult({ user_id, answers, score }) {
  const db = getDb();
  await run(db, `INSERT INTO results(user_id, answers, score) VALUES(?,?,?)`, [user_id, JSON.stringify(answers), score]);
  db.close();
}

async function listResults({ from = null, to = null } = {}) {
  const db = getDb();
  let sql = `SELECT r.id, r.user_id, u.name, u.email, r.answers, r.score, r.created_at
    FROM results r JOIN users u ON u.id = r.user_id WHERE 1=1`;
  const params = [];
  if (from) { sql += ` AND datetime(r.created_at) >= datetime(?)`; params.push(from); }
  if (to) { sql += ` AND datetime(r.created_at) <= datetime(?)`; params.push(to); }
  sql += ` ORDER BY r.created_at DESC`;
  const rows = await all(db, sql, params);
  db.close();
  return rows.map(r => ({ ...r, answers: safeParse(r.answers) }));
}

async function getQuestions() {
  const db = getDb();
  const row = await get(db, `SELECT payload FROM questions WHERE id = 1`);
  db.close();
  return row ? safeParse(row.payload) : [];
}

async function setQuestions(questions) {
  const db = getDb();
  await run(db, `INSERT INTO questions(id, payload, updated_at) VALUES(1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=CURRENT_TIMESTAMP`, [JSON.stringify(questions)]);
  db.close();
}

function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }

if (require.main === module) {
  if (process.argv[2] === '--migrate') migrate().then(()=>process.exit(0));
}

module.exports = {
  migrate,
  getUserByEmail,
  createUser,
  setAdmin,
  saveResult,
  listResults,
  getQuestions,
  setQuestions,
};
