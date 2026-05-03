"use strict";

const { z } = require("zod");
const { renderPreviewHtml } = require("./_lib");
const { getSession } = require("../../lib/admin-auth");
const { secureAction } = require("../../lib/security");

const schema = z.object({}).passthrough();

module.exports = async function handler(req, res) {
  return secureAction(req, res, {
    method: "POST",
    schema,
    getSession,
    rateLimit: "preview",
    flag: "ADMIN_ENABLED",
    auditType: "admin.preview",
    handler: async ({ body }) => {
    const preview = renderPreviewHtml(body);
    return {
      html: preview.html,
      slug: preview.post.slug,
      reading_time: preview.post.reading_time,
      word_count: preview.post.word_count
    };
    }
  });
};
