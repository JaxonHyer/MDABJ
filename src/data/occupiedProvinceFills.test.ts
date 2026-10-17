import { describe, expect, it } from 'vitest';
import { loadTerritories } from './gameData';
import { getOccupiedProvinceFills } from './occupiedProvinceFills';
import { TERRITORY_FILL_PATHS } from './territoryFillPaths';
import { POWER_COLORS } from './mapConfig';
import { makeState, unit } from '../engine/testHelpers';

describe('occupied province fills', () => {
  it('has geometry for every default supply centre and city', () => {
    const eligible = Object.values(loadTerritories()).filter(
      (territory) => territory.isSupplyCenter || territory.isCity
    );

    expect(eligible).toHaveLength(33);
    for (const territory of eligible) {
      expect(TERRITORY_FILL_PATHS[territory.id]).toMatch(/^M /);
    }
  });

  it('fills occupied supply centres and black-dot cities with the occupant colour', () => {
    const state = makeState([
      unit('sparta', 'army', 'rome'),
      unit('persia', 'army', 'sardinia'),
      unit('carthage', 'army', 'gaul'),
      { ...unit('rome', 'army', 'thopsis'), destroyed: true },
    ]);

    const fills = getOccupiedProvinceFills(state);

    const fillsById = Object.fromEntries(fills.map((fill) => [fill.territoryId, fill]));

    expect(fillsById).toEqual({
      rome: {
        territoryId: 'rome',
        color: POWER_COLORS.sparta,
        path: TERRITORY_FILL_PATHS.rome,
      },
      sardinia: {
        territoryId: 'sardinia',
        color: POWER_COLORS.persia,
        path: TERRITORY_FILL_PATHS.sardinia,
      },
    });
    expect(fillsById).not.toHaveProperty('gaul');
    expect(fillsById).not.toHaveProperty('thopsis');
  });

  it('uses fill geometry for GM-added supply centres too', () => {
    const state = makeState([
      unit('rome', 'army', 'rhetia'),
      unit('persia', 'army', 'piraeus'),
    ]);
    state.territories.rhetia.isSupplyCenter = true;
    state.territories.piraeus.isSupplyCenter = true;

    const fillsById = Object.fromEntries(
      getOccupiedProvinceFills(state).map((fill) => [fill.territoryId, fill])
    );

    expect(fillsById).toEqual({
      rhetia: {
        territoryId: 'rhetia',
        color: POWER_COLORS.rome,
        path: TERRITORY_FILL_PATHS.rhetia,
      },
      piraeus: {
        territoryId: 'piraeus',
        color: POWER_COLORS.persia,
        path: TERRITORY_FILL_PATHS.piraeus,
      },
    });
  });
});
