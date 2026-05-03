"use strict";

const crypto = require("crypto");
const { z } = require("zod");
const store = require("./security-store");

const CSRF_COOKIE = "ideas_admin_csrf";
const AUDIT_KEY = "audit:events";
const AUDIT_UI_KEY = "audit:events:ui";
const AUDIT_TTL_SECONDS = 60 * 60 * 24 * 30;
const AUDIT_UI_TTL_SECONDS = 60 * 60;
const MAX_BODY_BYTES = 1024 * 1024 * 2;

const RATE_LIMITS = {
  login: { limit: 5, windowSeconds: 15 * 60 },
  fallback: { limit: 3, windowSeconds: 15 * 60 },
  publish: { limit: 5, windowSeconds: 60 * 60 },
  draft: { limit: 60, windowSeconds: 60 * 60 },
  preview: { limit: 120, windowSeconds: 60 * 60 },
  previewPoll: { limit: 1, windowSeconds: 5 },
  signup: { limit: 5, windowSeconds: 60 * 60 }
};

const ALERT_THRESHOLDS = {
  "auth.login_failed": { limit: 5, windowSeconds: 15 * 60 },
  "security.replay_blocked": { limit: 2, windowSeconds: 5 * 60 },
  "security.csrf_failed": { limit: 3, windowSeconds: 10 * 60 },
  "security.origin_blocked": { limit: 3, windowSeconds: 10 * 60 },
  "security.ip_blocked": { limit: 3, windowSeconds: 10 * 60 },
  "publish.disabled": { limit: 1, windowSeconds: 60 },
  "preview.failed": { limit: 2, windowSeconds: 10 * 60 },
  "preview.stalled": { limit: 2, windowSeconds: 10 * 60 }
};

const HIGH_SIGNAL_EVENTS = new Set([
  "auth.login_failed",
  "security.replay_blocked",
  "security.csrf_failed",
  "security.origin_blocked",
  "security.ip_blocked",
  "publish.disabled",
  "preview.failed",
  "preview.stalled"
]);

function createId(prefix) {
  return `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
}

function hashPayload(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value || {})).digest("hex");
}

function getClientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "")
    .split(",")[0]
    .trim();
}

function parseCookieHeader(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const separator = item.indexOf("=");
      if (separator === -1) return cookies;
      cookies[item.slice(0, separator)] = decodeURIComponent(item.slice(separator + 1));
      return cookies;
    }, {});
}

function getAllowedOrigins() {
  return String(process.env.ADMIN_ALLOWED_ORIGINS || "https://olakelly.com,http://localhost:3000,http://localhost:8080,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function getAllowedIpRanges() {
  return String(process.env.ADMIN_ALLOWED_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
}

function sendJson(res, statusCode, payload, headers = {}) {
  Object.entries({
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  }).forEach(([key, value]) => res.setHeader(key, value));
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        const error = new Error("Request body is too large.");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_error) {
        const error = new Error("Request body must be valid JSON.");
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

async function auditEvent(type, details = {}, req) {
  const event = {
    id: createId("evt"),
    type,
    timestamp: new Date().toISOString(),
    ip: req ? getClientIp(req) : null,
    path: req?.url || null,
    details
  };
  await store.pushCapped(AUDIT_KEY, event, 1000, AUDIT_TTL_SECONDS);
  if (HIGH_SIGNAL_EVENTS.has(type)) {
    await store.pushCapped(AUDIT_UI_KEY, event, 10, AUDIT_UI_TTL_SECONDS);
  }
  await maybeAlert(type, event);
  return event;
}

async function maybeAlert(type, event) {
  const threshold = ALERT_THRESHOLDS[type];
  if (!threshold) return;
  const count = await store.incr(`alert:${type}:${Math.floor(Date.now() / (threshold.windowSeconds * 1000))}`, threshold.windowSeconds);
  if (count < threshold.limit) return;

  const webhookUrl = String(process.env.SECURITY_ALERT_WEBHOOK_URL || "").trim();
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `Security alert: ${type}`,
        event
      })
    });
  } catch (_error) {
    // Alert delivery must never break the protected action.
  }
}

async function getHighSignalEvents() {
  const events = await store.list(AUDIT_UI_KEY, 0, 9);
  const cutoff = Date.now() - AUDIT_UI_TTL_SECONDS * 1000;
  return events.filter((event) => new Date(event.timestamp).getTime() >= cutoff);
}

function createCsrfToken() {
  return createId("csrf");
}

function createCsrfCookie(token) {
  return `${CSRF_COOKIE}=${encodeURIComponent(token)}; Max-Age=${60 * 60}; Path=/; SameSite=Strict; Secure`;
}

function validateOrigin(req, { requireOrigin = true } = {}) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin && !requireOrigin) return;
  if (!origin || !getAllowedOrigins().includes(origin)) {
    const error = new Error("Request origin is not allowed.");
    error.statusCode = 403;
    error.auditType = "security.origin_blocked";
    throw error;
  }
}

function validateIp(req) {
  const allowed = getAllowedIpRanges();
  if (!allowed.length) return;
  const ip = getClientIp(req);
  if (!allowed.includes(ip)) {
    const error = new Error("Request IP is not allowed.");
    error.statusCode = 403;
    error.auditType = "security.ip_blocked";
    throw error;
  }
}

function validateCsrf(req, session) {
  const headerToken = String(req.headers["x-csrf-token"] || "").trim();
  const cookies = parseCookieHeader(req.headers.cookie);
  const expected = session?.csrf || cookies[CSRF_COOKIE];
  if (!headerToken || !expected || headerToken !== expected) {
    const error = new Error("CSRF validation failed.");
    error.statusCode = 403;
    error.auditType = "security.csrf_failed";
    throw error;
  }
}

async function createNonce(sessionId) {
  const nonce = createId("nonce");
  await store.set(`nonce:${nonce}`, { sessionId, createdAt: Date.now() }, 5 * 60);
  return nonce;
}

async function consumeNonce(nonce, sessionId) {
  const key = `nonce:${nonce}`;
  const record = await store.get(key);
  if (!record || record.sessionId !== sessionId) {
    const error = new Error("Request nonce is invalid or has already been used.");
    error.statusCode = 409;
    error.auditType = "security.replay_blocked";
    throw error;
  }
  await store.del(key);
}

async function checkRateLimit(bucket, key) {
  const config = RATE_LIMITS[bucket];
  if (!config) return;
  const count = await store.incr(`rate:${bucket}:${key}`, config.windowSeconds);
  if (count > config.limit) {
    const error = new Error("Too many requests. Please wait and try again.");
    error.statusCode = 429;
    throw error;
  }
}

function isFlagEnabled(flagName) {
  if (!flagName) return true;
  return String(process.env[flagName] || "true").toLowerCase() !== "false";
}

function enforceFlag(flagName) {
  if (isFlagEnabled(flagName)) return;
  const error = new Error(`${flagName} is disabled.`);
  error.statusCode = 423;
  error.auditType = flagName === "PUBLISH_ENABLED" ? "publish.disabled" : "security.flag_blocked";
  throw error;
}

async function requireStepUp(session, context) {
  if (!context) return;
  const key = `stepup:${context.proof || ""}`;
  const grant = await store.get(key);
  if (!grant) {
    const error = new Error("Passkey step-up is required before publishing.");
    error.statusCode = 403;
    throw error;
  }
  const expectedHash = hashPayload({
    sessionId: session.id,
    action: context.action,
    method: context.method,
    route: context.route,
    target: context.target,
    payloadHash: context.payloadHash,
    nonce: context.nonce
  });
  if (grant.contextHash !== expectedHash) {
    const error = new Error("Step-up proof does not match this publish request.");
    error.statusCode = 403;
    throw error;
  }
  await store.del(key);
}

async function secureAction(req, res, options) {
  const {
    method = "POST",
    schema,
    requireAuth = true,
    csrf = true,
    nonce = true,
    origin = true,
    ip = true,
    rateLimit,
    flag,
    auditType,
    getStepUpContext,
    getSession,
    handler
  } = options;

  try {
    if (req.method !== method) {
      return sendJson(res, 405, { error: "Method not allowed." }, { Allow: method });
    }
    if (origin) validateOrigin(req);
    if (ip) validateIp(req);
    enforceFlag(flag);

    const session = requireAuth ? await getSession(req, res, { respond: false }) : null;
    if (requireAuth && !session) {
      return sendJson(res, 401, { error: "Unauthorized." });
    }
    if (csrf) validateCsrf(req, session);

    let body = method === "GET" ? {} : await readJsonBody(req);
    if (schema) {
      body = schema.parse(body);
    }

    const requestNonce = String(req.headers["x-request-nonce"] || "").trim();
    if (nonce) {
      if (!requestNonce) {
        const error = new Error("Request nonce is required.");
        error.statusCode = 409;
        error.auditType = "security.replay_blocked";
        throw error;
      }
      await consumeNonce(requestNonce, session?.id || "public");
    }

    if (rateLimit) {
      const key = session?.id || getClientIp(req) || "unknown";
      await checkRateLimit(rateLimit, key);
    }

    if (getStepUpContext) {
      await requireStepUp(session, getStepUpContext({ body, session, nonce: requestNonce, req }));
    }

    const result = await handler({ body, session, nonce: requestNonce });
    if (auditType) await auditEvent(auditType, { ok: true }, req);
    return sendJson(res, 200, result);
  } catch (error) {
    const details = { error: error.message || "Request failed." };
    if (error.auditType) await auditEvent(error.auditType, details, req);
    else if (auditType) await auditEvent(`${auditType}.failed`, details, req);
    const message = error instanceof z.ZodError
      ? error.issues.map((issue) => issue.message).join(" ")
      : (error.message || "Request failed.");
    return sendJson(res, error.statusCode || 400, { error: message });
  }
}

module.exports = {
  CSRF_COOKIE,
  checkRateLimit,
  createCsrfCookie,
  createCsrfToken,
  createNonce,
  getClientIp,
  getHighSignalEvents,
  hashPayload,
  parseCookieHeader,
  readJsonBody,
  secureAction,
  sendJson,
  auditEvent,
  validateCsrf,
  validateOrigin
};
