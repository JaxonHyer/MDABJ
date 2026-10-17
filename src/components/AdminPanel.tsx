import { useRef, useState } from 'react';
import { GameState, PowerId } from '../types/game';
import { POWER_COLORS } from '../data/mapConfig';
import { ALL_POWERS } from '../engine/economy';
import { ownedSupplyCenters } from '../engine/gameState';
import { adjustEco, adjustPoints } from '../engine/economy';
import { collectStats } from '../io/boardExport';

interface AdminPanelProps {
  gameState: GameState;
  onChange: (state: GameState) => void;
  onLoadSave: (file: File) => void;
  onExportSave: () => void;
  onExportBoardSvg: () => void;
  onExportBoardPng: () => void;
  onExportStatsSvg: () => void;
  onExportStatsPng: () => void;
  onExportTurnReport: () => void;
  /** "Place supply centre" mode is on - map clicks move supply centres. */
  supplyCentreMode: boolean;
  onToggleSupplyCentreMode: (on: boolean) => void;
  /** The power new supply centres belong to. */
  supplyCentrePower: PowerId;
  onSupplyCentrePower: (power: PowerId) => void;
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

export function AdminPanel({
  gameState,
  onChange,
  onLoadSave,
  onExportSave,
  onExportBoardSvg,
  onExportBoardPng,
  onExportStatsSvg,
  onExportStatsPng,
  onExportTurnReport,
  supplyCentreMode,
  onToggleSupplyCentreMode,
  supplyCentrePower,
  onSupplyCentrePower,
}: AdminPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'ledger' | 'map' | 'files'>('ledger');
  const [ecoDelta, setEcoDelta] = useState<Record<string, string>>({});

  const stats = collectStats(gameState);

  const changeEco = (power: PowerId, delta: number) => {
    onChange(adjustEco(gameState, power, delta));
  };

  return (
    <div className="admin-panel">
      <h3>Game Master</h3>
      <div className="admin-tabs">
        {(['ledger', 'map', 'files'] as const).map((entry) => (
          <button
            key={entry}
            className={`chip ${tab === entry ? 'active' : ''}`}
            onClick={() => setTab(entry)}
          >
            {entry === 'map' ? 'Supply centres' : entry === 'files' ? 'Files' : 'Ledger'}
          </button>
        ))}
      </div>

      {tab === 'ledger' && (
        <div className="admin-section">
          <p className="hint">
            Adjust the ledgers by hand - research bonuses, event rewards or
            corrections. Economic points are capped at 15.
          </p>
          {stats.map((stat) => (
            <div key={stat.power} className="admin-row ledger-row">
              <span className="admin-power" style={{ color: POWER_COLORS[stat.power] }}>
                {POWER_NAME[stat.power]}
              </span>
              <span className="admin-ledger">
                Eco <strong>{stat.eco}</strong>
              </span>
              <input
                type="number"
                placeholder="+1"
                value={ecoDelta[stat.power] ?? ''}
                onChange={(e) => setEcoDelta((prev) => ({ ...prev, [stat.power]: e.target.value }))}
              />
              <button
                className="chip"
                onClick={() => changeEco(stat.power, Number(ecoDelta[stat.power]) || 0)}
              >
                eco
              </button>
              <span className="admin-ledger">
                Mil <strong>{stat.military}</strong>
              </span>
              <button
                className="chip"
                onClick={() => onChange(adjustPoints(gameState, stat.power, 'military', 1))}
              >
                +1
              </button>
              <button
                className="chip"
                onClick={() => onChange(adjustPoints(gameState, stat.power, 'military', -1))}
              >
                -1
              </button>
              <span className="admin-ledger">
                Dip <strong>{stat.diplomatic}</strong>
              </span>
              <button
                className="chip"
                onClick={() => onChange(adjustPoints(gameState, stat.power, 'diplomatic', 1))}
              >
                +1
              </button>
              <button
                className="chip"
                onClick={() => onChange(adjustPoints(gameState, stat.power, 'diplomatic', -1))}
              >
                -1
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'map' && (
        <div className="admin-section">
          <p className="hint">
            Place or remove supply centres. Switch the mode on and click a
            province on the map.
          </p>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={supplyCentreMode}
              onChange={(e) => onToggleSupplyCentreMode(e.target.checked)}
            />
            Place supply centre mode
          </label>
          <div className="power-tabs">
            {ALL_POWERS.map((power) => (
              <button
                key={power}
                className={`chip ${supplyCentrePower === power ? 'active' : ''}`}
                onClick={() => onSupplyCentrePower(power)}
              >
                {POWER_NAME[power]}
              </button>
            ))}
          </div>
          <div className="supply-list">
            {ALL_POWERS.map((power) => {
              const centers = ownedSupplyCenters(gameState, power);
              return (
                <div key={power} className="supply-line">
                  <span style={{ color: POWER_COLORS[power] }}>{POWER_NAME[power]}</span>
                  <span>
                    {centers.length === 0
                      ? '-'
                      : centers
                          .map((id) => gameState.territories[id]?.name ?? id)
                          .join(', ')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'files' && (
        <div className="admin-section">
          <p className="hint">
            Load a save file, or export the current game for the players.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onLoadSave(file);
              e.target.value = '';
            }}
          />
          <div className="admin-buttons">
            <button className="primary-button" onClick={() => fileRef.current?.click()}>
              Load save file
            </button>
            <button className="primary-button" onClick={onExportSave}>
              Export save
            </button>
            <button className="primary-button" onClick={onExportBoardSvg}>
              Export board (SVG)
            </button>
            <button className="primary-button" onClick={onExportBoardPng}>
              Export board (PNG)
            </button>
            <button className="primary-button" onClick={onExportStatsSvg}>
              Export stats (SVG)
            </button>
            <button className="primary-button" onClick={onExportStatsPng}>
              Export stats (PNG)
            </button>
            <button className="primary-button" onClick={onExportTurnReport}>
              Export turn report (txt)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
