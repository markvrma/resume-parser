# Resume Check

Score a software engineering resume against a documented hiring rubric, in the
browser. Upload a PDF, get an overall score out of 100, a breakdown across four
areas, and a specific fix for each one.

**Your resume never leaves the page.** 

```
open index.html          # works straight off disk, no build, no server
node --test score.test.js
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

## How it works

```
index.html     markup, two states toggled with the hidden attribute
app.js         pdf.js -> text, and result -> DOM. Nothing else.
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
