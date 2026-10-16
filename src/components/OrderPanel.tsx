import { useState } from 'react';
import { GameState, Order, OrderType } from '../types/game';

interface OrderPanelProps {
  gameState: GameState;
  onOrdersChange: (orders: Order[]) => void;
  onAdjudicate: () => void;
}

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'hold', label: 'Hold' },
  { value: 'move', label: 'Move' },
  { value: 'support_hold', label: 'Support Hold' },
  { value: 'support_move', label: 'Support Move' },
  { value: 'transport', label: 'Transport' },
  { value: 'trade', label: 'Trade (Caravan)' },
];

export function OrderPanel({ gameState, onOrdersChange, onAdjudicate }: OrderPanelProps) {
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  
  const powerUnits = gameState.units.filter(
    u => u.power === gameState.activePower
  );

  const allUnits = gameState.units;

  const handleOrderTypeChange = (unitId: string, orderType: OrderType) => {
    const newOrders = gameState.orders.filter(o => o.unitId !== unitId);
    newOrders.push({ unitId, type: orderType });
    onOrdersChange(newOrders);
  };

  const handleTargetChange = (unitId: string, target: string) => {
    const newOrders = gameState.orders.map(o => 
      o.unitId === unitId ? { ...o, target } : o
    );
    onOrdersChange(newOrders);
  };

  // Get valid targets based on order type
  const getValidTargets = (unitId: string, orderType: OrderType): string[] => {
    const unit = allUnits.find(u => u.id === unitId);
    if (!unit) return [];
    const territory = gameState.territories[unit.territoryId];
    if (!territory) return [];

    switch (orderType) {
      case 'move':
        return territory.adjacent.filter(adjId => {
          const adj = gameState.territories[adjId];
          if (!adj) return false;
          // Armies can't move to sea zones (unless convoying)
          if (unit.type === 'army' && adj.type === 'sea') return false;
          // Fleets can only move to coastal or sea territories
          if (unit.type === 'fleet' && adj.type === 'land') return false;
          return true;
        });
      case 'trade':
        return territory.tradeRoutes || [];
      case 'support_hold':
      case 'support_move':
        return territory.adjacent;
      default:
        return [];
    }
  };

  return (
    <div className="order-panel">
      <h3>Orders</h3>
      {!gameState.activePower && (
        <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
          Select a power to enter orders
        </p>
      )}
      {gameState.activePower && powerUnits.length === 0 && (
        <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
          No units for this power
        </p>
      )}
      {powerUnits.map((unit) => {
        const order = gameState.orders.find(o => o.unitId === unit.id);
        const validTargets = order ? getValidTargets(unit.id, order.type) : [];
        const typeSymbol = unit.type === 'army' ? 'A' : unit.type === 'fleet' ? 'F' : 'C';
        const territory = gameState.territories[unit.territoryId];

        return (
          <div key={unit.id} style={{ 
            marginBottom: '0.75rem', 
            padding: '0.5rem', 
            background: '#2a2a2a', 
            borderRadius: '4px',
            border: selectedUnit === unit.id ? '1px solid #667eea' : '1px solid transparent'
          }}
          onClick={() => setSelectedUnit(unit.id === selectedUnit ? null : unit.id)}
          >
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              {typeSymbol}{unit.isElite ? '★' : ''} {territory?.name || unit.territoryId}
            </div>
            
            {selectedUnit === unit.id && (
              <div style={{ marginTop: '0.5rem' }}>
                <select
                  value={order?.type || ''}
                  onChange={(e) => handleOrderTypeChange(unit.id, e.target.value as OrderType)}
                  style={{ width: '100%', padding: '0.25rem', marginBottom: '0.25rem', background: '#3a3a3a', color: 'white', border: '1px solid #555', borderRadius: '3px' }}
                >
                  <option value="">-- Select Order --</option>
                  {ORDER_TYPES.map(ot => (
                    <option key={ot.value} value={ot.value}>{ot.label}</option>
                  ))}
                </select>

                {order && order.type !== 'hold' && order.type !== 'transport' && (
                  <select
                    value={order.target || ''}
                    onChange={(e) => handleTargetChange(unit.id, e.target.value)}
                    style={{ width: '100%', padding: '0.25rem', background: '#3a3a3a', color: 'white', border: '1px solid #555', borderRadius: '3px' }}
                  >
                    <option value="">-- Select Target --</option>
                    {validTargets.map(tId => {
                      const t = gameState.territories[tId];
                      return <option key={tId} value={tId}>{t?.name || tId}</option>;
                    })}
                  </select>
                )}
              </div>
            )}
            
            {!selectedUnit || selectedUnit !== unit.id ? (
              <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                {order ? `${order.type}${order.target ? ` → ${gameState.territories[order.target]?.name || order.target}` : ''}` : 'No order (click to edit)'}
              </div>
            ) : null}
          </div>
        );
      })}

      {gameState.activePower && powerUnits.length > 0 && (
        <button
          onClick={onAdjudicate}
          style={{
            width: '100%',
            padding: '0.75rem',
            marginTop: '1rem',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 600
          }}
        >
          Adjudicate All Orders
        </button>
      )}
    </div>
  );
}
