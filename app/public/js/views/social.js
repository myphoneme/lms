/* Leaderboard and the certificate. */
import { api, state } from '../api.js';
import { icon, esc, fmtDate, bar, initials } from '../ui.js';

export async function leaderboard() {
  const data = await api('/api/leaderboard');
  const rows = data.leaderboard;
  const me = data.me;
  const cohorts = [...new Set(rows.map((r) => r.cohort).filter(Boolean))];
  const top = rows.slice(0, 3);

  return {
    crumb: [{ label: 'Leaderboard' }],
    html: `<div class="page-head">
      <div>
        <h1>Where the cohort stands.</h1>
        <p class="muted" style="margin-top:6px">Points combine quiz scores (50%), graded drills (50%) and lesson completion. Your company only — never other tenants.</p>
      </div>
      <div class="spacer"></div>
      ${me ? `<span class="pill">${icon('trophy')}Your rank <b>#${me.rank}</b></span>` : ''}
    </div>

    ${top.length ? `<div class="module-block" style="margin-bottom:22px">
      <div style="display:grid;grid-template-columns:repeat(${Math.min(3, top.length)},minmax(0,1fr))">
        ${top
          .map(
            (r, i) => `<div style="padding:18px 20px;${i ? 'border-left:1px solid var(--line)' : ''}">
            <div style="display:flex;align-items:center;gap:11px">
              <span class="avatar" style="background:${i === 0 ? 'var(--accent)' : '#243034'};color:#fff">${esc(initials(r.name))}</span>
              <div style="min-width:0">
                <div style="font-weight:600;font-size:14px">${esc(r.name)}</div>
                <div class="tiny dim">Rank ${r.rank} · ${esc(r.cohort || '')}</div>
              </div>
              <span style="margin-left:auto;font-variant-numeric:tabular-nums;font-weight:650;font-size:17px">${r.points}</span>
            </div>
            <div style="margin-top:12px">${bar(r.overall)}</div>
            <div class="tiny dim" style="margin-top:6px">${r.overall}% ready · ${r.quizzesPassed}/8 modules · ${r.assignmentsGraded} drills</div>
          </div>`
          )
          .join('')}
      </div>
    </div>` : ''}

    ${cohorts.length > 1 ? `<div class="filters" id="cohort-filter">
      <button class="filter-btn" data-cohort="all" aria-pressed="true">All cohorts</button>
      ${cohorts.map((c) => `<button class="filter-btn" data-cohort="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}
    </div>` : ''}

    <div class="panel">
      <div class="table-wrap">
        <table class="lb-table">
          <thead><tr><th>#</th><th>Learner</th><th>Modules</th><th>Drills</th><th>Readiness</th><th style="text-align:right">Points</th><th>Certificate</th></tr></thead>
          <tbody>
            ${rows
              .map(
                (r) => `<tr class="${r.isMe ? 'me' : ''}" data-cohort="${esc(r.cohort || '')}">
                <td class="rank ${r.rank <= 3 ? 'top' : ''}">${String(r.rank).padStart(2, '0')}</td>
                <td><div class="lb-name">${esc(r.name)}${r.isMe ? ' <span class="chip chip-accent" style="margin-left:6px">you</span>' : ''}</div><div class="lb-sub">${esc(r.cohort || '')}</div></td>
                <td class="num">${r.quizzesPassed}/8</td>
                <td class="num">${r.assignmentsGraded}/40</td>
                <td style="min-width:130px">${bar(r.overall)}<div class="tiny dim" style="margin-top:4px">${r.overall}%</div></td>
                <td class="lb-points" style="text-align:right">${r.points}</td>
                <td>${r.certCode ? `<span class="chip chip-ok"><span class="dot"></span>issued</span>` : r.eligible ? '<span class="chip chip-accent">ready</span>' : '<span class="chip chip-plain">—</span>'}</td>
              </tr>`
              )
              .join('') || '<tr><td colspan="7"><div class="empty"><b>No learners yet.</b>Import a roster from the control room.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <p class="small dim" style="margin-top:14px">Ties break on readiness, then name. Quiz attempts are capped; the best score is what counts.</p>`,
    mount: (root) => {
      root.querySelectorAll('[data-cohort]').forEach((btn) => {
        btn.addEventListener('click', () => {
          root.querySelectorAll('[data-cohort]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
          const c = btn.dataset.cohort;
          root.querySelectorAll('tr[data-cohort]').forEach((tr) => {
            tr.style.display = c === 'all' || tr.dataset.cohort === c ? '' : 'none';
          });
        });
      });
    },
  };
}

function sealSvg() {
  return `<svg viewBox="0 0 100 100" width="92" height="92" aria-hidden="true" fill="none" stroke="currentColor">
    <circle cx="50" cy="50" r="46" stroke-width="1"/>
    <circle cx="50" cy="50" r="40" stroke-width="0.6" stroke-dasharray="2 3"/>
    <path d="M50 20 58 40 79 41 62 54 68 75 50 62 32 75 38 54 21 41 42 40Z" stroke-width="1.1"/>
    <text x="50" y="88" text-anchor="middle" font-size="6" letter-spacing="1.6" stroke="none" fill="currentColor">VERIFIED</text>
  </svg>`;
}

export async function certificate() {
  const data = await api('/api/certificate');
  const t = data.tenant;
  const modulesPassed = data.quizzesPassed;
  const strong = data.strongAssignments;
  const needs = Math.max(0, Math.round((t.certPct - data.overall) * 10) / 10);

  const checks = [
    {
      ok: data.overall >= t.certPct,
      label: `Readiness at ${t.certPct}% or above`,
      why: `You are at ${data.overall}%${needs ? ` — ${needs} points to go` : ''}. Half quiz average, half graded drills.`,
    },
    {
      ok: modulesPassed === 8,
      label: 'All eight module tests passed',
      why: `${modulesPassed} of 8 passed at ${t.passPct}% or better.`,
    },
    {
      ok: strong >= 32,
      label: 'At least 32 drills graded 70+',
      why: `${strong} of 40 drills at 70 or above.`,
    },
  ];

  if (!data.eligible) {
    return {
      crumb: [{ label: 'Certificate' }],
      html: `<div class="page-head">
        <div>
          <h1>Not certifiable yet.</h1>
          <p class="muted" style="margin-top:6px">${t.certTitle} is issued automatically the moment all three conditions are true. No request needed.</p>
        </div>
      </div>
      <div class="cert-state">
        <section class="panel">
          <div class="panel-head"><h2>What is left</h2><span class="spacer"></span><span class="chip chip-plain">${data.overall}% now</span></div>
          <div class="panel-body">
            <ul class="check-list">
              ${checks
                .map(
                  (c) => `<li>
                <span class="box ${c.ok ? 'done' : ''}">${c.ok ? icon('check') : ''}</span>
                <span><span style="font-weight:560">${esc(c.label)}</span><span class="why">${esc(c.why)}</span></span>
              </li>`
                )
                .join('')}
            </ul>
            <div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">
              <a class="btn btn-primary" href="/practice" data-nav>${icon('wrench')} Submit a drill</a>
              <a class="btn btn-ghost" href="/course" data-nav>${icon('book')} Take a module test</a>
            </div>
          </div>
        </section>
        <aside class="panel" style="padding:18px 20px">
          <h3 style="font-size:13px;margin-bottom:8px">Module scores</h3>
          ${data.modules
            .map(
              (m) => `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--line);font-size:12.5px">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.title)}</span>
              <span class="mono ${m.pct >= t.passPct ? '' : 'dim'}">${m.pct ? `${m.pct}%` : '—'}</span>
            </div>`
            )
            .join('')}
        </aside>
      </div>`,
      mount: () => {},
    };
  }

  return {
    crumb: [{ label: 'Certificate' }],
    html: `<div class="page-head no-print">
      <div>
        <h1>Your certificate is issued.</h1>
        <p class="muted" style="margin-top:6px">Score ${data.overall}% · code <span class="mono">${esc(data.certificate.code)}</span>. Anyone can verify it at <span class="mono">/verify/${esc(data.certificate.code)}</span>.</p>
      </div>
      <div class="spacer"></div>
      <button class="btn btn-dark" id="print">${icon('print')} Print / save PDF</button>
    </div>
    <div class="cert-doc" style="max-width:960px">
      <div class="cert-top">
        <div>
          <div class="cert-brand">${esc(t.name)}</div>
          <div class="cert-title" style="margin-top:4px">${esc(t.certTitle)}</div>
        </div>
        <div class="cert-mark">${icon('shield')}</div>
      </div>
      <div class="cert-seal"><span class="inner">L1<br>ready<br>${new Date(data.certificate.issuedAt).getFullYear()}</span></div>
      <p class="cert-eyebrow">This certifies that</p>
      <h2 class="cert-name">${esc(data.learner.name)}</h2>
      <p class="cert-line">completed the ${esc(t.name)} L1 readiness programme: eight modules of networking, Linux, Windows, security, offensive testing, SOC detection, incident response and automation, with forty graded practical drills.</p>
      <p class="cert-line" style="margin-top:10px;font-size:12.5px">Final readiness <b>${data.overall}%</b> · ${modulesPassed} of 8 module tests passed · ${strong} of 40 drills graded 70 or above</p>
      <div class="cert-subjects">
        ${data.modules.map((m) => `<span><i>${icon('check')}</i>${esc(m.title)}<em>${m.pct}%</em></span>`).join('')}
      </div>
      <div class="cert-meta" style="border-top:1px solid #d8d1be;padding-top:14px">
        <div class="cert-sign">${esc(t.signatory || 'Training Lead')}<small>${esc(t.signatoryTitle || 'Authorised signatory')}</small></div>
        <div class="cert-code">
          ${esc(data.certificate.code)}<br>
          ${fmtDate(data.certificate.issuedAt)}<br>
          verify: /verify/${esc(data.certificate.code)}
        </div>
      </div>
    </div>
    <p class="small dim no-print" style="margin-top:16px">Printing to PDF gives an A4 landscape certificate. The seal and code are part of the record, not decoration.</p>`,
    mount: (root) => {
      root.querySelector('#print')?.addEventListener('click', () => window.print());
    },
  };
}
