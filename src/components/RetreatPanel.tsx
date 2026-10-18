import { useMemo } from 'react';
import { GameState, Unit } from '../types/game';
import { validRetreatDestinations } from '../engine/gameState';
import { UNIT_GLYPH } from '../types/game';

interface RetreatPanelProps {
  gameState: GameState;
  retreats: Record<string, string | null>;
  onRetreatChange: (unitId: string, destination: string | null) => void;
  onConfirm: () => void;
}

/**
 * Phase 7 - the retreat phase (rules 5.3).
 * "A dislodged unit must retreat to an adjacent territory that is not
 *  occupied and was not the territory from which the attacking force came.
 *  If no valid retreat exists, the unit is eliminated."
 */
export function RetreatPanel({
  gameState,
  retreats,
  onRetreatChange,
  onConfirm,
}: RetreatPanelProps) {
  const dislodged = useMemo(
    () => gameState.units.filter((u) => u.mustRetreat && !u.destroyed),
    [gameState.units]
  );

  if (gameState.phase !== 'retreats') {
    const phaseHint = {
      orders: 'Adjudicate orders before resolving retreats.',
      adjudication: 'Finish adjudication before resolving retreats.',
      retreats: '',
      builds: 'Retreats are already resolved. Continue to Build / Disband.',
      research: 'The turn has advanced. Finish research before returning to Move.',
    }[gameState.phase];
    return (
      <div className="phase-panel">
        <h3>Retreat Phase is not active</h3>
        <p className="hint">{phaseHint}</p>
      </div>
    );
  }

  if (dislodged.length === 0) {
    return (
      <div className="phase-panel">
        <h3>Retreat Phase</h3>
        <p className="hint">No units were dislodged. Nothing to do.</p>
        <p className="income-collection-note">
          Trade income is collected automatically when you continue, before the Build Phase. No
          separate collection step is needed.
        </p>
        <button className="primary-button" onClick={onConfirm}>
          Collect eco &amp; continue to Build Phase
        </button>
      </div>
    );
  }

  return (
    <div className="phase-panel">
      <h3>Retreat Phase</h3>
      <p className="hint">
        Every dislodged unit must retreat to an unoccupied neighbour, or it is
        eliminated.
      </p>
      <p className="income-collection-note">
        When you resolve these choices, trade income is collected automatically for every power
        before the Build Phase. It is counted only once this turn.
      </p>
      {dislodged.map((unit) => (
        <RetreatRow
          key={unit.id}
          unit={unit}
          gameState={gameState}
          destination={retreats[unit.id]}
          onChange={(destination) => onRetreatChange(unit.id, destination)}
        />
      ))}
      <button className="primary-button" onClick={onConfirm}>
        Resolve retreats &amp; collect eco
      </button>
    </div>
  );
}

function RetreatRow({
  unit,
  gameState,
  destination,
  onChange,
}: {
  unit: Unit;
  gameState: GameState;
  destination: string | null | undefined;
  onChange: (destination: string | null) => void;
}) {
  const options = validRetreatDestinations(gameState, unit);
  const from = gameState.territories[unit.territoryId];

  return (
    <div className="retreat-row">
      <div className="retreat-head">
        <span className="unit-badge" data-power={unit.power}>
          {UNIT_GLYPH[unit.type]}
          {unit.isElite ? '★' : ''}
        </span>
        <span>
          {from?.name ?? unit.territoryId}
          {unit.attackedFrom && (
            <small> attacked from {gameState.territories[unit.attackedFrom]?.name}</small>
          )}
        </span>
      </div>
      {options.length === 0 ? (
        <p className="hint danger">No valid retreat - the unit is eliminated.</p>
      ) : (
        <div className="retreat-options">
          {options.map((id) => (
            <button
              key={id}
              className={`chip ${destination === id ? 'active' : ''}`}
              onClick={() => onChange(id)}
            >
              {gameState.territories[id]?.name ?? id}
            </button>
          ))}
        </div>
      )}
      <button
        className={`chip danger ${destination === null ? 'active' : ''}`}
        onClick={() => onChange(null)}
      >
        Destroy unit
      </button>
    </div>
  );
}
