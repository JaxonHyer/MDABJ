// Game state management

import { GameState, Power, Phase, Unit } from '../types/game';

export function createInitialState(powers: Power[]): GameState {
  const economy: GameState['economy'] = {} as GameState['economy'];
  const units: Unit[] = [];

  for (const power of powers) {
    economy[power.id] = {
      eco: power.startingEco,
      supplyCenters: power.homeCenters.length,
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
    economy,
    activePower: null,
  };
}

export function nextPhase(phase: Phase): Phase {
  switch (phase) {
    case 'orders': return 'adjudication';
    case 'adjudication': return 'retreats';
    case 'retreats': return 'builds';
    case 'builds': return 'complete';
    case 'complete': return 'orders';
  }
}

export function advanceTurn(state: GameState): GameState {
  return {
    ...state,
    turn: state.turn + 1,
    year: state.year - 15, // Each turn is 15 years, going backward in BC
    phase: 'orders',
    orders: [],
    results: [],
  };
}
