import { useCallback, useMemo, useRef, useState } from 'react';
import './App.css';
import { GameState, Order, OrderType, Power, PowerId, Unit } from './types/game';
import {
  advanceTurn,
  applyBuilds,
  applyRetreats,
  createInitialState,
  ownedSupplyCenters,
  refreshSupplyCenters,
  removeDestroyed,
  setSupplyCenter,
} from './engine/gameState';
import { adjudicate } from './engine/adjudicator';
import { calculateIncome } from './engine/economy';
import { loadPowers, loadTerritories } from './data/gameData';
import { supportableUnit, upsertOrder, validOrderTargets } from './engine/orders';
import { MapDisplay } from './components/MapDisplay';
import { OrderPanel } from './components/OrderPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { PowerSelector } from './components/PowerSelector';
import { RetreatPanel } from './components/RetreatPanel';
import { BuildPanel } from './components/BuildPanel';
import { AdminPanel } from './components/AdminPanel';
import { downloadFile, saveFileName, stateFromJson, stateToJson } from './io/save';
import {
  downloadBoardPng,
  downloadBoardSvg,
  downloadStatsPng,
  downloadStatsSvg,
} from './io/boardExport';

const POWERS: Power[] = loadPowers();

function App() {
  const [gameState, setGameState] = useState<GameState>(() => {
    const state = createInitialState(POWERS);
    state.territories = loadTerritories();
    return state;
  });
  const [selectedPower, setSelectedPower] = useState<PowerId | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>('move');
  const [hoveredTerritoryId, setHoveredTerritoryId] = useState<string | null>(null);
  const [retreats, setRetreats] = useState<Record<string, string | null>>({});
  const [adminOpen, setAdminOpen] = useState(false);
  const [supplyCentreMode, setSupplyCentreMode] = useState(false);
  const [supplyCentrePower, setSupplyCentrePower] = useState<PowerId>('athens');
  const [notice, setNotice] = useState<string | null>(null);
  const overlayRef = useRef<SVGSVGElement>(null);

  const selectedUnit: Unit | undefined = useMemo(
    () => gameState.units.find((u) => u.id === selectedUnitId),
    [gameState.units, selectedUnitId]
  );

  const validTargets = useMemo(() => {
    if (!selectedUnit) return [];
    const order = gameState.orders.find((o) => o.unitId === selectedUnit.id);
    return validOrderTargets(gameState, selectedUnit, order?.type ?? orderType);
  }, [gameState, selectedUnit, orderType]);

  const handlePowerSelect = (powerId: PowerId) => {
    setSelectedPower(powerId);
    setSelectedUnitId(null);
    setGameState((prev) => ({ ...prev, activePower: powerId }));
  };

  const handleOrdersChange = (orders: Order[]) => {
    setGameState((prev) => ({ ...prev, orders }));
  };

  /**
   * Clicking a province on the map. If a unit of the active power is
   * selected, the click becomes the target of that unit's order.
   */
  const handleTerritoryClick = useCallback(
    (territoryId: string) => {
      // The game master places supply centres directly on the map.
      if (supplyCentreMode) {
        setGameState((prev) => {
          const territory = prev.territories[territoryId];
          if (!territory) return prev;
          const place = !territory.isSupplyCenter;
          return setSupplyCenter(prev, territoryId, place, place ? supplyCentrePower : undefined);
        });
        return;
      }

      setGameState((prev) => {
        if (prev.phase !== 'orders') return prev;
        if (!selectedUnitId) return prev;

        const unit = prev.units.find((u) => u.id === selectedUnitId);
        if (!unit) return prev;

        const existing = prev.orders.find((o) => o.unitId === unit.id);
        const type = existing?.type ?? orderType;

        // Support orders point at another unit of the same power.
        if (type === 'support_hold' || type === 'support_move' || type === 'transport') {
          const supported = supportableUnit(prev, unit, territoryId, type);
          if (!supported) return prev;
          const next: Order = {
            unitId: unit.id,
            type,
            target:
              type === 'support_hold'
                ? supported.territoryId
                : territoryId,
            supportTarget: supported.id,
          };
          return { ...prev, orders: upsertOrder(prev.orders, next) };
        }

        if (type === 'hold') return prev;

        const next: Order = {
          unitId: unit.id,
          type,
          target: territoryId,
          viaConvoy: existing?.viaConvoy,
        };
        return { ...prev, orders: upsertOrder(prev.orders, next) };
      });
    },
    [orderType, selectedUnitId, supplyCentreMode, supplyCentrePower]
  );

  const handleAdjudicate = () => {
    setGameState((prev) => {
      const outcome = adjudicate(prev);
      return {
        ...prev,
        units: outcome.units,
        results: outcome.results,
        phase: 'retreats',
        orders: prev.orders,
      };
    });
    setRetreats({});
    setSelectedUnitId(null);
  };

  const handleRetreatChange = (unitId: string, destination: string | null) => {
    setRetreats((prev) => ({ ...prev, [unitId]: destination }));
  };

  const handleResolveRetreats = () => {
    setGameState((prev) => {
      const withRetreats = applyRetreats(prev, retreats);
      const cleaned = removeDestroyed(withRetreats);
      // A unit that retreated does not generate income this turn (5.3).
      const moved = new Set(
        prev.orders
          .filter((o) => o.type === 'move' || o.type === 'trade')
          .map((o) => o.unitId)
      );
      for (const unit of cleaned.units) {
        if (unit.originTerritoryId && unit.originTerritoryId !== unit.territoryId) {
          moved.add(unit.id);
        }
      }
      const income = calculateIncome(cleaned, cleaned.units, moved);
      const economy = { ...cleaned.economy };
      for (const [power, value] of Object.entries(income)) {
        const current = economy[power as PowerId];
        if (!current) continue;
        economy[power as PowerId] = {
          ...current,
          eco: Math.min(15, current.eco + value),
          supplyCenters: ownedSupplyCenters(cleaned, power as PowerId).length,
        };
      }
      return { ...cleaned, phase: 'builds', economy, lastIncome: income };
    });
  };

  const handleBuildsChange = (builds: GameState['builds']) => {
    setGameState((prev) => ({ ...prev, builds }));
  };

  const handleFinishTurn = () => {
    setGameState((prev) => {
      const built = applyBuilds(prev);
      const next = advanceTurn(built);
      return refreshSupplyCenters(next);
    });
    setRetreats({});
    setSelectedUnitId(null);
  };

  const handleLoadSave = async (file: File) => {
    try {
      const text = await file.text();
      const state = stateFromJson(text);
      setGameState(state);
      setSelectedUnitId(null);
      setRetreats({});
      setNotice(`Loaded ${file.name} - turn ${state.turn} (${state.year} BC).`);
    } catch (error) {
      setNotice(`Could not load the file: ${(error as Error).message}`);
    }
  };

  const handleExportSave = () => {
    downloadFile(saveFileName(gameState), stateToJson(gameState), 'application/json');
    setNotice('Save file exported.');
  };

  const handleExportBoardSvg = async () => {
    try {
      await downloadBoardSvg(overlayRef.current, `mare-nostrum-board-turn${gameState.turn}.svg`);
      setNotice('Board exported as SVG.');
    } catch (error) {
      setNotice(`Board export failed: ${(error as Error).message}`);
    }
  };

  const handleExportBoardPng = async () => {
    try {
      await downloadBoardPng(overlayRef.current, `mare-nostrum-board-turn${gameState.turn}.png`);
      setNotice('Board exported as PNG.');
    } catch (error) {
      setNotice(`Board export failed: ${(error as Error).message}`);
    }
  };

  const handleExportStatsSvg = () => {
    downloadStatsSvg(gameState, `mare-nostrum-stats-turn${gameState.turn}.svg`);
    setNotice('Statistics exported as SVG.');
  };

  const handleExportStatsPng = async () => {
    try {
      await downloadStatsPng(gameState, `mare-nostrum-stats-turn${gameState.turn}.png`);
      setNotice('Statistics exported as PNG.');
    } catch (error) {
      setNotice(`Statistics export failed: ${(error as Error).message}`);
    }
  };

  const phaseLabel = {
    orders: 'Writing orders',
    adjudication: 'Adjudication',
    retreats: 'Retreats',
    builds: 'Build phase',
    complete: 'Turn complete',
  }[gameState.phase];

  return (
    <div className="app">
      <header className="app-header">
        <h1>Mare Nostrum</h1>
        <p className="subtitle">Diplomacy Adjudicator • Eastern Mediterranean, 350 BC</p>
      </header>

      <div className="app-content">
        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button
              className={`chip ${adminOpen ? '' : 'active'}`}
              onClick={() => setAdminOpen(false)}
            >
              Play
            </button>
            <button
              className={`chip ${adminOpen ? 'active' : ''}`}
              onClick={() => setAdminOpen(true)}
            >
              Game master
            </button>
          </div>

          {adminOpen ? (
            <AdminPanel
              gameState={gameState}
              onChange={setGameState}
              onLoadSave={handleLoadSave}
              onExportSave={handleExportSave}
              onExportBoardSvg={handleExportBoardSvg}
              onExportBoardPng={handleExportBoardPng}
              onExportStatsSvg={handleExportStatsSvg}
              onExportStatsPng={handleExportStatsPng}
              supplyCentreMode={supplyCentreMode}
              onToggleSupplyCentreMode={setSupplyCentreMode}
              supplyCentrePower={supplyCentrePower}
              onSupplyCentrePower={setSupplyCentrePower}
            />
          ) : (
            <>
              <PowerSelector
                powers={POWERS}
                selectedPower={selectedPower}
                onSelect={handlePowerSelect}
              />

              {gameState.phase === 'orders' ? (
                <OrderPanel
                  gameState={gameState}
                  selectedUnitId={selectedUnitId}
                  orderType={orderType}
                  onSelectUnit={setSelectedUnitId}
                  onSelectOrderType={setOrderType}
                  onOrdersChange={handleOrdersChange}
                  onAdjudicate={handleAdjudicate}
                />
              ) : gameState.phase === 'retreats' ? (
                <RetreatPanel
                  gameState={gameState}
                  retreats={retreats}
                  onRetreatChange={handleRetreatChange}
                  onConfirm={handleResolveRetreats}
                />
              ) : gameState.phase === 'builds' ? (
                <BuildPanel
                  gameState={gameState}
                  onBuildsChange={handleBuildsChange}
                  onFinishTurn={handleFinishTurn}
                />
              ) : (
                <div className="phase-panel">
                  <h3>{phaseLabel}</h3>
                  <p className="hint">The turn is finished. Start the next turn below.</p>
                  <button className="primary-button" onClick={handleFinishTurn}>
                    Start next turn
                  </button>
                </div>
              )}
            </>
          )}
        </aside>

        <main className="main-content">
          <MapDisplay
            gameState={gameState}
            selectedTerritoryId={selectedUnit?.territoryId ?? null}
            hoveredTerritoryId={hoveredTerritoryId}
            validTargets={validTargets}
            onTerritoryClick={handleTerritoryClick}
            onTerritoryHover={setHoveredTerritoryId}
            overlayRef={overlayRef}
            supplyCentreMode={supplyCentreMode}
          />
          <ResultsPanel gameState={gameState} />
        </main>
      </div>

      <footer className="app-footer">
        <div className="game-info">
          <span>Turn {gameState.turn}</span>
          <span>{gameState.year} BC</span>
          <span>Phase: {phaseLabel}</span>
          <span>Orders: {gameState.orders.length}</span>
          {supplyCentreMode && <span className="warning">Placing supply centres</span>}
        </div>
        {notice && <div className="notice">{notice}</div>}
      </footer>
    </div>
  );
}

export default App;
