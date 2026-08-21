const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const USERS_INDEX_KEY = "users-index";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SETTINGS_KEY = "settings:admin";

function userKey(username) {
  return `user:${username.toLowerCase().trim()}`;
}
function sessionKey(token) {
  return `session:${token}`;
}

async function bootstrapOwnerFromEnv() {
  const existing = await redis.smembers(USERS_INDEX_KEY);
  if (existing && existing.length > 0) return;

  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) {
    console.warn("[BOOTSTRAP] ADMIN_USER/ADMIN_PASS not set — no owner account created");
    return;
  }

  const username = user.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(pass, 10);
  await redis.hset(userKey(username), {
    username,
    passwordHash,
    role: "owner",
    createdAt: Date.now(),
  });
  await redis.sadd(USERS_INDEX_KEY, username);
  console.log(`[BOOTSTRAP] Created owner account "${username}" from ADMIN_USER/ADMIN_PASS`);
}

async function getUser(username) {
  if (!username) return null;
  const data = await redis.hgetall(userKey(username));
  if (!data || !data.username) return null;
  return data;
}

async function listUsers() {
  const usernames = await redis.smembers(USERS_INDEX_KEY);
  const users = await Promise.all(usernames.map((u) => getUser(u)));
  return users
    .filter(Boolean)
    .map((u) => ({ username: u.username, role: u.role, createdAt: u.createdAt }));
}

async function countOwners() {
  const users = await listUsers();
  return users.filter((u) => u.role === "owner").length;
}

async function createUser(username, password, role) {
  const clean = String(username || "").toLowerCase().trim();
  if (!clean) throw new Error("username is required");
  if (!password || password.length < 6) throw new Error("password must be at least 6 characters");
  if (!["owner", "moderator"].includes(role)) throw new Error("role must be owner or moderator");

  const existing = await getUser(clean);
  if (existing) throw new Error("username already exists");

  const passwordHash = await bcrypt.hash(password, 10);
  await redis.hset(userKey(clean), {
    username: clean,
    passwordHash,
    role,
    createdAt: Date.now(),
  });
  await redis.sadd(USERS_INDEX_KEY, clean);
  return { username: clean, role };
}

async function deleteUser(username) {
  const clean = String(username || "").toLowerCase().trim();
  const user = await getUser(clean);
  if (!user) throw new Error("user not found");

  if (user.role === "owner") {
    const owners = await countOwners();
    if (owners <= 1) throw new Error("cannot delete the last owner account");
  }

  await redis.del(userKey(clean));
  await redis.srem(USERS_INDEX_KEY, clean);
}

async function verifyLogin(username, password) {
  const user = await getUser(username);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { username: user.username, role: user.role };
}

async function createSession(username, role) {
  const token = crypto.randomBytes(32).toString("base64url");
  await redis.set(sessionKey(token), JSON.stringify({ username, role }), { ex: SESSION_TTL_SECONDS });
  return { token, ttlSeconds: SESSION_TTL_SECONDS };
}

async function getSession(token) {
  if (!token) return null;
  const raw = await redis.get(sessionKey(token));
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    return null;
  }
}

async function deleteSession(token) {
  if (!token) return;
  await redis.del(sessionKey(token));
}

const DEFAULT_SETTINGS = {
  staleHours: 48,
  pendingStaleHours: 24,
  silentDispatchHours: 24,
  lowStockThreshold: 5,
};

async function getSettings() {
  const raw = await redis.get(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

async function saveSettings(settings) {
  const merged = { ...DEFAULT_SETTINGS, ...settings, updatedAt: Date.now() };
  await redis.set(SETTINGS_KEY, JSON.stringify(merged));
  return merged;
}

module.exports = {
  bootstrapOwnerFromEnv,
  getUser,
  listUsers,
  createUser,
  deleteUser,
  verifyLogin,
  createSession,
  getSession,
  deleteSession,
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS,
};
