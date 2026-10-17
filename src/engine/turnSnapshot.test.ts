import { describe, expect, it } from 'vitest';
import { getAdjudicationState } from './turnSnapshot';
import { makeState, unit } from './testHelpers';

describe('getAdjudicationState', () => {
  it('reuses turn-start positions with the latest edited orders', () => {
    const originalArmy = unit('athens', 'army', 'athens');
    const snapshot = makeState([originalArmy]);
    const current = {
      ...snapshot,
      phase: 'retreats' as const,
      units: [{ ...originalArmy, territoryId: 'corinth' }],
      orders: [{ unitId: originalArmy.id, type: 'move' as const, target: 'thessaly' }],
    };

    const adjudicationState = getAdjudicationState(current, snapshot);

    expect(adjudicationState?.units).toEqual(snapshot.units);
    expect(adjudicationState?.orders).toEqual(current.orders);
    expect(adjudicationState?.phase).toBe('retreats');
  });

  it('refuses to reuse a previous turn snapshot', () => {
    const snapshot = makeState([unit('athens', 'army', 'athens')]);
    const nextTurn = { ...snapshot, turn: 2, phase: 'research' as const };

    expect(getAdjudicationState(nextTurn, snapshot)).toBeNull();
  });

  it('uses the current state for a fresh orders phase', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);

    expect(getAdjudicationState(state, null)).toEqual(state);
  });

  it('refuses a loaded post-adjudication state without its start snapshot', () => {
    const state = {
      ...makeState([unit('athens', 'army', 'corinth')]),
      phase: 'retreats' as const,
    };

    expect(getAdjudicationState(state, null)).toBeNull();
  });

  it('locks order changes after retreats and income have been resolved', () => {
    const snapshot = makeState([unit('athens', 'army', 'athens')]);
    const buildPhase = { ...snapshot, phase: 'builds' as const };

    expect(getAdjudicationState(buildPhase, snapshot)).toBeNull();
  });
});
