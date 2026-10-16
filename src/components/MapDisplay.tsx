import { GameState } from '../types/game';

interface MapDisplayProps {
  gameState: GameState;
}

export function MapDisplay({ gameState }: MapDisplayProps) {
  return (
    <div className="map-display">
      <div className="map-placeholder">
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="80" height="80" rx="8" stroke="currentColor" strokeWidth="2" strokeDasharray="4 4" opacity="0.4"/>
          <path d="M30 50 L50 30 L70 50 L50 70 Z" stroke="currentColor" strokeWidth="2" opacity="0.4"/>
        </svg>
        <p>Map display area</p>
        <p style={{ fontSize: '0.8rem' }}>
          SVG map will render here once uploaded
        </p>
        <p style={{ fontSize: '0.75rem', opacity: 0.5 }}>
          {Object.keys(gameState.territories).length} territories loaded
        </p>
      </div>
    </div>
  );
}
