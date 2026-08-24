// Everything here runs without the model. The classifier is injected, so the
// extraction, banding and aggregation are testable in milliseconds; what the
// model itself does is a calibration question, recorded in match.js.

import test from "node:test";
import assert from "node:assert/strict";
import { parseResume } from "./score.js";
import {
  MATCH,
  extractRequirements,
  matchRequirements,
  coverageScore,
  bandFor,
  buildPremises,
  tenureYears,
} from "./match.js";

test("requirements survive a posting pasted as escaped HTML", () => {
  // Greenhouse serves postings with the tags escaped. Decoding has to happen
  // before tag-stripping or every requirement keeps a literal <li> on the front.
  const jd = `
    &lt;ul&gt;
    &lt;li&gt;Roughly 1-3 years of software engineering experience in production.&lt;/li&gt;
    &lt;li&gt;Solid fundamentals in Python, Go or TypeScript, and a willingness to learn.&lt;/li&gt;
    &lt;/ul&gt;
  `;
  const reqs = extractRequirements(jd);

  assert.equal(reqs.length, 2);
  for (const r of reqs) {
    assert.ok(!r.includes("<"), `tag leaked into: ${r}`);
    assert.ok(!r.includes("&lt;"), `entity leaked into: ${r}`);
  }
  assert.ok(reqs[0].startsWith("Roughly 1-3 years"));
});

test("boilerplate and headings are not requirements", () => {
  const jd = [
    "What You'll Add to the Team",
    "Five years of experience building distributed backend systems at scale.",
    "DigitalOcean is an equal-opportunity employer and we do not discriminate.",
    "The salary range for this position is based on market data and experience.",
    "Requirements",
    "Strong written communication across engineering and business stakeholders.",
  ].join("\n");

  const reqs = extractRequirements(jd);

  assert.equal(reqs.length, 2);
  assert.ok(reqs.every((r) => !/equal-opportunity|salary range/i.test(r)));
  assert.ok(reqs.every((r) => r !== "Requirements" && !r.startsWith("What You'll Add")));
});

test("requirement count is capped so a pasted novel cannot hang the page", () => {
  const jd = Array.from(
    { length: 200 },
    (_, i) => `Experience number ${i} with building and shipping production software systems.`,
  ).join("\n");

  assert.equal(extractRequirements(jd).length, MATCH.maxRequirements);
});

test("tenure and skills become premises, so date-shaped requirements can match", () => {
  // No bullet states a tenure — it lives in the dates. Without the synthesized
  // fact, "1-3 years of experience" has nothing to match against at all.
  const doc = parseResume(`
EXPERIENCE
Acme Corp - Software Engineer, Jan 2021 - Present
Shipped a billing service handling 40k requests per second.

SKILLS
Python, Rust, Kubernetes

EDUCATION
B.Tech, 2020
  `);

  assert.equal(tenureYears(doc), new Date().getFullYear() - 2021);

  const premises = buildPremises(doc);
  assert.ok(premises.some((p) => /years of professional work experience/.test(p)));
  assert.ok(premises.some((p) => p.startsWith("Skills:") && p.includes("Rust")));
  // The education year must not be mistaken for the start of a career.
  assert.ok(!premises.some((p) => /\b\d{2,} years\b/.test(p) && /2020/.test(p)));
});

test("a resume with no dated experience simply has no tenure fact", () => {
  const doc = parseResume("SKILLS\nPython, Rust\n\nEXPERIENCE\nBuilt some things that were quite good.");
  assert.equal(tenureYears(doc), null);
  assert.ok(!buildPremises(doc).some((p) => /years of professional/.test(p)));
});

test("each requirement keeps its own score when scored in one batched call", async () => {
  // The pipeline returns labels ordered by score rather than as given, so a
  // batched call is exactly where scores can end up on the wrong requirement.
  // This classifier answers per-label, so a mix-up shows up as a wrong band.
  const truth = { alpha: 0.9, beta: 0.45, gamma: 0.05 };
  const classify = async (_premise, labels) => labels.map((l) => truth[l]);

  const matches = await matchRequirements(["alpha", "beta", "gamma"], ["a bullet"], classify);
  const byName = Object.fromEntries(matches.map((m) => [m.requirement, m]));

  assert.equal(byName.alpha.band, "covered");
  assert.equal(byName.beta.band, "partial");
  assert.equal(byName.gamma.band, "missing");
  assert.equal(byName.alpha.score, 0.9);
});

test("a requirement takes its best premise, and weak matches show no evidence", async () => {
  const scores = { "the weak one": 0.2, "the strong one": 0.8 };
  const classify = async (premise, labels) =>
    labels.map((l) => (premise === "the strong one" ? scores["the strong one"] : scores["the weak one"]));

  const [match] = await matchRequirements(
    ["some requirement"],
    ["the weak one", "the strong one"],
    classify,
  );

  assert.equal(match.score, 0.8);
  assert.equal(match.evidence, "the strong one");

  // Below the partial line there is no evidence worth showing.
  const [weak] = await matchRequirements(["r"], ["the weak one"], classify);
  assert.equal(weak.band, "missing");
  assert.equal(weak.evidence, null);
});

test("bands sit where the measured separation put them", () => {
  assert.equal(bandFor(MATCH.coveredAt), "covered");
  assert.equal(bandFor(MATCH.coveredAt - 0.001), "partial");
  assert.equal(bandFor(MATCH.partialAt), "partial");
  assert.equal(bandFor(MATCH.partialAt - 0.001), "missing");
});

test("coverage gives partials half credit", () => {
  const of = (...bands) => coverageScore(bands.map((band) => ({ band })));

  assert.equal(of("covered", "covered"), 100);
  assert.equal(of("missing", "missing"), 0);
  assert.equal(of("covered", "missing"), 50);
  assert.equal(of("partial", "partial"), 50);
  assert.equal(coverageScore([]), 0);
});

test("nothing to match against returns nothing rather than throwing", async () => {
  const boom = async () => assert.fail("classifier must not run with an empty side");
  assert.deepEqual(await matchRequirements([], ["a bullet"], boom), []);
  assert.deepEqual(await matchRequirements(["a requirement"], [], boom), []);
});
