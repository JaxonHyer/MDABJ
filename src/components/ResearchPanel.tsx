import { useMemo, useState } from 'react';
import { GameState, PowerId, ResearchTopic, RESEARCH_TOPIC_LABEL } from '../types/game';
import { POWER_COLORS } from '../data/mapConfig';
import { ALL_POWERS, BANKING_CAP } from '../engine/economy';
import {
  applyResearchBatch,
  isValidResearchScore,
  MAX_RESEARCH_SCORE,
  researchBonus,
  researchLedger,
} from '../engine/research';

export interface ResearchDraft {
  score: string;
  topic: ResearchTopic;
}

export type ResearchDrafts = Record<PowerId, ResearchDraft>;

export function createEmptyResearchDrafts(): ResearchDrafts {
  return Object.fromEntries(
    ALL_POWERS.map((power) => [power, { score: '', topic: 'economic' as ResearchTopic }]),
  ) as ResearchDrafts;
}

interface ResearchPanelProps {
  gameState: GameState;
  drafts: ResearchDrafts;
  onDraftsChange: (drafts: ResearchDrafts) => void;
  onChange: (state: GameState) => void;
  onContinue: () => void;
}

const POWER_NAME: Record<PowerId, string> = {
  athens: 'Athens',
  sparta: 'Sparta',
  macedon: 'Macedon',
  satrapies: 'Satrapies',
  persia: 'Persia',
  phoenicia: 'Phoenicia',
  carthage: 'Carthage',
  rome: 'Rome',
};

interface ScoreRow {
  power: PowerId;
  score: number;
  topic: ResearchTopic;
}

interface AwardPreview {
  power: PowerId;
  score: number;
  topic: ResearchTopic;
  bonus: number;
  ledger: 'eco' | 'military' | 'diplomatic';
  before: number;
  after: number;
  gained: number;
  capped: number;
  researchBefore: number;
  researchAfter: number;
}

/**
 * The research phase of a turn (rules 4.1 - 4.2). The GM enters a small score
 * and topic for every power, reviews the whole table, then applies it once.
 */
export function ResearchPanel({
  gameState,
  drafts,
  onDraftsChange,
  onChange,
  onContinue,
}: ResearchPanelProps) {
  const [reviewing, setReviewing] = useState(false);
  const [reviewedSignature, setReviewedSignature] = useState<string | null>(null);

  const rows = useMemo(() => {
    return ALL_POWERS.map((power): ScoreRow | null => {
      const raw = drafts[power]?.score ?? '';
      if (raw.trim() === '') return null;
      const score = Number(raw);
      if (!isValidResearchScore(score)) return null;
      return {
        power,
        score,
        topic: drafts[power]?.topic ?? 'economic',
      };
    });
  }, [drafts]);

  const validRows = useMemo(() => rows.filter((row): row is ScoreRow => row !== null), [rows]);
  const allScoresValid = validRows.length === ALL_POWERS.length;
  const enteredCount = ALL_POWERS.filter((power) => (drafts[power]?.score ?? '').trim() !== '').length;
  const awards = useMemo(() => {
    if (!allScoresValid) return [];
    return validRows.map((row): AwardPreview => {
      const economy = gameState.economy[row.power];
      const ledger = researchLedger(row.topic);
      const before = economy?.[ledger] ?? 0;
      const bonus = researchBonus(row.score);
      const after = ledger === 'eco' ? Math.min(BANKING_CAP, before + bonus) : before + bonus;
      const researchBefore = economy?.researchScore ?? 0;
      return {
        ...row,
        bonus,
        ledger,
        before,
        after,
        gained: after - before,
        capped: bonus - (after - before),
        researchBefore,
        researchAfter: researchBefore + row.score,
      };
    });
  }, [allScoresValid, gameState.economy, validRows]);
  const reviewSignature = JSON.stringify(awards);
  const canApplyReviewedBatch =
    reviewing && allScoresValid && reviewedSignature === reviewSignature;

  const updateDraft = (power: PowerId, update: Partial<ResearchDraft>) => {
    onDraftsChange({
      ...drafts,
      [power]: { ...drafts[power], ...update },
    });
  };

  const handleApply = () => {
    if (!canApplyReviewedBatch) return;
    const submissions = ALL_POWERS.map((power) => ({
      power,
      score: Number(drafts[power].score),
      topic: drafts[power].topic,
    }));
    const next = applyResearchBatch(gameState, submissions);
    onChange(next);
    onContinue();
  };

  if (gameState.researchScoresTurn === gameState.turn) {
    return (
      <div className="panel phase-panel research-panel">
        <h3>Research already applied — turn {gameState.turn}</h3>
        <p className="hint">
          This turn’s scores have already been applied. This guard prevents a second click or a
          return to this step from awarding the same research twice. To correct a mistaken score,
          reload a save from before scoring and review the batch again.
        </p>
        <div className="research-list applied-research-list">
          {ALL_POWERS.map((power) => {
            const entry = gameState.researchScores[power];
            return (
              <div key={power} className="research-row">
                <span className="admin-power" style={{ color: POWER_COLORS[power] }}>
                  {POWER_NAME[power]}
                </span>
                <span className="applied-research-score">
                  {entry ? `${entry.score}${entry.score <= MAX_RESEARCH_SCORE ? `/${MAX_RESEARCH_SCORE}` : ''}` : '—'}
                  {entry ? ` · ${RESEARCH_TOPIC_LABEL[entry.topic]}` : ''}
                </span>
                <span className="research-award">
                  {entry ? `+${researchBonus(entry.score)}` : 'Not recorded'}
                </span>
              </div>
            );
          })}
        </div>
        <button className="primary-button" onClick={onContinue}>
          Return to Move
        </button>
      </div>
    );
  }

  if (gameState.phase !== 'research') {
    const phaseInstruction = {
      orders: 'Adjudicate orders before scoring research.',
      adjudication: 'Finish adjudication before scoring research.',
      retreats: 'Resolve retreats and collect eco before scoring research.',
      builds: 'Finish Build / Disband to begin the research phase.',
      research: '',
    }[gameState.phase];
    return (
      <div className="panel phase-panel research-panel">
        <h3>Research is not ready yet</h3>
        <p className="hint">{phaseInstruction} The research batch can only be applied in its proper turn phase.</p>
        <button className="secondary-button" onClick={onContinue}>
          Return to Move
        </button>
      </div>
    );
  }

  return (
    <div className="panel phase-panel research-panel">
      <h3>
        Score research — turn {gameState.turn} ({gameState.year} BC)
      </h3>
      <p className="hint research-explainer">
        Enter one whole number from 0–{MAX_RESEARCH_SCORE} for every power; use 0 if there was no
        submission. The smaller scale preserves the old reward cutoffs: 0–3 → +0, 4–5 → +1, 6 → +2,
        7 → +3. The entered number is added to the cumulative research track, while its bonus goes
        to the selected topic ledger. Economic awards respect the {BANKING_CAP}-eco bank cap.
      </p>

      {!reviewing ? (
        <>
          <div className="research-list">
            {ALL_POWERS.map((power) => {
              const draft = drafts[power];
              const raw = draft.score.trim();
              const score = raw === '' ? NaN : Number(raw);
              const valid = isValidResearchScore(score);
              const bonus = valid ? researchBonus(score) : null;
              const economy = gameState.economy[power];
              const inputId = `research-score-${power}`;

              return (
                <div key={power} className="research-row">
                  <label className="research-power" htmlFor={inputId}>
                    <span className="admin-power" style={{ color: POWER_COLORS[power] }}>
                      {POWER_NAME[power]}
                    </span>
                    <small>Research track: {economy?.researchScore ?? 0}</small>
                  </label>
                  <input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    step={1}
                    min={0}
                    max={MAX_RESEARCH_SCORE}
                    aria-label={`${POWER_NAME[power]} research points (0 to ${MAX_RESEARCH_SCORE})`}
                    placeholder="0–7"
                    value={draft.score}
                    onChange={(event) => updateDraft(power, { score: event.target.value })}
                  />
                  <select
                    aria-label={`${POWER_NAME[power]} research topic`}
                    value={draft.topic}
                    onChange={(event) => updateDraft(power, { topic: event.target.value as ResearchTopic })}
                  >
                    {(['military', 'economic', 'diplomatic'] as ResearchTopic[]).map((topic) => (
                      <option key={topic} value={topic}>
                        {RESEARCH_TOPIC_LABEL[topic]}
                      </option>
                    ))}
                  </select>
                  <span className={`research-award ${valid ? '' : raw ? 'danger-text' : ''}`}>
                    {valid ? `+${bonus} ${draft.topic}` : raw ? 'Use 0–7' : 'Enter score'}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="hint" aria-live="polite">
            {validRows.length} of {ALL_POWERS.length} valid scores entered.
            {enteredCount > validRows.length && ` ${enteredCount - validRows.length} need correction.`}
            {' '}Nothing is applied until the full review is confirmed.
          </p>
          <button
            className="primary-button"
            disabled={!allScoresValid}
            onClick={() => {
              setReviewedSignature(reviewSignature);
              setReviewing(true);
            }}
          >
            Review all {ALL_POWERS.length} research scores
          </button>
        </>
      ) : (
        <>
          <div className="research-review" role="region" aria-label="Research score review">
            <div className="research-review-title">
              <h4>Review before applying</h4>
              <p className="hint">Check the score, topic, and exact ledger change for every power.</p>
            </div>
            <div className="research-review-scroll">
              <table className="research-review-table">
                <thead>
                  <tr>
                    <th>Power</th>
                    <th>Score</th>
                    <th>Topic</th>
                    <th>Bonus</th>
                    <th>Ledger after</th>
                    <th>Research after</th>
                  </tr>
                </thead>
                <tbody>
                  {awards.map((award) => (
                    <tr key={award.power}>
                      <th scope="row" style={{ color: POWER_COLORS[award.power] }}>
                        {POWER_NAME[award.power]}
                      </th>
                      <td>{award.score} / {MAX_RESEARCH_SCORE}</td>
                      <td>{RESEARCH_TOPIC_LABEL[award.topic]}</td>
                      <td>+{award.bonus}</td>
                      <td>
                        {award.ledger}: {award.before} → {award.after}
                        {award.capped > 0 && (
                          <small className="research-cap-note"> ({award.capped} capped)</small>
                        )}
                      </td>
                      <td>{award.researchBefore} → {award.researchAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {reviewedSignature !== null && reviewedSignature !== reviewSignature && (
            <p className="hint danger-text" role="alert">
              The ledger changed after review. Return to entry and review the updated preview before applying.
            </p>
          )}
          <div className="research-review-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setReviewing(false);
                setReviewedSignature(null);
              }}
            >
              Edit scores
            </button>
            <button
              className="primary-button"
              disabled={!canApplyReviewedBatch}
              onClick={handleApply}
            >
              Apply all scores &amp; continue to Move
            </button>
          </div>
        </>
      )}
    </div>
  );
}
