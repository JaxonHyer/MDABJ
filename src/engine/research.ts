// Research phase (rules 4.1 / 4.2 / Section 6).
//
// The GM enters a small 0-7 score. This is a rescaled version of the former
// 0-100 input: 4, 6 and 7 correspond to the old 50, 75 and 90 cutoffs. The
// score itself is added to the cumulative research track; the bonus goes to
// the ledger matching the selected topic.
//
//   score 7     -> +3 points
//   score 6     -> +2 points
//   score 4-5   -> +1 point
//   score 0-3   -> +0 points
//
// Scores above 7 are still understood by `researchBonus` for old save-file
// reports, but new submissions are strictly validated as 0-7.

import { Economy, GameState, PowerId, ResearchTopic } from '../types/game';
import { ALL_POWERS } from './economy';

export const MIN_RESEARCH_SCORE = 0;
export const MAX_RESEARCH_SCORE = 7;

export interface ResearchSubmission {
  power: PowerId;
  score: number;
  topic: ResearchTopic;
}

export function isValidResearchScore(score: number): boolean {
  return Number.isInteger(score) && score >= MIN_RESEARCH_SCORE && score <= MAX_RESEARCH_SCORE;
}

/** The resource points a research score is worth. */
export function researchBonus(score: number): number {
  if (score >= MIN_RESEARCH_SCORE && score <= MAX_RESEARCH_SCORE) {
    if (score >= 7) return 3;
    if (score >= 6) return 2;
    if (score >= 4) return 1;
    return 0;
  }

  // Backward compatibility for reports made from pre-rescale save files.
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

/** Applies a single research score and marks this turn as scored. */
export function applyResearch(
  state: GameState,
  power: PowerId,
  score: number,
  topic: ResearchTopic
): GameState {
  if (state.researchScoresTurn === state.turn) {
    throw new Error(`Research for turn ${state.turn} has already been applied.`);
  }
  return { ...applyResearchScore(state, power, score, topic), researchScoresTurn: state.turn };
}

/**
 * Applies the reviewed research batch for every power exactly once. The UI
 * uses this atomic operation after the GM confirms the complete preview.
 */
export function applyResearchBatch(
  state: GameState,
  submissions: ResearchSubmission[]
): GameState {
  if (state.researchScoresTurn === state.turn) {
    throw new Error(`Research for turn ${state.turn} has already been applied.`);
  }
  if (submissions.length !== ALL_POWERS.length) {
    throw new Error(`Research batch needs one score for each of the ${ALL_POWERS.length} powers.`);
  }

  const seen = new Set<PowerId>();
  for (const submission of submissions) {
    if (seen.has(submission.power)) {
      throw new Error(`Research batch contains more than one score for ${submission.power}.`);
    }
    seen.add(submission.power);
    if (!ALL_POWERS.includes(submission.power)) {
      throw new Error(`Unknown power in research batch: ${submission.power}.`);
    }
    if (!isValidResearchScore(submission.score)) {
      throw new RangeError(
        `Research score must be an integer from ${MIN_RESEARCH_SCORE} to ${MAX_RESEARCH_SCORE}.`,
      );
    }
  }
  if (seen.size !== ALL_POWERS.length) {
    throw new Error('Research batch is missing a power score.');
  }

  let next = state;
  for (const submission of submissions) {
    next = applyResearchScore(next, submission.power, submission.score, submission.topic);
  }
  return { ...next, researchScoresTurn: state.turn };
}

function applyResearchScore(
  state: GameState,
  power: PowerId,
  score: number,
  topic: ResearchTopic
): GameState {
  if (!isValidResearchScore(score)) {
    throw new RangeError(
      `Research score must be an integer from ${MIN_RESEARCH_SCORE} to ${MAX_RESEARCH_SCORE}.`,
    );
  }

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
