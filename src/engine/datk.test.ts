import { describe, expect, it } from 'vitest';
import { adjudicate } from './adjudicator';
import { validRetreatDestinations } from './gameState';
import { makeState, order, unit } from './testHelpers';

/**
 * Edge cases in the spirit of the DATC (Diplomacy Adjudicator Test Cases).
 * They are mapped onto the Mare Nostrum map:
 *
 *   Delphi - Athens - Thessaly - Epirus - Corinth - Sparta
 */
describe('DATC style edge cases', () => {
  it('6.D.15 - an attack from the province being supported into does not cut the support', () => {
    // A Athens supports A Delphi - Thessaly.
    // A Thessaly attacks Athens: the attack comes from the supported
    // province (Thessaly), so the support survives.
    const athens = unit('athens', 'army', 'athens');
    const delphi = unit('athens', 'army', 'delphi');
    const thessaly = unit('sparta', 'army', 'thessaly');

    const outcome = adjudicate(
      makeState(
        [athens, delphi, thessaly],
        [
          order(athens.id, 'support_move', 'thessaly', { supportTarget: delphi.id }),
          order(delphi.id, 'move', 'thessaly'),
          order(thessaly.id, 'move', 'athens'),
        ]
      )
    );

    const thessalyUnit = outcome.units.find((u) => u.id === thessaly.id);
    expect(thessalyUnit?.mustRetreat).toBe(true);
    expect(outcome.units.find((u) => u.id === delphi.id)?.territoryId).toBe('thessaly');
  });

  it('6.F.8 - an attack from another province cuts the support', () => {
    const athens = unit('athens', 'army', 'athens');
    const delphi = unit('athens', 'army', 'delphi');
    const thessaly = unit('sparta', 'army', 'thessaly');
    const corinth = unit('sparta', 'army', 'corinth');

    const outcome = adjudicate(
      makeState(
        [athens, delphi, thessaly, corinth],
        [
          order(athens.id, 'support_move', 'thessaly', { supportTarget: delphi.id }),
          order(delphi.id, 'move', 'thessaly'),
          order(corinth.id, 'move', 'athens'),
        ]
      )
    );

    // Without the support the attack bounces against the army in Thessaly.
    expect(outcome.units.find((u) => u.id === delphi.id)?.territoryId).toBe('delphi');
    expect(
      outcome.results.find((r) => r.orderId === athens.id)?.message
    ).toMatch(/Support cut/);
  });

  it('6.D.4 - a unit may not support a move into its own province', () => {
    const athens = unit('athens', 'army', 'athens');
    const delphi = unit('athens', 'army', 'delphi');

    const outcome = adjudicate(
      makeState(
        [athens, delphi],
        [
          order(athens.id, 'support_move', 'athens', { supportTarget: delphi.id }),
          order(delphi.id, 'move', 'athens'),
        ]
      )
    );

    // 1 vs 1 - the support of the unit in the destination is void.
    expect(outcome.units.find((u) => u.id === delphi.id)?.territoryId).toBe('delphi');
  });

  it('6.F.5 - the support of a dislodged unit is void', () => {
    const athens = unit('athens', 'army', 'athens');
    const delphi = unit('athens', 'army', 'delphi');
    const thessaly = unit('sparta', 'army', 'thessaly');
    const corinth = unit('sparta', 'army', 'corinth');
    const sparta = unit('sparta', 'army', 'sparta');

    const outcome = adjudicate(
      makeState(
        [athens, delphi, thessaly, corinth, sparta],
        [
          order(athens.id, 'support_move', 'thessaly', { supportTarget: delphi.id }),
          order(delphi.id, 'move', 'thessaly'),
          order(corinth.id, 'move', 'athens'),
          order(sparta.id, 'support_move', 'athens', { supportTarget: corinth.id }),
        ]
      )
    );

    // A Athens is dislodged, so its support is void and the attack bounces.
    expect(outcome.units.find((u) => u.id === athens.id)?.mustRetreat).toBe(true);
    expect(outcome.units.find((u) => u.id === delphi.id)?.territoryId).toBe('delphi');
  });

  it('6.D.7 - a unit may not move into a province held by a friendly unit', () => {
    const athens = unit('athens', 'army', 'athens');
    const delphi = unit('athens', 'army', 'delphi');

    const outcome = adjudicate(
      makeState([athens, delphi], [order(delphi.id, 'move', 'athens')])
    );

    expect(outcome.units.find((u) => u.id === delphi.id)?.territoryId).toBe('delphi');
    expect(
      outcome.results.find((r) => r.orderId === delphi.id)?.message
    ).toMatch(/friendly unit/);
  });

  it('6.E.4 - two units moving into the same province both bounce', () => {
    const delphi = unit('athens', 'army', 'delphi');
    const epirus = unit('sparta', 'army', 'epirus');

    const outcome = adjudicate(
      makeState([delphi, epirus], [order(delphi.id, 'move', 'thessaly'), order(epirus.id, 'move', 'thessaly')])
    );

    expect(outcome.units.find((u) => u.id === delphi.id)?.territoryId).toBe('delphi');
    expect(outcome.units.find((u) => u.id === epirus.id)?.territoryId).toBe('epirus');
  });

  it('6.F.3 - the support of an elite unit is cut, not reduced', () => {
    const athens = unit('athens', 'army', 'athens', true);
    const delphi = unit('athens', 'army', 'delphi');
    const thessaly = unit('sparta', 'army', 'thessaly');
    const corinth = unit('sparta', 'army', 'corinth');

    const outcome = adjudicate(
      makeState(
        [athens, delphi, thessaly, corinth],
        [
          order(athens.id, 'support_move', 'thessaly', { supportTarget: delphi.id }),
          order(delphi.id, 'move', 'thessaly'),
          order(corinth.id, 'move', 'athens'),
        ]
      )
    );

    // The elite support is cut completely: the attack bounces.
    expect(outcome.units.find((u) => u.id === delphi.id)?.territoryId).toBe('delphi');
  });

  it('6.D.1 - a support for a hold strengthens the province', () => {
    const thessaly = unit('athens', 'army', 'thessaly');
    const athens = unit('athens', 'army', 'athens');
    const epirus = unit('sparta', 'army', 'epirus');

    const outcome = adjudicate(
      makeState(
        [thessaly, athens, epirus],
        [
          order(athens.id, 'support_hold', 'thessaly', { supportTarget: thessaly.id }),
          order(epirus.id, 'move', 'thessaly'),
        ]
      )
    );

    // Defence 2 vs attack 1 - the attack bounces.
    expect(outcome.units.find((u) => u.id === epirus.id)?.territoryId).toBe('epirus');
  });
});

describe('DATC style edge cases - part two', () => {
  it('a power cannot cut the support of its own unit', () => {
    const athens = unit('athens', 'army', 'athens');
    const delphi = unit('athens', 'army', 'delphi');
    const thessaly = unit('sparta', 'army', 'thessaly');
    const corinth = unit('athens', 'army', 'corinth');

    const outcome = adjudicate(
      makeState(
        [athens, delphi, thessaly, corinth],
        [
          order(athens.id, 'support_move', 'thessaly', { supportTarget: delphi.id }),
          order(delphi.id, 'move', 'thessaly'),
          // A friendly attack may not cut the support.
          order(corinth.id, 'move', 'athens'),
        ]
      )
    );

    // The support is not cut and still counts: 2 against 1.
    expect(outcome.results.find((r) => r.orderId === athens.id)?.message).toMatch(/supports/);
    expect(outcome.units.find((u) => u.id === thessaly.id)?.mustRetreat).toBe(true);
  });

  it('a convoy fails when the convoying fleet is ordered to sail away', () => {
    const army = unit('athens', 'army', 'athens');
    const fleet = unit('athens', 'fleet', 'aegean_sea');

    const outcome = adjudicate(
      makeState(
        [army, fleet],
        [
          order(army.id, 'move', 'byzantium', { viaConvoy: true }),
          order(fleet.id, 'move', 'libyan_sea'),
        ]
      )
    );

    expect(outcome.units.find((u) => u.id === army.id)?.territoryId).toBe('athens');
    expect(
      outcome.results.find((r) => r.orderId === army.id)?.message
    ).toMatch(/No friendly fleet/);
  });
});

describe('DATC style edge cases - retreats', () => {
  it('7.F.6 - a dislodged unit may not retreat into the province of the attacker', () => {
    const corinth = unit('sparta', 'army', 'corinth');
    const state = makeState([corinth]);
    const dislodged = {
      ...state,
      units: [{ ...corinth, mustRetreat: true, attackedFrom: 'athens' }],
    };

    const destinations = validRetreatDestinations(dislodged, dislodged.units[0]);

    expect(destinations).not.toContain('athens');
    expect(destinations).toContain('epirus');
    expect(destinations).toContain('sparta');
  });

  it('a dislodged unit may not retreat into an occupied province', () => {
    const corinth = unit('sparta', 'army', 'corinth');
    const epirus = unit('sparta', 'army', 'epirus');
    const state = makeState([corinth, epirus]);
    const dislodged = {
      ...state,
      units: [
        { ...corinth, mustRetreat: true, attackedFrom: 'athens' },
        epirus,
      ],
    };

    expect(validRetreatDestinations(dislodged, dislodged.units[0])).not.toContain('epirus');
  });
});
