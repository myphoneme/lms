#!/usr/bin/env node
/* Prove every row of the source topic sheet is taught: maps sheet rows to lessons.
   Writes research/Topic_Coverage.csv and prints a per-module summary. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const topics = read('content/topics.json');
const skeleton = read('content/skeleton.json');
const curriculum = read('content/curriculum.json');

const lessonMeta = {};
const moduleOf = {};
for (const m of skeleton.modules) {
  for (const l of m.lessons) {
    lessonMeta[l.id] = l;
    moduleOf[l.id] = m;
  }
}

/* expand section-level covers ("s2") to row-level keys ("s2:grep") */
const rowKeys = [];
topics.sections.forEach((s, si) => {
  s.rows.forEach((r) => rowKeys.push({ si, key: `s${si}:${r.a}`, row: r, section: s.section, col2: s.col2 }));
});

const coverage = new Map(); // key -> [lessonId]
for (const m of skeleton.modules) {
  for (const l of m.lessons) {
    for (const c of l.covers || []) {
      if (c.includes(':')) add(c, l.id);
      else rowKeys.filter((r) => `s${r.si}` === c).forEach((r) => add(r.key, l.id));
    }
  }
}
function add(key, id) {
  if (!coverage.has(key)) coverage.set(key, []);
  if (!coverage.get(key).includes(id)) coverage.get(key).push(id);
}

const rows = [];
let unmapped = 0;
for (const r of rowKeys) {
  const ids = coverage.get(r.key) || [];
  if (!ids.length) unmapped += 1;
  rows.push({
    section: r.section,
    topic: r.row.a,
    detail: [r.row.b, r.row.c].filter(Boolean).join(' — '),
    lessonIds: ids,
    lessons: ids.map((id) => curriculum.lessons[id]?.title || id).join(' | '),
    modules: [...new Set(ids.map((id) => moduleOf[id]?.id))].join(' '),
    moduleNames: [...new Set(ids.map((id) => moduleOf[id]?.title))].join(' | '),
  });
}

const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const header = 'Source section,Topic,What the sheet says,Taught in lesson id(s),Lesson title(s),Module\n';
const csv = header + rows.map((r) => [r.section, r.topic, r.detail, r.lessonIds.join(' '), r.lessons, r.moduleNames].map(esc).join(',')).join('\n') + '\n';
const out = path.join(ROOT, '..', 'research', 'Topic_Coverage.csv');
fs.writeFileSync(out, csv);

console.log(`sheet rows        ${rows.length}`);
console.log(`mapped            ${rows.length - unmapped}`);
console.log(`unmapped          ${unmapped}`);
for (const m of skeleton.modules) {
  const n = rows.filter((r) => r.lessonIds.some((id) => moduleOf[id]?.id === m.id)).length;
  console.log(`  ${m.id} ${String(n).padStart(3)} rows  ${m.title}`);
}
console.log(`\ncoverage csv       ${out}`);
if (unmapped) process.exit(1);
