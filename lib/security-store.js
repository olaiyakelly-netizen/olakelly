"use strict";

const memoryStore = new Map();

function now() {
  return Date.now();
}

function hasKvConfig() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

function getKv() {
  if (!hasKvConfig()) return null;
  try {
    return require("@vercel/kv").kv;
  } catch (_error) {
    return null;
  }
}

function pruneMemoryKey(key) {
  const entry = memoryStore.get(key);
  if (entry && entry.expiresAt && entry.expiresAt <= now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry;
}

async function get(key) {
  const kv = getKv();
  if (kv) return kv.get(key);
  const entry = pruneMemoryKey(key);
  return entry ? entry.value : null;
}

async function set(key, value, ttlSeconds) {
  const kv = getKv();
  if (kv) {
    if (ttlSeconds) return kv.set(key, value, { ex: ttlSeconds });
    return kv.set(key, value);
  }
  memoryStore.set(key, {
    value,
    expiresAt: ttlSeconds ? now() + ttlSeconds * 1000 : null
  });
  return value;
}

async function del(key) {
  const kv = getKv();
  if (kv) return kv.del(key);
  memoryStore.delete(key);
  return 1;
}

async function incr(key, ttlSeconds) {
  const kv = getKv();
  if (kv) {
    const value = await kv.incr(key);
    if (value === 1 && ttlSeconds) await kv.expire(key, ttlSeconds);
    return value;
  }
  const entry = pruneMemoryKey(key);
  const value = Number(entry ? entry.value : 0) + 1;
  memoryStore.set(key, {
    value,
    expiresAt: entry?.expiresAt || (ttlSeconds ? now() + ttlSeconds * 1000 : null)
  });
  return value;
}

async function pushCapped(key, value, maxItems, ttlSeconds) {
  const kv = getKv();
  if (kv) {
    await kv.lpush(key, value);
    await kv.ltrim(key, 0, maxItems - 1);
    if (ttlSeconds) await kv.expire(key, ttlSeconds);
    return;
  }
  const entry = pruneMemoryKey(key);
  const list = Array.isArray(entry?.value) ? entry.value : [];
  list.unshift(value);
  memoryStore.set(key, {
    value: list.slice(0, maxItems),
    expiresAt: ttlSeconds ? now() + ttlSeconds * 1000 : entry?.expiresAt || null
  });
}

async function list(key, start = 0, stop = -1) {
  const kv = getKv();
  if (kv) return kv.lrange(key, start, stop);
  const entry = pruneMemoryKey(key);
  const listValue = Array.isArray(entry?.value) ? entry.value : [];
  return stop === -1 ? listValue.slice(start) : listValue.slice(start, stop + 1);
}

module.exports = {
  del,
  get,
  incr,
  list,
  pushCapped,
  set
};
