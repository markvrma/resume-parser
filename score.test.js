// node --test score.test.js
//
// One file, two inline fixtures. The assertions are about ORDER and DIRECTION,
// not exact numbers: a test that pins scoreImpact to 73 just asserts the
// benchmark constant against itself and has to be rewritten every time a target
// is tuned. What must never break is "the strong resume outscores the weak one".

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BENCHMARK,
  DIMENSIONS,
  hasFigure,
  parseResume,
  scoreResume,
} from "./score.js";

const STRONG = `
Jane Okafor
jane.okafor@example.com | +1 415 555 0147 | linkedin.com/in/janeokafor | github.com/janeokafor

SUMMARY
Backend engineer with six years building payment and identity systems at scale.

EXPERIENCE

Senior Software Engineer, Northwind Payments
2022 - Present
• Led the migration of the settlement pipeline from a Python monolith to 12 Go microservices, cutting p99 latency from 840ms to 120ms.
• Designed an idempotent retry layer in Kafka that eliminated 99.4% of duplicate charge incidents, saving roughly $2.1M in annual chargeback exposure.
• Scaled the ledger service from 4000 to 55000 requests per second by replacing per-row Postgres locks with partitioned batch commits.
• Mentored 5 engineers through promotion, and established the on-call rotation and runbook process now used by 3 sibling teams.
• Drove adoption of Terraform across 40 AWS accounts, reducing environment provisioning from 3 days to 25 minutes.

Software Engineer, Fabrica Systems
2019 - 2022
• Shipped a React and TypeScript merchant dashboard used by 12000 businesses, improving task completion rates by 34%.
• Built an ETL pipeline in Spark that consolidated 18 upstream sources into Snowflake, cutting reporting lag from 26 hours to 40 minutes.
• Migrated the test suite to pytest with 91% coverage, which reduced production regressions by 62% year over year.
• Owned the GraphQL gateway serving 8 client applications and 300 million monthly requests.

PROJECTS
• Built an open source Kubernetes operator for Redis failover, adopted by 1400 repositories on GitHub.

SKILLS
Languages: Go, Python, TypeScript, Java, Rust
Web: React, Node, GraphQL, REST API, Django
Data: PostgreSQL, Kafka, Spark, Snowflake, Redis, MongoDB
Infra: AWS, Docker, Kubernetes, Terraform, CI/CD, Linux, Prometheus
Testing: pytest, Jest, Cypress, integration test, TDD

EDUCATION
B.S. Computer Science, University of Lagos
`;

const WEAK = `
Sam Rivera
sam.rivera@example.com

EXPERIENCE

Software Developer, Acme Corp
• Responsible for working on various features of the company web application.
• Helped with fixing bugs that were reported by the quality assurance team.
• Participated in daily standup meetings and sprint planning sessions with the team.
• Worked on the backend codebase and made improvements to existing functionality.
• Involved in code reviews and gave feedback to other developers on the team.

SKILLS
JavaScript, HTML, CSS

EDUCATION
B.S. Computer Science
`;

const strongDoc = parseResume(STRONG);
const weakDoc = parseResume(WEAK);
const strong = scoreResume(strongDoc);
const weak = scoreResume(weakDoc);

// --- the assertion that matters ------------------------------------------

test("strong resume outscores weak resume overall", () => {
  assert.ok(
    strong.overall > weak.overall,
    `expected strong (${strong.overall}) > weak (${weak.overall})`,
  );
});

test("strong resume outscores weak resume on every dimension", () => {
  for (const dim of DIMENSIONS) {
    const s = strong.dimensions.find((d) => d.key === dim.key).score;
    const w = weak.dimensions.find((d) => d.key === dim.key).score;
    assert.ok(s > w, `${dim.key}: expected strong (${s}) > weak (${w})`);
  }
});

// --- guards on the pieces that silently rot -------------------------------

test("figure detection ignores years but catches real magnitudes", () => {
  assert.ok(hasFigure("Cut p99 latency by 45%"));
  assert.ok(hasFigure("Served 12000 merchants"));
  assert.ok(hasFigure("Saved $2.1M annually"));
  assert.ok(hasFigure("Reduced build time to 90 seconds"));
  // A bare year is not an accomplishment.
  assert.ok(!hasFigure("Worked here from 2019 to 2022"));
  assert.ok(!hasFigure("Improved application performance significantly"));
});

test("sections and contact are extracted from a normal resume", () => {
  assert.ok(strongDoc.sections.experience, "experience section missing");
  assert.ok(strongDoc.sections.skills, "skills section missing");
  assert.ok(strongDoc.sections.education, "education section missing");
  assert.equal(strongDoc.contact.email, "jane.okafor@example.com");
  assert.ok(strongDoc.contact.linkedin);
  assert.ok(strongDoc.contact.github);
  assert.ok(strongDoc.contact.phone);
});

test("bullets come from experience and projects, not from skills lists", () => {
  assert.ok(strongDoc.bullets.length >= 9, `got ${strongDoc.bullets.length}`);
  assert.ok(
    !strongDoc.bullets.some((b) => b.startsWith("Languages:")),
    "skills lines leaked into bullets",
  );
});

test("weak resume is told what is missing, not just given a number", () => {
  for (const d of weak.dimensions) {
    assert.ok(d.tip && d.tip.length > 20, `${d.key} has no usable tip`);
  }
  const hygiene = weak.dimensions.find((d) => d.key === "hygiene");
  assert.match(hygiene.tip, /phone|linkedin|github/i);
});

test("a resume with no recognisable headings still gets scored", () => {
  const doc = parseResume(
    "Built a distributed cache in Go that cut read latency by 60% across 30 services.\n" +
      "Led a team of 4 engineers delivering the billing rewrite two weeks early.",
  );
  assert.ok(doc.bullets.length === 2, `got ${doc.bullets.length} bullets`);
  assert.ok(scoreResume(doc).overall > 0);
});

test("empty input scores zero without throwing", () => {
  const result = scoreResume(parseResume(""));
  assert.equal(result.overall, 0);
});

test("benchmark weights sum to 1", () => {
  const total = Object.values(BENCHMARK.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `weights sum to ${total}`);
});
