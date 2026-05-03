"use strict";

const crypto = require("crypto");
const path = require("path");
const matter = require("gray-matter");
const { computePost, renderPostPage, serializeFrontMatter } = require("../../lib/blog");
const githubApp = require("../../lib/github-app");
const { validatePostPayload } = require("../../lib/content-policy");
const { hashPayload } = require("../../lib/security");
const {
  COOKIE_NAME,
  SESSION_TTL_SECONDS,
  getSession
} = require("../../lib/admin-auth");

const DRAFT_SCHEMA_VERSION = 1;

function sendJson(res, statusCode, payload, headers = {}) {
  Object.entries({
    "Content-Type": "application/json; charset=utf-8",
    ...headers
  }).forEach(([key, value]) => res.setHeader(key, value));
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function createSessionToken(secret) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${expiresAt}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

function verifySessionToken(token, secret) {
  if (!token || !secret) return false;
  const [expiresAt, signature] = String(token).split(".");
  if (!expiresAt || !signature) return false;
  if (Number(expiresAt) < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac("sha256", secret).update(expiresAt).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (_error) {
    return false;
  }
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) return accumulator;
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      accumulator[key] = decodeURIComponent(value);
      return accumulator;
    }, {});
}

async function requireSession(req, res) {
  const session = await getSession(req, res, { respond: false });
  if (!session) {
    sendJson(res, 401, { error: "Unauthorized." });
    return false;
  }
  return session;
}

function derivePreviewExcerpt(content) {
  return String(content || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(^|\n)\s{0,3}(#{1,6}|\*|-|\+|\d+\.)\s+/g, " ")
    .replace(/(^|\n)\s{0,3}>\s?/g, " ")
    .replace(/[*_~>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function buildPreviewPost(body) {
  const previewExcerpt = String(body.excerpt || "").trim() || derivePreviewExcerpt(body.content);

  return computePost(
    {
      id: body.id || `preview-${Date.now()}`,
      title: body.title,
      subtitle: body.subtitle,
      slug: body.slug || body.title,
      status: body.status || "draft",
      featured: Boolean(body.featured),
      homepage_featured: Boolean(body.homepage_featured),
      homepage_order: body.homepage_order,
      date: body.date || new Date().toISOString(),
      updated: new Date().toISOString(),
      category: body.category,
      category_slug: body.category_slug,
      tags: body.tags || [],
      excerpt: previewExcerpt,
      intent: body.intent || "",
      seo_title: body.seo_title || body.title,
      seo_description: body.seo_description || previewExcerpt,
      canonical_url: body.canonical_url || "",
      show_date: body.show_date !== false,
      show_updated_date: Boolean(body.show_updated_date),
      cover_image: body.cover_image || "",
      cover_image_alt: body.cover_image_alt || "",
      related_posts: body.related_posts || []
    },
    body.content || ""
  );
}

function renderPreviewHtml(body) {
  const previewPost = buildPreviewPost(body);
  return {
    post: previewPost,
    html: renderPostPage(previewPost, [])
  };
}

function getBlobClient() {
  try {
    return require("@vercel/blob");
  } catch (_error) {
    throw new Error("Draft storage requires the @vercel/blob package to be installed.");
  }
}

function getGitHubConfig() {
  const config = githubApp.requireConfig();
  return {
    owner: config.owner,
    repo: config.repo,
    branch: config.baseBranch
  };
}

function createGitHubApiUrl(resourcePath) {
  const { owner, repo } = getGitHubConfig();
  return `https://api.github.com/repos/${owner}/${repo}/${resourcePath.replace(/^\/+/, "")}`;
}

async function githubApiRequest(resourcePath, options = {}) {
  return githubApp.githubRequest(resourcePath, options);
}

async function assertGitHubBranchExists() {
  const { branch } = getGitHubConfig();
  await githubApiRequest(`branches/${encodeURIComponent(branch)}`);
}

async function githubContentsRequest(filePath, method = "GET", body, options = {}) {
  const { branch } = getGitHubConfig();
  const normalizedPath = filePath.replace(/\\/g, "/");
  const resourcePath = method === "GET"
    ? `contents/${normalizedPath}?ref=${encodeURIComponent(branch)}`
    : `contents/${normalizedPath}`;

  return githubApp.githubRequest(resourcePath, {
    method,
    allowNotFound: options.allowNotFound,
    body: method === "GET" ? undefined : { branch, ...body }
  });
}

async function getGitHubFile(filePath) {
  return githubApp.getFile(filePath, getGitHubConfig().branch);
}

async function putGitHubFile(filePath, content, message, sha) {
  return githubApp.putFile(filePath, content, message, getGitHubConfig().branch, sha);
}

async function deleteGitHubFile(filePath, message, sha) {
  if (!sha) {
    const existing = await getGitHubFile(filePath);
    if (!existing) return null;
    sha = existing.sha;
  }
  return githubApp.deleteFile(filePath, message, getGitHubConfig().branch, sha);
}

function parseExistingSource(source) {
  const separator = "\n---\n";
  const secondIndex = source.indexOf(separator, 4);
  if (secondIndex === -1) return {};
  return matter(source).data;
}

function parsePostSource(source) {
  const parsed = matter(String(source || ""));
  const frontMatter = parsed.data || {};

  return {
    id: String(frontMatter.id || "").trim(),
    title: String(frontMatter.title || "").trim(),
    subtitle: String(frontMatter.subtitle || "").trim(),
    slug: String(frontMatter.slug || "").trim(),
    status: String(frontMatter.status || "draft").trim(),
    featured: Boolean(frontMatter.featured),
    homepage_featured: Boolean(frontMatter.homepage_featured),
    homepage_order: Number.isFinite(Number(frontMatter.homepage_order)) ? Number(frontMatter.homepage_order) : null,
    date: String(frontMatter.date || "").slice(0, 10),
    updated: String(frontMatter.updated || "").trim(),
    category: String(frontMatter.category || "").trim(),
    category_slug: String(frontMatter.category_slug || "").trim(),
    tags: Array.isArray(frontMatter.tags) ? frontMatter.tags : [],
    excerpt: String(frontMatter.excerpt || "").trim(),
    intent: String(frontMatter.intent || "").trim(),
    seo_title: String(frontMatter.seo_title || "").trim(),
    seo_description: String(frontMatter.seo_description || "").trim(),
    canonical_url: String(frontMatter.canonical_url || "").trim(),
    show_date: frontMatter.show_date !== false,
    show_updated_date: Boolean(frontMatter.show_updated_date),
    cover_image: String(frontMatter.cover_image || "").trim(),
    cover_image_alt: String(frontMatter.cover_image_alt || "").trim(),
    related_posts: Array.isArray(frontMatter.related_posts) ? frontMatter.related_posts : [],
    content: String(parsed.content || "").trim()
  };
}

async function listGitHubPostFiles() {
  const response = await githubContentsRequest("content/posts", "GET", undefined, { allowNotFound: true });
  if (!Array.isArray(response)) return [];
  return response
    .filter((entry) => entry && entry.type === "file" && /\.md$/i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: entry.path || `content/posts/${entry.name}`
    }));
}

async function getPostSourceBySlug(slug) {
  const normalizedSlug = String(slug || "").trim();
  if (!normalizedSlug) return null;
  const sourceFile = await getGitHubFile(`content/posts/${normalizedSlug}.md`);
  if (!sourceFile) return null;
  return parsePostSource(sourceFile.content);
}

async function getRecentPosts(limit = 5) {
  const files = await listGitHubPostFiles();
  const sources = await Promise.all(
    files.map(async (file) => {
      const sourceFile = await getGitHubFile(file.path);
      if (!sourceFile) return null;
      const post = parsePostSource(sourceFile.content);
      return {
        title: post.title,
        slug: post.slug,
        status: post.status,
        date: post.date
      };
    })
  );

  return sources
    .filter((post) => post && post.slug && post.title && post.date)
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, limit);
}

async function getAllPostSources() {
  const files = await listGitHubPostFiles();
  const posts = await Promise.all(
    files.map(async (file) => {
      const sourceFile = await getGitHubFile(file.path);
      if (!sourceFile) return null;
      const post = parsePostSource(sourceFile.content);
      return {
        filePath: file.path,
        ...post
      };
    })
  );

  return posts.filter(Boolean);
}

async function normalizeHomepageOrdering(nextPost, originalSlug) {
  const shouldPosition = nextPost.homepage_featured && Number.isInteger(nextPost.homepage_order) && nextPost.homepage_order >= 1 && nextPost.homepage_order <= 3;
  if (!shouldPosition) {
    return [];
  }

  const allPosts = await getAllPostSources();
  const competingPosts = allPosts
    .filter((post) => post.slug !== nextPost.slug && post.slug !== originalSlug)
    .filter((post) => post.homepage_featured && Number.isInteger(post.homepage_order) && post.homepage_order >= 1)
    .sort((left, right) => left.homepage_order - right.homepage_order);

  const reordered = [];
  const seenSlugs = new Set();

  competingPosts.forEach((post) => {
    if (!seenSlugs.has(post.slug)) {
      reordered.push({
        ...post,
        homepage_featured: true,
        homepage_order: post.homepage_order
      });
      seenSlugs.add(post.slug);
    }
  });

  const insertIndex = Math.max(0, Math.min(nextPost.homepage_order - 1, reordered.length));
  reordered.splice(insertIndex, 0, { slug: nextPost.slug });

  const updates = [];

  reordered.forEach((entry, index) => {
    const position = index + 1;
    if (entry.slug === nextPost.slug) return;
    const sourcePost = competingPosts.find((post) => post.slug === entry.slug);
    if (!sourcePost) return;

    const nextHomepageFeatured = position <= 3;
    const nextHomepageOrder = nextHomepageFeatured ? position : null;

    if (sourcePost.homepage_featured !== nextHomepageFeatured || sourcePost.homepage_order !== nextHomepageOrder) {
      updates.push({
        ...sourcePost,
        homepage_featured: nextHomepageFeatured,
        homepage_order: nextHomepageOrder
      });
    }
  });

  return updates;
}

async function updateRedirectsIfNeeded(originalSlug, nextSlug, commitMessage) {
  if (!originalSlug || !nextSlug || originalSlug === nextSlug) return null;
  const redirectsPath = "content/redirects.json";
  const existingRedirects = await getGitHubFile(redirectsPath);
  const payload = existingRedirects ? JSON.parse(existingRedirects.content) : { redirects: [] };
  const filtered = Array.isArray(payload.redirects) ? payload.redirects.filter((entry) => entry && entry.from !== originalSlug) : [];
  filtered.push({ from: originalSlug, to: nextSlug });
  return putGitHubFile(
    redirectsPath,
    JSON.stringify({ redirects: filtered }, null, 2),
    commitMessage,
    existingRedirects ? existingRedirects.sha : undefined
  );
}

function decodeDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(String(dataUrl || ""));
  if (!match) return null;
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

function extensionFromMimeType(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/gif") return "gif";
  return "bin";
}

function getDraftId(body) {
  return String(body.draft_id || crypto.randomUUID()).trim();
}

function buildDraftPayload(body, draftId, overrides = {}) {
  const updatedAt = overrides.updated_at || new Date().toISOString();
  return {
    version: DRAFT_SCHEMA_VERSION,
    id: String(overrides.id ?? body.id ?? "").trim(),
    draft_id: draftId,
    title: String(overrides.title ?? body.title ?? "").trim(),
    slug: String(overrides.slug ?? body.slug ?? body.title ?? "").trim(),
    published_slug: String(overrides.published_slug ?? body.published_slug ?? "").trim() || null,
    status: String(overrides.status ?? body.status ?? "draft").trim(),
    updated_at: updatedAt,
    payload: {
      ...body,
      draft_id: draftId,
      published_slug: String(overrides.published_slug ?? body.published_slug ?? "").trim() || null
    }
  };
}

async function saveDraftToBlob(body, overrides = {}) {
  const { put } = getBlobClient();
  const draftId = getDraftId({ ...body, draft_id: overrides.draft_id || body.draft_id });
  const draft = buildDraftPayload(body, draftId, overrides);
  const pathname = `drafts/posts/${draftId}.json`;

  await put(pathname, JSON.stringify(draft, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false
  });

  return draft;
}

function buildPublishPost(body, publishedAt) {
  return computePost(
    {
      id: String(body.id || body.draft_id || `ideas-${Date.now()}`).trim(),
      title: body.title,
      subtitle: body.subtitle,
      slug: body.slug || body.title,
      status: body.status,
      featured: Boolean(body.featured),
      homepage_featured: Boolean(body.homepage_featured),
      homepage_order: body.homepage_order,
      date: body.date || publishedAt,
      updated: publishedAt,
      category: body.category,
      category_slug: body.category_slug,
      tags: body.tags || [],
      excerpt: body.excerpt,
      intent: body.intent || "",
      seo_title: body.seo_title || `${body.title} | Ola Kelly`,
      seo_description: body.seo_description || body.excerpt,
      canonical_url: body.canonical_url || "",
      show_date: body.show_date !== false,
      show_updated_date: Boolean(body.show_updated_date),
      cover_image: body.cover_image || "",
      cover_image_alt: body.cover_image_alt || "",
      related_posts: body.related_posts || []
    },
    body.content || ""
  );
}

function buildPublishCommitMessage(post) {
  return `Publish: ${post.title} (${post.slug})`;
}

function createConflictError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function isSameLineage(existingPost, nextPost, publishedSlug) {
  if (!existingPost) return false;
  if (existingPost.id && nextPost.id && existingPost.id === nextPost.id) return true;
  if (publishedSlug && existingPost.slug === publishedSlug) return true;
  return false;
}

function isLegacyDraftMatch(existingPost, nextPost, requestedPublishedSlug) {
  if (!existingPost || requestedPublishedSlug) return false;

  const existingTitle = String(existingPost.title || "").trim().toLowerCase();
  const nextTitle = String(nextPost.title || "").trim().toLowerCase();
  const existingSlug = String(existingPost.slug || "").trim();
  const nextSlug = String(nextPost.slug || "").trim();

  return Boolean(existingSlug && nextSlug && existingSlug === nextSlug && existingTitle && nextTitle && existingTitle === nextTitle);
}

function extractCommitInfo(result) {
  if (!result || !result.commit) return { commit_sha: null, commit_url: null };
  return {
    commit_sha: result.commit.sha || null,
    commit_url: result.commit.html_url || null
  };
}

function getVercelApiConfig() {
  const token = String(process.env.VERCEL_API_TOKEN || "").trim();
  const projectId = String(process.env.VERCEL_PROJECT_ID || "").trim();
  const teamId = String(process.env.VERCEL_ORG_ID || "").trim();

  if (!token || !projectId) {
    return null;
  }

  return { token, projectId, teamId };
}

async function getLatestVercelDeploymentStatus() {
  const config = getVercelApiConfig();
  if (!config) {
    return {
      deployment_status_available: false,
      deployment_status_message: "VERCEL_API_TOKEN or VERCEL_PROJECT_ID is not configured."
    };
  }

  const branch = String(process.env.VERCEL_PRODUCTION_GIT_BRANCH || "").trim();
  const searchParams = new URLSearchParams({
    projectId: config.projectId,
    target: "production",
    limit: "1"
  });

  if (branch) {
    searchParams.set("branch", branch);
  }

  if (config.teamId) {
    searchParams.set("teamId", config.teamId);
  }

  const response = await fetch(`https://api.vercel.com/v6/deployments?${searchParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return {
      deployment_status_available: false,
      deployment_status_message: `Unable to load deployment status (${response.status}).`
    };
  }

  const payload = await response.json();
  const deployment = Array.isArray(payload.deployments) ? payload.deployments[0] : null;

  if (!deployment) {
    return {
      deployment_status_available: true,
      deployment_status: "UNKNOWN",
      deployment_status_label: "No deployment found",
      deployment_status_message: "No production deployment was found yet."
    };
  }

  const readyState = String(deployment.readyState || deployment.status || "UNKNOWN").toUpperCase();
  const statusMap = {
    QUEUED: "Deploy triggered",
    INITIALIZING: "Deploy triggered",
    BUILDING: "Building",
    READY: "Live",
    ERROR: "Deploy failed",
    CANCELED: "Deploy canceled"
  };

  return {
    deployment_status_available: true,
    deployment_id: deployment.id || null,
    deployment_status: readyState,
    deployment_status_label: statusMap[readyState] || readyState,
    deployment_status_message: statusMap[readyState] || readyState,
    deployment_url: deployment.url ? `https://${deployment.url}` : null,
    deployment_created_at: deployment.createdAt || null,
    deployment_ready_at: deployment.ready || null
  };
}

async function publishPostToGitHub(body) {
  const publishedAt = new Date().toISOString();
  const validatedBody = validatePostPayload(body);
  const requestedPublishedSlug = String(body.published_slug || "").trim() || null;
  const nextBasePost = buildPublishPost(validatedBody, publishedAt);
  const commitMessage = buildPublishCommitMessage(nextBasePost);

  const livePath = requestedPublishedSlug ? `content/posts/${requestedPublishedSlug}.md` : null;
  const targetPath = `content/posts/${nextBasePost.slug}.md`;
  const isSlugChange = Boolean(requestedPublishedSlug && requestedPublishedSlug !== nextBasePost.slug);

  if (isSlugChange && !body.confirm_slug_change) {
    throw createConflictError("Published slug changes require explicit confirmation.");
  }

  let workingBranch = String(body.content_branch || "").trim();
  workingBranch = await githubApp.ensureContentBranch({
    slug: nextBasePost.slug,
    existingBranch: workingBranch || null
  });

  const [liveSource, targetSource] = await Promise.all([
    livePath ? githubApp.getFile(livePath, workingBranch) : Promise.resolve(null),
    githubApp.getFile(targetPath, workingBranch)
  ]);

  const livePost = liveSource ? parsePostSource(liveSource.content) : null;
  const targetPost = targetSource ? parsePostSource(targetSource.content) : null;
  const targetBelongsToSameLineage = isSameLineage(targetPost, nextBasePost, requestedPublishedSlug)
    || isLegacyDraftMatch(targetPost, nextBasePost, requestedPublishedSlug);

  if (targetSource && !targetBelongsToSameLineage && (!requestedPublishedSlug || requestedPublishedSlug !== nextBasePost.slug)) {
    throw createConflictError(`A different post already uses the slug "${nextBasePost.slug}".`);
  }

  let coverImagePath = nextBasePost.cover_image;
  let lastCommitInfo = { commit_sha: null, commit_url: null };
  let hasBinaryChanges = false;

  if (body.cover_image_data) {
    const decoded = decodeDataUrl(body.cover_image_data);
    if (!decoded) {
      throw new Error("Invalid cover image format.");
    }
    const extension = extensionFromMimeType(decoded.mimeType);
    coverImagePath = `/assets/posts/${nextBasePost.slug}/cover.${extension}`;
    const assetPath = path.posix.join("assets", "posts", nextBasePost.slug, `cover.${extension}`);
    const existingAsset = await githubApp.getFile(assetPath, workingBranch);
    const uploadResult = await githubApp.putFile(assetPath, decoded.buffer, commitMessage, workingBranch, existingAsset ? existingAsset.sha : undefined);
    lastCommitInfo = extractCommitInfo(uploadResult);
    hasBinaryChanges = true;
  }

  const nextPost = {
    ...nextBasePost,
    cover_image: coverImagePath
  };
  const source = serializeFrontMatter(nextPost);

  const homepageUpdates = await normalizeHomepageOrdering(nextPost, requestedPublishedSlug || nextPost.slug);
  const canUseTargetPathForIdempotency = !isSlugChange;
  const targetSourceMatches = Boolean(targetSource && targetSource.content === source);
  const noChanges = canUseTargetPathForIdempotency
    && targetSourceMatches
    && (targetBelongsToSameLineage || !requestedPublishedSlug)
    && homepageUpdates.length === 0
    && !hasBinaryChanges;

  if (!requestedPublishedSlug && targetSource && !targetBelongsToSameLineage) {
    throw createConflictError(`A different post already uses the slug "${nextPost.slug}".`);
  }

  if (noChanges) {
    if (body.draft_id) {
      await saveDraftToBlob(body, {
        draft_id: body.draft_id,
        id: nextPost.id,
        slug: nextPost.slug,
        published_slug: nextPost.slug,
        status: nextPost.status,
        updated_at: publishedAt
      });
    }

    const payloadHash = hashPayload(validatedBody);
    const pr = await githubApp.createOrUpdatePr({
      branch: workingBranch,
      title: nextPost.title,
      slug: nextPost.slug,
      id: nextPost.id,
      payloadHash,
      summary: "No content changes were needed, but the PR remains the preview review surface."
    });
    return {
      id: nextPost.id,
      slug: nextPost.slug,
      published_slug: nextPost.slug,
      branch: pr.branch || workingBranch,
      commit_sha: null,
      commit_url: null,
      pr_url: pr.html_url,
      pr_number: pr.number,
      payload_hash: payloadHash,
      preview_started_at: Date.now(),
      preview_status: "Preview queued",
      cover_image: nextPost.cover_image,
      live_url: nextPost.url,
      published_at: publishedAt,
      no_changes: true,
      message: "No content changes were needed. Publish PR preview is still available for review.",
      reading_time: nextPost.reading_time,
      word_count: nextPost.word_count
    };
  }

  for (const post of homepageUpdates) {
    const updateSource = serializeFrontMatter(post);
    const existing = await githubApp.getFile(`content/posts/${post.slug}.md`, workingBranch);
    const updateResult = await githubApp.putFile(`content/posts/${post.slug}.md`, updateSource, commitMessage, workingBranch, existing ? existing.sha : undefined);
    lastCommitInfo = extractCommitInfo(updateResult);
  }

  const targetWriteResult = await githubApp.putFile(targetPath, source, commitMessage, workingBranch, targetSource ? targetSource.sha : undefined);
  lastCommitInfo = extractCommitInfo(targetWriteResult);

  if (isSlugChange && requestedPublishedSlug) {
    const redirectResult = await updateRedirectsIfNeededOnBranch(requestedPublishedSlug, nextPost.slug, commitMessage, workingBranch);
    if (redirectResult) lastCommitInfo = extractCommitInfo(redirectResult);

    if (liveSource) {
      const deleteResult = await githubApp.deleteFile(livePath, commitMessage, workingBranch, liveSource.sha);
      if (deleteResult) lastCommitInfo = extractCommitInfo(deleteResult);
    }
  }

  if (body.draft_id) {
    await saveDraftToBlob(body, {
      draft_id: body.draft_id,
      id: nextPost.id,
      slug: nextPost.slug,
      published_slug: nextPost.slug,
      status: nextPost.status,
      updated_at: publishedAt
    });
  }

  const payloadHash = hashPayload(validatedBody);
  const pr = await githubApp.createOrUpdatePr({
    branch: workingBranch,
    title: nextPost.title,
    slug: nextPost.slug,
    id: nextPost.id,
    payloadHash,
    summary: "Created from Ideas Admin. Review the Vercel preview before merging."
  });
  return {
    id: nextPost.id,
    slug: nextPost.slug,
    published_slug: nextPost.slug,
    branch: pr.branch || workingBranch,
    ...lastCommitInfo,
    cover_image: nextPost.cover_image,
    live_url: nextPost.url,
    pr_url: pr.html_url,
    pr_number: pr.number,
    payload_hash: payloadHash,
    preview_started_at: Date.now(),
    preview_status: "Preview queued",
    published_at: publishedAt,
    no_changes: false,
    message: "Publish PR created. Vercel preview will appear here automatically.",
    reading_time: nextPost.reading_time,
    word_count: nextPost.word_count
  };
}

async function updateRedirectsIfNeededOnBranch(originalSlug, nextSlug, commitMessage, branch) {
  if (!originalSlug || !nextSlug || originalSlug === nextSlug) return null;
  const redirectsPath = "content/redirects.json";
  const existingRedirects = await githubApp.getFile(redirectsPath, branch);
  const payload = existingRedirects ? JSON.parse(existingRedirects.content) : { redirects: [] };
  const filtered = Array.isArray(payload.redirects) ? payload.redirects.filter((entry) => entry && entry.from !== originalSlug) : [];
  filtered.push({ from: originalSlug, to: nextSlug });
  return githubApp.putFile(
    redirectsPath,
    JSON.stringify({ redirects: filtered }, null, 2),
    commitMessage,
    branch,
    existingRedirects ? existingRedirects.sha : undefined
  );
}

module.exports = {
  COOKIE_NAME,
  DRAFT_SCHEMA_VERSION,
  SESSION_TTL_SECONDS,
  buildDraftPayload,
  createSessionToken,
  getLatestVercelDeploymentStatus,
  getPostSourceBySlug,
  getRecentPosts,
  publishPostToGitHub,
  readJsonBody,
  renderPreviewHtml,
  requireSession,
  saveDraftToBlob,
  sendJson
};
