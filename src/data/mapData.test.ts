import { describe, expect, it } from 'vitest';
import { loadTerritories } from './gameData';
import {
  NEUTRAL_MARKS,
  SUPPLY_CENTRE_MARKS,
  TERRITORY_LABEL_TEXT,
  TERRITORY_POSITIONS,
} from './territoryPositions';

const territories = loadTerritories();
const ids = Object.keys(territories);

describe('map data', () => {
  it('knows 96 provinces', () => {
    expect(ids).toHaveLength(96);
  });

  it('has a map position for every province', () => {
    const missing = ids.filter((id) => !TERRITORY_POSITIONS[id]);
    expect(missing).toEqual([]);
  });

  it('has no map position for an unknown province', () => {
    const extra = Object.keys(TERRITORY_POSITIONS).filter((id) => !territories[id]);
    expect(extra).toEqual([]);
  });

  it('places every province inside the map', () => {
    const outside = ids.filter((id) => {
      const point = TERRITORY_POSITIONS[id];
      return point.x < -470 || point.x > 1027 || point.y < 0 || point.y > 804;
    });
    expect(outside).toEqual([]);
  });

  it('has a label for every province', () => {
    const missing = ids.filter((id) => !TERRITORY_LABEL_TEXT[id]);
    expect(missing).toEqual([]);
  });

  it('marks the 22 supply centres of the map', () => {
    expect(Object.keys(SUPPLY_CENTRE_MARKS)).toHaveLength(22);
  });

  it('marks the 5 neutral dots of the map', () => {
    expect(Object.keys(NEUTRAL_MARKS)).toHaveLength(5);
  });
});

describe('territory data', () => {
  it('uses only known neighbours', () => {
    const broken = ids.filter((id) =>
      territories[id].adjacent.some((neighbour) => !territories[neighbour])
    );
    expect(broken).toEqual([]);
  });

  it('has symmetric adjacencies', () => {
    const broken: string[] = [];
    for (const id of ids) {
      for (const neighbour of territories[id].adjacent) {
        if (!territories[neighbour].adjacent.includes(id)) broken.push(`${id} -> ${neighbour}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('has a home power for every supply centre', () => {
    const missing = ids.filter(
      (id) => territories[id].isSupplyCenter && !territories[id].homePower
    );
    expect(missing).toEqual([]);
  });

  it('uses known provinces in the trade routes', () => {
    const broken = ids.filter((id) =>
      (territories[id].tradeRoutes ?? []).some((route) => !territories[route])
    );
    expect(broken).toEqual([]);
  });

  it('gives every trade node a value', () => {
    const missing = ids.filter(
      (id) => territories[id].isTradeNode && !territories[id].tradeNodeValue
    );
    expect(missing).toEqual([]);
  });
});
