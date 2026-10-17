/**
 * Shared layout helpers for drawing on top of the map.
 *
 * The province names are baked into the SVG, so the only reliable way to
 * place a unit counter next to a name is to measure the name with the very
 * same font the browser uses for the SVG text.
 */
import {
  NEUTRAL_MARKS,
  SUPPLY_CENTRE_MARKS,
  TERRITORY_LABEL_TEXT,
  TERRITORY_POSITIONS,
} from './territoryPositions';
import { MAP_LABEL_FONT_SIZE, UNIT_COUNTER_SIZE } from './mapConfig';

export interface Point {
  x: number;
  y: number;
}

let measureContext: CanvasRenderingContext2D | null | undefined;

/** Width of a province label in map user units. */
export function measureLabel(text: string): number {
  if (measureContext === undefined) {
    measureContext =
      typeof document === 'undefined'
        ? null
        : document.createElement('canvas').getContext('2d');
  }
  if (!measureContext) return text.length * 6.2;
  measureContext.font = `${MAP_LABEL_FONT_SIZE}px "Bookman Old Style"`;
  return measureContext.measureText(text).width;
}

/**
 * The centre of a province - the supply centre dot if the map has one,
 * otherwise the province name.
 */
export function provinceAnchor(territoryId: string): Point | undefined {
  return (
    SUPPLY_CENTRE_MARKS[territoryId] ??
    NEUTRAL_MARKS[territoryId] ??
    TERRITORY_POSITIONS[territoryId]
  );
}

/**
 * Where the n-th unit counter of a province is drawn.
 *
 * Provinces with a supply centre dot get the counter right next to the dot,
 * every other province gets it behind the end of the province name.
 */
export function unitSlot(territoryId: string, index: number): Point | undefined {
  const mark = SUPPLY_CENTRE_MARKS[territoryId] ?? NEUTRAL_MARKS[territoryId];
  if (mark) {
    return { x: mark.x + 11 + index * (UNIT_COUNTER_SIZE + 3), y: mark.y };
  }
  const label = TERRITORY_POSITIONS[territoryId];
  if (!label) return undefined;
  const text = TERRITORY_LABEL_TEXT[territoryId] ?? '';
  return {
    x: label.x + measureLabel(text) + 8 + index * (UNIT_COUNTER_SIZE + 3),
    y: label.y - 4,
  };
}
