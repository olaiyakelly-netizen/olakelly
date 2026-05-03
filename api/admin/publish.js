"use strict";

const { z } = require("zod");
const { publishPostToGitHub } = require("./_lib");
const { getSession } = require("../../lib/admin-auth");
const { hashPayload, secureAction } = require("../../lib/security");
const { validatePostPayload } = require("../../lib/content-policy");

const schema = z.object({}).passthrough();

module.exports = async function handler(req, res) {
  return secureAction(req, res, {
    method: "POST",
    schema,
    getSession,
    rateLimit: "publish",
    flag: "PUBLISH_ENABLED",
    auditType: "publish.pr",
    getStepUpContext: ({ body, session, nonce }) => {
      const stepUpProof = String(body.step_up_proof || "");
      const payload = { ...body };
      delete payload.step_up_proof;
      const validated = validatePostPayload(payload);
      return {
        proof: stepUpProof,
        action: "publish",
        method: "POST",
        route: "/api/admin/publish",
        target: validated.slug || validated.title,
        payloadHash: hashPayload(payload),
        nonce
      };
    },
    handler: async ({ body }) => {
    const payload = { ...body };
    delete payload.step_up_proof;
    const result = await publishPostToGitHub(payload);
    return {
      ok: true,
      mode: "publish",
      ...result
    };
    }
  });
};
