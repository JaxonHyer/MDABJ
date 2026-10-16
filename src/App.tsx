import { useState } from 'react';
import './App.css';
import { GameState, Power, PowerId } from './types/game';
import { createInitialState } from './engine/gameState';
import { MapDisplay } from './components/MapDisplay';
import { OrderPanel } from './components/OrderPanel';
import { ResultsPanel } from './components/ResultsPanel';
import { PowerSelector } from './components/PowerSelector';

// Placeholder powers - will be populated from map data
const POWERS: Power[] = [
  { id: 'athens', name: 'Athens', color: '#4CAF50', homeCenters: [], startingUnits: [], startingEco: 4 },
  { id: 'sparta', name: 'Sparta', color: '#2196F3', homeCenters: [], startingUnits: [], startingEco: 2 },
  { id: 'macedon', name: 'Macedon', color: '#D2B48C', homeCenters: [], startingUnits: [], startingEco: 2 },
  { id: 'satrapies', name: 'Satrapies', color: '#FF9800', homeCenters: [], startingUnits: [], startingEco: 3 },
  { id: 'persia', name: 'Persia', color: '#795548', homeCenters: [], startingUnits: [], startingEco: 6 },
  { id: 'phoenicia', name: 'Phoenicia', color: '#9C27B0', homeCenters: [], startingUnits: [], startingEco: 5 },
  { id: 'carthage', name: 'Carthage', color: '#FFEB3B', homeCenters: [], startingUnits: [], startingEco: 4 },
  { id: 'rome', name: 'Rome', color: '#F44336', homeCenters: [], startingUnits: [], startingEco: 2 },
];

function App() {
  const [gameState, setGameState] = useState<GameState>(() => createInitialState(POWERS));
  const [selectedPower, setSelectedPower] = useState<PowerId | null>(null);

  const handlePowerSelect = (powerId: PowerId) => {
    setSelectedPower(powerId);
    setGameState({ ...gameState, activePower: powerId });
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
