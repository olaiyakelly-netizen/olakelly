"use strict";

const { z } = require("zod");
const {
  auditEvent,
  checkRateLimit,
  readJsonBody,
  sendJson,
  validateCsrf,
  validateOrigin
} = require("../lib/security");

const schema = z.object({
  email: z.string().trim().email("A valid email is required."),
  source: z.string().trim().max(80).optional().default("unknown"),
  name: z.string().trim().max(120).optional().default("")
}).strict();

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  }

  if (String(process.env.FORMS_ENABLED || "true").toLowerCase() === "false") {
    await auditEvent("signup.disabled", {}, req);
    return sendJson(res, 423, { error: "Signup is temporarily disabled." });
  }

  const webhookUrl = String(process.env.PABBLY_SIGNUP_WEBHOOK_URL || "").trim();

  if (!webhookUrl) {
    return sendJson(res, 500, { error: "Signup webhook is not configured." });
  }

  try {
    validateOrigin(req);
    validateCsrf(req, null);
    await checkRateLimit("signup", String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown"));
    const body = schema.parse(await readJsonBody(req));
    const email = body.email.toLowerCase();
    const source = body.source || "unknown";
    const payload = { email, source };
    if (body.name) payload.name = body.name;

    const upstreamResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (upstreamResponse.status === 200) {
      await auditEvent("signup.success", { source }, req);
      return sendJson(res, 200, { ok: true });
    }

    await auditEvent("signup.failed", { source, status: upstreamResponse.status }, req);
    return sendJson(res, 502, { error: "Signup request failed." });
  } catch (error) {
    await auditEvent("signup.failed", { error: error.message || "Signup failed." }, req);
    return sendJson(res, error.statusCode || 400, { error: error.message || "Signup request failed." });
  }
};
