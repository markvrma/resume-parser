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
