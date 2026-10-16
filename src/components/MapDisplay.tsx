import { GameState } from '../types/game';

interface MapDisplayProps {
  gameState: GameState;
}

export function MapDisplay({ gameState }: MapDisplayProps) {
  const territoryCount = Object.keys(gameState.territories).length;
  const unitCount = gameState.units.length;

  return (
    <div className="map-display">
      <img 
        src="./map.svg" 
        alt="Mare Nostrum Map" 
        style={{ 
          width: '100%', 
          height: 'auto',
          display: 'block'
        }}
      />
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'rgba(0,0,0,0.7)',
        padding: '0.5rem',
        borderRadius: '4px',
        fontSize: '0.75rem'
      }}>
        <div>Territories: {territoryCount}</div>
        <div>Units: {unitCount}</div>
      </div>
    </div>
  );
}
