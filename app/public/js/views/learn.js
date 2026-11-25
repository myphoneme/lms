/* Learning surfaces: diagnostic, dashboard, course index, lesson reader, quiz. */
import { api, state, refreshMe } from '../api.js';
import { icon, esc, md, fmtPct, bar, initials } from '../ui.js';
import { renderDiagram } from '../diagrams.js';
import { navigate } from '../shell.js';

const TRACKS = {
  'l1-support': {
    title: 'L1 support track',
    line: 'Start with networking and the command line. Those two close the majority of avoidable escalations.',
    first: '/course#m1',
  },
  soc: {
    title: 'SOC track',
    line: 'Your networking is solid enough. Go through security fundamentals and SOC detection with extra care.',
    first: '/course#m4',
  },
  automation: {
    title: 'Automation track',
    line: 'You can reason about systems. Push hardest on scripting so repetitive checks become one command.',
    first: '/course#m8',
  },
  vapt: {
    title: 'Deep technical track',
    line: 'Strong baseline. Do not skip the drills: offensive skills without reporting discipline do not survive a client.',
    first: '/course#m5',
  },
};

const TAG_LABEL = {
  networking: 'Networking',
  linux: 'Linux',
  windows: 'Windows',
  security: 'Security',
  soc: 'SOC',
  ir: 'Incident response',
  automation: 'Automation',
  general: 'General',
};

/* ---------------------------------------------------------------- onboard */
export function onboard() {
  const profile = state.user?.profile;
  const pre = state.content?.preassessment;

  if (profile?.takenAt) {
    return {
      crumb: [{ label: 'Diagnostic' }],
      html: `<div class="diag-shell">
        <p class="tiny dim" style="letter-spacing:.08em;text-transform:uppercase">Diagnostic · ${fmtPct(profile.scorePct)} baseline</p>
        <h1 style="margin:8px 0 6px">Where to spend your eight weeks</h1>
        <p class="muted measure">Taken ${new Date(profile.takenAt).toLocaleDateString()}. Nothing here is graded — it routes your practice and is shown to your mentor.</p>
        <div class="card card-pad" style="margin:24px 0">
          ${profile.domains
            .map(
              (d) => `<div class="domain-row">
              <span class="domain-label">${TAG_LABEL[d.tag] || d.tag}</span>
              ${bar(d.pct)}
              <span class="mono small" style="text-align:right">${d.pct}%</span>
            </div>`
            )
            .join('')}
        </div>
        <div class="card card-pad" style="border-color:var(--accent-line);background:var(--accent-soft)">
          <p class="tiny" style="letter-spacing:.07em;text-transform:uppercase;color:color-mix(in srgb,var(--accent) 70%,black)">Recommended focus</p>
          <h2 style="font-size:19px;margin:6px 0 6px">${TRACKS[profile.track]?.title || 'Core track'}</h2>
          <p class="muted measure" style="font-size:13.5px">${TRACKS[profile.track]?.line || ''}</p>
        </div>
        <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
          <a class="btn btn-primary" href="${TRACKS[profile.track]?.first || '/course'}" data-nav>Open my starting module ${icon('arrowRight')}</a>
          <a class="btn btn-ghost" href="/dashboard" data-nav>Go to today</a>
          <button class="btn btn-quiet" id="retake">Retake diagnostic</button>
        </div>
      </div>`,
      mount: (root) => {
        root.querySelector('#retake').addEventListener('click', () => {
          state.user.profile = null;
          navigate('/onboard');
        });
      },
    };
  }

  if (!pre) return { html: '<div class="page"><div class="empty">Diagnostic not loaded.</div></div>' };

  return {
    crumb: [{ label: 'Diagnostic' }],
    html: `<div class="diag-shell">
      <p class="tiny dim" style="letter-spacing:.08em;text-transform:uppercase">Before you start · ${pre.questions.length} questions</p>
      <h1 style="margin:8px 0 8px">${esc(pre.title || 'What do you already know?')}</h1>
      <p class="muted measure">${esc(pre.intro || '')}</p>
      <div class="diag-progress"><i id="pbar" style="width:0%"></i></div>
      <form id="diag-form">
        <div class="form-error" id="err" hidden></div>
        ${pre.questions
          .map(
            (q, i) => `<div class="q-block">
            <div class="q-num">${String(i + 1).padStart(2, '0')} / ${String(pre.questions.length).padStart(2, '0')}</div>
            <div class="q-text" id="q-${q.id}">${esc(q.q)}</div>
            <div class="opts" role="radiogroup" aria-labelledby="q-${q.id}">
              ${q.options
                .map(
                  (opt, oi) => `<label class="opt"><input type="radio" name="${esc(q.id)}" value="${oi}" required /><span class="k">${'ABCD'[oi]}</span><span>${esc(opt)}</span></label>`
                )
                .join('')}
            </div>
          </div>`
          )
          .join('')}
        <button class="btn btn-primary btn-lg" type="submit">See my result ${icon('arrowRight')}</button>
      </form>
    </div>`,
    mount: (root) => {
      const form = root.querySelector('#diag-form');
      const pbar = root.querySelector('#pbar');
      const total = pre.questions.length;
      const update = () => {
        const answered = new Set([...form.querySelectorAll('input:checked')].map((i) => i.name)).size;
        pbar.style.width = `${(answered / total) * 100}%`;
      };
      form.addEventListener('change', update);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = root.querySelector('#err');
        err.hidden = true;
        const answers = {};
        let missing = false;
        for (const q of pre.questions) {
          const picked = form.querySelector(`input[name="${q.id}"]:checked`);
          if (!picked) { missing = true; break; }
          answers[q.id] = Number(picked.value);
        }
        if (missing) {
          err.textContent = 'Answer every question — a guess is fine, "not sure" is one of the options where it matters.';
          err.hidden = false;
          return;
        }
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.textContent = 'Scoring…';
        try {
          await api('/api/profile/assessment', { method: 'POST', body: { answers } });
          await refreshMe();
          navigate('/onboard', { force: true, replace: true });
        } catch (error) {
          err.textContent = error.message;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = 'See my result';
        }
      });
    },
  };
}

/* ---------------------------------------------------------------- dashboard */
export async function dashboard() {
  const { user, progress, content } = state;
  const modules = content.modules;
  const lessons = content.lessons;
  const assignments = content.assignments;

  const completed = new Set(progress.completedLessons || []);
  const ordered = content.modules.flatMap((m) => m.lessons);
  const nextLessonId = ordered.find((id) => !completed.has(id)) || ordered[ordered.length - 1];
  const nextLesson = lessons[nextLessonId];

  const graded = progress.submissions || {};
  const nextDrill = assignments.find((a) => !graded[a.id] || graded[a.id].status !== 'graded');
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  let board = null;
  try { board = await api('/api/leaderboard'); } catch { board = null; }
  const top = (board?.leaderboard || []).slice(0, 5);

  const modulePct = (m) => (progress.quizzes?.[m.quiz]?.pct || 0);

  return {
    crumb: [{ label: 'Today' }],
    html: `<div class="page-head">
      <div>
        <h1 style="font-size:30px">${esc(user.name.split(' ')[0])}, here is the shortest path today.</h1>
        <p class="muted" style="margin-top:6px">${date} · ${progress.lessonsDone} of ${progress.lessonsTotal} lessons · ${progress.assignmentsGraded} of ${progress.assignmentsTotal} drills graded</p>
      </div>
      <div class="spacer"></div>
      <a class="btn btn-ghost" href="/course" data-nav>${icon('book')} Full course</a>
    </div>

    <div class="today" style="margin-bottom:22px">
      <div>
        <div class="k">Next lesson</div>
        <h2>${esc(nextLesson ? nextLesson.title : 'Course complete')}</h2>
        <div class="sub">${nextLesson ? `${nextLesson.minutes} min · module ${modules.find((m) => m.id === nextLesson.moduleId)?.seq}` : 'Every lesson is marked complete.'}</div>
      </div>
      <div class="cta">
        ${nextLesson ? `<a class="btn btn-primary" href="/lesson/${nextLesson.id}" data-nav>Continue ${icon('arrowRight')}</a>` : ''}
        ${nextDrill ? `<a class="btn btn-ghost" href="/practice/${nextDrill.id}" data-nav>Day ${nextDrill.day} drill</a>` : ''}
      </div>
    </div>

    <div class="dash-grid">
      <div style="display:flex;flex-direction:column;gap:22px">
        <section class="panel">
          <div class="panel-head"><h2>Readiness</h2><span class="spacer"></span>
            ${progress.eligible ? '<span class="chip chip-ok"><span class="dot"></span>Certificate unlocked</span>' : `<span class="chip chip-plain">${Math.max(0, Math.round(80 - progress.overall))} points to certificate</span>`}
          </div>
          <div class="progress-strip">
            <div><div class="big">${progress.overall}%</div><div class="cap">weighted<br>readiness</div></div>
            <div class="sep"></div>
            <div style="flex:1">
              ${bar(progress.overall)}
              <div class="small dim" style="margin-top:7px">Quizzes ${progress.quizAvg}% · drills ${progress.assignmentAvg}%</div>
            </div>
          </div>
          <div class="metric-row">
            <div class="metric"><b>${progress.quizzesPassed}/${progress.quizzesTotal}</b><span>modules passed</span></div>
            <div class="metric"><b>${progress.assignmentsGraded}/${progress.assignmentsTotal}</b><span>drills graded</span></div>
            <div class="metric"><b>${progress.lessonsDone}/${progress.lessonsTotal}</b><span>lessons read</span></div>
            <div class="metric"><b>${progress.points}</b><span>points</span></div>
          </div>
        </section>

        <section>
          <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px">
            <h2 style="font-size:16px">Modules</h2>
            <span class="spacer" style="flex:1"></span>
            <span class="small dim">quiz score / lessons</span>
          </div>
          <div class="module-block">
            <ul class="mod-list">
              ${modules
                .map((m) => {
                  const pct = modulePct(m);
                  const done = m.lessons.filter((id) => completed.has(id)).length;
                  return `<a class="mod-row" href="/course#${m.id}" data-nav>
                    <span class="mod-idx">${String(m.seq).padStart(2, '0')}</span>
                    <span>
                      <span class="mod-name">${esc(m.title)}</span>
                      <span class="mod-sub">${esc(m.tagline || '')}</span>
                    </span>
                    <span class="progress-mini">${bar(pct)}<span class="pct">${pct ? `${pct}% quiz` : 'not taken'}</span></span>
                    <span class="small dim nowrap" style="text-align:right">${done}/${m.lessons.length} lessons</span>
                  </a>`;
                })
                .join('')}
            </ul>
          </div>
        </section>
      </div>

      <aside style="display:flex;flex-direction:column;gap:18px">
        <section class="panel">
          <div class="panel-head"><h2>Leaderboard</h2><span class="spacer"></span><a class="link small" href="/leaderboard" data-nav>All</a></div>
          <div class="panel-body" style="padding:8px 12px 14px">
            <table class="mini-table">
              <thead><tr><th>#</th><th>Learner</th><th class="num" style="text-align:right">Pts</th></tr></thead>
              <tbody>
                ${top
                  .map(
                    (r) => `<tr class="${r.isMe ? 'me' : ''}"><td class="rank">${r.rank}</td><td><span class="lb-name">${esc(r.name)}</span><div class="lb-sub">${r.quizzesPassed} modules · ${r.assignmentsGraded} drills</div></td><td class="num" style="text-align:right"><b>${r.points}</b></td></tr>`
                  )
                  .join('') || '<tr><td colspan="3" class="empty" style="padding:20px">No scores yet.</td></tr>'}
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Today's drill</h2></div>
          <div class="panel-body">
            ${nextDrill
              ? `<p class="small dim">Day ${nextDrill.day} · ${nextDrill.minutes} min · level ${nextDrill.level}/4</p>
                 <h3 style="font-size:14.5px;margin:6px 0 8px">${esc(nextDrill.title)}</h3>
                 <p class="small muted">${esc(nextDrill.task.slice(0, 150))}${nextDrill.task.length > 150 ? '…' : ''}</p>
                 <a class="btn btn-ghost btn-block btn-sm" href="/practice/${nextDrill.id}" data-nav style="margin-top:12px">Open drill</a>`
              : `<p class="small muted">Every drill is graded. Nothing left to submit.</p>`}
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Reference</h2></div>
          <div class="panel-body" style="padding:6px 10px 12px">
            <a class="nav-item" style="color:var(--text-2)" href="/resources#reference" data-nav>${icon('clipboard')} Ports, commands, event IDs</a>
            <a class="nav-item" style="color:var(--text-2)" href="/resources" data-nav>${icon('folder')} Curated sources</a>
          </div>
        </section>
      </aside>
    </div>`,
    mount: () => {},
  };
}

/* ---------------------------------------------------------------- course */
export function course() {
  const { content, progress } = state;
  const completed = new Set(progress.completedLessons || []);
  const quizzes = progress.quizzes || {};

  return {
    crumb: [{ label: 'Course' }],
    html: `<div class="page-head">
      <div>
        <h1>Eight modules. Forty drills.</h1>
        <p class="muted" style="margin-top:6px">Work in order if you are new. Each module ends with a scored test; the drills run in parallel, five a week.</p>
      </div>
      <div class="spacer"></div>
      ${['admin', 'owner', 'coordinator'].includes(state.user?.role) ? `<a class="btn btn-dark" href="/admin?tab=curriculum" data-nav>${icon('settings')} Manage course</a>` : ''}
      <span class="chip chip-plain">${progress.lessonsDone}/${progress.lessonsTotal} lessons complete</span>
    </div>
    <div class="course-list">
      ${content.modules
        .map((m) => {
          const done = m.lessons.filter((id) => completed.has(id)).length;
          const quiz = quizzes[m.quiz];
          const pct = quiz?.pct || 0;
          return `<section class="module-block" id="${m.id}">
            <header class="module-head">
              <span class="module-num">${String(m.seq).padStart(2, '0')}</span>
              <div style="min-width:0">
                <h2>${esc(m.title)}</h2>
                <div class="tagline">${esc(m.tagline || '')}</div>
              </div>
              <div class="meta">
                <span>${done}/${m.lessons.length} lessons</span>
                <span>${pct ? `quiz ${pct}%` : 'quiz not taken'}</span>
                ${pct >= 70 ? '<span class="chip chip-ok"><span class="dot"></span>passed</span>' : ''}
              </div>
            </header>
            ${m.lessons
              .map((id) => {
                const l = content.lessons[id];
                if (!l) return '';
                const isDone = completed.has(id);
                return `<a class="lesson-row" href="/lesson/${id}" data-nav>
                  <span class="tick ${isDone ? 'done' : ''}">${isDone ? icon('check') : ''}</span>
                  <span><span class="lname">${esc(l.title)}</span><span class="ltopics">${esc((l.sheetTopics || []).slice(0, 3).join(' · '))}</span></span>
                  <span class="lmin">${l.minutes} min</span>
                  <span class="small dim nowrap">${esc(l.kind || 'Lesson')}</span>
                  <span class="chev">${icon('chevronRight')}</span>
                </a>`;
              })
              .join('')}
            <a class="lesson-row quiz-row" href="/quiz/${m.quiz}" data-nav>
              <span class="tick ${pct >= 70 ? 'done' : ''}">${pct >= 70 ? icon('check') : ''}</span>
              <span><span class="lname">Module test — ${esc(m.title)}</span><span class="ltopics">${content.quizzes[m.quiz]?.count || 10} questions · ${quiz?.tries || 0} attempt${quiz?.tries === 1 ? '' : 's'} used · best ${pct ? `${pct}%` : '—'}</span></span>
              <span class="lmin">${content.quizzes[m.quiz]?.minutes || 12} min</span>
              <span class="small dim nowrap">Pass ${content.quizzes[m.quiz]?.passPct || 70}%</span>
              <span class="chev">${icon('chevronRight')}</span>
            </a>
          </section>`;
        })
        .join('')}
    </div>`,
    mount: () => {
      if (location.hash) {
        const el = document.getElementById(location.hash.slice(1));
        if (el) el.scrollIntoView({ block: 'start' });
      }
    },
  };
}

/* ---------------------------------------------------------------- lesson */
function videoId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

export function lesson({ id }) {
  const { content, progress } = state;
  const l = content.lessons[id];
  if (!l) return { crumb: [{ label: 'Lesson' }], html: '<div class="page"><div class="empty"><b>Lesson not found.</b></div></div>' };

  const module = content.modules.find((m) => m.id === l.moduleId);
  const completed = new Set(progress.completedLessons || []);
  const isDone = completed.has(id);
  const allIds = content.modules.flatMap((m) => m.lessons);
  const idx = allIds.indexOf(id);
  const nextId = allIds[idx + 1];
  const next = content.lessons[nextId];
  const vid = videoId(l.video?.url);
  const start = l.video?.start || 0;

  const sections = (l.sections || []).map((s, i) => ({ ...s, sid: `s${i + 1}` }));

  return {
    crumb: [{ label: 'Course', href: '/course' }, { label: `Module ${module?.seq}`, href: `/course#${module?.id}` }, { label: l.title }],
    html: `<div class="lesson-grid">
      <article>
        <header class="lesson-head">
          <div class="lesson-meta">
            <span class="chip chip-accent">${esc(module?.title || '')}</span>
            <span>Lesson ${module?.lessons.indexOf(id) + 1} of ${module?.lessons.length}</span>
            <span class="sep"></span><span>${l.minutes} min</span>
            <span class="sep"></span><span>${esc(l.level || 'Core')}</span>
            ${l.review?.status === 'verified' ? `<span class="sep"></span><span class="chip chip-ok" title="${esc(l.review.reviewer ? `Verified by ${l.review.reviewer}` : 'Content verified')}"><span class="dot"></span>Content verified</span>` : ''}
            ${l.custom ? `<span class="sep"></span><span class="chip chip-plain">Coordinator topic</span>` : ''}
          </div>
          <h1 style="margin-top:12px">${esc(l.title)}</h1>
          ${l.subtitle ? `<p class="muted measure" style="margin-top:8px;font-size:15px">${esc(l.subtitle)}</p>` : ''}
        </header>

        ${l.ticket ? `<div class="work-order">
          <header>${icon('flag')} <b>Work order</b> <span style="margin-left:auto">${esc(l.ticket.from || 'Service desk')}</span></header>
          <div class="wo-body">
            <div class="wo-sub">${esc(l.ticket.subject || '')}</div>
            <div class="wo-text">${esc(l.ticket.body || '')}</div>
            ${l.ticket.impact ? `<div class="wo-impact">${icon('alert')} ${esc(l.ticket.impact)}</div>` : ''}
          </div>
        </div>` : ''}

        <div class="prose">
          ${sections.map((s) => `<h2 id="${s.sid}">${esc(s.h)}</h2>${md(s.body)}`).join('')}
        </div>

        ${l.diagram ? `<figure class="plate" style="margin-top:34px">
          <div class="plate-top">
            <span class="leds"><i class="on"></i><i></i><i></i></span>
            <span>${esc(l.diagram.title || 'Diagram')}</span>
            <span class="spacer"></span>
            <span>${esc(l.diagram.type)}</span>
          </div>
          <div class="plate-canvas">${renderDiagram(l.diagram)}</div>
          ${l.diagram.caption ? `<figcaption class="plate-cap">${esc(l.diagram.caption)}</figcaption>` : ''}
        </figure>` : ''}

        ${l.video && vid ? `<div class="video-block">
          <div class="video-frame">
            <button class="video-facade" data-video="${vid}" data-start="${start}" aria-label="Play video: ${esc(l.video.title)}">
              <span class="video-fallback" hidden><b>${esc(l.video.title)}</b><span>${esc(l.video.channel || '')} · ${esc(l.video.length || '')}</span></span>
              <img src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" alt="" loading="lazy" onerror="this.style.display='none';var f=this.parentElement.querySelector('.video-fallback');if(f)f.hidden=false" />
              <span class="play">${icon('play')}</span>
            </button>
          </div>
          <div class="video-note">${icon('play')}<span><b>${esc(l.video.title)}</b> · ${esc(l.video.channel || '')}${l.video.why ? `<br>${esc(l.video.why)}` : ''} <span class="dim">Loaded from YouTube only when you press play.</span></span></div>
        </div>` : ''}

        ${(l.commands || []).length ? `<h2 style="font-size:18px;margin:34px 0 10px">Commands you will type</h2>
          <table class="cmd-table"><thead><tr><th>Command</th><th>What it tells you</th></tr></thead><tbody>
          ${l.commands.map((c) => `<tr><td>${esc(c.cmd)}</td><td>${esc(c.what)}</td></tr>`).join('')}
          </tbody></table>` : ''}

        ${(l.pitfalls || []).length ? `<div class="pitfalls">
          <h3>Where people get this wrong</h3>
          <ul>${l.pitfalls.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
        </div>` : ''}

        ${(l.takeaways || []).length ? `<div class="takeaways">
          <h3>Take these three things</h3>
          <ol>${l.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
        </div>` : ''}

        ${l.drill ? `<div class="drill-block">
          <header>${icon('target')}<h3>Do it now — ${esc(l.drill.minutes || 8)} minutes</h3></header>
          <div class="drill-body">
            <p style="font-size:14px">${esc(l.drill.prompt)}</p>
            <ul class="drill-checklist">${(l.drill.checklist || []).map((c) => `<li>${icon('check')}<span>${esc(c)}</span></li>`).join('')}</ul>
          </div>
        </div>` : ''}

        <div class="lesson-complete">
          <div>
            <div style="font-size:14px;font-weight:560">${isDone ? 'Marked complete' : 'Finished this lesson?'}</div>
            <div class="small dim">Reading it is not the same as being able to do it. The daily drill is where it sticks.</div>
          </div>
          <span class="spacer"></span>
          <button class="btn ${isDone ? 'btn-ghost' : 'btn-primary'}" id="complete" ${isDone ? 'disabled' : ''}>${isDone ? `${icon('check')} Complete` : 'Mark complete'}</button>
          ${next ? `<a class="btn btn-dark" href="/lesson/${next.id}" data-nav>Next ${icon('arrowRight')}</a>` : `<a class="btn btn-dark" href="/quiz/${module?.quiz}" data-nav>Module test ${icon('arrowRight')}</a>`}
        </div>
      </article>

      <aside class="rail-right">
        <div class="card card-pad facts">
          <div><span>Module</span><b>${esc(module?.title || '')}</b></div>
          <div><span>Lesson</span><b>${module?.lessons.indexOf(id) + 1} / ${module?.lessons.length}</b></div>
          <div><span>Reading</span><b>${l.minutes} min</b></div>
          <div><span>Sheet rows</span><b>${esc((l.sheetTopics || []).length)}</b></div>
          ${l.video ? `<div><span>Video</span><b>${l.video.length || '—'}</b></div>` : ''}
        </div>
        ${sections.length ? `<nav class="toc" aria-label="On this page">
          <h4>On this page</h4>
          ${sections.map((s) => `<a href="#${s.sid}" data-toc="${s.sid}">${esc(s.h)}</a>`).join('')}
        </nav>` : ''}
        <div class="card card-pad" style="font-size:12.5px">
          <div style="display:flex;align-items:center;gap:8px;font-weight:560;margin-bottom:4px">${icon('clipboard', 'small')} Topics covered</div>
          <p class="dim" style="line-height:1.6">${esc((l.sheetTopics || []).join(' · '))}</p>
        </div>
      </aside>
    </div>`,
    mount: (root) => {
      const btn = root.querySelector('#complete');
      if (btn && !btn.disabled) {
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Saving…';
          try {
            await api(`/api/lesson/${id}/complete`, { method: 'POST' });
            await refreshMe();
            btn.innerHTML = `${icon('check')} Complete`;
            btn.className = 'btn btn-ghost';
            const tick = root.querySelector('.fact-done');
            if (tick) tick.textContent = 'done';
            const event = new CustomEvent('app:toast', { detail: { message: 'Lesson marked complete' } });
            window.dispatchEvent(event);
          } catch (err) {
            btn.disabled = false;
            btn.textContent = 'Mark complete';
            window.dispatchEvent(new CustomEvent('app:toast', { detail: { message: err.message, tone: 'bad' } }));
          }
        });
      }

      const facade = root.querySelector('[data-video]');
      if (facade) {
        facade.addEventListener('click', () => {
          const frame = facade.parentElement;
          const vidId = facade.dataset.video;
          const startSec = Number(facade.dataset.start || 0);
          frame.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${vidId}?start=${startSec}&autoplay=1&rel=0&modestbranding=1" title="${esc(l.video.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        });
      }

      const tocLinks = [...root.querySelectorAll('[data-toc]')];
      if (tocLinks.length && 'IntersectionObserver' in window) {
        const obs = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                tocLinks.forEach((a) => a.classList.toggle('active', a.dataset.toc === entry.target.id));
              }
            });
          },
          { rootMargin: '-20% 0px -70% 0px' }
        );
        sections.forEach((s) => {
          const el = document.getElementById(s.sid);
          if (el) obs.observe(el);
        });
      }
    },
  };
}

/* ---------------------------------------------------------------- quiz */
export function quiz({ id }) {
  const { content } = state;
  const meta = content.quizzes[id];
  if (!meta) return { crumb: [{ label: 'Test' }], html: '<div class="page"><div class="empty"><b>Test not found.</b></div></div>' };

  return {
    crumb: [{ label: 'Course', href: '/course' }, { label: meta.title }],
    html: `<div class="quiz-shell" id="quiz">
      <div class="skeleton" style="height:150px"></div>
    </div>`,
    mount: async (root) => {
      const host = root.querySelector('#quiz');
      try {
        const data = await api(`/api/quiz/${id}`);
        host.innerHTML = quizIntro(data);
        wireQuiz(host, data);
      } catch (err) {
        host.innerHTML = `<div class="empty"><b>Could not load the test.</b><p class="muted">${esc(err.message)}</p></div>`;
      }
    },
  };
}

function quizIntro(data) {
  const remaining = Math.max(0, data.attemptsAllowed - data.attemptsUsed);
  return `<div class="page-head" style="margin-bottom:18px">
      <div>
        <p class="tiny dim" style="letter-spacing:.08em;text-transform:uppercase">Module test</p>
        <h1 style="font-size:28px;margin:6px 0 6px">${esc(data.title)}</h1>
        <p class="muted">${data.questions.length} questions · pass ${data.passPct}% · ${data.attemptsAllowed} attempts, best score counts.</p>
      </div>
    </div>
    <div class="card card-pad">
      <div class="metric-row" style="border-top:0;margin-bottom:18px">
        <div class="metric" style="border-left:0"><b>${data.best || 0}%</b><span>best so far</span></div>
        <div class="metric"><b>${remaining}</b><span>attempts left</span></div>
      </div>
      ${remaining === 0 && data.best < data.passPct
        ? `<p class="form-error">You have used every attempt and have not passed. Your admin or mentor can reset the module.</p>`
        : `<h2 style="font-size:15px;margin-bottom:8px">Before you start</h2>
      <ul class="check-list" style="margin-bottom:18px">
        <li><span class="box">${icon('clock')}</span><span>About 12 minutes. No timer is enforced, but this is a closed-book check of what you can recall.</span></li>
        <li><span class="box">${icon('target')}</span><span>One answer per question. You will see the explanation after submitting.</span></li>
        <li><span class="box">${icon('award')}</span><span>A pass marks the module ready; your best score feeds the leaderboard.</span></li>
      </ul>
      <button class="btn btn-primary btn-lg" id="begin">Begin test ${icon('arrowRight')}</button>`}
    </div>`;
}

function wireQuiz(host, data) {
  const begin = host.querySelector('#begin');
  if (!begin) return;
  begin.addEventListener('click', () => {
    host.innerHTML = `<div class="page-head" style="margin-bottom:14px">
      <div><p class="tiny dim" style="letter-spacing:.08em;text-transform:uppercase">${esc(data.title)}</p>
      <h1 style="font-size:24px;margin-top:4px">Answer all ${data.questions.length} questions</h1></div>
    </div>
    <form id="quiz-form">
      ${data.questions
        .map(
          (q, i) => `<div class="quiz-q">
          <div class="q-num">Question ${String(i + 1).padStart(2, '0')}</div>
          <div class="q-text" id="qq-${q.id}">${esc(q.q)}</div>
          <div class="opts" role="radiogroup" aria-labelledby="qq-${q.id}">
            ${q.options
              .map(
                (o, oi) => `<label class="opt"><input type="radio" name="${esc(q.id)}" value="${oi}" /><span class="k">${'ABCD'[oi]}</span><span>${esc(o)}</span></label>`
              )
              .join('')}
          </div>
        </div>`
        )
        .join('')}
      <div class="form-error" id="qerr" hidden></div>
      <button class="btn btn-primary btn-lg" type="submit">Submit answers</button>
    </form>`;

    const form = host.querySelector('#quiz-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = host.querySelector('#qerr');
      err.hidden = true;
      const answers = {};
      for (const q of data.questions) {
        const picked = form.querySelector(`input[name="${q.id}"]:checked`);
        if (!picked) {
          err.textContent = 'Every question needs an answer before submitting.';
          err.hidden = false;
          document.getElementById(`qq-${q.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        answers[q.id] = Number(picked.value);
      }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      btn.textContent = 'Scoring…';
      try {
        const result = await api(`/api/quiz/${data.id}/submit`, { method: 'POST', body: { answers } });
        await refreshMe();
        host.innerHTML = quizResult(data, result);
        host.querySelector('[data-retry]')?.addEventListener('click', () => {
          window.dispatchEvent(new PopStateEvent('popstate'));
        });
        host.querySelector('[data-next]')?.addEventListener('click', () => {});
      } catch (error) {
        err.textContent = error.message;
        err.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Submit answers';
      }
    });
  });
}

function quizResult(data, result) {
  const byId = new Map(result.detail.map((d) => [d.id, d]));
  return `<div class="result-banner ${result.passed ? 'pass' : 'fail'}">
      <div class="score">${result.pct}%</div>
      <div>
        <div style="font-weight:600;font-size:15px">${result.passed ? 'Passed' : 'Not yet'} — ${result.score} of ${result.total}</div>
        <div class="small muted">Attempt ${result.attemptNo} · ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} left · pass mark ${data.passPct}%</div>
      </div>
      <span style="flex:1"></span>
      ${result.attemptsLeft > 0 && !result.passed ? '<button class="btn btn-ghost" data-retry>Try again</button>' : ''}
      <a class="btn btn-dark" href="/course" data-nav>Course</a>
    </div>
    <div class="card card-pad">
      <h2 style="font-size:15px;margin-bottom:6px">What you got wrong, and why</h2>
      ${data.questions
        .map((q, i) => {
          const d = byId.get(q.id);
          if (!d) return '';
          return `<div class="review-item">
            <div class="rq">${i + 1}. ${esc(q.q)}</div>
            <div class="ra" style="color:${d.ok ? 'var(--ok)' : 'var(--bad)'}">${icon(d.ok ? 'check' : 'x')}
              <span>${d.ok ? 'Correct' : `You chose “${esc(q.options[d.picked] ?? '—')}”`} — answer: <b>${esc(q.options[d.answer])}</b></span>
            </div>
            ${d.explain ? `<div class="explain">${esc(d.explain)}</div>` : ''}
          </div>`;
        })
        .join('')}
    </div>`;
}
