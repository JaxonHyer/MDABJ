import { useMemo, useState } from 'react';
import { GameState, Order, OrderType, Unit } from '../types/game';
import { validOrderTargets } from '../engine/orders';
import { parseOrderText, ParsedOrderTextLine, POWER_NAME } from '../engine/orderText';
import { UNIT_GLYPH, UNIT_LABEL } from '../types/game';

interface OrderPanelProps {
  gameState: GameState;
  canEditOrders: boolean;
  orderText: string;
  onOrderTextChange: (text: string) => void;
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
  canEditOrders,
  orderText,
  onOrderTextChange,
  selectedUnitId,
  orderType,
  onSelectUnit,
  onSelectOrderType,
  onOrdersChange,
  onAdjudicate,
}: OrderPanelProps) {
  const [reviewing, setReviewing] = useState(false);
  const [reviewedSignature, setReviewedSignature] = useState<string | null>(null);
  const [appliedMessage, setAppliedMessage] = useState<string | null>(null);

  const powerUnits = useMemo(
    () => gameState.units.filter((u) => u.power === gameState.activePower && !u.destroyed),
    [gameState.units, gameState.activePower]
  );

  const orderByUnit = useMemo(() => {
    const map = new Map<string, Order>();
    for (const order of gameState.orders) map.set(order.unitId, order);
    return map;
  }, [gameState.orders]);

  const parseResult = useMemo(
    () =>
      orderText.trim()
        ? parseOrderText(orderText, gameState, gameState.activePower)
        : null,
    [orderText, gameState, gameState.activePower]
  );
  const parseSignature = parseResult ? JSON.stringify(parseResult) : '';
  const parsedLines = parseResult?.entries.filter((entry) => !entry.isHeader) ?? [];
  const canReview = Boolean(
    canEditOrders && parseResult && parseResult.parsedCount > 0 && parseResult.errorCount === 0
  );
  const canApply =
    reviewing && canReview && Boolean(parseResult) && reviewedSignature === parseSignature;
  const hasPendingOrderText = Boolean(orderText.trim());

  const handleOrderTypeChange = (unitId: string, type: OrderType) => {
    if (!canEditOrders) return;
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
    if (!canEditOrders) return;
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
        return 'Hold';
      case 'move':
        return `Move → ${targetName ?? '?'}${order.viaConvoy ? ' (via convoy)' : ''}`;
      case 'support_hold':
        return `Support hold${targetName ? ` (${targetName})` : ''}`;
      case 'support_move':
        return `Support move → ${targetName ?? '?'}`;
      case 'transport':
        return `Convoy → ${targetName ?? '?'}`;
      case 'trade':
        return `Trade → ${targetName ?? '?'}`;
      default:
        return order.type;
    }
  };

  const applyParsedOrders = () => {
    if (!canEditOrders || !canApply || !parseResult) return;
    const nextByUnit = new Map(gameState.orders.map((order) => [order.unitId, order]));
    for (const order of parseResult.updates) nextByUnit.set(order.unitId, order);
    onOrdersChange([...nextByUnit.values()]);
    setAppliedMessage(
      `Applied ${parseResult.updates.length} order update${parseResult.updates.length === 1 ? '' : 's'}. Orders for units not listed were left unchanged.`
    );
    onOrderTextChange('');
    setReviewing(false);
    setReviewedSignature(null);
  };

  const hasLivingUnits = gameState.units.some((unit) => !unit.destroyed);
  const canAdjudicate = canEditOrders && hasLivingUnits && !hasPendingOrderText;

  return (
    <div className="order-panel">
      <h3>Orders</h3>

      <section className="order-text-entry" aria-labelledby="order-text-title">
        <h4 id="order-text-title">Paste order text</h4>
        <p className="hint">
          Paste a response as written. Case and extra spaces do not matter. Use one order per line,
          or separate orders with commas/semicolons. Select a power on the left to use it as the
          default, or label each power in the text.
        </p>
        <p className="order-text-example">
          <code>A Athens -&gt; Corinth</code>
          <code>F Rhodes hold</code>
          <code>A Corinth support A Athens</code>
        </p>
        {!canEditOrders && (
          <p className="hint danger-text" role="status">
            {gameState.phase === 'research'
              ? gameState.researchScoresTurn === gameState.turn
                ? 'Research is already scored. Return from the Research step to begin this turn’s orders.'
                : 'Research is pending. Apply the research batch and continue to Move before entering this turn’s orders.'
              : gameState.phase === 'builds'
                ? 'Order changes are locked after retreats and income have been resolved for this turn.'
                : 'This save has no turn-start snapshot, so order edits and re-adjudication are disabled to prevent moving units twice.'}
          </p>
        )}
        <textarea
          aria-label="Paste movement orders"
          rows={5}
          spellCheck={false}
          readOnly={reviewing || !canEditOrders}
          placeholder={'Athens:\nA Athens -> Corinth\nF Rhodes hold\n\nSparta:\nA Sparta hold'}
          value={orderText}
          onChange={(event) => {
            onOrderTextChange(event.target.value);
            setReviewing(false);
            setReviewedSignature(null);
            setAppliedMessage(null);
          }}
        />

        {orderText.trim() && (
          <div className="order-parse-preview" aria-live="polite">
            <div className={`order-parse-summary ${parseResult?.errorCount ? 'has-errors' : 'is-valid'}`}>
              {parseResult?.errorCount ? (
                <strong>
                  {parseResult.errorCount} issue{parseResult.errorCount === 1 ? '' : 's'} found —
                  fix them before applying.
                </strong>
              ) : parseResult?.parsedCount ? (
                <strong>{parseResult.parsedCount} order line{parseResult.parsedCount === 1 ? '' : 's'} parsed.</strong>
              ) : (
                <strong>No order lines found yet.</strong>
              )}
              {parseResult && parseResult.updates.length > parseResult.parsedCount && (
                <span>
                  {' '}
                  {parseResult.updates.length - parseResult.parsedCount} linked update
                  {parseResult.updates.length - parseResult.parsedCount === 1 ? '' : 's'} will also be applied.
                </span>
              )}
            </div>
            {parsedLines.length > 0 && (
              <ul className="order-parse-list">
                {parsedLines.map((entry, index) => (
                  <ParsedOrderPreview
                    key={`${entry.lineNumber}-${index}-${entry.source}`}
                    entry={entry}
                    gameState={gameState}
                    describeOrder={describeOrder}
                  />
                ))}
              </ul>
            )}
            {reviewing ? (
              <div className="order-review-actions">
                <p className="hint">
                  Review the parsed orders above. Applying replaces orders for the listed units only;
                  all other current orders stay in place.
                </p>
                {reviewedSignature !== null && reviewedSignature !== parseSignature && (
                  <p className="hint danger-text" role="alert">
                    The preview changed after review. Go back and review the current orders before applying.
                  </p>
                )}
                <div className="button-row">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setReviewing(false);
                      setReviewedSignature(null);
                    }}
                  >
                    Back to edit
                  </button>
                  <button className="primary-button" disabled={!canApply} onClick={applyParsedOrders}>
                    Apply reviewed orders
                  </button>
                </div>
              </div>
            ) : (
              <div className="order-text-actions">
                <button
                  className="primary-button"
                  disabled={!canReview}
                  onClick={() => {
                    setReviewedSignature(parseSignature);
                    setReviewing(true);
                  }}
                >
                  Review {parseResult?.parsedCount ?? 0} parsed order{parseResult?.parsedCount === 1 ? '' : 's'}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => {
                    onOrderTextChange('');
                    setAppliedMessage(null);
                  }}
                >
                  Discard pasted text
                </button>
              </div>
            )}
          </div>
        )}

        {appliedMessage && <p className="order-applied-message">{appliedMessage}</p>}
      </section>

      <details className="manual-order-editor">
        <summary>Enter or edit orders using the map</summary>
        {!gameState.activePower && <p className="hint">Select a power to use unit-by-unit entry.</p>}
        {gameState.activePower && powerUnits.length === 0 && (
          <p className="hint">No units for this power.</p>
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
              onClick={() => canEditOrders && onSelectUnit(isSelected ? null : unit.id)}
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
                    disabled={!canEditOrders}
                    value={currentType}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => handleOrderTypeChange(unit.id, event.target.value as OrderType)}
                  >
                    {ORDER_TYPES.map((orderTypeOption) => (
                      <option key={orderTypeOption.value} value={orderTypeOption.value}>
                        {orderTypeOption.label}
                      </option>
                    ))}
                  </select>

                  {currentType !== 'hold' && (
                    <select
                      disabled={!canEditOrders}
                      value={order?.target ?? ''}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => handleTargetChange(unit.id, event.target.value)}
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
                        disabled={!canEditOrders}
                        type="checkbox"
                        checked={order?.viaConvoy ?? false}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => {
                          const next: Order = { ...(order ?? { unitId: unit.id, type: 'move' }) };
                          next.viaConvoy = event.target.checked;
                          onOrdersChange([
                            ...gameState.orders.filter((current) => current.unitId !== unit.id),
                            next,
                          ]);
                        }}
                      />
                      Transport by fleet (convoy)
                    </label>
                  )}

                  <p className="hint">Pick a target on the map or in the list above.</p>
                </div>
              )}
            </div>
          );
        })}
      </details>

      {hasPendingOrderText && (
        <p className="hint danger-text">
          Pasted text is still a draft. Review and apply it, or discard it, before adjudicating; an
          un-applied paste is never used silently.
        </p>
      )}
      {hasLivingUnits && (
        <button className="primary-button" disabled={!canAdjudicate} onClick={onAdjudicate}>
          Adjudicate All Orders
        </button>
      )}
    </div>
  );
}

function ParsedOrderPreview({
  entry,
  gameState,
  describeOrder,
}: {
  entry: ParsedOrderTextLine;
  gameState: GameState;
  describeOrder: (order: Order | undefined) => string;
}) {
  const unit: Unit | undefined = entry.unitId
    ? gameState.units.find((candidate) => candidate.id === entry.unitId)
    : undefined;
  const territoryName = unit
    ? gameState.territories[unit.territoryId]?.name ?? unit.territoryId
    : null;

  return (
    <li className={`order-parse-line ${entry.error ? 'has-error' : 'is-valid'}`}>
      <div className="order-parse-source">
        <span>Line {entry.lineNumber}</span>
        <code>{entry.source}</code>
      </div>
      {entry.order && (
        <p className={`order-parse-result ${entry.error ? 'is-invalid' : ''}`}>
          {unit && <strong>{POWER_NAME[unit.power]} · {UNIT_GLYPH[unit.type]} {territoryName}: </strong>}
          {describeOrder(entry.order)}
        </p>
      )}
      {entry.error && <p className="order-parse-error" role="alert">{entry.error}</p>}
      {entry.note && <small className="order-parse-note">{entry.note}</small>}
    </li>
  );
}
