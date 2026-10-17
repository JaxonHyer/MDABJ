/**
 * Map geometry constants.
 *
 * The map SVG (public/map.svg) uses a single user-unit coordinate system.
 * Everything that has to be drawn on top of the map (units, order arrows,
 * highlights) uses the very same coordinates, so the overlay <svg> simply
 * uses the same viewBox as the map itself.
 */
import { PowerId } from '../types/game';

/** viewBox of public/map.svg - keep in sync with the file itself. */
export const MAP_VIEWBOX = '-470 0 1497 804';
export const MAP_WIDTH = 1497;
export const MAP_HEIGHT = 804;

/** Font used by the province labels baked into the SVG. */
export const MAP_LABEL_FONT_SIZE = 12;
export const MAP_LABEL_FONT_FAMILY = "'Bookman Old Style', 'Bookman Old Style Light', Georgia, serif";

/** Size of a unit counter in map user units. */
export const UNIT_COUNTER_SIZE = 15;

export const POWER_COLORS: Record<PowerId, string> = {
  athens: '#1fe922',
  sparta: '#1f2ee5',
  macedon: '#efe9d5',
  satrapies: '#ff920e',
  persia: '#803300',
  phoenicia: '#ab15eb',
  carthage: '#efe922',
  rome: '#ef1122',
};

/** Slightly darker outlines so pale unit counters stay readable. */
export const POWER_OUTLINE: Record<PowerId, string> = {
  athens: '#0d5c12',
  sparta: '#101a70',
  macedon: '#6b6449',
  satrapies: '#7a3c00',
  persia: '#3d1700',
  phoenicia: '#4a0a5e',
  carthage: '#6b6a00',
  rome: '#6b060f',
};

/** Neutral provinces are drawn in a muted grey. */
export const NEUTRAL_COLOR = '#8a8a8a';
export const NEUTRAL_OUTLINE = '#3a3a3a';

/**
 * Picks a readable text colour for a filled unit counter.
 */
export function contrastingText(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#101010' : '#ffffff';
}
