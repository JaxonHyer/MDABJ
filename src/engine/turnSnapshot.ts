import { GameState } from '../types/game';

/**
 * Build the state used for order entry or a safe re-adjudication.
 *
 * During a turn, the board may already show the first adjudication result. We
 * still need the original unit positions to review replacement orders and to
 * adjudicate again without moving units twice. After a turn advances, an old
 * snapshot must never be used for the new turn. Saves loaded after orders
 * were adjudicated have no in-memory start snapshot, so they cannot safely
 * be re-adjudicated.
 */
export function getAdjudicationState(
  currentState: GameState,
  turnStartSnapshot: GameState | null,
): GameState | null {
  const canEditCurrentOrders =
    currentState.phase === 'orders' ||
    currentState.phase === 'adjudication' ||
    currentState.phase === 'retreats';
  if (!canEditCurrentOrders) return null;

  const snapshot =
    turnStartSnapshot?.turn === currentState.turn
      ? turnStartSnapshot
      : currentState.phase === 'orders'
        ? currentState
        : null;

  if (!snapshot) return null;

  return {
    ...currentState,
    units: snapshot.units,
    orders: currentState.orders,
  };
}
