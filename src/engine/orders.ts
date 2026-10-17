// Order helpers shared by the order panel and the map.

import { GameState, Order, OrderType, Unit } from '../types/game';

function unitInTerritory(state: GameState, territoryId: string, power?: string) {
  return state.units.find(
    (u) => u.territoryId === territoryId && !u.destroyed && (!power || u.power === power)
  );
}

/**
 * The provinces a unit may act on with the given order type.
 * Used to highlight the legal targets on the map.
 */
export function validOrderTargets(
  state: GameState,
  unit: Unit,
  type: OrderType
): string[] {
  const from = state.territories[unit.territoryId];
  if (!from) return [];
  const result = new Set<string>();

  switch (type) {
    case 'move': {
      if (unit.type === 'caravan') {
        for (const id of from.tradeRoutes ?? []) result.add(id);
        break;
      }
      for (const id of from.adjacent) {
        const target = state.territories[id];
        if (!target) continue;
        if (unit.type === 'army' && target.type === 'sea') continue;
        if (unit.type === 'fleet' && target.type === 'land') continue;
        if (state.units.some((u) => u.territoryId === id && u.power === unit.power && !u.destroyed)) {
          continue;
        }
        result.add(id);
      }
      // Armies may also be carried to a coastal province on the far side of
      // a sea zone held by a friendly fleet.
      if (unit.type === 'army') {
        for (const fleet of state.units) {
          if (fleet.power !== unit.power || fleet.type !== 'fleet' || fleet.destroyed) continue;
          const sea = state.territories[fleet.territoryId];
          if (!sea || sea.type !== 'sea') continue;
          if (!from.adjacent.includes(sea.id) && from.id !== sea.id) continue;
          for (const id of sea.adjacent) {
            const target = state.territories[id];
            if (!target || target.type !== 'coastal') continue;
            if (state.units.some((u) => u.territoryId === id && u.power === unit.power && !u.destroyed)) {
              continue;
            }
            result.add(id);
          }
        }
      }
      break;
    }
    case 'trade': {
      for (const id of from.tradeRoutes ?? []) result.add(id);
      break;
    }
    case 'support_hold': {
      for (const id of from.adjacent) {
        const friend = unitInTerritory(state, id, unit.power);
        if (friend) result.add(id);
      }
      break;
    }
    case 'support_move': {
      for (const id of from.adjacent) {
        const order = state.orders.find(
          (o) => o.type === 'move' && o.target === id && o.unitId !== unit.id
        );
        if (!order) continue;
        const mover = state.units.find((u) => u.id === order.unitId);
        if (mover && mover.power === unit.power) result.add(id);
      }
      break;
    }
    case 'transport': {
      if (unit.type !== 'fleet') break;
      const sea = state.territories[unit.territoryId];
      if (!sea) break;
      for (const id of sea.adjacent) {
        const target = state.territories[id];
        if (!target || target.type !== 'coastal') continue;
        result.add(id);
      }
      break;
    }
    default:
      break;
  }

  return Array.from(result);
}

/**
 * The unit that `supporter` can support in `territoryId`.
 *
 * For a support-hold the supported unit simply sits in that province, for a
 * support-move it is a friendly unit that is ordered into that province.
 */
export function supportableUnit(
  state: GameState,
  supporter: Unit,
  territoryId: string,
  type: OrderType = 'support_hold'
): Unit | undefined {
  const from = state.territories[supporter.territoryId];
  if (!from || !from.adjacent.includes(territoryId)) return undefined;

  if (type === 'support_move') {
    const order = state.orders.find(
      (o) => o.type === 'move' && o.target === territoryId && o.unitId !== supporter.id
    );
    if (!order) return undefined;
    const mover = state.units.find((u) => u.id === order.unitId);
    if (!mover || mover.power !== supporter.power || mover.destroyed) return undefined;
    return mover;
  }

  const friend = unitInTerritory(state, territoryId, supporter.power);
  if (!friend || friend.id === supporter.id) return undefined;
  return friend;
}

/** Creates (or replaces) the order of a unit. */
export function upsertOrder(orders: Order[], order: Order): Order[] {
  const next = orders.filter((o) => o.unitId !== order.unitId);
  next.push(order);
  return next;
}
