import { useMemo } from 'react';
import { GameState, Order, OrderType } from '../types/game';
import { validOrderTargets } from '../engine/orders';
import { UNIT_GLYPH, UNIT_LABEL } from '../types/game';

interface OrderPanelProps {
  gameState: GameState;
  selectedUnitId: string | null;
  orderType: OrderType;
  onSelectUnit: (unitId: string | null) => void;
  onSelectOrderType: (type: OrderType) => void;
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

export function OrderPanel({
  gameState,
  selectedUnitId,
  orderType,
  onSelectUnit,
  onSelectOrderType,
  onOrdersChange,
  onAdjudicate,
}: OrderPanelProps) {
  const powerUnits = useMemo(
    () => gameState.units.filter((u) => u.power === gameState.activePower && !u.destroyed),
    [gameState.units, gameState.activePower]
  );

  const orderByUnit = useMemo(() => {
    const map = new Map<string, Order>();
    for (const order of gameState.orders) map.set(order.unitId, order);
    return map;
  }, [gameState.orders]);

  const handleOrderTypeChange = (unitId: string, type: OrderType) => {
    const order = orderByUnit.get(unitId);
    const next: Order = { unitId, type };
    if (type === 'support_hold' || type === 'support_move' || type === 'transport') {
      // The province that is supported has to be picked again.
      if (order?.supportTarget) next.supportTarget = order.supportTarget;
    } else if (type === 'move' || type === 'trade') {
      if (order?.target) next.target = order.target;
      if (order?.viaConvoy) next.viaConvoy = true;
    }
    onOrdersChange([...gameState.orders.filter((o) => o.unitId !== unitId), next]);
    onSelectUnit(unitId);
    onSelectOrderType(type);
  };

  const handleTargetChange = (unitId: string, target: string) => {
    const order = orderByUnit.get(unitId);
    if (!order) return;
    const next = { ...order, target };
    // The supported unit has to be picked again for the new province.
    if (order.type === 'support_hold' || order.type === 'support_move') {
      delete next.supportTarget;
    }
    onOrdersChange([...gameState.orders.filter((o) => o.unitId !== unitId), next]);
  };

  const describeOrder = (order: Order | undefined): string => {
    if (!order) return 'No order (click to edit)';
    const targetName = order.target
      ? gameState.territories[order.target]?.name ?? order.target
      : null;
    switch (order.type) {
      case 'hold':
        return 'Holding';
      case 'move':
        return `Move → ${targetName ?? '?'}`;
      case 'support_hold':
        return `Support hold${targetName ? ` (${targetName})` : ''}`;
      case 'support_move':
        return `Support move → ${targetName ?? '?'}`;
      case 'transport':
        return `Transport → ${targetName ?? '?'}`;
      case 'trade':
        return `Trade → ${targetName ?? '?'}`;
      default:
        return order.type;
    }
  };

  const canAdjudicate = gameState.activePower !== null && powerUnits.length > 0;

  return (
    <div className="order-panel">
      <h3>Orders</h3>
      {!gameState.activePower && (
        <p className="hint">Select a power to enter orders</p>
      )}
      {gameState.activePower && powerUnits.length === 0 && (
        <p className="hint">No units for this power</p>
      )}

      {powerUnits.map((unit) => {
        const order = orderByUnit.get(unit.id);
        const currentType = order?.type ?? orderType;
        const isSelected = selectedUnitId === unit.id;
        const targets = isSelected ? validOrderTargets(gameState, unit, currentType) : [];
        const territory = gameState.territories[unit.territoryId];

        return (
          <div
            key={unit.id}
            className={`unit-order ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelectUnit(isSelected ? null : unit.id)}
          >
            <div className="unit-order-head">
              <span className="unit-badge" data-power={unit.power}>
                {UNIT_GLYPH[unit.type]}
                {unit.isElite ? '★' : ''}
              </span>
              <span className="unit-order-name">
                {territory?.name ?? unit.territoryId}
                <small>{UNIT_LABEL[unit.type]}</small>
              </span>
              <span className={`order-state ${order ? 'has-order' : ''}`}>
                {describeOrder(order)}
              </span>
            </div>

            {isSelected && (
              <div className="unit-order-body">
                <select
                  value={currentType}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => handleOrderTypeChange(unit.id, e.target.value as OrderType)}
                >
                  {ORDER_TYPES.map((ot) => (
                    <option key={ot.value} value={ot.value}>
                      {ot.label}
                    </option>
                  ))}
                </select>

                {currentType !== 'hold' && (
                  <select
                    value={order?.target ?? ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => handleTargetChange(unit.id, e.target.value)}
                  >
                    <option value="">-- Select Target --</option>
                    {targets.map((id) => (
                      <option key={id} value={id}>
                        {gameState.territories[id]?.name ?? id}
                      </option>
                    ))}
                  </select>
                )}

                {unit.type === 'army' && currentType === 'move' && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={order?.viaConvoy ?? false}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const next: Order = { ...(order ?? { unitId: unit.id, type: 'move' }) };
                        next.viaConvoy = e.target.checked;
                        onOrdersChange([
                          ...gameState.orders.filter((o) => o.unitId !== unit.id),
                          next,
                        ]);
                      }}
                    />
                    Transport by fleet (convoy)
                  </label>
                )}

                <p className="hint">
                  Pick a target on the map or in the list above.
                </p>
              </div>
            )}
          </div>
        );
      })}

      {canAdjudicate && (
        <button className="primary-button" onClick={onAdjudicate}>
          Adjudicate All Orders
        </button>
      )}
    </div>
  );
}
