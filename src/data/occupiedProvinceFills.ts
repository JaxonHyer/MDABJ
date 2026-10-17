import { GameState, PowerId } from '../types/game';
import { NEUTRAL_COLOR, POWER_COLORS } from './mapConfig';
import { TERRITORY_FILL_PATHS } from './territoryFillPaths';

export interface OccupiedProvinceFill {
  territoryId: string;
  color: string;
  path: string;
}

/**
 * Returns a power-coloured province shape for every occupied supply centre or
 * city. Cities remain sustain-only locations; this is just their map display.
 */
export function getOccupiedProvinceFills(
  state: Pick<GameState, 'territories' | 'units'>
): OccupiedProvinceFill[] {
  const unitByTerritory = new Map<string, PowerId>();
  for (const unit of state.units) {
    if (unit.destroyed || unitByTerritory.has(unit.territoryId)) continue;
    unitByTerritory.set(unit.territoryId, unit.power);
  }

  const fills: OccupiedProvinceFill[] = [];
  for (const [territoryId, territory] of Object.entries(state.territories)) {
    if (!territory.isSupplyCenter && !territory.isCity) continue;

    const power = unitByTerritory.get(territoryId);
    const path = TERRITORY_FILL_PATHS[territoryId];
    if (!power || !path) continue;

    fills.push({
      territoryId,
      color: POWER_COLORS[power] ?? NEUTRAL_COLOR,
      path,
    });
  }

  return fills;
}
