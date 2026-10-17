import { GameState, PowerId } from '../types/game';
import { ALL_POWERS } from '../engine/economy';
import { occupiedCities, ownedSupplyCenters } from '../engine/gameState';
import { RESEARCH_TOPIC_LABEL } from '../types/game';
import { researchBonus } from '../engine/research';
import { collectStats } from './boardExport';

const POWER_NAME: Record<PowerId, string> = {
  athens: 'Athens',
  sparta: 'Sparta',
  macedon: 'Macedon',
  satrapies: 'Satrapies',
  persia: 'Persia',
  phoenicia: 'Phoenicia',
  carthage: 'Carthage',
  rome: 'Rome',
};

const UNIT_GLYPH: Record<string, string> = {
  army: 'A',
  fleet: 'F',
  caravan: 'C',
};

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

/**
 * A plain text report of the current turn. The game master can paste it into
 * Discord or a forum post for the players.
 */
export function buildTurnReport(state: GameState): string {
  const lines: string[] = [];
  const title = `MARE NOSTRUM - Turn ${state.turn} (${state.year} BC)`;

  lines.push(title);
  lines.push('='.repeat(title.length));
  lines.push('');

  // Adjudication ------------------------------------------------------------
  if (state.results.length > 0) {
    lines.push('ADJUDICATION');
    lines.push('-'.repeat(13));
    for (const result of state.results) {
      lines.push(`* ${result.message}`);
    }
    lines.push('');
  }

  // Supply centres ----------------------------------------------------------
  lines.push('SUPPLY CENTRES');
  lines.push('-'.repeat(14));
  for (const power of ALL_POWERS) {
    const centers = ownedSupplyCenters(state, power).map(
      (id) => state.territories[id]?.name ?? id
    );
    lines.push(`${pad(POWER_NAME[power], 12)} ${centers.length ? centers.join(', ') : '-'}`);
  }
  lines.push('');

  // Cities ------------------------------------------------------------------
  lines.push('CITIES');
  lines.push('-'.repeat(6));
  for (const power of ALL_POWERS) {
    const cities = occupiedCities(state, power).map(
      (id) => state.territories[id]?.name ?? id
    );
    if (cities.length === 0) continue;
    lines.push(`${pad(POWER_NAME[power], 12)} ${cities.join(', ')}`);
  }
  lines.push('');

  // Research ----------------------------------------------------------------
  const research = ALL_POWERS.filter((power) => state.researchScores[power]);
  lines.push('RESEARCH');
  lines.push('-'.repeat(8));
  if (research.length === 0) {
    lines.push('* no research was scored this turn');
  } else {
    for (const power of research) {
      const entry = state.researchScores[power];
      if (!entry) continue;
      const scoreLabel = entry.score >= 0 && entry.score <= 7
        ? `${entry.score}/7`
        : `${entry.score} (legacy 0-100)`;
      lines.push(
        `* ${POWER_NAME[power]}: ${scoreLabel} (${RESEARCH_TOPIC_LABEL[entry.topic].toLowerCase()}) ` +
          `-> +${researchBonus(entry.score)} point(s)`
      );
    }
  }
  lines.push('');

  // Income ------------------------------------------------------------------
  const income = state.lastIncome;
  if (income) {
    const earners = ALL_POWERS.filter((power) => (income[power] ?? 0) > 0);
    lines.push('INCOME');
    lines.push('-'.repeat(6));
    if (earners.length === 0) {
      lines.push('* no trade income this turn');
    } else {
      lines.push(
        '* ' +
          earners
            .map((power) => `${POWER_NAME[power]} +${income[power]}`)
            .join(', ')
      );
    }
    lines.push('');
  }

  // Units -------------------------------------------------------------------
  lines.push('UNITS');
  lines.push('-'.repeat(5));
  for (const power of ALL_POWERS) {
    const units = state.units.filter((u) => u.power === power && !u.destroyed);
    if (units.length === 0) continue;
    const list = units
      .map((unit) => {
        const name = state.territories[unit.territoryId]?.name ?? unit.territoryId;
        return `${UNIT_GLYPH[unit.type] ?? '?'}${unit.isElite ? '*' : ''} ${name}`;
      })
      .join(', ');
    lines.push(`${pad(POWER_NAME[power], 12)} ${list}`);
  }
  lines.push('');

  // Standing ----------------------------------------------------------------
  const stats = collectStats(state);
  lines.push('STANDING');
  lines.push('-'.repeat(8));
  const header = ['Power', 'Eco', 'Mil', 'Dip', 'Research', 'SC', 'City', 'Units', 'Wealth'];
  lines.push(header.map((cell, index) => pad(cell, index === 0 ? 12 : 9)).join(''));
  lines.push('-'.repeat(12 + 9 * 8));
  for (const stat of stats) {
    const cells = [
      POWER_NAME[stat.power],
      String(stat.eco),
      String(stat.military),
      String(stat.diplomatic),
      String(stat.researchScore),
      String(stat.supplyCenters),
      String(stat.cities),
      String(stat.units),
      String(stat.wealth),
    ];
    lines.push(cells.map((cell, index) => pad(cell, index === 0 ? 12 : 9)).join(''));
  }
  lines.push('');
  lines.push(
    'The game is won on the combined rank of supply centres, wealth and research score.'
  );

  return lines.join('\n');
}

/** The file name of the turn report. */
export function turnReportFileName(state: GameState): string {
  return `mare-nostrum-turn${state.turn}-${state.year}bc-report.txt`;
}
