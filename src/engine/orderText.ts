// Tolerant text import for the game master's movement orders.
//
// Accepted basics (case and repeated whitespace are ignored):
//   A Athens -> Corinth
//   Army Athens hold
//   A Corinth support A Athens
//   A Delphi support A Athens to Thessaly
//   F Aegean Sea convoy A Athens to Rhodes
//   C Piraeus trade Corinth
//
// Orders can be separated by lines, commas, or semicolons. A selected power is
// used when a line has no power label; otherwise use a heading such as
// "Athens:" or prefix a line with "Athens:" / "Power: Athens".

import { GameState, Order, PowerId, TerritoryType, Unit, UnitType } from '../types/game';
import { ALL_POWERS } from './economy';

export const POWER_NAME: Record<PowerId, string> = {
  athens: 'Athens',
  sparta: 'Sparta',
  macedon: 'Macedon',
  satrapies: 'Satrapies',
  persia: 'Persia',
  phoenicia: 'Phoenicia',
  carthage: 'Carthage',
  rome: 'Rome',
};

export interface ParsedOrderTextLine {
  lineNumber: number;
  source: string;
  power?: PowerId;
  unitId?: string;
  order?: Order;
  error?: string;
  note?: string;
  isHeader?: boolean;
}

export interface OrderTextParseResult {
  entries: ParsedOrderTextLine[];
  /** Orders to upsert after the GM reviews the complete preview. */
  updates: Order[];
  errorCount: number;
  parsedCount: number;
}

interface Candidate {
  entry: ParsedOrderTextLine;
  unit: Unit;
  order: Order;
  referencedUnit?: Unit;
}

interface TerritoryMatch {
  id: string;
  rest: string;
}

interface UnitTypeMatch {
  type?: UnitType;
  rest: string;
}

interface UnitReference {
  unit: Unit;
  rest: string;
}

interface ParsedAction {
  candidate?: Candidate;
  error?: string;
}

const UNIT_TYPE_WORDS: Record<string, UnitType> = {
  a: 'army',
  army: 'army',
  armies: 'army',
  f: 'fleet',
  fleet: 'fleet',
  fleets: 'fleet',
  c: 'caravan',
  caravan: 'caravan',
  caravans: 'caravan',
};

function normalizeInput(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[–—−]/g, '-')
    .replace(/→/g, ' -> ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeName(value: string): string {
  return normalizeInput(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripLeadingPunctuation(value: string): string {
  const text = value.trim();
  // Keep the move arrow intact, but accept common form-style separators like
  // "A Athens - moves to Corinth" and "F Rhodes - hold".
  if (text.startsWith('->')) return text;
  return text.replace(/^[\s,;:.()[\]]+/, '').replace(/^-+\s*/, '').trim();
}

function stripTrailingPunctuation(value: string): string {
  return value.replace(/[.!?]+$/, '').trim();
}

function stripOrderLabel(value: string): string {
  return value
    .replace(/^(?:your\s+)?(?:movement\s+)?orders?\s*:\s*/i, '')
    .replace(/^(?:order\s+text|move\s+order)\s*:\s*/i, '')
    .trim();
}

function splitOrderText(value: string): { source: string; lineNumber: number }[] {
  const result: { source: string; lineNumber: number }[] = [];
  const lines = value.replace(/\r\n?/g, '\n').split('\n');

  lines.forEach((line, index) => {
    // A comma before "via convoy" is part of the same order, not a separator.
    const withoutConvoyComma = line.replace(/,\s*((?:via|by)\s+convoy(?:ed)?\b)/gi, ' $1');
    for (const semicolonPart of withoutConvoyComma.split(/[;|]+/)) {
      for (const commaPart of semicolonPart.split(',')) {
        const source = commaPart.trim();
        if (source) result.push({ source, lineNumber: index + 1 });
      }
    }
  });

  return result;
}

function resolvePower(value: string): PowerId | undefined {
  const normalized = normalizeName(value);
  return ALL_POWERS.find(
    (power) => normalized === normalizeName(power) || normalized === normalizeName(POWER_NAME[power])
  );
}

function matchPowerAtStart(value: string): { power: PowerId; rest: string } | undefined {
  const text = normalizeInput(value);
  const powers = [...ALL_POWERS].sort(
    (left, right) => POWER_NAME[right].length - POWER_NAME[left].length
  );

  for (const power of powers) {
    for (const alias of [POWER_NAME[power], power]) {
      const name = normalizeInput(alias);
      if (text !== name && !text.startsWith(`${name} `) && !text.startsWith(`${name}:`)) continue;
      return {
        power,
        rest: stripLeadingPunctuation(text.slice(name.length)),
      };
    }
  }

  return undefined;
}

function extractPowerPrefix(value: string): {
  power?: PowerId;
  rest: string;
  isHeader?: boolean;
  error?: string;
} | undefined {
  let text = normalizeInput(value);
  const bracketed = text.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (bracketed) {
    const power = resolvePower(bracketed[1]);
    if (!power) return { rest: '', error: `Unknown power "${bracketed[1]}".` };
    return { power, rest: stripOrderLabel(bracketed[2]), isHeader: !bracketed[2].trim() };
  }

  if (/^power\s*:/i.test(text)) {
    const valueAfterLabel = text.replace(/^power\s*:\s*/i, '');
    const matched = matchPowerAtStart(valueAfterLabel);
    if (!matched) {
      const entered = valueAfterLabel.split(/\s+/)[0] ?? '';
      return {
        rest: '',
        error: `Unknown power "${entered}". Use one of the listed powers (Athens, Sparta, Macedon, Satrapies, Persia, Phoenicia, Carthage, or Rome).`,
      };
    }
    const rest = stripOrderLabel(matched.rest);
    return { power: matched.power, rest, isHeader: !rest };
  }

  const colon = text.indexOf(':');
  if (colon >= 0) {
    const left = text.slice(0, colon).trim();
    const right = text.slice(colon + 1).trim();
    const label = left
      .replace(/^orders?\s+for\s+/, '')
      .replace(/\s+(?:power|orders?)$/, '')
      .trim();
    const power = resolvePower(label);
    if (power) {
      const rest = stripOrderLabel(right);
      return { power, rest, isHeader: !rest };
    }
  }

  const headerLabel = text.replace(/\s+(?:power|orders?)$/, '').trim();
  const headerPower = resolvePower(headerLabel);
  if (headerPower) return { power: headerPower, rest: '', isHeader: true };

  const orderForMatch = text.match(/^orders?\s+for\s+([^:]+?)(?::\s*(.*))?$/i);
  if (orderForMatch) {
    const power = resolvePower(orderForMatch[1]);
    if (!power) {
      return { rest: '', error: `Unknown power "${orderForMatch[1]}".` };
    }
    const rest = stripOrderLabel(orderForMatch[2] ?? '');
    return { power, rest, isHeader: !rest };
  }

  // Allow a power name at the start of an order line (for combined form
  // responses such as "Athens A Athens -> Corinth"). Avoid treating a
  // territory name alone as a power prefix.
  const matched = matchPowerAtStart(text);
  if (matched && matched.rest && startsWithUnitType(matched.rest)) {
    return { power: matched.power, rest: stripOrderLabel(matched.rest) };
  }

  return undefined;
}

function startsWithUnitType(value: string): boolean {
  return /^(?:a|army|armies|f|fleet|fleets|c|caravan|caravans)\b/i.test(value);
}

function takeUnitType(value: string): UnitTypeMatch {
  const text = stripLeadingPunctuation(normalizeInput(value));
  const match = text.match(/^([a-z]+)\b\s*/i);
  if (!match) return { rest: text };
  const type = UNIT_TYPE_WORDS[match[1].toLowerCase()];
  return type ? { type, rest: text.slice(match[0].length).trim() } : { rest: text };
}

function matchTerritoryAtStart(value: string, state: GameState): TerritoryMatch | undefined {
  const text = stripLeadingPunctuation(normalizeInput(value));
  const territories = Object.values(state.territories)
    .map((territory) => ({
      id: territory.id,
      names: [...new Set([territory.name, territory.id.replace(/_/g, ' ')])]
        .map(normalizeName)
        .filter(Boolean),
    }))
    .sort((left, right) => {
      const maxLeft = Math.max(...left.names.map((name) => name.length));
      const maxRight = Math.max(...right.names.map((name) => name.length));
      return maxRight - maxLeft;
    });

  for (const territory of territories) {
    for (const name of territory.names) {
      if (!text.startsWith(name)) continue;
      const next = text[name.length];
      if (next && !/[\s,.;:!?()[\]{}-]/.test(next)) continue;
      return { id: territory.id, rest: text.slice(name.length).trim() };
    }
  }

  return undefined;
}

function parseUnitReference(
  value: string,
  state: GameState,
  power: PowerId
): { result?: UnitReference; error?: string } {
  const typeMatch = takeUnitType(value);
  const rest = typeMatch.rest.replace(/^(?:at|in|the)\s+/i, '').trim();
  const territoryMatch = matchTerritoryAtStart(rest, state);
  if (!territoryMatch) {
    return { error: 'Could not recognize the unit’s starting territory. Use its exact map name.' };
  }

  const territory = state.territories[territoryMatch.id];
  const units = state.units.filter(
    (unit) =>
      unit.power === power &&
      unit.territoryId === territoryMatch.id &&
      !unit.destroyed &&
      !unit.mustRetreat
  );
  if (units.length === 0) {
    return {
      error: `No ${POWER_NAME[power]} unit is in ${territory?.name ?? territoryMatch.id}. Check the power and starting territory.`,
    };
  }
  if (units.length > 1) {
    return {
      error: `More than one ${POWER_NAME[power]} unit is in ${territory?.name ?? territoryMatch.id}; specify or resolve the unit before importing.`,
    };
  }

  const unit = units[0];
  if (typeMatch.type && typeMatch.type !== unit.type) {
    const actualArticle = unit.type === 'army' ? 'an' : 'a';
    const requestedArticle = typeMatch.type === 'army' ? 'an' : 'a';
    return {
      error: `${territory?.name ?? territoryMatch.id} contains ${actualArticle} ${unit.type}, not ${requestedArticle} ${typeMatch.type}.`,
    };
  }

  return { result: { unit, rest: stripTrailingPunctuation(territoryMatch.rest) } };
}

function parseMoveTarget(
  value: string,
  state: GameState,
  allowBareTarget = false
): { target?: string; viaConvoy?: boolean; error?: string } {
  const normalized = normalizeInput(value).trim();
  let actionRemoved = /^-(?!>)\s*/.test(normalized);
  let text = stripLeadingPunctuation(normalized);
  const actionPrefixes = [
    /^->\s*/i,
    /^(?:to|into)\s+/i,
    /^(?:move|moves|go|goes|advance|advances)(?:\s+to)?\s+/i,
  ];

  for (const prefix of actionPrefixes) {
    if (!prefix.test(text)) continue;
    text = text.replace(prefix, '');
    actionRemoved = true;
    break;
  }

  if (!actionRemoved && !allowBareTarget) {
    return { error: 'Expected a move destination, such as "to Corinth" or "-> Corinth".' };
  }

  const territoryMatch = matchTerritoryAtStart(text, state);
  if (!territoryMatch) {
    return { error: 'Could not recognize the destination territory. Use its exact map name.' };
  }

  let rest = territoryMatch.rest.replace(/^[\s,;:.!?()[\]]+/, '').trim();
  let viaConvoy = false;
  const convoyModifier = rest.match(/^(?:\(?\s*(?:via|by)\s+(?:the\s+)?convoy(?:ed)?\s*\)?)[.!?]*$/i);
  if (convoyModifier) {
    viaConvoy = true;
    rest = '';
  }

  if (rest) {
    return { error: `Unexpected text after destination: "${rest}".` };
  }

  return { target: territoryMatch.id, viaConvoy };
}

function parseOrderLine(
  source: string,
  lineNumber: number,
  state: GameState,
  power: PowerId
): ParsedAction {
  const text = stripOrderLabel(normalizeInput(source))
    .replace(/^(?:unit\s*:\s*)/i, '')
    .replace(/^(?:the\s+)?orders?\s*:\s*/i, '')
    .trim();
  const primary = parseUnitReference(text, state, power);
  if (!primary.result) return { error: primary.error };

  const unit = primary.result.unit;
  const rawAction = primary.result.rest.trim();
  const hasDashMoveSeparator = /^-(?!>)/.test(rawAction);
  const action = stripLeadingPunctuation(rawAction);
  if (!action) {
    return { error: 'Add an action: hold, move, support, convoy, or trade.' };
  }

  const entry: ParsedOrderTextLine = {
    lineNumber,
    source,
    power,
    unitId: unit.id,
  };

  if (/^(?:hold|holds|holding|h)\b/i.test(action)) {
    const tail = stripTrailingPunctuation(action.replace(/^(?:hold|holds|holding|h)\b/i, '').trim());
    if (tail && !/^(?:position|here)[.!?]*$/i.test(tail)) {
      return { error: `Unexpected text after hold: "${tail}".` };
    }
    return { candidate: { entry, unit, order: { unitId: unit.id, type: 'hold' } } };
  }

  const supportAction = action.match(/^(?:support|supports|supporting|s)\b\s*(.*)$/i);
  if (supportAction) {
    let body = supportAction[1].trim();
    let mode: 'hold' | 'move' | undefined;
    const modeMatch = body.match(/^(hold|h|move|m)\b\s*/i);
    if (modeMatch) {
      mode = /^(?:hold|h)$/i.test(modeMatch[1]) ? 'hold' : 'move';
      body = body.slice(modeMatch[0].length).trim();
    }

    const supported = parseUnitReference(body, state, power);
    if (!supported.result) return { error: `Support order: ${supported.error}` };
    if (supported.result.unit.id === unit.id) {
      return { error: 'A unit cannot support itself.' };
    }

    const destinationText = supported.result.rest.trim();
    const hasDestination = Boolean(destinationText);
    if (mode === 'hold' && hasDestination) {
      return { error: 'A support-hold order cannot also name a destination.' };
    }
    if (mode === 'move' && !hasDestination) {
      return { error: 'A support-move order needs the destination of the supported move.' };
    }

    let order: Order;
    if (hasDestination || mode === 'move') {
      const destination = parseMoveTarget(destinationText, state);
      if (!destination.target) return { error: `Support order: ${destination.error}` };
      order = {
        unitId: unit.id,
        type: 'support_move',
        target: destination.target,
        supportTarget: supported.result.unit.id,
      };
    } else {
      order = {
        unitId: unit.id,
        type: 'support_hold',
        target: supported.result.unit.territoryId,
        supportTarget: supported.result.unit.id,
      };
    }

    return {
      candidate: { entry, unit, order, referencedUnit: supported.result.unit },
    };
  }

  const transportAction = action.match(/^(?:convoy|convoys|transport|transports)\b\s*(.*)$/i);
  if (transportAction) {
    if (unit.type !== 'fleet') {
      return { error: 'Only a fleet can receive a convoy/transport order.' };
    }
    const carried = parseUnitReference(transportAction[1], state, power);
    if (!carried.result) return { error: `Convoy order: ${carried.error}` };
    if (carried.result.unit.type !== 'army') {
      return { error: 'A fleet can only convoy an army.' };
    }
    const destination = parseMoveTarget(carried.result.rest, state);
    if (!destination.target) return { error: `Convoy order: ${destination.error}` };
    if (destination.viaConvoy) {
      return { error: 'Do not add "via convoy" after a fleet convoy order; put it on the army move instead.' };
    }

    return {
      candidate: {
        entry,
        unit,
        order: {
          unitId: unit.id,
          type: 'transport',
          target: destination.target,
          supportTarget: carried.result.unit.id,
        },
        referencedUnit: carried.result.unit,
      },
    };
  }

  const tradeAction = action.match(/^(?:trade|trades)\b\s*(.*)$/i);
  if (tradeAction) {
    if (unit.type !== 'caravan') {
      return { error: 'Only a caravan can receive a trade order.' };
    }
    const destination = parseMoveTarget(tradeAction[1], state, true);
    if (!destination.target) return { error: `Trade order: ${destination.error}` };
    return {
      candidate: {
        entry,
        unit,
        order: { unitId: unit.id, type: 'trade', target: destination.target },
      },
    };
  }

  const destination = parseMoveTarget(action, state, hasDashMoveSeparator);
  if (!destination.target) {
    return {
      error:
        destination.error ??
        'Unrecognized order. Try hold, move to a territory, support, convoy, or trade.',
    };
  }
  if (destination.viaConvoy && unit.type !== 'army') {
    return { error: 'Only an army can be marked as moving via convoy.' };
  }

  return {
    candidate: {
      entry,
      unit,
      order: {
        unitId: unit.id,
        type: unit.type === 'caravan' ? 'trade' : 'move',
        target: destination.target,
        ...(destination.viaConvoy ? { viaConvoy: true } : {}),
      },
    },
  };
}

function setError(entry: ParsedOrderTextLine, message: string): void {
  entry.error = entry.error ? `${entry.error} ${message}` : message;
}

function canEnter(unit: Unit, territoryType: TerritoryType): boolean {
  if (unit.type === 'army') return territoryType !== 'sea';
  if (unit.type === 'fleet') return territoryType !== 'land';
  return false;
}

function validateOrderTarget(
  state: GameState,
  candidate: Candidate,
  order: Order,
  orders: Map<string, Order>
): string | undefined {
  if (order.type === 'hold') return undefined;
  if (!order.target) return 'This order needs a destination.';
  const from = state.territories[candidate.unit.territoryId];
  const target = state.territories[order.target];
  if (!target) return 'The destination is not on the map.';

  if (order.type === 'move') {
    if (candidate.unit.type === 'caravan') {
      return 'Caravans use a trade order, not a military move.';
    }
    if (!canEnter(candidate.unit, target.type)) {
      const article = candidate.unit.type === 'army' ? 'An' : 'A';
      return `${article} ${candidate.unit.type} cannot enter ${target.type} territory.`;
    }
    if (from?.adjacent.includes(target.id)) return undefined;
    if (order.viaConvoy && candidate.unit.type === 'army') {
      const fleet = state.units.find((unit) =>
        canCarryArmy(state, unit, candidate.unit, target.id, orders)
      );
      if (fleet) return undefined;
      return 'The destination is not adjacent and no friendly fleet can convoy this army there.';
    }
    return `${target.name} is not adjacent to this unit; mark an army move "via convoy" if a fleet carries it.`;
  }

  if (order.type === 'trade') {
    if (candidate.unit.type !== 'caravan') return 'Only a caravan can receive a trade order.';
    if (!(from?.tradeRoutes ?? []).includes(target.id)) {
      return `${target.name} is not connected by a trade route from this caravan’s location.`;
    }
    return undefined;
  }

  if (order.type === 'support_hold') {
    const supported = candidate.referencedUnit;
    if (!supported || supported.power !== candidate.unit.power || supported.territoryId !== target.id) {
      return 'The support-hold target does not match the named friendly unit.';
    }
    if (!from?.adjacent.includes(target.id)) {
      return `${target.name} is not adjacent to this supporting unit.`;
    }
    return undefined;
  }

  if (order.type === 'support_move') {
    const supported = candidate.referencedUnit;
    const supportedOrder = supported ? orders.get(supported.id) : undefined;
    if (!supported || supported.power !== candidate.unit.power || supportedOrder?.type !== 'move' || supportedOrder.target !== target.id) {
      return 'The named friendly unit has no matching move order to support.';
    }
    if (!from?.adjacent.includes(target.id)) {
      return `${target.name} is not adjacent to this supporting unit.`;
    }
    return undefined;
  }

  if (order.type === 'transport') {
    const fleet = candidate.unit;
    const army = candidate.referencedUnit;
    if (fleet.type !== 'fleet') return 'Only a fleet can receive a convoy/transport order.';
    if (!army || army.type !== 'army' || army.power !== fleet.power) {
      return 'A fleet can only convoy a friendly army.';
    }
    if (!canCarryArmy(state, fleet, army, target.id, orders)) {
      return 'This fleet cannot reach both the army’s origin and destination.';
    }
    const armyOrder = orders.get(army.id);
    if (armyOrder?.type !== 'move' || armyOrder.target !== target.id || !armyOrder.viaConvoy) {
      return 'The army move is not linked to this convoy.';
    }
    return undefined;
  }

  return undefined;
}

function canCarryArmy(
  state: GameState,
  fleet: Unit,
  army: Unit,
  targetId: string,
  orders: Map<string, Order>
): boolean {
  if (fleet.power !== army.power || fleet.type !== 'fleet' || fleet.destroyed) return false;
  const sea = state.territories[fleet.territoryId];
  const origin = state.territories[army.territoryId];
  if (!sea || sea.type !== 'sea' || !origin) return false;
  if (!sea.adjacent.includes(targetId)) return false;
  if (sea.id !== origin.id && !origin.adjacent.includes(sea.id)) return false;
  const fleetOrder = orders.get(fleet.id);
  return !fleetOrder || (fleetOrder.type !== 'move' && fleetOrder.type !== 'trade');
}

/**
 * Parse and validate an order-text paste. This function only creates a
 * preview; callers must explicitly apply `updates` after reviewing entries.
 * Any parse or legality error is retained on its source line so the UI can
 * block a partial or malformed import.
 */
export function parseOrderText(
  input: string,
  state: GameState,
  defaultPower: PowerId | null
): OrderTextParseResult {
  const entries: ParsedOrderTextLine[] = [];
  const candidates: Candidate[] = [];
  let currentPower = defaultPower;

  for (const chunk of splitOrderText(input)) {
    let source = chunk.source.replace(/^(?:\d+[.)]|[-*•])\s*/, '').trim();
    if (!source || source.startsWith('#') || source.startsWith('//')) continue;
    const displaySource = source;

    const prefix = extractPowerPrefix(source);
    if (prefix?.error) {
      entries.push({ lineNumber: chunk.lineNumber, source, error: prefix.error });
      continue;
    }
    if (prefix?.power) {
      currentPower = prefix.power;
      if (prefix.isHeader || !prefix.rest) {
        entries.push({
          lineNumber: chunk.lineNumber,
          source,
          power: currentPower,
          isHeader: true,
        });
        continue;
      }
      source = prefix.rest;
    }

    source = stripOrderLabel(source);
    if (!source) continue;
    if (!currentPower) {
      entries.push({
        lineNumber: chunk.lineNumber,
        source: displaySource,
        error: 'Select a power first, or add a power heading such as "Athens:".',
      });
      continue;
    }

    const parsed = parseOrderLine(source, chunk.lineNumber, state, currentPower);
    if (!parsed.candidate) {
      entries.push({
        lineNumber: chunk.lineNumber,
        source: displaySource,
        power: currentPower,
        error: parsed.error,
      });
      continue;
    }

    parsed.candidate.entry.source = displaySource;
    parsed.candidate.entry.lineNumber = chunk.lineNumber;
    entries.push(parsed.candidate.entry);
    candidates.push(parsed.candidate);
  }

  // Two lines for the same unit are ambiguous. Keep both visible as errors;
  // never silently choose which one wins.
  const candidateByUnit = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const prior = candidateByUnit.get(candidate.unit.id);
    if (prior) {
      const name = state.territories[candidate.unit.territoryId]?.name ?? candidate.unit.territoryId;
      setError(prior.entry, `Duplicate order: ${name} also appears on line ${candidate.entry.lineNumber}.`);
      setError(candidate.entry, `Duplicate order for ${name}; keep one order for this unit.`);
      continue;
    }
    candidateByUnit.set(candidate.unit.id, candidate);
  }

  const updatesByUnit = new Map<string, Order>();
  for (const candidate of candidateByUnit.values()) {
    updatesByUnit.set(candidate.unit.id, candidate.order);
  }

  // Link explicit fleet convoy orders to the army's move. The preview shows
  // this inferred convoy flag, so the GM can confirm it rather than silently
  // importing an incomplete movement.
  for (const candidate of candidateByUnit.values()) {
    if (candidate.order.type !== 'transport' || !candidate.referencedUnit) continue;
    const army = candidate.referencedUnit;
    const armyOrder = updatesByUnit.get(army.id) ?? state.orders.find((order) => order.unitId === army.id);
    if (!armyOrder || armyOrder.type !== 'move' || armyOrder.target !== candidate.order.target) {
      setError(
        candidate.entry,
        `The convoyed army needs a matching move to ${state.territories[candidate.order.target ?? '']?.name ?? 'the same destination'}.`,
      );
      continue;
    }

    if (!armyOrder.viaConvoy) {
      const linkedOrder = { ...armyOrder, viaConvoy: true };
      updatesByUnit.set(army.id, linkedOrder);
      const armyCandidate = candidateByUnit.get(army.id);
      if (armyCandidate) {
        armyCandidate.order = linkedOrder;
        armyCandidate.entry.order = linkedOrder;
        armyCandidate.entry.note = 'Linked to the fleet convoy order.';
      } else {
        candidate.entry.note = `Linked the existing ${POWER_NAME[army.power]} army move and marked it via convoy.`;
      }
    }
  }

  const stagedOrders = new Map<string, Order>();
  for (const order of state.orders) stagedOrders.set(order.unitId, order);
  for (const [unitId, order] of updatesByUnit) stagedOrders.set(unitId, order);
  for (const candidate of candidateByUnit.values()) {
    const order = updatesByUnit.get(candidate.unit.id) ?? candidate.order;
    candidate.entry.order = order;

    if (candidate.entry.error) continue;
    const validationError = validateOrderTarget(state, candidate, order, stagedOrders);
    if (validationError) setError(candidate.entry, validationError);
  }

  const errorCount = entries.filter((entry) => Boolean(entry.error)).length;
  return {
    entries,
    updates: [...updatesByUnit.values()],
    errorCount,
    parsedCount: candidates.length,
  };
}
