import { describe, expect, it } from 'vitest';
import { supportableUnit, upsertOrder, validOrderTargets } from './orders';
import { makeState, order, unit } from './testHelpers';

describe('validOrderTargets', () => {
  it('offers the neighbours of an army', () => {
    const army = unit('athens', 'army', 'athens');
    const state = makeState([army]);
    const targets = validOrderTargets(state, army, 'move');

    expect(targets).toContain('corinth');
    expect(targets).toContain('thessaly');
    expect(targets).not.toContain('aegean_sea');
  });

  it('never offers a province held by a friendly unit', () => {
    const army = unit('athens', 'army', 'athens');
    const friend = unit('athens', 'fleet', 'thessaly');
    const state = makeState([army, friend]);
    const targets = validOrderTargets(state, army, 'move');

    expect(targets).not.toContain('thessaly');
  });

  it('offers the trade route of a caravan', () => {
    const caravan = unit('athens', 'caravan', 'piraeus');
    const state = makeState([caravan]);
    const targets = validOrderTargets(state, caravan, 'trade');

    expect(targets).toEqual(expect.arrayContaining(['corinth', 'rhodes']));
    expect(targets).not.toContain('delphi');
  });

  it('offers the provinces a friendly unit moves into for a support', () => {
    const supporter = unit('athens', 'fleet', 'aegean_sea');
    const mover = unit('athens', 'army', 'athens');
    const state = makeState([supporter, mover], [order(mover.id, 'move', 'corinth')]);
    const targets = validOrderTargets(state, supporter, 'support_move');

    expect(targets).toContain('corinth');
  });
});

describe('supportableUnit', () => {
  it('finds the friendly unit that is ordered into the province', () => {
    const supporter = unit('athens', 'fleet', 'aegean_sea');
    const mover = unit('athens', 'army', 'athens');
    const state = makeState([supporter, mover], [order(mover.id, 'move', 'corinth')]);

    expect(supportableUnit(state, supporter, 'corinth', 'support_move')?.id).toBe(mover.id);
  });

  it('finds the friendly unit in a province for a support hold', () => {
    const supporter = unit('athens', 'army', 'corinth');
    const friend = unit('athens', 'fleet', 'athens');
    const state = makeState([supporter, friend]);

    expect(supportableUnit(state, supporter, 'athens', 'support_hold')?.id).toBe(friend.id);
  });

  it('does not support a unit in a province that is not adjacent', () => {
    const supporter = unit('athens', 'fleet', 'rhodes');
    const friend = unit('athens', 'army', 'macedon');
    const state = makeState([supporter, friend]);

    expect(supportableUnit(state, supporter, 'macedon', 'support_hold')).toBeUndefined();
  });
});

describe('upsertOrder', () => {
  it('replaces the order of a unit', () => {
    const orders = [order('u1', 'move', 'corinth'), order('u2', 'hold')];
    const next = upsertOrder(orders, order('u1', 'move', 'thessaly'));

    expect(next).toHaveLength(2);
    expect(next.find((o) => o.unitId === 'u1')?.target).toBe('thessaly');
  });
});
