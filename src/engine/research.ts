// Research phase (rules 4.1 / 4.2 / Section 6).
//
// Players submit a research topic every turn; the game master scores it
// 0-100 and the score is converted into resource points of the matching
// type:
//
//   score 90-100 -> +3 points
//   score  75-89 -> +2 points
//   score  50-74 -> +1 point
//   below 50      -> +0 points
//
// Economic research is added to the economic ledger (the one that pays for
// units), military and diplomatic research is booked on its own ledger.

import { Economy, GameState, PowerId, ResearchTopic } from '../types/game';

/** The resource points a research score is worth. */
export function researchBonus(score: number): number {
  if (score >= 90) return 3;
  if (score >= 75) return 2;
  if (score >= 50) return 1;
  return 0;
}

export interface ResearchEntry {
  power: PowerId;
  score: number;
  topic: ResearchTopic;
  bonus: number;
  ledger: 'eco' | 'military' | 'diplomatic';
}

/**
 * Applies a scored research submission to a power.
 * The bonus goes to the ledger that matches the topic.
 */
export function applyResearch(
  state: GameState,
  power: PowerId,
  score: number,
  topic: ResearchTopic
): GameState {
  const bonus = researchBonus(score);
  const economy = { ...state.economy };
  const current: Economy = economy[power] ?? {
    eco: 0,
    supplyCenters: 0,
    military: 0,
    diplomatic: 0,
    researchScore: 0,
    wealth: 0,
  };

  const next: Economy = { ...current, researchScore: current.researchScore + score };
  if (topic === 'economic') next.eco = Math.min(15, current.eco + bonus);
  if (topic === 'military') next.military = current.military + bonus;
  if (topic === 'diplomatic') next.diplomatic = current.diplomatic + bonus;

  economy[power] = next;
  return {
    ...state,
    economy,
    researchScores: {
      ...state.researchScores,
      [power]: { score, topic },
    },
  };
}

/** The ledger a research topic pays into. */
export function researchLedger(topic: ResearchTopic): 'eco' | 'military' | 'diplomatic' {
  if (topic === 'economic') return 'eco';
  if (topic === 'military') return 'military';
  return 'diplomatic';
}
