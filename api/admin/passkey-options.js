"use strict";

const { z } = require("zod");
const { beginPasskeyAuth, getSession } = require("../../lib/admin-auth");
const { readJsonBody, sendJson, validateCsrf, validateOrigin } = require("../../lib/security");

const schema = z.object({
  action: z.string().optional().default("login"),
  method: z.string().optional().default("POST"),
  route: z.string().optional().default("/api/admin/passkey-verify"),
  target: z.string().optional().default(""),
  payload_hash: z.string().optional().default(""),
  nonce: z.string().optional().default("")
}).strict();

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  }
  try {
    validateOrigin(req);
    validateCsrf(req, await getSession(req, res, { respond: false }));
    const body = schema.parse(await readJsonBody(req));
    const session = await getSession(req, res, { respond: false });
    const context = body.action === "login" ? {} : {
      action: body.action,
      method: body.method,
      route: body.route,
      target: body.target,
      payloadHash: body.payload_hash,
      nonce: body.nonce
    };
    const result = await beginPasskeyAuth(session, context);
    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { error: error.message || "Unable to begin passkey auth." });
  }
};
