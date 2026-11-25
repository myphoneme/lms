#!/usr/bin/env node
/* Assemble and validate content/modules/* into content/curriculum.json.
   Usage: node scripts/build_curriculum.mjs [--strict] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const CONTENT = path.join(ROOT, 'content');
const MODDIR = path.join(CONTENT, 'modules');
const strict = process.argv.includes('--strict');

const skeleton = JSON.parse(fs.readFileSync(path.join(CONTENT, 'skeleton.json'), 'utf8'));
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

const VALID_DIAGRAMS = ['layers', 'flow', 'sequence', 'compare', 'topology', 'timeline', 'tree', 'quadrant'];
const DIAGRAM_KEYS = {
  layers: ['layers'],
  flow: ['steps'],
  sequence: ['actors', 'messages'],
  compare: ['left', 'right'],
  topology: ['nodes', 'links'],
  timeline: ['events'],
  tree: ['branches'],
  quadrant: ['points'],
};

const lessons = {};
const quizzes = {};
const assignments = [];
const moduleOut = [];

for (const mod of skeleton.modules) {
  const dir = path.join(MODDIR, mod.id);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
  if (!files.length) { err(`${mod.id}: no content files in ${dir}`); continue; }

  const parts = files.map((f) => ({ file: path.join(dir, f), data: read(path.join(dir, f)) }));
  const lessonParts = parts.filter((p) => Array.isArray(p.data.lessons));
  const quizPart = parts.find((p) => p.data.quiz);
  const assignParts = parts.filter((p) => Array.isArray(p.data.assignments));

  const got = [];
  for (const p of lessonParts) {
    for (const l of p.data.lessons) {
      if (l.moduleId !== mod.id) err(`${p.file}: lesson ${l.id} has moduleId ${l.moduleId}`);
      if (lessons[l.id]) err(`duplicate lesson id ${l.id}`);
      lessons[l.id] = l;
      got.push(l);
    }
  }

  const expected = mod.lessons.map((l) => l.id);
  const expectedSet = new Set(expected);
  for (const id of expected) if (!got.find((l) => l.id === id)) err(`${mod.id}: missing lesson ${id}`);
  for (const l of got) if (!expectedSet.has(l.id)) err(`${mod.id}: unexpected lesson ${l.id}`);

  for (const skel of mod.lessons) {
    const l = lessons[skel.id];
    if (!l) continue;
    for (const field of ['title', 'subtitle', 'minutes', 'level', 'objectives', 'ticket', 'sections', 'diagram', 'commands', 'pitfalls', 'takeaways', 'drill']) {
      if (l[field] === undefined) err(`${l.id}: missing ${field}`);
    }
    if (!Array.isArray(l.objectives) || l.objectives.length < 3) err(`${l.id}: needs 3+ objectives`);
    if (!Array.isArray(l.sections) || l.sections.length < 4 || l.sections.length > 6) err(`${l.id}: sections must be 4–6 (got ${l.sections?.length})`);
    const body = (l.sections || []).map((s) => s.body).join(' ');
    const wc = words(body);
    if (wc < 600 || wc > 1100) warn(`${l.id}: body is ${wc} words (target 700–950)`);
    if (!l.ticket?.subject || !l.ticket?.body) err(`${l.id}: ticket needs subject and body`);
    if (!Array.isArray(l.pitfalls) || l.pitfalls.length < 3) err(`${l.id}: needs 3 pitfalls`);
    if (!Array.isArray(l.takeaways) || l.takeaways.length < 3) err(`${l.id}: needs 3 takeaways`);
    if (!Array.isArray(l.drill?.checklist) || l.drill.checklist.length < 4) err(`${l.id}: drill needs 4 checklist items`);

    const d = l.diagram || {};
    if (!VALID_DIAGRAMS.includes(d.type)) err(`${l.id}: invalid diagram type ${d.type}`);
    else {
      for (const key of DIAGRAM_KEYS[d.type]) {
        if (!d.data || d.data[key] === undefined) err(`${l.id}: diagram ${d.type} missing data.${key}`);
      }
      if (!d.title) err(`${l.id}: diagram title missing`);
    }

    if (l.video) {
      const m = String(l.video.url || '').match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
      if (!m) err(`${l.id}: video url is not a YouTube watch URL`);
      if (!l.video.title || !l.video.channel || !l.video.why) err(`${l.id}: video needs title, channel, why`);
    } else {
      warn(`${l.id}: no video`);
    }
    // coverage keys must exist in skeleton
    const skelCovers = new Set(skel.covers);
    for (const c of l.sheetTopics || []) {
      if (!(skel.sheetTopics || []).includes(c)) warn(`${l.id}: sheetTopics "${c}" not in skeleton`);
    }
  }

  const quiz = quizPart?.data?.quiz;
  if (!quiz) err(`${mod.id}: missing quiz`);
  else {
    if (quiz.id !== mod.quiz) err(`${mod.id}: quiz id ${quiz.id} != ${mod.quiz}`);
    if (!Array.isArray(quiz.questions) || quiz.questions.length !== 10) err(`${mod.id}: quiz needs 10 questions (got ${quiz.questions?.length})`);
    const answers = quiz.questions?.map((q) => q.answer) || [];
    if (answers.filter((a) => a === 0).length > 4 || answers.filter((a) => a === 3).length > 4) warn(`${mod.id}: answer distribution is skewed ${JSON.stringify(answers)}`);
    for (const q of quiz.questions || []) {
      if (!Array.isArray(q.options) || q.options.length !== 4) err(`${mod.id}/${q.id}: needs 4 options`);
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err(`${mod.id}/${q.id}: answer must be 0–3`);
      if (!q.explain) err(`${mod.id}/${q.id}: missing explain`);
      if (/all of the above|none of the above/i.test(q.options.join(' '))) err(`${mod.id}/${q.id}: banned option`);
    }
    if (quizzes[quiz.id]) err(`duplicate quiz id ${quiz.id}`);
    quizzes[quiz.id] = quiz;
  }

  const days = [];
  for (let i = 0; i < 5; i += 1) days.push((mod.seq - 1) * 5 + 1 + i);
  const aGot = assignParts.flatMap((p) => p.data.assignments);
  if (aGot.length !== 5) err(`${mod.id}: needs 5 assignments (got ${aGot.length})`);
  for (const day of days) {
    const a = aGot.find((x) => x.day === day);
    if (!a) { err(`${mod.id}: missing assignment for day ${day}`); continue; }
    if (!a.title || !a.scenario || !a.task || !a.deliverable) err(`${mod.id}/day ${day}: missing fields`);
    if (!Array.isArray(a.rubric) || a.rubric.length !== 3) err(`${mod.id}/day ${day}: needs exactly 3 rubric criteria`);
    else {
      const sum = a.rubric.reduce((s, r) => s + Number(r.weight || 0), 0);
      if (sum !== 100) err(`${mod.id}/day ${day}: rubric weights sum to ${sum}, must be 100`);
      for (const r of a.rubric) if (!r.lookFor) err(`${mod.id}/day ${day}: rubric "${r.criterion}" missing lookFor`);
    }
    const level = Math.ceil(day / 10);
    if (a.level !== level) warn(`${mod.id}/day ${day}: level ${a.level}, expected ${level}`);
    if (!Array.isArray(a.hints) || a.hints.length < 2) warn(`${mod.id}/day ${day}: fewer than 2 hints`);
    if (assignments.find((x) => x.id === a.id)) err(`duplicate assignment id ${a.id}`);
    assignments.push({ ...a, moduleId: mod.id });
  }

  moduleOut.push({
    id: mod.id,
    seq: mod.seq,
    title: mod.title,
    tagline: mod.tagline,
    color: mod.color,
    icon: mod.icon,
    days: mod.days,
    quiz: mod.quiz,
    lessons: mod.lessons.map((l) => l.id),
    sheetTopics: mod.lessons.flatMap((l) => l.sheetTopics || []),
  });
}

assignments.sort((a, b) => a.day - b.day);

const curriculum = {
  version: 1,
  modules: moduleOut,
  lessons,
  quizzes,
  assignments,
};

fs.writeFileSync(path.join(CONTENT, 'curriculum.json'), JSON.stringify(curriculum, null, 1));

const lessonCount = Object.keys(lessons).length;
const totalWords = Object.values(lessons).reduce((s, l) => s + words((l.sections || []).map((x) => x.body).join(' ')), 0);
const videos = Object.values(lessons).filter((l) => l.video).length;

console.log(`lessons        ${lessonCount}/${skeleton.modules.reduce((s, m) => s + m.lessons.length, 0)}`);
console.log(`quizzes        ${Object.keys(quizzes).length}/8 · questions ${Object.values(quizzes).reduce((s, q) => s + q.questions.length, 0)}`);
console.log(`assignments    ${assignments.length}/40`);
console.log(`prose          ${totalWords.toLocaleString()} words (avg ${Math.round(totalWords / Math.max(1, lessonCount))}/lesson)`);
console.log(`videos         ${videos}/${lessonCount}`);
if (warnings.length) {
  console.log(`\nWARNINGS (${warnings.length})`);
  warnings.slice(0, 40).forEach((w) => console.log('  · ' + w));
  if (warnings.length > 40) console.log(`  … ${warnings.length - 40} more`);
}
if (errors.length) {
  console.log(`\nERRORS (${errors.length})`);
  errors.slice(0, 60).forEach((e) => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('\ncurriculum.json written.');
