"use strict";

const fs = require("fs");
const path = require("path");
const { SITE_CSS_VERSION, SITE_JS_VERSION } = require("../lib/asset-versions");
const {
  SITE_URL,
  createFeedJson,
  createFeedXml,
  createLatestPostsJson,
  createPostsIndexJson,
  filterPublished,
  getRelatedPosts,
  loadPosts,
  renderCategoryPage,
  renderIdeasIndexPage,
  renderPostPage,
  renderRedirectPage
} = require("../lib/blog");

const projectRoot = path.resolve(__dirname, "..");
const postsDirectory = path.join(projectRoot, "content", "posts");
const redirectsPath = path.join(projectRoot, "content", "redirects.json");
const sitemapPath = path.join(projectRoot, "sitemap.xml");
const robotsPath = path.join(projectRoot, "robots.txt");
const buildLogPath = path.join(projectRoot, "data", "build-log.json");
const SITEMAP_TIME_ZONE = "America/New_York";
const staticPages = [
  path.join(projectRoot, "index.html"),
  path.join(projectRoot, "about.html"),
  path.join(projectRoot, "apply", "index.html"),
  path.join(projectRoot, "disclaimer.html"),
  path.join(projectRoot, "privacy-policy.html"),
  path.join(projectRoot, "terms.html"),
  path.join(projectRoot, "steward-framework.html")
];

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function writeFile(filePath, contents) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, "utf8");
}

function getSourceLastModified(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.statSync(filePath).mtime;
}

function captureSourceModifiedDates(filePaths) {
  const modifiedDates = new Map();
  filePaths.forEach((filePath) => {
    if (fs.existsSync(filePath)) {
      modifiedDates.set(filePath, getSourceLastModified(filePath));
    }
  });
  return modifiedDates;
}

function getPostSourceModifiedDates() {
  const modifiedDates = new Map();
  if (!fs.existsSync(postsDirectory)) return modifiedDates;

  fs.readdirSync(postsDirectory)
    .filter((file) => file.endsWith(".md"))
    .forEach((file) => {
      const filePath = path.join(postsDirectory, file);
      const source = fs.readFileSync(filePath, "utf8");
      const slugMatch = source.match(/^slug:\s*["']?([^"'\r\n]+)/m);
      const slug = slugMatch ? slugMatch[1].trim() : path.basename(file, ".md");
      modifiedDates.set(slug, getSourceLastModified(filePath));
    });

  return modifiedDates;
}

function newestDate(dates, fallback = new Date()) {
  const timestamps = dates
    .filter(Boolean)
    .map((date) => new Date(date).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  if (!timestamps.length) return fallback;
  return new Date(Math.max(...timestamps));
}

function newestSourceDate(dates) {
  return newestDate(dates, null);
}

function formatSitemapDate(date) {
  const parsed = new Date(date);
  const normalizedDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SITEMAP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(normalizedDate);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function hasNoindex(filePath) {
  if (!fs.existsSync(filePath)) return false;
  return /<meta\s+[^>]*(name=["']robots["'][^>]*content=["'][^"']*noindex|content=["'][^"']*noindex[^>]*name=["']robots["'])/i
    .test(fs.readFileSync(filePath, "utf8"));
}

function normalizeCanonicalPath(value) {
  if (!value) return "/";

  let pathname = String(value).trim();
  if (/^https?:\/\//i.test(pathname)) {
    const url = new URL(pathname);
    const siteOrigin = new URL(SITE_URL).origin;
    if (url.origin !== siteOrigin) {
      throw new Error(`Sitemap canonical URL must belong to ${siteOrigin}: ${pathname}`);
    }
    pathname = url.pathname;
  }

  pathname = pathname.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;

  if (pathname.endsWith("/index.html")) {
    pathname = pathname.slice(0, -"index.html".length);
  } else if (pathname.endsWith(".html")) {
    pathname = pathname.slice(0, -".html".length);
  }

  if (!pathname.endsWith("/")) pathname = `${pathname}/`;
  return pathname.replace(/\/+/g, "/");
}

function filePathToCanonicalPath(filePath) {
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, "/");
  return normalizeCanonicalPath(relativePath);
}

function buildAbsoluteSitemapUrl(pathname) {
  return new URL(normalizeCanonicalPath(pathname), `${SITE_URL}/`).toString();
}

function createSitemapXml(entries) {
  const uniqueEntries = Array.from(
    entries.reduce((map, entry) => {
      if (!entry || !entry.url) return map;
      if (!map.has(entry.url)) {
        map.set(entry.url, {
          url: entry.url,
          lastmod: formatSitemapDate(entry.lastmod)
        });
      }
      return map;
    }, new Map()).values()
  ).sort((left, right) => left.url.localeCompare(right.url));

  const urls = uniqueEntries.map((entry) => `  <url>
    <loc>${escapeXml(entry.url)}</loc>
    <lastmod>${escapeXml(entry.lastmod)}</lastmod>
  </url>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function writeRobotsTxt() {
  writeFile(robotsPath, `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`);
}

function syncStaticPageAssetVersions() {
  staticPages.forEach((filePath) => {
    if (!fs.existsSync(filePath)) return;
    const source = fs.readFileSync(filePath, "utf8");
    const updated = source
      .replace(/styles\/main\.css\?v=[^"]+/g, `styles/main.css?v=${SITE_CSS_VERSION}`)
      .replace(/scripts\/main\.js\?v=[^"]+/g, `scripts/main.js?v=${SITE_JS_VERSION}`);
    if (updated !== source) {
      fs.writeFileSync(filePath, updated, "utf8");
    }
  });
}

function loadRedirects() {
  if (!fs.existsSync(redirectsPath)) return [];
  const redirectsData = JSON.parse(fs.readFileSync(redirectsPath, "utf8"));
  return Array.isArray(redirectsData.redirects) ? redirectsData.redirects : [];
}

function buildIdeas() {
  if (String(process.env.BUILDS_ENABLED || "true").toLowerCase() === "false") {
    console.log("Build skipped because BUILDS_ENABLED=false.");
    return;
  }
  const buildDate = new Date();
  const staticPageModifiedDates = captureSourceModifiedDates(staticPages);
  const postSourceModifiedDates = getPostSourceModifiedDates();
  syncStaticPageAssetVersions();
  const posts = loadPosts(postsDirectory);
  const publishedPosts = filterPublished(posts);
  const publishedPostModifiedDates = publishedPosts.map((post) => postSourceModifiedDates.get(post.slug));
  const latestPublishedPostModifiedDate = newestSourceDate(publishedPostModifiedDates);
  const sitemapEntries = [];

  function addSitemapEntry(pathnameOrUrl, lastmod) {
    const url = buildAbsoluteSitemapUrl(pathnameOrUrl);
    sitemapEntries.push({ url, lastmod: lastmod || buildDate });
  }

  staticPages.forEach((filePath) => {
    if (!fs.existsSync(filePath) || hasNoindex(filePath)) return;
    const route = filePathToCanonicalPath(filePath);
    const staticModifiedDate = staticPageModifiedDates.get(filePath);
    const lastmod = route === "/"
      ? newestSourceDate([staticModifiedDate, latestPublishedPostModifiedDate])
      : staticModifiedDate;
    addSitemapEntry(route, lastmod);
  });

  writeFile(path.join(projectRoot, "ideas", "index.html"), renderIdeasIndexPage(publishedPosts));
  addSitemapEntry("/ideas/", latestPublishedPostModifiedDate);

  publishedPosts.forEach((post) => {
    const relatedPosts = getRelatedPosts(post, publishedPosts);
    writeFile(path.join(projectRoot, "ideas", post.slug, "index.html"), renderPostPage(post, relatedPosts));
    addSitemapEntry(post.canonical_url || post.url, postSourceModifiedDates.get(post.slug));
  });

  const categories = new Map();
  publishedPosts.forEach((post) => {
    if (!categories.has(post.category_slug)) {
      categories.set(post.category_slug, {
        category: post.category,
        category_slug: post.category_slug,
        posts: []
      });
    }
    categories.get(post.category_slug).posts.push(post);
  });

  categories.forEach((entry) => {
    writeFile(
      path.join(projectRoot, "ideas", "category", entry.category_slug, "index.html"),
      renderCategoryPage(entry, entry.posts)
    );
    addSitemapEntry(
      `/ideas/category/${entry.category_slug}/`,
      newestSourceDate(entry.posts.map((post) => postSourceModifiedDates.get(post.slug)))
    );
  });

  loadRedirects().forEach((redirect) => {
    if (!redirect || !redirect.from || !redirect.to) return;
    writeFile(
      path.join(projectRoot, "ideas", redirect.from, "index.html"),
      renderRedirectPage(redirect.to, 2)
    );
  });

  writeFile(path.join(projectRoot, "data", "posts-index.json"), JSON.stringify(createPostsIndexJson(publishedPosts), null, 2));
  writeFile(path.join(projectRoot, "data", "latest-posts.json"), JSON.stringify(createLatestPostsJson(publishedPosts), null, 2));
  writeFile(path.join(projectRoot, "feed.json"), JSON.stringify(createFeedJson(publishedPosts), null, 2));
  writeFile(path.join(projectRoot, "feed.xml"), createFeedXml(publishedPosts));
  writeFile(sitemapPath, createSitemapXml(sitemapEntries));
  writeRobotsTxt();
  validateOutputIntegrity({ publishedPosts, sitemapEntries });
  writeFile(buildLogPath, JSON.stringify({
    generated_at: new Date().toISOString(),
    status: "success",
    published_posts: publishedPosts.length,
    routes: sitemapEntries.map((entry) => entry.url).sort(),
    validation: {
      taxonomy: "passed",
      sitemap: "passed",
      drafts: "not-rendered",
      unsafe_html: "checked"
    }
  }, null, 2));

  console.log(`Built ${publishedPosts.length} published posts.`);
}

function validateOutputIntegrity({ publishedPosts, sitemapEntries }) {
  const publishedSlugs = new Set(publishedPosts.map((post) => post.slug));
  const routeUrls = new Set(sitemapEntries.map((entry) => entry.url));

  publishedPosts.forEach((post) => {
    if (!routeUrls.has(`${SITE_URL}${post.url}`)) {
      throw new Error(`Output integrity failed: sitemap is missing ${post.url}.`);
    }
  });

  const posts = loadPosts(postsDirectory);
  posts.filter((post) => post.status !== "published").forEach((draft) => {
    const draftPath = path.join(projectRoot, "ideas", draft.slug, "index.html");
    if (fs.existsSync(draftPath)) {
      throw new Error(`Output integrity failed: draft route rendered for "${draft.slug}".`);
    }
  });

  const ideasDirectory = path.join(projectRoot, "ideas");
  if (fs.existsSync(ideasDirectory)) {
    fs.readdirSync(ideasDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !["category"].includes(entry.name))
      .forEach((entry) => {
        if (!publishedSlugs.has(entry.name)) {
          const candidate = path.join(ideasDirectory, entry.name, "index.html");
          if (fs.existsSync(candidate)) {
            throw new Error(`Output integrity failed: stale idea route "${entry.name}" exists.`);
          }
        }
      });
  }

  const unsafePatterns = [
    /\son[a-z]+\s*=/i,
    /javascript:/i
  ];
  publishedPosts.forEach((post) => {
    const filePath = path.join(projectRoot, "ideas", post.slug, "index.html");
    const html = fs.readFileSync(filePath, "utf8");
    unsafePatterns.forEach((pattern) => {
      if (pattern.test(html)) {
        throw new Error(`Output integrity failed: unsafe HTML found in "${post.slug}".`);
      }
    });
  });
}

buildIdeas();
