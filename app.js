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

