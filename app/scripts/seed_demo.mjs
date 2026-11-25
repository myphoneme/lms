#!/usr/bin/env node
/* Seed a demo cohort with realistic progress so the product can be evaluated.
   Usage: node scripts/seed_demo.mjs [--reset]
   Creates: tenant "northwind", owner admin@northwind.example / demo12345,
   eight learners (asha@… / demo12345) with varied quiz and drill results,
   and two issued certificates. Fictional data only. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = new DatabaseSync(path.join(ROOT, 'data', 'app.db'));
db.exec('PRAGMA journal_mode = WAL');

const now = () => new Date().toISOString();
const hash = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
};

const slug = 'northwind';
const reset = process.argv.includes('--reset');

const existing = db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug);
if (existing) {
  if (!reset) {
    console.log('demo tenant already exists — pass --reset to rebuild');
    process.exit(0);
  }
  const users = db.prepare('SELECT id FROM users WHERE tenant_id = ?').all(existing.id).map((u) => u.id);
  for (const id of users) {
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM lesson_progress WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM quiz_attempts WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM submissions WHERE user_id = ?').run(id);
    db.prepare('DELETE FROM certificates WHERE user_id = ?').run(id);
  }
  db.prepare('DELETE FROM users WHERE tenant_id = ?').run(existing.id);
  db.prepare('DELETE FROM tenants WHERE id = ?').run(existing.id);
  console.log('removed previous demo tenant');
}

const tenantId = db.prepare(
  `INSERT INTO tenants (slug,name,tagline,logo,primary_color,accent_color,signatory,signatory_title,cert_title,pass_pct,attempts,cert_pct,invite_code,created_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
).run(
  slug,
  'Northwind Datacenter Services',
  'L1 → L2 readiness programme · Cohort 4',
  'N',
  '#1f4fd8',
  '#0f9d76',
  'Priya Raman',
  'Head of Service Delivery',
  'L1 Readiness Certificate',
  70, 3, 80, 'NWIND', now()
).lastInsertRowid;

const addUser = (name, email, role) => db.prepare(
  'INSERT INTO users (tenant_id,email,name,pass_hash,role,cohort,created_at) VALUES (?,?,?,?,?,?,?)'
).run(tenantId, email, name, hash('demo12345'), role, 'Cohort 4', now()).lastInsertRowid;

const ownerId = addUser('Priya Raman', 'admin@northwind.example', 'owner');
addUser('Meera Krishnan', 'coordinator@northwind.example', 'coordinator');
const learners = [
  { name: 'Asha Menon', email: 'asha@northwind.example', quiz: 94, drill: 92, lessons: 48 },
  { name: 'Ravi Kumar', email: 'ravi@northwind.example', quiz: 88, drill: 86, lessons: 44 },
  { name: 'Neha Iyer', email: 'neha@northwind.example', quiz: 82, drill: 79, lessons: 41 },
  { name: 'Arjun Singh', email: 'arjun@northwind.example', quiz: 74, drill: 72, lessons: 34 },
  { name: 'Priya Nair', email: 'priya@northwind.example', quiz: 68, drill: 71, lessons: 29 },
  { name: 'Karthik Rao', email: 'karthik@northwind.example', quiz: 61, drill: 58, lessons: 22 },
  { name: 'Fatima Sheikh', email: 'fatima@northwind.example', quiz: 46, drill: 41, lessons: 12 },
  { name: 'Vikram Desai', email: 'vikram@northwind.example', quiz: 0, drill: 0, lessons: 3 },
];

const curriculum = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'curriculum.json'), 'utf8'));
const lessons = Object.values(curriculum.lessons).sort((a, b) => a.seq - b.seq).map((l) => l.id);
const assignments = [...curriculum.assignments].sort((a, b) => a.day - b.day);

// Seed the curriculum review workflow: some topics verified, some in review.
const reviewChecklist = JSON.stringify({ accuracy: true, commands: true, video: true, diagram: true, scenario: true });
lessons.slice(0, 24).forEach((id, i) => {
  db.prepare(`INSERT OR REPLACE INTO curriculum_overrides
    (tenant_id,lesson_id,hidden,level,review_status,checklist,review_note,reviewer_id,reviewed_at,custom_json,created_at,updated_at)
    VALUES (?,?,0,NULL,'verified',?,'Reviewed against the source topic sheet.',?,?,NULL,?,?)`)
    .run(tenantId, id, reviewChecklist, ownerId,
      new Date(Date.now() - (30 - i) * 864e5).toISOString(), now(), now());
});
lessons.slice(24, 30).forEach((id, i) => {
  db.prepare(`INSERT OR REPLACE INTO curriculum_overrides
    (tenant_id,lesson_id,hidden,level,review_status,checklist,review_note,reviewer_id,reviewed_at,custom_json,created_at,updated_at)
    VALUES (?,?,0,NULL,'in_review','{}','Accuracy check in progress.',?,?,NULL,?,?)`)
    .run(tenantId, id, ownerId, new Date(Date.now() - i * 864e5).toISOString(), now(), now());
});

const rubricFor = (a) => a.rubric.map((r) => ({ criterion: r.criterion, weight: r.weight, score: 0 }));
const feedbackFor = (pct) => (pct >= 90
  ? 'Evidence is complete: command, output, and a decision that matches. This is the standard to keep on shift.'
  : pct >= 78
    ? 'Right diagnosis and the output is pasted. Tighten the handover note: name the layer you ruled out before the one you suspect.'
    : 'The conclusion is partly there, but the evidence does not prove it. Re-run the check and paste the output that would have caught this.');

for (const l of learners) {
  const uid = addUser(l.name, l.email, 'learner');
  const profile = {
    scorePct: Math.max(18, l.quiz - 8),
    correct: Math.round(((l.quiz - 8) / 100) * 15),
    total: 15,
    domains: [
      { tag: 'networking', pct: Math.max(10, l.quiz - 4), correct: 2, total: 3 },
      { tag: 'linux', pct: Math.max(10, l.quiz - 12), correct: 1, total: 2 },
      { tag: 'windows', pct: Math.max(10, l.quiz - 2), correct: 1, total: 2 },
      { tag: 'security', pct: Math.max(10, l.quiz - 6), correct: 2, total: 3 },
      { tag: 'soc', pct: Math.max(10, l.quiz - 14), correct: 1, total: 2 },
      { tag: 'ir', pct: Math.max(10, l.quiz - 10), correct: 1, total: 1 },
      { tag: 'automation', pct: Math.max(10, l.quiz - 18), correct: 1, total: 2 },
    ].sort((a, b) => a.pct - b.pct),
    weakest: ['automation', 'soc', 'ir'],
    track: l.quiz < 55 ? 'l1-support' : l.quiz < 75 ? 'soc' : 'automation',
    takenAt: new Date(Date.now() - 40 * 864e5).toISOString(),
  };
  db.prepare('UPDATE users SET profile = ?, pre_score = ? WHERE id = ?')
    .run(JSON.stringify(profile), profile.scorePct, uid);

  // lessons completed
  for (const id of lessons.slice(0, l.lessons)) {
    db.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id, completed_at) VALUES (?,?,?)')
      .run(uid, id, new Date(Date.now() - Math.random() * 30 * 864e5).toISOString());
  }

  // quizzes
  for (const [qid, quiz] of Object.entries(curriculum.quizzes)) {
    if (!l.quiz) continue;
    const jitter = Math.round((Math.random() - 0.5) * 10);
    const pct = Math.max(40, Math.min(100, l.quiz + jitter));
    const total = quiz.questions.length;
    const score = Math.round((pct / 100) * total);
    db.prepare('INSERT INTO quiz_attempts (user_id,quiz_id,attempt_no,score,total,detail,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(uid, qid, 1, score, total, '[]', new Date(Date.now() - Math.random() * 25 * 864e5).toISOString());
  }

  // drills
  if (l.drill) {
    const count = Math.min(40, Math.round((l.lessons / 48) * 40) + 2);
    for (let i = 0; i < count; i += 1) {
      const a = assignments[i];
      if (!a) break;
      const pct = Math.max(50, Math.min(100, l.drill + Math.round((Math.random() - 0.5) * 14)));
      const rubric = a.rubric.map((r) => ({ criterion: r.criterion, weight: r.weight, score: Math.max(40, Math.min(100, pct + Math.round((Math.random() - 0.5) * 12))) }));
      const score = Math.round(rubric.reduce((s, r) => s + r.score * r.weight, 0) / rubric.reduce((s, r) => s + r.weight, 0));
      db.prepare(
        `INSERT INTO submissions (user_id,assignment_id,evidence,status,score,rubric,feedback,graded_by,graded_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        uid, a.id,
        `$ ${a.tools?.[0] || 'check'} …\n\nOutput pasted, then the conclusion: this is the check I would run on the next call of the same shape. Redacted hostname and IP per policy.`,
        'graded', score, JSON.stringify(rubric), feedbackFor(pct), 1,
        new Date(Date.now() - Math.random() * 20 * 864e5).toISOString(),
        new Date(Date.now() - Math.random() * 35 * 864e5).toISOString(),
        new Date(Date.now() - Math.random() * 20 * 864e5).toISOString()
      );
    }
  }
}

// Certificates for the two who clear the bar (computed the same way the app does).
function progressFor(uid) {
  const attempts = db.prepare('SELECT quiz_id, MAX(score*100.0/total) AS pct FROM quiz_attempts WHERE user_id = ? GROUP BY quiz_id').all(uid);
  const quizMap = Object.fromEntries(attempts.map((a) => [a.quiz_id, Math.round(a.pct * 10) / 10]));
  const quizIds = Object.keys(curriculum.quizzes);
  const quizAvg = quizIds.reduce((s, q) => s + (quizMap[q] || 0), 0) / quizIds.length;
  const subs = db.prepare('SELECT score FROM submissions WHERE user_id = ? AND status = ?').all(uid, 'graded');
  const assignmentAvg = subs.reduce((s, x) => s + x.score, 0) / 40;
  const strong = subs.filter((s) => s.score >= 70).length;
  const overall = Math.round((quizAvg * 0.5 + assignmentAvg * 0.5) * 10) / 10;
  const passed = quizIds.filter((q) => (quizMap[q] || 0) >= 70).length;
  return { overall, strong, passed, eligible: overall >= 80 && passed === 8 && strong >= 32 };
}

let issued = 0;
for (const row of db.prepare('SELECT id,name FROM users WHERE tenant_id = ? AND role = ?').all(tenantId, 'learner')) {
  const p = progressFor(row.id);
  if (p.eligible) {
    const code = 'L1-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    db.prepare('INSERT INTO certificates (user_id,code,overall_pct,issued_at) VALUES (?,?,?,?)')
      .run(row.id, code, p.overall, now());
    issued += 1;
    console.log(`certificate ${code} → ${row.name} (${p.overall}%)`);
  }
}

console.log('\nDemo ready');
console.log('  admin   admin@northwind.example / demo12345');
console.log('  learner asha@northwind.example / demo12345');
console.log('  coordinator coordinator@northwind.example / demo12345');
console.log(`  ${learners.length} learners, ${issued} certificates`);
db.close();
