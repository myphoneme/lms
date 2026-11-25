/* Library: the researched source list and the printable reference cards. */
import { state } from '../api.js';
import { icon, esc, md } from '../ui.js';

let tab = 'sources';
let moduleFilter = 'all';
let formatFilter = 'all';

export function library() {
  const resources = state.content?.resources || { items: [], note: '' };
  const refs = state.content?.references || {};
  const modules = state.content?.modules || [];

  const formats = [...new Set(resources.items.map((r) => r.format))];
  const shown = resources.items.filter(
    (r) => (moduleFilter === 'all' || r.moduleId === moduleFilter) && (formatFilter === 'all' || r.format === formatFilter)
  );

  return {
    crumb: [{ label: 'Library' }],
    html: `<div class="page-head">
      <div>
        <h1>Library</h1>
        <p class="muted" style="margin-top:6px">Sources chosen for the confusions people actually post about, plus the reference cards you will use at the desk.</p>
      </div>
      <div class="spacer"></div>
      <a class="btn btn-ghost" href="/downloads/resource-library.xlsx" download>${icon('download')} Download spreadsheet</a>
    </div>

    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-ltab="sources" aria-selected="${tab === 'sources'}">Curated sources (${resources.items.length})</button>
      <button class="tab" role="tab" data-ltab="reference" aria-selected="${tab === 'reference'}">Reference cards</button>
    </div>

    <div id="lib-body">
      ${tab === 'sources' ? sourcesView(resources, modules, formats, shown) : referenceView(refs)}
    </div>`,
    mount: (root) => {
      root.querySelectorAll('[data-ltab]').forEach((btn) => {
        btn.addEventListener('click', () => { tab = btn.dataset.ltab; window.dispatchEvent(new PopStateEvent('popstate')); });
      });
      root.querySelectorAll('[data-mod]').forEach((btn) => {
        btn.addEventListener('click', () => { moduleFilter = btn.dataset.mod; window.dispatchEvent(new PopStateEvent('popstate')); });
      });
      root.querySelectorAll('[data-fmt]').forEach((btn) => {
        btn.addEventListener('click', () => { formatFilter = btn.dataset.fmt; window.dispatchEvent(new PopStateEvent('popstate')); });
      });
    },
  };
}

function sourcesView(resources, modules, formats, shown) {
  return `<div class="filters">
      <button class="filter-btn" data-mod="all" aria-pressed="${moduleFilter === 'all'}">All modules</button>
      ${modules.map((m) => `<button class="filter-btn" data-mod="${m.id}" aria-pressed="${moduleFilter === m.id}">${String(m.seq).padStart(2, '0')} · ${esc(m.title)}</button>`).join('')}
    </div>
    <div class="filters">
      <button class="filter-btn" data-fmt="all" aria-pressed="${formatFilter === 'all'}">Every format</button>
      ${formats.map((f) => `<button class="filter-btn" data-fmt="${esc(f)}" aria-pressed="${formatFilter === f}">${esc(f)}</button>`).join('')}
    </div>

    <div class="panel">
      <div class="table-wrap">
        <table class="res-table">
          <thead><tr><th style="width:38%">Resource</th><th>Format</th><th style="width:38%">Why this one</th><th>Link</th></tr></thead>
          <tbody>
            ${shown
              .map(
                (r) => `<tr>
                <td><div class="res-title">${esc(r.title)}</div><div class="tiny dim">${esc(r.creator || '')}${r.level ? ` · ${esc(r.level)}` : ''}</div></td>
                <td><span class="fmt">${esc(r.format)}</span></td>
                <td class="res-why">${esc(r.why)}</td>
                <td><a class="link small" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Open ${icon('external')}</a></td>
              </tr>`
              )
              .join('') || '<tr><td colspan="4"><div class="empty"><b>No match.</b>Clear a filter.</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <p class="small dim" style="margin-top:12px">${esc(resources.note || 'Links verified at build time. Prefer the free source; a paid one is marked where the free material is not enough.')}</p>`;
}

function referenceView(refs) {
  const ports = refs.ports || [];
  const linux = refs.linux || [];
  const windows = refs.windows || [];
  const filters = refs.filters || [];
  const events = refs.eventIds || [];
  const vulns = refs.vulnerabilities || [];
  return `<div class="ref-grid">
    <section class="panel">
      <div class="panel-head"><h2>Ports on the L1 queue</h2></div>
      <div class="table-wrap"><table class="cmd-table" style="margin:0">
        <thead><tr><th>Port</th><th>Service</th><th>What you check</th></tr></thead>
        <tbody>${ports.map((p) => `<tr><td>${esc(p.port)}</td><td>${esc(p.service)}</td><td class="small">${esc(p.use)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Linux: the fifteen you will type</h2></div>
      <div class="table-wrap"><table class="cmd-table" style="margin:0">
        <thead><tr><th>Command</th><th>Purpose</th></tr></thead>
        <tbody>${linux.map((c) => `<tr><td>${esc(c.cmd)}</td><td class="small">${esc(c.what)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Windows & PowerShell</h2></div>
      <div class="table-wrap"><table class="cmd-table" style="margin:0">
        <thead><tr><th>Command</th><th>Purpose</th></tr></thead>
        <tbody>${windows.map((c) => `<tr><td>${esc(c.cmd)}</td><td class="small">${esc(c.what)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Wireshark display filters</h2></div>
      <div class="table-wrap"><table class="cmd-table" style="margin:0">
        <thead><tr><th>Filter</th><th>Use</th></tr></thead>
        <tbody>${filters.map((f) => `<tr><td>${esc(f.filter)}</td><td class="small">${esc(f.use)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Windows event IDs that matter</h2></div>
      <div class="table-wrap"><table class="cmd-table" style="margin:0">
        <thead><tr><th>ID</th><th>Meaning</th><th>Why L1 cares</th></tr></thead>
        <tbody>${events.map((e) => `<tr><td>${esc(e.id)}</td><td class="small">${esc(e.meaning)}</td><td class="small">${esc(e.why || '')}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>

    <section class="panel">
      <div class="panel-head"><h2>Vulnerability → fix</h2></div>
      <div class="table-wrap"><table class="cmd-table" style="margin:0">
        <thead><tr><th>Finding</th><th>Recommendation</th></tr></thead>
        <tbody>${vulns.map((v) => `<tr><td>${esc(v.name)}</td><td class="small">${esc(v.fix)}</td></tr>`).join('')}</tbody>
      </table></div>
    </section>
  </div>`;
}
