import { GameState, Order } from '../types/game';

interface OrderPanelProps {
  gameState: GameState;
  onOrdersChange: (orders: Order[]) => void;
}

export function OrderPanel({ gameState }: OrderPanelProps) {
  const powerUnits = gameState.units.filter(
    u => u.power === gameState.activePower
  );

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
          No units for this power (map data not loaded yet)
        </p>
      )}
      {powerUnits.map((unit) => {
        const order = gameState.orders.find(o => o.unitId === unit.id);
        return (
          <div key={unit.id} style={{ marginBottom: '0.75rem', padding: '0.5rem', background: '#2a2a2a', borderRadius: '4px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
              {unit.type.toUpperCase()} {unit.isElite ? '★' : ''} in {unit.territoryId}
            </div>
            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
              {order ? `${order.type}${order.target ? ` → ${order.target}` : ''}` : 'No order'}
            </div>
          </div>
        );
      })}
    </div>
  );
}
