"use strict";

const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");
const { marked } = require("marked");
const { SITE_CSS_VERSION, SITE_JS_VERSION } = require("./asset-versions");
const sanitizeHtml = require("sanitize-html");
const {
  CATEGORY_SLUGS,
  STEWARD_TAGS,
  validateFrontMatter,
  validatePostPayload
} = require("./content-policy");

const SITE_NAME = "Ola Kelly";
const SITE_URL = "https://olakelly.com";
const LINKEDIN_URL = "https://www.linkedin.com/in/olaiya";
const IDEAS_TITLE = "Ideas";
const IDEAS_DESCRIPTION = "Essays, frameworks, and reflections on leadership as stewardship.";
const AUTHOR = { name: "Ola Kelly" };
const ANALYTICS_SNIPPET = `
  <script>
    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/insights/script.js"></script>
  <script>
    window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
  </script>
  <script defer src="/_vercel/speed-insights/script.js"></script>
`;

marked.setOptions({
  gfm: true,
  breaks: false
});

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategory(category) {
  const value = String(category || "").trim();
  if (!CATEGORY_SLUGS[value]) {
    throw new Error(`Invalid category "${value}". Use one approved category exactly as written.`);
  }
  return {
    category: value,
    category_slug: CATEGORY_SLUGS[value]
  };
}

function normalizeHomepageSettings(input) {
  const featured = Boolean(input.homepage_featured);
  const numericOrder = Number(input.homepage_order);
  const order = featured && Number.isInteger(numericOrder) && numericOrder >= 1 && numericOrder <= 3
    ? numericOrder
    : null;

  return {
    homepage_featured: featured && order !== null,
    homepage_order: order
  };
}

function countWords(markdown) {
  const plainText = String(markdown || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/[#>*_\-\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plainText) return 0;
  return plainText.split(" ").filter(Boolean).length;
}

function estimateReadingTime(wordCount) {
  return Math.max(1, Math.ceil(Number(wordCount || 0) / 225));
}

function enforceExcerptLength(excerpt) {
  const value = String(excerpt || "").trim();
  if (!value) {
    throw new Error("Excerpt is required.");
  }
  if (value.length > 200) {
    throw new Error("Excerpt must be 200 characters or fewer.");
  }
  return value;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function formatDisplayDate(dateValue) {
  const date = new Date(dateValue);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatRssDate(dateValue) {
  return new Date(dateValue).toUTCString();
}

function relativePrefix(depth) {
  if (!depth) return "";
  return "../".repeat(depth);
}

function assetPath(depth, target) {
  return `${relativePrefix(depth)}${target}`;
}

function buildPostUrl(slug) {
  return `/ideas/${slug}/`;
}

function buildCategoryUrl(categorySlug) {
  return `/ideas/category/${categorySlug}/`;
}

function buildTagUrl(tag) {
  return `/ideas/?tag=${encodeURIComponent(tag)}`;
}

function buildAbsoluteUrl(relativeUrl) {
  return new URL(relativeUrl, `${SITE_URL}/`).toString();
}

function parseDateOrThrow(value, fallback, fieldLabel) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return fallback;
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${fieldLabel} is invalid.`);
  }

  return parsed.toISOString();
}

function computePost(input, body) {
  const validated = validatePostPayload({
    ...input,
    content: body || "",
    tags: ensureArray(input.tags)
  });
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Post title is required.");

  const status = String(input.status || "draft").trim();
  if (!["draft", "published"].includes(status)) {
    throw new Error(`Invalid status "${status}".`);
  }

  const derivedSlug = slugify(input.slug || title);
  if (!derivedSlug) throw new Error("Slug could not be derived from the title.");

  const normalizedCategory = normalizeCategory(validated.category);
  const homepageSettings = normalizeHomepageSettings(input);
  const tags = ensureArray(validated.tags);
  const relatedPosts = ensureArray(input.related_posts);
  const excerpt = enforceExcerptLength(input.excerpt);
  const wordCount = countWords(body);
  const readingTime = estimateReadingTime(wordCount);
  const publishedAt = parseDateOrThrow(input.date, new Date().toISOString(), "Publish date");
  const updatedAt = parseDateOrThrow(input.updated, publishedAt, "Updated date");
  const url = buildPostUrl(derivedSlug);
  const canonicalUrl = String(input.canonical_url || buildAbsoluteUrl(url)).trim();

  return {
    id: String(input.id || "").trim(),
    title,
    subtitle: String(input.subtitle || "").trim(),
    slug: derivedSlug,
    status,
    featured: Boolean(input.featured),
    homepage_featured: homepageSettings.homepage_featured,
    homepage_order: homepageSettings.homepage_order,
    date: publishedAt,
    updated: updatedAt,
    category: normalizedCategory.category,
    category_slug: normalizedCategory.category_slug,
    tags,
    excerpt,
    intent: String(input.intent || "").trim(),
    seo_title: String(input.seo_title || `${title} | ${SITE_NAME}`).trim(),
    seo_description: String(input.seo_description || excerpt).trim(),
    canonical_url: canonicalUrl,
    show_date: input.show_date !== false,
    show_updated_date: Boolean(input.show_updated_date),
    cover_image: String(input.cover_image || "").trim(),
    cover_image_alt: String(input.cover_image_alt || "").trim(),
    related_posts: relatedPosts,
    word_count: wordCount,
    reading_time: readingTime,
    url,
    absolute_url: buildAbsoluteUrl(url),
    content_markdown: body,
    content_html: sanitizeHtml(marked.parse(body || ""), {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "h3", "img"]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        a: ["href", "name", "target", "rel"],
        img: ["src", "alt", "title", "width", "height", "loading"]
      },
      allowedSchemes: ["http", "https", "mailto"],
      transformTags: {
        a: sanitizeHtml.simpleTransform("a", { rel: "noreferrer" })
      }
    }),
    authors: [AUTHOR]
  };
}

function parsePostFile(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const parsed = matter(source);
  validateFrontMatter(path.basename(filePath), parsed.data || {});
  const post = computePost(parsed.data, parsed.content.trim());
  const requiredFields = [
    "id",
    "title",
    "slug",
    "date",
    "category",
    "category_slug",
    "excerpt",
    "seo_title",
    "seo_description"
  ];

  requiredFields.forEach((field) => {
    if (!post[field]) {
      throw new Error(`${path.basename(filePath)} is missing required field "${field}".`);
    }
  });

  return post;
}

function loadPosts(postsDirectory) {
  if (!fs.existsSync(postsDirectory)) return [];
  const files = fs.readdirSync(postsDirectory).filter((file) => file.endsWith(".md"));
  const posts = files.map((file) => parsePostFile(path.join(postsDirectory, file)));
  const seenIds = new Set();
  const seenSlugs = new Set();

  posts.forEach((post) => {
    if (seenIds.has(post.id)) {
      throw new Error(`Duplicate post id "${post.id}".`);
    }
    if (seenSlugs.has(post.slug)) {
      throw new Error(`Duplicate post slug "${post.slug}".`);
    }
    seenIds.add(post.id);
    seenSlugs.add(post.slug);
  });

  return posts.sort((left, right) => new Date(right.date) - new Date(left.date));
}

function filterPublished(posts) {
  return posts.filter((post) => post.status === "published");
}

function getRelatedPosts(post, posts) {
  const categoryRelated = posts
    .filter((candidate) => candidate.slug !== post.slug && candidate.category === post.category)
    .sort((left, right) => new Date(right.date) - new Date(left.date))
    .slice(0, 3);
  const shown = new Set(categoryRelated.map((candidate) => candidate.slug));
  const postTags = new Set(post.tags || []);
  const tagRelated = posts
    .filter((candidate) => candidate.slug !== post.slug && !shown.has(candidate.slug))
    .map((candidate) => ({
      post: candidate,
      shared: (candidate.tags || []).filter((tag) => postTags.has(tag)).length
    }))
    .filter((entry) => entry.shared > 0)
    .sort((left, right) => right.shared - left.shared || new Date(right.post.date) - new Date(left.post.date))
    .slice(0, 3)
    .map((entry) => entry.post);

  return { categoryRelated, tagRelated };
}

function renderHeader(depth, currentNav) {
  const ideasHref = assetPath(depth, "ideas/");
  const homeHref = assetPath(depth, "index.html");
  const frameworkHref = assetPath(depth, "steward-framework.html");
  const aboutHref = assetPath(depth, "about.html");
  const newsletterHref = `${homeHref}#newsletter`;

  const navClass = (value) => (currentNav === value ? "nav-link nav-link-text is-current" : "nav-link nav-link-text");
  const mobileClass = () => "font-heading mobile-nav-link-text";
  const ariaCurrent = (value) => (currentNav === value ? ' aria-current="page"' : "");

  return `
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <header class="site-header" id="siteHeader">
      <div class="container-shell">
        <nav class="header-nav flex items-center justify-between" aria-label="Main navigation">
          <a href="${homeHref}" id="wordmark" class="font-heading wordmark">Ola Kelly</a>

          <div class="hidden md:flex items-center desktop-nav">
            <a href="${homeHref}" class="${navClass("home")}"${ariaCurrent("home")}>Home</a>
            <a href="${ideasHref}" class="${navClass("ideas")}"${ariaCurrent("ideas")}>Ideas</a>
            <a href="${frameworkHref}" class="${navClass("framework")}"${ariaCurrent("framework")}>STEWARD Framework<sup>&trade;</sup></a>
            <a href="${aboutHref}" class="${navClass("about")}"${ariaCurrent("about")}>About</a>
            <span class="nav-divider"></span>
            <button id="themeToggle" class="theme-toggle dark" aria-label="Toggle dark mode">
              <i data-lucide="sun" class="sun-icon"></i>
              <i data-lucide="moon" class="moon-icon"></i>
            </button>
            <a href="${newsletterHref}" id="headerCta" class="header-cta-link">Subscribe</a>
          </div>

          <button id="mobileMenuBtn" class="mobile-menu-btn md:hidden" aria-label="Open menu">
            <i data-lucide="menu"></i>
          </button>
        </nav>
      </div>
    </header>

    <div class="mobile-nav-overlay" id="mobileOverlay"></div>

    <aside class="mobile-nav-panel" id="mobilePanel" aria-label="Mobile navigation">
      <div class="mobile-panel-inner">
        <div class="flex items-center justify-between mobile-panel-top">
          <span class="font-heading mobile-panel-brand">Ola Kelly</span>
          <button id="mobileCloseBtn" class="mobile-close-btn" aria-label="Close menu">
            <i data-lucide="x"></i>
          </button>
        </div>

        <div class="flex flex-col mobile-panel-links">
          <a href="${homeHref}" class="${mobileClass("home")}"${ariaCurrent("home")}>Home</a>
          <a href="${ideasHref}" class="${mobileClass("ideas")}"${ariaCurrent("ideas")}>Ideas</a>
          <a href="${frameworkHref}" class="${mobileClass("framework")}"${ariaCurrent("framework")}>STEWARD Framework<sup>&trade;</sup></a>
          <a href="${aboutHref}" class="${mobileClass("about")}"${ariaCurrent("about")}>About</a>

          <hr class="mobile-panel-rule">

          <div class="mobile-panel-bottom">
            <a href="${newsletterHref}" id="mobileCta" class="font-heading mobile-cta-link">Subscribe</a>
            <button id="mobileThemeToggle" class="theme-toggle dark" aria-label="Toggle dark mode">
              <i data-lucide="sun" class="sun-icon"></i>
              <i data-lucide="moon" class="moon-icon"></i>
            </button>
          </div>
        </div>
      </div>
    </aside>
  `;
}

function renderFooter(depth) {
  const ideasHref = assetPath(depth, "ideas/");
  const homeHref = assetPath(depth, "index.html");
  const frameworkHref = assetPath(depth, "steward-framework.html");
  const aboutHref = assetPath(depth, "about.html");

  return `
    <footer class="site-footer">
      <div class="container-shell">
        <div class="footer-grid grid">
          <div class="footer-brand-col">
            <div>
              <h3 class="font-heading footer-brand-name">Ola Kelly</h3>
              <p class="font-body footer-tagline">Stewardship over status.</p>
            </div>
            <p class="font-body footer-description">
              Practical ideas on influence, responsibility, and what leadership actually requires.
            </p>
            <p class="font-body footer-linkedin-wrap">
              <a href="${LINKEDIN_URL}" class="footer-linkedin-link" target="_blank" rel="noreferrer">Thoughts in motion &rarr; LinkedIn</a>
            </p>
          </div>

          <div class="footer-link-col">
            <h4 class="footer-col-title">Explore</h4>
            <nav class="footer-nav" aria-label="Footer navigation">
              <a href="${homeHref}" class="footer-link">Home</a>
              <a href="${ideasHref}" class="footer-link">Ideas</a>
              <a href="${frameworkHref}" class="footer-link">STEWARD Framework<sup>&trade;</sup></a>
              <a href="${aboutHref}" class="footer-link">About</a>
            </nav>
          </div>

          <div class="footer-link-col">
            <h4 class="footer-col-title">The details</h4>
            <nav class="footer-nav" aria-label="Legal links">
              <a href="${assetPath(depth, "privacy-policy.html")}" class="footer-link">Privacy Policy</a>
              <a href="${assetPath(depth, "terms.html")}" class="footer-link">Terms of Use</a>
              <a href="${assetPath(depth, "disclaimer.html")}" class="footer-link">Disclaimer</a>
            </nav>
          </div>
        </div>

        <div class="footer-bottom">
          <p class="font-body footer-copyright">&copy; 2026 Ola Kelly. All rights reserved.</p>
        </div>
      </div>
    </footer>
  `;
}

function renderPageShell({ title, description, canonicalUrl, depth, currentNav, content, extraHead = "" }) {
  const stylesheetHref = assetPath(depth, `styles/main.css?v=${SITE_CSS_VERSION}`);
  const scriptHref = assetPath(depth, `scripts/main.js?v=${SITE_JS_VERSION}`);
  const faviconSvg = assetPath(depth, "favicon.svg");
  const favicon32 = assetPath(depth, "favicon-32x32.png");
  const favicon16 = assetPath(depth, "favicon-16x16.png");

  return `<!DOCTYPE html>
<html lang="en" class="h-full dark-mode">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeAttribute(description)}">
  <link rel="canonical" href="${escapeAttribute(canonicalUrl)}">

  <script src="https://cdn.tailwindcss.com/3.4.17"></script>
  <script src="https://cdn.jsdelivr.net/npm/lucide@0.263.0/dist/umd/lucide.min.js"></script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Allura&family=Lato:wght@300;400;700&family=Playfair+Display:wght@600;700&family=Raleway:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="icon" type="image/svg+xml" href="${faviconSvg}">
  <link rel="icon" type="image/png" sizes="32x32" href="${favicon32}">
  <link rel="icon" type="image/png" sizes="16x16" href="${favicon16}">
  <link rel="stylesheet" href="${stylesheetHref}">
  ${ANALYTICS_SNIPPET}
  ${extraHead}
</head>
<body class="h-full dark-mode">
  <div id="app-wrapper" class="w-full h-full overflow-auto">
    ${renderHeader(depth, currentNav)}
    ${content}
    ${renderFooter(depth)}
  </div>
  <script src="${scriptHref}"></script>
</body>
</html>`;
}

function renderPostMeta(post) {
  const parts = [];
  if (post.show_date) {
    parts.push(`<span>${escapeHtml(formatDisplayDate(post.date))}</span>`);
  }
  if (post.show_updated_date) {
    parts.push(`<span>Updated ${escapeHtml(formatDisplayDate(post.updated))}</span>`);
  }
  parts.push(`<span>${post.reading_time} min read</span>`);
  parts.push(`<span>${post.word_count} words</span>`);
  return parts.map((part) => `<span class="ideas-post-meta-item">${part}</span>`).join("");
}

function renderListingCard(post, depth, options = {}) {
  const { showDate = true } = options;
  const footerMeta = showDate ? `<p class="ideas-card-date">${escapeHtml(formatDisplayDate(post.date))}</p>` : "";
  return `
    <article class="ideas-card">
      <p class="ideas-card-category">${escapeHtml(post.category)}</p>
      <h2 class="font-heading ideas-card-title"><a href="${post.url}">${escapeHtml(post.title)}</a></h2>
      <p class="font-body ideas-card-excerpt">${escapeHtml(post.excerpt)}</p>
      <div class="ideas-card-footer">
        ${footerMeta}
        <a href="${post.url}" class="read-more-link cta-link">Read More</a>
      </div>
    </article>
  `;
}

function renderIdeasIndexPage(posts) {
  const featuredPosts = posts
    .filter((post) => post.homepage_featured && Number.isInteger(post.homepage_order) && post.homepage_order >= 1 && post.homepage_order <= 3)
    .sort((left, right) => left.homepage_order - right.homepage_order)
    .slice(0, 3);
  const featuredSlugs = new Set(featuredPosts.map((post) => post.slug));
  const morePosts = posts
    .filter((post) => !featuredSlugs.has(post.slug))
    .sort((left, right) => new Date(right.date) - new Date(left.date));

  const featuredSection = featuredPosts.length
    ? `
        <section class="ideas-index-section">
          <div class="container-shell">
            <div class="ideas-section-head">
              <h2 class="font-heading ideas-related-title">Featured Ideas</h2>
            </div>
            <div class="ideas-grid">
              ${featuredPosts.map((post) => renderListingCard(post, 1, { showDate: false })).join("")}
            </div>
          </div>
        </section>
      `
    : "";

  const moreSection = morePosts.length
    ? `
        <section class="ideas-index-section ideas-index-section-secondary">
          <div class="container-shell">
            <div class="ideas-section-head">
              <p class="ideas-kicker">Archive</p>
              <h2 class="font-heading ideas-related-title">More Ideas</h2>
            </div>
            <div class="ideas-grid">
              ${morePosts.map((post) => renderListingCard(post, 1, { showDate: false })).join("")}
            </div>
          </div>
        </section>
      `
    : "";

  return renderPageShell({
    title: `${IDEAS_TITLE} | ${SITE_NAME}`,
    description: IDEAS_DESCRIPTION,
    canonicalUrl: buildAbsoluteUrl("/ideas/"),
    depth: 1,
    currentNav: "ideas",
    content: `
      <main id="main-content" class="ideas-main">
        <section class="ideas-hero">
          <div class="container-shell">
            <div class="ideas-hero-inner">
              <p class="font-heading eyebrow-text">Ideas</p>
              <h1 class="font-heading ideas-page-title">Ideas</h1>
              <p class="font-body ideas-page-subhead">Essays, frameworks, and reflections on stewardship, responsibility, and the cost of carrying influence well.</p>
            </div>
          </div>
        </section>

        ${featuredSection}
        ${moreSection}
      </main>
    `
  });
}

function renderRelatedSection(title, posts) {
  if (!posts || !posts.length) return "";
  return `
      <section class="ideas-related-section">
        <div class="container-shell">
          <div class="ideas-related-head">
            <p class="ideas-kicker">Keep Reading</p>
            <h2 class="font-heading ideas-related-title">${escapeHtml(title)}</h2>
          </div>
          <div class="ideas-grid">
            ${posts.map((related) => renderListingCard(related, 2)).join("")}
          </div>
        </div>
      </section>
    `;
}

function renderPostPage(post, relatedPosts) {
  const relatedGroups = Array.isArray(relatedPosts)
    ? { categoryRelated: relatedPosts, tagRelated: [] }
    : (relatedPosts || { categoryRelated: [], tagRelated: [] });
  const relatedMarkup = [
    renderRelatedSection("More In This Category", relatedGroups.categoryRelated),
    renderRelatedSection("Related By Tags", relatedGroups.tagRelated)
  ].join("");

  const coverImage = post.cover_image
    ? `<figure class="ideas-cover-wrap"><img class="ideas-cover-image" src="${escapeAttribute(post.cover_image)}" alt="${escapeAttribute(post.cover_image_alt || post.title)}"></figure>`
    : "";
  return renderPageShell({
    title: post.seo_title,
    description: post.seo_description,
    canonicalUrl: post.canonical_url,
    depth: 2,
    currentNav: "ideas",
    content: `
      <main id="main-content" class="ideas-main">
        <article class="ideas-post-shell">
          <div class="container-shell">
            <div class="ideas-post-header">
              <a href="../../ideas/" class="ideas-back-link">Ideas</a>
              <p class="ideas-post-category"><a href="../../${escapeAttribute(buildCategoryUrl(post.category_slug).replace(/^\//, ""))}">${escapeHtml(post.category)}</a></p>
              <h1 class="font-heading ideas-post-title">${escapeHtml(post.title)}</h1>
              ${post.subtitle ? `<p class="font-body ideas-post-subtitle">${escapeHtml(post.subtitle)}</p>` : ""}
              <div class="ideas-post-meta">${renderPostMeta(post)}</div>
            </div>
            ${coverImage}
            <div class="ideas-post-body font-body">${post.content_html}</div>
            ${post.tags.length ? `<div class="ideas-tag-row">${post.tags.map((tag) => {
              const tagClass = STEWARD_TAGS.includes(tag) ? "ideas-tag ideas-tag-steward" : "ideas-tag ideas-tag-concept";
              return `<a class="${tagClass}" href="../../${escapeAttribute(buildTagUrl(tag).replace(/^\//, ""))}">${escapeHtml(tag)}</a>`;
            }).join("")}</div>` : ""}
            <p class="ideas-linkedin-note">Not every thought makes it to an essay. Some stay on <a href="${LINKEDIN_URL}" target="_blank" rel="noreferrer">LinkedIn</a>.</p>
          </div>
        </article>
        ${relatedMarkup}
      </main>
    `
  });
}

function renderCategoryPage(category, posts) {
  const cards = posts.map((post) => renderListingCard(post, 2)).join("");
  return renderPageShell({
    title: `${category.category} | ${IDEAS_TITLE} | ${SITE_NAME}`,
    description: `Posts in ${category.category}.`,
    canonicalUrl: buildAbsoluteUrl(buildCategoryUrl(category.category_slug)),
    depth: 2,
    currentNav: "ideas",
    content: `
      <main id="main-content" class="ideas-main">
        <section class="ideas-hero ideas-archive-hero">
          <div class="container-shell">
            <div class="ideas-hero-inner">
              <p class="font-heading eyebrow-text">Category Archive</p>
              <h1 class="font-heading ideas-page-title">${escapeHtml(category.category)}</h1>
              <p class="font-body ideas-page-subhead">Published ideas in this category.</p>
            </div>
          </div>
        </section>

        <section class="ideas-index-section">
          <div class="container-shell">
            <div class="ideas-grid">
              ${cards}
            </div>
          </div>
        </section>
      </main>
    `
  });
}

function renderRedirectPage(toSlug, depth) {
  const location = `${relativePrefix(depth)}ideas/${toSlug}/`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=${escapeAttribute(location)}">
  <link rel="canonical" href="${escapeAttribute(buildAbsoluteUrl(`/ideas/${toSlug}/`))}">
  <title>Redirecting…</title>
  <script>window.location.replace(${JSON.stringify(location)});</script>
</head>
<body>
  <p>Redirecting to <a href="${escapeAttribute(location)}">${escapeHtml(location)}</a>.</p>
</body>
</html>`;
}

function createPostsIndexJson(posts) {
  return {
    generated_at: new Date().toISOString(),
    total: posts.length,
    posts: posts.map((post) => ({
      id: post.id,
      title: post.title,
      subtitle: post.subtitle,
      slug: post.slug,
      url: post.url,
      status: post.status,
      featured: post.featured,
      homepage_featured: post.homepage_featured,
      homepage_order: post.homepage_order,
      date: post.date,
      updated: post.updated,
      category: post.category,
      category_slug: post.category_slug,
      tags: post.tags,
      excerpt: post.excerpt,
      intent: post.intent,
      seo_title: post.seo_title,
      seo_description: post.seo_description,
      canonical_url: post.canonical_url,
      reading_time: post.reading_time,
      word_count: post.word_count,
      show_date: post.show_date,
      show_updated_date: post.show_updated_date,
      cover_image: post.cover_image,
      cover_image_alt: post.cover_image_alt,
      related_posts: post.related_posts,
      content_html: post.content_html
    }))
  };
}

function createLatestPostsJson(posts) {
  const featuredPosts = posts
    .filter((post) => post.homepage_featured && Number.isInteger(post.homepage_order) && post.homepage_order >= 1 && post.homepage_order <= 3)
    .sort((left, right) => left.homepage_order - right.homepage_order);

  const selected = [];
  const selectedSlugs = new Set();

  featuredPosts.slice(0, 3).forEach((post) => {
    selected.push(post);
    selectedSlugs.add(post.slug);
  });

  if (selected.length < 3) {
    posts.forEach((post) => {
      if (selected.length >= 3) return;
      if (selectedSlugs.has(post.slug)) return;
      selected.push(post);
      selectedSlugs.add(post.slug);
    });
  }

  return {
    generated_at: new Date().toISOString(),
    posts: selected.map((post) => ({
      category: post.category,
      title: post.title,
      excerpt: post.excerpt,
      url: post.url,
      date: post.date
    }))
  };
}

function createFeedJson(posts) {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: `${SITE_NAME} Ideas`,
    home_page_url: SITE_URL,
    feed_url: `${SITE_URL}/feed.json`,
    description: IDEAS_DESCRIPTION,
    items: posts.map((post) => ({
      id: post.id,
      url: post.absolute_url,
      title: post.title,
      summary: post.excerpt,
      content_html: post.content_html,
      date_published: post.date,
      date_modified: post.updated,
      reading_time: post.reading_time,
      word_count: post.word_count,
      tags: post.tags,
      authors: post.authors
    }))
  };
}

function createFeedXml(posts) {
  const items = posts.map((post) => `
    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${escapeHtml(post.absolute_url)}</link>
      <guid>${escapeHtml(post.absolute_url)}</guid>
      <pubDate>${escapeHtml(formatRssDate(post.date))}</pubDate>
      <description>${escapeHtml(`${post.excerpt} (${post.reading_time} min read, ${post.word_count} words)` )}</description>
      <category>${escapeHtml(post.category)}</category>
    </item>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeHtml(`${SITE_NAME} Ideas`)}</title>
    <link>${escapeHtml(`${SITE_URL}/ideas/`)}</link>
    <description>${escapeHtml(IDEAS_DESCRIPTION)}</description>
    ${items}
  </channel>
</rss>`;
}

function serializeFrontMatter(post) {
  const tags = ensureArray(post.tags);
  const relatedPosts = ensureArray(post.related_posts);
  const coverImage = String(post.cover_image || "").trim();
  const coverImageAlt = String(post.cover_image_alt || "").trim();

  return `---
id: "${post.id}"
title: "${post.title.replace(/"/g, '\\"')}"
subtitle: "${String(post.subtitle || "").replace(/"/g, '\\"')}"
slug: "${post.slug}"
status: "${post.status}"
featured: ${post.featured ? "true" : "false"}
homepage_featured: ${post.homepage_featured ? "true" : "false"}
${post.homepage_order !== null ? `homepage_order: ${post.homepage_order}` : ""}
date: "${String(post.date).slice(0, 10)}"
updated: "${post.updated}"
category: "${post.category.replace(/"/g, '\\"')}"
category_slug: "${post.category_slug}"
tags:
${tags.map((tag) => `  - "${String(tag).replace(/"/g, '\\"')}"`).join("\n")}
excerpt: "${post.excerpt.replace(/"/g, '\\"')}"
intent: "${String(post.intent || "").replace(/"/g, '\\"')}"
seo_title: "${post.seo_title.replace(/"/g, '\\"')}"
seo_description: "${post.seo_description.replace(/"/g, '\\"')}"
canonical_url: "${String(post.canonical_url || "").replace(/"/g, '\\"')}"
show_date: ${post.show_date ? "true" : "false"}
show_updated_date: ${post.show_updated_date ? "true" : "false"}
cover_image: "${coverImage.replace(/"/g, '\\"')}"
cover_image_alt: "${coverImageAlt.replace(/"/g, '\\"')}"
related_posts:
${relatedPosts.map((slug) => `  - "${String(slug).replace(/"/g, '\\"')}"`).join("\n")}
---

${String(post.content_markdown || "").trim()}
`;
}

module.exports = {
  AUTHOR,
  IDEAS_DESCRIPTION,
  IDEAS_TITLE,
  LINKEDIN_URL,
  SITE_NAME,
  SITE_URL,
  buildAbsoluteUrl,
  buildCategoryUrl,
  buildPostUrl,
  computePost,
  createFeedJson,
  createFeedXml,
  createLatestPostsJson,
  createPostsIndexJson,
  filterPublished,
  getRelatedPosts,
  loadPosts,
  normalizeCategory,
  relativePrefix,
  renderCategoryPage,
  renderIdeasIndexPage,
  renderPageShell,
  renderPostPage,
  renderRedirectPage,
  serializeFrontMatter,
  slugify
};
