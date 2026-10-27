async function post(path, body) {
  let response;
  try { response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new Error('Could not reach the server. Check your connection.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}
export const askAssistant = body => post('/api/chat', body);
export const assess = body => post('/api/assess', body);
