// Core type definitions for Mare Nostrum

export type PowerId =
  | 'athens'
  | 'sparta'
  | 'macedon'
  | 'satrapies'
  | 'persia'
  | 'phoenicia'
  | 'carthage'
  | 'rome';

export type UnitType = 'army' | 'fleet' | 'caravan';

export type TerritoryType = 'land' | 'sea' | 'coastal';

export type Phase =
  | 'orders'       // Writing movement orders
  | 'adjudication' // Resolving orders
  | 'retreats'     // Dislodged units retreat
  | 'builds'       // Build/disband units
  | 'complete';    // Turn complete

export type OrderType =
  | 'hold'
  | 'move'
  | 'support_hold'
  | 'support_move'
  | 'transport'
  | 'trade'        // Caravan-specific: move along trade route
  | 'retreat'
  | 'build'
  | 'disband';

export interface Territory {
  id: string;
  name: string;
  type: TerritoryType;
  adjacent: string[];       // IDs of adjacent territories
  isSupplyCenter: boolean;
  homePower?: PowerId;      // Which power this is a home center for
  isTradeNode: boolean;
  tradeNodeValue?: number;  // Eco points per turn
  tradeRoutes?: string[];   // IDs of adjacent trade nodes (for caravans)
}

export interface Unit {
  id: string;
  power: PowerId;
  type: UnitType;
  territoryId: string;
  isElite: boolean;
  mustRetreat?: boolean;    // Set after dislodgement
}

export interface Order {
  unitId: string;
  type: OrderType;
  target?: string;          // Target territory for move/support/retreat
  supportTarget?: string;   // For support_move: the unit being supported
  viaConvoy?: boolean;      // For army moves via fleet transport
}

export interface AdjudicationResult {
  orderId: string;          // References the order
  success: boolean;
  message: string;
}

export interface GameState {
  turn: number;
  year: number;             // BC year, starts at 350
  phase: Phase;
  territories: Record<string, Territory>;
  units: Unit[];
  orders: Order[];
  results: AdjudicationResult[];
  economy: Record<PowerId, {
    eco: number;            // Current economic points
    supplyCenters: number;  // Number of supply centers controlled
  }>;
  activePower: PowerId | null; // For sandbox mode: whose orders are being entered
}

export interface Power {
  id: PowerId;
  name: string;
  color: string;
  homeCenters: string[];    // Territory IDs
  startingUnits: Unit[];
  startingEco: number;
}

// Helper to compute unit force
export function unitForce(unit: Unit): number {
  return unit.isElite ? 2 : 1;
}
