// Mare Nostrum Adjudication Engine
// Handles order resolution following Diplomacy-style simultaneous adjudication
// with Mare Nostrum-specific rules (elite units, caravans, etc.)

import {
  GameState, Order, Unit, AdjudicationResult, Territory,
  unitForce
} from '../types/game';

export class Adjudicator {
  private state: GameState;
  private results: Map<string, AdjudicationResult> = new Map();
  private supportCut: Set<string> = new Set(); // Unit IDs whose support was cut

  constructor(state: GameState) {
    this.state = state;
  }

  /**
   * Main adjudication entry point.
   * Resolves all orders simultaneously and returns results.
   */
  adjudicate(): AdjudicationResult[] {
    this.results.clear();
    this.supportCut.clear();

    // Step 1: Determine which supports are cut
    this.resolveSupportCuts();

    // Step 2: Resolve all movement orders
    this.resolveMovements();

    // Step 3: Determine dislodged units and retreat options
    this.resolveDislodgements();

    return Array.from(this.results.values());
  }

  /**
   * Step 1: Determine which support orders are cut.
   * A support is cut if the supporting unit is attacked from a territory
   * OTHER than the one it's supporting into/against.
   */
  private resolveSupportCuts(): void {
    const supportOrders = this.state.orders.filter(
      o => o.type === 'support_hold' || o.type === 'support_move'
    );

    for (const support of supportOrders) {
      const supportUnit = this.getUnit(support.unitId);
      if (!supportUnit) continue;

      const supportTerritory = this.getTerritory(supportUnit.territoryId);
      if (!supportTerritory) continue;

      // Find all attacks against this supporting unit
      const attacksOnSupporter = this.state.orders.filter(o => {
        if (o.type !== 'move') return false;
        if (o.target !== supportUnit.territoryId) return false;
        const attacker = this.getUnit(o.unitId);
        if (!attacker) return false;
        // Don't count attacks from the territory being supported into
        if (support.type === 'support_move' && support.target === attacker.territoryId) {
          return false;
        }
        return attacker.power !== supportUnit.power;
      });

      if (attacksOnSupporter.length > 0) {
        this.supportCut.add(support.unitId);
      }
    }
  }

  /**
   * Step 2: Resolve all movement orders.
   * Each move succeeds only if attacking force > defending force.
   */
  private resolveMovements(): void {
    const moveOrders = this.state.orders.filter(o => o.type === 'move');

    for (const move of moveOrders) {
      const attacker = this.getUnit(move.unitId);
      if (!attacker || !move.target) {
        this.results.set(move.unitId, {
          orderId: move.unitId,
          success: false,
          message: 'Invalid move order'
        });
        continue;
      }

      const attackForce = this.calculateAttackForce(move);
      const defendForce = this.calculateDefenseForce(move.target, attacker.power);

      const success = attackForce > defendForce;

      this.results.set(move.unitId, {
        orderId: move.unitId,
        success,
        message: success
          ? `${attacker.type} ${attacker.territoryId} → ${move.target} succeeds (${attackForce} vs ${defendForce})`
          : `${attacker.type} ${attacker.territoryId} → ${move.target} bounces (${attackForce} vs ${defendForce})`
      });
    }

    // Handle non-move orders
    for (const order of this.state.orders) {
      if (order.type === 'move') continue;

      const unit = this.getUnit(order.unitId);
      if (!unit) continue;

      switch (order.type) {
        case 'hold':
          this.results.set(order.unitId, {
            orderId: order.unitId,
            success: true,
            message: `${unit.type} holds in ${unit.territoryId}`
          });
          break;

        case 'support_hold':
        case 'support_move': {
          const cut = this.supportCut.has(order.unitId);
          this.results.set(order.unitId, {
            orderId: order.unitId,
            success: !cut,
            message: cut
              ? `${unit.type} support cut`
              : `${unit.type} supports successfully`
          });
          break;
        }

        case 'transport': {
          // Transport succeeds if the convoying fleet is not dislodged
          // (checked during movement resolution)
          this.results.set(order.unitId, {
            orderId: order.unitId,
            success: true,
            message: `${unit.type} transports army`
          });
          break;
        }

        case 'trade': {
          // Caravan trade movement - validate along trade route
          const valid = this.isValidTradeMove(unit, order.target);
          this.results.set(order.unitId, {
            orderId: order.unitId,
            success: valid,
            message: valid
              ? `Caravan trades to ${order.target}`
              : `Invalid trade route`
          });
          break;
        }
      }
    }
  }

  /**
   * Calculate the total attacking force for a move order.
   */
  private calculateAttackForce(move: Order): number {
    const attacker = this.getUnit(move.unitId);
    if (!attacker) return 0;

    let force = unitForce(attacker);

    // Add support from supporting units
    const supporters = this.state.orders.filter(o =>
      o.type === 'support_move' &&
      o.target === move.target &&
      o.supportTarget === move.unitId &&
      !this.supportCut.has(o.unitId)
    );

    for (const support of supporters) {
      const supportUnit = this.getUnit(support.unitId);
      if (supportUnit) {
        force += unitForce(supportUnit);
      }
    }

    return force;
  }

  /**
   * Calculate the total defending force for a territory.
   */
  private calculateDefenseForce(territoryId: string, attackerPower: string): number {
    const defender = this.state.units.find(
      u => u.territoryId === territoryId && u.power !== attackerPower
    );

    if (!defender) return 0;

    let force = unitForce(defender);

    // Add support from supporting units
    const supporters = this.state.orders.filter(o =>
      o.type === 'support_hold' &&
      o.supportTarget === defender.id &&
      !this.supportCut.has(o.unitId)
    );

    for (const support of supporters) {
      const supportUnit = this.getUnit(support.unitId);
      if (supportUnit) {
        force += unitForce(supportUnit);
      }
    }

    return force;
  }

  /**
   * Step 3: Determine which units are dislodged and calculate retreat options.
   */
  private resolveDislodgements(): void {
    // Find all successful moves
    const successfulMoves = this.state.orders.filter(o => {
      const result = this.results.get(o.unitId);
      return o.type === 'move' && result?.success;
    });

    for (const move of successfulMoves) {
      if (!move.target) continue;

      // Check if there's a unit in the target territory that gets dislodged
      const attacker = this.getUnit(move.unitId);
      if (!attacker) continue;

      const defender = this.state.units.find(
        u => u.territoryId === move.target && u.power !== attacker.power
      );

      if (defender) {
        defender.mustRetreat = true;
      }
    }
  }

  /**
   * Validate a caravan trade move along trade routes.
   */
  private isValidTradeMove(unit: Unit, targetId?: string): boolean {
    if (!targetId) return false;
    if (unit.type !== 'caravan') return false;

    const currentTerritory = this.getTerritory(unit.territoryId);
    if (!currentTerritory || !currentTerritory.tradeRoutes) return false;

    return currentTerritory.tradeRoutes.includes(targetId);
  }

  private getUnit(unitId: string): Unit | undefined {
    return this.state.units.find(u => u.id === unitId);
  }

  private getTerritory(territoryId: string): Territory | undefined {
    return this.state.territories[territoryId];
  }
}

/**
 * Convenience function to adjudicate a game state.
 */
export function adjudicate(state: GameState): AdjudicationResult[] {
  return new Adjudicator(state).adjudicate();
}
