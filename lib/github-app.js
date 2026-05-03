"use strict";

const crypto = require("crypto");
const jwt = require("jsonwebtoken");

function requireConfig() {
  const appId = String(process.env.GITHUB_APP_ID || "").trim();
  const installationId = String(process.env.GITHUB_APP_INSTALLATION_ID || "").trim();
  const privateKey = String(process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const owner = String(process.env.GITHUB_REPO_OWNER || "").trim();
  const repo = String(process.env.GITHUB_REPO_NAME || "").trim();
  const baseBranch = String(process.env.GITHUB_BASE_BRANCH || process.env.VERCEL_PRODUCTION_GIT_BRANCH || "main").trim();
  if (!appId || !installationId || !privateKey || !owner || !repo) {
    throw new Error("GitHub App publishing is not configured.");
  }
  return { appId, installationId, privateKey, owner, repo, baseBranch };
}

function createAppJwt(config) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iat: now - 60,
      exp: now + 9 * 60,
      iss: config.appId
    },
    config.privateKey,
    { algorithm: "RS256" }
  );
}

async function createInstallationToken(config) {
  const appJwt = createAppJwt(config);
  const response = await fetch(`https://api.github.com/app/installations/${config.installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "olakelly-ideas-admin"
    },
    body: JSON.stringify({
      repositories: [config.repo],
      permissions: {
        contents: "write",
        pull_requests: "write",
        metadata: "read"
      }
    })
  });
  if (!response.ok) {
    throw new Error(`GitHub App token request failed: ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  return payload.token;
}

async function githubRequest(resourcePath, options = {}) {
  const config = requireConfig();
  const token = await createInstallationToken(config);
  const url = resourcePath.startsWith("http")
    ? resourcePath
    : `https://api.github.com/repos/${config.owner}/${config.repo}/${resourcePath.replace(/^\/+/, "")}`;
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "olakelly-ideas-admin",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (response.status === 404 && options.allowNotFound) return null;
  if (!response.ok) {
    throw new Error(`GitHub request failed: ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function shortId() {
  return crypto.randomBytes(4).toString("hex");
}

function buildContentBranch(slug) {
  const date = new Date().toISOString().slice(0, 10);
  const safeSlug = String(slug || "idea").replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `content/${date}/${safeSlug}-${shortId()}`;
}

async function getBranch(branch) {
  return githubRequest(`branches/${encodeURIComponent(branch)}`, { allowNotFound: true });
}

async function createBranch(branch, sha) {
  return githubRequest("git/refs", {
    method: "POST",
    body: {
      ref: `refs/heads/${branch}`,
      sha
    }
  });
}

async function deleteBranch(branch) {
  if (!/^content\/\d{4}-\d{2}-\d{2}\//.test(branch)) {
    throw new Error("Only controlled content branches can be deleted.");
  }
  return githubRequest(`git/refs/heads/${branch}`, {
    method: "DELETE",
    allowNotFound: true
  });
}

async function ensureContentBranch({ slug, existingBranch }) {
  const config = requireConfig();
  const base = await getBranch(config.baseBranch);
  if (!base?.commit?.sha) {
    throw new Error(`Base branch "${config.baseBranch}" was not found.`);
  }
  if (existingBranch) {
    const branch = await getBranch(existingBranch);
    if (branch) return existingBranch;
  }
  for (let attempts = 0; attempts < 5; attempts += 1) {
    const branchName = buildContentBranch(slug);
    const collision = await getBranch(branchName);
    if (collision) continue;
    await createBranch(branchName, base.commit.sha);
    return branchName;
  }
  throw new Error("Unable to create a collision-free content branch.");
}

async function getFile(filePath, branch) {
  const response = await githubRequest(`contents/${filePath.replace(/\\/g, "/")}?ref=${encodeURIComponent(branch)}`, { allowNotFound: true });
  if (!response) return null;
  return {
    sha: response.sha,
    content: Buffer.from(response.content || "", "base64").toString("utf8")
  };
}

async function putFile(filePath, content, message, branch, sha) {
  const body = {
    message,
    branch,
    content: Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(String(content), "utf8").toString("base64")
  };
  if (sha) body.sha = sha;
  return githubRequest(`contents/${filePath.replace(/\\/g, "/")}`, {
    method: "PUT",
    body
  });
}

async function deleteFile(filePath, message, branch, sha) {
  if (!sha) {
    const existing = await getFile(filePath, branch);
    if (!existing) return null;
    sha = existing.sha;
  }
  return githubRequest(`contents/${filePath.replace(/\\/g, "/")}`, {
    method: "DELETE",
    body: { message, branch, sha }
  });
}

async function findOpenContentPr({ slug, id }) {
  const config = requireConfig();
  const pulls = await githubRequest(`pulls?state=open&base=${encodeURIComponent(config.baseBranch)}&per_page=50`);
  return pulls.find((pr) => {
    const marker = String(pr.body || "");
    return marker.includes(`Post-Slug: ${slug}`) || (id && marker.includes(`Post-ID: ${id}`));
  }) || null;
}

async function createOrUpdatePr({ branch, title, slug, id, payloadHash, summary }) {
  const config = requireConfig();
  const existing = await findOpenContentPr({ slug, id });
  const body = [
    "## Publishing Checklist",
    "- [ ] Content validated",
    "- [ ] Links tested",
    "- [ ] Preview reviewed",
    "- [ ] Metadata correct",
    "",
    "## System Metadata",
    `Post-Slug: ${slug}`,
    `Post-ID: ${id || ""}`,
    `Payload-Hash: ${payloadHash}`,
    "",
    summary || "Created from Ideas Admin."
  ].join("\n");

  if (existing) {
    await githubRequest(`pulls/${existing.number}`, {
      method: "PATCH",
      body: {
        title: `Publish: ${title}`,
        body
      }
    });
    return {
      number: existing.number,
      html_url: existing.html_url,
      branch: existing.head.ref
    };
  }

  const created = await githubRequest("pulls", {
    method: "POST",
    body: {
      title: `Publish: ${title}`,
      head: branch,
      base: config.baseBranch,
      body,
      maintainer_can_modify: false
    }
  });
  return {
    number: created.number,
    html_url: created.html_url,
    branch
  };
}

module.exports = {
  createOrUpdatePr,
  deleteBranch,
  deleteFile,
  ensureContentBranch,
  getFile,
  githubRequest,
  putFile,
  requireConfig
};
