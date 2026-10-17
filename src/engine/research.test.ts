import { describe, expect, it } from 'vitest';
import {
  applyResearch,
  applyResearchBatch,
  isValidResearchScore,
  MAX_RESEARCH_SCORE,
  researchBonus,
  researchLedger,
} from './research';
import { advanceTurn } from './gameState';
import { ALL_POWERS } from './economy';
import { makeState, unit } from './testHelpers';

describe('research scoring (0-7 GM input scale)', () => {
  it('maps small scores to the previous reward bands', () => {
    expect(researchBonus(0)).toBe(0);
    expect(researchBonus(3)).toBe(0);
    expect(researchBonus(4)).toBe(1);
    expect(researchBonus(5)).toBe(1);
    expect(researchBonus(6)).toBe(2);
    expect(researchBonus(7)).toBe(3);
  });

  it('recognizes the configured input range', () => {
    expect(isValidResearchScore(0)).toBe(true);
    expect(isValidResearchScore(MAX_RESEARCH_SCORE)).toBe(true);
    expect(isValidResearchScore(-1)).toBe(false);
    expect(isValidResearchScore(8)).toBe(false);
    expect(isValidResearchScore(2.5)).toBe(false);
  });

  it('still reports scores from older 0-100 save files', () => {
    expect(researchBonus(90)).toBe(3);
    expect(researchBonus(75)).toBe(2);
    expect(researchBonus(50)).toBe(1);
    expect(researchBonus(49)).toBe(0);
    expect(researchBonus(100)).toBe(3);
  });

  it('knows the ledger of every topic', () => {
    expect(researchLedger('economic')).toBe('eco');
    expect(researchLedger('military')).toBe('military');
    expect(researchLedger('diplomatic')).toBe('diplomatic');
  });
});

describe('applyResearch', () => {
  it('adds the submitted small score and economic bonus to the ledger', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 4 });
    const next = applyResearch(state, 'athens', 7, 'economic');

    expect(next.economy.athens.eco).toBe(7);
    expect(next.economy.athens.military).toBe(0);
    expect(next.economy.athens.researchScore).toBe(7);
  });

  it('keeps military research on the military ledger', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 4 });
    const next = applyResearch(state, 'athens', 6, 'military');

    expect(next.economy.athens.eco).toBe(4);
    expect(next.economy.athens.military).toBe(2);
  });

  it('keeps diplomatic research on the diplomatic ledger', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 4 });
    const next = applyResearch(state, 'athens', 4, 'diplomatic');

    expect(next.economy.athens.diplomatic).toBe(1);
  });

  it('respects the banking cap of 15 economic points', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 14 });
    const next = applyResearch(state, 'athens', 7, 'economic');

    expect(next.economy.athens.eco).toBe(15);
  });

  it('remembers the score of the turn', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);
    const next = applyResearch(state, 'athens', 5, 'economic');

    expect(next.researchScores.athens).toEqual({ score: 5, topic: 'economic' });
  });

  it('rejects out-of-range and fractional scores instead of silently rounding', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);

    expect(() => applyResearch(state, 'athens', 8, 'economic')).toThrow(RangeError);
    expect(() => applyResearch(state, 'athens', 2.5, 'economic')).toThrow(RangeError);
  });

  it('records the applied turn so the UI can block duplicate scoring', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);
    const scored = applyResearch(state, 'athens', 4, 'economic');
    const nextTurn = advanceTurn(scored);

    expect(scored.researchScoresTurn).toBe(state.turn);
    expect(nextTurn.turn).toBe(state.turn + 1);
    expect(nextTurn.researchScoresTurn).toBe(state.turn);
  });

  it('applies a complete batch once and rejects a second application', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 4 });
    const submissions = ALL_POWERS.map((power) => ({
      power,
      score: power === 'athens' ? 7 : 0,
      topic: 'economic' as const,
    }));
    const next = applyResearchBatch(state, submissions);

    expect(next.researchScoresTurn).toBe(state.turn);
    expect(next.economy.athens.eco).toBe(7);
    expect(next.economy.athens.researchScore).toBe(7);
    expect(Object.keys(next.researchScores)).toHaveLength(ALL_POWERS.length);
    expect(() => applyResearchBatch(next, submissions)).toThrow(/already been applied/);
    expect(() => applyResearch(next, 'athens', 4, 'economic')).toThrow(/already been applied/);
  });

  it('refuses partial research batches', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);

    expect(() =>
      applyResearchBatch(state, [{ power: 'athens', score: 4, topic: 'economic' }]),
    ).toThrow(/one score for each/);
  });
});
