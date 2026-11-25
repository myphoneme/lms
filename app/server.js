#!/usr/bin/env node
/**
 * L1 Academy — white-label training platform for datacenter / cloud / security teams.
 * Zero runtime dependencies. Node >= 22.5 (uses node:sqlite).
 *
 *   node server.js            # http://localhost:4173
 *   PORT=8080 node server.js
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const createOidc = require('./oidc');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONTENT_DIR = path.join(ROOT, 'content');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
// The database lives wherever DB_PATH says; only its parent is created.
// In production that is /var/lib/lms, outside the read-only code tree.
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'app.db');
const DATA_DIR = path.dirname(DB_PATH);
const APP_BASE_URL = (process.env.APP_BASE_URL || `http://${HOST}:${PORT}`).replace(/\/$/, '');

fs.mkdirSync(DATA_DIR, { recursive: true });

/* ------------------------------------------------------------------ *
 * Database
 * ------------------------------------------------------------------ */
const db = new DatabaseSync(DB_PATH);
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  logo TEXT NOT NULL DEFAULT '',
  primary_color TEXT NOT NULL DEFAULT '#4f7cff',
  accent_color TEXT NOT NULL DEFAULT '#22d3a6',
  signatory TEXT NOT NULL DEFAULT '',
  signatory_title TEXT NOT NULL DEFAULT '',
  cert_title TEXT NOT NULL DEFAULT 'Certificate of Completion',
  pass_pct INTEGER NOT NULL DEFAULT 70,
  attempts INTEGER NOT NULL DEFAULT 3,
  cert_pct INTEGER NOT NULL DEFAULT 80,
  invite_code TEXT NOT NULL DEFAULT 'JOIN',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'learner',
  cohort TEXT NOT NULL DEFAULT '',
  profile TEXT NOT NULL DEFAULT '{}',
  pre_score INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  user_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  quiz_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  assignment_id TEXT NOT NULL,
  evidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted',
  score INTEGER,
  rubric TEXT NOT NULL DEFAULT '[]',
  feedback TEXT NOT NULL DEFAULT '',
  graded_by INTEGER,
  graded_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, assignment_id)
);

CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  code TEXT NOT NULL UNIQUE,
  overall_pct REAL NOT NULL,
  issued_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS curriculum_overrides (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  lesson_id TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  level TEXT,
  review_status TEXT NOT NULL DEFAULT 'unverified',
  checklist TEXT NOT NULL DEFAULT '{}',
  review_note TEXT NOT NULL DEFAULT '',
  reviewer_id INTEGER,
  reviewed_at TEXT,
  custom_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS module_overrides (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  module_id TEXT NOT NULL,
  title TEXT,
  tagline TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, module_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  user_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oidc_states (
  state TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  next TEXT NOT NULL DEFAULT '/dashboard',
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_user ON quiz_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_sub_user ON submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_ov_tenant ON curriculum_overrides(tenant_id);
`);

const now = () => new Date().toISOString();

// Small forward migration: content_json was added after the first deployment.
try {
  const cols = db.prepare('PRAGMA table_info(curriculum_overrides)').all().map((c) => c.name);
  if (!cols.includes('content_json')) db.exec('ALTER TABLE curriculum_overrides ADD COLUMN content_json TEXT');
} catch (e) {
  console.error('[migrate]', e.message);
}
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

/* ------------------------------------------------------------------ *
 * Content
 * ------------------------------------------------------------------ */
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8'));
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

let CURRICULUM = { modules: [], lessons: {}, quizzes: {}, assignments: [] };
function loadContent() {
  CURRICULUM = readJson('curriculum.json');
  CURRICULUM.lessons = CURRICULUM.lessons || {};
  CURRICULUM.quizzes = CURRICULUM.quizzes || {};
  CURRICULUM.assignments = CURRICULUM.assignments || [];
}
loadContent();
const PRE = readJson('preassessment.json', { questions: [] });
const REFERENCES = readJson('references.json', { ports: [], linux: [], windows: [], filters: [], eventIds: [], vulnerabilities: [], projects: [] });
const RESOURCES = readJson('resources.json', { items: [], note: '' });

const lessonList = () => Object.values(CURRICULUM.lessons).sort((a, b) => a.seq - b.seq);
const moduleList = () => [...CURRICULUM.modules].sort((a, b) => a.seq - b.seq);
const assignmentList = () => [...CURRICULUM.assignments].sort((a, b) => a.day - b.day);
const lessonById = (id) => CURRICULUM.lessons[id] || null;

/* ------------------------------------------------------------------ *
 * Auth helpers
 * ------------------------------------------------------------------ */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
function newToken() {
  return crypto.randomBytes(32).toString('hex');
}
function publicUser(user) {
  if (!user) return null;
  const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    cohort: user.cohort,
    profile: safeParse(user.profile, {}),
    preScore: user.pre_score,
    tenant: tenant ? tenantPublic(tenant) : null,
  };
}
function tenantPublic(t) {
  return {
    slug: t.slug,
    name: t.name,
    tagline: t.tagline,
    logo: t.logo,
    primary: t.primary_color,
    accent: t.accent_color,
    signatory: t.signatory,
    signatoryTitle: t.signatory_title,
    certTitle: t.cert_title,
    passPct: t.pass_pct,
    attempts: t.attempts,
    certPct: t.cert_pct,
  };
}
function safeParse(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

const EMPTY_REVIEW = { status: 'unverified', checklist: {}, note: '', reviewer: null, reviewedAt: null };

function reviewOf(ov) {
  if (!ov) return { ...EMPTY_REVIEW };
  const reviewer = ov.reviewer_id ? one('SELECT name FROM users WHERE id = ?', ov.reviewer_id) : null;
  return {
    status: ov.review_status || 'unverified',
    checklist: safeParse(ov.checklist, {}),
    note: ov.review_note || '',
    reviewer: reviewer ? reviewer.name : null,
    reviewedAt: ov.reviewed_at || null,
  };
}

/* Base curriculum + this tenant's additions, removals and review state. */
function contentFor(tenantId) {
  const base = structuredClone(CURRICULUM);
  for (const lesson of Object.values(base.lessons)) lesson.review = { ...EMPTY_REVIEW };
  if (!tenantId) return base;

  for (const mo of all('SELECT * FROM module_overrides WHERE tenant_id = ?', tenantId)) {
    const mod = base.modules.find((m) => m.id === mo.module_id);
    if (!mod) continue;
    if (mo.title) mod.title = mo.title;
    if (mo.tagline) mod.tagline = mo.tagline;
  }

  const overrides = all('SELECT * FROM curriculum_overrides WHERE tenant_id = ?', tenantId);
  for (const ov of overrides) {
    if (ov.custom_json) {
      const custom = safeParse(ov.custom_json, null);
      if (!custom) continue;
      custom.review = reviewOf(ov);
      custom.custom = true;
      if (ov.level) custom.level = ov.level;
      base.lessons[custom.id] = custom;
      const mod = base.modules.find((m) => m.id === custom.moduleId);
      if (mod && !mod.lessons.includes(custom.id)) mod.lessons.push(custom.id);
      continue;
    }
    const lesson = base.lessons[ov.lesson_id];
    if (!lesson) continue;
    lesson.review = reviewOf(ov);
    if (ov.content_json) {
      const patch = safeParse(ov.content_json, null);
      if (patch) {
        for (const key of ['title', 'subtitle', 'minutes', 'objectives', 'sections']) {
          if (patch[key] !== undefined) lesson[key] = patch[key];
        }
        lesson.edited = true;
      }
    }
    if (ov.level) lesson.level = ov.level;
    if (ov.hidden) {
      delete base.lessons[ov.lesson_id];
      for (const m of base.modules) m.lessons = m.lessons.filter((id) => id !== ov.lesson_id);
    }
  }
  return base;
}

function audit(tenantId, userId, action, target, detail) {
  run('INSERT INTO audit_log (tenant_id,user_id,action,target,detail,created_at) VALUES (?,?,?,?,?,?)',
    tenantId, userId, action, target || null, detail ? JSON.stringify(detail) : null, now());
}

function requireContent(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!['admin', 'owner', 'coordinator'].includes(user.role)) {
    send(res, 403, { error: 'Course coordinator or administrator access required.' });
    return null;
  }
  return user;
}
function cookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
function currentUser(req) {
  const token = cookies(req).sid;
  if (!token) return null;
  const session = one('SELECT * FROM sessions WHERE token = ?', token);
  if (!session) return null;
  if (session.expires_at < Date.now()) {
    run('DELETE FROM sessions WHERE token = ?', token);
    return null;
  }
  return one('SELECT * FROM users WHERE id = ?', session.user_id) || null;
}
function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    send(res, 401, { error: 'Please sign in to continue.' });
    return null;
  }
  return user;
}
function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin' && user.role !== 'owner') {
    send(res, 403, { error: 'Admin access required.' });
    return null;
  }
  return user;
}

/* ------------------------------------------------------------------ *
 * HTTP plumbing
 * ------------------------------------------------------------------ */
function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  const isJson = !(typeof body === 'string' || Buffer.isBuffer(body));
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(payload);
}
const oidc = createOidc({ one, run, now, send, newToken, hashPassword, baseUrl: APP_BASE_URL });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
};

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || !path.extname(rel)) rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, html) => {
        if (err2) return send(res, 404, 'Not found');
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    res.end(data);
  });
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */
function bestQuizScores(userId) {
  const rows = all(
    `SELECT quiz_id, MAX(score * 100.0 / total) AS pct, COUNT(*) AS tries
       FROM quiz_attempts WHERE user_id = ? GROUP BY quiz_id`,
    userId
  );
  const out = {};
  for (const r of rows) out[r.quiz_id] = { pct: Math.round(r.pct * 10) / 10, tries: r.tries };
  return out;
}
function gradedSubmissions(userId) {
  const rows = all('SELECT * FROM submissions WHERE user_id = ?', userId);
  const out = {};
  for (const r of rows) out[r.assignment_id] = r;
  return out;
}
function computeProgress(user) {
  const content = contentFor(user.tenant_id);
  const modules = [...content.modules].sort((a, b) => a.seq - b.seq);
  const quizzes = bestQuizScores(user.id);
  const subs = gradedSubmissions(user.id);
  const lessonsDone = new Set(all('SELECT lesson_id FROM lesson_progress WHERE user_id = ?', user.id).map((r) => r.lesson_id));
  const assignments = assignmentList();

  const quizPcts = modules.map((m) => (quizzes[m.quiz] ? quizzes[m.quiz].pct : 0));
  const quizAvg = quizPcts.length ? quizPcts.reduce((a, b) => a + b, 0) / quizPcts.length : 0;

  let earned = 0;
  let gradedCount = 0;
  let strongAssignments = 0;
  for (const a of assignments) {
    const sub = subs[a.id];
    if (sub && typeof sub.score === 'number') {
      earned += sub.score;
      gradedCount += 1;
      if (sub.score >= 70) strongAssignments += 1;
    }
  }
  const assignmentAvg = assignments.length ? earned / assignments.length : 0;
  const overall = Math.round((quizAvg * 0.5 + assignmentAvg * 0.5) * 10) / 10;
  const quizzesPassed = modules.filter((m) => (quizzes[m.quiz]?.pct || 0) >= (m.passPct || 70)).length;
  const points = Math.round(quizAvg * 10 + assignmentAvg * 10 + lessonsDone.size * 2);

  const eligible =
    overall >= (user.tenant_cert_pct || 80) &&
    quizzesPassed === modules.length &&
    strongAssignments >= Math.ceil(assignments.length * 0.8);

  return {
    lessonsDone: lessonsDone.size,
    lessonsTotal: Object.keys(content.lessons).length,
    quizAvg: Math.round(quizAvg * 10) / 10,
    quizzes,
    quizzesPassed,
    quizzesTotal: modules.length,
    assignmentsGraded: gradedCount,
    assignmentsTotal: assignments.length,
    assignmentAvg: Math.round(assignmentAvg * 10) / 10,
    strongAssignments,
    overall,
    points,
    eligible,
    submissions: subs,
    completedLessons: [...lessonsDone],
  };
}

function ensureCertificate(user, progress) {
  if (!progress.eligible) return null;
  let cert = one('SELECT * FROM certificates WHERE user_id = ?', user.id);
  if (cert) return cert;
  const code = 'L1-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  run(
    'INSERT INTO certificates (user_id, code, overall_pct, issued_at) VALUES (?,?,?,?)',
    user.id, code, progress.overall, now()
  );
  return one('SELECT * FROM certificates WHERE user_id = ?', user.id);
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */
async function api(req, res, url) {
  const p = url.pathname;
  const q = url.searchParams;
  const method = req.method;

  /* public: health + setup */
  if (p === '/api/health') return send(res, 200, { ok: true, time: now() });

  if (p === '/api/auth/config') {
    return send(res, 200, { ...oidc.config(), localLogin: oidc.config().localLogin });
  }

  if (p === '/api/setup/status') {
    const count = one('SELECT COUNT(*) AS n FROM tenants').n;
    return send(res, 200, { needsSetup: count === 0 });
  }

  if (p === '/api/setup' && method === 'POST') {
    if (one('SELECT COUNT(*) AS n FROM tenants').n > 0) return send(res, 409, { error: 'Already configured.' });
    const b = await readBody(req);
    const required = ['company', 'slug', 'adminName', 'adminEmail', 'adminPassword'];
    for (const key of required) if (!b[key]) return send(res, 400, { error: `Missing ${key}` });
    if (String(b.adminPassword).length < 8) return send(res, 400, { error: 'Password must be at least 8 characters.' });
    const tenantId = Number(run(
      `INSERT INTO tenants (slug,name,tagline,logo,primary_color,accent_color,signatory,signatory_title,cert_title,pass_pct,attempts,cert_pct,invite_code,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      String(b.slug).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      b.company,
      b.tagline || 'L1 → L2 readiness programme',
      b.logo || '',
      b.primary || '#4f7cff',
      b.accent || '#22d3a6',
      b.signatory || '',
      b.signatoryTitle || '',
      b.certTitle || 'Certificate of Completion',
      Number(b.passPct ?? 70),
      Number(b.attempts ?? 3),
      Number(b.certPct ?? 80),
      String(b.inviteCode || 'JOIN').toUpperCase(),
      now()
    ).lastInsertRowid);
    const userId = Number(run(
      'INSERT INTO users (tenant_id,email,name,pass_hash,role,created_at) VALUES (?,?,?,?,?,?)',
      tenantId, String(b.adminEmail).toLowerCase(), b.adminName, hashPassword(b.adminPassword), 'owner', now()
    ).lastInsertRowid);
    const token = newToken();
    run('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)', token, userId, Date.now() + 30 * 864e5);
    res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);
    return send(res, 200, { ok: true, user: publicUser(one('SELECT * FROM users WHERE id = ?', userId)) });
  }

  /* public: tenant + content */
  if (p === '/api/site') {
    const slug = q.get('t');
    const tenant = slug
      ? one('SELECT * FROM tenants WHERE slug = ?', slug)
      : one('SELECT * FROM tenants ORDER BY id LIMIT 1');
    if (!tenant) return send(res, 404, { error: 'No tenant configured yet.' });
    return send(res, 200, { tenant: tenantPublic(tenant) });
  }

  if (p === '/api/content') {
    const viewer = currentUser(req);
    const content = contentFor(viewer ? viewer.tenant_id : null);
    const viewerTenant = viewer ? one('SELECT * FROM tenants WHERE id = ?', viewer.tenant_id) : null;
    const passMark = viewerTenant ? viewerTenant.pass_pct : null;
    const strip = (quiz) => ({
      id: quiz.id,
      moduleId: quiz.moduleId,
      title: quiz.title,
      passPct: passMark || quiz.passPct,
      count: quiz.questions.length,
      minutes: quiz.minutes || 12,
    });
    const quizzes = {};
    for (const [id, quiz] of Object.entries(CURRICULUM.quizzes)) quizzes[id] = strip(quiz);
    return send(res, 200, {
      modules: [...content.modules].sort((a, b) => a.seq - b.seq).map((m) => ({
        id: m.id, seq: m.seq, title: m.title, tagline: m.tagline, color: m.color,
        icon: m.icon, days: m.days, lessons: m.lessons, quiz: m.quiz,
        sheetTopics: m.sheetTopics || [],
      })),
      lessons: content.lessons,
      quizzes,
      assignments: assignmentList().map((a) => ({
        id: a.id, day: a.day, moduleId: a.moduleId, title: a.title, level: a.level,
        minutes: a.minutes, scenario: a.scenario, task: a.task, deliverable: a.deliverable,
        rubric: a.rubric, hints: a.hints || [], tools: a.tools || [],
      })),
      references: {
        ports: REFERENCES.ports,
        linux: REFERENCES.linux,
        windows: REFERENCES.windows,
        filters: REFERENCES.filters,
        eventIds: REFERENCES.eventIds,
        vulnerabilities: REFERENCES.vulnerabilities,
        projects: REFERENCES.projects,
      },
      resources: RESOURCES,
      preassessment: { title: PRE.title, intro: PRE.intro, questions: PRE.questions.map((x) => ({ id: x.id, q: x.q, options: x.options, tag: x.tag })) },
    });
  }

  /* auth */
  if (p === '/api/auth/register' && method === 'POST') {
    const b = await readBody(req);
    const tenant = one('SELECT * FROM tenants WHERE slug = ?', String(b.tenant || '').toLowerCase());
    if (!tenant) return send(res, 400, { error: 'Unknown company code.' });
    if (String(b.inviteCode || '').toUpperCase() !== tenant.invite_code) return send(res, 403, { error: 'Invalid invite code. Ask your training admin.' });
    if (!b.email || !b.name || !b.password) return send(res, 400, { error: 'Name, email and password are required.' });
    if (String(b.password).length < 8) return send(res, 400, { error: 'Password must be at least 8 characters.' });
    const exists = one('SELECT id FROM users WHERE tenant_id = ? AND email = ?', tenant.id, String(b.email).toLowerCase());
    if (exists) return send(res, 409, { error: 'That email is already registered.' });
    const userId = Number(run(
      'INSERT INTO users (tenant_id,email,name,pass_hash,role,cohort,created_at) VALUES (?,?,?,?,?,?,?)',
      tenant.id, String(b.email).toLowerCase(), b.name, hashPassword(b.password), 'learner', b.cohort || 'Cohort 1', now()
    ).lastInsertRowid);
    const token = newToken();
    run('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)', token, userId, Date.now() + 30 * 864e5);
    res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);
    return send(res, 200, { user: publicUser(one('SELECT * FROM users WHERE id = ?', userId)) });
  }

  if (p === '/api/auth/login' && method === 'POST') {
    const b = await readBody(req);
    let user;
    if (b.tenant) {
      const tenant = one('SELECT * FROM tenants WHERE slug = ?', String(b.tenant).toLowerCase());
      if (!tenant) return send(res, 401, { error: 'Unknown company code.' });
      user = one('SELECT * FROM users WHERE tenant_id = ? AND email = ?', tenant.id, String(b.email || '').toLowerCase());
    } else {
      user = one('SELECT * FROM users WHERE email = ?', String(b.email || '').toLowerCase());
    }
    if (!user || !verifyPassword(b.password, user.pass_hash)) return send(res, 401, { error: 'Wrong email or password.' });
    const token = newToken();
    run('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)', token, user.id, Date.now() + 30 * 864e5);
    res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}`);
    return send(res, 200, { user: publicUser(user) });
  }

  if (p === '/api/auth/logout' && method === 'POST') {
    run('DELETE FROM sessions WHERE token = ?', cookies(req).sid || '');
    res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return send(res, 200, { ok: true });
  }

  if (p === '/api/me') {
    const user = currentUser(req);
    if (!user) return send(res, 200, { user: null });
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const progress = computeProgress({ ...user, tenant_cert_pct: tenant.cert_pct });
    return send(res, 200, {
      user: publicUser(user),
      progress: {
        lessonsDone: progress.lessonsDone,
        lessonsTotal: progress.lessonsTotal,
        quizAvg: progress.quizAvg,
        quizzes: progress.quizzes,
        quizzesPassed: progress.quizzesPassed,
        quizzesTotal: progress.quizzesTotal,
        assignmentsGraded: progress.assignmentsGraded,
        assignmentsTotal: progress.assignmentsTotal,
        assignmentAvg: progress.assignmentAvg,
        overall: progress.overall,
        points: progress.points,
        eligible: progress.eligible,
        completedLessons: progress.completedLessons,
        submissions: Object.fromEntries(
          Object.entries(progress.submissions).map(([k, v]) => [k, { status: v.status, score: v.score, feedback: v.feedback, rubric: safeParse(v.rubric, []), evidence: v.evidence, updated_at: v.updated_at }])
        ),
      },
    });
  }

  if (p === '/api/profile/assessment' && method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    const b = await readBody(req);
    const answers = Array.isArray(b.answers) ? b.answers : [];
    const byTag = {};
    let correct = 0;
    for (const question of PRE.questions) {
      const picked = answers[question.id];
      const ok = picked === question.answer;
      if (ok) correct += 1;
      const t = question.tag || 'general';
      byTag[t] = byTag[t] || { correct: 0, total: 0 };
      byTag[t].total += 1;
      if (ok) byTag[t].correct += 1;
    }
    const domains = Object.entries(byTag).map(([tag, v]) => ({
      tag,
      pct: Math.round((v.correct / v.total) * 100),
      correct: v.correct,
      total: v.total,
    })).sort((a, b2) => a.pct - b2.pct);
    const scorePct = PRE.questions.length ? Math.round((correct / PRE.questions.length) * 100) : 0;
    const profile = {
      scorePct,
      correct,
      total: PRE.questions.length,
      domains,
      weakest: domains.slice(0, 3).map((d) => d.tag),
      track: recommendTrack(domains, scorePct),
      takenAt: now(),
    };
    run('UPDATE users SET profile = ?, pre_score = ? WHERE id = ?', JSON.stringify(profile), scorePct, user.id);
    return send(res, 200, { profile });
  }

  /* lesson progress */
  if (p.startsWith('/api/lesson/') && p.endsWith('/complete') && method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    const lessonId = p.split('/')[3];
    if (!contentFor(user.tenant_id).lessons[lessonId]) return send(res, 404, { error: 'Unknown lesson.' });
    run(
      'INSERT INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?,?,?) ON CONFLICT(user_id,lesson_id) DO NOTHING',
      user.id, lessonId, now()
    );
    return send(res, 200, { ok: true });
  }

  /* quiz */
  if (p.startsWith('/api/quiz/') && method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    const parts = p.split('/');
    const quizId = parts[3];
    const quiz = CURRICULUM.quizzes[quizId];
    if (!quiz) return send(res, 404, { error: 'Unknown quiz.' });
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const attempts = all('SELECT * FROM quiz_attempts WHERE user_id = ? AND quiz_id = ? ORDER BY attempt_no', user.id, quizId);
    const best = attempts.reduce((m, a) => Math.max(m, (a.score / a.total) * 100), 0);
    return send(res, 200, {
      id: quiz.id,
      title: quiz.title,
      moduleId: quiz.moduleId,
      passPct: tenant.pass_pct,
      attemptsUsed: attempts.length,
      attemptsAllowed: tenant.attempts,
      best: Math.round(best * 10) / 10,
      questions: quiz.questions.map((x) => ({ id: x.id, q: x.q, options: x.options, tag: x.tag })),
    });
  }

  if (p.startsWith('/api/quiz/') && p.endsWith('/submit') && method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    const quizId = p.split('/')[3];
    const quiz = CURRICULUM.quizzes[quizId];
    if (!quiz) return send(res, 404, { error: 'Unknown quiz.' });
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const attempts = all('SELECT * FROM quiz_attempts WHERE user_id = ? AND quiz_id = ?', user.id, quizId);
    if (attempts.length >= tenant.attempts) return send(res, 403, { error: `No attempts left (${tenant.attempts} max).` });
    const b = await readBody(req);
    const answers = b.answers || {};
    let score = 0;
    const detail = [];
    for (const question of quiz.questions) {
      const picked = Number(answers[question.id]);
      const ok = picked === question.answer;
      if (ok) score += 1;
      detail.push({ id: question.id, picked, ok, answer: question.answer, explain: question.explain });
    }
    const total = quiz.questions.length;
    const attemptNo = attempts.length + 1;
    run(
      'INSERT INTO quiz_attempts (user_id,quiz_id,attempt_no,score,total,detail,created_at) VALUES (?,?,?,?,?,?,?)',
      user.id, quizId, attemptNo, score, total, JSON.stringify(detail), now()
    );
    const pct = Math.round((score / total) * 1000) / 10;
    return send(res, 200, {
      score,
      total,
      pct,
      passed: pct >= tenant.pass_pct,
      attemptNo,
      attemptsLeft: tenant.attempts - attemptNo,
      detail,
    });
  }

  /* assignments */
  if (p === '/api/assignments' && method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    const subs = gradedSubmissions(user.id);
    return send(res, 200, {
      assignments: assignmentList(),
      submissions: subs,
    });
  }

  if (p === '/api/assignments/submit' && method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    const b = await readBody(req);
    const assignment = CURRICULUM.assignments.find((a) => a.id === b.assignmentId);
    if (!assignment) return send(res, 404, { error: 'Unknown assignment.' });
    if (!b.evidence || String(b.evidence).trim().length < 20) {
      return send(res, 400, { error: 'Paste your evidence (commands + output + what you concluded). At least 20 characters.' });
    }
    const existing = one('SELECT * FROM submissions WHERE user_id = ? AND assignment_id = ?', user.id, assignment.id);
    if (existing && existing.status === 'graded') {
      return send(res, 409, { error: 'Already graded. Ask your mentor to reopen it.' });
    }
    if (existing) {
      run('UPDATE submissions SET evidence = ?, status = ?, updated_at = ? WHERE id = ?', String(b.evidence), 'submitted', now(), existing.id);
    } else {
      run(
        'INSERT INTO submissions (user_id,assignment_id,evidence,status,rubric,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
        user.id, assignment.id, String(b.evidence), 'submitted', '[]', now(), now()
      );
    }
    return send(res, 200, { ok: true });
  }

  /* leaderboard */
  if (p === '/api/leaderboard') {
    const user = requireUser(req, res);
    if (!user) return;
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const users = all('SELECT * FROM users WHERE tenant_id = ? AND role = ?', tenant.id, 'learner');
    const rows = users.map((u) => {
      const prog = computeProgress({ ...u, tenant_cert_pct: tenant.cert_pct });
      const cert = one('SELECT code FROM certificates WHERE user_id = ?', u.id);
      return {
        id: u.id,
        name: u.name,
        cohort: u.cohort,
        points: prog.points,
        overall: prog.overall,
        lessonsDone: prog.lessonsDone,
        quizzesPassed: prog.quizzesPassed,
        assignmentsGraded: prog.assignmentsGraded,
        strongAssignments: prog.strongAssignments,
        eligible: prog.eligible,
        certCode: cert ? cert.code : null,
        isMe: u.id === user.id,
      };
    }).sort((a, b) => b.points - a.points || b.overall - a.overall || a.name.localeCompare(b.name));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return send(res, 200, { leaderboard: rows, me: rows.find((r) => r.isMe) || null });
  }

  /* certificate */
  if (p === '/api/certificate') {
    const user = requireUser(req, res);
    if (!user) return;
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const progress = computeProgress({ ...user, tenant_cert_pct: tenant.cert_pct });
    const cert = ensureCertificate({ ...user, tenant_cert_pct: tenant.cert_pct }, progress);
    return send(res, 200, {
      eligible: progress.eligible,
      overall: progress.overall,
      quizzesPassed: progress.quizzesPassed,
      strongAssignments: progress.strongAssignments,
      certificate: cert ? { code: cert.code, issuedAt: cert.issued_at, overall: cert.overall_pct } : null,
      tenant: tenantPublic(tenant),
      learner: { name: user.name, cohort: user.cohort },
      modules: moduleList().map((m) => ({ title: m.title, pct: progress.quizzes[m.quiz]?.pct || 0 })),
    });
  }

  if (p.startsWith('/api/verify/')) {
    const code = decodeURIComponent(p.split('/')[3] || '').toUpperCase();
    const cert = one('SELECT * FROM certificates WHERE code = ?', code);
    if (!cert) return send(res, 404, { valid: false });
    const user = one('SELECT * FROM users WHERE id = ?', cert.user_id);
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    return send(res, 200, {
      valid: true,
      code: cert.code,
      issuedAt: cert.issued_at,
      overall: cert.overall_pct,
      learner: user.name,
      company: tenant.name,
      certTitle: tenant.cert_title,
      signatory: tenant.signatory,
      modules: moduleList().length,
    });
  }


  /* ---------------- curriculum (coordinator / admin) ---------------- */
  const LEVELS = ['Core', 'Applying', 'Diagnosing', 'Complex'];
  const CHECKLIST_KEYS = ['accuracy', 'commands', 'video', 'diagram', 'scenario'];

  function upsertOverride(tenantId, lessonId, patch) {
    const existing = one('SELECT * FROM curriculum_overrides WHERE tenant_id = ? AND lesson_id = ?', tenantId, lessonId);
    if (existing) {
      const fields = Object.keys(patch);
      if (!fields.length) return existing;
      run(`UPDATE curriculum_overrides SET ${fields.map((f) => `${f} = ?`).join(', ')}, updated_at = ? WHERE tenant_id = ? AND lesson_id = ?`,
        ...fields.map((f) => patch[f]), now(), tenantId, lessonId);
      return one('SELECT * FROM curriculum_overrides WHERE tenant_id = ? AND lesson_id = ?', tenantId, lessonId);
    }
    run(`INSERT INTO curriculum_overrides (tenant_id,lesson_id,hidden,level,review_status,checklist,review_note,reviewer_id,reviewed_at,custom_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      tenantId, lessonId, patch.hidden ?? 0, patch.level ?? null, patch.review_status ?? 'unverified',
      patch.checklist ?? '{}', patch.review_note ?? '', patch.reviewer_id ?? null, patch.reviewed_at ?? null,
      patch.custom_json ?? null, now(), now());
    return one('SELECT * FROM curriculum_overrides WHERE tenant_id = ? AND lesson_id = ?', tenantId, lessonId);
  }

  if (p === '/api/admin/curriculum' && method === 'GET') {
    const user = requireContent(req, res);
    if (!user) return;
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const ovs = all('SELECT * FROM curriculum_overrides WHERE tenant_id = ?', tenant.id);
    const ovMap = Object.fromEntries(ovs.map((o) => [o.lesson_id, o]));

    const rows = [];
    for (const [id, lesson] of Object.entries(CURRICULUM.lessons)) {
      const ov = ovMap[id];
      rows.push({
        id, moduleId: lesson.moduleId, seq: lesson.seq, title: lesson.title,
        minutes: lesson.minutes, level: (ov && ov.level) || lesson.level,
        originalLevel: lesson.level, hidden: Boolean(ov && ov.hidden), custom: false,
        edited: Boolean(ov && ov.content_json),
        review: reviewOf(ov),
      });
    }
    for (const ov of ovs.filter((o) => o.custom_json)) {
      const lesson = safeParse(ov.custom_json, null);
      if (!lesson) continue;
      rows.push({
        id: lesson.id, moduleId: lesson.moduleId, seq: lesson.seq, title: lesson.title,
        minutes: lesson.minutes, level: (ov.level) || lesson.level, originalLevel: lesson.level,
        hidden: false, custom: true, review: reviewOf(ov),
      });
    }

    const quizzes = {};
    for (const [id, quiz] of Object.entries(CURRICULUM.quizzes)) {
      const moduleId = quiz.moduleId;
      quizzes[id] = {
        id, moduleId, title: quiz.title, passPct: tenant.pass_pct,
        attempts: tenant.attempts, minutes: quiz.minutes || 12,
        questions: quiz.questions.length,
        byTag: quiz.questions.reduce((acc, q) => { acc[q.tag || 'general'] = (acc[q.tag || 'general'] || 0) + 1; return acc; }, {}),
      };
    }

    const complexity = {};
    for (const r of rows) {
      complexity[r.moduleId] = complexity[r.moduleId] || { Core: 0, Applying: 0, Diagnosing: 0, Complex: 0 };
      complexity[r.moduleId][r.level] = (complexity[r.moduleId][r.level] || 0) + 1;
    }

    const merged = contentFor(tenant.id);
    return send(res, 200, {
      modules: [...merged.modules].sort((a, b) => a.seq - b.seq).map((m) => ({
        id: m.id, seq: m.seq, title: m.title, tagline: m.tagline, quiz: m.quiz,
        quizPassPct: CURRICULUM.quizzes[m.quiz]?.passPct || tenant.pass_pct,
        attempts: tenant.attempts,
        lessons: rows.filter((r) => r.moduleId === m.id && !r.hidden).length,
        hidden: rows.filter((r) => r.moduleId === m.id && r.hidden).length,
        complexity: complexity[m.id] || { Core: 0, Applying: 0, Diagnosing: 0, Complex: 0 },
      })),
      lessons: rows.sort((a, b) => (a.moduleId.localeCompare(b.moduleId) || a.seq - b.seq)),
      quizzes,
      grading: {
        passPct: tenant.pass_pct, attempts: tenant.attempts, certPct: tenant.cert_pct,
        quizWeight: 50, drillWeight: 50,
        certificateRule: `overall >= ${tenant.cert_pct}% AND all 8 modules >= ${tenant.pass_pct}% AND 32+ drills >= 70`,
      },
      assignments: assignmentList().map((a) => ({ id: a.id, day: a.day, moduleId: a.moduleId, title: a.title, level: a.level, weights: a.rubric.map((r) => r.weight) })),
      audit: all('SELECT a.*, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.tenant_id = ? ORDER BY a.id DESC LIMIT 12', tenant.id),
    });
  }

  if (p === '/api/admin/topics' && method === 'POST') {
    const user = requireContent(req, res);
    if (!user) return;
    const b = await readBody(req);
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const mod = CURRICULUM.modules.find((m) => m.id === b.moduleId);
    if (!mod) return send(res, 400, { error: 'Choose a module.' });
    const title = String(b.title || '').trim();
    const body = String(b.body || '').trim();
    if (title.length < 5) return send(res, 400, { error: 'Topic title needs at least 5 characters.' });
    if (body.length < 80) return send(res, 400, { error: 'Write at least 80 characters of teaching text so the lesson is usable.' });
    const level = LEVELS.includes(b.level) ? b.level : 'Core';
    const minutes = Math.max(5, Math.min(60, Number(b.minutes) || 12));
    let video = null;
    if (b.videoUrl) {
      const m = String(b.videoUrl).match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
      if (!m) return send(res, 400, { error: 'Video must be a YouTube watch URL, or leave it empty.' });
      video = { title: String(b.videoTitle || title), channel: 'Coordinator selection', url: String(b.videoUrl), start: 0, why: 'Added by the course coordinator.' };
    }
    const id = 'c-' + crypto.randomBytes(4).toString('hex');
    const existing = Object.values(contentFor(tenant.id).lessons).filter((l) => l.moduleId === mod.id);
    const seq = existing.reduce((max, l) => Math.max(max, l.seq || 0), 0) + 1;
    const topics = String(b.topics || '').split(',').map((t) => t.trim()).filter(Boolean);
    const objectives = String(b.objectives || '').split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 5);
    const lesson = {
      id, moduleId: mod.id, seq, title,
      subtitle: String(b.subtitle || '').trim() || 'A coordinator-added topic.',
      minutes, level, kind: 'Custom topic',
      objectives: objectives.length ? objectives : [`Explain ${title} in plain language.`, 'Run the check that proves it on a real machine.'],
      ticket: {
        from: 'Course coordinator',
        subject: String(b.ticketSubject || '').trim() || `Question about ${title}`,
        body: String(b.ticketBody || '').trim() || 'Added by the coordinator as a local topic. Treat this as the work order and collect evidence before escalating.',
        impact: '',
      },
      sections: [{ h: String(b.heading || 'What this topic covers').trim(), body }],
      diagram: null,
      video,
      commands: [],
      pitfalls: [],
      takeaways: objectives.slice(0, 3),
      drill: { prompt: 'Run the check you would use on a call, and paste the output.', minutes: 10, checklist: ['The command or configuration is named.', 'The output is pasted.', 'The decision rule is stated.', 'The escalation boundary is named.'] },
      sheetTopics: topics,
      custom: true,
    };
    upsertOverride(tenant.id, id, { custom_json: JSON.stringify(lesson), review_status: 'draft' });
    audit(tenant.id, user.id, 'topic.add', id, { title, moduleId: mod.id });
    return send(res, 200, { lesson });
  }

  if (p.startsWith('/api/admin/topics/') && p.endsWith('/hide') && method === 'POST') {
    const user = requireContent(req, res);
    if (!user) return;
    const id = decodeURIComponent(p.split('/')[4]);
    const b = await readBody(req);
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const isCustom = one('SELECT * FROM curriculum_overrides WHERE tenant_id = ? AND lesson_id = ? AND custom_json IS NOT NULL', tenant.id, id);
    if (isCustom) return send(res, 400, { error: 'Custom topics are deleted, not hidden.' });
    if (!CURRICULUM.lessons[id]) return send(res, 404, { error: 'Unknown topic.' });
    upsertOverride(tenant.id, id, { hidden: b.hidden ? 1 : 0 });
    audit(tenant.id, user.id, b.hidden ? 'topic.hide' : 'topic.unhide', id, null);
    return send(res, 200, { ok: true, hidden: Boolean(b.hidden) });
  }

  if (p.startsWith('/api/admin/topics/') && method === 'DELETE') {
    const user = requireContent(req, res);
    if (!user) return;
    const id = decodeURIComponent(p.split('/')[4]);
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const ov = one('SELECT * FROM curriculum_overrides WHERE tenant_id = ? AND lesson_id = ?', tenant.id, id);
    if (ov && ov.custom_json) {
      run('DELETE FROM curriculum_overrides WHERE tenant_id = ? AND lesson_id = ?', tenant.id, id);
      audit(tenant.id, user.id, 'topic.delete', id, null);
      return send(res, 200, { deleted: true });
    }
    if (!CURRICULUM.lessons[id]) return send(res, 404, { error: 'Unknown topic.' });
    upsertOverride(tenant.id, id, { hidden: 1 });
    audit(tenant.id, user.id, 'topic.hide', id, null);
    return send(res, 200, { hidden: true });
  }


  function sectionsFromMarkdown(markdown, fallbackHeading) {
    const text = String(markdown || '').replace(/\r\n/g, '\n').trim();
    if (!text) return null;
    if (!/^##\s+/m.test(text)) return [{ h: fallbackHeading || 'What this topic covers', body: text }];
    const out = [];
    const preamble = text.split(/^##\s+/m)[0].trim();
    if (preamble) out.push({ h: fallbackHeading || 'Overview', body: preamble });
    for (const part of text.split(/^##\s+/m).slice(1)) {
      const nl = part.indexOf('\n');
      const heading = (nl === -1 ? part : part.slice(0, nl)).trim();
      const body = nl === -1 ? '' : part.slice(nl + 1).trim();
      if (heading) out.push({ h: heading, body });
    }
    return out.length ? out : null;
  }

  if (p.startsWith('/api/admin/modules/') && method === 'POST') {
    const user = requireContent(req, res);
    if (!user) return;
    const moduleId = decodeURIComponent(p.split('/')[4]);
    const baseModule = CURRICULUM.modules.find((m) => m.id === moduleId);
    if (!baseModule) return send(res, 404, { error: 'Unknown module.' });
    const b = await readBody(req);
    const title = String(b.title || '').trim();
    if (title.length < 3 || title.length > 120) return send(res, 400, { error: 'Course name must be 3–120 characters.' });
    const tagline = String(b.tagline || '').slice(0, 200).trim();
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    run(`INSERT INTO module_overrides (tenant_id, module_id, title, tagline, hidden, updated_at)
         VALUES (?,?,?,?,0,?)
         ON CONFLICT(tenant_id, module_id) DO UPDATE SET title = excluded.title, tagline = excluded.tagline, updated_at = excluded.updated_at`,
      tenant.id, moduleId, title, tagline, now());
    audit(tenant.id, user.id, 'module.rename', moduleId, { title });
    return send(res, 200, { ok: true, module: { id: moduleId, title, tagline } });
  }

  if (p.startsWith('/api/admin/topics/') && p.endsWith('/edit') && method === 'POST') {
    const user = requireContent(req, res);
    if (!user) return;
    const lessonId = decodeURIComponent(p.split('/')[4]);
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const current = contentFor(tenant.id).lessons[lessonId];
    if (!current) return send(res, 404, { error: 'Unknown topic.' });
    const b = await readBody(req);
    const title = String(b.title ?? current.title).trim();
    if (title.length < 3 || title.length > 160) return send(res, 400, { error: 'Topic title must be 3–160 characters.' });
    const subtitle = String(b.subtitle ?? current.subtitle ?? '').slice(0, 240).trim();
    const minutes = Math.max(3, Math.min(90, Number(b.minutes) || current.minutes || 12));
    const objectives = String(b.objectives ?? (current.objectives || []).join('\n'))
      .split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6);
    const incomingBody = typeof b.body === 'string' ? b.body : null;
    const sections = incomingBody !== null
      ? sectionsFromMarkdown(incomingBody, current.sections?.[0]?.h)
      : current.sections;
    if (!sections || !sections.length) return send(res, 400, { error: 'Course content cannot be empty.' });
    if (incomingBody !== null && incomingBody.trim().length < 40) return send(res, 400, { error: 'Write at least 40 characters of content.' });

    const existing = one('SELECT * FROM curriculum_overrides WHERE tenant_id = ? AND lesson_id = ?', tenant.id, lessonId);
    const level = LEVELS.includes(b.level) ? b.level : null;
    if (existing && existing.custom_json) {
      const custom = safeParse(existing.custom_json, current);
      Object.assign(custom, { title, subtitle, minutes, objectives, sections });
      if (level) custom.level = level;
      upsertOverride(tenant.id, lessonId, { custom_json: JSON.stringify(custom), review_status: 'in_review', ...(level ? { level } : {}) });
    } else {
      upsertOverride(tenant.id, lessonId, {
        content_json: JSON.stringify({ title, subtitle, minutes, objectives, sections }),
        review_status: 'in_review',
        ...(level ? { level } : {}),
      });
    }
    audit(tenant.id, user.id, 'topic.edit', lessonId, { title });
    return send(res, 200, { ok: true, lesson: contentFor(tenant.id).lessons[lessonId] });
  }

  if (p === '/api/admin/review' && method === 'POST') {
    const user = requireContent(req, res);
    if (!user) return;
    const b = await readBody(req);
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    const content = contentFor(tenant.id);
    if (!content.lessons[b.lessonId]) return send(res, 404, { error: 'Unknown topic.' });
    const status = ['unverified', 'in_review', 'verified', 'changes'].includes(b.status) ? b.status : null;
    if (!status) return send(res, 400, { error: 'Invalid review status.' });
    const checklist = b.checklist && typeof b.checklist === 'object' ? b.checklist : {};
    if (status === 'verified') {
      const missing = CHECKLIST_KEYS.filter((k) => checklist[k] !== true);
      if (missing.length) return send(res, 400, { error: 'Verify only when every checklist item is confirmed: ' + missing.join(', ') });
    }
    upsertOverride(tenant.id, b.lessonId, {
      review_status: status,
      checklist: JSON.stringify(checklist),
      review_note: String(b.note || '').slice(0, 2000),
      reviewer_id: user.id,
      reviewed_at: now(),
    });
    audit(tenant.id, user.id, 'review.' + status, b.lessonId, { note: b.note || '' });
    return send(res, 200, { ok: true, review: reviewOf(one('SELECT * FROM curriculum_overrides WHERE tenant_id = ? AND lesson_id = ?', tenant.id, b.lessonId)) });
  }

  if (p === '/api/admin/complexity' && method === 'POST') {
    const user = requireContent(req, res);
    if (!user) return;
    const b = await readBody(req);
    if (!LEVELS.includes(b.level)) return send(res, 400, { error: 'Level must be Core, Applying, Diagnosing or Complex.' });
    const tenant = one('SELECT * FROM tenants WHERE id = ?', user.tenant_id);
    if (!contentFor(tenant.id).lessons[b.lessonId]) return send(res, 404, { error: 'Unknown topic.' });
    upsertOverride(tenant.id, b.lessonId, { level: b.level });
    audit(tenant.id, user.id, 'complexity.set', b.lessonId, { level: b.level });
    return send(res, 200, { ok: true, level: b.level });
  }

  if (p === '/api/admin/grading' && method === 'POST') {
    const user = requireContent(req, res);
    if (!user) return;
    const b = await readBody(req);
    const passPct = Math.max(50, Math.min(95, Number(b.passPct)));
    const attempts = Math.max(1, Math.min(10, Number(b.attempts)));
    const certPct = Math.max(60, Math.min(100, Number(b.certPct)));
    if ([passPct, attempts, certPct].some((n) => !Number.isFinite(n))) return send(res, 400, { error: 'Grading values must be numbers.' });
    run('UPDATE tenants SET pass_pct = ?, attempts = ?, cert_pct = ? WHERE id = ?', passPct, attempts, certPct, user.tenant_id);
    audit(user.tenant_id, user.id, 'grading.update', 'tenant', { passPct, attempts, certPct });
    return send(res, 200, { ok: true, grading: { passPct, attempts, certPct } });
  }

  if (p === '/api/admin/users' && method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (!['admin', 'owner'].includes(admin.role)) return send(res, 403, { error: 'Admin access required.' });
    const b = await readBody(req);
    const role = ['coordinator', 'learner'].includes(b.role) ? b.role : null;
    if (!role) return send(res, 400, { error: 'Role must be coordinator or learner.' });
    if (!b.name || !b.email || String(b.password || '').length < 8) return send(res, 400, { error: 'Name, email and a password of 8+ characters are required.' });
    const exists = one('SELECT id FROM users WHERE tenant_id = ? AND email = ?', admin.tenant_id, String(b.email).toLowerCase());
    if (exists) return send(res, 409, { error: 'That email already exists in this company.' });
    const id = Number(run(
      'INSERT INTO users (tenant_id,email,name,pass_hash,role,cohort,created_at) VALUES (?,?,?,?,?,?,?)',
      admin.tenant_id, String(b.email).toLowerCase(), b.name, hashPassword(b.password), role, b.cohort || 'Cohort 1', now()
    ).lastInsertRowid);
    audit(admin.tenant_id, admin.id, 'user.create', String(id), { role, email: b.email });
    return send(res, 200, { user: publicUser(one('SELECT * FROM users WHERE id = ?', id)) });
  }

  /* ---------------- admin ---------------- */
  if (p === '/api/admin/overview' && method === 'GET') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const tenant = one('SELECT * FROM tenants WHERE id = ?', admin.tenant_id);
    const learners = all('SELECT * FROM users WHERE tenant_id = ? AND role = ?', tenant.id, 'learner');
    const submissions = all(
      `SELECT s.*, u.name AS learner FROM submissions s JOIN users u ON u.id = s.user_id
       WHERE u.tenant_id = ? ORDER BY CASE s.status WHEN 'submitted' THEN 0 ELSE 1 END, s.created_at DESC`, tenant.id
    );
    return send(res, 200, {
      tenant: { ...tenantPublic(tenant), inviteCode: tenant.invite_code },
      counts: {
        learners: learners.length,
        pending: submissions.filter((s) => s.status === 'submitted').length,
        graded: submissions.filter((s) => s.status === 'graded').length,
      },
      submissions: submissions.map((s) => ({
        id: s.id, learner: s.learner, assignmentId: s.assignment_id, status: s.status,
        score: s.score, evidence: s.evidence, feedback: s.feedback, rubric: safeParse(s.rubric, []),
        createdAt: s.created_at, updatedAt: s.updated_at,
      })),
    });
  }

  if (p === '/api/admin/tenant' && method === 'PUT') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const b = await readBody(req);
    const fields = {
      name: b.name, tagline: b.tagline, logo: b.logo, primary_color: b.primary, accent_color: b.accent,
      signatory: b.signatory, signatory_title: b.signatoryTitle, cert_title: b.certTitle,
      pass_pct: b.passPct, attempts: b.attempts, cert_pct: b.certPct, invite_code: b.inviteCode,
    };
    const sets = [];
    const vals = [];
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) { sets.push(`${k} = ?`); vals.push(v); }
    }
    if (!sets.length) return send(res, 400, { error: 'Nothing to update.' });
    run(`UPDATE tenants SET ${sets.join(', ')} WHERE id = ?`, ...vals, admin.tenant_id);
    const t = one('SELECT * FROM tenants WHERE id = ?', admin.tenant_id);
    return send(res, 200, { tenant: { ...tenantPublic(t), inviteCode: t.invite_code } });
  }

  if (p === '/api/admin/grade' && method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const b = await readBody(req);
    const sub = one(
      `SELECT s.* FROM submissions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND u.tenant_id = ?`,
      Number(b.id), admin.tenant_id
    );
    if (!sub) return send(res, 404, { error: 'Submission not found in your company.' });
    const score = Math.max(0, Math.min(100, Math.round(Number(b.score))));
    run(
      'UPDATE submissions SET score = ?, feedback = ?, status = ?, rubric = ?, graded_by = ?, graded_at = ?, updated_at = ? WHERE id = ?',
      score, String(b.feedback || ''), 'graded', JSON.stringify(b.rubric || []), admin.id, now(), now(), sub.id
    );
    const learner = one('SELECT * FROM users WHERE id = ?', sub.user_id);
    const tenant = one('SELECT * FROM tenants WHERE id = ?', admin.tenant_id);
    const progress = computeProgress({ ...learner, tenant_cert_pct: tenant.cert_pct });
    ensureCertificate({ ...learner, tenant_cert_pct: tenant.cert_pct }, progress);
    return send(res, 200, { ok: true, score });
  }

  if (p === '/api/admin/roster' && method === 'GET') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const tenant = one('SELECT * FROM tenants WHERE id = ?', admin.tenant_id);
    const learners = all('SELECT * FROM users WHERE tenant_id = ? ORDER BY role, name', tenant.id);
    return send(res, 200, {
      roster: learners.map((u) => {
        const prog = computeProgress({ ...u, tenant_cert_pct: tenant.cert_pct });
        return {
          id: u.id, name: u.name, email: u.email, role: u.role, cohort: u.cohort,
          preScore: u.pre_score, profile: safeParse(u.profile, {}),
          overall: prog.overall, points: prog.points, quizzesPassed: prog.quizzesPassed,
          assignmentsGraded: prog.assignmentsGraded, lessonsDone: prog.lessonsDone, eligible: prog.eligible,
        };
      }),
    });
  }

  if (p === '/api/admin/import' && method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const b = await readBody(req);
    const lines = String(b.csv || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const created = [];
    const skipped = [];
    for (const line of lines) {
      const [name, email, password] = line.split(',').map((x) => (x || '').trim());
      if (!name || !email || !email.includes('@') || name.toLowerCase() === 'name') { skipped.push(line); continue; }
      const exists = one('SELECT id FROM users WHERE tenant_id = ? AND email = ?', admin.tenant_id, email.toLowerCase());
      if (exists) { skipped.push(line); continue; }
      const pw = password || crypto.randomBytes(4).toString('hex');
      run(
        'INSERT INTO users (tenant_id,email,name,pass_hash,role,cohort,created_at) VALUES (?,?,?,?,?,?,?)',
        admin.tenant_id, email.toLowerCase(), name, hashPassword(pw), 'learner', b.cohort || 'Cohort 1', now()
      );
      created.push({ name, email, password: pw });
    }
    return send(res, 200, { created, skipped });
  }

  if (p === '/api/admin/tenants' && method === 'GET') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (admin.role !== 'owner') return send(res, 403, { error: 'Owner only.' });
    const tenants = all('SELECT * FROM tenants ORDER BY id').map((t) => ({
      ...tenantPublic(t), inviteCode: t.invite_code,
      learners: one('SELECT COUNT(*) AS n FROM users WHERE tenant_id = ?', t.id).n,
    }));
    return send(res, 200, { tenants });
  }

  if (p === '/api/admin/tenants' && method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (admin.role !== 'owner') return send(res, 403, { error: 'Owner only.' });
    const b = await readBody(req);
    if (!b.company || !b.slug) return send(res, 400, { error: 'Company and slug required.' });
    try {
      run(
        `INSERT INTO tenants (slug,name,tagline,logo,primary_color,accent_color,signatory,signatory_title,cert_title,pass_pct,attempts,cert_pct,invite_code,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        String(b.slug).toLowerCase().replace(/[^a-z0-9-]/g, '-'), b.company,
        b.tagline || '', b.logo || '', b.primary || '#4f7cff', b.accent || '#22d3a6',
        b.signatory || '', b.signatoryTitle || '', b.certTitle || 'Certificate of Completion',
        Number(b.passPct ?? 70), Number(b.attempts ?? 3), Number(b.certPct ?? 80),
        String(b.inviteCode || 'JOIN').toUpperCase(), now()
      );
    } catch (err) {
      return send(res, 409, { error: 'That slug is already taken.' });
    }
    return send(res, 200, { ok: true });
  }

  if (p === '/api/admin/export.csv') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const tenant = one('SELECT * FROM tenants WHERE id = ?', admin.tenant_id);
    const learners = all('SELECT * FROM users WHERE tenant_id = ? AND role = ?', tenant.id, 'learner');
    const header = 'name,email,cohort,pre_score,overall,points,lessons,quizzes_passed,assignments_graded,certificate\n';
    const lines = learners.map((u) => {
      const prog = computeProgress({ ...u, tenant_cert_pct: tenant.cert_pct });
      const cert = one('SELECT code FROM certificates WHERE user_id = ?', u.id);
      return [u.name, u.email, u.cohort, u.pre_score ?? '', prog.overall, prog.points, prog.lessonsDone, prog.quizzesPassed, prog.assignmentsGraded, cert ? cert.code : '']
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="progress-${tenant.slug}.csv"`,
    });
    return res.end(header + lines.join('\n'));
  }

  if (p === '/api/admin/reload' && method === 'POST') {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    if (admin.role !== 'owner') return send(res, 403, { error: 'Owner only.' });
    loadContent();
    return send(res, 200, { ok: true, lessons: lessonList().length });
  }

  return send(res, 404, { error: 'Unknown endpoint.' });
}

function recommendTrack(domains, scorePct) {
  const pctOf = (tag) => domains.find((d) => d.tag === tag)?.pct ?? 0;
  const net = pctOf('networking');
  const sec = pctOf('security');
  const auto = pctOf('automation');
  if (net < 50) return 'l1-support';
  if (sec < 50) return 'soc';
  if (auto < 50) return 'automation';
  return 'vapt';
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/auth/phoneme') {
    return oidc.start(req, res, url).catch((err) => { console.error('[oidc]', err); send(res, 500, { error: 'SSO start failed' }); });
  }
  if (url.pathname === '/auth/callback') {
    return oidc.callback(req, res, url).catch((err) => { console.error('[oidc]', err); send(res, 500, { error: 'SSO callback failed' }); });
  }
  if (url.pathname === '/auth/logout') {
    return oidc.logout(req, res, url).catch((err) => { console.error('[oidc]', err); send(res, 500, { error: 'SSO logout failed' }); });
  }
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch((err) => {
      console.error('[api]', req.method, url.pathname, err);
      if (!res.headersSent) send(res, 500, { error: err.message || 'Server error' });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`\n  L1 Academy running at http://${HOST}:${PORT}`);
  console.log(`  content: ${lessonList().length} lessons · ${moduleList().length} modules · ${assignmentList().length} assignments`);
  console.log(oidc.enabled ? `  SSO: Phoneme OIDC → ${process.env.PHONEME_AUTH_ISSUER}` : '  SSO: disabled (local login only)');
  if (one('SELECT COUNT(*) AS n FROM tenants').n === 0) {
    console.log('  first run → open the URL and complete the setup wizard\n');
  } else {
    console.log('');
  }
});
