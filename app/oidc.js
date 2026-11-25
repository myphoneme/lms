'use strict';
/**
 * Phoneme Auth (OIDC) adapter.
 *
 * Optional: when PHONEME_AUTH_ENABLED is not "1", the platform keeps its local
 * email/password login and none of these routes do anything.
 *
 * Implements the authorization-code flow with PKCE, state, nonce and RS256/ES256
 * ID-token signature verification against the provider's JWKS. No dependencies.
 *
 * Environment (all read once at boot):
 *   PHONEME_AUTH_ENABLED=1
 *   PHONEME_AUTH_ISSUER=https://auth.phoneme.in
 *   PHONEME_AUTH_CLIENT_ID=lms
 *   PHONEME_AUTH_CLIENT_SECRET=...
 *   PHONEME_AUTH_REDIRECT_URI=https://lms.phoneme.in/auth/callback
 *   PHONEME_AUTH_SCOPES="openid profile email"
 *   PHONEME_AUTH_GROUP_CLAIM=groups
 *   PHONEME_AUTH_ADMIN_GROUP=lms-admins
 *   PHONEME_AUTH_COORDINATOR_GROUP=lms-coordinators
 *   PHONEME_AUTH_ALLOWED_DOMAIN=phoneme.in
 *   PHONEME_AUTH_BUTTON_LABEL="Continue with Phoneme"
 *   PHONEME_AUTH_LOCAL_LOGIN=1        # keep the password form as well
 *   PHONEME_TENANT_SLUG=phoneme
 */

const crypto = require('node:crypto');

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const random = (n) => crypto.randomBytes(n).toString('hex');

function isHttps(url) {
  return String(url || '').startsWith('https://');
}

module.exports = function createOidc(deps) {
  const { one, run, now, send, newToken, hashPassword, baseUrl } = deps;

  const cfg = {
    enabled: process.env.PHONEME_AUTH_ENABLED === '1',
    issuer: (process.env.PHONEME_AUTH_ISSUER || '').replace(/\/$/, ''),
    clientId: process.env.PHONEME_AUTH_CLIENT_ID || '',
    clientSecret: process.env.PHONEME_AUTH_CLIENT_SECRET || '',
    redirectUri: process.env.PHONEME_AUTH_REDIRECT_URI || `${baseUrl}/auth/callback`,
    scopes: process.env.PHONEME_AUTH_SCOPES || 'openid profile email',
    groupClaim: process.env.PHONEME_AUTH_GROUP_CLAIM || 'groups',
    adminGroup: process.env.PHONEME_AUTH_ADMIN_GROUP || 'lms-admins',
    coordinatorGroup: process.env.PHONEME_AUTH_COORDINATOR_GROUP || 'lms-coordinators',
    allowedDomain: (process.env.PHONEME_AUTH_ALLOWED_DOMAIN || '').toLowerCase().replace(/^@/, ''),
    buttonLabel: process.env.PHONEME_AUTH_BUTTON_LABEL || 'Continue with Phoneme',
    localLogin: process.env.PHONEME_AUTH_LOCAL_LOGIN !== '0',
    tenantSlug: process.env.PHONEME_TENANT_SLUG || 'phoneme',
    tokenAuth: process.env.PHONEME_AUTH_TOKEN_AUTH === 'basic' ? 'basic' : 'post',
    logoutRedirect: process.env.PHONEME_AUTH_POST_LOGOUT_REDIRECT || baseUrl,
  };

  if (cfg.enabled && (!cfg.issuer || !cfg.clientId || !cfg.clientSecret)) {
    console.error('[oidc] PHONEME_AUTH_ENABLED=1 but issuer/client id/secret are missing — SSO disabled.');
    cfg.enabled = false;
  }

  let discoveryCache = null;
  let discoveryAt = 0;
  let jwksCache = null;
  let jwksAt = 0;
  let lastError = '';

  async function discovery() {
    if (!cfg.enabled) throw new Error('SSO is not configured');
    if (discoveryCache && Date.now() - discoveryAt < 10 * 60 * 1000) return discoveryCache;
    const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
    discoveryCache = await res.json();
    discoveryAt = Date.now();
    return discoveryCache;
  }

  async function jwks() {
    if (jwksCache && Date.now() - jwksAt < 10 * 60 * 1000) return jwksCache;
    const d = await discovery();
    const res = await fetch(d.jwks_uri, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
    jwksCache = await res.json();
    jwksAt = Date.now();
    return jwksCache;
  }

  function verifyJwt(token, expectedNonce) {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) throw new Error('Malformed ID token');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!['RS256', 'ES256'].includes(header.alg)) throw new Error(`Unsupported token alg ${header.alg}`);
    return { header, payload, parts };
  }

  async function verifySignature(token) {
    const { header, payload, parts } = verifyJwt(token);
    let keys = await jwks();
    let jwk = (keys.keys || []).find((k) => k.kid && k.kid === header.kid) || (keys.keys || [])[0];
    if (!jwk) throw new Error('No signing key');
    const data = Buffer.from(`${parts[0]}.${parts[1]}`);
    const sig = Buffer.from(parts[2], 'base64url');
    let key;
    try { key = crypto.createPublicKey({ key: jwk, format: 'jwk' }); } catch (e) { throw new Error('Invalid signing key'); }
    const good = header.alg === 'RS256'
      ? crypto.verify('RSA-SHA256', data, key, sig)
      : crypto.verify('SHA256', data, { key, dsaEncoding: 'ieee-p1363' }, sig);
    if (!good) throw new Error('Bad token signature');
    return payload;
  }

  function validateClaims(payload, nonce) {
    const issOk = String(payload.iss || '').replace(/\/$/, '') === cfg.issuer;
    if (!issOk) throw new Error('Token issuer mismatch');
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(cfg.clientId)) throw new Error('Token audience mismatch');
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp < nowSec - 30) throw new Error('Token expired');
    if (payload.nbf && payload.nbf > nowSec + 30) throw new Error('Token not yet valid');
    if (nonce && payload.nonce !== nonce) throw new Error('Token nonce mismatch');
    return payload;
  }

  function sessionCookie(token) {
    return `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${isHttps(baseUrl) ? '; Secure' : ''}`;
  }

  function redirect(res, location) {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
  }

  function loginError(res, message) {
    return redirect(res, `/login?sso=error&reason=${encodeURIComponent(message)}`);
  }

  async function start(req, res, url) {
    if (!cfg.enabled) return send(res, 503, { error: 'Phoneme SSO is not enabled on this deployment.' });
    try {
      const d = await discovery();
      const state = random(24);
      const nonce = random(16);
      const verifier = b64url(crypto.randomBytes(32));
      const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
      const next = String(url.searchParams.get('next') || '/dashboard');
      run('DELETE FROM oidc_states WHERE expires_at < ?', Date.now());
      run('INSERT INTO oidc_states (state,verifier,nonce,next,expires_at) VALUES (?,?,?,?,?)',
        state, verifier, nonce, next.startsWith('/') ? next : '/dashboard', Date.now() + 10 * 60 * 1000);
      const auth = new URL(d.authorization_endpoint);
      auth.searchParams.set('response_type', 'code');
      auth.searchParams.set('client_id', cfg.clientId);
      auth.searchParams.set('redirect_uri', cfg.redirectUri);
      auth.searchParams.set('scope', cfg.scopes);
      auth.searchParams.set('state', state);
      auth.searchParams.set('nonce', nonce);
      auth.searchParams.set('code_challenge', challenge);
      auth.searchParams.set('code_challenge_method', 'S256');
      return redirect(res, auth.toString());
    } catch (err) {
      lastError = err.message;
      console.error('[oidc] start', err.message);
      return loginError(res, 'The identity provider is unreachable. Try again or use a local account.');
    }
  }

  async function exchange(code, verifier) {
    const d = await discovery();
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      code_verifier: verifier,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
    if (cfg.tokenAuth === 'basic') {
      headers.Authorization = 'Basic ' + Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    } else {
      form.set('client_secret', cfg.clientSecret);
    }
    const res = await fetch(d.token_endpoint, { method: 'POST', headers, body: form });
    if (!res.ok) throw new Error(`Token exchange failed (${res.status})`);
    return res.json();
  }

  async function callback(req, res, url) {
    if (!cfg.enabled) return send(res, 503, { error: 'Phoneme SSO is not enabled on this deployment.' });
    const state = String(url.searchParams.get('state') || '');
    const code = String(url.searchParams.get('code') || '');
    const err = url.searchParams.get('error');
    if (err) return loginError(res, url.searchParams.get('error_description') || err);
    if (!state || !code) return loginError(res, 'The provider returned no authorization code.');
    const saved = one('SELECT * FROM oidc_states WHERE state = ?', state);
    if (!saved || saved.expires_at < Date.now()) return loginError(res, 'This sign-in link expired. Start again.');
    run('DELETE FROM oidc_states WHERE state = ?', state);

    try {
      const tokens = await exchange(code, saved.verifier);
      if (!tokens.id_token) throw new Error('No ID token returned');
      const raw = verifyJwt(tokens.id_token).payload;
      if (tokens.access_token && raw.at_hash === undefined) { /* at_hash is optional for code flow */ }
      const payload = validateClaims(await verifySignature(tokens.id_token), saved.nonce);
      const email = String(payload.email || payload.preferred_username || '').toLowerCase();
      if (!email || !email.includes('@')) throw new Error('Provider did not return an email address');
      if (cfg.allowedDomain && !email.endsWith('@' + cfg.allowedDomain)) {
        return loginError(res, `Only @${cfg.allowedDomain} accounts can sign in.`);
      }
      const tenant = one('SELECT * FROM tenants WHERE slug = ?', cfg.tenantSlug);
      if (!tenant) return loginError(res, 'The Phoneme workspace is not provisioned on this server.');

      const groups = Array.isArray(payload[cfg.groupClaim])
        ? payload[cfg.groupClaim].map(String)
        : String(payload[cfg.groupClaim] || '').split(/[,\s]+/).filter(Boolean);
      let role = 'learner';
      if (groups.includes(cfg.adminGroup)) role = 'admin';
      else if (groups.includes(cfg.coordinatorGroup)) role = 'coordinator';

      let user = one('SELECT * FROM users WHERE tenant_id = ? AND email = ?', tenant.id, email);
      if (!user) {
        const id = Number(run(
          'INSERT INTO users (tenant_id,email,name,pass_hash,role,cohort,created_at) VALUES (?,?,?,?,?,?,?)',
          tenant.id, email, String(payload.name || email.split('@')[0]), 'oidc', role, 'Employees', now()
        ).lastInsertRowid);
        user = one('SELECT * FROM users WHERE id = ?', id);
      } else if (user.pass_hash === 'oidc' && ['learner', 'coordinator', 'admin'].includes(user.role) && user.role !== role) {
        // keep SSO-managed roles in sync, but never demote the tenant owner
        run('UPDATE users SET role = ? WHERE id = ?', role, user.id);
        user = one('SELECT * FROM users WHERE id = ?', user.id);
      }

      const token = newToken();
      run('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)', token, user.id, Date.now() + 30 * 864e5);
      res.setHeader('Set-Cookie', sessionCookie(token));
      return redirect(res, saved.next || '/dashboard');
    } catch (error) {
      lastError = error.message;
      console.error('[oidc] callback', error.message);
      return loginError(res, 'Sign-in could not be completed. Contact IT if this repeats.');
    }
  }

  async function logout(req, res) {
    const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('sid='));
    if (raw) run('DELETE FROM sessions WHERE token = ?', raw.slice(4));
    res.setHeader('Set-Cookie', `sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(baseUrl) ? '; Secure' : ''}`);
    if (!cfg.enabled) return redirect(res, '/');
    try {
      const d = await discovery();
      if (d.end_session_endpoint) {
        const u = new URL(d.end_session_endpoint);
        u.searchParams.set('post_logout_redirect_uri', cfg.logoutRedirect);
        return redirect(res, u.toString());
      }
    } catch { /* fall through to local logout */ }
    return redirect(res, '/');
  }

  return {
    enabled: cfg.enabled,
    config: () => ({
      enabled: cfg.enabled,
      buttonLabel: cfg.buttonLabel,
      localLogin: cfg.localLogin,
      tenantSlug: cfg.tenantSlug,
      issuer: cfg.issuer ? new URL(cfg.issuer).host : null,
      error: lastError,
    }),
    start,
    callback,
    logout,
  };
};
