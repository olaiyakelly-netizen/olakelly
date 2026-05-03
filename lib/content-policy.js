"use strict";

const { z } = require("zod");

const STEWARD_TAGS = [
  "Scope",
  "Trade-Offs",
  "Energy",
  "Weight",
  "Alignment",
  "Risk",
  "Deliberate Boundaries"
];

const CONCEPT_TAGS = [
  "stewardship",
  "capacity",
  "decision-making",
  "boundaries",
  "leadership",
  "judgment",
  "authority",
  "priorities",
  "sustainability",
  "timing",
  "readiness",
  "trade-offs",
  "energy"
];

const CATEGORIES = [
  "Sustainable Leadership",
  "Decision-Making",
  "Capacity & Energy",
  "Boundaries & Trade-Offs",
  "Judgment & Authority",
  "Invisible Impact",
  "Timing & Readiness"
];

const FORBIDDEN_TAGS = [
  "scheduled",
  "published",
  "draft",
  "blog",
  "linkedin",
  "placeholder",
  "long-form"
];

const CATEGORY_SLUGS = {
  "Sustainable Leadership": "sustainable-leadership",
  "Decision-Making": "decision-making",
  "Capacity & Energy": "capacity-energy",
  "Boundaries & Trade-Offs": "boundaries-trade-offs",
  "Judgment & Authority": "judgment-authority",
  "Invisible Impact": "invisible-impact",
  "Timing & Readiness": "timing-readiness"
};

const APPROVED_TAGS = new Set([...STEWARD_TAGS, ...CONCEPT_TAGS]);
const FORBIDDEN_TAG_SET = new Set(FORBIDDEN_TAGS);

const postPayloadSchema = z.object({
  id: z.string().optional().default(""),
  draft_id: z.string().optional().default(""),
  title: z.string().trim().min(1, "Title is required."),
  subtitle: z.string().optional().default(""),
  slug: z.string().optional().default(""),
  original_slug: z.string().optional().default(""),
  published_slug: z.string().optional().default(""),
  category: z.string().trim().min(1, "Category is required."),
  tags: z.array(z.string()).min(1, "At least one tag is required."),
  excerpt: z.string().trim().min(1, "Excerpt is required.").max(200, "Excerpt must be 200 characters or fewer."),
  intent: z.string().optional().default(""),
  featured: z.boolean().optional().default(false),
  homepage_featured: z.boolean().optional().default(false),
  homepage_order: z.union([z.string(), z.number(), z.null()]).optional().default(""),
  status: z.enum(["draft", "published"]).optional().default("draft"),
  date: z.string().optional().default(""),
  updated: z.string().optional().default(""),
  category_slug: z.string().optional().default(""),
  show_date: z.boolean().optional().default(true),
  show_updated_date: z.boolean().optional().default(false),
  seo_title: z.string().optional().default(""),
  seo_description: z.string().optional().default(""),
  canonical_url: z.string().optional().default(""),
  content: z.string().trim().min(1, "Content is required."),
  cover_image: z.string().optional().default(""),
  cover_image_alt: z.string().optional().default(""),
  cover_image_data: z.string().optional().default(""),
  related_posts: z.preprocess((value) => value == null ? [] : value, z.array(z.string())).optional().default([]),
  confirm_slug_change: z.boolean().optional().default(false)
}).strict();

function validateTaxonomy({ category, tags, category_slug }) {
  if (!CATEGORIES.includes(category)) {
    throw new Error(`Invalid category "${category}". Use one approved category exactly as written.`);
  }

  if (category_slug && category_slug !== CATEGORY_SLUGS[category]) {
    throw new Error(`Invalid category_slug "${category_slug}" for category "${category}". Expected "${CATEGORY_SLUGS[category]}".`);
  }

  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error("At least one approved tag is required.");
  }

  const seen = new Set();
  tags.forEach((tag) => {
    if (FORBIDDEN_TAG_SET.has(tag)) {
      throw new Error(`Forbidden workflow tag "${tag}" cannot be used as content taxonomy.`);
    }
    if (!APPROVED_TAGS.has(tag)) {
      throw new Error(`Invalid tag "${tag}". Tags are case-sensitive and must match the approved vocabulary exactly.`);
    }
    if (seen.has(tag)) {
      throw new Error(`Duplicate tag "${tag}" is not allowed.`);
    }
    seen.add(tag);
  });
}

function validatePostPayload(payload) {
  const parsed = postPayloadSchema.parse(payload);
  validateTaxonomy(parsed);
  return {
    ...parsed,
    category_slug: CATEGORY_SLUGS[parsed.category]
  };
}

function validateFrontMatter(fileName, data) {
  const allowedFields = new Set([
    "id",
    "title",
    "subtitle",
    "slug",
    "status",
    "featured",
    "homepage_featured",
    "homepage_order",
    "date",
    "updated",
    "category",
    "category_slug",
    "tags",
    "excerpt",
    "intent",
    "seo_title",
    "seo_description",
    "canonical_url",
    "show_date",
    "show_updated_date",
    "cover_image",
    "cover_image_alt",
    "related_posts"
  ]);

  Object.keys(data || {}).forEach((field) => {
    if (!allowedFields.has(field)) {
      throw new Error(`${fileName} has unknown frontmatter field "${field}".`);
    }
  });

  validateTaxonomy({
    category: String(data.category || "").trim(),
    category_slug: String(data.category_slug || "").trim(),
    tags: Array.isArray(data.tags) ? data.tags : []
  });
}

module.exports = {
  CATEGORIES,
  CATEGORY_SLUGS,
  CONCEPT_TAGS,
  FORBIDDEN_TAGS,
  STEWARD_TAGS,
  validateFrontMatter,
  validatePostPayload,
  validateTaxonomy
};
