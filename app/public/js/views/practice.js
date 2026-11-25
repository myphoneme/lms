/* Practice: the 40 daily drills, submission and mentor feedback. */
import { api, state, refreshMe } from '../api.js';
import { icon, esc, md, statusChip, fmtDate } from '../ui.js';
import { navigate } from '../shell.js';

const LEVEL = ['Warm-up', 'Applying', 'Diagnosing', 'Complex'];

function levelBars(level) {
  return `<span class="level-bars" title="Level ${level} of 4" aria-label="Level ${level} of 4">${[1, 2, 3, 4]
    .map((i) => `<i class="${i <= level ? 'on' : ''}"></i>`)
    .join('')}</span>`;
}

export async function list() {
  const { content } = state;
  const data = await api('/api/assignments');
  const subs = data.submissions || {};
  const assignments = data.assignments;
  const byWeek = new Map();
  for (const a of assignments) {
    const week = Math.ceil(a.day / 5);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(a);
  }
  const graded = assignments.filter((a) => subs[a.id]?.status === 'graded');
  const pending = assignments.filter((a) => subs[a.id]?.status === 'submitted');
  const avg = graded.length ? Math.round(graded.reduce((s, a) => s + subs[a.id].score, 0) / graded.length) : 0;

  return {
    crumb: [{ label: 'Practice' }],
    html: `<div class="page-head">
      <div>
        <h1>Forty drills, five a week.</h1>
        <p class="muted" style="margin-top:6px">Each drill asks for evidence: the command you ran, what it returned, and the decision you made from it. A mentor grades it against a rubric.</p>
      </div>
      <div class="spacer"></div>
      <div style="display:flex;gap:8px">
        <span class="pill">${icon('target')}<b>${graded.length}</b> graded</span>
        <span class="pill">${icon('clock')}<b>${pending.length}</b> in review</span>
        <span class="pill">${icon('activity')}<b>${avg}</b> avg</span>
      </div>
    </div>

    <div class="filters" id="filter">
      <button class="filter-btn" data-filter="all" aria-pressed="true">All 40</button>
      <button class="filter-btn" data-filter="open" aria-pressed="false">Not graded</button>
      <button class="filter-btn" data-filter="submitted" aria-pressed="false">In review</button>
      <button class="filter-btn" data-filter="graded" aria-pressed="false">Graded</button>
    </div>

    <div id="drill-list">
      ${[...byWeek.entries()]
        .map(
          ([week, items]) => `<section class="day-group" data-week="${week}">
          <div class="day-head">
            <h3>Week ${week}</h3>
            <span>Days ${items[0].day}–${items[items.length - 1].day} · ${items[0].moduleId ? content.modules.find((m) => m.id === items[0].moduleId)?.title : ''}</span>
          </div>
          ${items
            .map((a) => {
              const sub = subs[a.id];
              return `<a class="drill-row" href="/practice/${a.id}" data-nav data-status="${sub?.status || 'open'}" data-day="${a.day}">
                <span class="mod-idx">D${a.day}</span>
                <span>
                  <span class="drill-title">${esc(a.title)}</span>
                  <span class="drill-sub">${esc(a.deliverable || '')}</span>
                </span>
                ${levelBars(a.level)}
                <span>${statusChip(sub?.status, sub?.score)}</span>
                <span class="chev" style="color:#b3bcb8">${icon('chevronRight')}</span>
              </a>`;
            })
            .join('')}
        </section>`
        )
        .join('')}
    </div>`,
    mount: (root) => {
      root.querySelectorAll('[data-filter]').forEach((btn) => {
        btn.addEventListener('click', () => {
          root.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
          const mode = btn.dataset.filter;
          root.querySelectorAll('.drill-row').forEach((row) => {
            const st = row.dataset.status;
            const show = mode === 'all' || (mode === 'open' && st === 'open') || st === mode;
            row.style.display = show ? '' : 'none';
          });
          root.querySelectorAll('.day-group').forEach((group) => {
            const visible = [...group.querySelectorAll('.drill-row')].some((r) => r.style.display !== 'none');
            group.style.display = visible ? '' : 'none';
          });
        });
      });
    },
  };
}

export function detail({ id }) {
  const { content } = state;
  const a = content.assignments.find((x) => x.id === id);
  if (!a) return { crumb: [{ label: 'Practice' }], html: '<div class="page"><div class="empty"><b>Drill not found.</b></div></div>' };
  const module = content.modules.find((m) => m.id === a.moduleId);

  return {
    crumb: [{ label: 'Practice', href: '/practice' }, { label: `Day ${a.day}` }],
    html: `<div class="page-head" style="margin-bottom:16px">
      <div>
        <div class="lesson-meta" style="margin:0">
          <span class="chip chip-accent">Day ${a.day}</span>
          <span>${esc(module?.title || '')}</span>
          <span class="sep"></span><span>${a.minutes} min</span>
          <span class="sep"></span>${levelBars(a.level)}
          <span>${esc(LEVEL[a.level - 1] || '')}</span>
        </div>
        <h1 style="font-size:28px;margin:10px 0 4px">${esc(a.title)}</h1>
        <p class="muted measure">${esc(a.deliverable)}</p>
      </div>
      <div class="spacer"></div>
      <a class="btn btn-ghost" href="/practice" data-nav>${icon('arrowLeft')} All drills</a>
    </div>
    <div id="drill"><div class="skeleton" style="height:220px"></div></div>`,
    mount: async (root) => {
      const host = root.querySelector('#drill');
      const data = await api('/api/assignments');
      const sub = data.submissions?.[a.id];
      host.innerHTML = renderDrill(a, sub, module);
      wireDrill(root, a, sub);
    },
  };
}

function renderDrill(a, sub, module) {
  const graded = sub?.status === 'graded';
  return `<div class="dash-grid">
    <div style="display:flex;flex-direction:column;gap:20px">
      <section class="card card-pad">
        <div class="tiny dim" style="letter-spacing:.07em;text-transform:uppercase;margin-bottom:8px">The situation</div>
        <p style="font-size:15px;line-height:1.65">${esc(a.scenario)}</p>
        <hr class="rule" style="margin:18px 0" />
        <div class="tiny dim" style="letter-spacing:.07em;text-transform:uppercase;margin-bottom:8px">What to do</div>
        <div class="prose" style="font-size:15.5px">${md(a.task)}</div>
        ${(a.tools || []).length ? `<div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap">${a.tools.map((t) => `<span class="chip chip-plain mono">${esc(t)}</span>`).join('')}</div>` : ''}
      </section>

      <section class="panel">
        <div class="panel-head"><h2>How this is graded</h2><span class="spacer"></span><span class="small dim">100 points</span></div>
        <div class="table-wrap" style="padding:4px 10px 12px">
          <table class="rubric">
            <thead><tr><th>Criterion</th><th>What the mentor looks for</th><th>Weight</th></tr></thead>
            <tbody>
              ${(a.rubric || [])
                .map((r) => `<tr><td>${esc(r.criterion)}</td><td class="muted">${esc(r.lookFor)}</td><td class="wt">${r.weight}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        </div>
      </section>

      ${(a.hints || []).length ? `<section class="card card-pad">
        <details><summary style="cursor:pointer;font-weight:560;font-size:14px">Stuck? Open one hint at a time</summary>
          <ol style="margin:12px 0 0;padding-left:20px;font-size:13.5px;line-height:1.65;color:var(--text-2)">
            ${a.hints.map((h) => `<li style="margin-bottom:7px">${esc(h)}</li>`).join('')}
          </ol>
        </details>
      </section>` : ''}

      <section class="panel">
        <div class="panel-head"><h2>Submit evidence</h2><span class="spacer"></span>${statusChip(sub?.status, sub?.score)}</div>
        <div class="panel-body">
          ${graded
            ? `<div class="evidence-box">${esc(sub.evidence)}</div>
               <div style="margin-top:16px;padding:14px;border:1px solid var(--line);border-radius:8px;background:var(--surface-2)">
                 <div class="small dim" style="text-transform:uppercase;letter-spacing:.06em;font-size:10.5px">Mentor feedback · ${fmtDate(sub.updated_at)}</div>
                 <p style="margin-top:6px;font-size:13.5px">${esc(sub.feedback || 'No comment left.')}</p>
                 <div style="margin-top:10px;display:flex;gap:8px;align-items:center"><b class="num" style="font-size:22px">${sub.score}</b><span class="small dim">/ 100</span></div>
               </div>`
            : `<form id="evidence-form">
                <div class="form-error" id="eerr" hidden></div>
                <div class="field">
                  <label for="evidence">Paste the commands and the output that proves it</label>
                  <textarea class="textarea" id="evidence" name="evidence" required placeholder="C:\> ipconfig /all&#10;&#10;   IPv4 Address . . . : 10.20.4.18&#10;   Default Gateway . : 10.20.4.1&#10;&#10;Then: ping 10.20.4.1 → reply. Decision: ...">${esc(sub?.evidence || '')}</textarea>
                  <span class="hint">A conclusion without output scores low. Output without a conclusion scores low too.</span>
                </div>
                <button class="btn btn-primary" type="submit">${sub ? 'Resubmit' : 'Submit for grading'}</button>
              </form>`}
        </div>
      </section>
    </div>

    <aside style="display:flex;flex-direction:column;gap:16px">
      <div class="card card-pad facts">
        <div><span>Day</span><b>${a.day} of 40</b></div>
        <div><span>Level</span><b>${LEVEL[a.level - 1]}</b></div>
        <div><span>Time box</span><b>${a.minutes} min</b></div>
        <div><span>Module</span><b style="text-align:right;max-width:130px">${esc(module?.title || '')}</b></div>
      </div>
      <div class="card card-pad" style="font-size:12.5px;line-height:1.6;color:var(--text-2)">
        <div style="display:flex;align-items:center;gap:7px;font-weight:560;color:var(--text);margin-bottom:5px">${icon('alert')} Before you submit</div>
        Do not paste customer names, IPs from production or credentials. Replace them with placeholders — the habit matters more than the drill.
      </div>
    </aside>
  </div>`;
}

function wireDrill(root, a, sub) {
  const form = root.querySelector('#evidence-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#eerr');
    err.hidden = true;
    const evidence = form.querySelector('#evidence').value.trim();
    if (evidence.length < 20) {
      err.textContent = 'Add the actual output and your conclusion — at least a couple of lines.';
      err.hidden = false;
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Submitting…';
    try {
      await api('/api/assignments/submit', { method: 'POST', body: { assignmentId: a.id, evidence } });
      await refreshMe();
      window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: 'Submitted for grading' } }));
      navigate(`/practice/${a.id}`, { force: true, replace: true });
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Submit for grading';
    }
  });
}
