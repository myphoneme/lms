/* L1 Academy SPA — boot, routing, view mounting. */
import { api, state, refreshMe, tenantFromQuery } from './api.js';
import { setBrand, shell, bindShell, navigate } from './shell.js';
import { toast } from './ui.js';
import * as pub from './views/public.js';
import * as learn from './views/learn.js';
import * as practice from './views/practice.js';
import * as social from './views/social.js';
import * as admin from './views/admin.js';
import * as resources from './views/resources.js';

const ROUTES = [
  { path: '/', view: pub.landing, standalone: true },
  { path: '/login', view: pub.login, standalone: true },
  { path: '/register', view: pub.register, standalone: true },
  { path: '/setup', view: pub.setup, standalone: true },
  { path: '/verify/:code', view: pub.verify, standalone: true, public: true },
  { path: '/onboard', view: learn.onboard, auth: true },
  { path: '/dashboard', view: learn.dashboard, auth: true },
  { path: '/course', view: learn.course, auth: true },
  { path: '/lesson/:id', view: learn.lesson, auth: true, gated: true },
  { path: '/quiz/:id', view: learn.quiz, auth: true, gated: true },
  { path: '/practice', view: practice.list, auth: true, gated: true },
  { path: '/practice/:id', view: practice.detail, auth: true, gated: true },
  { path: '/leaderboard', view: social.leaderboard, auth: true },
  { path: '/certificate', view: social.certificate, auth: true },
  { path: '/resources', view: resources.library, auth: true },
  { path: '/admin', view: admin.controlRoom, auth: true, adminOnly: true },
];

function match(path) {
  for (const route of ROUTES) {
    const parts = route.path.split('/').filter(Boolean);
    const actual = path.split('/').filter(Boolean);
    if (parts.length !== actual.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < parts.length; i += 1) {
      if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(actual[i]);
      else if (parts[i] !== actual[i]) { ok = false; break; }
    }
    if (ok) return { route, params };
  }
  return null;
}

function loading() {
  return `<div class="page"><div class="skeleton" style="width:190px;height:26px;margin-bottom:18px"></div>
  <div class="skeleton" style="width:min(560px,90%);height:14px;margin-bottom:10px"></div>
  <div class="skeleton" style="width:min(420px,70%);height:14px"></div></div>`;
}

function notFound() {
  return `<div class="page"><div class="empty" style="padding:90px 20px">
    <b>That page does not exist.</b>
    <p class="muted" style="margin:8px 0 18px">The link may be old, or the lesson was renamed.</p>
    <a class="btn btn-dark" href="/dashboard" data-nav>Back to today</a>
  </div></div>`;
}

async function render() {
  const app = document.getElementById('app');
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const hit = match(path) || match(decodeURIComponent(path));

  if (!hit) {
    app.innerHTML = shell(notFound());
    bindShell();
    return;
  }

  const { route, params } = hit;
  state.route = path;

  if (state.needsSetup && path !== '/setup') {
    navigate('/setup', { replace: true });
    return;
  }
  if (route.auth && !state.user) {
    navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
    return;
  }
  if (route.adminOnly && !['admin', 'owner', 'coordinator'].includes(state.user?.role)) {
    app.innerHTML = shell(`<div class="page"><div class="empty"><b>Admin access only.</b><p class="muted">Ask your training lead for access.</p></div></div>`, { crumb: [{ label: 'Control room' }] });
    bindShell();
    return;
  }
  if (route.gated && state.user && state.user.role === 'learner' && !state.user.profile?.takenAt) {
    navigate('/onboard', { replace: true });
    return;
  }

  app.innerHTML = loading();
  try {
    const result = await route.view(params);
    const html = typeof result === 'string' ? result : result.html;
    if (route.standalone) {
      app.innerHTML = html;
    } else {
      const crumb = result.crumb || [];
      app.innerHTML = shell(html, { crumb });
      bindShell();
    }
    if (result.mount) result.mount(document.getElementById('app'));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  } catch (err) {
    console.error(err);
    if (err.status === 401) {
      state.user = null;
      navigate('/login', { replace: true });
      return;
    }
    const box = `<div class="page"><div class="empty" style="padding:70px 20px">
      <b>Something broke on this page.</b>
      <p class="muted" style="margin:8px 0 16px">${String(err.message || err).replace(/</g, '&lt;')}</p>
      <button class="btn btn-dark" onclick="location.reload()">Reload</button>
    </div></div>`;
    app.innerHTML = state.user ? shell(box) : box;
    bindShell();
  }
}

async function boot() {
  try {
    const setup = await api('/api/setup/status');
    state.needsSetup = Boolean(setup.needsSetup);
  } catch {
    state.needsSetup = false;
  }

  if (state.needsSetup) {
    await render();
    return;
  }

  const [site, content, auth] = await Promise.all([
    api(`/api/site${tenantFromQuery() ? `?t=${encodeURIComponent(tenantFromQuery())}` : ''}`).catch(() => ({ tenant: null })),
    api('/api/content').catch(() => null),
    api('/api/auth/config').catch(() => ({ enabled: false, localLogin: true })),
  ]);
  state.site = site.tenant;
  state.content = content;
  state.authConfig = auth;
  setBrand(site.tenant);
  await refreshMe();
  await render();
}

/* client-side navigation */
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-nav]');
  if (!a) return;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const href = a.getAttribute('href');
  if (!href || href.startsWith('http') || href.startsWith('#')) return;
  e.preventDefault();
  navigate(href);
});

window.addEventListener('popstate', render);

/* boot state changes from auth flows */
window.addEventListener('app:refresh', async () => {
  await refreshMe();
  await render();
});

window.addEventListener('app:toast', (e) => toast(e.detail.message, e.detail.tone));

boot().catch((err) => {
  console.error(err);
  document.getElementById('app').innerHTML = `<div class="page"><div class="empty" style="padding:80px 20px">
    <b>The platform could not start.</b>
    <p class="muted" style="margin:8px 0 16px">${String(err.message || err)}</p>
    <button class="btn btn-dark" onclick="location.reload()">Retry</button></div></div>`;
});
