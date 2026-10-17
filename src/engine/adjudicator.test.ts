import { describe, expect, it } from 'vitest';
import { adjudicate } from './adjudicator';
import { makeState, order, unit } from './testHelpers';

describe('adjudicator - movement', () => {
  it('moves a unit into an empty neighbouring province', () => {
    const army = unit('athens', 'army', 'athens');
    const state = makeState([army], [order(army.id, 'move', 'thessaly')]);
    const outcome = adjudicate(state);

    expect(outcome.units[0].territoryId).toBe('thessaly');
    expect(outcome.units[0].originTerritoryId).toBe('athens');
    expect(outcome.results[0].success).toBe(true);
  });

  it('treats an illegal move as a hold', () => {
    const army = unit('athens', 'army', 'athens');
    const state = makeState([army], [order(army.id, 'move', 'macedon')]);
    const outcome = adjudicate(state);

    expect(outcome.units[0].territoryId).toBe('athens');
    expect(outcome.results[0].success).toBe(false);
  });

  it('does not let an army enter a sea zone', () => {
    const army = unit('athens', 'army', 'athens');
    const state = makeState([army], [order(army.id, 'move', 'aegean_sea')]);
    const outcome = adjudicate(state);

    expect(outcome.units[0].territoryId).toBe('athens');
  });

  it('lets a fleet enter a coastal province', () => {
    const fleet = unit('athens', 'fleet', 'rhodes');
    const state = makeState([fleet], [order(fleet.id, 'move', 'aegean_sea')]);
    const outcome = adjudicate(state);

    expect(outcome.units[0].territoryId).toBe('aegean_sea');
  });

  it('bounces when the attacker and the defender have the same force', () => {
    const attacker = unit('athens', 'army', 'athens');
    const defender = unit('sparta', 'army', 'corinth');
    const state = makeState([attacker, defender], [order(attacker.id, 'move', 'corinth')]);
    const outcome = adjudicate(state);

    expect(outcome.units.find((u) => u.id === attacker.id)?.territoryId).toBe('athens');
    expect(outcome.units.find((u) => u.id === defender.id)?.territoryId).toBe('corinth');
    expect(outcome.results.find((r) => r.orderId === attacker.id)?.success).toBe(false);
  });

  it('dislodges the defender when the attack is stronger', () => {
    const attacker = unit('athens', 'army', 'athens', true);
    const defender = unit('sparta', 'army', 'corinth');
    const state = makeState([attacker, defender], [order(attacker.id, 'move', 'corinth')]);
    const outcome = adjudicate(state);

    expect(outcome.units.find((u) => u.id === attacker.id)?.territoryId).toBe('corinth');
    const dislodgedUnit = outcome.units.find((u) => u.id === defender.id);
    expect(dislodgedUnit?.mustRetreat).toBe(true);
    expect(dislodgedUnit?.attackedFrom).toBe('athens');
    expect(outcome.dislodged).toContain(defender.id);
  });
});

describe('adjudicator - support', () => {
  it('adds the support of a fleet to an army attack', () => {
    const attacker = unit('athens', 'army', 'athens');
    const supporter = unit('athens', 'fleet', 'aegean_sea');
    const defender = unit('sparta', 'army', 'corinth');
    const state = makeState(
      [attacker, supporter, defender],
      [
        order(attacker.id, 'move', 'corinth'),
        order(supporter.id, 'support_move', 'corinth'),
      ]
    );
    const outcome = adjudicate(state);

    expect(outcome.units.find((u) => u.id === defender.id)?.mustRetreat).toBe(true);
  });

  it('cuts the support when the supporter is attacked from another province', () => {
    // Athens attacks Corinth with support from the Aegean Sea fleet while
    // Sparta attacks the fleet - the support is cut, 1 vs 1 bounces.
    const attacker = unit('athens', 'army', 'athens');
    const supporter = unit('athens', 'fleet', 'aegean_sea');
    const defender = unit('sparta', 'army', 'corinth');
    const raider = unit('sparta', 'fleet', 'minoan_sea');
    const state = makeState(
      [attacker, supporter, defender, raider],
      [
        order(attacker.id, 'move', 'corinth'),
        order(supporter.id, 'support_move', 'corinth'),
        order(raider.id, 'move', 'aegean_sea'),
      ]
    );
    const outcome = adjudicate(state);

    expect(outcome.units.find((u) => u.id === defender.id)?.mustRetreat).toBeFalsy();
    expect(outcome.results.find((r) => r.orderId === supporter.id)?.message).toMatch(
      /Support cut/
    );
  });

  it('keeps the support when the supporter is attacked from the supported province', () => {
    const attacker = unit('athens', 'army', 'athens');
    const supporter = unit('athens', 'fleet', 'aegean_sea');
    const defender = unit('sparta', 'army', 'corinth');
    const raider = unit('sparta', 'army', 'delphi');
    const state = makeState(
      [attacker, supporter, defender, raider],
      [
        order(attacker.id, 'move', 'corinth'),
        order(supporter.id, 'support_move', 'corinth'),
        order(raider.id, 'move', 'aegean_sea'),
      ]
    );
    const outcome = adjudicate(state);

    // The raider cannot reach the fleet, the support stays effective.
    expect(outcome.units.find((u) => u.id === defender.id)?.mustRetreat).toBe(true);
  });
});

describe('adjudicator - elite units and fortifications', () => {
  it('gives an elite unit a force of two', () => {
    const elite = unit('sparta', 'army', 'sparta', true);
    const defender = unit('athens', 'army', 'epirus');
    const state = makeState([elite, defender], [order(elite.id, 'move', 'epirus')]);
    const outcome = adjudicate(state);

    expect(outcome.units.find((u) => u.id === defender.id)?.mustRetreat).toBe(true);
  });

  it('does not dislodge an elite unit with a single ordinary unit', () => {
    const elite = unit('sparta', 'army', 'corinth', true);
    const attacker = unit('athens', 'army', 'athens');
    const state = makeState([elite, attacker], [order(attacker.id, 'move', 'corinth')]);
    const outcome = adjudicate(state);

    expect(outcome.units.find((u) => u.id === elite.id)?.mustRetreat).toBeFalsy();
  });

  it('gives the defender of a fortified supply centre a bonus', () => {
    const attacker = unit('athens', 'army', 'athens');
    const defender = unit('sparta', 'army', 'corinth');
    const state = makeState([attacker, defender], [order(attacker.id, 'move', 'corinth')]);
    state.territories['corinth'] = { ...state.territories['corinth'], fortified: true };
    const outcome = adjudicate(state);

    // 1 (attack) vs 1 + 1 (fortified) - the attack bounces.
    expect(outcome.units.find((u) => u.id === defender.id)?.mustRetreat).toBeFalsy();
  });
});

describe('adjudicator - caravans and trade', () => {
  it('moves a caravan along a trade route', () => {
    const caravan = unit('athens', 'caravan', 'piraeus');
    const state = makeState([caravan], [order(caravan.id, 'trade', 'rhodes')]);
    const outcome = adjudicate(state);

    expect(outcome.units[0].territoryId).toBe('rhodes');
  });

  it('does not move a caravan off the trade network', () => {
    const caravan = unit('athens', 'caravan', 'piraeus');
    const state = makeState([caravan], [order(caravan.id, 'trade', 'delphi')]);
    const outcome = adjudicate(state);

    expect(outcome.units[0].territoryId).toBe('piraeus');
    expect(outcome.results[0].success).toBe(false);
  });
});

describe('adjudicator - convoys', () => {
  it('carries an army across a sea zone', () => {
    // The army on Crete is carried by the fleet in the Aegean Sea to
    // Byzantium - the fleet stays in the sea zone.
    const army = unit('athens', 'army', 'crete');
    const fleet = unit('athens', 'fleet', 'aegean_sea');
    const state = makeState(
      [army, fleet],
      [
        order(army.id, 'move', 'byzantium', { viaConvoy: true }),
        order(fleet.id, 'transport', 'byzantium', { supportTarget: army.id }),
      ]
    );
    const outcome = adjudicate(state);

    expect(outcome.units.find((u) => u.id === army.id)?.territoryId).toBe('byzantium');
    expect(outcome.units.find((u) => u.id === fleet.id)?.territoryId).toBe('aegean_sea');
  });

  it('fails when the convoying fleet is dislodged', () => {
    const army = unit('athens', 'army', 'crete');
    const fleet = unit('athens', 'fleet', 'aegean_sea');
    const raider = unit('sparta', 'fleet', 'minoan_sea', true);
    const state = makeState(
      [army, fleet, raider],
      [
        order(army.id, 'move', 'byzantium', { viaConvoy: true }),
        order(fleet.id, 'transport', 'byzantium', { supportTarget: army.id }),
        order(raider.id, 'move', 'aegean_sea'),
      ]
    );
    const outcome = adjudicate(state);

    expect(outcome.units.find((u) => u.id === army.id)?.territoryId).toBe('crete');
    expect(outcome.results.find((r) => r.orderId === army.id)?.message).toMatch(
      /Transport intercepted/
    );
  });

  it('lets one fleet carry only one army', () => {
    const army1 = unit('athens', 'army', 'crete');
    const army2 = unit('athens', 'army', 'rhodes');
    const fleet = unit('athens', 'fleet', 'aegean_sea');
    const state = makeState(
      [army1, army2, fleet],
      [
        order(army1.id, 'move', 'byzantium', { viaConvoy: true }),
        order(army2.id, 'move', 'miletus', { viaConvoy: true }),
      ]
    );
    const outcome = adjudicate(state);

    const moved = [army1, army2].filter(
      (a) => outcome.units.find((u) => u.id === a.id)?.territoryId !== a.territoryId
    );
    expect(moved).toHaveLength(1);
  });
});
