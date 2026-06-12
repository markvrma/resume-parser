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
