// All fetch() calls to the Express backend live here.

const TOKEN_KEY = 'rpg_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token) { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  // auth
  register: (username, email, password) =>
    request('/api/auth/register', { method: 'POST', body: { username, email, password } }),
  login: (username, password) =>
    request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/api/auth/me'),

  // player
  stats: () => request('/api/player/stats'),
  awardXp: (amount) => request('/api/player/xp', { method: 'POST', body: { amount } }),
  setHp: (hp) => request('/api/player/hp', { method: 'POST', body: { hp } }),
  addGold: (amount) => request('/api/player/gold', { method: 'POST', body: { amount } }),
  inventory: () => request('/api/player/inventory'),
  addItem: (item) => request('/api/player/inventory', { method: 'POST', body: item }),
  equip: (itemId) => request(`/api/player/equip/${itemId}`, { method: 'POST' }),
  removeItem: (itemId) => request(`/api/player/inventory/${itemId}`, { method: 'DELETE' }),

  // shop
  shopBuy: (npcId, item) => request('/api/shop/buy', { method: 'POST', body: { npcId, item } }),
  shopSell: (itemId) => request('/api/shop/sell', { method: 'POST', body: { itemId } }),

  // friends
  friends: () => request('/api/friends'),
  friendRequest: (username) => request('/api/friends/request', { method: 'POST', body: { username } }),
  friendAccept: (id) => request(`/api/friends/accept/${id}`, { method: 'POST' }),
  friendRemove: (id) => request(`/api/friends/${id}`, { method: 'DELETE' }),

  // npc memory
  getMemory: (npcId) => request(`/api/ai/memory/${npcId}`),
  saveMemory: (npcId, summary) =>
    request(`/api/ai/memory/${npcId}`, { method: 'POST', body: { summary } })
};

// POST to /api/ai/npc and stream the SSE reply. Calls onText(textChunk) as
// tokens arrive; resolves with the full reply text when the stream ends.
export async function streamNpcReply(body, onText) {
  const res = await fetch('/api/ai/npc', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }
    throw new Error(data?.error || `NPC chat failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop(); // keep the trailing partial event
    for (const event of events) {
      const line = event.trim();
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') return fullText;
      try {
        const { text, error } = JSON.parse(payload);
        if (error) throw new Error(error);
        if (text) {
          fullText += text;
          onText?.(text);
        }
      } catch (err) {
        if (err instanceof SyntaxError) continue; // malformed chunk — skip
        throw err;
      }
    }
  }
  return fullText;
}
