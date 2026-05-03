"use strict";

const { getPostSourceBySlug, getRecentPosts, requireSession, sendJson } = require("./_lib");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  if (!await requireSession(req, res)) return;

  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const slug = String(requestUrl.searchParams.get("slug") || "").trim();

    if (!slug) {
      const recent_posts = await getRecentPosts(5);
      return sendJson(res, 200, { ok: true, recent_posts });
    }

    const post = await getPostSourceBySlug(slug);
    if (!post) {
      return sendJson(res, 404, { error: "No post found for that slug." });
    }

    return sendJson(res, 200, { ok: true, post });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || "Unable to load post." });
  }
};
