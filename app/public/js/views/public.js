/* Public surfaces: landing, sign in, join cohort, first-run setup, verification. */
import { api, state, refreshMe, tenantFromQuery } from '../api.js';
import { icon, esc, fmtDate, brandGlyph } from '../ui.js';
import { navigate } from '../shell.js';

function ticketRail() {
  const tickets = [
    {
      id: 'INC-4821',
      subject: '“Internet is down” — but the laptop has an IP address',
      body: 'User can reach 8.8.8.8 by ping. Browsers fail on every site. Nothing changed overnight.',
      steps: [['Check', 'ipconfig /all'], ['Test', 'nslookup'], ['Fix', 'DNS suffix'], ['Closed at L1', '', 'ok']],
    },
    {
      id: 'INC-4837',
      subject: 'New VM has no network after a subnet change',
      body: 'Provisioned from the right template, wrong VLAN. Gateway answers nothing.',
      steps: [['Check', 'ip addr'], ['Verify', 'VLAN /24'], ['Fix', 'port group'], ['Escalated', 'to network', 'warn']],
    },
    {
      id: 'INC-4850',
      subject: 'Application times out only for remote staff',
      body: 'Office users are fine. VPN users time out after 30 seconds on the same URL.',
      steps: [['Check', 'ss -tulnp'], ['Test', 'curl -v'], ['Fix', 'MTU / firewall'], ['Closed at L1', '', 'ok']],
    },
  ];
  return `<div class="ticket-stack">
    <div class="rail-title"><span>Representative L1 queue</span><span>3 of 40 drills</span></div>
    ${tickets
      .map(
        (t) => `<article class="ticket">
      <div class="ticket-top"><b>${t.id}</b><span>·</span><span>P3</span></div>
      <div class="ticket-subject">${esc(t.subject)}</div>
      <div class="ticket-body">${esc(t.body)}</div>
      <div class="ticket-route">${t.steps
        .map(([label, value, tone], i) =>
          `${i ? '<span class="arrow">→</span>' : ''}<span class="step ${tone === 'ok' ? 'ok' : tone === 'warn' ? 'warn' : ''}">${esc(label)}${value ? ` <b style="font-weight:600;color:inherit">${esc(value)}</b>` : ''}</span>`
        )
        .join('')}</div>
    </article>`
      )
      .join('')}
    <p class="ticket-note">Each lesson opens with a ticket like these, teaches only what closes it, and ends with evidence you submit.</p>
  </div>`;
}

export function landing() {
  if (state.user) {
    navigate('/dashboard', { replace: true });
    return { html: '' };
  }
  const tenant = state.site || { name: 'L1 Academy', tagline: 'L1 → L2 readiness programme' };
  const modules = state.content?.modules || [];
  const lessons = state.content ? Object.keys(state.content.lessons || {}).length : 48;
  const drills = state.content?.assignments?.length || 40;

  return {
    html: `<div class="landing">
    <header class="landing-top">
      <span class="brand-mark">${brandGlyph()}</span>
      <span class="name">${esc(tenant.name)}</span>
      <div class="links">
        <a class="btn btn-quiet btn-sm" href="/login${tenantFromQuery() ? `?t=${encodeURIComponent(tenantFromQuery())}` : ''}" data-nav>Sign in</a>
        <a class="btn btn-dark btn-sm" href="/register" data-nav>Join the cohort</a>
      </div>
    </header>

    <section class="landing-hero">
      <div class="hero-copy">
        <h1>Your first month on the floor, taught ticket by ticket.</h1>
        <p class="lede">Freshers arrive with theory and no ticket history. This programme hands them the eight situations L1 actually gets asked, makes them prove each one, and shows the manager exactly who is ready to stop escalating.</p>
        <div class="hero-actions">
          <a class="btn btn-primary btn-lg" href="/register" data-nav>Start with the diagnostic ${icon('arrowRight')}</a>
          <a class="btn btn-ghost btn-lg" href="/login" data-nav>I have an account</a>
        </div>
        <div class="hero-facts">
          <div class="hero-fact"><b>${modules.length || 8}</b><span>modules</span></div>
          <div class="hero-fact"><b>${lessons}</b><span>lessons with diagrams</span></div>
          <div class="hero-fact"><b>${drills}</b><span>graded daily drills</span></div>
          <div class="hero-fact"><b>80%</b><span>to certify</span></div>
        </div>
      </div>
      ${ticketRail()}
    </section>

    <section class="landing-band">
      <div class="band-inner">
        <div class="band-title">
          <b>Built from your own topic sheet.</b>
          144 rows reviewed, grouped into eight modules that map to the work, not to a textbook.
        </div>
        <div class="module-strip">
          ${(modules.length ? modules : [
            { seq: 1, title: 'Networking foundations', tagline: 'OSI to VPN', sheetTopics: [] },
            { seq: 2, title: 'Linux for the desk', tagline: 'files, logs, ports', sheetTopics: [] },
            { seq: 3, title: 'Windows & PowerShell', tagline: 'identity, events', sheetTopics: [] },
            { seq: 4, title: 'Security fundamentals', tagline: 'CIA to governance', sheetTopics: [] },
            { seq: 5, title: 'Offensive security', tagline: 'scan, test, report', sheetTopics: [] },
            { seq: 6, title: 'SOC & detection', tagline: 'SIEM, MITRE', sheetTopics: [] },
            { seq: 7, title: 'Incident response', tagline: 'contain to report', sheetTopics: [] },
            { seq: 8, title: 'Automation', tagline: 'Python, Bash, PS', sheetTopics: [] },
          ])
            .map(
              (m) => `<div class="m"><i>${String(m.seq).padStart(2, '0')}</i><span>${esc(m.title)}</span></div>`
            )
            .join('')}
        </div>
      </div>
    </section>

    <footer class="landing-band">
      <div class="band-inner" style="grid-template-columns:1fr auto;align-items:center">
        <div class="band-title" style="max-width:60ch">
          <b>White-label by design.</b>
          Company name, logo mark, colours, signatory, pass mark and certificate title are set once, at configuration.
        </div>
        <div class="small dim">Verifiable certificates · progress export · per-company leaderboard</div>
      </div>
    </footer>
  </div>`,
    mount: () => {},
  };
}

function authSide(tenant) {
  return `<aside class="auth-side">
    <svg class="grid-deco" viewBox="0 0 400 800" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <defs><pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#7f8d8b" stroke-width="0.5"/></pattern></defs>
      <rect width="400" height="800" fill="url(#g)"/>
      <circle cx="300" cy="150" r="96" fill="none" stroke="#3a4a4e" stroke-width="0.8"/>
      <circle cx="300" cy="150" r="62" fill="none" stroke="#3a4a4e" stroke-width="0.8"/>
      <circle cx="300" cy="150" r="4" fill="#22d3a6"/>
    </svg>
    <div style="display:flex;gap:11px;align-items:center;position:relative">
      <span class="brand-mark" style="background:var(--accent)">${brandGlyph()}</span>
      <span class="brand-name">${esc(tenant?.name || 'L1 Academy')}</span>
    </div>
    <div class="auth-programme">
      <div class="k">Eight modules</div>
      ${(state.content?.modules || []).map((m) => `<div class="row"><span class="n">${String(m.seq).padStart(2, '0')}</span><span>${esc(m.title)}</span></div>`).join('')}
    </div>
    <p class="quote">The gap is rarely knowledge. It is knowing which check closes the ticket.</p>
    <p class="quote-by">L1 → L2 readiness programme · eight weeks</p>
  </aside>`;
}

export function login() {
  const tenant = state.site || {};
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || '/dashboard';
  const auth = state.authConfig || { enabled: false, localLogin: true };
  const ssoError = params.get('sso') === 'error' ? (params.get('reason') || 'Single sign-on could not be completed.') : '';
  return {
    html: `<div class="auth-wrap">
      ${authSide(tenant)}
      <div class="auth-panel">
        <div class="auth-box">
          <h1>Sign in</h1>
          <p class="sub">${esc(tenant.name || 'Your company')} training cohort</p>
          ${ssoError ? `<div class="form-error">${esc(ssoError)}</div>` : ''}
          ${auth.enabled ? `<a class="btn btn-dark btn-block btn-lg" href="/auth/phoneme?next=${encodeURIComponent(next)}">${icon('lock')} ${esc(auth.buttonLabel || 'Continue with Phoneme')}</a>
            ${auth.localLogin ? '<div class="auth-divider"><span>or use a local account</span></div>' : ''}` : ''}
          <form id="login-form" novalidate ${auth.localLogin ? '' : 'hidden'}>
            <div class="form-error" id="err" hidden></div>
            ${tenantFromQuery() ? `<input type="hidden" name="tenant" value="${esc(tenantFromQuery())}" />` : ''}
            <div class="field">
              <label for="email">Work email</label>
              <input class="input" id="email" name="email" type="email" autocomplete="username" required placeholder="you@company.com" />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input class="input" id="password" name="password" type="password" autocomplete="current-password" required placeholder="••••••••" />
            </div>
            <button class="btn btn-primary btn-block btn-lg" type="submit">Sign in</button>
          </form>
          ${auth.localLogin ? `<p class="auth-alt">New to the cohort? <a class="link" href="/register" data-nav>Join with an invite code</a></p>` : `<p class="auth-alt small dim">Accounts are created by IT from your Phoneme identity. Contact the training admin if you cannot sign in.</p>`}
          <p class="auth-foot">Scores, submissions and certificates are visible to your company's training admin.</p>
        </div>
      </div>
    </div>`,
    mount: () => {
      const form = document.getElementById('login-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = document.getElementById('err');
        err.hidden = true;
        const fd = new FormData(form);
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.textContent = 'Signing in…';
        try {
          const body = { email: fd.get('email'), password: fd.get('password') };
          if (fd.get('tenant')) body.tenant = fd.get('tenant');
          await api('/api/auth/login', { method: 'POST', body });
          const me = await refreshMe();
          const target = me?.role === 'coordinator' ? '/admin' : next;
          navigate(target.startsWith('/') ? target : '/dashboard');
        } catch (error) {
          err.textContent = error.message;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = 'Sign in';
        }
      });
    },
  };
}

export function register() {
  const tenant = state.site || {};
  return {
    html: `<div class="auth-wrap">
      ${authSide(tenant)}
      <div class="auth-panel">
        <div class="auth-box">
          <h1>Join the cohort</h1>
          <p class="sub">Your admin gives you a company code and an invite code.</p>
          ${(state.authConfig?.enabled) ? `<p class="form-note" style="margin-bottom:14px">Phoneme employees sign in with the company SSO. Use an invite code only for guests, contractors or external trainers.</p>` : ''}
          <form id="reg-form" novalidate>
            <div class="form-error" id="err" hidden></div>
            <div class="field">
              <label for="name">Full name</label>
              <input class="input" id="name" name="name" required autocomplete="name" placeholder="Asha Menon" />
            </div>
            <div class="field">
              <label for="email">Work email</label>
              <input class="input" id="email" name="email" type="email" required autocomplete="email" placeholder="you@company.com" />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input class="input" id="password" name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters" />
            </div>
            <div class="two-col" style="gap:12px">
              <div class="field">
                <label for="tenant">Company code</label>
                <input class="input mono" id="tenant" name="tenant" required value="${esc(tenant.slug || tenantFromQuery())}" placeholder="acme-dc" />
              </div>
              <div class="field">
                <label for="inviteCode">Invite code</label>
                <input class="input mono" id="inviteCode" name="inviteCode" required placeholder="JOIN" style="text-transform:uppercase" />
              </div>
            </div>
            <button class="btn btn-primary btn-block btn-lg" type="submit">Create account</button>
          </form>
          <p class="auth-alt">Already registered? <a class="link" href="/login" data-nav>Sign in</a></p>
          <p class="auth-foot">You will take a short diagnostic next. It is not graded; it decides where your eight weeks should focus.</p>
        </div>
      </div>
    </div>`,
    mount: () => {
      const form = document.getElementById('reg-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = document.getElementById('err');
        err.hidden = true;
        const fd = new FormData(form);
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.textContent = 'Creating account…';
        try {
          await api('/api/auth/register', {
            method: 'POST',
            body: {
              name: fd.get('name'),
              email: fd.get('email'),
              password: fd.get('password'),
              tenant: String(fd.get('tenant') || '').toLowerCase(),
              inviteCode: fd.get('inviteCode'),
            },
          });
          await refreshMe();
          navigate('/onboard');
        } catch (error) {
          err.textContent = error.message;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = 'Create account';
        }
      });
    },
  };
}

export function setup() {
  return {
    html: `<div class="auth-wrap">
      <aside class="auth-side">
        <div style="display:flex;gap:11px;align-items:center">
          <span class="brand-mark" style="background:var(--accent)">L1</span>
          <span class="brand-name">L1 Academy</span>
        </div>
        <p class="quote">One setup. Your name, your colours, your pass mark, your certificate.</p>
        <p class="quote-by">First-run configuration · nothing is sent anywhere</p>
      </aside>
      <div class="auth-panel" style="align-items:start;padding-top:44px">
        <div class="auth-box" style="max-width:520px">
          <h1>Configure your academy</h1>
          <p class="sub">This creates the first company workspace and its owner account. Everything below can be changed later in the control room.</p>
          <form id="setup-form" novalidate>
            <div class="form-error" id="err" hidden></div>
            <div class="field">
              <label for="company">Company name</label>
              <input class="input" id="company" name="company" required placeholder="Northwind Datacenter Services" />
            </div>
            <div class="field">
              <label for="slug">Company code</label>
              <input class="input mono" id="slug" name="slug" required placeholder="northwind" pattern="[a-z0-9-]+" />
              <span class="hint">Learners type this when they join. Lowercase letters, numbers, hyphens.</span>
            </div>
            <div class="field">
              <label for="tagline">Programme line</label>
              <input class="input" id="tagline" name="tagline" placeholder="L1 → L2 readiness programme" />
            </div>
            <hr class="rule" style="margin:22px 0" />
            <h3 style="font-size:13px;margin-bottom:12px">Owner account</h3>
            <div class="two-col" style="gap:12px">
              <div class="field">
                <label for="adminName">Your name</label>
                <input class="input" id="adminName" name="adminName" required placeholder="Priya Raman" />
              </div>
              <div class="field">
                <label for="adminEmail">Your email</label>
                <input class="input" id="adminEmail" name="adminEmail" type="email" required placeholder="priya@northwind.example" />
              </div>
            </div>
            <div class="field">
              <label for="adminPassword">Password</label>
              <input class="input" id="adminPassword" name="adminPassword" type="password" minlength="8" required placeholder="At least 8 characters" />
            </div>
            <hr class="rule" style="margin:22px 0" />
            <h3 style="font-size:13px;margin-bottom:12px">Brand & grading</h3>
            <div class="two-col" style="gap:12px">
              <div class="field">
                <label for="primary">Primary colour</label>
                <div class="color-input"><input type="color" id="primary" name="primary" value="#2f6bff" /><input class="input mono" name="primaryText" value="#2f6bff" aria-label="Primary colour hex" /></div>
              </div>
              <div class="field">
                <label for="accent">Accent colour</label>
                <div class="color-input"><input type="color" id="accent" name="accent" value="#12a37a" /><input class="input mono" name="accentText" value="#12a37a" aria-label="Accent colour hex" /></div>
              </div>
            </div>
            <div class="two-col" style="gap:12px">
              <div class="field">
                <label for="signatory">Certificate signatory</label>
                <input class="input" id="signatory" name="signatory" placeholder="Priya Raman" />
              </div>
              <div class="field">
                <label for="signatoryTitle">Signatory title</label>
                <input class="input" id="signatoryTitle" name="signatoryTitle" placeholder="Head of Service Delivery" />
              </div>
            </div>
            <div class="two-col" style="gap:12px">
              <div class="field">
                <label for="certTitle">Certificate title</label>
                <input class="input" id="certTitle" name="certTitle" value="L1 Readiness Certificate" />
              </div>
              <div class="field">
                <label for="inviteCode">Invite code</label>
                <input class="input mono" id="inviteCode" name="inviteCode" value="JOIN" style="text-transform:uppercase" />
              </div>
            </div>
            <div class="two-col" style="gap:12px">
              <div class="field">
                <label for="passPct">Module pass mark (%)</label>
                <input class="input mono" id="passPct" name="passPct" type="number" min="50" max="95" value="70" />
              </div>
              <div class="field">
                <label for="certPct">Certificate mark (%)</label>
                <input class="input mono" id="certPct" name="certPct" type="number" min="60" max="100" value="80" />
              </div>
            </div>
            <button class="btn btn-primary btn-block btn-lg" type="submit">Create academy</button>
          </form>
          <p class="auth-foot">No billing, no external service. Data stays in <span class="mono">data/app.db</span> on this machine.</p>
        </div>
      </div>
    </div>`,
    mount: () => {
      const form = document.getElementById('setup-form');
      form.querySelectorAll('input[type=color]').forEach((input) => {
        const text = form.querySelector(`input[name="${input.name}Text"]`);
        input.addEventListener('input', () => { text.value = input.value; });
        text.addEventListener('change', () => { if (/^#[0-9a-f]{6}$/i.test(text.value)) input.value = text.value; });
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = document.getElementById('err');
        err.hidden = true;
        const fd = new FormData(form);
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.textContent = 'Creating…';
        try {
          await api('/api/setup', {
            method: 'POST',
            body: {
              company: fd.get('company'),
              slug: fd.get('slug'),
              tagline: fd.get('tagline'),
              primary: fd.get('primary'),
              accent: fd.get('accent'),
              signatory: fd.get('signatory'),
              signatoryTitle: fd.get('signatoryTitle'),
              certTitle: fd.get('certTitle'),
              inviteCode: fd.get('inviteCode'),
              passPct: Number(fd.get('passPct')),
              certPct: Number(fd.get('certPct')),
              adminName: fd.get('adminName'),
              adminEmail: fd.get('adminEmail'),
              adminPassword: fd.get('adminPassword'),
            },
          });
          state.needsSetup = false;
          await refreshMe();
          navigate('/admin');
        } catch (error) {
          err.textContent = error.message;
          err.hidden = false;
          btn.disabled = false;
          btn.textContent = 'Create academy';
        }
      });
    },
  };
}

export function verify({ code }) {
  return {
    html: `<div class="auth-wrap" style="grid-template-columns:1fr">
      <div class="auth-panel">
        <div class="auth-box" style="max-width:520px">
          <div id="verify-out"><div class="skeleton" style="height:120px"></div></div>
        </div>
      </div>
    </div>`,
    mount: async () => {
      const out = document.getElementById('verify-out');
      try {
        const data = await api(`/api/verify/${encodeURIComponent(code)}`);
        out.innerHTML = `<div class="card card-pad">
          <div style="display:flex;align-items:center;gap:10px;color:var(--ok);font-weight:600;font-size:13px">${icon('shield')} Certificate verified</div>
          <h1 style="font-size:26px;margin:14px 0 4px">${esc(data.learner)}</h1>
          <p class="muted">${esc(data.certTitle)} · ${esc(data.company)}</p>
          <hr class="rule" style="margin:18px 0" />
          <table class="mini-table">
            <tr><td class="dim">Certificate code</td><td class="mono">${esc(data.code)}</td></tr>
            <tr><td class="dim">Issued</td><td>${fmtDate(data.issuedAt)}</td></tr>
            <tr><td class="dim">Final score</td><td class="num"><b>${data.overall}%</b></td></tr>
            <tr><td class="dim">Signatory</td><td>${esc(data.signatory || '—')}</td></tr>
          </table>
          <p class="auth-foot" style="text-align:left;margin-top:16px">This record is issued by ${esc(data.company)} and stored on their training platform.</p>
        </div>`;
      } catch {
        out.innerHTML = `<div class="card card-pad">
          <div style="display:flex;align-items:center;gap:10px;color:var(--bad);font-weight:600;font-size:13px">${icon('alert')} Not a valid certificate</div>
          <h1 style="font-size:24px;margin:14px 0 6px">No record for ${esc(code)}</h1>
          <p class="muted">Check the code on the certificate. Codes look like <span class="mono">L1-8F3A2C1D</span>.</p>
          <a class="btn btn-ghost" href="/" data-nav style="margin-top:18px">Back to start</a>
        </div>`;
      }
    },
  };
}
