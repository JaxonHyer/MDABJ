import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { GameState, Order, OrderType, Phase, Power, PowerId, Unit } from './types/game';
import {
  advanceTurn,
  applyBuilds,
  applyRetreats,
  collectIncome,
  createInitialState,
  refreshSupplyCenters,
  removeDestroyed,
  setSupplyCenter,
} from './engine/gameState';
import { adjudicate } from './engine/adjudicator';
import { getAdjudicationState } from './engine/turnSnapshot';
import { loadPowers, loadTerritories } from './data/gameData';
import { supportableUnit, upsertOrder, validOrderTargets } from './engine/orders';
import { MapDisplay } from './components/MapDisplay';
import { OrderPanel } from './components/OrderPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { PowerSelector } from './components/PowerSelector';
import { RetreatPanel } from './components/RetreatPanel';
import { BuildPanel } from './components/BuildPanel';
import { AdminPanel } from './components/AdminPanel';
import {
  createEmptyResearchDrafts,
  ResearchDrafts,
  ResearchPanel,
} from './components/ResearchPanel';
import { downloadFile, saveFileName, stateFromJson, stateToJson } from './io/save';
import { buildTurnReport, turnReportFileName } from './io/turnReport';
import {
  boardPngDataUrl,
  buildBoardSvg,
  buildStatsSvg,
  downloadBoardPng,
  downloadStatsPng,
  downloadStatsSvg,
  statsPngDataUrl,
} from './io/boardExport';

const POWERS: Power[] = loadPowers();

/** The steps of a turn - the game master works through them in this order. */
type StepId = 'move' | 'retreats' | 'builds' | 'research';

const STEPS: { id: StepId; label: string; hint: string }[] = [
  {
    id: 'move',
    label: 'Move',
    hint: 'Write the orders of every power, then adjudicate them.',
  },
  {
    id: 'retreats',
    label: 'Retreats',
    hint: 'Every dislodged unit retreats to a free neighbour or is eliminated.',
  },
  {
    id: 'builds',
    label: 'Build / Disband',
    hint: 'Spend the eco points: new units, elite upgrades, fortification, disband.',
  },
  {
    id: 'research',
    label: 'Score research',
    hint: 'Score the research of every power - the eco points can pay for the builds of the next turn.',
  },
];

/** The step the game is currently in. */
const PHASE_STEP: Record<Phase, StepId> = {
  orders: 'move',
  adjudication: 'move',
  retreats: 'retreats',
  builds: 'builds',
  research: 'research',
};

function App() {
  const [gameState, setGameState] = useState<GameState>(() => {
    const state = createInitialState(POWERS);
    state.territories = loadTerritories();
    return state;
  });
  const [selectedPower, setSelectedPower] = useState<PowerId | null>(null);
  const [orderText, setOrderText] = useState('');
  const [orderPanelKey, setOrderPanelKey] = useState(0);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>('move');
  const [hoveredTerritoryId, setHoveredTerritoryId] = useState<string | null>(null);
  const [retreats, setRetreats] = useState<Record<string, string | null>>({});
  const [researchDrafts, setResearchDrafts] = useState<ResearchDrafts>(createEmptyResearchDrafts);
  const [activeStep, setActiveStep] = useState<StepId>('move');
  const [supplyCentreMode, setSupplyCentreMode] = useState(false);
  const [supplyCentrePower, setSupplyCentrePower] = useState<PowerId>('athens');
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    title: string;
    fileName: string;
    /** Image preview (board or stats sheet). */
    dataUrl?: string;
    /** Text preview (turn report). */
    text?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const overlayRef = useRef<SVGSVGElement>(null);
  /**
   * The state at the beginning of the turn. The adjudication always starts
   * from this snapshot, so the game master can go back to the move step,
   * change an order and adjudicate again.
   */
  const turnStartRef = useRef<GameState | null>(null);

  // The turn snapshot is taken during Move and retained for safe
  // re-adjudication. Never carry it across turns or save loads.
  useEffect(() => {
    if (gameState.phase === 'orders') {
      turnStartRef.current = gameState;
    } else if (turnStartRef.current?.turn !== gameState.turn) {
      turnStartRef.current = null;
    }
  }, [gameState]);

  const adjudicationState = getAdjudicationState(gameState, turnStartRef.current);
  const orderEntryState = adjudicationState ?? gameState;

  const selectedUnit: Unit | undefined = useMemo(
    () => orderEntryState.units.find((u) => u.id === selectedUnitId),
    [orderEntryState.units, selectedUnitId]
  );

  const validTargets = useMemo(() => {
    if (!selectedUnit) return [];
    const order = orderEntryState.orders.find((o) => o.unitId === selectedUnit.id);
    return validOrderTargets(orderEntryState, selectedUnit, order?.type ?? orderType);
  }, [orderEntryState, selectedUnit, orderType]);

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
        if (!selectedUnitId) return prev;
        const orderState = getAdjudicationState(prev, turnStartRef.current);
        if (!orderState) return prev;

        const unit = orderState.units.find((u) => u.id === selectedUnitId);
        if (!unit) return prev;

        const existing = prev.orders.find((o) => o.unitId === unit.id);
        const type = existing?.type ?? orderType;

        // Support orders point at another unit of the same power.
        if (type === 'support_hold' || type === 'support_move' || type === 'transport') {
          const supported = supportableUnit(orderState, unit, territoryId, type);
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

  const handleContinueToMove = () => {
    setGameState((prev) => {
      if (prev.phase !== 'research') return prev;
      const next = { ...prev, phase: 'orders' as const };
      turnStartRef.current = next;
      return next;
    });
    setResearchDrafts(createEmptyResearchDrafts());
    setSelectedUnitId(null);
    setActiveStep('move');
  };

  const handleAdjudicate = () => {
    // Re-adjudicate from the beginning of this turn, never from the already
    // moved board or a stale snapshot from a previous turn.
    const base = getAdjudicationState(gameState, turnStartRef.current);
    if (!base) {
      setNotice(
        gameState.phase === 'research'
          ? 'Score research and continue to Move before adjudicating this turn.'
          : 'A turn-start snapshot is unavailable for this save, so it cannot be safely re-adjudicated.'
      );
      return;
    }
    const outcome = adjudicate(base);
    setGameState((prev) => ({
      ...prev,
      units: outcome.units,
      results: outcome.results,
      phase: 'retreats',
    }));
    setRetreats({});
    setSelectedUnitId(null);
    setActiveStep('retreats');
    setNotice('The orders were adjudicated.');
  };

  const handleRetreatChange = (unitId: string, destination: string | null) => {
    setRetreats((prev) => ({ ...prev, [unitId]: destination }));
  };

  const handleResolveRetreats = () => {
    if (gameState.phase !== 'retreats') {
      setNotice(
        gameState.phase === 'orders' || gameState.phase === 'adjudication'
          ? 'Adjudicate the orders before the units can retreat.'
          : 'Retreats have already been resolved or are not ready yet.'
      );
      return;
    }
    setGameState((prev) => {
      const withRetreats = applyRetreats(prev, retreats);
      const cleaned = removeDestroyed(withRetreats);
      // The income is collected before the build phase (rules 4.7).
      return { ...collectIncome(cleaned), phase: 'builds' };
    });
    setActiveStep('builds');
  };

  const handleBuildsChange = (builds: GameState['builds']) => {
    setGameState((prev) => (prev.phase === 'builds' ? { ...prev, builds } : prev));
  };

  const handleFinishTurn = () => {
    if (gameState.phase !== 'builds') {
      setNotice(
        gameState.phase === 'orders' || gameState.phase === 'adjudication'
          ? 'Adjudicate the orders before the turn can end.'
          : gameState.phase === 'retreats'
            ? 'Resolve retreats and collect eco before finishing the turn.'
            : 'This turn has already ended. Score research before returning to Move.'
      );
      return;
    }
    if (gameState.units.some((unit) => unit.mustRetreat && !unit.destroyed)) {
      setNotice('Resolve every retreat before finishing the turn.');
      return;
    }
    turnStartRef.current = null;
    setGameState((prev) => {
      // The income receipt is collected after retreats; this is an exactly-once
      // fallback for older or manually loaded build-phase saves.
      const withIncome = collectIncome(prev);
      const built = applyBuilds(withIncome);
      const next = advanceTurn(built);
      return refreshSupplyCenters(next);
    });
    setRetreats({});
    setResearchDrafts(createEmptyResearchDrafts());
    setSelectedUnitId(null);
    setActiveStep('research');
  };

  const handleLoadSave = async (file: File) => {
    try {
      const text = await file.text();
      const state = stateFromJson(text);
      turnStartRef.current = state.phase === 'orders' ? state : null;
      setGameState(state);
      setActiveStep(PHASE_STEP[state.phase]);
      setOrderPanelKey((key) => key + 1);
      setOrderText('');
      setSelectedPower(state.activePower);
      setSelectedUnitId(null);
      setRetreats({});
      setResearchDrafts(createEmptyResearchDrafts());
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
      const fileName = `mare-nostrum-board-turn${gameState.turn}.svg`;
      const svg = await buildBoardSvg(overlayRef.current);
      downloadFile(fileName, svg, 'image/svg+xml');
      setPreview({
        title: `Board - turn ${gameState.turn}`,
        dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        fileName,
      });
      setNotice('Board exported as SVG.');
    } catch (error) {
      setNotice(`Board export failed: ${(error as Error).message}`);
    }
  };

  const handleExportBoardPng = async () => {
    try {
      const fileName = `mare-nostrum-board-turn${gameState.turn}.png`;
      const dataUrl = await boardPngDataUrl(overlayRef.current);
      downloadBoardPng(overlayRef.current, fileName);
      setPreview({ title: `Board - turn ${gameState.turn}`, dataUrl, fileName });
      setNotice('Board exported as PNG.');
    } catch (error) {
      setNotice(`Board export failed: ${(error as Error).message}`);
    }
  };

  const handleExportStatsSvg = () => {
    const fileName = `mare-nostrum-stats-turn${gameState.turn}.svg`;
    const svg = buildStatsSvg(gameState);
    downloadStatsSvg(gameState, fileName);
    setPreview({
      title: `Board stats - turn ${gameState.turn}`,
      dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
      fileName,
    });
    setNotice('Statistics exported as SVG.');
  };

  const handleExportStatsPng = async () => {
    try {
      const fileName = `mare-nostrum-stats-turn${gameState.turn}.png`;
      const dataUrl = await statsPngDataUrl(gameState);
      downloadStatsPng(gameState, fileName);
      setPreview({ title: `Board stats - turn ${gameState.turn}`, dataUrl, fileName });
      setNotice('Statistics exported as PNG.');
    } catch (error) {
      setNotice(`Statistics export failed: ${(error as Error).message}`);
    }
  };

  const handleExportTurnReport = () => {
    const text = buildTurnReport(gameState);
    const fileName = turnReportFileName(gameState);
    downloadFile(fileName, text, 'text/plain');
    setPreview({ title: `Turn report - turn ${gameState.turn}`, fileName, text });
    setNotice('Turn report exported.');
  };

  const phaseLabel = {
    research: 'Score research',
    orders: 'Move',
    adjudication: 'Move',
    retreats: 'Retreats',
    builds: 'Build / Disband',
  }[gameState.phase];

  return (
    <div className="app">
      <header className="app-header">
        <h1>Mare Nostrum</h1>
        <p className="subtitle">Diplomacy Adjudicator • Eastern Mediterranean, 350 BC</p>
      </header>

      <div className="app-content">
        <aside className="sidebar">
          <nav className="step-nav">
            {STEPS.map((step, index) => {
              const state =
                activeStep === step.id
                  ? 'active'
                  : STEPS.findIndex((s) => s.id === PHASE_STEP[gameState.phase]) > index
                    ? 'done'
                    : 'todo';
              return (
                <button
                  key={step.id}
                  className={`step ${state}`}
                  onClick={() => setActiveStep(step.id)}
                >
                  <span className="step-index">{index + 1}</span>
                  <span className="step-label">{step.label}</span>
                </button>
              );
            })}
          </nav>
          <p className="step-hint">
            {STEPS.find((s) => s.id === activeStep)?.hint}
          </p>

          <div className="step-body">
            {activeStep === 'move' && (
              <>
                <PowerSelector
                  powers={POWERS}
                  selectedPower={selectedPower}
                  onSelect={handlePowerSelect}
                />
                <OrderPanel
                  key={orderPanelKey}
                  gameState={orderEntryState}
                  canEditOrders={adjudicationState !== null}
                  orderText={orderText}
                  onOrderTextChange={setOrderText}
                  selectedUnitId={selectedUnitId}
                  orderType={orderType}
                  onSelectUnit={setSelectedUnitId}
                  onSelectOrderType={setOrderType}
                  onOrdersChange={handleOrdersChange}
                  onAdjudicate={handleAdjudicate}
                />
              </>
            )}
            {activeStep === 'retreats' && (
              <RetreatPanel
                gameState={gameState}
                retreats={retreats}
                onRetreatChange={handleRetreatChange}
                onConfirm={handleResolveRetreats}
              />
            )}
            {activeStep === 'builds' && (
              <BuildPanel
                gameState={gameState}
                onBuildsChange={handleBuildsChange}
                onFinishTurn={handleFinishTurn}
              />
            )}
            {activeStep === 'research' && (
              <ResearchPanel
                gameState={gameState}
                drafts={researchDrafts}
                onDraftsChange={setResearchDrafts}
                onChange={setGameState}
                onContinue={handleContinueToMove}
              />
            )}
          </div>

          <details className="gm-drawer">
            <summary>Game master tools</summary>
            <AdminPanel
              gameState={gameState}
              onChange={setGameState}
              onLoadSave={handleLoadSave}
              onExportSave={handleExportSave}
              onExportBoardSvg={handleExportBoardSvg}
              onExportBoardPng={handleExportBoardPng}
              onExportStatsSvg={handleExportStatsSvg}
              onExportStatsPng={handleExportStatsPng}
              onExportTurnReport={handleExportTurnReport}
              supplyCentreMode={supplyCentreMode}
              onToggleSupplyCentreMode={setSupplyCentreMode}
              supplyCentrePower={supplyCentrePower}
              onSupplyCentrePower={setSupplyCentrePower}
            />
          </details>
        </aside>

        <main className="main-content">
          <MapDisplay
            gameState={activeStep === 'move' && adjudicationState ? orderEntryState : gameState}
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

        {preview && (
          <div className="preview-backdrop" onClick={() => setPreview(null)}>
            <div className="preview" onClick={(event) => event.stopPropagation()}>
              <div className="preview-head">
                <h3>{preview.title}</h3>
                <div className="preview-actions">
                  {preview.dataUrl ? (
                    <>
                      <a className="primary-button" href={preview.dataUrl} download={preview.fileName}>
                        Download
                      </a>
                      <a
                        className="secondary-button"
                        href={preview.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in new tab
                      </a>
                    </>
                  ) : (
                    <>
                      <button
                        className="primary-button"
                        onClick={() => {
                          downloadFile(preview.fileName, preview.text ?? '', 'text/plain');
                        }}
                      >
                        Download
                      </button>
                      <button
                        className="secondary-button"
                        onClick={async () => {
                          await navigator.clipboard?.writeText(preview.text ?? '');
                          setCopied(true);
                        }}
                      >
                        {copied ? 'Copied' : 'Copy text'}
                      </button>
                    </>
                  )}
                  <button className="secondary-button" onClick={() => setPreview(null)}>
                    Close
                  </button>
                </div>
              </div>
              <div className="preview-body">
                {preview.dataUrl ? (
                  <img src={preview.dataUrl} alt={preview.title} />
                ) : (
                  <pre className="preview-text">{preview.text}</pre>
                )}
              </div>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}

export default App;
