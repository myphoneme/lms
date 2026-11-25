/* API client + shared app state. */

export const state = {
  site: null,
  user: null,
  progress: null,
  content: null,
  authConfig: null,
  needsSetup: false,
  route: null,
};

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function refreshMe() {
  try {
    const data = await api('/api/me');
    state.user = data.user;
    state.progress = data.progress;
  } catch {
    state.user = null;
    state.progress = null;
  }
  return state.user;
}

export function tenantFromQuery() {
  return new URLSearchParams(location.search).get('t') || '';
}
