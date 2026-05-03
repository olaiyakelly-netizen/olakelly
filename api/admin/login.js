"use strict";

const { z } = require("zod");
const { fallbackLogin } = require("../../lib/admin-auth");
const { auditEvent, checkRateLimit, readJsonBody, sendJson, validateCsrf, validateOrigin } = require("../../lib/security");

const schema = z.object({
  password: z.string(),
  totp: z.string().optional().default("")
}).strict();

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    validateOrigin(req);
    validateCsrf(req, null);
    await checkRateLimit("login", String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"));
    const body = schema.parse(await readJsonBody(req));
    const result = await fallbackLogin(body.password, body.totp);
    await auditEvent("auth.login_success", { method: "fallback" }, req);
    return sendJson(res, 200, { ok: true, csrf: result.session.csrf }, { "Set-Cookie": result.cookies });
  } catch (error) {
    await auditEvent("auth.login_failed", { error: error.message || "Login failed." }, req);
    return sendJson(res, error.statusCode || 401, { error: error.message || "Invalid credentials." });
  }
};
