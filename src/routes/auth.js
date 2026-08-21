const express = require("express");
const {
  verifyLogin,
  createSession,
  getSession,
  deleteSession,
} = require("../lib/users-store");

const router = express.Router();

const COOKIE_NAME = "lana_admin_session";

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

function setSessionCookie(req, res, token, ttlSeconds) {
  const secure = req.secure ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlSeconds}${secure}`
  );
}

function clearSessionCookie(req, res) {
  const secure = req.secure ? "; Secure" : "";
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

// Attaches req.user = {username, role} if a valid session cookie is
// present; used by the /admin and /api/admin gate in server.js.
async function requireSession(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  const session = await getSession(token);

  if (!session) {
    // requireSession is mounted at both "/admin" and "/api/admin" via a
    // single app.use(["/admin","/api/admin"], requireSession) call, and
    // Express strips the matched mount prefix from req.path (but not
    // req.originalUrl) before this middleware runs — so req.path alone
    // can't reliably tell an API request apart from a page request here.
    if (req.originalUrl.startsWith("/api/")) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }
    return res.redirect("/admin/login");
  }

  req.user = session;
  req.sessionToken = token;
  next();
}

function requireOwner(req, res, next) {
  if (!req.user || req.user.role !== "owner") {
    return res.status(403).json({ success: false, error: "Owner only" });
  }
  next();
}

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "username and password are required" });
    }

    const user = await verifyLogin(username, password);
    if (!user) {
      return res.status(401).json({ success: false, error: "Invalid username or password" });
    }

    const { token, ttlSeconds } = await createSession(user.username, user.role);
    setSessionCookie(req, res, token, ttlSeconds);
    res.json({ success: true, username: user.username, role: user.role });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

router.post("/logout", async (req, res) => {
  try {
    const cookies = parseCookies(req);
    await deleteSession(cookies[COOKIE_NAME]);
    clearSessionCookie(req, res);
    res.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error.message);
    res.status(500).json({ success: false, error: "Logout failed" });
  }
});

const ALLOWED_STATUSES_BY_ROLE = {
  owner: [
    "pending", "confirmed", "pending_payment", "paid", "paid_failed",
    "processing", "waiting_for_pickup", "in_delivery", "delivered",
    "canceled", "returning_from_delivery", "request_refund",
    "refund_in_progress", "refunded",
  ],
  moderator: ["confirmed", "canceled"],
};

// Mounted separately (after the requireSession gate) in server.js since
// this route needs req.user, unlike /login and /logout above which must
// be reachable with no session yet.
function meHandler(req, res) {
  res.json({
    success: true,
    username: req.user.username,
    role: req.user.role,
    allowed_statuses: ALLOWED_STATUSES_BY_ROLE[req.user.role] || [],
  });
}

module.exports = router;
module.exports.requireSession = requireSession;
module.exports.requireOwner = requireOwner;
module.exports.parseCookies = parseCookies;
module.exports.ALLOWED_STATUSES_BY_ROLE = ALLOWED_STATUSES_BY_ROLE;
module.exports.meHandler = meHandler;
