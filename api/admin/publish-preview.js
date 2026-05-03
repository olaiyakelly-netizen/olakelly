"use strict";

const { getSession } = require("../../lib/admin-auth");
const { checkRateLimit, sendJson, validateOrigin } = require("../../lib/security");
const { getPreviewStatus } = require("../../lib/vercel-preview");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
  }
  try {
    validateOrigin(req, { requireOrigin: false });
    const session = await getSession(req, res, { respond: false });
    if (!session) return sendJson(res, 401, { error: "Unauthorized." });
    const requestUrl = new URL(req.url, "http://localhost");
    const branch = String(requestUrl.searchParams.get("branch") || "").trim();
    const startedAt = Number(requestUrl.searchParams.get("started_at") || Date.now());
    if (!branch || !/^content\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+$/i.test(branch)) {
      return sendJson(res, 400, { error: "A valid content branch is required." });
    }
    await checkRateLimit("previewPoll", `${session.id}:${branch}`);
    const status = await getPreviewStatus(branch, startedAt, req);
    return sendJson(res, 200, { ok: true, branch, ...status });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { error: error.message || "Unable to load publish preview." });
  }
};
