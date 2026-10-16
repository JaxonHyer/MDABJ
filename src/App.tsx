import { useState } from 'react';
import './App.css';
import { GameState, Power, PowerId } from './types/game';
import { createInitialState } from './engine/gameState';
import { adjudicate } from './engine/adjudicator';
import { loadPowers, loadTerritories } from './data/gameData';
import { MapDisplay } from './components/MapDisplay';
import { OrderPanel } from './components/OrderPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { PowerSelector } from './components/PowerSelector';

const POWERS: Power[] = loadPowers();

function App() {
  const [gameState, setGameState] = useState<GameState>(() => {
    const state = createInitialState(POWERS);
    state.territories = loadTerritories();
    return state;
  });
  const [selectedPower, setSelectedPower] = useState<PowerId | null>(null);

  const handlePowerSelect = (powerId: PowerId) => {
    setSelectedPower(powerId);
    setGameState({ ...gameState, activePower: powerId });
  };

  const handleAdjudicate = () => {
    const results = adjudicate(gameState);
    setGameState({ ...gameState, results, phase: 'adjudication' });
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Mare Nostrum</h1>
        <p className="subtitle">Diplomacy Adjudicator • Eastern Mediterranean, 350 BC</p>
      </header>

      <div className="app-content">
        <aside className="sidebar">
          <PowerSelector
            powers={POWERS}
            selectedPower={selectedPower}
            onSelect={handlePowerSelect}
          />
          <OrderPanel
            gameState={gameState}
            onOrdersChange={(orders) => setGameState({ ...gameState, orders })}
            onAdjudicate={handleAdjudicate}
          />
        </aside>

        <main className="main-content">
          <MapDisplay gameState={gameState} />
          <ResultsPanel gameState={gameState} />
        </main>
      </div>

      <footer className="app-footer">
        <div className="game-info">
          <span>Turn {gameState.turn}</span>
          <span>{gameState.year} BC</span>
          <span>Phase: {gameState.phase}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
