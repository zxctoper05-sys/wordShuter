// Единственное место, где клиент общается с бэкендом.
export class ApiError extends Error {
  constructor(status, code) {
    super(code || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch { /* пустое тело */ }
  if (!res.ok) throw new ApiError(res.status, data?.error);
  return data;
}

export const api = {
  getDictionaries: () => request('/dictionaries').then((d) => d.dictionaries),
  fetchWords: (params) => request('/words/batch', { method: 'POST', body: params }).then((d) => d.words),
  saveGame: (game) => request('/games', { method: 'POST', body: game }),
  getStats: (playerId) => request(`/players/${encodeURIComponent(playerId)}/stats`),
};
