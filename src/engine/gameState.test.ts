import { describe, expect, it } from 'vitest';
import {
  advanceTurn,
  applyBuilds,
  collectIncome,
  applyRetreats,
  buildableHomeCenters,
  eliteUnitCount,
  militaryUnitCount,
  occupiedCities,
  freeSupplySlots,
  unitLimit,
  ownedSupplyCenters,
  pendingBuildCost,
  refreshSupplyCenters,
  setSupplyCenter,
  validRetreatDestinations,
  validateBuild,
} from './gameState';
import { applyIncome, calculateIncome } from './economy';
import { makeState, unit } from './testHelpers';
import { BuildAction } from '../types/game';

describe('retreats', () => {
  const dislodged = (territoryId: string, attackedFrom: string) => ({
    ...unit('sparta', 'army' as const, territoryId),
    mustRetreat: true,
    attackedFrom,
  });

  it('offers adjacent unoccupied provinces', () => {
    const state = makeState([dislodged('corinth', 'athens')]);
    const options = validRetreatDestinations(state, state.units[0]);

    expect(options).toContain('epirus');
    expect(options).toContain('sparta');
  });

  it('never offers the province the attack came from', () => {
    const state = makeState([dislodged('corinth', 'athens')]);
    const options = validRetreatDestinations(state, state.units[0]);

    expect(options).not.toContain('athens');
  });

  it('never offers an occupied province', () => {
    const state = makeState([
      dislodged('corinth', 'athens'),
      unit('macedon', 'army', 'epirus'),
    ]);
    const options = validRetreatDestinations(state, state.units[0]);

    expect(options).not.toContain('epirus');
  });

  it('does not let an army retreat into a sea zone', () => {
    const state = makeState([dislodged('corinth', 'athens')]);
    const options = validRetreatDestinations(state, state.units[0]);

    expect(options).not.toContain('aegean_sea');
  });

  it('destroys a unit without a valid retreat', () => {
    const state = makeState([dislodged('corinth', 'athens')]);
    const after = applyRetreats(state, {});

    expect(after.units[0].destroyed).toBe(true);
  });

  it('moves a unit to its retreat destination', () => {
    const state = makeState([dislodged('corinth', 'athens')]);
    const after = applyRetreats(state, { [state.units[0].id]: 'epirus' });

    expect(after.units[0].territoryId).toBe('epirus');
    expect(after.units[0].mustRetreat).toBe(false);
    expect(after.units[0].destroyed).toBeFalsy();
  });
});

describe('builds', () => {
  const action = (partial: Omit<BuildAction, 'id'>): BuildAction => ({
    id: 'a1',
    ...partial,
  });

  it('charges 6 eco for an army when no supply centre slot is free', () => {
    const state = makeState(
      [unit('athens', 'army', 'athens'), unit('athens', 'fleet', 'rhodes')],
      [],
      { athens: 6 }
    );
    const build = action({ power: 'athens', kind: 'army', territoryId: 'athens' });
    const validation = validateBuild(state, build, [build]);

    expect(validation.ok).toBe(true);
    expect(validation.cost).toBe(6);
  });

  it('builds an army for free when a supply centre slot is unused', () => {
    // Three supply centres but only two military units - the third one is
    // free, the caravan does not use up a supply centre.
    const state = makeState(
      [
        unit('athens', 'army', 'athens'),
        unit('athens', 'fleet', 'rhodes'),
        unit('athens', 'caravan', 'crete'),
      ],
      [],
      { athens: 0 }
    );
    const build = action({ power: 'athens', kind: 'army', territoryId: 'athens' });
    const validation = validateBuild(state, build, [build]);

    expect(validation.ok).toBe(true);
    expect(validation.cost).toBe(0);
  });

  it('rejects a fleet in a land supply centre', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 20 });
    const build = action({ power: 'athens', kind: 'fleet', territoryId: 'macedon' });
    const validation = validateBuild(state, build, [build]);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/coastal/);
  });

  it('rejects a build in a supply centre the power does not control', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 20 });
    const build = action({ power: 'athens', kind: 'army', territoryId: 'corinth' });
    const validation = validateBuild(state, build, [build]);

    expect(validation.ok).toBe(false);
  });

  it('allows a caravan on an occupied trade node', () => {
    const state = makeState(
      [unit('athens', 'army', 'athens'), unit('athens', 'caravan', 'piraeus')],
      [],
      { athens: 4 }
    );
    const build = action({ power: 'athens', kind: 'caravan', territoryId: 'piraeus' });
    const validation = validateBuild(state, build, [build]);

    expect(validation.ok).toBe(true);
    expect(validation.cost).toBe(4);
  });

  it('allows at most two elite units', () => {
    const state = makeState(
      [
        unit('athens', 'army', 'athens', true),
        unit('athens', 'fleet', 'rhodes', true),
        unit('athens', 'army', 'piraeus'),
      ],
      [],
      { athens: 20 }
    );
    expect(eliteUnitCount(state, 'athens')).toBe(2);

    const build = action({
      power: 'athens',
      kind: 'upgrade',
      unitId: state.units[2].id,
      territoryId: 'piraeus',
    });
    const validation = validateBuild(state, build, [build]);
    expect(validation.ok).toBe(false);
  });

  it('fortifies a supply centre for 3 eco', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 3 });
    const build = action({ power: 'athens', kind: 'fortify', territoryId: 'athens' });
    const validation = validateBuild(state, build, [build]);

    expect(validation.ok).toBe(true);
    expect(validation.cost).toBe(3);

    const applied = applyBuilds({ ...state, builds: [build] });
    expect(applied.territories['athens'].fortified).toBe(true);
  });

  it('rejects a build the power cannot pay for', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 1 });
    const build = action({ power: 'athens', kind: 'upgrade', unitId: state.units[0].id });
    const validation = validateBuild(state, build, [build]);

    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/Not enough economic points/);
  });

  it('disbands a unit', () => {
    const state = makeState([unit('athens', 'army', 'athens'), unit('athens', 'fleet', 'rhodes')]);
    const build = action({
      power: 'athens',
      kind: 'disband',
      unitId: state.units[1].id,
      territoryId: 'rhodes',
    });
    const applied = applyBuilds({ ...state, builds: [build] });

    expect(applied.units).toHaveLength(1);
  });

  it('sums the cost of all pending builds', () => {
    const state = makeState(
      [unit('athens', 'army', 'athens'), unit('athens', 'fleet', 'rhodes'), unit('athens', 'caravan', 'piraeus')],
      [],
      { athens: 20 }
    );
    const builds: BuildAction[] = [
      { id: 'b1', power: 'athens', kind: 'upgrade', unitId: state.units[0].id, territoryId: 'athens' },
      { id: 'b2', power: 'athens', kind: 'fortify', territoryId: 'athens' },
    ];

    expect(pendingBuildCost({ ...state, builds }, 'athens')).toBe(11);
  });
});

describe('supply centres and unit limits', () => {
  it('counts the supply centres a power holds at the end of the turn', () => {
    const state = makeState([
      unit('athens', 'army', 'athens'),
      unit('athens', 'fleet', 'rhodes'),
      unit('athens', 'caravan', 'piraeus'),
    ]);
    // Piraeus is a trade node, not a supply centre.
    expect(ownedSupplyCenters(state, 'athens')).toEqual(
      expect.arrayContaining(['athens', 'rhodes'])
    );
    expect(ownedSupplyCenters(state, 'athens')).not.toContain('piraeus');
  });

  it('lists the home supply centres a power may build in', () => {
    const state = makeState([unit('athens', 'army', 'athens'), unit('athens', 'fleet', 'rhodes')]);
    const centers = buildableHomeCenters(state, 'athens');

    expect(centers).toContain('athens');
    expect(centers).toContain('rhodes');
    expect(centers).not.toContain('corinth');
  });

  it('allows paid units in addition to sustaining capacity', () => {
    // A unit that was bought with economic points may be kept in addition
    // to the capacity provided by supply centres and occupied cities.
    const state = makeState(
      [
        unit('athens', 'army', 'athens'),
        unit('athens', 'fleet', 'rhodes'),
        { ...unit('athens', 'army', 'crete'), bought: true },
      ],
      [],
      { athens: 6 }
    );
    expect(militaryUnitCount(state, 'athens')).toBe(3);
    expect(unitLimit(state, 'athens')).toEqual({
      supplyCenters: 3,
      cities: 0,
      units: 3,
      bought: 1,
      max: 4,
    });
  });

  it('uses free city and supply-centre slots before charging for a pending build', () => {
    const state = makeState(
      [
        unit('athens', 'army', 'athens'),
        unit('athens', 'fleet', 'rhodes'),
        { ...unit('athens', 'army', 'crete'), bought: true },
      ],
      [],
      { athens: 6 }
    );
    const builds: BuildAction[] = [
      { id: 'b1', power: 'athens', kind: 'army', territoryId: 'athens' },
      { id: 'b2', power: 'athens', kind: 'army', territoryId: 'rhodes' },
    ];

    expect(freeSupplySlots(state, 'athens')).toBe(1);
    expect(validateBuild(state, builds[0], builds).cost).toBe(0);
    expect(validateBuild(state, builds[1], builds).cost).toBe(6);
    expect(pendingBuildCost({ ...state, builds }, 'athens')).toBe(6);
  });

  it('marks a unit that was paid for with economic points', () => {
    const state = makeState(
      [unit('athens', 'army', 'athens'), unit('athens', 'fleet', 'rhodes')],
      [],
      { athens: 6 }
    );
    const build: BuildAction = {
      id: 'b1',
      power: 'athens',
      kind: 'army',
      territoryId: 'athens',
    };
    const applied = applyBuilds({ ...state, builds: [build] });
    const newUnit = applied.units[applied.units.length - 1];

    expect(newUnit.type).toBe('army');
    expect(newUnit.bought).toBe(true);
  });

  it('refreshes the supply centre count of every power', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);
    const refreshed = refreshSupplyCenters(state);

    expect(refreshed.economy.athens.supplyCenters).toBe(1);
  });
});

describe('game master tools', () => {
  it('places a supply centre', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);
    const next = setSupplyCenter(state, 'delphi', true, 'athens');

    expect(next.territories.delphi.isSupplyCenter).toBe(true);
    expect(next.territories.delphi.homePower).toBe('athens');
  });

  it('removes a supply centre and its fortification', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);
    const fortified = {
      ...state,
      territories: {
        ...state.territories,
        delphi: { ...state.territories.delphi, isSupplyCenter: true, fortified: true },
      },
    };
    const next = setSupplyCenter(fortified, 'delphi', false);

    expect(next.territories.delphi.isSupplyCenter).toBe(false);
    expect(next.territories.delphi.fortified).toBe(false);
  });

  it('takes the fortification away when a supply centre changes hands', () => {
    const state = makeState([
      unit('athens', 'army', 'corinth'),
      unit('sparta', 'army', 'sparta'),
    ]);
    const fortified = {
      ...state,
      territories: {
        ...state.territories,
        corinth: { ...state.territories.corinth, fortified: true },
      },
      scOwners: { corinth: 'sparta' as const },
    };
    const next = refreshSupplyCenters(fortified);

    expect(next.territories.corinth.fortified).toBe(false);
    expect(next.scOwners.corinth).toBe('athens');
  });
});

describe('turn flow', () => {
  it('starts the next turn and counts the year down', () => {
    const state = makeState([]);
    const next = advanceTurn(state);

    expect(next.turn).toBe(2);
    expect(next.year).toBe(335);
    // Every turn starts with the research phase (rules 4.1).
    expect(next.phase).toBe('research');
    expect(next.orders).toHaveLength(0);
  });
});

describe('economy', () => {
  it('gives a caravan the full value of its trade node', () => {
    const state = makeState([unit('athens', 'caravan', 'jerusalem')]);
    const income = calculateIncome(state, state.units);

    expect(income.athens).toBe(2);
  });

  it('gives a military unit half of the node value', () => {
    const state = makeState([unit('athens', 'army', 'jerusalem')]);
    const income = calculateIncome(state, state.units);

    expect(income.athens).toBe(1);
  });

  it('gives nothing to a caravan that is in transit', () => {
    const state = makeState([unit('athens', 'caravan', 'jerusalem')]);
    const income = calculateIncome(state, state.units, new Set([state.units[0].id]));

    expect(income.athens).toBe(0);
  });

  it('gives nothing to a blockaded caravan', () => {
    const state = makeState([
      unit('athens', 'caravan', 'jerusalem'),
      unit('sparta', 'army', 'jerusalem'),
    ]);
    const income = calculateIncome(state, state.units);

    expect(income.athens).toBe(0);
  });

  it('applies the banking cap of 15 eco', () => {
    const state = makeState([unit('athens', 'caravan', 'jerusalem')], [], { athens: 14 });
    const income = calculateIncome(state, state.units);
    const next = applyIncome(state, income);

    expect(next.economy.athens.eco).toBe(15);
  });

  it('collects the income once per turn', () => {
    const state = makeState([unit('athens', 'caravan', 'jerusalem')], [], { athens: 4 });
    const income = calculateIncome(state, state.units);
    const afterIncome = applyIncome(state, income);
    const next = advanceTurn(afterIncome);

    // 4 eco + 2 for Jerusalem, and the income is not counted a second time.
    expect(next.economy.athens.eco).toBe(6);
    expect(next.economy.athens.wealth).toBe(2);
  });
});

describe('income', () => {
  it('adds the trade income to the ledger exactly once', () => {
    const state = makeState([unit('athens', 'caravan', 'piraeus')], [], { athens: 4 });

    const first = collectIncome(state);
    expect(first.economy.athens.eco).toBe(5);
    expect(first.economy.athens.wealth).toBe(1);
    expect(first.lastIncome?.athens).toBe(1);

    // Walking back and forth between the steps must not pay twice.
    const second = collectIncome(first);
    expect(second.economy.athens.eco).toBe(5);
    expect(second.economy.athens.wealth).toBe(1);
  });

  it('gives a military unit on a trade node half of the value', () => {
    const state = makeState([unit('athens', 'army', 'jerusalem')], [], { athens: 4 });
    const next = collectIncome(state);

    expect(next.economy.athens.eco).toBe(5);
  });

  it('counts the supply centres of the power', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 4 });
    const next = collectIncome(state);

    expect(next.economy.athens.supplyCenters).toBe(1);
  });
});

describe('builds', () => {
  it('charges eco points for every military unit beyond the free sustaining slots', () => {
    // Athens controls two supply centres (Athens and Crete) but only one
    // military unit, so one new army is free and the second one costs 6.
    const army = unit('athens', 'army', 'athens');
    const caravan = unit('athens', 'caravan', 'crete');
    const state = makeState([army, caravan], [], { athens: 12 });
    state.builds = [
      { id: 'b1', power: 'athens', kind: 'army', territoryId: 'athens' },
      { id: 'b2', power: 'athens', kind: 'army', territoryId: 'athens' },
    ];

    const next = applyBuilds(state);

    // The first army uses the free slot, the second one costs 6 eco.
    expect(next.economy.athens.eco).toBe(6);
    expect(next.units.filter((u) => u.power === 'athens' && u.type === 'army')).toHaveLength(3);
    // Only the paid unit is allowed to stay without a supply centre.
    expect(next.units.filter((u) => u.power === 'athens' && u.bought)).toHaveLength(1);
  });

  it('disbands a unit and frees the slot again', () => {
    const army = unit('athens', 'army', 'athens');
    const state = makeState([army], [], { athens: 6 });
    state.builds = [{ id: 'd1', power: 'athens', kind: 'disband', unitId: army.id }];

    const next = applyBuilds(state);

    expect(next.units.filter((u) => u.power === 'athens')).toHaveLength(0);
    expect(next.economy.athens.eco).toBe(6);
  });
});

describe('cities', () => {
  it('knows which cities a power occupies', () => {
    const state = makeState([unit('athens', 'army', 'delphi')]);

    expect(occupiedCities(state, 'athens')).toEqual(['delphi']);
    expect(occupiedCities(state, 'sparta')).toEqual([]);
  });

  it('lets a city sustain a unit', () => {
    // One supply centre and one city sustain two military units.
    const state = makeState([
      unit('athens', 'army', 'athens'),
      unit('athens', 'army', 'delphi'),
    ]);

    const limit = unitLimit(state, 'athens');
    expect(limit.supplyCenters).toBe(1);
    expect(limit.cities).toBe(1);
    expect(limit.units).toBe(2);
    expect(limit.max).toBe(2);
  });

  it('does not let a city sustain more than one unit', () => {
    // Athens holds one supply centre and one city, the third army stands in
    // a plain province and has to be paid for.
    const state = makeState([
      unit('athens', 'army', 'athens'),
      unit('athens', 'army', 'delphi'),
      unit('athens', 'army', 'piraeus'),
    ]);

    expect(unitLimit(state, 'athens').max).toBe(2);
  });

  it('never allows a unit to be built in a city', () => {
    const state = makeState([unit('athens', 'army', 'athens')], [], { athens: 6 });
    const action: BuildAction = {
      id: 'b1',
      power: 'athens',
      kind: 'army',
      territoryId: 'delphi',
    };

    const validation = validateBuild(state, action, [action]);
    expect(validation.ok).toBe(false);
    expect(validation.errors.join(' ')).toContain('city');
  });

  it('allows an eco-paid unit to remain while later builds use newly available capacity', () => {
    const state = makeState(
      [
        unit('athens', 'army', 'athens'),
        unit('athens', 'fleet', 'rhodes'),
        { ...unit('athens', 'army', 'crete'), bought: true },
      ],
      [],
      { athens: 12 }
    );
    const builds: BuildAction[] = [
      { id: 'b1', power: 'athens', kind: 'army', territoryId: 'athens' },
      { id: 'b2', power: 'athens', kind: 'army', territoryId: 'rhodes' },
    ];

    const applied = applyBuilds({ ...state, builds });
    expect(applied.economy.athens.eco).toBe(6);
    expect(unitLimit(applied, 'athens')).toMatchObject({
      supplyCenters: 3,
      units: 5,
      bought: 2,
      max: 5,
    });
  });

  it('counts an occupied city as a free slot for a unit that is built', () => {
    // The city is held by a caravan, so it sustains the army that is built.
    const state = makeState(
      [unit('athens', 'army', 'athens'), unit('athens', 'caravan', 'delphi')],
      [],
      { athens: 6 }
    );
    const action: BuildAction = {
      id: 'b1',
      power: 'athens',
      kind: 'army',
      territoryId: 'athens',
    };

    expect(validateBuild(state, action, [action]).cost).toBe(0);
    expect(freeSupplySlots(state, 'athens')).toBe(1);
  });
});
