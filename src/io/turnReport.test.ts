import { describe, expect, it } from 'vitest';
import { buildTurnReport, turnReportFileName } from './turnReport';
import { makeState, unit } from '../engine/testHelpers';
import { applyResearch } from '../engine/research';

describe('turn report', () => {
  it('lists the turn, the supply centres, the research and the standing', () => {
    const state = applyResearch(
      makeState(
        [unit('athens', 'army', 'athens'), unit('athens', 'caravan', 'piraeus')],
        [],
        { athens: 4 }
      ),
      'athens',
      95,
      'economic'
    );

    const report = buildTurnReport(state);

    expect(report).toMatch(/MARE NOSTRUM - Turn 1 \(350 BC\)/);
    expect(report).toMatch(/SUPPLY CENTRES/);
    expect(report).toMatch(/Athens\s+Athens/);
    expect(report).toMatch(/RESEARCH/);
    expect(report).toMatch(/Athens: 95 \(economic\) -> \+3 point\(s\)/);
    expect(report).toMatch(/STANDING/);
    expect(report).toMatch(/A Athens, C Piraeus/);
  });

  it('names the file after the turn and the year', () => {
    const state = makeState([]);
    expect(turnReportFileName(state)).toBe('mare-nostrum-turn1-350bc-report.txt');
  });
});
