// Save files: a small, human readable JSON snapshot of a game that the game
// master can load and share with the players.

import {
  AdjudicationResult,
  BuildAction,
  Economy,
  GameState,
  Order,
  Phase,
  PowerId,
  ResearchTopic,
  Territory,
  Unit,
} from '../types/game';
import { loadTerritories } from '../data/gameData';

export const SAVE_FORMAT = 'mare-nostrum-save';
export const SAVE_VERSION = 1;

export interface SaveFile {
  format: string;
  version: number;
  savedAt: string;
  turn: number;
  year: number;
  phase: Phase;
  activePower: PowerId | null;
  economy: Record<PowerId, Economy>;
  units: Unit[];
  orders: Order[];
  results: AdjudicationResult[];
  builds: BuildAction[];
  scOwners: Record<string, PowerId>;
  researchScores: Partial<Record<PowerId, { score: number; topic: ResearchTopic }>>;
  notes?: string;
  /** Only the fields that differ from the built in map data. */
  territoryOverrides: Record<string, Partial<Territory>>;
}

/** The fields of a territory that a save file may change. */
const OVERRIDE_FIELDS: (keyof Territory)[] = [
  'isSupplyCenter',
  'homePower',
  'isTradeNode',
  'tradeNodeValue',
  'fortified',
];

/** Collects the differences between the game map and the built in map. */
export function territoryOverrides(state: GameState): Record<string, Partial<Territory>> {
  const base = loadTerritories();
  const overrides: Record<string, Partial<Territory>> = {};
  for (const [id, territory] of Object.entries(state.territories)) {
    const original = base[id];
    if (!original) continue;
    const changed: Partial<Territory> = {};
    for (const field of OVERRIDE_FIELDS) {
      if (territory[field] !== original[field]) {
        (changed as Record<string, unknown>)[field] = territory[field];
      }
    }
    if (Object.keys(changed).length > 0) overrides[id] = changed;
  }
  return overrides;
}

/** Builds the save file of a game state. */
export function serializeState(state: GameState): SaveFile {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    turn: state.turn,
    year: state.year,
    phase: state.phase,
    activePower: state.activePower,
    economy: state.economy,
    units: state.units,
    orders: state.orders,
    results: state.results,
    builds: state.builds,
    scOwners: state.scOwners,
    researchScores: state.researchScores,
    notes: state.notes,
    territoryOverrides: territoryOverrides(state),
  };
}

/** The save file as a pretty printed JSON string. */
export function stateToJson(state: GameState): string {
  return JSON.stringify(serializeState(state), null, 2);
}

/** Rebuilds a game state from a save file. */
export function stateFromJson(text: string): GameState {
  const data = JSON.parse(text) as Partial<SaveFile>;
  if (!data || typeof data !== 'object') throw new Error('The file is not a save file.');
  if (data.format !== SAVE_FORMAT) {
    throw new Error(`Unknown file format "${data.format ?? 'none'}".`);
  }
  if (typeof data.turn !== 'number' || typeof data.year !== 'number') {
    throw new Error('The save file is missing the turn or the year.');
  }

  const territories = loadTerritories();
  for (const [id, changes] of Object.entries(data.territoryOverrides ?? {})) {
    if (!territories[id]) continue;
    territories[id] = { ...territories[id], ...changes };
  }

  return {
    turn: data.turn,
    year: data.year,
    phase: data.phase ?? 'orders',
    territories,
    units: data.units ?? [],
    orders: data.orders ?? [],
    results: data.results ?? [],
    builds: data.builds ?? [],
    economy: data.economy ?? ({} as Record<PowerId, Economy>),
    activePower: data.activePower ?? null,
    scOwners: data.scOwners ?? {},
    researchScores: data.researchScores ?? {},
    notes: data.notes,
  };
}

/** Triggers a download of a file in the browser. */
export function downloadFile(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The file name of the current save file. */
export function saveFileName(state: GameState): string {
  return `mare-nostrum-turn${state.turn}-${state.year}bc.json`;
}
