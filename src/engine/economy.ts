// Economic system (rules 2.3, 3.3, 4.7, 4.8).

import { GameState, PowerId, Unit, isMilitary } from '../types/game';

export const BANKING_CAP = 15;

export const BUILD_COST = {
  army: 6,
  fleet: 6,
  caravan: 4,
  upgrade: 8,
  fortify: 3,
} as const;

export const ALL_POWERS: PowerId[] = [
  'athens',
  'sparta',
  'macedon',
  'satrapies',
  'persia',
  'phoenicia',
  'carthage',
  'rome',
];

/**
 * Income of every trade node (rules 2.3 / 4.7):
 *
 *   * a caravan on the node yields the full value of the node
 *   * a military unit on the node yields half the value (rounded down)
 *   * a caravan that is blockaded by a hostile military unit yields nothing
 *   * a caravan that travelled this turn is "in transit" and yields nothing
 */
export function calculateIncome(
  state: GameState,
  units: Unit[],
  movedUnitIds: Set<string> = new Set()
): Record<PowerId, number> {
  const income = {} as Record<PowerId, number>;
  for (const power of ALL_POWERS) income[power] = 0;

  for (const territory of Object.values(state.territories)) {
    if (!territory.isTradeNode || !territory.tradeNodeValue) continue;
    const value = territory.tradeNodeValue;

    // A unit that has to retreat earns no income (rules 5.3).
    const here = units.filter(
      (u) => u.territoryId === territory.id && !u.destroyed && !u.mustRetreat
    );
    if (here.length === 0) continue;

    for (const caravan of here.filter((u) => u.type === 'caravan')) {
      if (movedUnitIds.has(caravan.id)) continue; // in transit
      const blockaded = here.some((u) => isMilitary(u) && u.power !== caravan.power);
      if (blockaded) continue;
      income[caravan.power] += value;
    }

    for (const military of here.filter(isMilitary)) {
      const hasCaravan = here.some(
        (u) => u.type === 'caravan' && u.power === military.power
      );
      if (hasCaravan) continue;
      income[military.power] += Math.floor(value / 2);
    }
  }

  return income;
}

/** Adds income to the ledger and applies the banking cap. */
export function applyIncome(
  state: GameState,
  income: Record<PowerId, number>
): GameState {
  const economy = { ...state.economy };
  for (const power of ALL_POWERS) {
    const current = economy[power] ?? emptyEconomy();
    const gained = income[power] ?? 0;
    economy[power] = {
      ...current,
      eco: Math.min(BANKING_CAP, current.eco + gained),
      wealth: current.wealth + gained,
    };
  }
  return { ...state, economy, lastIncome: income };
}

/** A power with an empty ledger. */
export function emptyEconomy() {
  return {
    eco: 0,
    supplyCenters: 0,
    military: 0,
    diplomatic: 0,
    researchScore: 0,
    wealth: 0,
  };
}

/**
 * The game master may add or remove economic points by hand (research
 * bonuses, event rewards, corrections).
 */
export function adjustEco(
  state: GameState,
  power: PowerId,
  delta: number
): GameState {
  const economy = { ...state.economy };
  const current = economy[power] ?? emptyEconomy();
  economy[power] = {
    ...current,
    eco: Math.max(0, Math.min(BANKING_CAP, current.eco + delta)),
  };
  return { ...state, economy };
}

/** The game master may add or remove military / diplomatic points by hand. */
export function adjustPoints(
  state: GameState,
  power: PowerId,
  ledger: 'military' | 'diplomatic',
  delta: number
): GameState {
  const economy = { ...state.economy };
  const current = economy[power] ?? emptyEconomy();
  economy[power] = {
    ...current,
    [ledger]: Math.max(0, current[ledger] + delta),
  };
  return { ...state, economy };
}
