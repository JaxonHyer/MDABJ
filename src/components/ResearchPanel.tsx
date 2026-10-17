import { useState } from 'react';
import { GameState, PowerId, ResearchTopic, RESEARCH_TOPIC_LABEL } from '../types/game';
import { POWER_COLORS } from '../data/mapConfig';
import { ALL_POWERS } from '../engine/economy';
import { applyResearch, researchBonus } from '../engine/research';

interface ResearchPanelProps {
  gameState: GameState;
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

/**
 * The research phase of a turn (rules 4.1 - 4.2). The game master scores the
 * research every player submitted; the bonus goes to the ledger that matches
 * the topic of the research.
 */
export function ResearchPanel({ gameState, onChange, onContinue }: ResearchPanelProps) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [topics, setTopics] = useState<Record<string, ResearchTopic>>({});
  const [message, setMessage] = useState<string | null>(null);

  const applyScore = (power: PowerId) => {
    const raw = scores[power] ?? '0';
    const score = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
    const topic = topics[power] ?? 'economic';
    onChange(applyResearch(gameState, power, score, topic));
    setMessage(
      `${POWER_NAME[power]}: score ${score} -> +${researchBonus(score)} ${topic} point(s)`
    );
    setScores((prev) => ({ ...prev, [power]: String(score) }));
  };

  return (
    <div className="panel research-panel">
      <h3>
        Score research - turn {gameState.turn} ({gameState.year} BC)
      </h3>
      <p className="hint">
        Score the research each player submitted (0-100). 90 or more is worth +3
        points, 75-89 is worth +2, 50-74 is worth +1 and less than 50 is worth
        nothing. The points go to the ledger that matches the topic - economic
        research becomes eco points, which pay for the builds of the next turn.
      </p>

      {message && <p className="hint">{message}</p>}

      <div className="research-list">
        {ALL_POWERS.map((power) => {
          const entry = gameState.researchScores[power];
          const economy = gameState.economy[power];
          const bonus = researchBonus(entry?.score ?? 0);
          return (
            <div key={power} className="research-row">
              <span className="admin-power" style={{ color: POWER_COLORS[power] }}>
                {POWER_NAME[power]}
              </span>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="score"
                value={scores[power] ?? (entry ? String(entry.score) : '')}
                onChange={(e) => setScores((prev) => ({ ...prev, [power]: e.target.value }))}
              />
              <select
                value={topics[power] ?? entry?.topic ?? 'economic'}
                onChange={(e) =>
                  setTopics((prev) => ({ ...prev, [power]: e.target.value as ResearchTopic }))
                }
              >
                {(['military', 'economic', 'diplomatic'] as ResearchTopic[]).map((topic) => (
                  <option key={topic} value={topic}>
                    {RESEARCH_TOPIC_LABEL[topic]}
                  </option>
                ))}
              </select>
              <button className="chip" onClick={() => applyScore(power)}>
                apply
              </button>
              <span className="admin-note">
                {economy?.researchScore ?? 0} pts
                {entry && ` (+${bonus})`}
              </span>
            </div>
          );
        })}
      </div>

      <button className="primary-button" onClick={onContinue}>
        Continue to the move phase
      </button>
    </div>
  );
}
