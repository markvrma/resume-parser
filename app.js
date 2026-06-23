// Wiring only: PDF bytes -> text, doc -> pixels. All parsing and scoring lives
// in score.js so it stays testable under node without a DOM.

import * as pdfjs from "./vendor/pdf.min.mjs";
import { parseResume, scoreResume, BENCHMARK } from "./score.js";

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
};

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
function band(score) {
  if (score >= 80) return { label: "Strong", color: "var(--good)" };
  if (score >= 55) return { label: "Developing", color: "var(--fair)" };
  return { label: "Needs work", color: "var(--poor)" };
}

function renderDimension(dim) {
  const { label: verdict, color } = band(dim.score);
  const el = document.createElement("div");
  el.className = "mv-dim";
  el.innerHTML = `
    <div class="mv-dim-head">
      <span class="mv-dim-name">${dim.label}<span class="mv-verdict" style="background:${color}">${verdict}</span></span>
      <span class="mv-dim-score">${dim.score}<span style="font-weight:400;color:var(--ink-muted)">/100</span></span>
    </div>
    <div class="mv-track" role="img"
         aria-label="${dim.label}: ${dim.score} out of 100 — ${verdict}">
      <div class="mv-fill" style="width:0%;background:${color}"></div>
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
  els.heroScore.style.color = overall.color;
  els.heroVerdict.textContent = overall.label;
  els.heroVerdict.style.color = overall.color;
  els.heroSub.textContent =
    `Weighted across ${result.dimensions.length} areas, benchmarked against ${BENCHMARK.label}.`;

  els.dims.replaceChildren(...result.dimensions.map(renderDimension));

  els.inputView.hidden = true;
  els.resultsView.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// --- flow -----------------------------------------------------------------

function scoreText(text) {
  const doc = parseResume(text);
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

