// Job-description matching. Pure functions plus one injected classifier, so
// node:test can exercise extraction and banding without downloading a model.
//
// Why a model here at all: the rubric in score.js measures the SHAPE of a
// resume — how many bullets carry a figure, which verbs they open with. It has
// no way to answer "does this resume show evidence for what this job asks
// for", because that is a question about meaning, not form.
//
// Why entailment rather than embeddings: the obvious approach is to embed
// requirements and bullets and rank by cosine. Measured on a real posting, that
// ranks a requirement the resume plainly does NOT meet ("five years managing a
// team of designers", 0.388) ABOVE ones it plainly does ("exposure to LLMs,
// prompting, retrieval and agents", 0.215) — because a bi-encoder scores
// topical resemblance, and "five years managing designers" resembles "software
// engineer, two years" as a sentence. Shipping a threshold on that would tell
// people confident falsehoods about their own resume.
//
// Natural language inference asks the question we actually mean: taking the
// bullet as the premise, does "this person has experience with X" follow? On
// the same cases that separates cleanly — covered 0.63-0.99, missing
// 0.11-0.18 — which is what the bands below are cut from.

export const MATCH = {
  // ~87MB quantized. The single largest thing this page can pull, so it is
  // fetched only when a job description is actually pasted.
  model: "Xenova/nli-deberta-v3-xsmall",

  // The premise is one resume bullet; this is the hypothesis tested against it.
  // Chosen by measurement, not taste. Against a labelled set of covered and
  // missing requirements this separated them by 0.42, where "this person has
  // professional experience with {}" managed 0.29 and "this resume
  // demonstrates: {}" collapsed to 0.02. Evidence-framing also survives
  // requirements written as duties ("implement well-scoped features"), which
  // the experience-framing mangles into bad grammar and scores as missing.
  hypothesisTemplate: "The candidate's background provides evidence for: {}",

  // Cut from the measured separation — covered scored 0.63-1.00, missing
  // 0.07-0.21. Set inside the gap rather than at its midpoint, and biased
  // toward under-claiming: a false "covered" is the costlier error, since it
  // tells someone to stop working on a real gap.
  coveredAt: 0.55,
  partialAt: 0.3,

  // Runtime is requirements x bullets forward passes. Both are capped so a
  // pasted novel cannot turn into a thousand-pass hang.
  maxRequirements: 12,
  maxBullets: 20,
};

// Sections that are never requirements, however they are worded. Matched
// against a lowercased line.
const BOILERPLATE = [
  "equal opportunity", "equal-opportunity", "we do not discriminate",
  "reasonable accommodation", "background check", "e-verify",
  "privacy policy", "applicant privacy", "salary range for this position",
  "benefits", "401", "paid time off", "parental leave", "stock purchase",
  "why you'll like", "why you will like", "about us", "our mission",
  "click here", "apply now", "learn more", "follow us",
  "application limit", "you may apply to a maximum",
];

// A requirement is a claim about the candidate. Headings, one-word lines and
// whole paragraphs of company narrative are not.
const MIN_LEN = 25;
const MAX_LEN = 220;

// A heading announces a section rather than asking for anything: short, no
// sentence-ending punctuation, and usually opening with one of these.
const HEADING_OPENERS =
  /^(what|who|why|how|about|the role|your|our|requirements?|qualifications?|responsibilities|bonus|nice to have|preferred|basic|minimum|skills|benefits|perks)\b/i;

const looksLikeHeading = (line) =>
  line.length < 60 && !/[.!?]$/.test(line) && HEADING_OPENERS.test(line);


/** Split a pasted job description into candidate requirement lines. */
export function extractRequirements(jdText, cfg = MATCH) {
  const lines = (jdText || "")
    .replace(/\r/g, "\n")
    // People paste straight out of a careers page, which often brings markup
    // with it — and some boards (Greenhouse among them) serve their postings
    // HTML-escaped, so the tags arrive as &lt;li&gt; rather than <li>.
    // Entities are decoded FIRST for that reason: strip tags before decoding
    // and the escaped ones survive as literal text in every requirement.
    // &amp; goes last, so "&amp;lt;" does not decode the whole way to "<".
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&rsquo;|&apos;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&amp;/gi, "&")
    // Block tags become line breaks so the list structure survives.
    .replace(/<\/?(p|div|li|ul|ol|br|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/ /g, " ")
    .split("\n")
    .map((l) => l.replace(/^[•\-–—*·▪◦]\s*/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const seen = new Set();
  const out = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.length < MIN_LEN || line.length > MAX_LEN) continue;
    if (BOILERPLATE.some((b) => lower.includes(b))) continue;
    if (looksLikeHeading(line)) continue;
    // Requirements are prose. A line with no verb-like structure is a heading
    // or a list of locations.
    if (!/\s/.test(line) || line.split(/\s+/).length < 4) continue;
    // Strip a leading bold label ("Engineering Foundation: roughly 1-3 years")
    // so the hypothesis reads as one claim rather than two.
    const stripped = line.replace(/^[A-Z][A-Za-z /&'-]{2,40}:\s*/, "");
    const key = stripped.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stripped);
    if (out.length >= cfg.maxRequirements) break;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Premises
// ---------------------------------------------------------------------------
// Matching against experience bullets alone leaves the model blind to whole
// classes of requirement. "Roughly 1-3 years of software engineering
// experience" scored 0.14 — MISSING — against a resume with exactly that,
// because no bullet states a tenure; it lives in the dates. Same for named
// technologies, which live in the skills section rather than in prose.
//
// So the pool gets two synthesized facts alongside the bullets. They are
// assembled from what parseResume already found, never invented.

/** Years spanned by the experience section, from the years written in it. */
export function tenureYears(doc) {
  const experience = (doc.sections?.experience || []).join(" ");
  const years = [...experience.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => +m[0]);
  if (!years.length) return null;
  // "Present"/"Current" has no year of its own; it means now.
  const end = /\b(present|current|now|ongoing)\b/i.test(experience)
    ? new Date().getFullYear()
    : Math.max(...years);
  const span = end - Math.min(...years);
  return span >= 0 && span <= 50 ? span : null;
}

/** Bullets plus synthesized profile facts, as premises for entailment. */
export function buildPremises(doc, cfg = MATCH) {
  const facts = [];

  const years = tenureYears(doc);
  if (years !== null) {
    facts.push(
      `This resume shows ${years === 0 ? "under a year" : `${years} years`} of professional work experience.`,
    );
  }

  const skills = (doc.sections?.skills || []).join(" ").trim();
  if (skills) facts.push(`Skills: ${skills.slice(0, 400)}`);

  return [...facts, ...(doc.bullets || []).slice(0, cfg.maxBullets)];
}

export const bandFor = (score, cfg = MATCH) =>
  score >= cfg.coveredAt ? "covered" : score >= cfg.partialAt ? "partial" : "missing";

/**
 * Score each requirement against the resume's premises.
 *
 * `classify(premise, labels)` must resolve to entailment scores aligned with
 * `labels`. Injected so this stays testable and so the caller owns the model
 * lifetime.
 *
 * One call per premise, with every requirement passed as a label, rather than
 * one call per pair. The arithmetic is identical — multi_label scores each
 * label independently — but in the browser the per-call overhead dominates the
 * arithmetic: measured on WebGPU, 12 requirements x 10 premises as 120 separate
 * calls took ~40s, where 10 batched calls do the same work in a fraction of it.
 * (Under node's native runtime the two are indistinguishable, which is exactly
 * why this needed measuring in a browser rather than reasoning about.)
 */
export async function matchRequirements(requirements, premises, classify, cfg = MATCH, onProgress) {
  const pool = premises.slice(0, cfg.maxBullets);
  if (!requirements.length || !pool.length) return [];

  const best = requirements.map(() => ({ score: 0, evidence: null }));

  for (let p = 0; p < pool.length; p++) {
    const scores = await classify(pool[p], requirements);
    for (let r = 0; r < requirements.length; r++) {
      if (scores[r] > best[r].score) best[r] = { score: scores[r], evidence: pool[p] };
    }
    onProgress?.((p + 1) / pool.length);
  }

  const results = requirements.map((requirement, i) => ({
    requirement,
    score: best[i].score,
    band: bandFor(best[i].score, cfg),
    // Only worth showing as evidence if it actually is any.
    evidence: best[i].score >= cfg.partialAt ? best[i].evidence : null,
  }));

  // Worst first: the gaps are the reason to run this.
  return results.sort((a, b) => a.score - b.score);
}

/**
 * One number for the panel. Partial credit is half, because a partial match is
 * a real but unproven claim — it usually means the resume has the experience
 * and buries it, which is worth something but not full marks.
 */
export function coverageScore(matches) {
  if (!matches.length) return 0;
  const credit = matches.reduce(
    (sum, m) => sum + (m.band === "covered" ? 1 : m.band === "partial" ? 0.5 : 0),
    0,
  );
  return Math.round((credit / matches.length) * 100);
}
