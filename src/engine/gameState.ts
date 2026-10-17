// Game state management: turn structure, retreats, builds and economy.

import {
  BuildAction,
  GameState,
  Order,
  Phase,
  Power,
  PowerId,
  Territory,
  Unit,
  isMilitary,
} from '../types/game';
import { ALL_POWERS, BUILD_COST, applyIncome, calculateIncome } from './economy';

export function createInitialState(powers: Power[]): GameState {
  const economy: GameState['economy'] = {} as GameState['economy'];
  const units: Unit[] = [];

  for (const power of powers) {
    economy[power.id] = {
      eco: power.startingEco,
      supplyCenters: power.homeCenters.length,
      military: 0,
      diplomatic: 0,
      researchScore: 0,
      wealth: power.startingEco,
    };
    units.push(...power.startingUnits);
  }

  return {
    turn: 1,
    year: 350,
    phase: 'orders',
    territories: {}, // Will be populated from map data
    units,
    orders: [],
    results: [],
    builds: [],
    economy,
    activePower: null,
    scOwners: {},
    researchScores: {},
  };
}

export function nextPhase(phase: Phase): Phase {
  switch (phase) {
    case 'orders': return 'adjudication';
    case 'adjudication': return 'retreats';
    case 'retreats': return 'builds';
    case 'builds': return 'research';
    case 'research': return 'orders';
  }
}

// ---------------------------------------------------------------------
// Supply centres
// ---------------------------------------------------------------------

/**
 * A supply centre is owned by a power when a unit of that power stands in
 * it at the end of the turn (rules 2.2).
 */
export function ownedSupplyCenters(state: GameState, power: PowerId): string[] {
  return Object.values(state.territories)
    .filter((t) => t.isSupplyCenter && state.units.some(
      (u) => u.territoryId === t.id && u.power === power && !u.destroyed
    ))
    .map((t) => t.id);
}

/**
 * The cities (the black dots of the map) a power occupies. Like a supply
 * centre, a city sustains one unit of the power that stands in it, but no
 * unit can be built in a city (rules 2.2 / 3.3).
 */
export function occupiedCities(state: GameState, power: PowerId): string[] {
  return Object.values(state.territories)
    .filter(
      (t) =>
        t.isCity &&
        state.units.some(
          (u) => u.territoryId === t.id && u.power === power && !u.destroyed
        )
    )
    .map((t) => t.id);
}

/** Home supply centres of a power that it currently controls. */
export function buildableHomeCenters(
  state: GameState,
  power: PowerId,
  unitType?: 'army' | 'fleet'
): string[] {
  const controlled = new Set(ownedSupplyCenters(state, power));
  return Object.values(state.territories)
    .filter((t) => {
      if (t.homePower !== power) return false;
      if (!controlled.has(t.id)) return false;
      if (unitType === 'fleet' && t.type === 'land') return false;
      return true;
    })
    .map((t) => t.id);
}

/** Trade nodes the power currently occupies. */
export function occupiedTradeNodes(state: GameState, power: PowerId): string[] {
  return Object.values(state.territories)
    .filter(
      (t) =>
        t.isTradeNode &&
        state.units.some((u) => u.territoryId === t.id && u.power === power && !u.destroyed)
    )
    .map((t) => t.id);
}

export function militaryUnitCount(state: GameState, power: PowerId): number {
  return state.units.filter((u) => u.power === power && isMilitary(u) && !u.destroyed).length;
}

export function eliteUnitCount(state: GameState, power: PowerId): number {
  return state.units.filter((u) => u.power === power && u.isElite && !u.destroyed).length;
}

/**
 * The supply slots a power has not used yet (rules 2.2 / 3.3), after the
 * supplied pending actions. A military unit paid for with eco does not use
 * a supply slot. Pending actions are interpreted in order, just as they are
 * applied in the build phase.
 *
 * Occupied cities sustain one unit in the same way as supply centres, but
 * they are never build locations.
 */
export function freeSupplySlots(
  state: GameState,
  power: PowerId,
  pending: BuildAction[] = []
): number {
  let units = state.units.filter((u) => u.power === power && !u.destroyed).map((u) => ({ ...u }));

  const freeSlots = () => {
    const projectedState = { ...state, units };
    const capacity =
      ownedSupplyCenters(projectedState, power).length + occupiedCities(projectedState, power).length;
    const supportedUnits = units.filter((u) => isMilitary(u) && !u.bought).length;
    return Math.max(0, capacity - supportedUnits);
  };

  for (const action of pending) {
    if (action.power !== power) continue;

    if (action.kind === 'disband') {
      units = units.filter((u) => u.id !== action.unitId);
      continue;
    }

    if (action.kind === 'army' || action.kind === 'fleet') {
      if (!action.territoryId) continue;
      // Use a free slot if one is available; otherwise the new unit is paid
      // for with eco and does not consume any existing or future slot.
      const bought = freeSlots() <= 0;
      units.push({
        id: `pending_${action.id}`,
        power,
        type: action.kind,
        territoryId: action.territoryId,
        isElite: false,
        bought,
      });
      continue;
    }

    if (action.kind === 'caravan' && action.territoryId) {
      // A caravan does not itself need a military slot, but it can occupy a
      // city and therefore provide that city's sustaining capacity.
      units.push({
        id: `pending_${action.id}`,
        power,
        type: 'caravan',
        territoryId: action.territoryId,
        isElite: false,
      });
    }
  }

  return freeSlots();
}

export interface UnitLimit {
  /** Supply centres the power controls. */
  supplyCenters: number;
  /** Cities the power occupies - they sustain a unit as well. */
  cities: number;
  /** Military units the power has. */
  units: number;
  /** Units that were paid for with economic points. */
  bought: number;
  /** Units the power is allowed to keep. */
  max: number;
}

/**
 * How many military units a power may keep (rules 2.2 / 3.3): one per
 * supply centre and one per occupied city plus every unit that was paid
 * for with economic points.
 */
export function unitLimit(state: GameState, power: PowerId): UnitLimit {
  const supplyCenters = ownedSupplyCenters(state, power).length;
  const cities = occupiedCities(state, power).length;
  const units = state.units.filter((u) => u.power === power && isMilitary(u) && !u.destroyed);
  const bought = units.filter((u) => u.bought).length;
  return { supplyCenters, cities, units: units.length, bought, max: supplyCenters + cities + bought };
}

/**
 * Game master tool: places or removes a supply centre on the map.
 * The home power of a supply centre decides which power may build there.
 */
export function setSupplyCenter(
  state: GameState,
  territoryId: string,
  isSupplyCenter: boolean,
  homePower?: PowerId
): GameState {
  const territory = state.territories[territoryId];
  if (!territory) return state;

  const territories = {
    ...state.territories,
    [territoryId]: {
      ...territory,
      isSupplyCenter,
      homePower: isSupplyCenter ? homePower ?? territory.homePower : undefined,
      // A supply centre that is placed for the first time starts unfortified.
      fortified: isSupplyCenter ? territory.fortified : false,
    },
  };
  const scOwners = { ...state.scOwners };
  if (!isSupplyCenter) delete scOwners[territoryId];
  return { ...state, territories, scOwners };
}

// ---------------------------------------------------------------------
// Retreats (rules 5.3)
// ---------------------------------------------------------------------

/**
 * "A dislodged unit must retreat to an adjacent territory that is not
 *  occupied and was not the territory from which the attacking force came."
 */
export function validRetreatDestinations(state: GameState, unit: Unit): string[] {
  const territory = state.territories[unit.territoryId];
  if (!territory) return [];

  return territory.adjacent.filter((id) => {
    if (id === unit.attackedFrom) return false; // cannot retreat into the attacker
    if (state.units.some((u) => u.territoryId === id && !u.destroyed)) return false; // occupied
    const target = state.territories[id];
    if (!target) return false;
    if (unit.type === 'army' && target.type === 'sea') return false;
    if (unit.type === 'fleet' && target.type === 'land') return false;
    return true;
  });
}

/**
 * Applies the retreat orders. Units without a destination are destroyed.
 * `retreats` maps unit id -> destination province id (or null).
 */
export function applyRetreats(
  state: GameState,
  retreats: Record<string, string | null | undefined>
): GameState {
  const units = state.units.map((u) => {
    if (!u.mustRetreat) return u;
    const destination = retreats[u.id];
    if (!destination) {
      return { ...u, mustRetreat: false, destroyed: true, territoryId: u.territoryId };
    }
    return { ...u, mustRetreat: false, territoryId: destination };
  });
  return { ...state, units };
}

/** Removes units that were destroyed (dislodged without a valid retreat). */
export function removeDestroyed(state: GameState): GameState {
  return { ...state, units: state.units.filter((u) => !u.destroyed) };
}

// ---------------------------------------------------------------------
// Builds (rules 3.3 / 4.8)
// ---------------------------------------------------------------------

export interface BuildValidation {
  ok: boolean;
  cost: number;
  errors: string[];
}

/**
 * Validates a single build action in the context of the other pending
 * builds of the same power.
 */
export function validateBuild(
  state: GameState,
  action: BuildAction,
  pending: BuildAction[]
): BuildValidation {
  const errors: string[] = [];
  const power = action.power;
  const actionsForPower = pending.filter((b) => b.power === power);
  const actionIndex = actionsForPower.findIndex((b) => b.id === action.id);
  const priorActions =
    actionIndex >= 0
      ? actionsForPower.slice(0, actionIndex)
      : actionsForPower.filter((b) => b.id !== action.id);
  const others = actionsForPower.filter((b) => b.id !== action.id);

  const eco = state.economy[power]?.eco ?? 0;
  const units = state.units.filter((u) => u.power === power && !u.destroyed);

  let cost = 0;

  switch (action.kind) {
    case 'army':
    case 'fleet': {
      const territory = action.territoryId ? state.territories[action.territoryId] : undefined;
      if (!territory) {
        errors.push('Choose a province for the new unit.');
        break;
      }
      const allowed = buildableHomeCenters(state, power, action.kind);
      if (!allowed.includes(territory.id)) {
        if (territory.isCity) {
          errors.push('A city can sustain a unit, but no unit can be built in it.');
        } else {
          errors.push(
            action.kind === 'fleet'
              ? 'Fleets may only be built in a coastal home supply centre you control.'
              : 'Units may only be built in a home supply centre you control.'
          );
        }
        break;
      }
      // The first N military units are paid for by a supply centre or an
      // occupied city. Existing and pending eco-paid units do not consume
      // these free slots.
      if (freeSupplySlots(state, power, priorActions) <= 0) cost += BUILD_COST[action.kind];
      break;
    }
    case 'caravan': {
      const territory = action.territoryId ? state.territories[action.territoryId] : undefined;
      if (!territory) {
        errors.push('Choose a province for the new caravan.');
        break;
      }
      const nodes = occupiedTradeNodes(state, power);
      const homeScs = buildableHomeCenters(state, power);
      if (!nodes.includes(territory.id) && !homeScs.includes(territory.id)) {
        errors.push('Caravans are built on a trade node you occupy or in a home supply centre.');
        break;
      }
      cost += BUILD_COST.caravan;
      break;
    }
    case 'upgrade': {
      const unit = units.find((u) => u.id === action.unitId);
      if (!unit) {
        errors.push('Choose a unit to upgrade.');
        break;
      }
      if (!isMilitary(unit)) {
        errors.push('Caravans cannot be upgraded.');
        break;
      }
      if (unit.isElite) {
        errors.push('This unit is already elite.');
        break;
      }
      if (eliteUnitCount(state, power) + others.filter((b) => b.kind === 'upgrade').length >= 2) {
        errors.push('A power may have at most two elite units.');
        break;
      }
      cost += BUILD_COST.upgrade;
      break;
    }
    case 'disband': {
      const unit = units.find((u) => u.id === action.unitId);
      if (!unit) {
        errors.push('Choose a unit to disband.');
        break;
      }
      break;
    }
    case 'fortify': {
      const territory = action.territoryId ? state.territories[action.territoryId] : undefined;
      if (!territory) {
        errors.push('Choose a supply centre to fortify.');
        break;
      }
      if (!territory.isSupplyCenter) {
        errors.push('Only supply centres can be fortified.');
        break;
      }
      const controlled = ownedSupplyCenters(state, power);
      if (!controlled.includes(territory.id)) {
        errors.push('You can only fortify a supply centre you control.');
        break;
      }
      if (territory.fortified) {
        errors.push('This supply centre is already fortified.');
        break;
      }
      cost += BUILD_COST.fortify;
      break;
    }
  }

  if (cost > eco) errors.push(`Not enough economic points (needs ${cost}, has ${eco}).`);

  return { ok: errors.length === 0, cost, errors };
}

/** Total economic cost of the pending builds of a power. */
export function pendingBuildCost(state: GameState, power: PowerId): number {
  const pending = state.builds.filter((b) => b.power === power);
  return pending.reduce((sum, action) => sum + validateBuild(state, action, pending).cost, 0);
}

/**
 * Applies the pending build actions and returns the new state.
 */
export function applyBuilds(state: GameState): GameState {
  const units = [...state.units];
  const territories = { ...state.territories };
  const economy = { ...state.economy };
  let counter = 0;
  // The builds are applied one after another, so the free supply centre
  // slots and the costs have to be calculated with the builds that were
  // already applied - two armies in the same turn are not both free.
  const applied: BuildAction[] = [];

  for (const action of state.builds) {
    const power = action.power;
    switch (action.kind) {
      case 'army':
      case 'fleet': {
        if (!action.territoryId) break;
        const id = `${power}_${action.kind}_${++counter}_t${state.turn}`;
        // A unit that is not covered by a free supply centre slot was paid
        // for with economic points and may be kept without a supply centre.
        const paid = freeSupplySlots(state, power, applied) <= 0;
        units.push({
          id,
          power,
          type: action.kind,
          territoryId: action.territoryId,
          isElite: false,
          bought: paid,
        });
        break;
      }
      case 'caravan': {
        if (!action.territoryId) break;
        const id = `${power}_caravan_${++counter}_t${state.turn}`;
        units.push({
          id,
          power,
          type: 'caravan',
          territoryId: action.territoryId,
          isElite: false,
        });
        break;
      }
      case 'upgrade': {
        const unit = units.find((u) => u.id === action.unitId);
        if (unit) unit.isElite = true;
        break;
      }
      case 'disband': {
        const index = units.findIndex((u) => u.id === action.unitId);
        if (index >= 0) units.splice(index, 1);
        break;
      }
      case 'fortify': {
        if (!action.territoryId) break;
        territories[action.territoryId] = {
          ...territories[action.territoryId],
          fortified: true,
        };
        break;
      }
    }
    const current = economy[power];
    if (current) {
      const validation = validateBuild(state, action, applied);
      economy[power] = { ...current, eco: Math.max(0, current.eco - validation.cost) };
    }
    applied.push(action);
  }

  return { ...state, units, territories, economy, builds: [] };
}

/**
 * Number of military units a power is allowed to keep.
 * Units beyond the supply centre count have to be paid for (rules 2.2 / 3.3).
 */
export function maxAffordableMilitaryUnits(state: GameState, power: PowerId): number {
  return unitLimit(state, power).max;
}

// ---------------------------------------------------------------------
// Turn flow
// ---------------------------------------------------------------------

/**
 * Finishes the turn: collects the income, resets the orders and starts the
 * next turn.
 */
/**
 * Ends the turn. The income has already been collected in the income phase
 * (before the build phase, rules 4.7), so only the bookkeeping is left.
 */
export function advanceTurn(state: GameState): GameState {
  const economy = { ...state.economy };
  for (const power of ALL_POWERS) {
    const current = economy[power];
    if (!current) continue;
    economy[power] = {
      ...current,
      supplyCenters: ownedSupplyCenters(state, power).length,
    };
  }

  return {
    ...state,
    turn: state.turn + 1,
    year: state.year - 15, // Each turn is 15 years, going backward in BC
    phase: 'research',
    orders: [],
    results: [],
    builds: [],
    economy,
    incomeTurn: undefined,
  };
}

/**
 * Collects the trade income of the turn (rules 4.7). The income is only
 * counted once per turn - the game master may walk back and forth between
 * the steps without earning the income twice.
 */
export function collectIncome(state: GameState): GameState {
  if (state.incomeTurn === state.turn) return state;

  // A caravan that travelled this turn is "in transit" and earns nothing.
  const moved = new Set(
    state.orders
      .filter((o) => o.type === 'move' || o.type === 'trade')
      .map((o) => o.unitId)
  );
  for (const unit of state.units) {
    if (unit.originTerritoryId && unit.originTerritoryId !== unit.territoryId) {
      moved.add(unit.id);
    }
  }

  const income = calculateIncome(state, state.units, moved);
  // The income goes into the ledger first, the supply centre count is
  // refreshed afterwards - it must not overwrite the new eco points.
  const withIncome = applyIncome(state, income);
  const economy = { ...withIncome.economy };
  for (const power of ALL_POWERS) {
    const current = economy[power];
    if (!current) continue;
    economy[power] = {
      ...current,
      supplyCenters: ownedSupplyCenters(state, power).length,
    };
  }
  return { ...withIncome, economy, incomeTurn: state.turn };
}

/** Replaces the orders of a single unit. */
export function setOrder(state: GameState, order: Order): Order[] {
  const orders = state.orders.filter((o) => o.unitId !== order.unitId);
  orders.push(order);
  return orders;
}

/** Removes the order of a single unit. */
export function clearOrder(state: GameState, unitId: string): Order[] {
  return state.orders.filter((o) => o.unitId !== unitId);
}

/**
 * Recomputes the supply centre count of every power and applies the
 * ownership changes that happen at the end of a turn: a supply centre
 * changes hands when a unit of another power stands in it, and a captured
 * supply centre loses its fortification (rules 2.2 / 5.4).
 */
export function refreshSupplyCenters(state: GameState): GameState {
  const economy = { ...state.economy };
  const territories = { ...state.territories };
  const scOwners: Record<string, PowerId> = {};

  for (const territory of Object.values(state.territories)) {
    if (!territory.isSupplyCenter) continue;
    const owner = state.units.find(
      (u) => u.territoryId === territory.id && !u.destroyed
    )?.power;
    if (!owner) continue;
    scOwners[territory.id] = owner;
    // A supply centre that changes hands loses its fortification.
    const previous = state.scOwners[territory.id];
    if (previous && previous !== owner && territories[territory.id]?.fortified) {
      territories[territory.id] = { ...territories[territory.id], fortified: false };
    }
  }

  for (const power of ALL_POWERS) {
    const current = economy[power];
    if (!current) continue;
    economy[power] = {
      ...current,
      supplyCenters: Object.values(scOwners).filter((owner) => owner === power).length,
    };
  }
  return { ...state, economy, territories, scOwners };
}

/** Territory helper used by the UI. */
export function territoryName(state: GameState, id: string): string {
  const territory: Territory | undefined = state.territories[id];
  return territory?.name ?? id;
}
