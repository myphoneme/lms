#!/usr/bin/env node
/* Merge content/research/*.json into content/resources.json and verify every link.
   Usage: node scripts/build_resources.mjs [--no-network] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const RESEARCH = path.join(ROOT, 'content', 'research');
const OUT = path.join(ROOT, 'content', 'resources.json');
const REPORT = path.join(ROOT, 'content', 'resource-check.json');
const skipNetwork = process.argv.includes('--no-network');

const moduleNames = {
  m1: 'Networking foundations',
  m2: 'Linux for the desk',
  m3: 'Windows and PowerShell',
  m4: 'Security fundamentals',
  m5: 'Offensive security',
  m6: 'SOC, SIEM and detection',
  m7: 'Incident response and forensics',
  m8: 'Automation and scripting',
};

const FORMATS = new Set(['Video', 'Article', 'Docs', 'Thread', 'Paper', 'Book', 'Podcast', 'Course']);

const seen = new Set();

function urlKey(raw) {
  const m = String(raw).match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return 'yt:' + m[1];
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const p of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'fbclid']) u.searchParams.delete(p);
    return u.toString().replace(/\/$/, '').toLowerCase();
  } catch { return String(raw).toLowerCase(); }
}
const items = [];
const problems = [];
let order = 0;

for (const file of fs.readdirSync(RESEARCH).filter((f) => f.endsWith('.json')).sort()) {
  const mod = file.replace('.json', '');
  let data;
  try { data = JSON.parse(fs.readFileSync(path.join(RESEARCH, file), 'utf8')); }
  catch (e) { problems.push(`${file}: invalid JSON (${e.message})`); continue; }

  for (const r of data.items || []) {
    const label = `${mod}: ${String(r.title || '').slice(0, 40)}`;
    for (const field of ['title', 'creator', 'format', 'url', 'why', 'topic']) {
      if (!r[field]) problems.push(`${label}: missing ${field}`);
    }
    if (!/^https?:\/\//i.test(r.url || '')) { problems.push(`${label}: bad url ${r.url}`); continue; }
    const normal = `${mod}:${urlKey(r.url)}`;
    if (seen.has(normal)) { problems.push(`${label}: duplicate url within module`); continue; }
    seen.add(normal);
    if (!FORMATS.has(r.format)) problems.push(`${label}: unknown format ${r.format}`);
    order += 1;
    items.push({
      id: `r${String(order).padStart(3, '0')}`,
      moduleId: mod,
      module: moduleNames[mod] || mod,
      title: String(r.title).trim(),
      creator: String(r.creator || '').trim(),
      format: r.format,
      url: r.url,
      why: String(r.why || '').trim(),
      struggle: String(r.struggle || '').trim(),
      topic: String(r.topic || '').trim(),
      level: r.level || 'Working',
      cost: r.cost || 'Free',
    });
  }
}

async function check(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8',
      },
    });
    return { status: res.status, ok: res.ok || [403, 429, 999].includes(res.status) };
  } catch (e) {
    return { status: 0, ok: false, error: e.name };
  } finally {
    clearTimeout(timer);
  }
}

let results = [];
if (!skipNetwork) {
  for (let i = 0; i < items.length; i += 8) {
    const batch = items.slice(i, i + 8);
    const res = await Promise.all(batch.map(async (it) => ({ id: it.id, ...(await check(it.url)) })));
    results.push(...res);
    process.stdout.write(`checked ${Math.min(items.length, i + 8)}/${items.length}\r`);
  }
  console.log('');
}

const statusById = Object.fromEntries(results.map((r) => [r.id, r]));
const dead = items.filter((it) => statusById[it.id] && !statusById[it.id].ok);
const alive = items.filter((it) => !statusById[it.id] || statusById[it.id].ok);

const keep = items; // keep everything, but flag dead links instead of silently dropping curated material

const perModule = {};
for (const it of keep) {
  perModule[it.module] = perModule[it.module] || { count: 0, dead: 0 };
  perModule[it.module].count += 1;
  if (dead.find((d) => d.id === it.id)) perModule[it.module].dead += 1;
}

const out = {
  generatedAt: new Date().toISOString(),
  note: 'Curated for learners who already have a job to do, not for exam coverage. Links were checked at build time; a few sites block automated checks (403/429) and still open in a browser. Dead links are flagged in resource-check.json and should be replaced.',
  perModule,
  items: keep,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
fs.writeFileSync(REPORT, JSON.stringify({ checkedAt: new Date().toISOString(), results, dead: dead.map((d) => ({ id: d.id, moduleId: d.moduleId, title: d.title, url: d.url })) }, null, 1));

console.log(`resources    ${keep.length} (${alive.length} alive, ${dead.length} dead)`);
console.log(`modules      ${Object.keys(perModule).length}`);
for (const [m, s] of Object.entries(perModule)) console.log(`  ${m}  ${String(s.count).padStart(2)} items  ${s.dead ? `${s.dead} dead` : ''}`);
if (problems.length) {
  console.log(`\nDATA PROBLEMS (${problems.length})`);
  problems.slice(0, 30).forEach((p) => console.log('  - ' + p));
}
if (dead.length) {
  console.log('\nDEAD LINKS');
  dead.forEach((d) => console.log(`  ${d.moduleId} ${d.title.slice(0, 60)} → ${d.url} [${statusById[d.id]?.status}]`));
}
console.log('\nresources.json written');
