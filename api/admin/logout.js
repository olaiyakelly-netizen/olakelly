"use strict";

const { clearSessionCookie, destroySession } = require("../../lib/admin-auth");
const { sendJson, validateCsrf, validateOrigin } = require("../../lib/security");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  try {
    validateOrigin(req);
    validateCsrf(req, null);
    await destroySession(req);
  } catch (_error) {
    // Logout should clear local credentials even when the session is already stale.
  }
  return sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
};
