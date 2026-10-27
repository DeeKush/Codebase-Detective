let onUnauthorized = () => {};
export const setUnauthorizedHandler = fn => { onUnauthorized = fn; };

async function request(method, path, body, { quiet401 = false } = {}) {
  let response;
  try {
    response = await fetch(path, { method, headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch { throw new Error('Could not reach the server. Check your connection.'); }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && !quiet401) onUnauthorized();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

export const askAssistant = body => request('POST', '/api/chat', body);
export const assess = body => request('POST', '/api/assess', body);
export const gradeSubmission = body => request('POST', '/api/grade', body);
export const fetchMe = () => request('GET', '/api/auth/me', undefined, { quiet401: true });
export const fetchState = () => request('GET', '/api/state');
export const saveRemoteSession = session => request('PUT', '/api/state', { session });
export const clearRemoteSession = () => request('DELETE', '/api/state');
export const authRequest = (action, body) => request('POST', `/api/auth/${action}`, body, { quiet401: true });
