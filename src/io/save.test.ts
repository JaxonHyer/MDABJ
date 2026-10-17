import { describe, expect, it } from 'vitest';
import { serializeState, stateFromJson, stateToJson, territoryOverrides } from './save';
import { makeState, unit } from '../engine/testHelpers';
import { collectIncome, setSupplyCenter } from '../engine/gameState';
import { applyResearch } from '../engine/research';

describe('save files', () => {
  it('round trips a game state', () => {
    const state = applyResearch(
      makeState([unit('athens', 'army', 'athens')], [], { athens: 4 }),
      'athens',
      6,
      'economic'
    );
    const restored = stateFromJson(stateToJson(state));

    expect(restored.turn).toBe(state.turn);
    expect(restored.year).toBe(state.year);
    expect(restored.units).toHaveLength(state.units.length);
    expect(restored.economy.athens.eco).toBe(state.economy.athens.eco);
    expect(restored.economy.athens.researchScore).toBe(6);
    expect(restored.researchScores.athens?.topic).toBe('economic');
    expect(restored.researchScoresTurn).toBe(state.turn);
  });

  it('saves the income receipt and does not collect it twice after a reload', () => {
    const collected = collectIncome(
      makeState([unit('athens', 'caravan', 'piraeus')], [], { athens: 4 }),
    );
    const restored = stateFromJson(stateToJson(collected));
    const afterReload = collectIncome(restored);

    expect(restored.incomeTurn).toBe(collected.turn);
    expect(restored.lastIncome?.athens).toBe(1);
    expect(afterReload.economy.athens.eco).toBe(5);
    expect(afterReload.economy.athens.wealth).toBe(1);
  });

  it('stores supply centres the game master placed', () => {
    const state = setSupplyCenter(
      makeState([unit('athens', 'army', 'athens')]),
      'delphi',
      true,
      'athens'
    );
    const overrides = territoryOverrides(state);

    expect(overrides.delphi).toEqual({ isSupplyCenter: true, homePower: 'athens' });

    const restored = stateFromJson(stateToJson(state));
    expect(restored.territories.delphi.isSupplyCenter).toBe(true);
    expect(restored.territories.delphi.homePower).toBe('athens');
  });

  it('keeps the built in map when nothing was changed', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);
    expect(territoryOverrides(state)).toEqual({});
  });

  it('refuses a file that is not a save file', () => {
    expect(() => stateFromJson('{"hello": "world"}')).toThrow(/Unknown file format/);
    expect(() => stateFromJson('not json')).toThrow();
  });

  it('marks the file with a format and a version', () => {
    const file = serializeState(makeState([]));
    expect(file.format).toBe('mare-nostrum-save');
    expect(file.version).toBe(1);
  });
});
