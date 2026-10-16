import { GameState } from '../types/game';

interface ResultsPanelProps {
  gameState: GameState;
}

export function ResultsPanel({ gameState }: ResultsPanelProps) {
  return (
    <div className="results-panel">
      <h3>Adjudication Results</h3>
      {gameState.results.length === 0 ? (
        <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
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
    </div>
  );
}
