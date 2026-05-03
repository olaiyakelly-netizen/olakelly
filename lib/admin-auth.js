"use strict";

const crypto = require("crypto");
const { generateAuthenticationOptions, verifyAuthenticationResponse } = require("@simplewebauthn/server");
const { authenticator } = require("otplib");
const store = require("./security-store");
const {
  createCsrfCookie,
  createCsrfToken,
  hashPayload,
  parseCookieHeader
} = require("./security");

const COOKIE_NAME = "ideas_admin_session";
const SESSION_TTL_SECONDS = 60 * 45;

function getSessionSecret() {
  const secret = process.env.IDEAS_ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("IDEAS_ADMIN_SESSION_SECRET is not configured.");
  return secret;
}

function getRpId() {
  return String(process.env.WEBAUTHN_RP_ID || "olakelly.com").trim();
}

function getExpectedOrigins() {
  return String(process.env.WEBAUTHN_EXPECTED_ORIGINS || process.env.ADMIN_ALLOWED_ORIGINS || "https://olakelly.com")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function createSessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Max-Age=${SESSION_TTL_SECONDS}; Path=/; SameSite=Strict; Secure`;
}

async function createSession({ authMethod, email, deviceId }) {
  const sessionId = `sess_${crypto.randomBytes(18).toString("hex")}`;
  const csrf = createCsrfToken();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${expiresAt}.${sessionId}`;
  const token = `${payload}.${signSessionPayload(payload)}`;
  const session = {
    id: sessionId,
    email: email || process.env.IDEAS_ADMIN_EMAIL || "admin",
    authMethod,
    deviceId: deviceId || null,
    csrf,
    createdAt: Date.now(),
    expiresAt: expiresAt * 1000
  };
  await store.set(`session:${sessionId}`, session, SESSION_TTL_SECONDS);
  return {
    session,
    token,
    cookies: [createSessionCookie(token), createCsrfCookie(csrf)]
  };
}

async function getSession(req, res, options = {}) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const token = cookies[COOKIE_NAME];
  const [expiresAt, sessionId, signature] = String(token || "").split(".");
  const payload = `${expiresAt}.${sessionId}`;
  const expected = expiresAt && sessionId ? signSessionPayload(payload) : "";
  let validSignature = false;
  try {
    validSignature = Boolean(signature && expected && Buffer.byteLength(signature) === Buffer.byteLength(expected)
      && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected)));
  } catch (_error) {
    validSignature = false;
  }
  const isExpired = !expiresAt || Number(expiresAt) < Math.floor(Date.now() / 1000);
  if (!validSignature || isExpired) {
    if (options.respond !== false && res) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized." }));
    }
    return null;
  }
  const session = await store.get(`session:${sessionId}`);
  if (!session) return null;
  return session;
}

async function destroySession(req) {
  const cookies = parseCookieHeader(req.headers.cookie);
  const [, sessionId] = String(cookies[COOKIE_NAME] || "").split(".");
  if (sessionId) await store.del(`session:${sessionId}`);
}

function getConfiguredPasskeys() {
  const raw = String(process.env.WEBAUTHN_PASSKEYS_JSON || "").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function beginPasskeyAuth(session, context = {}) {
  const passkeys = getConfiguredPasskeys();
  if (!passkeys.length) {
    throw new Error("Passkeys are not configured. Set WEBAUTHN_PASSKEYS_JSON before enabling passkey auth.");
  }
  const options = await generateAuthenticationOptions({
    rpID: getRpId(),
    allowCredentials: passkeys.map((passkey) => ({
      id: passkey.id,
      transports: passkey.transports || ["internal", "hybrid"]
    })),
    userVerification: "required"
  });
  const challengeId = `webauthn_${crypto.randomBytes(18).toString("hex")}`;
  await store.set(`webauthn:${challengeId}`, {
    challenge: options.challenge,
    sessionId: session?.id || null,
    context
  }, 5 * 60);
  return { challenge_id: challengeId, options };
}

async function finishPasskeyAuth({ challengeId, response, session, context }) {
  const challengeRecord = await store.get(`webauthn:${challengeId}`);
  if (!challengeRecord) {
    throw new Error("Passkey challenge expired. Please try again.");
  }
  const passkeys = getConfiguredPasskeys();
  const passkey = passkeys.find((candidate) => candidate.id === response?.id);
  if (!passkey) {
    throw new Error("Passkey is not registered for this admin account.");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challengeRecord.challenge,
    expectedOrigin: getExpectedOrigins(),
    expectedRPID: getRpId(),
    requireUserVerification: true,
    credential: {
      id: passkey.id,
      publicKey: Uint8Array.from(Buffer.from(passkey.publicKey, "base64url")),
      counter: Number(passkey.counter || 0),
      transports: passkey.transports || ["internal", "hybrid"]
    }
  });

  if (!verification.verified) {
    throw new Error("Passkey verification failed.");
  }

  await store.del(`webauthn:${challengeId}`);

  if (session && context?.action) {
    const proof = `step_${crypto.randomBytes(18).toString("hex")}`;
    const contextHash = hashPayload({
      sessionId: session.id,
      action: context.action,
      method: context.method,
      route: context.route,
      target: context.target,
      payloadHash: context.payloadHash,
      nonce: context.nonce
    });
    await store.set(`stepup:${proof}`, {
      sessionId: session.id,
      contextHash,
      createdAt: Date.now()
    }, 5 * 60);
    return { verified: true, proof };
  }

  const created = await createSession({
    authMethod: "passkey",
    email: process.env.IDEAS_ADMIN_EMAIL || "admin",
    deviceId: response?.id || null
  });
  return { verified: true, ...created };
}

async function fallbackLogin(password, totp) {
  const expectedPassword = String(process.env.IDEAS_ADMIN_PASSWORD || "");
  const expectedTotpSecret = String(process.env.IDEAS_ADMIN_TOTP_SECRET || "");
  if (!expectedPassword || !expectedTotpSecret) {
    throw new Error("Fallback auth is not configured.");
  }
  const provided = Buffer.from(String(password || ""));
  const expected = Buffer.from(expectedPassword);
  const passwordMatches = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
  const totpMatches = authenticator.check(String(totp || ""), expectedTotpSecret);
  if (!passwordMatches || !totpMatches) {
    throw new Error("Invalid fallback credentials.");
  }
  return createSession({
    authMethod: "fallback",
    email: process.env.IDEAS_ADMIN_EMAIL || "admin",
    deviceId: "fallback"
  });
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Strict; Secure`;
}

module.exports = {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  beginPasskeyAuth,
  clearSessionCookie,
  createSession,
  destroySession,
  fallbackLogin,
  finishPasskeyAuth,
  getSession
};
