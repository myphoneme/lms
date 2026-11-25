/* Control room: grading, roster, curriculum, review, complexity, branding, tenants.
   Course coordinators see only curriculum, review and complexity. */
import { api, state, refreshMe } from '../api.js';
import { icon, esc, fmtDate, statusChip, copyText, toast, openModal } from '../ui.js';
import { navigate } from '../shell.js';

const shortDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const LEVELS = ['Core', 'Applying', 'Diagnosing', 'Complex'];
const STATUS_LABEL = { unverified: 'Unverified', draft: 'Draft', in_review: 'In review', verified: 'Verified', changes: 'Changes requested' };
const STATUS_TONE = { unverified: 'plain', draft: 'plain', in_review: 'warn', verified: 'ok', changes: 'bad' };
const CHECKLIST = [
  ['accuracy', 'Technical accuracy', 'Commands, ports, event IDs and claims are correct for the platform taught.'],
  ['commands', 'Commands tested', 'Every command was run, or verified against vendor documentation.'],
  ['video', 'Video verified', 'The clip opens, is the right topic, and the start point is useful.'],
  ['diagram', 'Diagram correct', 'The visual matches the explanation and has no misleading label.'],
  ['scenario', 'Workplace scenario', 'The ticket is realistic and contains no customer names, real IPs or credentials.'],
];

let tab = 'grading';
let selectedSub = null;
let selectedLesson = null;
let reviewFilter = 'all';
let showHidden = false;

const isAdminRole = (role) => role === 'admin' || role === 'owner';
const tabsFor = (role) => {
  if (!isAdminRole(role)) {
    return [['curriculum', 'Curriculum'], ['review', 'Review queue'], ['complexity', 'Complexity & grading']];
  }
  const t = [['grading', 'Grading'], ['roster', 'Roster'], ['curriculum', 'Curriculum'], ['review', 'Review queue'], ['complexity', 'Complexity & grading'], ['brand', 'Brand & rules']];
  if (role === 'owner') t.push(['tenants', 'Companies']);
  return t;
};

export async function controlRoom() {
  const role = state.user.role;
  const data = await api('/api/admin/curriculum');
  const adminMode = isAdminRole(role);
  const overview = adminMode ? await api('/api/admin/overview') : null;
  const roster = adminMode ? await api('/api/admin/roster') : null;

  const tabs = tabsFor(role);
  const requestedTab = new URLSearchParams(location.search).get('tab');
  if (requestedTab && tabs.some(([id]) => id === requestedTab)) tab = requestedTab;
  if (!tabs.some(([id]) => id === tab)) tab = adminMode ? 'grading' : 'curriculum';

  const submission = overview ? (overview.submissions.find((s) => s.id === selectedSub) || overview.submissions.find((s) => s.status === 'submitted') || null) : null;
  if (submission) selectedSub = submission.id;
  const assignment = submission ? state.content.assignments.find((a) => a.id === submission.assignmentId) : null;

  const pending = data.lessons.filter((l) => l.review.status === 'in_review').length;
  const verified = data.lessons.filter((l) => l.review.status === 'verified').length;
  const tenantLabel = state.site?.name || state.user?.tenant?.name || '';

  return {
    crumb: [{ label: 'Control room' }],
    html: `<div class="page-head">
      <div>
        <h1 style="font-size:28px">Control room</h1>
        <p class="muted" style="margin-top:4px">${esc(tenantLabel)} · ${esc(role === 'coordinator' ? 'Course coordinator' : role === 'owner' ? 'Owner' : 'Administrator')} · ${data.lessons.filter((l) => !l.hidden).length} live topics · ${verified} verified${pending ? ` · ${pending} awaiting review` : ''}</p>
      </div>
      <div class="spacer"></div>
      ${adminMode ? `<a class="btn btn-ghost" href="/api/admin/export.csv">${icon('download')} Export CSV</a>` : ''}
    </div>

    <div class="tabs" role="tablist">
      ${tabs.map(([id, label]) => `<button class="tab" role="tab" data-tab="${id}" aria-selected="${tab === id}">${esc(label)}${id === 'review' && pending ? ` (${pending})` : ''}</button>`).join('')}
    </div>

    <div id="tab-body">
      ${tab === 'grading' && overview ? gradingTab(overview, submission, assignment) : ''}
      ${tab === 'roster' && roster ? rosterTab(roster.roster, adminMode) : ''}
      ${tab === 'curriculum' ? curriculumTab(data, role) : ''}
      ${tab === 'review' ? reviewTab(data) : ''}
      ${tab === 'complexity' ? complexityTab(data) : ''}
      ${tab === 'brand' && adminMode ? brandTab(data.grading, state.user.role === 'owner') : ''}
      ${tab === 'tenants' && role === 'owner' ? '<div id="tenants-body"><div class="skeleton" style="height:120px"></div></div>' : ''}
    </div>`,
    mount: (root) => {
      root.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => copyText(b.dataset.copy)));
      root.querySelectorAll('[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => { tab = btn.dataset.tab; selectedLesson = null; window.dispatchEvent(new PopStateEvent('popstate')); });
      });

      if (tab === 'grading' && overview) wireGrading(root, overview, submission, assignment);
      if (tab === 'roster' && roster) wireRoster(root);
      if (tab === 'curriculum') wireCurriculum(root, data);
      if (tab === 'review') wireReview(root, data);
      if (tab === 'complexity') wireComplexity(root, data);
      if (tab === 'brand') wireBrand(root);
      if (tab === 'tenants' && role === 'owner') loadTenants(root);
    },
  };
}

/* ---------------- grading ---------------- */
function gradingTab(overview, submission, assignment) {
  if (!overview.submissions.length) {
    return `<div class="panel"><div class="empty"><b>Nothing submitted yet.</b>Drills appear here the moment a learner submits evidence.</div></div>`;
  }
  return `<div class="dash-grid">
    <div class="panel">
      <div class="panel-head"><h2>Queue</h2><span class="spacer"></span><span class="small dim">${overview.counts.pending} waiting</span></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Learner</th><th>Drill</th><th>Status</th><th>Submitted</th></tr></thead>
          <tbody>
            ${overview.submissions
              .map(
                (s) => `<tr style="${selectedSub === s.id ? 'background:var(--accent-soft)' : ''}">
                <td><b style="font-weight:560">${esc(s.learner)}</b></td>
                <td>Day ${assignmentFor(s.assignmentId)?.day || '—'} · ${esc(assignmentFor(s.assignmentId)?.title || s.assignmentId)}</td>
                <td>${statusChip(s.status, s.score)}</td>
                <td class="small dim nowrap">${shortDate(s.createdAt)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:10px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--text-3)">
        Select a submission below to grade it.
      </div>
    </div>

    <div class="card card-pad grade-panel">
      ${submission
        ? `<div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
            <span class="chip chip-accent">Submission</span>
            <span class="small dim">${esc(submission.learner)}</span>
            <span style="flex:1"></span>${statusChip(submission.status, submission.score)}
          </div>
          <h2 style="font-size:17px;margin:6px 0 2px">Day ${assignment?.day} — ${esc(assignment?.title || submission.assignmentId)}</h2>
          <p class="small dim" style="margin-bottom:12px">${esc(assignment?.deliverable || '')}</p>
          <div class="evidence-box">${esc(submission.evidence)}</div>
          <form id="grade-form" style="margin-top:16px">
            <div class="form-error" id="gerr" hidden></div>
            <div style="margin:12px 0 6px;font-size:12px;font-weight:600;color:var(--text-2)">Rubric</div>
            <table class="rubric">
              <thead><tr><th>Criterion</th><th style="width:80px">Score</th></tr></thead>
              <tbody>
                ${(assignment?.rubric || [{ criterion: 'Overall', weight: 100, lookFor: '' }])
                  .map(
                    (r, i) => `<tr><td>${esc(r.criterion)}<div class="tiny dim" style="margin-top:2px">${esc(r.lookFor)} · weight ${r.weight}</div></td>
                    <td><input class="input mono" type="number" min="0" max="100" data-crit="${i}" data-weight="${r.weight}" placeholder="0–100" style="padding:5px 8px" /></td></tr>`
                  )
                  .join('')}
              </tbody>
            </table>
            <div style="display:flex;align-items:baseline;gap:8px;margin:10px 0 14px">
              <span class="small dim">Weighted total</span>
              <b class="num" id="g-total" style="font-size:22px">—</b>
            </div>
            <div class="field">
              <label for="feedback">Feedback the learner will read</label>
              <textarea class="textarea" id="feedback" style="min-height:90px" placeholder="What was right, what was missing, what to do differently next time.">${esc(submission.feedback || '')}</textarea>
            </div>
            <button class="btn btn-primary btn-block" type="submit">${submission.status === 'graded' ? 'Update grade' : 'Publish grade'}</button>
          </form>`
        : '<div class="empty"><b>Pick a submission.</b>The evidence and rubric will show here.</div>'}
    </div>
  </div>`;
}

function assignmentFor(id) {
  return state.content.assignments.find((a) => a.id === id);
}

function wireGrading(root, overview, submission, assignment) {
  root.querySelectorAll('.data-table tbody tr').forEach((tr, i) => {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      selectedSub = overview.submissions[i].id;
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  });
  const form = root.querySelector('#grade-form');
  if (!form) return;
  const inputs = [...form.querySelectorAll('[data-crit]')];
  const total = form.querySelector('#g-total');
  const calc = () => {
    const weights = inputs.map((i) => Number(i.dataset.weight) || 0);
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    let earned = 0;
    let any = false;
    inputs.forEach((i) => {
      const v = Number(i.value);
      if (Number.isFinite(v) && i.value !== '') { earned += v * (Number(i.dataset.weight) || 0); any = true; }
    });
    total.textContent = any ? Math.round(earned / sum) : '—';
    return any ? Math.round(earned / sum) : null;
  };
  inputs.forEach((i) => i.addEventListener('input', calc));
  if (submission.status === 'graded' && Array.isArray(submission.rubric) && submission.rubric.length) {
    submission.rubric.forEach((r, idx) => { if (inputs[idx]) inputs[idx].value = r.score; });
  }
  calc();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('#gerr');
    err.hidden = true;
    const score = calc();
    if (score === null) { err.textContent = 'Score at least one rubric line.'; err.hidden = false; return; }
    const rubric = inputs.map((i, idx) => ({
      criterion: assignment.rubric?.[idx]?.criterion || 'Overall',
      score: Number(i.value) || 0,
      weight: Number(i.dataset.weight) || 0,
    }));
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Publishing…';
    try {
      await api('/api/admin/grade', { method: 'POST', body: { id: submission.id, score, feedback: form.querySelector('#feedback').value, rubric } });
      toast('Grade published');
      selectedSub = null;
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Publish grade';
    }
  });
}

/* ---------------- roster ---------------- */
function rosterTab(roster, adminMode) {
  return `<div class="two-col">
    <div class="panel">
      <div class="panel-head"><h2>Roster</h2><span class="spacer"></span><span class="small dim">${roster.length} accounts</span></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Role</th><th>Baseline</th><th>Readiness</th><th>Modules</th><th>Drills</th></tr></thead>
          <tbody>
            ${roster
              .map(
                (u) => `<tr>
                <td><b style="font-weight:560">${esc(u.name)}</b><div class="tiny dim">${esc(u.email)}</div></td>
                <td><span class="chip ${u.role === 'learner' ? 'chip-plain' : 'chip-accent'}">${esc(u.role)}</span></td>
                <td class="num">${u.preScore == null ? '—' : `${u.preScore}%`}</td>
                <td class="num">${u.overall ? `${u.overall}%` : '—'}</td>
                <td class="num">${u.quizzesPassed}/8</td>
                <td class="num">${u.assignmentsGraded}/40</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="panel">
        <div class="panel-head"><h2>Add a person</h2></div>
        <div class="panel-body">
          <p class="small muted" style="margin-bottom:10px">Coordinators get the curriculum, review and grading tabs. They cannot see this roster or brand settings.</p>
          <form id="person-form">
            <div class="form-error" id="perr" hidden></div>
            <div class="field"><label for="p-name">Full name</label><input class="input" id="p-name" required /></div>
            <div class="field"><label for="p-email">Work email</label><input class="input" id="p-email" type="email" required /></div>
            <div class="two-col" style="gap:12px">
              <div class="field"><label for="p-role">Role</label>
                <select class="select" id="p-role"><option value="coordinator">Course coordinator</option><option value="learner">Learner</option></select>
              </div>
              <div class="field"><label for="p-pass">Temporary password</label><input class="input mono" id="p-pass" minlength="8" placeholder="min 8 chars" /></div>
            </div>
            <button class="btn btn-primary btn-sm" type="submit">Create account</button>
          </form>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Import learners</h2></div>
        <div class="panel-body">
          <p class="small muted" style="margin-bottom:10px">One per line: <span class="mono">name,email</span>. A password is generated when omitted.</p>
          <form id="import-form">
            <div class="form-error" id="ierr" hidden></div>
            <div class="field"><label for="csv">CSV lines</label><textarea class="textarea" id="csv" style="min-height:96px" placeholder="name,email,password&#10;Asha Menon,asha@example.com"></textarea></div>
            <div class="field"><label for="cohort">Cohort label</label><input class="input" id="cohort" value="Cohort 1" /></div>
            <button class="btn btn-primary btn-sm" type="submit">Create accounts</button>
          </form>
          <div id="import-out" style="margin-top:12px"></div>
        </div>
      </div>
    </div>
  </div>`;
}

function wireRoster(root) {
  const person = root.querySelector('#person-form');
  person?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#perr');
    err.hidden = true;
    const btn = person.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await api('/api/admin/users', {
        method: 'POST',
        body: {
          name: root.querySelector('#p-name').value,
          email: root.querySelector('#p-email').value,
          role: root.querySelector('#p-role').value,
          password: root.querySelector('#p-pass').value,
        },
      });
      toast('Account created');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    } finally { btn.disabled = false; }
  });

  const form = root.querySelector('#import-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#ierr');
    err.hidden = true;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const out = await api('/api/admin/import', { method: 'POST', body: { csv: root.querySelector('#csv').value, cohort: root.querySelector('#cohort').value } });
      root.querySelector('#import-out').innerHTML = `
        <div class="small" style="font-weight:560;margin-bottom:6px">${out.created.length} created</div>
        ${out.created.map((c) => `<div class="small mono dim">${esc(c.email)} · ${esc(c.password)}</div>`).join('')}
        ${out.skipped.length ? `<div class="tiny dim" style="margin-top:6px">${out.skipped.length} skipped</div>` : ''}
        <p class="tiny dim" style="margin-top:8px">Copy these passwords now; they are not shown again.</p>`;
      toast('Accounts created');
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    } finally { btn.disabled = false; }
  });
}

/* ---------------- curriculum ---------------- */
function statusChipFor(review) {
  const status = review?.status || 'unverified';
  return `<span class="chip chip-${STATUS_TONE[status] || 'plain'}"><span class="dot"></span>${STATUS_LABEL[status] || status}</span>`;
}

function curriculumTab(data, role) {
  const list = data.lessons.filter((l) => showHidden || !l.hidden);
  const modules = data.modules;
  return `<div class="two-col" style="grid-template-columns:minmax(0,1.45fr) minmax(0,1fr)">
    <div style="display:flex;flex-direction:column;gap:16px">
    <div class="panel">
      <div class="panel-head"><h2>Courses</h2><span class="spacer"></span><span class="small dim">rename the course and its line</span></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>#</th><th>Course name</th><th>Line</th><th></th></tr></thead>
          <tbody>
            ${modules.map((m) => `<tr>
              <td class="mono small dim">${String(m.seq).padStart(2, '0')}</td>
              <td><b style="font-weight:560">${esc(m.title)}</b></td>
              <td class="small dim">${esc(m.tagline || '')}</td>
              <td style="text-align:right"><button class="btn btn-quiet btn-sm" data-module="${m.id}">Rename</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Topics</h2><span class="spacer"></span>
        <label class="small dim" style="display:flex;gap:6px;align-items:center;cursor:pointer"><input type="checkbox" id="show-hidden" ${showHidden ? 'checked' : ''}/> show removed</label>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Topic</th><th>Module</th><th>Level</th><th>Review</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>
            ${list
              .map(
                (l) => `<tr data-lesson="${esc(l.id)}" style="${l.hidden ? 'opacity:.55' : ''}">
                <td><b style="font-weight:560">${esc(l.title)}</b><div class="tiny dim">${l.custom ? 'Coordinator-added' : `Lesson ${l.seq}`} · ${l.minutes} min${l.hidden ? ' · removed' : ''}</div></td>
                <td class="small">${esc(modules.find((m) => m.id === l.moduleId)?.title || l.moduleId)}</td>
                <td><span class="chip chip-plain">${esc(l.level)}</span></td>
                <td>${statusChipFor(l.review)}</td>
                <td style="text-align:right;white-space:nowrap">
                  <button class="btn btn-quiet btn-sm" data-edit="${esc(l.id)}">Edit</button>
                  <button class="btn btn-quiet btn-sm" data-review="${esc(l.id)}">Review</button>
                  ${l.custom
                    ? `<button class="btn btn-quiet btn-sm" data-delete="${esc(l.id)}" style="color:var(--bad)">Delete</button>`
                    : `<button class="btn btn-quiet btn-sm" data-hide="${esc(l.id)}" data-hidden="${l.hidden ? '1' : '0'}">${l.hidden ? 'Restore' : 'Remove'}</button>`}
                </td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
      <div style="padding:10px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--text-3)">
        Removing a shared topic hides it for this company only; the platform content stays intact. Coordinator-added topics are deleted permanently.
      </div>
    </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Add a topic</h2></div>
      <div class="panel-body">
        <form id="topic-form">
          <div class="form-error" id="terr" hidden></div>
          <div class="two-col" style="gap:12px">
            <div class="field"><label for="t-mod">Module</label>
              <select class="select" id="t-mod">${modules.map((m) => `<option value="${m.id}">${String(m.seq).padStart(2, '0')} · ${esc(m.title)}</option>`).join('')}</select>
            </div>
            <div class="field"><label for="t-level">Complexity</label>
              <select class="select" id="t-level">${LEVELS.map((l) => `<option ${l === 'Core' ? 'selected' : ''}>${l}</option>`).join('')}</select>
            </div>
          </div>
          <div class="field"><label for="t-title">Topic title</label><input class="input" id="t-title" required placeholder="Reading a switch port from the CLI" /></div>
          <div class="field"><label for="t-sub">One-line description</label><input class="input" id="t-sub" placeholder="What the learner will be able to do after this." /></div>
          <div class="two-col" style="gap:12px">
            <div class="field"><label for="t-min">Minutes</label><input class="input mono" id="t-min" type="number" min="5" max="60" value="12" /></div>
            <div class="field"><label for="t-topics">Sheet topics (comma)</label><input class="input" id="t-topics" placeholder="Switching, Ports" /></div>
          </div>
          <div class="field"><label for="t-obj">Objectives, one per line</label><textarea class="textarea" id="t-obj" style="min-height:64px" placeholder="Identify the port state&#10;Read the error counter"></textarea></div>
          <div class="field"><label for="t-head">Section heading</label><input class="input" id="t-head" value="What this topic covers" /></div>
          <div class="field"><label for="t-body">Teaching text (markdown, 80+ characters)</label><textarea class="textarea" id="t-body" style="min-height:150px" placeholder="Open with the ticket or task. Then the checks, then what to hand over."></textarea></div>
          <div class="field"><label for="t-ticket">Work order subject</label><input class="input" id="t-ticket" placeholder="Switch port shows err-disabled after a move" /></div>
          <div class="field"><label for="t-video">Video URL (optional, YouTube)</label><input class="input mono" id="t-video" placeholder="https://www.youtube.com/watch?v=…" /></div>
          <button class="btn btn-primary btn-sm" type="submit">Add to curriculum</button>
        </form>
        <p class="tiny dim" style="margin-top:10px">New topics start as Draft. They appear in the course immediately for your company, and must pass review before they count as verified.</p>
      </div>
    </div>
  </div>`;
}

function editTopicModal(lessonId) {
  const lesson = state.content.lessons[lessonId];
  if (!lesson) return;
  const body = (lesson.sections || []).map((s) => `## ${s.h}\n\n${s.body}`).join('\n\n');
  const dlg = openModal(`<form id="edit-topic">
    <div class="m-head"><h2 style="font-size:16px">Edit topic</h2><span style="flex:1"></span><button type="button" class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="m-body">
      <div class="form-error" id="eerr" hidden></div>
      <div class="field"><label for="e-title">Title</label><input class="input" id="e-title" value="${esc(lesson.title)}" required /></div>
      <div class="field"><label for="e-sub">One-line description</label><input class="input" id="e-sub" value="${esc(lesson.subtitle || '')}" /></div>
      <div class="two-col" style="gap:12px">
        <div class="field"><label for="e-min">Minutes</label><input class="input mono" id="e-min" type="number" min="3" max="90" value="${lesson.minutes || 12}" /></div>
        <div class="field"><label for="e-level">Complexity</label><select class="select" id="e-level">${LEVELS.map((l) => `<option ${l === lesson.level ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="e-obj">Objectives, one per line</label><textarea class="textarea" id="e-obj" style="min-height:64px">${esc((lesson.objectives || []).join('\n'))}</textarea></div>
      <div class="field"><label for="e-body">Content — use ## headings to split sections</label><textarea class="textarea" id="e-body" style="min-height:260px">${esc(body)}</textarea></div>
    </div>
    <div class="m-foot"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save topic</button></div>
  </form>`, { onMount: (d) => { d.style.maxWidth = '760px'; } });

  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.querySelector('#edit-topic').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = dlg.querySelector('#eerr');
    err.hidden = true;
    const btn = dlg.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await api(`/api/admin/topics/${encodeURIComponent(lessonId)}/edit`, {
        method: 'POST',
        body: {
          title: dlg.querySelector('#e-title').value,
          subtitle: dlg.querySelector('#e-sub').value,
          minutes: Number(dlg.querySelector('#e-min').value),
          level: dlg.querySelector('#e-level').value,
          objectives: dlg.querySelector('#e-obj').value,
          body: dlg.querySelector('#e-body').value,
        },
      });
      dlg.close();
      toast('Topic updated');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Save topic';
    }
  });
}

function renameModuleModal(moduleId) {
  const mod = (state.content.modules || []).find((m) => m.id === moduleId);
  if (!mod) return;
  const dlg = openModal(`<form id="rename-module">
    <div class="m-head"><h2 style="font-size:16px">Rename course</h2><span style="flex:1"></span><button type="button" class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="m-body">
      <div class="form-error" id="merr" hidden></div>
      <div class="field"><label for="m-title">Course name</label><input class="input" id="m-title" value="${esc(mod.title)}" required /></div>
      <div class="field"><label for="m-tag">One-line description</label><input class="input" id="m-tag" value="${esc(mod.tagline || '')}" /></div>
    </div>
    <div class="m-foot"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Save name</button></div>
  </form>`);
  dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.querySelector('#rename-module').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = dlg.querySelector('#merr');
    err.hidden = true;
    try {
      await api(`/api/admin/modules/${encodeURIComponent(moduleId)}`, {
        method: 'POST',
        body: { title: dlg.querySelector('#m-title').value, tagline: dlg.querySelector('#m-tag').value },
      });
      dlg.close();
      toast('Course renamed');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });
}

function wireCurriculum(root, data) {
  root.querySelectorAll('[data-module]').forEach((b) => b.addEventListener('click', () => renameModuleModal(b.dataset.module)));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => editTopicModal(b.dataset.edit)));
  const hiddenToggle = root.querySelector('#show-hidden');
  hiddenToggle?.addEventListener('change', () => { showHidden = hiddenToggle.checked; window.dispatchEvent(new PopStateEvent('popstate')); });

  root.querySelectorAll('[data-review]').forEach((btn) => {
    btn.addEventListener('click', () => { selectedLesson = btn.dataset.review; tab = 'review'; window.dispatchEvent(new PopStateEvent('popstate')); });
  });

  root.querySelectorAll('[data-hide]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const hide = btn.dataset.hidden !== '1';
      try {
        await api(`/api/admin/topics/${encodeURIComponent(btn.dataset.hide)}/hide`, { method: 'POST', body: { hidden: hide } });
        toast(hide ? 'Topic removed from this company' : 'Topic restored');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (e) { toast(e.message, 'bad'); }
    });
  });

  root.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this coordinator-added topic permanently?')) return;
      try {
        await api(`/api/admin/topics/${encodeURIComponent(btn.dataset.delete)}`, { method: 'DELETE' });
        toast('Topic deleted');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (e) { toast(e.message, 'bad'); }
    });
  });

  const form = root.querySelector('#topic-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#terr');
    err.hidden = true;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Adding…';
    try {
      await api('/api/admin/topics', {
        method: 'POST',
        body: {
          moduleId: root.querySelector('#t-mod').value,
          level: root.querySelector('#t-level').value,
          title: root.querySelector('#t-title').value,
          subtitle: root.querySelector('#t-sub').value,
          minutes: Number(root.querySelector('#t-min').value),
          topics: root.querySelector('#t-topics').value,
          objectives: root.querySelector('#t-obj').value,
          heading: root.querySelector('#t-head').value,
          body: root.querySelector('#t-body').value,
          ticketSubject: root.querySelector('#t-ticket').value,
          videoUrl: root.querySelector('#t-video').value,
        },
      });
      await refreshMe();
      toast('Topic added as draft');
      tab = 'curriculum';
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Add to curriculum';
    }
  });
}

/* ---------------- review ---------------- */
function reviewTab(data) {
  const counts = { all: data.lessons.length };
  for (const s of ['unverified', 'draft', 'in_review', 'verified', 'changes']) counts[s] = data.lessons.filter((l) => l.review.status === s).length;
  const filter = reviewFilter;
  const list = data.lessons.filter((l) => (filter === 'all' ? true : l.review.status === filter));
  const current = data.lessons.find((l) => l.id === selectedLesson) || list[0] || null;
  const lesson = current ? state.content.lessons[current.id] : null;
  const check = current?.review?.checklist || {};

  return `<div class="dash-grid">
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="filters" style="margin-bottom:0">
        ${['all', 'unverified', 'in_review', 'verified', 'changes'].map((f) => `<button class="filter-btn" data-rfilter="${f}" aria-pressed="${filter === f}">${STATUS_LABEL[f] || 'All'} (${counts[f]})</button>`).join('')}
      </div>
      <div class="panel">
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Topic</th><th>Module</th><th>Status</th><th>Reviewer</th></tr></thead>
            <tbody>
              ${list
                .map(
                  (l) => `<tr data-rlesson="${esc(l.id)}" style="${current && current.id === l.id ? 'background:var(--accent-soft)' : ''};cursor:pointer">
                  <td><b style="font-weight:560">${esc(l.title)}</b><div class="tiny dim">${esc(l.level)} · ${l.minutes} min</div></td>
                  <td class="small">${esc(l.moduleId)}</td>
                  <td>${statusChipFor(l.review)}</td>
                  <td class="small dim">${esc(l.review.reviewer || '—')}<div class="tiny">${l.review.reviewedAt ? shortDate(l.review.reviewedAt) : ''}</div></td>
                </tr>`
                )
                .join('') || '<tr><td colspan="4"><div class="empty">Nothing in this filter.</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="card card-pad grade-panel">
      ${current
        ? `<div style="display:flex;align-items:center;gap:10px">
            <span class="chip chip-accent">${esc(current.level)}</span>
            <span class="small dim">${esc(current.moduleId)}</span>
            <span style="flex:1"></span>${statusChipFor(current.review)}
          </div>
          <h2 style="font-size:17px;margin:8px 0 2px">${esc(current.title)}</h2>
          <p class="small dim" style="margin-bottom:12px">${lesson ? esc(lesson.subtitle || '') : ''} <a class="link" href="/lesson/${esc(current.id)}" target="_blank" rel="noopener">open lesson</a></p>

          <div class="tiny dim" style="letter-spacing:.07em;text-transform:uppercase;margin-bottom:8px">Verification checklist</div>
          <div style="display:flex;flex-direction:column;gap:4px">
            ${CHECKLIST.map(
              ([key, label, hint]) => `<label class="opt" style="align-items:flex-start">
                <input type="checkbox" data-check="${key}" ${check[key] ? 'checked' : ''} />
                <span><b style="font-weight:560">${label}</b><span class="tiny dim" style="display:block;margin-top:2px">${hint}</span></span>
              </label>`
            ).join('')}
          </div>

          <div class="field" style="margin-top:14px">
            <label for="r-note">Reviewer note</label>
            <textarea class="textarea" id="r-note" style="min-height:84px" placeholder="What you checked, what still needs work.">${esc(current.review.note || '')}</textarea>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" id="r-verify">Verify content</button>
            <button class="btn btn-ghost" id="r-progress">Send to review</button>
            <button class="btn btn-quiet" id="r-changes" style="color:var(--bad)">Request changes</button>
          </div>
          ${current.review.status === 'verified' ? `<p class="small" style="margin-top:12px;color:var(--ok)">${icon('check')} Verified by ${esc(current.review.reviewer || '')} on ${fmtDate(current.review.reviewedAt)}.</p>` : ''}
          <p class="tiny dim" style="margin-top:10px">Verification needs all five checks. It records your name and time against this topic for the company.</p>`
        : '<div class="empty"><b>No topic selected.</b>Pick one from the queue.</div>'}
    </div>
  </div>`;
}

function wireReview(root, data) {
  root.querySelectorAll('[data-rfilter]').forEach((btn) => {
    btn.addEventListener('click', () => { reviewFilter = btn.dataset.rfilter; window.dispatchEvent(new PopStateEvent('popstate')); });
  });
  root.querySelectorAll('[data-rlesson]').forEach((tr) => {
    tr.addEventListener('click', () => { selectedLesson = tr.dataset.rlesson; window.dispatchEvent(new PopStateEvent('popstate')); });
  });
  const current = data.lessons.find((l) => l.id === selectedLesson) || data.lessons.filter((l) => reviewFilter === 'all' || l.review.status === reviewFilter)[0];
  if (!current) return;

  const submit = async (status) => {
    const checklist = {};
    root.querySelectorAll('[data-check]').forEach((c) => { checklist[c.dataset.check] = c.checked; });
    try {
      await api('/api/admin/review', { method: 'POST', body: { lessonId: current.id, status, checklist, note: root.querySelector('#r-note').value } });
      toast(status === 'verified' ? 'Content verified' : status === 'changes' ? 'Changes requested' : 'Moved to review');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (e) { toast(e.message, 'bad'); }
  };
  root.querySelector('#r-verify')?.addEventListener('click', () => submit('verified'));
  root.querySelector('#r-progress')?.addEventListener('click', () => submit('in_review'));
  root.querySelector('#r-changes')?.addEventListener('click', () => submit('changes'));
}

/* ---------------- complexity & grading ---------------- */
function complexityTab(data) {
  const modules = data.modules;
  const g = data.grading;
  const assignmentLevels = [1, 2, 3, 4].map((level) => ({ level, count: data.assignments.filter((a) => a.level === level).length }));
  return `<div style="display:flex;flex-direction:column;gap:22px">
    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h2>Grading rules</h2><span class="spacer"></span><span class="small dim">applies to this company</span></div>
        <div class="panel-body">
          <form id="grading-form">
            <div class="form-error" id="grerr" hidden></div>
            <div class="two-col" style="gap:12px">
              <div class="field"><label for="g-pass">Module pass mark (%)</label><input class="input mono" id="g-pass" type="number" min="50" max="95" value="${g.passPct}" /></div>
              <div class="field"><label for="g-attempts">Attempts per test</label><input class="input mono" id="g-attempts" type="number" min="1" max="10" value="${g.attempts}" /></div>
            </div>
            <div class="field"><label for="g-cert">Certificate mark (%)</label><input class="input mono" id="g-cert" type="number" min="60" max="100" value="${g.certPct}" /></div>
            <button class="btn btn-primary btn-sm" type="submit">Save grading rules</button>
          </form>
          <hr class="rule" style="margin:18px 0" />
          <div class="facts" style="font-size:13px">
            <div style="display:flex;justify-content:space-between;padding:5px 0"><span class="dim">Readiness formula</span><b>50% quiz + 50% drills</b></div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--line)"><span class="dim">Certificate rule</span><b style="text-align:right;max-width:220px">${esc(g.certificateRule)}</b></div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--line)"><span class="dim">Quiz questions</span><b>10 per module</b></div>
            <div style="display:flex;justify-content:space-between;padding:5px 0;border-top:1px solid var(--line)"><span class="dim">Drills</span><b>40, five per week</b></div>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Difficulty mix</h2><span class="spacer"></span><span class="small dim">lessons by complexity</span></div>
        <div class="panel-body" style="padding:8px 10px 14px">
          <table class="data-table">
            <thead><tr><th>Module</th><th>Core</th><th>Applying</th><th>Diagnosing</th><th>Complex</th><th>Quiz</th></tr></thead>
            <tbody>
              ${modules
                .map(
                  (m) => `<tr>
                  <td><b style="font-weight:560">${String(m.seq).padStart(2, '0')} ${esc(m.title)}</b><div class="tiny dim">${m.lessons} live${m.hidden ? ` · ${m.hidden} removed` : ''}</div></td>
                  <td class="num">${m.complexity.Core || 0}</td>
                  <td class="num">${m.complexity.Applying || 0}</td>
                  <td class="num">${m.complexity.Diagnosing || 0}</td>
                  <td class="num">${m.complexity.Complex || 0}</td>
                  <td class="num">${m.quizPassPct}%</td>
                </tr>`
                )
                .join('')}
            </tbody>
          </table>
          <div style="display:flex;gap:18px;padding:12px 10px 0;font-size:12px;color:var(--text-3);flex-wrap:wrap">
            ${assignmentLevels.map((l) => `<span>Level ${l.level}: <b class="num" style="color:var(--text)">${l.count}</b> drills</span>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Set complexity per topic</h2><span class="spacer"></span><span class="small dim">the level shown on the lesson and used in this report</span></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Topic</th><th>Module</th><th>Current</th><th>Set to</th><th>Review</th></tr></thead>
          <tbody>
            ${data.lessons
              .filter((l) => !l.hidden)
              .map(
                (l) => `<tr>
                <td>${esc(l.title)}</td>
                <td class="small dim">${esc(l.moduleId)}</td>
                <td><span class="chip chip-plain">${esc(l.level)}</span></td>
                <td><select class="select" data-level="${esc(l.id)}" style="max-width:140px;padding:4px 8px">
                  ${LEVELS.map((x) => `<option ${x === l.level ? 'selected' : ''}>${x}</option>`).join('')}
                </select></td>
                <td>${statusChipFor(l.review)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="two-col">
      <div class="panel">
        <div class="panel-head"><h2>Quiz coverage by tag</h2></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Test</th><th>Pass</th><th>Attempts</th><th>Tags</th></tr></thead>
            <tbody>
              ${Object.values(data.quizzes)
                .map(
                  (q) => `<tr><td><b style="font-weight:560">${esc(q.title)}</b><div class="tiny dim">${q.questions} questions</div></td>
                  <td class="num">${q.passPct}%</td><td class="num">${q.attempts}</td>
                  <td class="small dim">${Object.entries(q.byTag).map(([t, n]) => `${esc(t)} ${n}`).join(' · ')}</td></tr>`
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Recent curriculum activity</h2></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Target</th></tr></thead>
            <tbody>
              ${(data.audit || [])
                .map(
                  (a) => `<tr><td class="small dim nowrap">${shortDate(a.created_at)}</td><td class="small">${esc(a.actor || '—')}</td><td class="small mono">${esc(a.action)}</td><td class="small dim">${esc(String(a.target || '').slice(0, 18))}</td></tr>`
                )
                .join('') || '<tr><td colspan="4"><div class="empty">No activity yet.</div></td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;
}

function wireComplexity(root, data) {
  root.querySelectorAll('[data-level]').forEach((sel) => {
    sel.addEventListener('change', async () => {
      try {
        await api('/api/admin/complexity', { method: 'POST', body: { lessonId: sel.dataset.level, level: sel.value } });
        toast('Complexity updated');
        window.dispatchEvent(new PopStateEvent('popstate'));
      } catch (e) { toast(e.message, 'bad'); sel.value = sel.dataset.current || sel.value; }
    });
  });
  const form = root.querySelector('#grading-form');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#grerr');
    err.hidden = true;
    try {
      await api('/api/admin/grading', {
        method: 'POST',
        body: {
          passPct: Number(root.querySelector('#g-pass').value),
          attempts: Number(root.querySelector('#g-attempts').value),
          certPct: Number(root.querySelector('#g-cert').value),
        },
      });
      toast('Grading rules saved');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });
}

/* ---------------- brand ---------------- */
function brandTab(grading, isOwner) {
  const t = state.user?.tenant || state.site || {};
  return `<form id="brand-form" class="two-col">
    <div class="panel">
      <div class="panel-head"><h2>Identity</h2></div>
      <div class="panel-body">
        <div class="form-error" id="berr" hidden></div>
        <div class="field"><label for="name">Company name</label><input class="input" id="name" value="${esc(t.name || '')}" /></div>
        <div class="field"><label for="tagline">Programme line</label><input class="input" id="tagline" value="${esc(t.tagline || '')}" /></div>
        <div class="two-col" style="gap:12px">
          <div class="field"><label for="primary">Primary colour</label><div class="color-input"><input type="color" id="primary" value="${esc(t.primary || '#1f4fd8')}" /><input class="input mono" value="${esc(t.primary || '#1f4fd8')}" readonly /></div></div>
          <div class="field"><label for="accent">Accent colour</label><div class="color-input"><input type="color" id="accent" value="${esc(t.accent || '#0f9d76')}" /><input class="input mono" value="${esc(t.accent || '#0f9d76')}" readonly /></div></div>
        </div>
        <div class="field"><label for="inviteCode">Invite code</label><input class="input mono" id="inviteCode" value="${esc(t.inviteCode || '')}" style="text-transform:uppercase" /></div>
        <div class="field"><label for="signatory">Certificate signatory</label><input class="input" id="signatory" value="${esc(t.signatory || '')}" /></div>
        <div class="field"><label for="signatoryTitle">Signatory title</label><input class="input" id="signatoryTitle" value="${esc(t.signatoryTitle || '')}" /></div>
        <div class="field"><label for="certTitle">Certificate title</label><input class="input" id="certTitle" value="${esc(t.certTitle || '')}" /></div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Grading rules</h2></div>
      <div class="panel-body">
        <div class="field"><label for="passPct">Module pass mark</label><input class="input mono" id="passPct" type="number" min="50" max="95" value="${grading.passPct}" /></div>
        <div class="field"><label for="attempts">Attempts per module</label><input class="input mono" id="attempts" type="number" min="1" max="10" value="${grading.attempts}" /></div>
        <div class="field"><label for="certPct">Certificate mark</label><input class="input mono" id="certPct" type="number" min="60" max="100" value="${grading.certPct}" /></div>
        <hr class="rule" style="margin:18px 0" />
        <button class="btn btn-primary" type="submit">Save configuration</button>
        <p class="hint" style="margin-top:10px">Changes apply on the next page load for every learner in this company.</p>
      </div>
    </div>
  </form>`;
}

function wireBrand(root) {
  const form = root.querySelector('#brand-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#berr');
    err.hidden = true;
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const data = await api('/api/admin/tenant', {
        method: 'PUT',
        body: {
          name: form.querySelector('#name').value,
          tagline: form.querySelector('#tagline').value,
          primary: form.querySelector('#primary').value,
          accent: form.querySelector('#accent').value,
          inviteCode: form.querySelector('#inviteCode').value,
          signatory: form.querySelector('#signatory').value,
          signatoryTitle: form.querySelector('#signatoryTitle').value,
          certTitle: form.querySelector('#certTitle').value,
          passPct: Number(form.querySelector('#passPct').value),
          attempts: Number(form.querySelector('#attempts').value),
          certPct: Number(form.querySelector('#certPct').value),
        },
      });
      state.site = { ...state.site, ...data.tenant };
      document.documentElement.style.setProperty('--accent', data.tenant.primary);
      toast('Configuration saved');
      btn.disabled = false;
      btn.textContent = 'Save configuration';
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Save configuration';
    }
  });
}

/* ---------------- tenants (owner) ---------------- */
async function loadTenants(root) {
  const host = root.querySelector('#tenants-body');
  if (!host) return;
  const data = await api('/api/admin/tenants');
  host.innerHTML = `<div class="two-col">
    <div class="panel">
      <div class="panel-head"><h2>Companies on this deployment</h2></div>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Company</th><th>Code</th><th>Invite</th><th>Learners</th></tr></thead>
          <tbody>
            ${data.tenants
              .map(
                (t) => `<tr><td><b style="font-weight:560">${esc(t.name)}</b><div class="tiny dim">${esc(t.certTitle)}</div></td>
                <td class="mono small">${esc(t.slug)}</td><td class="mono small">${esc(t.inviteCode)}</td><td class="num">${t.learners}</td></tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>Add a company</h2></div>
      <div class="panel-body">
        <form id="tenant-form">
          <div class="form-error" id="terr" hidden></div>
          <div class="field"><label for="t-company">Company name</label><input class="input" id="t-company" required /></div>
          <div class="field"><label for="t-slug">Company code</label><input class="input mono" id="t-slug" required placeholder="acme" /></div>
          <div class="field"><label for="t-signatory">Signatory</label><input class="input" id="t-signatory" /></div>
          <div class="field"><label for="t-invite">Invite code</label><input class="input mono" id="t-invite" value="JOIN" /></div>
          <button class="btn btn-primary btn-sm" type="submit">Create company</button>
        </form>
        <p class="tiny dim" style="margin-top:10px">Each company gets its own branding, roster, thresholds and leaderboard on the same deployment. Content is shared.</p>
      </div>
    </div>
  </div>`;

  const form = host.querySelector('#tenant-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = host.querySelector('#terr');
    err.hidden = true;
    try {
      await api('/api/admin/tenants', {
        method: 'POST',
        body: {
          company: form.querySelector('#t-company').value,
          slug: form.querySelector('#t-slug').value,
          signatory: form.querySelector('#t-signatory').value,
          inviteCode: form.querySelector('#t-invite').value,
        },
      });
      toast('Company created');
      loadTenants(root);
      form.reset();
    } catch (error) {
      err.textContent = error.message;
      err.hidden = false;
    }
  });
}
