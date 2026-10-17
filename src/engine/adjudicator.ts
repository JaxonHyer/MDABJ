// Mare Nostrum adjudication engine.
//
// Orders are resolved simultaneously, following the rules in
// mare_nostrum/rules.pdf (Section 5 "Combat"):
//
//   * attack force  = unit force (2 for elite) + uncut supports
//   * defence force = unit force (2 for elite) + uncut supports (+1 fortified)
//   * an attack only succeeds when it is STRICTLY greater than the defence
//   * a support is cut when the supporting unit is attacked from any
//     province other than the one it supports into
//   * a dislodged unit must retreat to an adjacent, unoccupied province
//     that is not the province the attack came from (5.3)
//
// The engine never mutates the game state - it returns the resolved unit
// positions so the caller can apply them.

import {
  AdjudicationResult,
  GameState,
  Order,
  PowerId,
  Territory,
  Unit,
  unitForce,
} from '../types/game';
import { calculateIncome } from './economy';

export type MoveOutcome = 'success' | 'bounce' | 'hold';

export interface AdjudicationOutcome {
  results: AdjudicationResult[];
  units: Unit[];
  /** Units that were dislodged and still need to retreat. */
  dislodged: string[];
  /** Economic income generated this turn, per power. */
  income: Record<PowerId, number>;
  /** Ids of the units that actually travelled this turn. */
  moved: string[];
}

type OutcomeMap = Map<string, MoveOutcome>;

export class Adjudicator {
  private state: GameState;
  private units: Unit[];
  private orders: Order[];
  private orderByUnit = new Map<string, Order>();
  private results = new Map<string, AdjudicationResult>();
  /** Unit ids whose support has been cut. */
  private supportCut = new Set<string>();
  /** Move orders that are not legal at all (they are treated as a hold). */
  private invalidMoves = new Set<string>();
  private dislodgedUnits = new Set<string>();

  constructor(state: GameState) {
    this.state = state;
    this.units = state.units.map((u) => ({ ...u }));
    this.orders = state.orders.map((o) => ({ ...o }));
    for (const order of this.orders) this.orderByUnit.set(order.unitId, order);
  }

  // ------------------------------------------------------------------
  // Public entry point
  // ------------------------------------------------------------------

  adjudicate(): AdjudicationOutcome {
    this.reset();

    this.validateOrders();
    this.resolveSupports();

    const outcome = this.resolveMoves();

    // Apply the resolved movements and mark dislodged units.
    this.applyOutcomes(outcome);

    this.resolveConvoys();

    const results = Array.from(this.results.values());
    const moved = new Set<string>();
    for (const order of this.orders) {
      if (order.type !== 'move' && order.type !== 'trade') continue;
      if (this.invalidMoves.has(order.unitId)) continue;
      moved.add(order.unitId);
    }
    const income = calculateIncome(this.state, this.units, moved);

    return {
      results,
      units: this.units,
      dislodged: Array.from(this.dislodgedUnits),
      income,
      moved: Array.from(moved),
    };
  }

  private reset(): void {
    this.results.clear();
    this.supportCut.clear();
    this.invalidMoves.clear();
    this.dislodgedUnits.clear();
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private getUnit(unitId: string): Unit | undefined {
    return this.units.find((u) => u.id === unitId);
  }

  private getTerritory(id: string): Territory | undefined {
    return this.state.territories[id];
  }

  private unitIn(territoryId: string, power?: PowerId): Unit | undefined {
    return this.units.find(
      (u) => u.territoryId === territoryId && (power === undefined || u.power === power)
    );
  }

  private orderOf(unitId: string): Order | undefined {
    return this.orderByUnit.get(unitId);
  }

  /** Can this unit type occupy this kind of territory? */
  private canEnter(unit: Unit, target: Territory): boolean {
    if (unit.type === 'army') return target.type !== 'sea';
    if (unit.type === 'fleet') return target.type !== 'land';
    // Caravans move along trade routes, handled separately.
    return true;
  }

  // ------------------------------------------------------------------
  // Step 1 - order validation
  // ------------------------------------------------------------------

  private validateOrders(): void {
    for (const order of this.orders) {
      if (order.type !== 'move' && order.type !== 'trade') continue;
      const unit = this.getUnit(order.unitId);
      if (!unit || !order.target) continue;

      const from = this.getTerritory(unit.territoryId);
      const to = this.getTerritory(order.target);
      if (!from || !to) {
        this.invalidMoves.add(order.unitId);
        continue;
      }

      if (order.type === 'trade') {
        const routes = from.tradeRoutes ?? [];
        if (!routes.includes(to.id)) this.invalidMoves.add(order.unitId);
        continue;
      }

      // Caravans never walk - they follow trade routes.
      if (unit.type === 'caravan') {
        this.invalidMoves.add(order.unitId);
        continue;
      }

      if (order.viaConvoy) continue; // validated later, needs the fleet state

      if (!from.adjacent.includes(to.id) || !this.canEnter(unit, to)) {
        this.invalidMoves.add(order.unitId);
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 2 - support cuts
  //
  // "Support is cut if the supporting unit is itself attacked from any
  //  direction other than the territory it is supporting into." (5.2)
  // An attack counts even if it fails, and even for an elite supporter -
  // elite support is cut, never diminished.
  // ------------------------------------------------------------------

  private resolveSupports(): void {
    for (const order of this.orders) {
      if (
        order.type !== 'support_hold' &&
        order.type !== 'support_move' &&
        order.type !== 'transport'
      ) {
        continue;
      }
      const supporter = this.getUnit(order.unitId);
      if (!supporter) continue;

      // The province the support points at.
      const supportedProvince =
        order.type === 'support_hold' ? supporter.territoryId : order.target;

      const attacker = this.orders.find((o) => {
        if (o.type !== 'move') return false;
        if (this.invalidMoves.has(o.unitId)) return false;
        if (o.target !== supporter.territoryId) return false;
        const moving = this.getUnit(o.unitId);
        if (!moving) return false;
        // A power can neither dislodge nor cut the support of its own units.
        if (moving.power === supporter.power) return false;
        // An attack coming from the province that is being supported into
        // does not cut the support.
        if (supportedProvince && moving.territoryId === supportedProvince) return false;
        return true;
      });

      if (attacker) {
        this.supportCut.add(order.unitId);
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: false,
          kind: order.type === 'transport' ? 'transport' : 'support',
          message: `Support cut - ${this.getTerritory(supporter.territoryId)?.name ?? supporter.territoryId} is attacked`,
        });
      }
    }
  }

  /**
   * The unit a support order points at. Orders created by the UI carry the
   * id explicitly, otherwise it is derived from the supported province.
   */
  private supportedUnitId(order: Order): string | undefined {
    if (order.supportTarget) return order.supportTarget;
    if (!order.target) return undefined;
    if (order.type === 'support_move') {
      const move = this.orders.find(
        (o) => o.type === 'move' && o.target === order.target && o.unitId !== order.unitId
      );
      return move?.unitId;
    }
    return this.unitIn(order.target)?.id;
  }

  /** Support given by a unit that itself got dislodged is void. */
  private isSupportEffective(order: Order, dislodged: Set<string>): boolean {
    if (this.supportCut.has(order.unitId)) return false;
    if (dislodged.has(order.unitId)) return false;
    return true;
  }

  // ------------------------------------------------------------------
  // Step 3 - movement resolution
  // ------------------------------------------------------------------

  private resolveMoves(): OutcomeMap {
    const moveOrders = this.orders.filter((o) => o.type === 'move');
    const directMoves = moveOrders.filter(
      (o) => !this.invalidMoves.has(o.unitId) && !o.viaConvoy
    );

    // A unit may not move into a province held by one of its own units.
    for (const order of directMoves) {
      const unit = this.getUnit(order.unitId);
      if (!unit || !order.target) continue;
      const friend = this.unitIn(order.target, unit.power);
      if (friend) {
        this.invalidMoves.add(order.unitId);
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: false,
          kind: 'move',
          message: `Invalid move - ${this.getTerritory(order.target)?.name ?? order.target} is occupied by a friendly unit`,
        });
      }
    }

    // Resolve until the set of dislodged supporters stops changing.
    let dislodgedSupporters = new Set<string>();
    let outcome: OutcomeMap = new Map();
    for (let iteration = 0; iteration < 6; iteration++) {
      outcome = this.computeOutcomes(dislodgedSupporters);
      const next = new Set<string>();
      for (const [unitId, result] of outcome) {
        if (result !== 'success') continue;
        const order = this.orderOf(unitId);
        if (!order?.target) continue;
        const attacker = this.getUnit(unitId);
        if (!attacker) continue;
        const defender = this.units.find(
          (u) => u.territoryId === order.target && u.power !== attacker.power
        );
        if (defender) next.add(defender.id);
      }
      const before = Array.from(dislodgedSupporters).sort().join(',');
      const after = Array.from(next).sort().join(',');
      dislodgedSupporters = next;
      if (before === after) break;
    }

    return outcome;
  }

  /**
   * Computes the outcome of every move order for a given set of dislodged
   * supporters (whose support is therefore void).
   */
  private computeOutcomes(dislodgedSupporters: Set<string>): OutcomeMap {
    const outcome: OutcomeMap = new Map();
    const movers = this.orders.filter(
      (o) => o.type === 'move' && !o.viaConvoy && !this.invalidMoves.has(o.unitId)
    );

    // Group by destination: two units moving into the same province both
    // bounce (Diplomacy rule 6.E).
    const byTarget = new Map<string, Order[]>();
    for (const order of movers) {
      if (!order.target) continue;
      const list = byTarget.get(order.target) ?? [];
      list.push(order);
      byTarget.set(order.target, list);
    }

    for (const [target, group] of byTarget) {
      if (group.length > 1) {
        for (const order of group) {
          outcome.set(order.unitId, 'bounce');
        }
        continue;
      }
      const order = group[0];
      const attacker = this.getUnit(order.unitId);
      const defender = attacker
        ? this.units.find(
            (u) => u.territoryId === target && u.power !== attacker.power && !u.destroyed
          )
        : undefined;

      if (!defender) {
        outcome.set(order.unitId, 'success');
        continue;
      }

      const attackForce = this.attackForce(order, dislodgedSupporters);
      const defenceForce = this.defenceForce(defender, dislodgedSupporters);
      outcome.set(
        order.unitId,
        attackForce > defenceForce ? 'success' : 'bounce'
      );
    }

    return outcome;
  }

  private attackForce(order: Order, dislodgedSupporters: Set<string>): number {
    const attacker = this.getUnit(order.unitId);
    if (!attacker) return 0;
    let force = unitForce(attacker);

    for (const support of this.orders) {
      if (support.type !== 'support_move') continue;
      if (support.target !== order.target) continue;
      if (this.supportedUnitId(support) !== order.unitId) continue;
      if (!this.isSupportEffective(support, dislodgedSupporters)) continue;
      const supporter = this.getUnit(support.unitId);
      if (supporter) force += unitForce(supporter);
    }

    return force;
  }

  private defenceForce(
    defender: Unit,
    dislodgedSupporters: Set<string>
  ): number {
    let force = unitForce(defender);
    const territory = this.getTerritory(defender.territoryId);

    for (const support of this.orders) {
      if (support.type !== 'support_hold') continue;
      if (support.target !== defender.territoryId) continue;
      if (this.supportedUnitId(support) !== defender.id) continue;
      if (!this.isSupportEffective(support, dislodgedSupporters)) continue;
      const supporter = this.getUnit(support.unitId);
      if (supporter) force += unitForce(supporter);
    }

    // 5.4 - a fortified supply centre adds +1 to the defence.
    if (territory?.fortified) force += 1;

    return force;
  }

  // ------------------------------------------------------------------
  // Step 4 - apply the resolved movements
  // ------------------------------------------------------------------

  private applyOutcomes(outcome: OutcomeMap): void {
    for (const order of this.orders) {
      const unit = this.getUnit(order.unitId);
      if (!unit) continue;

      if (order.type === 'move') {
        // A convoyed army is moved by the convoy resolution.
        if (order.viaConvoy) continue;
        if (this.invalidMoves.has(order.unitId)) {
          if (!this.results.has(order.unitId)) {
            this.results.set(order.unitId, {
              orderId: order.unitId,
              success: false,
              kind: 'move',
              message: `Invalid move - ${this.getTerritory(unit.territoryId)?.name ?? unit.territoryId} holds`,
            });
          }
          continue;
        }

        const result = outcome.get(order.unitId) ?? 'hold';
        const target = order.target!;
        const defender = this.units.find(
          (u) => u.territoryId === target && u.power !== unit.power && !u.destroyed
        );

        if (result === 'success') {
          if (defender) {
            defender.mustRetreat = true;
            defender.attackedFrom = unit.territoryId;
            this.dislodgedUnits.add(defender.id);
            this.results.set(defender.id, {
              orderId: defender.id,
              success: false,
              kind: 'retreat',
              message: `${defender.type} in ${this.getTerritory(target)?.name ?? target} is dislodged and must retreat`,
            });
          }
          const fromName = this.getTerritory(unit.territoryId)?.name ?? unit.territoryId;
          unit.originTerritoryId = unit.territoryId;
          unit.territoryId = target;
          unit.mustRetreat = false;
          this.results.set(order.unitId, {
            orderId: order.unitId,
            success: true,
            kind: 'move',
            message: `${unit.type} from ${fromName} moves to ${
              this.getTerritory(target)?.name ?? target
            }`,
          });
        } else {
          this.results.set(order.unitId, {
            orderId: order.unitId,
            success: false,
            kind: 'move',
            message: `${unit.type} in ${this.getTerritory(unit.territoryId)?.name ?? unit.territoryId} is bounced (attack ${
              this.attackForce(order, new Set())
            } vs defence ${this.defenceForceForTarget(target, unit.power, new Set())})`,
          });
        }
        continue;
      }

      if (order.type === 'trade') {
        const valid = !this.invalidMoves.has(order.unitId);
        if (valid) {
          unit.originTerritoryId = unit.territoryId;
          unit.territoryId = order.target!;
        }
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: valid,
          kind: 'trade',
          message: valid
            ? `Caravan trades to ${this.getTerritory(order.target!)?.name ?? order.target}`
            : 'Invalid trade route - caravan holds',
        });
        continue;
      }

      if (order.type === 'hold') {
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: true,
          kind: 'hold',
          message: `${unit.type} holds in ${this.getTerritory(unit.territoryId)?.name ?? unit.territoryId}`,
        });
        continue;
      }

      if (order.type === 'support_hold' || order.type === 'support_move') {
        if (!this.results.has(order.unitId)) {
          this.results.set(order.unitId, {
            orderId: order.unitId,
            success: true,
            kind: 'support',
            message: `${unit.type} in ${this.getTerritory(unit.territoryId)?.name ?? unit.territoryId} supports`,
          });
        }
        continue;
      }

      if (order.type === 'transport') {
        if (!this.results.has(order.unitId)) {
          this.results.set(order.unitId, {
            orderId: order.unitId,
            success: true,
            kind: 'transport',
            message: `${unit.type} in ${this.getTerritory(unit.territoryId)?.name ?? unit.territoryId} transports`,
          });
        }
      }
    }
  }

  private defenceForceForTarget(
    target: string,
    attackerPower: PowerId,
    dislodgedSupporters: Set<string>
  ): number {
    const defender = this.units.find(
      (u) => u.territoryId === target && u.power !== attackerPower && !u.destroyed
    );
    if (!defender) return 0;
    return this.defenceForce(defender, dislodgedSupporters);
  }

  // ------------------------------------------------------------------
  // Step 5 - convoyed (transported) army moves
  //
  // 3.1 - "An army may be transported across a sea zone by a friendly fleet
  //  occupying that zone, moving to any coastal territory on the far side."
  // 5.7 - if the convoying fleet is dislodged the transport fails and the
  //  army stays where it was.
  // ------------------------------------------------------------------

  private resolveConvoys(): void {
    const convoyOrders = this.orders.filter(
      (o) => o.type === 'move' && o.viaConvoy && !this.invalidMoves.has(o.unitId)
    );
    if (convoyOrders.length === 0) return;

    // "A fleet in a sea zone or coastal territory can transport one army
    // across that zone per turn" (rules 3.1).
    const usedFleets = new Set<string>();

    for (const order of convoyOrders) {
      const army = this.getUnit(order.unitId);
      if (!army || !order.target) continue;
      const target = this.getTerritory(order.target);
      if (!target) continue;

      if (army.type !== 'army') {
        this.invalidMoves.add(order.unitId);
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: false,
          kind: 'move',
          message: 'Only armies can be transported',
        });
        continue;
      }

      // Already adjacent? The army can simply walk - no transport needed.
      const origin = this.getTerritory(army.territoryId);
      if (origin && origin.adjacent.includes(target.id)) {
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: true,
          kind: 'move',
          message: `${army.type} in ${this.getTerritory(army.territoryId)?.name ?? army.territoryId} moves to ${target.name}`,
        });
        army.originTerritoryId = army.territoryId;
        army.territoryId = target.id;
        continue;
      }

      const fleet = this.findTransportFleet(army, target.id, usedFleets);

      if (!fleet) {
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: false,
          kind: 'move',
          message: `No friendly fleet is available to transport ${army.type} to ${target.name}`,
        });
        continue;
      }

      usedFleets.add(fleet.id);

      if (this.dislodgedUnits.has(fleet.id)) {
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: false,
          kind: 'move',
          message: `Transport intercepted - ${fleet.type} in ${this.getTerritory(fleet.territoryId)?.name ?? fleet.territoryId} was dislodged`,
        });
        continue;
      }

      // Only one army may enter a province in a turn.
      const rival = this.orders.find(
        (o) =>
          o.type === 'move' &&
          o.unitId !== order.unitId &&
          o.target === target.id &&
          !this.invalidMoves.has(o.unitId)
      );
      if (rival) {
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: false,
          kind: 'move',
          message: `Convoyed army bounces in ${target.name}`,
        });
        continue;
      }

      // A convoyed army may not enter a province held by a friendly unit.
      const friend = this.unitIn(target.id, army.power);
      if (friend) {
        this.results.set(order.unitId, {
          orderId: order.unitId,
          success: false,
          kind: 'move',
          message: `Invalid transport - ${target.name} is occupied by a friendly unit`,
        });
        continue;
      }

      const defender = this.units.find(
        (u) => u.territoryId === target.id && u.power !== army.power && !u.destroyed
      );
      if (defender) {
        // The convoying fleet stays in the sea zone - it transports the army
        // but does not add its force to the attack.
        const attackForce = unitForce(army);
        const defenceForce = this.defenceForce(defender, new Set());
        if (attackForce <= defenceForce) {
          this.results.set(order.unitId, {
            orderId: order.unitId,
            success: false,
            kind: 'move',
            message: `Convoyed attack on ${target.name} bounces (${attackForce} vs ${defenceForce})`,
          });
          continue;
        }
        defender.mustRetreat = true;
        defender.attackedFrom = army.territoryId;
        this.dislodgedUnits.add(defender.id);
        this.results.set(defender.id, {
          orderId: defender.id,
          success: false,
          kind: 'retreat',
          message: `${defender.type} in ${target.name} is dislodged and must retreat`,
        });
      }

      army.originTerritoryId = army.territoryId;
      army.territoryId = target.id;
      this.results.set(order.unitId, {
        orderId: order.unitId,
        success: true,
        kind: 'move',
        message: `${army.type} is transported to ${target.name} by ${fleet.type} in ${this.getTerritory(fleet.territoryId)?.name ?? fleet.territoryId}`,
      });
    }
  }

  /**
   * Finds a friendly fleet that can carry the army: it must sit in a sea
   * zone next to the destination and next to (or next to the army), and it
   * must not be ordered to move away.
   */
  private findTransportFleet(
    army: Unit,
    targetId: string,
    usedFleets: Set<string> = new Set()
  ): Unit | undefined {
    const target = this.getTerritory(targetId);
    if (!target) return undefined;
    const origin = this.getTerritory(army.territoryId);

    const candidates = this.units.filter((u) => {
      if (u.power !== army.power) return false;
      if (u.type !== 'fleet') return false;
      if (usedFleets.has(u.id)) return false;
      const sea = this.getTerritory(u.territoryId);
      if (!sea || sea.type !== 'sea') return false;
      if (!sea.adjacent.includes(targetId)) return false;
      // The army has to be able to reach the sea zone.
      if (origin) {
        const reaches =
          origin.adjacent.includes(sea.id) || origin.id === sea.id;
        if (!reaches) return false;
      }
      // The fleet may not sail away in the same turn.
      const order = this.orderOf(u.id);
      if (order && (order.type === 'move' || order.type === 'trade')) return false;
      return true;
    });

    // Prefer a fleet that was explicitly ordered to transport this army.
    const explicit = candidates.find((u) => {
      const order = this.orderOf(u.id);
      return (
        order?.type === 'transport' &&
        order.supportTarget === army.id &&
        order.target === targetId
      );
    });
    if (explicit) return explicit;

    return candidates[0];
  }

  // ------------------------------------------------------------------
  // Step 6 - income (rules 4.7 / 2.3)
  // ------------------------------------------------------------------
}

/**
 * Convenience function to adjudicate a game state.
 */
export function adjudicate(state: GameState): AdjudicationOutcome {
  return new Adjudicator(state).adjudicate();
}

/**
 * Backwards compatible helper: only the results of an adjudication.
 */
export function adjudicateResults(state: GameState): AdjudicationResult[] {
  return adjudicate(state).results;
}
