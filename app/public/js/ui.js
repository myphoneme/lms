/* Small helpers shared by every view. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function attr(value) {
  return esc(value).replace(/`/g, '&#96;');
}

/* ---------------- minimal markdown (headings, lists, tables, code) --------------- */
function inline(text) {
  return text
    .replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a class="link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function md(source) {
  if (!source) return '';
  let text = esc(String(source)).replace(/\r\n/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const out = [];
  for (let block of blocks) {
    block = block.trim();
    if (!block) continue;

    const fence = block.match(/^```([a-z0-9+#-]*)\n([\s\S]*?)\n?```$/i);
    if (fence) {
      out.push(`<pre><code class="lang-${attr(fence[1] || 'text')}">${fence[2]}</code></pre>`);
      continue;
    }
    if (/^(\*\s*){3,}$/.test(block) || block === '---') { out.push('<hr class="rule">'); continue; }

    const heading = block.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^>\s/.test(block)) {
      const body = block.split('\n').map((l) => l.replace(/^>\s?/, '')).join('\n');
      out.push(`<blockquote>${inline(body)}</blockquote>`);
      continue;
    }

    if (/^\|.*\|$/m.test(block) && block.split('\n').length >= 2 && /^\|[\s:|-]+\|$/.test(block.split('\n')[1].trim())) {
      const rows = block.split('\n').filter((l) => l.trim().startsWith('|'));
      const cells = rows.map((r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
      const head = cells[0];
      const body = cells.slice(2);
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`
      );
      continue;
    }

    const ol = block.match(/^\d+\.\s/);
    if (ol || /^[-*]\s/.test(block)) {
      const items = block.split('\n').filter((l) => /^\s*(?:[-*]|\d+\.)\s/.test(l));
      const tag = ol ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((l) => `<li>${inline(l.replace(/^\s*(?:[-*]|\d+\.)\s+/, ''))}</li>`).join('')}</${tag}>`);
      continue;
    }

    out.push(`<p>${inline(block).replace(/\n/g, '<br>')}</p>`);
  }
  return out.join('\n');
}

/* ---------------- formatting ---------------- */
export const fmtPct = (n) => `${Math.round(Number(n) || 0)}%`;
export const fmtDay = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
export const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
};
export const initials = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

/* ---------------- icons (authored, one stroke weight) ---------------- */
const PATHS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  book: '<path d="M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M17 7h2a1 1 0 0 1 1 1v12h-5"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 21l-3 .5L9 12.5a4 4 0 0 0-5-5L8 4z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3"/><path d="M12 13v4M9 21h6M10 21v-4h4v4"/>',
  folder: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  shield: '<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  network: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2h12v2"/>',
  key: '<circle cx="8" cy="8" r="4"/><path d="m11 11 9 9M17 17l2-2M14 14l2-2"/>',
  alert: '<path d="M12 4 3 20h18z"/><path d="M12 10v4M12 17h.01"/>',
  check: '<path d="m5 12 5 5L20 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.4-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z"/>',
  print: '<path d="M6 9V4h12v5"/><rect x="4" y="9" width="16" height="8" rx="1"/><path d="M8 17h8v4H8z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  download: '<path d="M12 4v10M8 11l4 4 4-4"/><path d="M4 19h16"/>',
  logout: '<path d="M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  external: '<path d="M14 4h6v6"/><path d="m20 4-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  activity: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1"/><rect x="3" y="13" width="18" height="7" rx="1"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 9.5a4.5 4.5 0 0 1 .5 8.5z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M17.5 20a6.5 6.5 0 0 0-2-4.6"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="1"/><path d="M9 4V3h6v1"/><path d="M9 10h6M9 14h6M9 18h3"/>',
  award: '<circle cx="12" cy="9" r="5"/><path d="m8.5 13-1.5 8 5-3 5 3-1.5-8"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.7"/><path d="M20 4v7h-7"/>',
  save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="1"/><path d="M15 5H5v10"/>',
  flag: '<path d="M5 21V4h9l1 2h5v10h-6l-1-2H5"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  bolt: '<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>',
  route: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.5 6H14a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h6.5"/>',
};

export function icon(name, cls = '') {
  const body = PATHS[name] || PATHS.home;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/* ---------------- brand glyph (three rack units) ---------------- */
export function brandGlyph() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:18px;height:18px"><rect x="3" y="4" width="18" height="6" rx="1.2"/><rect x="3" y="14" width="18" height="6" rx="1.2"/><path d="M7 7h.01M7 17h.01M11 7h5M11 17h5"/></svg>`;
}

/* ---------------- toast + copy ---------------- */
let toastTimer = null;
export function toast(message, tone = 'ok') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.style.borderLeft = '0';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { el.hidden = true; }, 200);
  }, 2600);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Could not copy — select it manually', 'bad');
  }
}

/* ---------------- status chip ---------------- */
export function statusChip(status, score) {
  if (status === 'graded') {
    const tone = score >= 70 ? 'ok' : 'warn';
    return `<span class="chip chip-${tone}"><span class="dot"></span>${score}/100</span>`;
  }
  if (status === 'submitted') return '<span class="chip chip-plain"><span class="dot"></span>In review</span>';
  return '<span class="chip"><span class="dot"></span>Not started</span>';
}

/* ---------------- progress bar ---------------- */
export function bar(pct, tone) {
  const cls = tone || (pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low');
  return `<div class="bar" role="meter" aria-valuenow="${Math.round(pct)}" aria-valuemin="0" aria-valuemax="100"><i class="${cls}" style="width:${Math.max(0, Math.min(100, pct))}%"></i></div>`;
}

/* ---------------- dialog ---------------- */
export function openModal(html, { onMount } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal';
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  if (onMount) onMount(dlg);
  return dlg;
}
