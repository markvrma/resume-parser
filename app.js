// Wiring only: PDF bytes -> text, doc -> pixels. All parsing and scoring lives
// in score.js so it stays testable under node without a DOM.

import * as pdfjs from "./vendor/pdf.min.mjs";
import { parseResume, scoreResume, BENCHMARK } from "./score.js";
import {
  MATCH, extractRequirements, matchRequirements, coverageScore, buildPremises,
} from "./match.js";

pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";

// Read at most this many pages. A resume is one or two; anything longer is a
// CV or a mis-picked file, and there is no reason to parse 40 pages of it.
const MAX_PAGES = 5;

// Below this many characters, nothing useful came out — almost always a scan
// or an image-only export.
const MIN_CHARS = 200;

const $ = (id) => document.getElementById(id);

const els = {
  inputView: $("input-view"),
  resultsView: $("results-view"),
  drop: $("drop"),
  file: $("file"),
  paste: $("paste"),
  pasteField: $("paste-field"),
  pasteToggle: $("paste-toggle"),
  scorePaste: $("score-paste"),
  status: $("status"),
  heroScore: $("hero-score"),
  heroVerdict: $("hero-verdict"),
  heroSub: $("hero-sub"),
  dims: $("dims"),
  again: $("again"),
  matchView: $("match-view"),
  jd: $("jd"),
  runMatch: $("run-match"),
  matchStatus: $("match-status"),
  matchResults: $("match-results"),
  covScore: $("cov-score"),
  covSub: $("cov-sub"),
  reqs: $("reqs"),
};

// The parsed resume from the current run, kept so the job matcher can reuse it
// instead of re-reading the file.
let currentDoc = null;

// --- status line ----------------------------------------------------------

function setStatus(message, isError = false) {
  if (!message) {
    els.status.hidden = true;
    return;
  }
  els.status.hidden = false;
  els.status.textContent = message;
  els.status.classList.toggle("mv-status--error", isError);
}

// --- PDF -> text ----------------------------------------------------------

async function pdfToText(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;

  const pages = Math.min(pdf.numPages, MAX_PAGES);
  let out = "";

  for (let n = 1; n <= pages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    let lastY = null;

    for (const item of content.items) {
      if (item.str === undefined) continue; // marked-content items carry no text
      // pdf.js flags the end of a visual line itself; the y-coordinate check is
      // the fallback for producers that never set it. Neither reconstructs
      // multi-column layouts — see the README limitation.
      const y = item.transform ? Math.round(item.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) out += "\n";
      out += item.str;
      if (item.hasEOL) out += "\n";
      lastY = y;
    }
    out += "\n";
  }

  return out;
}

// --- rendering ------------------------------------------------------------

// Bands are derived here rather than stored on the score object — a verdict is
// just a threshold, and duplicating it into score.js would mean two places to
// change when the wording moves.
// The band is carried by fill pattern, not hue — see the score-bar note in
// styles.css. So this hands back a class modifier and lets CSS own the look.
function band(score) {
  if (score >= 80) return { label: "Strong", mod: "good" };
  if (score >= 55) return { label: "Developing", mod: "fair" };
  return { label: "Needs work", mod: "poor" };
}

function renderDimension(dim) {
  const { label: verdict, mod } = band(dim.score);
  const el = document.createElement("div");
  el.className = "mv-dim";
  el.innerHTML = `
    <div class="mv-dim-head">
      <span class="mv-dim-name">${dim.label}<span class="mv-verdict">${verdict}</span></span>
      <span class="mv-dim-score">${dim.score}<span style="font-weight:400;color:var(--muted)">/100</span></span>
    </div>
    <div class="mv-track" role="img"
         aria-label="${dim.label}: ${dim.score} out of 100 — ${verdict}">
      <div class="mv-fill mv-fill--${mod}" style="width:0%"></div>
    </div>
    <p class="mv-dim-detail"></p>
    <p class="mv-tip"></p>
  `;
  // textContent, not innerHTML — detail and tip interpolate strings built from
  // the user's own resume.
  el.querySelector(".mv-dim-detail").textContent = dim.detail;
  el.querySelector(".mv-tip").textContent = dim.tip;

  // Width is applied after insertion so the CSS transition animates from 0.
  requestAnimationFrame(() => {
    el.querySelector(".mv-fill").style.width = `${dim.score}%`;
  });
  return el;
}

function render(result) {
  const overall = band(result.overall);

  els.heroScore.textContent = result.overall;
  els.heroVerdict.textContent = overall.label;
  els.heroSub.textContent =
    `Weighted across ${result.dimensions.length} areas, benchmarked against ${BENCHMARK.label}.`;

  els.dims.replaceChildren(...result.dimensions.map(renderDimension));

  els.inputView.hidden = true;
  els.resultsView.hidden = false;
  els.matchView.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- flow -----------------------------------------------------------------

function scoreText(text) {
  const doc = parseResume(text);
  currentDoc = doc;
  if (!doc.words) {
    setStatus("No text found. Paste your resume text in instead.", true);
    els.pasteField.hidden = false;
    return;
  }
  setStatus("");
  render(scoreResume(doc));
}

async function handleFile(file) {
  if (!file) return;

  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  const isTxt = /\.txt$/i.test(file.name) || file.type === "text/plain";

  if (!isPdf && !isTxt) {
    setStatus(
      "That file type isn't supported. Export your resume as a PDF, or paste the text in below.",
      true,
    );
    els.pasteField.hidden = false;
    return;
  }

  setStatus("Reading your resume…");

  try {
    const text = isTxt ? await file.text() : await pdfToText(file);

    if (text.trim().length < MIN_CHARS) {
      setStatus(
        "Almost no text came out of that PDF — it's likely a scan or an image. Paste your resume text in below instead.",
        true,
      );
      els.pasteField.hidden = false;
      els.paste.focus();
      return;
    }

    scoreText(text);
  } catch (err) {
    const encrypted = err && /password/i.test(err.message || "");
    setStatus(
      encrypted
        ? "That PDF is password-protected. Save an unprotected copy, or paste the text in below."
        : `Couldn't read that PDF (${err.message || err}). Try pasting the text in below.`,
      true,
    );
    els.pasteField.hidden = false;
  }
}


// --- job match ------------------------------------------------------------
// The model is ~87MB and most visitors never paste a job description, so
// nothing here is imported until the button is pressed. The base score stays a
// zero-dependency, instant, offline rubric.

const TRANSFORMERS_URL =
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/dist/transformers.min.js";

let classifierPromise = null;

function setMatchStatus(message, isError = false) {
  if (!message) {
    els.matchStatus.hidden = true;
    return;
  }
  els.matchStatus.hidden = false;
  els.matchStatus.textContent = message;
  els.matchStatus.classList.toggle("mv-status--error", isError);
}

/** Load once per page, reuse after. Resolves to classify(premise, labels). */
function getClassifier() {
  if (classifierPromise) return classifierPromise;

  classifierPromise = (async () => {
    setMatchStatus("Loading the model — 87 MB, once. Your browser caches it after this.");
    const { pipeline } = await import(/* @vite-ignore */ TRANSFORMERS_URL);

    // WASM, deliberately, even where WebGPU is available. Measured on this
    // workload WebGPU ran ~660ms per forward pass against WASM's ~49ms — a
    // 13x penalty. The model is small enough that per-dispatch GPU overhead
    // dominates the arithmetic, so the accelerator is pure cost. The whole
    // 12-requirement analysis is ~5s on WASM and was ~80s on WebGPU.
    const zs = await pipeline("zero-shot-classification", MATCH.model, {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p) => {
        if (p.status === "progress" && p.total) {
          const pct = Math.round((p.loaded / p.total) * 100);
          setMatchStatus(`Downloading the model… ${pct}%`);
        }
      },
    });

    return async (premise, labels) => {
      const out = await zs(premise, labels, {
        hypothesis_template: MATCH.hypothesisTemplate,
        multi_label: true,
      });
      // The pipeline returns labels ordered by score, not in the order they
      // were given. Realign here, or every requirement gets another
      // requirement's score once more than one label is passed at a time.
      const byLabel = new Map(out.labels.map((l, i) => [l, out.scores[i]]));
      return labels.map((l) => byLabel.get(l) ?? 0);
    };
  })();

  // A failed load must not poison every later attempt.
  classifierPromise.catch(() => {
    classifierPromise = null;
  });

  return classifierPromise;
}

const BAND_LABEL = { covered: "Covered", partial: "Partial", missing: "Missing" };

function renderRequirement(m) {
  const el = document.createElement("div");
  el.className = "mv-req";
  el.innerHTML = `
    <div class="mv-req-head">
      <span class="mv-verdict mv-verdict--${m.band}">${BAND_LABEL[m.band]}</span>
      <span class="mv-req-text"></span>
    </div>
    <p class="mv-req-evidence" hidden></p>
  `;
  // textContent throughout: both strings come from pasted text.
  el.querySelector(".mv-req-text").textContent = m.requirement;
  if (m.evidence) {
    const ev = el.querySelector(".mv-req-evidence");
    ev.hidden = false;
    ev.textContent = `Best evidence: ${m.evidence}`;
  }
  return el;
}

async function runMatch() {
  const jd = els.jd.value.trim();
  if (jd.length < 120) {
    setMatchStatus("Paste the full job description — that is too short to read requirements from.", true);
    return;
  }
  if (!currentDoc) {
    setMatchStatus("Score a resume first.", true);
    return;
  }

  const requirements = extractRequirements(jd);
  if (!requirements.length) {
    setMatchStatus("No requirements could be read out of that. Paste the body of the posting, not just the title.", true);
    return;
  }

  const premises = buildPremises(currentDoc);
  els.runMatch.disabled = true;
  els.matchResults.hidden = true;

  try {
    const classify = await getClassifier();

    const matches = await matchRequirements(
      requirements,
      premises,
      classify,
      MATCH,
      (done) => setMatchStatus(`Checking requirements… ${Math.round(done * 100)}%`),
    );

    const coverage = coverageScore(matches);
    const missing = matches.filter((m) => m.band === "missing").length;

    els.covScore.textContent = coverage;
    els.covSub.textContent =
      `${requirements.length} requirements read from the posting` +
      (missing ? `, ${missing} with no evidence in your resume.` : ", all with some evidence in your resume.");
    els.reqs.replaceChildren(...matches.map(renderRequirement));
    els.matchResults.hidden = false;
    setMatchStatus("");
  } catch (err) {
    setMatchStatus(`Couldn't run the match (${err.message || err}). The model download may have been blocked.`, true);
  } finally {
    els.runMatch.disabled = false;
  }
}

// --- events ---------------------------------------------------------------

els.runMatch.addEventListener("click", runMatch);

els.file.addEventListener("change", (e) => handleFile(e.target.files[0]));

els.pasteToggle.addEventListener("click", () => {
  els.pasteField.hidden = !els.pasteField.hidden;
  if (!els.pasteField.hidden) els.paste.focus();
});

els.scorePaste.addEventListener("click", () => {
  const text = els.paste.value.trim();
  if (text.length < MIN_CHARS) {
    setStatus("That's too short to score — paste the full resume text.", true);
    return;
  }
  scoreText(text);
});

els.again.addEventListener("click", () => {
  els.resultsView.hidden = true;
  els.matchView.hidden = true;
  els.matchResults.hidden = true;
  els.inputView.hidden = false;
  els.file.value = "";
  els.paste.value = "";
  els.jd.value = "";
  currentDoc = null;
  setStatus("");
  setMatchStatus("");
  window.scrollTo({ top: 0, behavior: "smooth" });
});

for (const type of ["dragenter", "dragover"]) {
  els.drop.addEventListener(type, (e) => {
    e.preventDefault();
    els.drop.classList.add("is-over");
  });
}

for (const type of ["dragleave", "drop"]) {
  els.drop.addEventListener(type, (e) => {
    e.preventDefault();
    els.drop.classList.remove("is-over");
  });
}

els.drop.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
