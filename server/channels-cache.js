/** In-memory кеш ответа GET /api/channels (список редко меняется). */
const TTL_MS = 30 * 60 * 1000;

const cache = new Map();

function key(tokenHash, includeAvatars, userId) {
  return `${tokenHash}:${includeAvatars ? '1' : '0'}:${userId}`;
}

export function getChannelsListCache(tokenHash, includeAvatars, userId) {
  if (!tokenHash || tokenHash === 'default') return undefined;
  const k = key(tokenHash, includeAvatars, userId);
  const entry = cache.get(k);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(k);
    return undefined;
  }
  return entry.value;
}

export function setChannelsListCache(tokenHash, includeAvatars, userId, value) {
  if (!tokenHash || tokenHash === 'default') return;
  const k = key(tokenHash, includeAvatars, userId);
  cache.set(k, { value, expiresAt: Date.now() + TTL_MS });
}

/** Сбросить все варианты списка для данного бота (после CRUD каналов). */
export function invalidateChannelsListCache(tokenHash) {
  if (!tokenHash || tokenHash === 'default') {
    cache.clear();
    return;
  }
  const prefix = `${tokenHash}:`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
