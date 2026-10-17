import { GameState } from '../types/game';

interface ResultsPanelProps {
  gameState: GameState;
}

export function ResultsPanel({ gameState }: ResultsPanelProps) {
  const income = gameState.lastIncome;

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

      {income && Object.keys(income).length > 0 && (
        <div className="income-list">
          <h4>Economic income</h4>
          {Object.entries(income).map(([power, value]) => (
            <div key={power} className="income-row">
              <span>{power}</span>
              <span>+{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
