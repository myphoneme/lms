import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const C = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/curriculum.json'), 'utf8'));
const lessons = Object.values(C.lessons);
const issues = [];

// 1. videos
const vid = (url) => (String(url).match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/) || [])[1];
const ids = [...new Set(lessons.map((l) => l.video && vid(l.video.url)).filter(Boolean))];
const results = [];
async function check(id) {
  const u = `https://www.youtube.com/oembed?url=https%3A//www.youtube.com/watch%3Fv%3D${id}&format=json`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(u, { signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return { id, ok: false, status: r.status };
    const j = await r.json();
    return { id, ok: true, title: j.title, author: j.author_name };
  } catch (e) { return { id, ok: false, status: e.name }; }
}
for (let i = 0; i < ids.length; i += 6) {
  const batch = await Promise.all(ids.slice(i, i + 6).map(check));
  results.push(...batch);
}
const bad = results.filter((r) => !r.ok);
console.log(`videos: ${results.length} unique, ${bad.length} failing`);
for (const b of bad) console.log('  BAD', b.id, b.status);
for (const r of results) console.log('  OK  ', r.id, '|', r.author?.slice(0, 28), '|', r.title?.slice(0, 68));

// 2. slop + duplicate detection
const BANNED = [/in today'?s (digital )?world/i, /let'?s dive in/i, /it is important to note/i, /as we all know/i, /in conclusion/i, /\bsimply\b/i, /\bobviously\b/i, /!!/, /🚀|🔒|💡/u];
const sentences = new Map();
for (const l of lessons) {
  const body = l.sections.map((s) => s.body).join('\n');
  for (const re of BANNED) {
    const m = body.match(re);
    if (m) issues.push(`${l.id}: banned phrase "${m[0]}"`);
  }
  for (const sent of body.split(/(?<=[.!?])\s+/)) {
    const k = sent.trim().toLowerCase().replace(/\s+/g, ' ');
    if (k.length > 90) sentences.set(k, (sentences.get(k) || []).concat(l.id));
  }
}
for (const [s, ids2] of sentences) if (ids2.length > 1) issues.push(`duplicate sentence in ${ids2.join(', ')}: ${s.slice(0, 80)}`);

// 3. quiz distributions + duplicate questions
for (const [id, q] of Object.entries(C.quizzes)) {
  const dist = [0, 0, 0, 0];
  q.questions.forEach((x) => { dist[x.answer] += 1; });
  if (Math.max(...dist) - Math.min(...dist) > 3) issues.push(`${id}: answer distribution ${dist}`);
  const seen = new Set();
  for (const x of q.questions) {
    const k = x.q.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(k)) issues.push(`${id}: duplicate question "${x.q.slice(0, 60)}"`);
    seen.add(k);
  }
}

// 4. diagram data sanity
for (const l of lessons) {
  const d = l.diagram || {};
  const data = d.data || {};
  if (d.type === 'layers' && !(data.layers || []).every((x) => x.name && x.fn)) issues.push(`${l.id}: bad layers`);
  if (d.type === 'flow' && !(data.steps || []).length) issues.push(`${l.id}: empty flow`);
  if (d.type === 'sequence') {
    const actorIds = new Set((data.actors || []).map((a) => a.id));
    for (const m of data.messages || []) if (!actorIds.has(m.from) || !actorIds.has(m.to)) issues.push(`${l.id}: sequence link to unknown actor`);
  }
  if (d.type === 'topology') {
    const nodeIds = new Set((data.nodes || []).map((n) => n.id));
    for (const ln of data.links || []) if (!nodeIds.has(ln.from) || !nodeIds.has(ln.to)) issues.push(`${l.id}: topology link to unknown node`);
  }
  if (d.type === 'tree' && !(data.branches || []).length) issues.push(`${l.id}: empty tree`);
}

// 5. per-module coverage of sheet topics declared in skeleton
const skel = JSON.parse(fs.readFileSync(path.join(ROOT, 'content/skeleton.json'), 'utf8'));
for (const m of skel.modules) for (const s of m.lessons) {
  const l = C.lessons[s.id];
  if (!l) continue;
  if (JSON.stringify(l.sheetTopics) !== JSON.stringify(s.sheetTopics)) issues.push(`${s.id}: sheetTopics drifted from skeleton`);
}

console.log(`\nissues: ${issues.length}`);
issues.slice(0, 40).forEach((i) => console.log('  -', i));
fs.writeFileSync(path.join(ROOT, 'content/video-check.json'), JSON.stringify(results, null, 1));
