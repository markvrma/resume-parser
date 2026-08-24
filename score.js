// Scoring engine. Pure functions over an extracted-resume object — no DOM, no
// fetch, no I/O — so node:test can import this file directly.
//
// The benchmark lives here as a const rather than a JSON file on purpose: a
// fetch() would need an await before first paint and would fail outright when
// index.html is opened from file://, which is how this gets demoed offline.

// ---------------------------------------------------------------------------
// Benchmark
// ---------------------------------------------------------------------------
// Every target below is a documented rule of thumb from public hiring guidance,
// NOT a measurement of real engineers' resumes. See README "Methodology" for
// the citation behind each number. Treat them as opinionated defaults.

export const BENCHMARK = {
  id: "swe",
  label: "Computer Science / Software Engineering",

  // Weights sum to 1. Impact carries the most because it is the single thing
  // every published resume guide agrees on.
  weights: {
    impact: 0.35,
    breadth: 0.25,
    ownership: 0.2,
    hygiene: 0.2,
  },

  // Share of experience bullets that should contain a concrete figure.
  impactTarget: 0.6,

  // Technology categories. Coverage is scored per category, not per keyword, so
  // listing nine JavaScript frameworks does not out-score a real full-stack range.
  techCategories: {
    languages: [
      "python", "java", "javascript", "typescript", "c++", "c#", "golang", "go",
      "rust", "ruby", "kotlin", "swift", "scala", "php", "objective-c", "matlab", "r",
    ],
    web: [
      "react", "angular", "vue", "svelte", "next.js", "nextjs", "nuxt", "node",
      "express", "django", "flask", "fastapi", "spring", "rails", "graphql",
      "rest api", "restful", "html", "css", "tailwind",
    ],
    data: [
      "sql", "postgres", "postgresql", "mysql", "mongodb", "redis", "sqlite",
      "elasticsearch", "kafka", "spark", "hadoop", "pandas", "numpy", "snowflake",
      "dynamodb", "bigquery", "airflow", "etl",
    ],
    infra: [
      "aws", "gcp", "azure", "docker", "kubernetes", "k8s", "terraform", "ansible",
      "jenkins", "github actions", "gitlab ci", "ci/cd", "linux", "nginx",
      "serverless", "lambda", "microservices", "grafana", "prometheus",
    ],
    testing: [
      "jest", "pytest", "junit", "mocha", "vitest", "selenium", "cypress",
      "playwright", "unit test", "integration test", "tdd", "test coverage",
      "rspec", "testng",
    ],
  },

  // Of the five categories above, how many a strong generalist SDE resume shows.
  techCategoryTarget: 4,

  // Verbs that signal you drove the work rather than were present for it.
  // Deliberately excludes "developed"/"implemented"/"created" — those are the
  // default verbs on nearly every resume and so carry no signal.
  ownershipVerbs: [
    "led", "owned", "designed", "architected", "spearheaded", "drove", "founded",
    "launched", "shipped", "scaled", "mentored", "established", "delivered",
    "headed", "directed", "initiated", "championed", "pioneered", "orchestrated",
    "revamped", "overhauled", "migrated", "rearchitected",
  ],

  // Share of experience bullets that should open with an ownership verb.
  ownershipTarget: 0.35,

  // Phrases that actively read as passive to recruiters and ATS screens.
  weakPhrases: [
    "responsible for", "worked on", "helped with", "assisted with", "assisted in",
    "participated in", "involved in", "duties included", "tasked with",
    "familiar with", "exposure to",
  ],

  // Single-page resume for under ~10 years of experience.
  wordRange: [350, 850],

  // Contact channels a technical resume is expected to carry.
  contactFields: ["email", "phone", "linkedin", "github"],

  // Sections expected to be present and findable by an ATS.
  expectedSections: ["experience", "skills", "education"],
};

// ---------------------------------------------------------------------------
// Extraction: raw resume text -> doc
// ---------------------------------------------------------------------------
// Lives here rather than in app.js because it is pure string work with no DOM
// and no pdf.js, which means node:test can exercise it directly. app.js only
// owns "PDF bytes -> text" and "doc -> pixels".

// One alternation per section family. The old Python version carried 248 lines
// of synonym tuples across six families; four families and the common synonyms
// cover the same resumes.
const SECTION_PATTERNS = {
  experience: /^(work\s+)?(experience|employment|work history|professional (experience|background))/i,
  skills: /^(technical\s+|core\s+)?(skills|technologies|proficiencies|competencies|tech stack)/i,
  education: /^(education|academic)/i,
  projects: /^(personal\s+|side\s+)?(projects|portfolio)/i,
  summary: /^(summary|objective|profile|about)/i,
  awards: /^(awards|achievements|honors|certifications|publications)/i,
};

const CONTACT_PATTERNS = {
  email: /[\w.+-]+@[\w-]+\.[\w.-]+/,
  // Deliberately loose: international formats vary far too much to pin down,
  // and a false positive here costs less than telling someone their real phone
  // number is missing.
  phone: /(\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/,
  linkedin: /linkedin\.com\/[\w/-]+/i,
  github: /github\.(com|io)\/[\w/-]+/i,
};

// A heading is short, has no trailing sentence punctuation, and is not itself a
// bullet. Length is the load-bearing check — "Experience designing systems..."
// is a bullet, "EXPERIENCE" is a heading.
const isHeading = (line) =>
  line.length <= 45 && !/[.,;]$/.test(line) && !/^[•\-–*·]/.test(line);

const BULLET_MARK = /^[•\-–—*·▪◦]\s*/;

export function parseResume(rawText) {
  const text = (rawText || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ") // non-breaking space
    .replace(/\uf0b7/g, "\u2022") // Word's private-use bullet glyph
    .replace(/\(cid:\d{1,3}\)/g, " "); // pdf font-encoding leakage

  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  // Locate headings. Each becomes a boundary; everything until the next
  // boundary belongs to it.
  const marks = [];
  lines.forEach((line, i) => {
    if (!isHeading(line)) return;
    for (const [name, re] of Object.entries(SECTION_PATTERNS)) {
      if (re.test(line)) {
        marks.push({ name, index: i });
        break;
      }
    }
  });

  const sections = {};
  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : lines.length;
    const body = lines.slice(mark.index + 1, end);
    // A resume can repeat a family (two "Projects" blocks); merge rather than
    // let the later one silently win.
    sections[mark.name] = (sections[mark.name] || []).concat(body);
  });

  // Bullets come from the sections where achievements actually live. With no
  // recognisable headings at all, fall back to every substantial line so the
  // resume still gets scored instead of silently reading as empty.
  const bulletSource = marks.length
    ? [...(sections.experience || []), ...(sections.projects || [])]
    : lines;

  const bullets = bulletSource
    .filter((l) => BULLET_MARK.test(l) || l.length > 40)
    .map((l) => l.replace(BULLET_MARK, "").trim())
    .filter((l) => l.length > 15);

  const contact = {};
  for (const [field, re] of Object.entries(CONTACT_PATTERNS)) {
    const m = text.match(re);
    if (m) contact[field] = m[0];
  }

  return {
    text,
    lines,
    sections,
    bullets,
    contact,
    words: text.split(/\s+/).filter(Boolean).length,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const clamp100 = (n) => Math.max(0, Math.min(100, Math.round(n)));

// Ratio against a target, where hitting the target is 100. Going beyond the
// target does not earn more than 100 — there is no prize for a resume that is
// 100% numbers.
const ratioScore = (actual, target) => clamp100((actual / target) * 100);

// Years read as bare numbers and would inflate the impact score on every bullet
// that happens to mention one, so they are removed before looking for figures.
const stripYears = (s) => s.replace(/\b(19|20)\d{2}\b/g, " ");

// A "figure" is a percentage, a currency amount, a magnitude with a unit, a
// multiplier, or any bare number of two digits or more. Single digits are
// excluded: "3 microservices" is not the kind of quantification that matters,
// and single digits appear constantly in version numbers and list markers.
const FIGURE = new RegExp(
  [
    "\\d+(?:\\.\\d+)?\\s*%",
    "[$£€]\\s?\\d",
    "\\d+(?:\\.\\d+)?\\s*[kmb]\\b",
    "\\d+(?:\\.\\d+)?\\s*x\\b",
    "\\d+(?:\\.\\d+)?\\s*(?:ms|sec|seconds?|mins?|minutes?|hours?|days?|weeks?|months?|gb|tb|mb|qps|rps|req/s|users?|customers?|clients?|requests?|records?|rows?|engineers?|people|teams?)\\b",
    "\\b\\d{2,}\\b",
  ].join("|"),
  "i",
);

export const hasFigure = (line) => FIGURE.test(stripYears(line));

const startsWithOwnershipVerb = (line, verbs) => {
  const first = line.toLowerCase().replace(/^[^a-z]+/, "").split(/\s+/)[0] || "";
  return verbs.includes(first.replace(/[^a-z]/g, ""));
};

// ---------------------------------------------------------------------------
// Dimension scorers
// ---------------------------------------------------------------------------
// Each returns { score, detail, tip }. `verdict` is deliberately NOT stored —
// it is a threshold on score, so the renderer derives it.

export function scoreImpact(doc, bench = BENCHMARK) {
  const bullets = doc.bullets || [];
  if (!bullets.length) {
    return {
      score: 0,
      detail: "No experience bullets found.",
      tip: "Break your experience into bullet points — a wall of prose is hard for both recruiters and ATS parsers to read.",
    };
  }

  const quantified = bullets.filter(hasFigure);
  const ratio = quantified.length / bullets.length;
  const score = ratioScore(ratio, bench.impactTarget);
  const pct = Math.round(ratio * 100);

  return {
    score,
    detail: `${quantified.length} of ${bullets.length} bullets (${pct}%) contain a concrete figure. Benchmark: ${Math.round(bench.impactTarget * 100)}%.`,
    tip:
      score >= 90
        ? "Strong. Your bullets show outcomes, not duties."
        : `Add numbers to ${Math.max(1, Math.ceil(bench.impactTarget * bullets.length) - quantified.length)} more bullets. Latency saved, users served, cost cut, percent faster — any real figure beats "improved performance".`,
  };
}

// Keyword hits must be whole tokens. Plain substring matching credited the
// "languages" category to any resume containing the letter r — "r" is on the
// list — and credited it again for Django, which contains "go". Every resume
// ever written scored a free category.
//
// The boundary class excludes + # . / so that c++, c#, next.js and ci/cd match
// as themselves rather than being split at their own punctuation.
const BOUNDARY = "[^a-z0-9+#./]";

const keywordHit = (haystack, keyword) => {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|${BOUNDARY})${escaped}($|${BOUNDARY})`, "i").test(haystack);
};

export function scoreBreadth(doc, bench = BENCHMARK) {
  const haystack = (doc.text || "").toLowerCase();
  const covered = [];
  const missing = [];

  for (const [category, keywords] of Object.entries(bench.techCategories)) {
    const hits = keywords.filter((k) => keywordHit(haystack, k));
    (hits.length ? covered : missing).push(category);
  }

  const score = ratioScore(covered.length, bench.techCategoryTarget);

  return {
    score,
    detail: `${covered.length} of ${Object.keys(bench.techCategories).length} technology areas represented${covered.length ? ": " + covered.join(", ") : ""}. Benchmark: ${bench.techCategoryTarget}.`,
    tip: missing.length
      ? `Nothing found for: ${missing.join(", ")}. If you have real exposure there, name the specific tools — breadth across areas reads stronger than depth in one.`
      : "Strong. Your stack spans every area a generalist SDE role screens for.",
  };
}

export function scoreOwnership(doc, bench = BENCHMARK) {
  const bullets = doc.bullets || [];
  if (!bullets.length) {
    return {
      score: 0,
      detail: "No experience bullets found.",
      tip: "Open each bullet with a verb that says what you drove.",
    };
  }

  const owned = bullets.filter((b) => startsWithOwnershipVerb(b, bench.ownershipVerbs));
  const ratio = owned.length / bullets.length;
  const score = ratioScore(ratio, bench.ownershipTarget);

  const text = (doc.text || "").toLowerCase();
  const weakFound = bench.weakPhrases.filter((p) => text.includes(p));

  let tip;
  if (weakFound.length) {
    tip = `Replace passive phrasing — found "${weakFound.slice(0, 3).join('", "')}". Recruiters read those as "was in the room".`;
  } else if (score >= 90) {
    tip = "Strong. Your bullets read as work you drove, not work you were near.";
  } else {
    tip = `Open more bullets with ownership verbs (led, designed, shipped, migrated, mentored) instead of the default "developed"/"implemented".`;
  }

  return {
    score,
    detail: `${owned.length} of ${bullets.length} bullets open with an ownership verb. Benchmark: ${Math.round(bench.ownershipTarget * 100)}%.`,
    tip,
  };
}

export function scoreHygiene(doc, bench = BENCHMARK) {
  // No text at all means nothing was extracted — typically a scanned or
  // image-only PDF. Without this guard the wrong-length branch below still pays
  // out partial credit, and an empty document scores above zero.
  if (!doc.words) {
    return {
      score: 0,
      detail: "No text could be read from this file.",
      tip: "If your resume is a scan or an image, paste the text in instead — there is nothing here to parse.",
    };
  }

  const contact = doc.contact || {};
  const found = bench.contactFields.filter((f) => contact[f]);
  const sections = doc.sections || {};
  const sectionsFound = bench.expectedSections.filter((s) => sections[s]);

  const words = doc.words || 0;
  const [lo, hi] = bench.wordRange;
  const lengthOk = words >= lo && words <= hi;

  // Three equally weighted sub-checks: reachable, parseable, right length.
  const parts = [
    found.length / bench.contactFields.length,
    sectionsFound.length / bench.expectedSections.length,
    lengthOk ? 1 : 0.4,
  ];
  const score = clamp100((parts.reduce((a, b) => a + b, 0) / parts.length) * 100);

  const problems = [];
  const missingContact = bench.contactFields.filter((f) => !contact[f]);
  if (missingContact.length) problems.push(`no ${missingContact.join("/")} found`);
  const missingSections = bench.expectedSections.filter((s) => !sections[s]);
  if (missingSections.length) problems.push(`no clear ${missingSections.join("/")} heading`);
  if (words < lo) problems.push(`only ${words} words — thin for a full resume`);
  if (words > hi) problems.push(`${words} words — long for a single page`);

  return {
    score,
    detail: `${found.length}/${bench.contactFields.length} contact channels, ${sectionsFound.length}/${bench.expectedSections.length} standard sections, ${words} words.`,
    tip: problems.length
      ? `Fix the basics first: ${problems.join("; ")}. These cost nothing and are what automated screens check.`
      : "Strong. Reachable, parseable, and the right length.",
  };
}

// ---------------------------------------------------------------------------
// Top level
// ---------------------------------------------------------------------------

export const DIMENSIONS = [
  { key: "impact", label: "Impact & quantification", fn: scoreImpact },
  { key: "breadth", label: "Technical breadth", fn: scoreBreadth },
  { key: "ownership", label: "Ownership signals", fn: scoreOwnership },
  { key: "hygiene", label: "Structural hygiene", fn: scoreHygiene },
];

export function scoreResume(doc, bench = BENCHMARK) {
  const dimensions = DIMENSIONS.map(({ key, label, fn }) => ({
    key,
    label,
    weight: bench.weights[key],
    ...fn(doc, bench),
  }));

  const overall = clamp100(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
  );

  return { overall, dimensions };
}
