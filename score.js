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
