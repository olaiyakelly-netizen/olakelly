"use strict";

const { auditEvent } = require("./security");

const PREVIEW_TIMEOUT_MS = 3 * 60 * 1000;
const ELAPSED_VISIBLE_MS = 2 * 60 * 1000;

function getVercelConfig() {
  const token = String(process.env.VERCEL_API_TOKEN || "").trim();
  const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
  const teamId = String(process.env.VERCEL_ORG_ID || "").trim();
  if (!token || !projectId) {
    throw new Error("Vercel preview polling is not configured.");
  }
  return { token, projectId, teamId };
}

function getAllowedPreviewHosts() {
  return String(process.env.VERCEL_ALLOWED_PREVIEW_HOSTS || ".vercel.app")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
}

function validatePreviewUrl(value) {
  if (!value) return null;
  const url = value.startsWith("http") ? new URL(value) : new URL(`https://${value}`);
  const hostname = url.hostname.toLowerCase();
  const allowed = getAllowedPreviewHosts().some((host) => {
    if (host.startsWith(".")) return hostname.endsWith(host);
    return hostname === host;
  });
  if (!allowed) return null;
  return url.toString();
}

function mapDeploymentState(deployment) {
  if (!deployment) return "Preview queued";
  const state = String(deployment.readyState || deployment.status || "UNKNOWN").toUpperCase();
  if (["QUEUED", "INITIALIZING"].includes(state)) return "Preview queued";
  if (state === "BUILDING") return "Building";
  if (state === "READY") return "Ready";
  if (["ERROR", "CANCELED"].includes(state)) return "Failed";
  return "Preview queued";
}

async function getPreviewStatus(branch, startedAt, req) {
  const config = getVercelConfig();
  const searchParams = new URLSearchParams({
    projectId: config.projectId,
    branch,
    limit: "1"
  });
  if (config.teamId) searchParams.set("teamId", config.teamId);

  const response = await fetch(`https://api.vercel.com/v6/deployments?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    await auditEvent("preview.failed", { branch, status: response.status }, req);
    throw new Error(`Unable to fetch Vercel preview status (${response.status}).`);
  }

  const payload = await response.json();
  const deployment = Array.isArray(payload.deployments) ? payload.deployments[0] : null;
  const elapsedMs = Date.now() - Number(startedAt || Date.now());
  if (elapsedMs >= PREVIEW_TIMEOUT_MS && mapDeploymentState(deployment) !== "Ready") {
    await auditEvent("preview.stalled", { branch, elapsed_ms: elapsedMs }, req);
    return {
      state: "Stalled",
      elapsed_ms: elapsedMs,
      show_elapsed: true,
      message: "Preview deployment stalled after 3 minutes."
    };
  }

  const previewUrl = validatePreviewUrl(deployment?.url || "");
  return {
    state: mapDeploymentState(deployment),
    elapsed_ms: elapsedMs,
    show_elapsed: elapsedMs >= ELAPSED_VISIBLE_MS,
    deployment_id: deployment?.uid || deployment?.id || null,
    preview_url: previewUrl,
    invalid_preview_url: deployment?.url && !previewUrl ? deployment.url : null,
    ready_at: deployment?.ready || null,
    created_at: deployment?.createdAt || deployment?.created || null
  };
}

module.exports = {
  ELAPSED_VISIBLE_MS,
  PREVIEW_TIMEOUT_MS,
  getPreviewStatus,
  validatePreviewUrl
};
