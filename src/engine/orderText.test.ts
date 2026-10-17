import { describe, expect, it } from 'vitest';
import { makeState, unit } from './testHelpers';
import { parseOrderText } from './orderText';

describe('parseOrderText', () => {
  it('ignores case and extra spaces and parses comma-separated orders', () => {
    const army = unit('athens', 'army', 'athens');
    const fleet = unit('athens', 'fleet', 'rhodes');
    const state = makeState([army, fleet]);

    const parsed = parseOrderText(
      '  a   ATHENS   ->   cOrInTh  ,   F   rhodes   HOLD  ',
      state,
      'athens',
    );

    expect(parsed.errorCount).toBe(0);
    expect(parsed.parsedCount).toBe(2);
    expect(parsed.updates).toEqual([
      { unitId: army.id, type: 'move', target: 'corinth' },
      { unitId: fleet.id, type: 'hold' },
    ]);
  });

  it('accepts power headings and prefixes when no default power is selected', () => {
    const athensArmy = unit('athens', 'army', 'athens');
    const romeArmy = unit('rome', 'army', 'rome');
    const state = makeState([athensArmy, romeArmy]);

    const parsed = parseOrderText(
      'Power: Athens\nA Athens hold\nRome: Army Rome to Ravenna',
      state,
      null,
    );

    expect(parsed.errorCount).toBe(0);
    expect(parsed.updates).toEqual([
      { unitId: athensArmy.id, type: 'hold' },
      { unitId: romeArmy.id, type: 'move', target: 'ravenna' },
    ]);
  });

  it('parses a support move even when the supported move is written later', () => {
    const supporter = unit('athens', 'army', 'delphi');
    const mover = unit('athens', 'army', 'athens');
    const state = makeState([supporter, mover]);

    const parsed = parseOrderText(
      'A Delphi S A Athens - Thessaly\nA Athens -> Thessaly',
      state,
      'athens',
    );

    expect(parsed.errorCount).toBe(0);
    expect(parsed.updates).toEqual([
      {
        unitId: supporter.id,
        type: 'support_move',
        target: 'thessaly',
        supportTarget: mover.id,
      },
      { unitId: mover.id, type: 'move', target: 'thessaly' },
    ]);
  });

  it('parses support-hold and resolves the supported friendly unit', () => {
    const supporter = unit('athens', 'army', 'corinth');
    const supported = unit('athens', 'army', 'athens');
    const parsed = parseOrderText(
      'Army Corinth supports Army Athens',
      makeState([supporter, supported]),
      'athens',
    );

    expect(parsed.errorCount).toBe(0);
    expect(parsed.updates[0]).toEqual({
      unitId: supporter.id,
      type: 'support_hold',
      target: 'athens',
      supportTarget: supported.id,
    });
  });

  it('normalizes caravan movement to a trade order', () => {
    const caravan = unit('athens', 'caravan', 'piraeus');
    const parsed = parseOrderText(
      'C Piraeus MOVE TO Corinth',
      makeState([caravan]),
      'athens',
    );

    expect(parsed.errorCount).toBe(0);
    expect(parsed.updates).toEqual([
      { unitId: caravan.id, type: 'trade', target: 'corinth' },
    ]);
  });

  it('links an explicit fleet convoy to the army move and previews the convoy flag', () => {
    const army = unit('athens', 'army', 'athens');
    const fleet = unit('athens', 'fleet', 'aegean_sea');
    const parsed = parseOrderText(
      'A Athens -> Rhodes\nF Aegean Sea convoy A Athens to Rhodes',
      makeState([army, fleet]),
      'athens',
    );

    expect(parsed.errorCount).toBe(0);
    expect(parsed.updates).toContainEqual({
      unitId: army.id,
      type: 'move',
      target: 'rhodes',
      viaConvoy: true,
    });
    expect(parsed.updates).toContainEqual({
      unitId: fleet.id,
      type: 'transport',
      target: 'rhodes',
      supportTarget: army.id,
    });
    expect(parsed.entries.find((entry) => entry.unitId === army.id)?.note).toMatch(/linked to the fleet convoy/i);
  });

  it('keeps malformed or illegal lines visible and blocks a partial import', () => {
    const army = unit('athens', 'army', 'athens');
    const parsed = parseOrderText(
      'A Athens -> Atlantis\nA Athens hold',
      makeState([army]),
      'athens',
    );

    expect(parsed.errorCount).toBe(1);
    expect(parsed.entries[0].error).toMatch(/destination territory/i);
    expect(parsed.entries[1].error).toBeUndefined();
  });

  it('rejects duplicate orders for the same unit instead of choosing one', () => {
    const army = unit('athens', 'army', 'athens');
    const parsed = parseOrderText(
      'A Athens hold\nA Athens -> Corinth',
      makeState([army]),
      'athens',
    );

    expect(parsed.errorCount).toBe(2);
    expect(parsed.entries.every((entry) => /duplicate order/i.test(entry.error ?? ''))).toBe(true);
  });

  it('requires a power when the text does not provide one', () => {
    const parsed = parseOrderText(
      'A Athens hold',
      makeState([unit('athens', 'army', 'athens')]),
      null,
    );

    expect(parsed.errorCount).toBe(1);
    expect(parsed.entries[0].error).toMatch(/select a power/i);
  });

  it('rejects a wrong unit type and an unknown explicit power', () => {
    const state = makeState([unit('athens', 'army', 'athens')]);
    const wrongType = parseOrderText('F Athens hold', state, 'athens');
    const wrongPower = parseOrderText('Power: Atlantis\nA Athens hold', state, null);

    expect(wrongType.entries[0].error).toMatch(/contains an army, not a fleet/i);
    expect(wrongPower.entries[0].error).toMatch(/unknown power/i);
  });
});
