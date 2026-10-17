import { Power, PowerId } from '../types/game';

interface PowerSelectorProps {
  powers: Power[];
  selectedPower: PowerId | null;
  onSelect: (powerId: PowerId) => void;
}

export function PowerSelector({ powers, selectedPower, onSelect }: PowerSelectorProps) {
  return (
    <div className="power-selector">
      <h3>Select Power</h3>
      <p className="hint">Used as the default for pasted orders without a power label and for map entry.</p>
      <div className="power-list">
        {powers.map((power) => (
          <button
            key={power.id}
            className={`power-button ${selectedPower === power.id ? 'selected' : ''}`}
            style={{ color: power.color }}
            onClick={() => onSelect(power.id)}
          >
            {power.name}
          </button>
        ))}
      </div>
    </div>
  );
}
