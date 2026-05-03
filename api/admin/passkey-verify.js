"use strict";

const { z } = require("zod");
const { finishPasskeyAuth, getSession } = require("../../lib/admin-auth");
const { readJsonBody, sendJson, validateCsrf, validateOrigin } = require("../../lib/security");

const schema = z.object({
  challenge_id: z.string(),
  response: z.any(),
  context: z.object({
    action: z.string().optional(),
    method: z.string().optional(),
    route: z.string().optional(),
    target: z.string().optional(),
    payloadHash: z.string().optional(),
    nonce: z.string().optional()
  }).optional().default({})
}).strict();

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  }
  try {
    validateOrigin(req);
    const session = await getSession(req, res, { respond: false });
    validateCsrf(req, session);
    const body = schema.parse(await readJsonBody(req));
    const result = await finishPasskeyAuth({
      challengeId: body.challenge_id,
      response: body.response,
      session,
      context: body.context
    });
    const headers = result.cookies ? { "Set-Cookie": result.cookies } : {};
    return sendJson(res, 200, {
      ok: true,
      csrf: result.session?.csrf,
      proof: result.proof || null
    }, headers);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { error: error.message || "Passkey verification failed." });
  }
};
