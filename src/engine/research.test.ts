import { describe, expect, it } from 'vitest';
import { applyResearch, researchBonus, researchLedger } from './research';
import { makeState, unit } from './testHelpers';

describe('research scoring (rules 4.2)', () => {
  it('awards three points for a score of 90 and more', () => {
    expect(researchBonus(90)).toBe(3);
    expect(researchBonus(100)).toBe(3);
  });

  it('awards two points for a score of 75 to 89', () => {
    expect(researchBonus(75)).toBe(2);
    expect(researchBonus(89)).toBe(2);
  });

  it('awards one point for a score of 50 to 74', () => {
    expect(researchBonus(50)).toBe(1);
    expect(researchBonus(74)).toBe(1);
  });

  it('awards nothing below 50', () => {
    expect(researchBonus(49)).toBe(0);
    expect(researchBonus(0)).toBe(0);
  });

  it('knows the ledger of every topic', () => {
    expect(researchLedger('economic')).toBe('eco');
    expect(researchLedger('military')).toBe('military');
    expect(researchLedger('diplomatic')).toBe('diplomatic');
  });
});

describe('applyResearch', () => {
  it('adds economic research to the economic ledger', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 4 });
    const next = applyResearch(state, 'athens', 92, 'economic');

    expect(next.economy.athens.eco).toBe(7);
    expect(next.economy.athens.military).toBe(0);
    expect(next.economy.athens.researchScore).toBe(92);
  });

  it('keeps military research on the military ledger', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 4 });
    const next = applyResearch(state, 'athens', 80, 'military');

    expect(next.economy.athens.eco).toBe(4);
    expect(next.economy.athens.military).toBe(2);
  });

  it('keeps diplomatic research on the diplomatic ledger', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 4 });
    const next = applyResearch(state, 'athens', 60, 'diplomatic');

    expect(next.economy.athens.diplomatic).toBe(1);
  });

  it('respects the banking cap of 15 economic points', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 14 });
    const next = applyResearch(state, 'athens', 95, 'economic');

    expect(next.economy.athens.eco).toBe(15);
  });

  it('remembers the score of the turn', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);
    const next = applyResearch(state, 'athens', 77, 'economic');

    expect(next.researchScores.athens).toEqual({ score: 77, topic: 'economic' });
  });
});
