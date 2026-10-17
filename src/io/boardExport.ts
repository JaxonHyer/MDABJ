// Exports: a board image (the map with the current state) and a board
// statistics sheet, both as SVG and as PNG.

import { GameState, PowerId, UNIT_GLYPH } from '../types/game';
import { POWER_COLORS } from '../data/mapConfig';
import { ALL_POWERS } from '../engine/economy';
import { militaryUnitCount, ownedSupplyCenters } from '../engine/gameState';
import { downloadFile } from './save';

export const BOARD_WIDTH = 1497;
export const BOARD_HEIGHT = 804;

/** The font the map labels use. */
const MAP_FONT = "'Bookman Old Style', Georgia, serif";

/** Fetches the map image as a data uri so the export is a single file. */
async function mapDataUri(): Promise<string> {
  const url = `${import.meta.env.BASE_URL}map.svg`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the map (${response.status}).`);
  const text = await response.text();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds a standalone SVG of the board: the map plus everything the
 * overlay draws (units, orders, supply centres).
 */
export async function buildBoardSvg(overlay: SVGSVGElement | null): Promise<string> {
  if (!overlay) throw new Error('The map is not ready yet.');
  const map = await mapDataUri();
  const clone = overlay.cloneNode(true) as SVGSVGElement;

  // The interactive parts (hit areas, hover markers) are not part of a
  // printed board.
  clone.querySelectorAll('.map-hitareas, .map-highlights').forEach((el) => el.remove());

  const inner = clone.innerHTML;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}" viewBox="-470 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}"
     font-family="${MAP_FONT}">
  <image x="-470" y="0" width="${BOARD_WIDTH}" height="${BOARD_HEIGHT}"
         href="${map}" xlink:href="${map}" preserveAspectRatio="none" />
  ${inner}
</svg>`;
}

/** Renders an SVG string into a PNG data url. */
export async function svgToPng(
  svg: string,
  width: number,
  height: number,
  scale = 2
): Promise<string> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('The board could not be rendered.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas available.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Downloads a data url as a file. */
export function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export interface PowerStat {
  power: PowerId;
  eco: number;
  military: number;
  diplomatic: number;
  researchScore: number;
  wealth: number;
  supplyCenters: number;
  units: number;
}

export function collectStats(state: GameState): PowerStat[] {
  return ALL_POWERS.map((power) => {
    const economy = state.economy[power];
    return {
      power,
      eco: economy?.eco ?? 0,
      military: economy?.military ?? 0,
      diplomatic: economy?.diplomatic ?? 0,
      researchScore: economy?.researchScore ?? 0,
      wealth: economy?.wealth ?? 0,
      supplyCenters: ownedSupplyCenters(state, power).length,
      units: militaryUnitCount(state, power),
    };
  });
}

const POWER_NAME: Record<PowerId, string> = {
  athens: 'Athens',
  sparta: 'Sparta',
  macedon: 'Macedon',
  satrapies: 'Satrapies',
  persia: 'Persia',
  phoenicia: 'Phoenicia',
  carthage: 'Carthage',
  rome: 'Rome',
};

const PHASE_NAME: Record<string, string> = {
  orders: 'Orders',
  adjudication: 'Adjudication',
  retreats: 'Retreats',
  builds: 'Build phase',
  complete: 'Turn complete',
};

/** Builds the board statistics sheet as an SVG document. */
export function buildStatsSvg(state: GameState): string {
  const stats = collectStats(state);
  const columns = [
    { label: 'Power', width: 170, align: 'start' as const },
    { label: 'Eco', width: 80, align: 'end' as const },
    { label: 'Military', width: 110, align: 'end' as const },
    { label: 'Diplomatic', width: 125, align: 'end' as const },
    { label: 'Research', width: 115, align: 'end' as const },
    { label: 'Supply c.', width: 115, align: 'end' as const },
    { label: 'Units', width: 90, align: 'end' as const },
    { label: 'Wealth', width: 100, align: 'end' as const },
  ];
  const rowHeight = 40;
  const padding = 30;
  const titleHeight = 132;
  const width = padding * 2 + columns.reduce((sum, c) => sum + c.width, 0);
  const height = titleHeight + rowHeight * (stats.length + 1) + 60;

  const header = columns
    .map((column, index) => {
      const x = padding + columns.slice(0, index).reduce((sum, c) => sum + c.width, 0);
      const anchor = column.align === 'end' ? 'end' : 'start';
      const tx = column.align === 'end' ? x + column.width - 12 : x + 6;
      return `<text x="${tx}" y="${titleHeight - 14}" text-anchor="${anchor}"
        font-size="15" font-weight="700" fill="#e8e8e8">${escapeXml(column.label)}</text>`;
    })
    .join('\n');

  const rows = stats
    .map((stat, rowIndex) => {
      const y = titleHeight + rowHeight * (rowIndex + 1);
      const color = POWER_COLORS[stat.power];
      const cells = [
        `${POWER_NAME[stat.power]}`,
        `${stat.eco}`,
        `${stat.military}`,
        `${stat.diplomatic}`,
        `${stat.researchScore}`,
        `${stat.supplyCenters}`,
        `${stat.units}`,
        `${stat.wealth}`,
      ];
      const texts = columns
        .map((column, index) => {
          const x = padding + columns.slice(0, index).reduce((sum, c) => sum + c.width, 0);
          const anchor = column.align === 'end' ? 'end' : 'start';
          const tx = column.align === 'end' ? x + column.width - 12 : x + 6;
          const fill = index === 0 ? color : '#dcdcdc';
          return `<text x="${tx}" y="${y}" text-anchor="${anchor}" font-size="15"
            ${index === 0 ? `font-weight="700"` : ''} fill="${fill}">${escapeXml(cells[index])}</text>`;
        })
        .join('\n');
      return `<g>
        <rect x="${padding}" y="${y - 26}" width="${width - padding * 2}" height="${rowHeight}"
          fill="${rowIndex % 2 === 0 ? '#232323' : '#1b1b1b'}" />
        <rect x="${padding}" y="${y - 26}" width="6" height="${rowHeight}" fill="${color}" />
        ${texts}
      </g>`;
    })
    .join('\n');

  const title = `Mare Nostrum - Turn ${state.turn} (${state.year} BC) - ${
    PHASE_NAME[state.phase] ?? state.phase
  }`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
     viewBox="0 0 ${width} ${height}" font-family="'Segoe UI', Helvetica, Arial, sans-serif">
  <rect width="${width}" height="${height}" fill="#151515" />
  <text x="${padding}" y="${padding + 14}" font-size="26" font-weight="700" fill="#f0f0f0">
    ${escapeXml(title)}
  </text>
  <text x="${padding}" y="${padding + 40}" font-size="14" fill="#9a9a9a">
    Economic points are spent on units. Military and diplomatic points come from research scoring.
  </text>
  <text x="${padding}" y="${padding + 60}" font-size="14" fill="#9a9a9a">
    Research is the cumulative research score, wealth the total economic points earned.
  </text>
  ${header}
  ${rows}
  <text x="${padding}" y="${height - 14}" font-size="13" fill="#8a8a8a">
    Research = cumulative research score, Wealth = total economic points earned.
  </text>
</svg>`;
}

/** Downloads the board as an SVG file. */
export async function downloadBoardSvg(overlay: SVGSVGElement | null, filename: string) {
  const svg = await buildBoardSvg(overlay);
  downloadFile(filename, svg, 'image/svg+xml');
}

/** Renders the board as a PNG data url (used for the download and the preview). */
export async function boardPngDataUrl(overlay: SVGSVGElement | null): Promise<string> {
  const svg = await buildBoardSvg(overlay);
  return svgToPng(svg, BOARD_WIDTH, BOARD_HEIGHT, 2);
}

/** Renders the statistics sheet as a PNG data url. */
export async function statsPngDataUrl(state: GameState): Promise<string> {
  const svg = buildStatsSvg(state);
  const width = Number(/width="(\d+)"/.exec(svg)?.[1] ?? 900);
  const height = Number(/height="(\d+)"/.exec(svg)?.[1] ?? 500);
  return svgToPng(svg, width, height, 2);
}

/** Downloads the board as a PNG file. */
export async function downloadBoardPng(overlay: SVGSVGElement | null, filename: string) {
  downloadDataUrl(filename, await boardPngDataUrl(overlay));
}

/** Downloads the statistics sheet as a PNG file. */
export async function downloadStatsPng(state: GameState, filename: string) {
  downloadDataUrl(filename, await statsPngDataUrl(state));
}

/** Downloads the statistics sheet as an SVG file. */
export function downloadStatsSvg(state: GameState, filename: string) {
  downloadFile(filename, buildStatsSvg(state), 'image/svg+xml');
}

/** A short description of a unit for the board legend. */
export function unitLegend(units: { type: string; isElite?: boolean }[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const unit of units) {
    const key = `${unit.type}${unit.isElite ? '*' : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(`${UNIT_GLYPH[unit.type as keyof typeof UNIT_GLYPH]}${unit.isElite ? '*' : ''}`);
  }
  return parts.join(' ');
}
