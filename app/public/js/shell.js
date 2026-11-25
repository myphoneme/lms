/* App frame: the instrument rail, the working top bar, and navigation. */
import { state } from './api.js';
import { icon, esc, initials, brandGlyph } from './ui.js';

export function navigate(path, { replace = false, force = false } = {}) {
  if (!force && path === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function setBrand(tenant) {
  if (!tenant) return;
  const root = document.documentElement.style;
  root.setProperty('--accent', tenant.primary || '#2f6bff');
  root.setProperty('--accent-ink', readableInk(tenant.primary || '#2f6bff'));
}

function readableInk(hex) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return '#fff';
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.62 ? '#12171a' : '#ffffff';
}

const NAV = [
  { href: '/dashboard', label: 'Today', icon: 'home' },
  { href: '/course', label: 'Course', icon: 'book' },
  { href: '/practice', label: 'Practice', icon: 'wrench' },
  { href: '/leaderboard', label: 'Leaderboard', icon: 'trophy' },
  { href: '/resources', label: 'Library', icon: 'folder' },
  { href: '/certificate', label: 'Certificate', icon: 'award' },
];

function navItem(item, current, badge) {
  const active = current === item.href || (item.href !== '/dashboard' && current.startsWith(item.href));
  return `<a class="nav-item" href="${item.href}" data-nav ${active ? 'aria-current="page"' : ''}>
    ${icon(item.icon)}<span>${item.label}</span>${badge ? `<span class="count">${badge}</span>` : ''}
  </a>`;
}

export function shell(content, { crumb = [], current = location.pathname } = {}) {
  const { user, progress, site } = state;
  const tenant = site || user?.tenant || {};
  const done = progress?.lessonsDone || 0;
  const total = progress?.lessonsTotal || 0;
  const graded = progress?.assignmentsGraded || 0;
  const drills = progress?.assignmentsTotal || 0;
  const isStaff = ['admin', 'owner', 'coordinator'].includes(user?.role);
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  const crumbHtml = crumb.length
    ? crumb.map((c, i) => {
        const extra = i < crumb.length - 2 ? ' crumb-extra' : '';
        const sep = i ? '<span class="sep">/</span>' : '';
        const body = c.href ? `<a href="${c.href}" data-nav>${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`;
        return `${sep}<span class="crumb-part${extra}">${body}</span>`;
      }).join('')
    : `<span>${esc(tenant.name || 'L1 Academy')}</span>`;

  return `
  <div class="shell">
    <div class="rail-scrim" data-scrim hidden></div>
    <aside class="rail" id="rail" aria-label="Main navigation">
      <a class="brand" href="/dashboard" data-nav>
        <span class="brand-mark">${brandGlyph()}</span>
        <span class="brand-text">
          <span class="brand-name">${esc(tenant.name || 'L1 Academy')}</span>
          <span class="brand-sub">L1 Academy</span>
        </span>
      </a>
      <nav class="nav">
        <div class="nav-label">Learn</div>
        ${NAV.map((n) => navItem(n, current, isStaff ? '' : n.href === '/course' ? `${done}/${total}` : n.href === '/practice' ? `${graded}/${drills}` : '')).join('')}
        ${isStaff ? `<div class="nav-label">Administer</div>${navItem({ href: '/admin', label: 'Control room', icon: 'settings' }, current)}` : ''}
      </nav>
      <div class="rail-foot">
        <div class="who">
          <span class="avatar">${esc(initials(user?.name))}</span>
          <span style="min-width:0">
            <span class="who-name">${esc(user?.name || 'Learner')}</span>
            <span class="who-meta">${esc(user?.cohort || 'Cohort')}</span>
          </span>
        </div>
        <div class="rail-actions">
          <button class="icon-btn" data-logout title="Sign out" aria-label="Sign out">${icon('logout')}</button>
          <a class="icon-btn" href="/resources#reference" data-nav title="Reference cards" aria-label="Reference cards">${icon('clipboard')}</a>
          <a class="icon-btn" href="/certificate" data-nav title="Certificate" aria-label="Certificate">${icon('award')}</a>
        </div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn" data-menu aria-label="Open navigation" style="margin-left:-6px" hidden>${icon('menu')}</button>
        <div class="crumb">${crumbHtml}</div>
        <div class="topbar-right">
          ${isStaff
            ? `<span class="pill">${icon('shield')}${esc(user.role === 'coordinator' ? 'Coordinator' : 'Administering')}</span>`
            : `<span class="pill">${icon('bolt')}<b>${progress?.points ?? 0}</b> pts</span>
               <span class="pill">${icon('target')}<b>${progress?.overall ?? 0}%</b> ready</span>`}
        </div>
      </header>
      <main class="page" id="main">${content}</main>
    </div>
  </div>`;
}

export function bindShell() {
  const rail = document.getElementById('rail');
  const scrim = document.querySelector('[data-scrim]');
  const menu = document.querySelector('[data-menu]');
  if (menu) {
    menu.hidden = false;
    const close = () => { rail.classList.remove('open'); scrim.hidden = true; };
    menu.addEventListener('click', () => { rail.classList.add('open'); scrim.hidden = false; });
    scrim.addEventListener('click', close);
    document.querySelectorAll('.nav-item').forEach((a) => a.addEventListener('click', close));
  }
  document.querySelectorAll('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', () => { location.href = '/auth/logout'; });
  });
}
