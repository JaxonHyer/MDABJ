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

/**
 * The steps of a turn. The game master works through them in this order:
 *
 *   1. orders      - the moves of all powers
 *   2. adjudication - the orders are resolved
 *   3. retreats    - the dislodged units retreat
 *   4. builds      - build, upgrade, fortify, disband
 *   5. research    - the research of the turn is scored (eco points for the
 *                    build phase of the next turn)
 */
export type Phase =
  | 'orders'       // Writing movement orders
  | 'adjudication' // Resolving orders
  | 'retreats'     // Dislodged units retreat
  | 'builds'       // Build/disband units
  | 'research';    // Scoring the research of the turn

export type OrderType =
  | 'hold'
  | 'move'
  | 'support_hold'
  | 'support_move'
  | 'transport'
  | 'trade'        // Caravan-specific: move along a trade route
  | 'retreat'
  | 'build'
  | 'disband';

export interface Territory {
  id: string;
  name: string;
  type: TerritoryType;
  adjacent: string[];       // IDs of adjacent territories
  isSupplyCenter: boolean;
  homePower?: PowerId;      // Which power this is a home center for (or null)
  isTradeNode: boolean;
  tradeNodeValue?: number;  // Eco points per turn (if trade node)
  tradeRoutes?: string[];   // IDs of connected trade nodes (for caravans)
  fortified?: boolean;      // Section 5.4 - defending unit gets +1
}

export interface Unit {
  id: string;
  power: PowerId;
  type: UnitType;
  territoryId: string;
  isElite: boolean;
  /** Set when the unit has been dislodged and still has to retreat. */
  mustRetreat?: boolean;
  /** Province the dislodging force came from - it may not retreat there. */
  attackedFrom?: string;
  /** Set once the unit has retreated (or been destroyed). */
  destroyed?: boolean;
  /** Province the unit came from this turn - used to draw the move arrow. */
  originTerritoryId?: string;
  /**
   * The unit was paid for with economic points instead of a supply centre
   * slot (rules 3.3). Such a unit may be kept even when the power holds
   * fewer supply centres than it has units.
   */
  bought?: boolean;
}

export interface Order {
  unitId: string;
  type: OrderType;
  /** Province id the order refers to (move destination, supported province...). */
  target?: string;
  /** Unit id of the unit being supported / transported. */
  supportTarget?: string;
  /** Army moves are carried by a fleet instead of walking. */
  viaConvoy?: boolean;
}

export interface AdjudicationResult {
  orderId: string;          // References the order
  success: boolean;
  message: string;
  /** Short kind tag used by the map to pick an icon/colour. */
  kind?: 'move' | 'hold' | 'support' | 'transport' | 'trade' | 'retreat' | 'build';
}

export type BuildKind = 'army' | 'fleet' | 'caravan' | 'upgrade' | 'disband' | 'fortify';

export interface BuildAction {
  id: string;
  power: PowerId;
  kind: BuildKind;
  /** Unit being upgraded or disbanded. */
  unitId?: string;
  /** Province where a new unit is placed / supply center being fortified. */
  territoryId?: string;
}

export interface Economy {
  eco: number;              // Current economic points
  supplyCenters: number;    // Number of supply centers controlled
  /** Military resource points (research topic "Military"). */
  military: number;
  /** Diplomatic resource points (research topic "Diplomatic"). */
  diplomatic: number;
  /** Cumulative research score - one of the three winning tracks. */
  researchScore: number;
  /** Cumulative economic points earned - the "wealth" winning track. */
  wealth: number;
}

/** The three research topics; the bonus goes to the matching ledger. */
export type ResearchTopic = 'military' | 'economic' | 'diplomatic';

export const RESEARCH_TOPICS: ResearchTopic[] = ['military', 'economic', 'diplomatic'];

export const RESEARCH_TOPIC_LABEL: Record<ResearchTopic, string> = {
  military: 'Military',
  economic: 'Economic',
  diplomatic: 'Diplomatic',
};

export interface GameState {
  turn: number;
  year: number;             // BC year, starts at 350
  phase: Phase;
  territories: Record<string, Territory>;
  units: Unit[];
  orders: Order[];
  results: AdjudicationResult[];
  builds: BuildAction[];
  economy: Record<PowerId, Economy>;
  activePower: PowerId | null; // For sandbox mode: whose orders are being entered
  /** Economic income collected for the power that just finished adjudicating. */
  lastIncome?: Record<PowerId, number>;
  /** Which power held a supply centre at the end of the previous turn. */
  scOwners: Record<string, PowerId>;
  /** Research score of the current turn, per power (0 = not scored yet). */
  researchScores: Partial<Record<PowerId, { score: number; topic: ResearchTopic }>>;
  /** The turn the income was collected for - the income is only counted once. */
  incomeTurn?: number;
  /** Free form notes the game master keeps with the save file. */
  notes?: string;
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

/** Caravans do not count against supply centres (rules 2.2 / 3.3). */
export function isMilitary(unit: Unit): boolean {
  return unit.type === 'army' || unit.type === 'fleet';
}

/** Short glyph used on the map and in the order panel. */
export const UNIT_GLYPH: Record<UnitType, string> = {
  army: 'A',
  fleet: 'F',
  caravan: 'C',
};

export const UNIT_SYMBOL: Record<UnitType, string> = {
  army: 'A',
  fleet: 'F',
  caravan: 'C',
};

export const UNIT_LABEL: Record<UnitType, string> = {
  army: 'Army',
  fleet: 'Fleet',
  caravan: 'Caravan',
};
