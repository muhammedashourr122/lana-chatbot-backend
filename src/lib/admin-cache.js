// Tiny in-memory TTL cache for the admin dashboard's expensive aggregate
// computation (N Easy Orders API calls, one per known order). Per-process
// only — fine at this scale, would need a shared store if this service
// ever ran multiple replicas.
const store = new Map();
const TTL_MS = 30 * 1000;

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry;
}

// Returns cached data if fresh, otherwise runs `computeFn` (deduping
// concurrent callers onto the same in-flight promise) and caches the result.
async function getOrCompute(key, computeFn) {
  const entry = get(key);
  if (entry) {
    return entry.inFlightPromise || entry.data;
  }

  const promise = computeFn().then((data) => {
    store.set(key, { data, expiresAt: Date.now() + TTL_MS });
    return data;
  });

  store.set(key, { inFlightPromise: promise, expiresAt: Date.now() + TTL_MS });
  return promise;
}

function invalidate(key) {
  store.delete(key);
}

module.exports = { getOrCompute, invalidate };
