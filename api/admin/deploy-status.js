"use strict";

const { getLatestVercelDeploymentStatus, requireSession, sendJson } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }
  if (!await requireSession(req, res)) return;

  try {
    const status = await getLatestVercelDeploymentStatus();
    return sendJson(res, 200, { ok: true, ...status });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { error: error.message || "Unable to load deployment status." });
  }
};
