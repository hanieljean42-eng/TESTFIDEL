const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./src/db');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 4000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hanieljean42@gmail.com';
const FIXED_PASSWORD = process.env.FIXED_PASSWORD || '200700';

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'unauthorized' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.is_admin) return res.status(403).json({ error: 'forbidden' });
  next();
}

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/register', async (req, res) => {
  try {
    const { name = '', email = '', password = '' } = req.body;
    if (!name.trim() || !email.trim() || !password) return res.status(400).json({ error: 'missing_fields' });
    // enforce fixed password
    if (password !== FIXED_PASSWORD) return res.status(401).json({ error: 'invalid_credentials' });
    const exists = await db.getUserByEmail(email.trim().toLowerCase());
    if (exists) return res.status(409).json({ error: 'email_taken' });
    const hash = await bcrypt.hash(FIXED_PASSWORD, 10);
    const isAdmin = email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const user = await db.createUser({ name: name.trim(), email: email.trim().toLowerCase(), password_hash: hash, is_admin: isAdmin ? 1 : 0 });
    req.session.user = { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin };
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email = '', password = '' } = req.body;
    const user = await db.getUserByEmail(email.trim().toLowerCase());
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    // enforce fixed password
    if (password !== FIXED_PASSWORD) return res.status(401).json({ error: 'invalid_credentials' });
    // promote to admin if email matches ADMIN_EMAIL
    if (!user.is_admin && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
      await db.setAdmin(user.id, true);
      user.is_admin = 1;
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, is_admin: !!user.is_admin };
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Test de fidélité - questions dynamiques en DB
app.get('/api/test', requireAuth, async (req, res) => {
  const questions = await db.getQuestions();
  res.json({ questions });
});

app.post('/api/test', requireAuth, async (req, res) => {
  try {
    const { answers } = req.body; // [{id, value}]
    const qs = await db.getQuestions();
    if (!Array.isArray(answers) || answers.length !== qs.length) return res.status(400).json({ error: 'invalid_answers' });
    const byId = new Map(qs.map(q => [Number(q.id), q]));
    const sanitized = answers.map(a => ({ id: Number(a.id), value: Math.min((byId.get(Number(a.id))?.scale)||5, Math.max(1, Number(a.value))) }));
    const score = sanitized.reduce((s, a) => s + a.value, 0);
    await db.saveResult({ user_id: req.session.user.id, answers: sanitized, score });
    // Optional email notification to admin
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM = SMTP_USER } = process.env;
    if (SMTP_HOST && (SMTP_USER || MAIL_FROM)) {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT ? parseInt(SMTP_PORT) : 587,
        secure: SMTP_SECURE === 'true',
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      });
      try {
        await transporter.sendMail({
          from: MAIL_FROM || SMTP_USER,
          to: ADMIN_EMAIL,
          subject: '[Fidelite Test] Nouveau résultat',
          text: `Utilisateur: ${req.session.user.email}\nScore: ${score}\nRéponses: ${sanitized.map(a=>`q${a.id}:${a.value}`).join(', ')}`,
        });
      } catch (_) {}
    }
    res.json({ ok: true, score });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

// Admin: voir résultats et export CSV
app.get('/api/admin/results', requireAdmin, async (req, res) => {
  try {
    const { from = '', to = '', csv = '' } = req.query;
    const results = await db.listResults({ from: from || null, to: to || null });
    if (csv === '1') {
      const header = 'id;user;email;score;answers;created_at\n';
      const lines = results.map(r => [r.id, r.name, r.email, r.score, (r.answers||[]).map(a=>`q${a.id}:${a.value}`).join(' '), r.created_at].map(v=>String(v).replaceAll('\n',' ').replaceAll(';',',')).join(';'));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="results.csv"');
      return res.send(header + lines.join('\n'));
    }
    res.json(results);
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

// Admin: éditer les questions
app.get('/api/admin/questions', requireAdmin, async (req, res) => {
  const questions = await db.getQuestions();
  res.json({ questions });
});
app.post('/api/admin/questions', requireAdmin, async (req, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || !questions.length) return res.status(400).json({ error: 'invalid_questions' });
    // sanitize minimal
    const sanitized = questions.map((q, idx) => ({ id: Number(q.id ?? (idx+1)), text: String(q.text||'').slice(0,300), scale: Math.min(10, Math.max(2, Number(q.scale||5))) }));
    await db.setQuestions(sanitized);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'server_error' }); }
});

// Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/test', (req, res) => res.sendFile(path.join(__dirname, 'public', 'test.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

(async () => {
  await db.migrate();
  app.listen(PORT, () => {});
})();
