"use strict";

const { z } = require("zod");
const { saveDraftToBlob } = require("./_lib");
const { getSession } = require("../../lib/admin-auth");
const { secureAction } = require("../../lib/security");
const { validatePostPayload } = require("../../lib/content-policy");

const schema = z.object({}).passthrough();

module.exports = async function handler(req, res) {
  return secureAction(req, res, {
    method: "POST",
    schema,
    getSession,
    rateLimit: "draft",
    flag: "ADMIN_ENABLED",
    auditType: "admin.draft",
    handler: async ({ body }) => {
    validatePostPayload(body);
    const draft = await saveDraftToBlob(body);
    return {
      ok: true,
      mode: "draft",
      id: draft.id,
      draft_id: draft.draft_id,
      slug: draft.slug,
      published_slug: draft.published_slug,
      updated_at: draft.updated_at,
      message: "Draft saved securely."
    };
    }
  });
};
