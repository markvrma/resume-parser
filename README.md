# Resume Check

Score a software engineering resume against a documented hiring rubric, in the
browser. Upload a PDF, get an overall score out of 100, a breakdown across four
areas, and a specific fix for each one.

Optionally, paste a job description and it tells you which of its requirements
your resume actually shows evidence for, using a small open-weights model that
runs in your browser.

**Your resume never leaves the page.** The model file is the only thing fetched
from the network, and only if you ask for a match.

```
open index.html          # works straight off disk, no build, no server
node --test               # 19 tests, no model download required
```

---

## Methodology

The benchmark is a **hand-written rubric**. Every target in
[`score.js`](score.js) is a rule of thumb drawn from public hiring guidance:

| Dimension | Weight | Target | Where the target comes from |
|---|---|---|---|
| Impact & quantification | 35% | 60% of bullets contain a figure | Google's published "accomplished X, measured by Y, by doing Z" resume formula; Amazon's STAR guidance. Both instruct candidates to quantify the majority of bullets. |
| Technical breadth | 25% | 4 of 5 technology areas | Generalist SDE postings typically name a language, a framework, a datastore, and deployment tooling. Scored per *area*, so nine JS frameworks don't outrank a real full-stack range. |
| Ownership signals | 20% | 35% of bullets open with an ownership verb | Industry level descriptors (levels.fyi and equivalents) separate mid from senior on scope and ownership language. `developed` and `implemented` are excluded — they appear on nearly every resume and so carry no signal. |
| Structural hygiene | 20% | 4 contact channels, 3 standard sections, 350–850 words | Standard ATS guidance: parseable headings, reachable contact details, one page under ~10 years' experience. |

The weights are a judgement call, not a fitted model. Impact carries the most
because it is the one thing every published guide agrees on.

### What this does not do

- **It cannot tell you whether you'll get the interview.** duh
- **Keyword stuffing beats it.** You are grading your own resume. Don't lie to yourself.
- **Multi-column layouts may extract out of order.** pdf.js returns text in draw
  order, not reading order. Column reconstruction isn't attempted, if the
  results look scrambled, use the paste box.
- **Scanned or image-only PDFs contain no text.** There is no OCR. The app
  detects this (under 200 characters extracted) and offers the paste box.
- **One field only.** Computer Science / SDE. The other options in the dropdown
  are deliberately disabled rather than silently pointing at this same rubric.
- **A new grad will score low on ownership.** That is the rubric working as
  designed, not a judgement — the tips are phrased as next steps.

---

## Job matching

The rubric measures the *shape* of a resume. Whether you have what a specific
job asks for is a question about meaning, so it takes a model.

Paste a posting; it pulls out the requirement lines and, for each, asks whether
anything in your resume is evidence for it — `Covered`, `Partial` or `Missing`,
with the best-matching line shown underneath.

**Model:** [`Xenova/nli-deberta-v3-xsmall`](https://huggingface.co/Xenova/nli-deberta-v3-xsmall),
~87 MB quantized (int8), run through
[Transformers.js](https://github.com/huggingface/transformers.js). Downloaded
once on first use and cached by the browser; never fetched if you don't use the
feature.

### Why entailment and not embeddings

The obvious build is to embed requirements and bullets and rank by cosine
similarity. Measured on a real posting, that ranks a requirement the resume
plainly does **not** meet above ones it plainly does:

| Requirement | Truth | Cosine (MiniLM-L6) |
|---|---|---|
| Five years managing a team of designers | missing | **0.388** |
| Exposure to LLMs, prompting, retrieval, agents | covered | **0.215** |
| Solid fundamentals in a production language | covered | 0.238 |

A bi-encoder scores topical resemblance, and "five years managing designers"
resembles "software engineer, two years" as a *sentence*. Any threshold over
that tells people confident falsehoods about their own resume.

Natural language inference asks the question actually meant: taking a resume
line as the premise, does "the candidate's background provides evidence for X"
follow? On the same cases that separates cleanly — covered 0.63–1.00, missing
0.07–0.21 — and the bands are cut from that gap, set to under-claim rather than
over-claim.

The hypothesis wording was chosen by measurement, not taste. Against a labelled
set, `"The candidate's background provides evidence for: {}"` separated covered
from missing by **0.42**; `"This person has professional experience with {}"`
managed 0.29, and `"This resume demonstrates: {}"` collapsed to 0.02.

### What it matches against

Not just bullets. Matching bullets alone scored "roughly 1–3 years of software
engineering experience" as **missing** against a resume with exactly that,
because no bullet states a tenure — it lives in the dates. So two facts are
synthesized from what was already parsed and added to the pool: a tenure line
derived from the years in the experience section, and the skills section. Both
are assembled from the resume, never invented.

### Limits of the match

- **Numeric requirements are its weak spot.** "1–3 years" against "2 years"
  needs arithmetic, and NLI models reason about numbers poorly. It usually
  lands, but it is the least reliable class.
- **It is a fuzzy signal, not a verdict.** Bands near a threshold flip on
  wording. Treat `Missing` as "worth a second look", not as proof.
- **Attribution is noisier than the score.** The band is more trustworthy than
  which line it picked as evidence.
- **Only the first 12 requirements** are read, and the first 20 resume lines
  matched, to bound runtime.

### Why WASM and not WebGPU

Measured on this workload, WebGPU cost ~660 ms per forward pass against WASM's
~49 ms. The model is small enough that per-dispatch GPU overhead dominates the
arithmetic, so the accelerator is pure cost. Inference is pinned to WASM.

---

## How it works

```
index.html     markup, three states toggled with the hidden attribute
app.js         pdf.js -> text, result -> DOM, and the model's lifetime.
match.js       job-description matching. Pure, with the classifier injected.
score.js       parseResume() and scoreResume(). Pure, no DOM, no I/O.
score.test.js  node:test. Two inline fixtures, strong vs weak.
styles.css     design tokens + the ported mv- components
vendor/        pdf.js, vendored so the page works offline
```

`score.js` holds both the parser and the scorer because both are pure string
work — which is what makes them testable under `node --test` with no browser and
no PDF. `app.js` owns everything impure.

Section detection is one regex alternation per section family, matched against
short heading-shaped lines. Bullets come from the experience and projects
sections; with no recognisable headings at all, every substantial line is
treated as a bullet so the resume still gets scored instead of reading as empty.

Scores are normalised so that meeting the benchmark is 100 — there is no
percentile math, because a weighted mean of percentiles is not a percentile and
the precision would be fake.

## License

MIT
