"use strict";

const crypto = require("crypto");
const githubApp = require("../../lib/github-app");
const { auditEvent, readJsonBody, sendJson } = require("../../lib/security");

function verifySignature(req, rawBody) {
  const secret = String(process.env.GITHUB_WEBHOOK_SECRET || "").trim();
  if (!secret) throw new Error("GITHUB_WEBHOOK_SECRET is not configured.");
  const signature = String(req.headers["x-hub-signature-256"] || "");
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed." }, { Allow: "POST" });
  }
  try {
    const rawBody = await readRawBody(req);
    if (!verifySignature(req, rawBody)) {
      await auditEvent("github.webhook_rejected", {}, req);
      return sendJson(res, 401, { error: "Invalid webhook signature." });
    }
    const payload = JSON.parse(rawBody.toString("utf8") || "{}");
    if (payload.action === "closed" && payload.pull_request?.merged) {
      const branch = String(payload.pull_request.head?.ref || "");
      if (/^content\/\d{4}-\d{2}-\d{2}\//.test(branch)) {
        await githubApp.deleteBranch(branch);
        await auditEvent("github.branch_deleted", { branch }, req);
      }
    }
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    await auditEvent("github.webhook_failed", { error: error.message || "Webhook failed." }, req);
    return sendJson(res, error.statusCode || 400, { error: error.message || "Webhook failed." });
  }
};
