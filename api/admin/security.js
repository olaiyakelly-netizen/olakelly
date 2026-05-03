"use strict";

const { getSession } = require("../../lib/admin-auth");
const {
  createCsrfCookie,
  createCsrfToken,
  createNonce,
  getHighSignalEvents,
  sendJson
} = require("../../lib/security");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
  }

  const session = await getSession(req, res, { respond: false });
  if (!session) {
    const csrf = createCsrfToken();
    return sendJson(res, 200, {
      ok: true,
      authenticated: false,
      csrf,
      flags: {
        admin_enabled: String(process.env.ADMIN_ENABLED || "true").toLowerCase() !== "false",
        publish_enabled: String(process.env.PUBLISH_ENABLED || "true").toLowerCase() !== "false",
        forms_enabled: String(process.env.FORMS_ENABLED || "true").toLowerCase() !== "false",
        builds_enabled: String(process.env.BUILDS_ENABLED || "true").toLowerCase() !== "false"
      },
      security_events: []
    }, { "Set-Cookie": createCsrfCookie(csrf) });
  }

  const nonce = await createNonce(session.id);
  const securityEvents = await getHighSignalEvents();
  return sendJson(res, 200, {
    ok: true,
    authenticated: true,
    csrf: session.csrf,
    nonce,
    flags: {
      admin_enabled: String(process.env.ADMIN_ENABLED || "true").toLowerCase() !== "false",
      publish_enabled: String(process.env.PUBLISH_ENABLED || "true").toLowerCase() !== "false",
      forms_enabled: String(process.env.FORMS_ENABLED || "true").toLowerCase() !== "false",
      builds_enabled: String(process.env.BUILDS_ENABLED || "true").toLowerCase() !== "false"
    },
    security_events: securityEvents
  });
};
