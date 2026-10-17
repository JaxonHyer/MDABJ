import { useState } from 'react';
import { BuildAction, GameState, PowerId, Unit, UNIT_GLYPH } from '../types/game';
import {
  applyBuilds,
  buildableHomeCenters,
  eliteUnitCount,
  occupiedTradeNodes,
  ownedSupplyCenters,
  pendingBuildCost,
  unitLimit,
  validateBuild,
} from '../engine/gameState';
import { BUILD_COST } from '../engine/economy';

interface BuildPanelProps {
  gameState: GameState;
  onBuildsChange: (builds: BuildAction[]) => void;
  onFinishTurn: () => void;
}

const ALL_POWERS: PowerId[] = [
  'athens',
  'sparta',
  'macedon',
  'satrapies',
  'persia',
  'phoenicia',
  'carthage',
  'rome',
];

export function BuildPanel({ gameState, onBuildsChange, onFinishTurn }: BuildPanelProps) {
  const [power, setPower] = useState<PowerId>(gameState.activePower ?? 'athens');

  if (gameState.phase !== 'builds') {
    const phaseHint = {
      orders: 'Adjudicate orders before entering builds.',
      adjudication: 'Finish adjudication and retreats before building.',
      retreats: 'Resolve retreats and collect eco before entering builds.',
      builds: '',
      research: 'This turn has already ended. Finish research before returning to Move.',
    }[gameState.phase];
    return (
      <div className="phase-panel">
        <h3>Build / Disband is not active</h3>
        <p className="hint">{phaseHint}</p>
      </div>
    );
  }

  const pending = gameState.builds.filter((b) => b.power === power);
  const eco = gameState.economy[power]?.eco ?? 0;
  const cost = pendingBuildCost(gameState, power);
  const remaining = eco - cost;

  const units = gameState.units.filter((u) => u.power === power && !u.destroyed);
  // Project the queued actions so paid builds, disbands and cities occupied
  // by a newly placed caravan are reflected in the final unit allowance.
  const projectedState = applyBuilds({ ...gameState, builds: pending });
  const limit = unitLimit(projectedState, power);
  const effectiveUnits = limit.units;
  const supplyCenters = limit.supplyCenters;
  const maxUnits = limit.max;

  const add = (action: Omit<BuildAction, 'id'>) => {
    onBuildsChange([
      ...gameState.builds,
      { ...action, id: `${action.power}_${action.kind}_${gameState.builds.length + 1}` },
    ]);
  };

  const remove = (id: string) => {
    onBuildsChange(gameState.builds.filter((b) => b.id !== id));
  };

  const overBudget = remaining < 0;
  const tooManyUnits = effectiveUnits > maxUnits;

  return (
    <div className="phase-panel">
      <h3>Build Phase</h3>
      <div className="power-tabs">
        {ALL_POWERS.map((p) => (
          <button
            key={p}
            className={`chip ${power === p ? 'active' : ''}`}
            onClick={() => setPower(p)}
          >
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="build-summary">
        <span>
          Eco: <strong>{eco}</strong>
        </span>
        <span>
          Pending cost: <strong>{cost}</strong>
        </span>
        <span>
          Left: <strong className={remaining < 0 ? 'danger-text' : ''}>{remaining}</strong>
        </span>
        <span>
          Units: <strong>{effectiveUnits}</strong> / {supplyCenters} SC
          {limit.cities > 0 &&
            ` + ${limit.cities} ${limit.cities === 1 ? 'city' : 'cities'}`} (max {maxUnits})
          {limit.bought > 0 && ` (${limit.bought} paid for)`}
        </span>
        <span>
          Elite: <strong>{eliteUnitCount(gameState, power)}</strong> / 2
        </span>
      </div>

      {tooManyUnits && (
        <p className="hint danger">
          Too many units - disband {effectiveUnits - maxUnits} unit(s) before the turn ends.
        </p>
      )}

      <BuildOptions
        gameState={gameState}
        power={power}
        units={units}
        onAdd={add}
      />

      {pending.length > 0 && (
        <div className="pending-builds">
          <h4>Pending</h4>
          {pending.map((action) => {
            const validation = validateBuild(gameState, action, pending);
            return (
              <div key={action.id} className="pending-build">
                <span>{describeBuild(gameState, action)}</span>
                {validation.errors.length > 0 && (
                  <span className="danger-text">{validation.errors[0]}</span>
                )}
                <button className="chip danger" onClick={() => remove(action.id)}>
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <button
        className="primary-button"
        disabled={overBudget || tooManyUnits}
        onClick={onFinishTurn}
      >
        Finish Turn
      </button>
    </div>
  );
}

function BuildOptions({
  gameState,
  power,
  units,
  onAdd,
}: {
  gameState: GameState;
  power: PowerId;
  units: Unit[];
  onAdd: (action: Omit<BuildAction, 'id'>) => void;
}) {
  const armyCenters = buildableHomeCenters(gameState, power, 'army');
  const fleetCenters = buildableHomeCenters(gameState, power, 'fleet');
  const tradeNodes = occupiedTradeNodes(gameState, power);
  const homeCenters = buildableHomeCenters(gameState, power);
  const supplyCenters = ownedSupplyCenters(gameState, power);
  const upgradable = units.filter(
    (u) => (u.type === 'army' || u.type === 'fleet') && !u.isElite
  );

  return (
    <div className="build-options">
      <div className="build-group">
        <h4>Army ({BUILD_COST.army} eco)</h4>
        {armyCenters.length === 0 && <p className="hint">No home supply centre available.</p>}
        {armyCenters.map((id) => (
          <button
            key={id}
            className="chip"
            onClick={() => onAdd({ power, kind: 'army', territoryId: id })}
          >
            {gameState.territories[id]?.name ?? id}
          </button>
        ))}
      </div>

      <div className="build-group">
        <h4>Fleet ({BUILD_COST.fleet} eco)</h4>
        {fleetCenters.length === 0 && (
          <p className="hint">No coastal home supply centre available.</p>
        )}
        {fleetCenters.map((id) => (
          <button
            key={id}
            className="chip"
            onClick={() => onAdd({ power, kind: 'fleet', territoryId: id })}
          >
            {gameState.territories[id]?.name ?? id}
          </button>
        ))}
      </div>

      <div className="build-group">
        <h4>Caravan ({BUILD_COST.caravan} eco)</h4>
        {[...new Set([...tradeNodes, ...homeCenters])].map((id) => (
          <button
            key={id}
            className="chip"
            onClick={() => onAdd({ power, kind: 'caravan', territoryId: id })}
          >
            {gameState.territories[id]?.name ?? id}
          </button>
        ))}
      </div>

      <div className="build-group">
        <h4>Upgrade to Elite ({BUILD_COST.upgrade} eco, max 2)</h4>
        {upgradable.map((unit) => (
          <button
            key={unit.id}
            className="chip"
            onClick={() =>
              onAdd({
                power,
                kind: 'upgrade',
                unitId: unit.id,
                territoryId: unit.territoryId,
              })
            }
          >
            {UNIT_GLYPH[unit.type]} {gameState.territories[unit.territoryId]?.name}
          </button>
        ))}
      </div>

      <div className="build-group">
        <h4>Fortify supply centre ({BUILD_COST.fortify} eco)</h4>
        {supplyCenters
          .filter((id) => !gameState.territories[id]?.fortified)
          .map((id) => (
            <button
              key={id}
              className="chip"
              onClick={() => onAdd({ power, kind: 'fortify', territoryId: id })}
            >
              {gameState.territories[id]?.name ?? id}
            </button>
          ))}
      </div>

      <div className="build-group">
        <h4>Disband</h4>
        {units.map((unit) => (
          <button
            key={unit.id}
            className="chip danger"
            onClick={() =>
              onAdd({ power, kind: 'disband', unitId: unit.id, territoryId: unit.territoryId })
            }
          >
            {UNIT_GLYPH[unit.type]} {gameState.territories[unit.territoryId]?.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function describeBuild(gameState: GameState, action: BuildAction): string {
  const name = (id?: string) => (id ? gameState.territories[id]?.name ?? id : '');
  switch (action.kind) {
    case 'army':
      return `Build army in ${name(action.territoryId)}`;
    case 'fleet':
      return `Build fleet in ${name(action.territoryId)}`;
    case 'caravan':
      return `Build caravan in ${name(action.territoryId)}`;
    case 'upgrade':
      return `Upgrade unit in ${name(action.territoryId)}`;
    case 'disband':
      return `Disband unit in ${name(action.territoryId)}`;
    case 'fortify':
      return `Fortify ${name(action.territoryId)}`;
    default:
      return action.kind;
  }
}
