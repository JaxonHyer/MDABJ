import { GameState } from '../types/game';

interface ResultsPanelProps {
  gameState: GameState;
}

export function ResultsPanel({ gameState }: ResultsPanelProps) {
  const income = gameState.lastIncome;
  const incomeCollectedThisTurn = gameState.incomeTurn === gameState.turn;
  const previousIncomeTurn = gameState.incomeTurn ?? (gameState.turn > 1 ? gameState.turn - 1 : undefined);

  return (
    <div className="results-panel">
      <h3>Adjudication Results</h3>
      {gameState.results.length === 0 ? (
        <p className="hint">
          No results yet. Enter orders and adjudicate to see results.
        </p>
      ) : (
        <div className="results-list">
          {gameState.results.map((result) => (
            <div
              key={result.orderId}
              className={`result-item ${result.success ? 'success' : 'failure'}`}
            >
              {result.message}
            </div>
          ))}
        </div>
      )}

      {income && (
        <div className="income-list">
          <h4>
            {incomeCollectedThisTurn
              ? `Trade income collected automatically (turn ${gameState.turn})`
              : previousIncomeTurn
                ? `Last trade income (turn ${previousIncomeTurn})`
                : 'Last recorded trade income'}
          </h4>
          <p className="hint">
            {incomeCollectedThisTurn
              ? 'Collected for every power after retreats and before builds. This turn is paid only once.'
              : 'This is the previous receipt; current-turn income is collected automatically after retreats.'}
            {' '}Income is gross; eco balances still observe the 15-point bank cap.
          </p>
          {Object.entries(income).map(([power, value]) => (
            <div key={power} className="income-row">
              <span>{power.charAt(0).toUpperCase() + power.slice(1)}</span>
              <span>+{value} eco</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
