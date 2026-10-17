/**
 * Extracts territory label positions from public/map.svg and writes
 * src/data/territoryPositions.ts.
 *
 * The map is an Inkscape document with a "Labels" layer holding one <text>
 * element per province. We read the x/y of each label and match it to a
 * territory id from src/data/territories.json by (normalised) name.
 *
 * Usage:  node scripts/extract-map-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const SVG_PATH = path.join(root, 'public', 'map.svg');
const TERRITORIES_PATH = path.join(root, 'src', 'data', 'territories.json');
const OUT_PATH = path.join(root, 'src', 'data', 'territoryPositions.ts');

/** Territories that have no text label in the SVG - hand placed. */
const MANUAL_POSITIONS = {
  // Piraeus is the port of Athens; the Attic peninsula is tiny at this scale
  // so the marker is tucked just under the "Athens" label.
  piraeus: { x: 344, y: 381, note: 'Athens harbour (no label in source SVG)' },
  // Naucratis sits in the Nile delta, north-west of Alexandria.
  naucratis: { x: 640, y: 596, note: 'Nile delta (no label in source SVG)' },
};

const INK_LABEL = 'Labels';

function readSvg() {
  return fs.readFileSync(SVG_PATH, 'utf8');
}

/** Extract the raw text of a <text> element including nested tspans. */
function textContent(textEl) {
  const inner = textEl.replace(/<tspan[\s\S]*?<\/tspan>/g, '');
  const direct = inner.replace(/<[^>]*>/g, '');
  const tspanTexts = [...textEl.matchAll(/<tspan[\s\S]*?<\/tspan>/g)].map((m) =>
    m[0].replace(/<[^>]*>/g, '')
  );
  return (tspanTexts.length ? tspanTexts.join('') : direct).trim();
}

/** Pull every <text> element of a named layer out of the SVG source. */
function layerTexts(svg, layerLabel) {
  const layerRe = new RegExp(
    `<g\\s+[^>]*inkscape:label="${layerLabel}"[^>]*>([\\s\\S]*?)\\n\\s*</g>`,
    'm'
  );
  const match = svg.match(layerRe);
  if (!match) throw new Error(`layer "${layerLabel}" not found in ${SVG_PATH}`);
  const body = match[1];
  const out = [];
  const textRe = /<text\b[\s\S]*?<\/text>/g;
  let m;
  while ((m = textRe.exec(body)) !== null) {
    const el = m[0];
    const x = /x="([-\d.]+)"/.exec(el);
    const y = /y="([-\d.]+)"/.exec(el);
    if (!x || !y) continue;
    const transform = /transform="translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(el);
    const dx = transform ? parseFloat(transform[1]) : 0;
    const dy = transform ? parseFloat(transform[2]) : 0;
    out.push({
      x: parseFloat(x[1]) + dx,
      y: parseFloat(y[1]) + dy,
      text: textContent(el),
    });
  }
  return out;
}

const normalise = (s) => s.replace(/[\s_]+/g, '').toLowerCase();

const svg = readSvg();
const labels = layerTexts(svg, INK_LABEL);

const territories = JSON.parse(fs.readFileSync(TERRITORIES_PATH, 'utf8')).territories;
const byName = new Map();
for (const [id, t] of Object.entries(territories)) {
  byName.set(normalise(t.name), id);
}
// The map abbreviates a couple of provinces.
const ALIASES = {
  j: 'jerusalem',
  neapolis: 'neapolis',
};

const positions = {};
const labelText = {};
const unmatchedLabels = [];
for (const label of labels) {
  const key = normalise(label.text);
  let id = byName.get(key);
  if (!id && ALIASES[key]) id = ALIASES[key];
  if (!id) {
    unmatchedLabels.push(label.text);
    continue;
  }
  positions[id] = { x: round(label.x), y: round(label.y) };
  labelText[id] = label.text;
}

for (const [id, pos] of Object.entries(MANUAL_POSITIONS)) {
  positions[id] = { x: pos.x, y: pos.y };
}

const missing = Object.keys(territories).filter((id) => !positions[id]);
if (missing.length) {
  throw new Error(`no position for: ${missing.join(', ')}`);
}

// ---------------------------------------------------------------------
// Supply centre markers
//
// The map draws a filled circle on every supply centre. We need their
// positions as well: they are the natural spot for a unit counter and they
// tell us where a province really is on the map.
// ---------------------------------------------------------------------

const MARK_COLOUR_TO_POWER = {
  '#1fe922': 'athens',
  '#1f2ee5': 'sparta',
  '#fffde5': 'macedon',
  '#ff920e': 'satrapies',
  '#ab15eb': 'phoenicia',
  '#803300': 'persia',
  '#efe922': 'carthage',
  '#ef1122': 'rome',
};

function markerShapes() {
  const layerRe = new RegExp(
    `<g\\s+[^>]*inkscape:label="Home Centers and supply centers"[^>]*>([\\s\\S]*?)\\n\\s*</g>`,
    'm'
  );
  const match = svg.match(layerRe);
  if (!match) return [];
  const out = [];
  const shapeRe = /<(circle|ellipse)\b[\s\S]*?(?:\/>|<\/ellipse>)/g;
  let m;
  while ((m = shapeRe.exec(match[1])) !== null) {
    const el = m[0];
    const cx = /cx="([-\d.]+)"/.exec(el);
    const cy = /cy="([-\d.]+)"/.exec(el);
    if (!cx || !cy) continue;
    const fill = /fill:\s*(#[0-9a-fA-F]{6})/.exec(el);
    out.push({
      x: parseFloat(cx[1]),
      y: parseFloat(cy[1]),
      fill: fill ? fill[1].toLowerCase() : null,
    });
  }
  return out;
}

const marks = markerShapes();
const supplyCentreMarks = {};
const neutralMarks = {};

// The coloured circles are matched to the home centres of the same power.
// A greedy assignment over all (mark, centre) pairs is needed: matching
// every mark to its own closest centre would give the same centre two
// marks (Carthage and Thopsis are only 43 units apart).
const pairs = [];
for (const [index, mark] of marks.entries()) {
  const power = mark.fill ? MARK_COLOUR_TO_POWER[mark.fill] : undefined;
  if (!power) continue;
  for (const [id, t] of Object.entries(territories)) {
    if (t.homePower !== power || !t.isSupplyCenter) continue;
    const p = positions[id];
    pairs.push({ index, id, distance: Math.hypot(p.x - mark.x, p.y - mark.y) });
  }
}
pairs.sort((a, b) => a.distance - b.distance);

const usedMarks = new Set();
const usedCentres = new Set();
for (const pair of pairs) {
  if (pair.distance >= 85) break;
  if (usedMarks.has(pair.index) || usedCentres.has(pair.id)) continue;
  usedMarks.add(pair.index);
  usedCentres.add(pair.id);
  const mark = marks[pair.index];
  supplyCentreMarks[pair.id] = { x: round(mark.x), y: round(mark.y) };
}

// The remaining shapes are the small black markers of neutral provinces.
for (const [index, mark] of marks.entries()) {
  if (usedMarks.has(index)) continue;
  let best = null;
  let bestDistance = Infinity;
  for (const id of Object.keys(territories)) {
    const p = positions[id];
    const d = Math.hypot(p.x - mark.x, p.y - mark.y);
    if (d < bestDistance) {
      bestDistance = d;
      best = id;
    }
  }
  if (best && bestDistance < 32 && !supplyCentreMarks[best] && !neutralMarks[best]) {
    neutralMarks[best] = { x: round(mark.x), y: round(mark.y) };
  }
}

function round(n) {
  return Math.round(n * 100) / 100;
}

const lines = [];
lines.push('// AUTO-GENERATED by scripts/extract-map-data.mjs - do not edit by hand.');
lines.push('//');
lines.push('// Map label positions in public/map.svg user units (the SVG viewBox is');
lines.push(`// "${readViewBox(svg)}").`);
lines.push('');
lines.push('export interface MapPoint {');
lines.push('  x: number;');
lines.push('  y: number;');
lines.push('}');
lines.push('');
lines.push('export const TERRITORY_POSITIONS: Record<string, MapPoint> = {');
for (const id of Object.keys(territories)) {
  const p = positions[id];
  const note = MANUAL_POSITIONS[id] ? `  // ${MANUAL_POSITIONS[id].note}` : '';
  lines.push(`  ${id}: { x: ${p.x}, y: ${p.y} },${note}`);
}
lines.push('};');
lines.push('');
lines.push('/** Human readable label for each territory, as printed on the map. */');
lines.push('export const TERRITORY_LABEL_TEXT: Record<string, string> = {');
for (const id of Object.keys(territories)) {
  const text = labelText[id] ?? territories[id].name;
  lines.push(`  ${id}: ${JSON.stringify(text)},`);
}
lines.push('};');
lines.push('');
lines.push('/**');
lines.push(' * Position of the filled supply centre circle drawn on the map.');
lines.push(' * Used as the anchor for unit counters.');
lines.push(' */');
lines.push('export const SUPPLY_CENTRE_MARKS: Record<string, MapPoint> = {');
for (const id of Object.keys(supplyCentreMarks)) {
  const p = supplyCentreMarks[id];
  lines.push(`  ${id}: { x: ${p.x}, y: ${p.y} },`);
}
lines.push('};');
lines.push('');
lines.push('/** Small black markers (neutral provinces) drawn on the map. */');
lines.push('export const NEUTRAL_MARKS: Record<string, MapPoint> = {');
for (const id of Object.keys(neutralMarks)) {
  const p = neutralMarks[id];
  lines.push(`  ${id}: { x: ${p.x}, y: ${p.y} },`);
}
lines.push('};');
lines.push('');

fs.writeFileSync(OUT_PATH, lines.join('\n'));

function readViewBox(src) {
  const m = /viewBox="([^"]+)"/.exec(src);
  return m ? m[1] : 'unknown';
}

console.log(
  `wrote ${path.relative(root, OUT_PATH)}: ${Object.keys(positions).length} territories`
);
if (unmatchedLabels.length) {
  console.log(`  (labels with no matching territory: ${unmatchedLabels.join(', ')})`);
}
