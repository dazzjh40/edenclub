// Builds the published site into _site/ from the files in this repo.
//
// The pages here are the built Astro site, kept as the master copy since the
// source was lost with the VPS. This script does what the nightly rebuild
// used to do, without needing the source:
//
//   1. Fills each <!--notices:NAME--> slot with the notices in notices/*.md
//      that are switched on, aimed at that slot and in date, as real HTML.
//   2. Removes anything carrying a data-hide-after time that has passed
//      (event cards, promos), so expired content leaves the HTML Google reads
//      and not just the screen.
//
// Run it with `node scripts/build.mjs`. It stops with an error, and publishes
// nothing, if a notice file has a mistake in it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const NOTICES = path.join(ROOT, 'notices');

// Repo files that are tooling, not website.
const SKIP = new Set(['.claude', '.git', '.github', '.gitignore', '_site', 'node_modules', 'notices', 'scripts', 'UPDATING.md']);

const LANGS = ['en', 'es', 'de', 'nl', 'fr', 'it', 'pt', 'sv', 'nb'];

// Which page in each language holds each slot.
const SLOTS = {
  home: { en: 'en', es: 'es', de: 'de', nl: 'nl', fr: 'fr', it: 'it', pt: 'pt', sv: 'sv', nb: 'nb' },
  programme: {
    en: 'en/programme', es: 'es/programa', de: 'de/unser-programm', nl: 'nl/programma',
    fr: 'fr/le-programme', it: 'it/programma', pt: 'pt/programa', sv: 'sv/program', nb: 'nb/program',
  },
};

const TZ = 'Atlantic/Canary';
// The club day runs until closing at 03:00, so a notice ending on Saturday
// stays up through Saturday night.
const CLOSES = 3;

const now = process.env.BUILD_NOW ? new Date(process.env.BUILD_NOW) : new Date();
const today = clubDay(now);

function clubDay(d) {
  const shifted = new Date(d.getTime() - CLOSES * 3600e3);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted);
}

function fail(msg) {
  console.error(`\nBuild stopped: ${msg}\nNothing was published. Fix the file and save again.\n`);
  process.exit(1);
}

// A notice file is a short header between --- lines, then one "## xx"
// section per language.
function readNotice(file) {
  const name = path.basename(file);
  const src = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) fail(`${name} must start with a header between two --- lines.`);

  const head = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const kv = line.match(/^\s*(\w+)\s*:\s*(.*?)\s*$/);
    if (!kv) fail(`${name}: can't read the header line "${line}".`);
    head[kv[1].toLowerCase()] = kv[2];
  }

  const show = (head.show || 'yes').toLowerCase();
  if (!['yes', 'no'].includes(show)) fail(`${name}: "show" must be yes or no.`);

  const pages = (head.pages || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!pages.length) fail(`${name}: "pages" is empty. Use ${Object.keys(SLOTS).join(', ')}.`);
  for (const p of pages) if (!SLOTS[p]) fail(`${name}: unknown page "${p}". Use ${Object.keys(SLOTS).join(', ')}.`);

  for (const k of ['from', 'until']) {
    if (head[k] && !/^\d{4}-\d{2}-\d{2}$/.test(head[k])) fail(`${name}: "${k}" must be a date like 2026-12-24, or left empty.`);
  }

  const text = {};
  let lang = null;
  for (const line of m[2].split('\n')) {
    const h = line.match(/^##\s*(\w+)\s*$/);
    if (h) {
      lang = h[1].toLowerCase();
      if (!LANGS.includes(lang)) fail(`${name}: unknown language "## ${h[1]}". Use ${LANGS.join(', ')}.`);
      text[lang] = [];
    } else if (lang) {
      text[lang].push(line);
    }
  }
  for (const k of Object.keys(text)) {
    text[k] = text[k].join(' ').replace(/\s+/g, ' ').trim();
    if (!text[k]) delete text[k];
  }
  if (!text.en) fail(`${name}: the English text (## en) is missing.`);
  const missing = LANGS.filter((l) => !text[l]);
  if (missing.length) console.warn(`  ${name}: no ${missing.join(', ')} text, showing English there.`);

  return { name, show: show === 'yes', pages, from: head.from || null, until: head.until || null, text };
}

function escape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// **bold** and [link text](https://...) are all the formatting a notice needs.
function inline(s) {
  return escape(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

function render(n, lang) {
  // Same expiry hook the page scripts already use, so a dated notice still
  // disappears on time if a nightly build is ever missed.
  const hide = n.until ? ` data-hide-after="${hideAfter(n.until)}"` : '';
  return `<p class="notice"${hide}>${inline(n.text[lang] || n.text.en)}</p>`;
}

// 03:00 Canary time on the day after `until`, as a UTC timestamp.
function hideAfter(until) {
  const [y, m, d] = until.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d + 1, CLOSES);
  const off = new Date(guess).toLocaleString('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' }).match(/GMT([+-]\d+)?/);
  const hours = off && off[1] ? Number(off[1]) : 0;
  return new Date(guess - hours * 3600e3).toISOString();
}

// Drops every element whose data-hide-after time has passed, matching its
// closing tag by counting nested tags of the same name.
function removeExpired(html) {
  const open = /<([a-z][a-z0-9]*)\b[^>]*\sdata-hide-after="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = open.exec(html))) {
    const t = Date.parse(m[2]);
    if (isNaN(t) || now.getTime() < t) continue;
    const tag = m[1].toLowerCase();
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
    re.lastIndex = m.index + m[0].length;
    let depth = 1, end = -1, x;
    while ((x = re.exec(html))) {
      depth += x[1] ? -1 : 1;
      if (depth === 0) { end = x.index + x[0].length; break; }
    }
    if (end < 0) continue;
    html = html.slice(0, m.index) + html.slice(end);
    open.lastIndex = m.index;
  }
  return html;
}

function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (from === ROOT && SKIP.has(e.name)) continue;
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copy(a, b);
    else fs.copyFileSync(a, b);
  }
}

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? htmlFiles(p) : e.name.endsWith('.html') ? [p] : [];
  });
}

// --- build ---

const notices = fs.readdirSync(NOTICES).filter((f) => f.endsWith('.md')).sort().map((f) => readNotice(path.join(NOTICES, f)));
const live = notices.filter((n) => n.show && (!n.from || n.from <= today) && (!n.until || today <= n.until));

console.log(`Club day ${today}. Showing: ${live.map((n) => n.name).join(', ') || 'no notices'}.`);

fs.rmSync(OUT, { recursive: true, force: true });
copy(ROOT, OUT);

for (const [slot, byLang] of Object.entries(SLOTS)) {
  for (const lang of LANGS) {
    const file = path.join(OUT, byLang[lang], 'index.html');
    const html = fs.readFileSync(file, 'utf8');
    const marker = `<!--notices:${slot}-->`;
    if (!html.includes(marker)) fail(`${byLang[lang]}/index.html has lost its ${marker} slot.`);
    const block = live.filter((n) => n.pages.includes(slot)).map((n) => render(n, lang)).join(' ');
    fs.writeFileSync(file, html.replace(marker, block));
  }
}

let removed = 0;
for (const file of htmlFiles(OUT)) {
  const html = fs.readFileSync(file, 'utf8');
  const out = removeExpired(html);
  if (out !== html) { removed++; fs.writeFileSync(file, out); }
}
console.log(`Removed expired content from ${removed} page(s). Built into _site/.`);
