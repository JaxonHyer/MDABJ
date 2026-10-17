import { GameState, Order, PowerId, Unit, UnitType } from '../types/game';
import { loadTerritories } from '../data/gameData';

/**
 * Builds a game state with the real map but a custom set of units and
 * orders. Only the units passed in exist in the game.
 */
export function makeState(
  units: Unit[],
  orders: Order[] = [],
  eco: Partial<Record<PowerId, number>> = {}
): GameState {
  const territories = loadTerritories();
  const economy = {} as GameState['economy'];
  for (const power of [
    'athens', 'sparta', 'macedon', 'satrapies', 'persia', 'phoenicia', 'carthage', 'rome',
  ] as PowerId[]) {
    economy[power] = {
      eco: eco[power] ?? 0,
      supplyCenters: 0,
      military: 0,
      diplomatic: 0,
      researchScore: 0,
      wealth: 0,
    };
  }
  return {
    turn: 1,
    year: 350,
    phase: 'orders',
    territories,
    units,
    orders,
    results: [],
    builds: [],
    economy,
    activePower: null,
    scOwners: {},
    researchScores: {},
  };
}

let counter = 0;

export function unit(
  power: PowerId,
  type: UnitType,
  territoryId: string,
  isElite = false
): Unit {
  counter += 1;
  return { id: `${power}_${type}_${territoryId}_${counter}`, power, type, territoryId, isElite };
}

export function order(unitId: string, type: Order['type'], target?: string, extra: Partial<Order> = {}): Order {
  return { unitId, type, target, ...extra };
}
