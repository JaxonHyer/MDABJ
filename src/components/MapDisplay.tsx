import { RefObject, useCallback, useMemo, useRef, useState } from 'react';
import { GameState, Order, Unit, unitForce } from '../types/game';
import {
  BLACK_DOT_MARKS,
  SUPPLY_CENTRE_MARKS,
  TERRITORY_LABEL_TEXT,
  TERRITORY_POSITIONS,
} from '../data/territoryPositions';
import { measureLabel, provinceAnchor, unitSlot, type Point } from '../data/mapLayout';
import { getOccupiedProvinceFills } from '../data/occupiedProvinceFills';
import {
  MAP_VIEWBOX,
  MAP_WIDTH,
  NEUTRAL_COLOR,
  POWER_COLORS,
  POWER_OUTLINE,
  UNIT_COUNTER_SIZE,
  contrastingText,
} from '../data/mapConfig';
import { UNIT_GLYPH } from '../types/game';

interface MapDisplayProps {
  gameState: GameState;
  /** Province the user selected in the order panel. */
  selectedTerritoryId: string | null;
  /** Province the user currently points at. */
  hoveredTerritoryId: string | null;
  /** Provinces the selected unit may act on. */
  validTargets: string[];
  onTerritoryClick: (territoryId: string) => void;
  onTerritoryHover: (territoryId: string | null) => void;
  /** The overlay svg, used for the board export. */
  overlayRef?: RefObject<SVGSVGElement>;
  /** Highlights the supply centre that would be placed on a click. */
  supplyCentreMode?: boolean;
}

const VIEWBOX = MAP_VIEWBOX.split(/[\s,]+/).map(Number);
const [VIEW_X, VIEW_Y] = [VIEWBOX[0], VIEWBOX[1]];

const SUCCESS_COLOR = '#1f9d55';
const FAILURE_COLOR = '#c62828';
const HIGHLIGHT_COLOR = '#ffd54f';

interface ArrowGeometry {
  path: string;
  head: string;
}

/** A quadratic arrow from `from` to `to`, bowed sideways by `bend`. */
function arrowGeometry(from: Point, to: Point, bend: number): ArrowGeometry {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  // Start and end are pulled towards each other so the arrow does not hide
  // underneath the unit counters - but never so much that the arrow
  // disappears completely on short moves.
  const inset = Math.min(11, len * 0.3);
  const start = { x: from.x + ux * inset, y: from.y + uy * inset };
  const end = { x: to.x - ux * (inset + 3), y: to.y - uy * (inset + 3) };

  const cx = (start.x + end.x) / 2 + nx * bend;
  const cy = (start.y + end.y) / 2 + ny * bend;

  const path = `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`;

  // Tangent of the quadratic curve at t = 1.
  const tx = end.x - cx;
  const ty = end.y - cy;
  const tl = Math.hypot(tx, ty) || 1;
  const hx = tx / tl;
  const hy = ty / tl;
  const size = 11;
  const base = { x: end.x - hx * size, y: end.y - hy * size };
  const wing = 5.5;
  const head = [
    `${end.x},${end.y}`,
    `${base.x + nx * wing},${base.y + ny * wing}`,
    `${base.x - nx * wing},${base.y - ny * wing}`,
  ].join(' ');

  return { path, head };
}

/** A plain (head-less) line, used for support and convoy indicators. */
function lineGeometry(from: Point, to: Point, bend: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const inset = Math.min(10, len * 0.3);
  const start = { x: from.x + ux * inset, y: from.y + uy * inset };
  const end = { x: to.x - ux * (inset + 2), y: to.y - uy * (inset + 2) };
  const cx = (start.x + end.x) / 2 + nx * bend;
  const cy = (start.y + end.y) / 2 + ny * bend;
  return {
    path: `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`,
    mid: { x: (start.x + end.x) / 2 + nx * bend, y: (start.y + end.y) / 2 + ny * bend },
  };
}

export function MapDisplay({
  gameState,
  selectedTerritoryId,
  hoveredTerritoryId,
  validTargets,
  onTerritoryClick,
  onTerritoryHover,
  overlayRef: externalOverlayRef,
  supplyCentreMode = false,
}: MapDisplayProps) {
  const internalOverlayRef = useRef<SVGSVGElement>(null);
  const overlayRef = externalOverlayRef ?? internalOverlayRef;
  const [localHover, setLocalHover] = useState<string | null>(null);
  const hover = hoveredTerritoryId ?? localHover;

  const unitsByTerritory = useMemo(() => {
    const map = new Map<string, Unit[]>();
    for (const unit of gameState.units) {
      if (unit.destroyed) continue;
      const list = map.get(unit.territoryId) ?? [];
      list.push(unit);
      map.set(unit.territoryId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
    }
    return map;
  }, [gameState.units]);

  const resultByUnit = useMemo(() => {
    const map = new Map<string, { success: boolean; kind?: string }>();
    for (const result of gameState.results) {
      map.set(result.orderId, { success: result.success, kind: result.kind });
    }
    return map;
  }, [gameState.results]);

  const orderByUnit = useMemo(() => {
    const map = new Map<string, Order>();
    for (const order of gameState.orders) map.set(order.unitId, order);
    return map;
  }, [gameState.orders]);

  /** Colour of an order, green/red once the turn has been adjudicated. */
  const orderColor = useCallback(
    (unitId: string, fallback: string) => {
      if (gameState.phase === 'orders') return fallback;
      const result = resultByUnit.get(unitId);
      if (!result) return fallback;
      return result.success ? SUCCESS_COLOR : FAILURE_COLOR;
    },
    [gameState.phase, resultByUnit]
  );

  // ------------------------------------------------------------------
  // Order visualisation
  // ------------------------------------------------------------------

  /** The place the counter of `unit` is drawn in `provinceId`. */
  const slotOf = (unit: Unit, provinceId: string): Point | undefined => {
    const others = (unitsByTerritory.get(provinceId) ?? []).filter(
      (u) => u.id !== unit.id
    );
    return unitSlot(provinceId, others.length) ?? provinceAnchor(provinceId);
  };

  const arrows = useMemo(() => {
    const items: {
      key: string;
      path: string;
      head?: string;
      mid?: Point;
      color: string;
      width: number;
      dash?: string;
      marker?: 'support' | 'convoy';
    }[] = [];

    const bends = new Map<string, number>();
    const nextBend = (key: string) => {
      const used = bends.get(key) ?? 0;
      bends.set(key, used + 1);
      return used === 0 ? 0 : (used % 2 === 1 ? 1 : -1) * Math.ceil(used / 2) * 16;
    };

    for (const order of gameState.orders) {
      const unit = gameState.units.find((u) => u.id === order.unitId);
      if (!unit) continue;
      const power = unit.power;
      const baseColor = POWER_COLORS[power];

      if (order.type === 'move' || order.type === 'trade') {
        if (!order.target) continue;
        const originId = unit.originTerritoryId ?? unit.territoryId;
        const from = slotOf(unit, originId);
        const to = provinceAnchor(order.target);
        if (!from || !to) continue;
        const key = `${originId}->${order.target}`;
        const geometry = arrowGeometry(from, to, nextBend(key));
        items.push({
          key: `move-${order.unitId}`,
          path: geometry.path,
          head: geometry.head,
          color: orderColor(order.unitId, baseColor),
          width: 3,
          dash: order.type === 'trade' ? '8 3 2 3' : undefined,
        });
        continue;
      }

      if (order.type === 'support_hold' || order.type === 'support_move') {
        const from = slotOf(unit, unit.territoryId);
        if (!from) continue;
        let toId: string | undefined = order.target;
        if (order.type === 'support_move' && order.supportTarget) {
          const supported = gameState.units.find((u) => u.id === order.supportTarget);
          toId = supported?.originTerritoryId ?? supported?.territoryId ?? order.target;
        }
        if (!toId) continue;
        const to = provinceAnchor(toId);
        if (!to) continue;
        const key = `sup-${unit.territoryId}-${toId}`;
        const geometry = lineGeometry(from, to, nextBend(key));
        items.push({
          key: `support-${order.unitId}`,
          path: geometry.path,
          mid: geometry.mid,
          color: orderColor(order.unitId, baseColor),
          width: 2,
          dash: '7 5',
          marker: 'support',
        });
        continue;
      }

      if (order.type === 'transport') {
        const from = slotOf(unit, unit.territoryId);
        const carried = order.supportTarget
          ? gameState.units.find((u) => u.id === order.supportTarget)
          : undefined;
        const toId = order.target ?? carried?.territoryId;
        if (!from || !toId) continue;
        const to = provinceAnchor(toId);
        if (!to) continue;
        const geometry = lineGeometry(from, to, nextBend(`conv-${unit.territoryId}-${toId}`));
        items.push({
          key: `transport-${order.unitId}`,
          path: geometry.path,
          mid: geometry.mid,
          color: orderColor(order.unitId, baseColor),
          width: 2.2,
          dash: '2 5',
          marker: 'convoy',
        });
      }
    }

    return items;
  }, [gameState.orders, gameState.units, orderColor, unitsByTerritory]);

  // ------------------------------------------------------------------
  // Interaction
  // ------------------------------------------------------------------

  const toSvgPoint = useCallback((clientX: number, clientY: number): Point | null => {
    const svg = overlayRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const scale = rect.width / MAP_WIDTH;
    return {
      x: (clientX - rect.left) / scale + VIEW_X,
      y: (clientY - rect.top) / scale + VIEW_Y,
    };
  }, []);

  const handleBackgroundClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const point = toSvgPoint(event.clientX, event.clientY);
      if (!point) return;
      // Clicking anywhere close to a province name selects that province.
      let best: string | null = null;
      let bestDistance = 26;
      for (const [id, position] of Object.entries(TERRITORY_POSITIONS)) {
        const distance = Math.hypot(position.x - point.x, position.y - point.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = id;
        }
      }
      if (best) onTerritoryClick(best);
    },
    [onTerritoryClick, toSvgPoint]
  );

  const handleHoverMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const point = toSvgPoint(event.clientX, event.clientY);
      if (!point) return;
      let best: string | null = null;
      let bestDistance = 18;
      for (const [id, position] of Object.entries(TERRITORY_POSITIONS)) {
        const distance = Math.hypot(position.x - point.x, position.y - point.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = id;
        }
      }
      setLocalHover(best);
      onTerritoryHover(best);
    },
    [onTerritoryHover, toSvgPoint]
  );

  const hovered = hover ? gameState.territories[hover] : undefined;
  const hoveredPosition = hover ? TERRITORY_POSITIONS[hover] : undefined;
  const hoveredUnits = hover ? unitsByTerritory.get(hover) ?? [] : [];

  const tooltipStyle = useMemo(() => {
    if (!hoveredPosition || !overlayRef.current) return undefined;
    const rect = overlayRef.current.getBoundingClientRect();
    const scale = rect.width / MAP_WIDTH;
    const x = (hoveredPosition.x - VIEW_X) * scale;
    const y = (hoveredPosition.y - VIEW_Y) * scale;
    // Keep the tooltip below the cursor, but flip it up near the bottom edge.
    const below = y < rect.height * 0.75;
    return {
      left: `${x}px`,
      top: `${y}px`,
      transform: below ? 'translate(14px, 14px)' : 'translate(14px, calc(-100% - 14px))',
    };
  }, [hoveredPosition]);

  /**
   * Supply centres that the game master placed after the map was drawn are
   * not part of the map image - they are drawn here. Supply centres that
   * were removed are crossed out.
   */
  const supplyCentreMarkers = useMemo(() => {
    const added: { id: string; x: number; y: number; color: string }[] = [];
    const removed: { id: string; x: number; y: number }[] = [];
    for (const [id, territory] of Object.entries(gameState.territories)) {
      const baked = SUPPLY_CENTRE_MARKS[id];
      if (territory.isSupplyCenter) {
        if (baked) continue;
        const anchor = provinceAnchor(id);
        if (!anchor) continue;
        added.push({
          id,
          x: anchor.x,
          y: anchor.y,
          color: territory.homePower ? POWER_COLORS[territory.homePower] ?? NEUTRAL_COLOR : NEUTRAL_COLOR,
        });
      } else if (baked) {
        removed.push({ id, x: baked.x, y: baked.y });
      }
    }
    return { added, removed };
  }, [gameState.territories]);

  /**
   * The supply centre circles and the small city dots of the map are drawn in
   * the colour of the power that occupies the province. The map itself shows
   * the supply centres in the colour of their home power, so the marker has
   * to be painted over as soon as somebody else holds the province.
   */
  const occupiedMarkers = useMemo(() => {
    const markers: {
      id: string;
      x: number;
      y: number;
      r: number;
      color: string;
    }[] = [];

    const occupantOf = (territoryId: string) =>
      gameState.units.find((u) => u.territoryId === territoryId && !u.destroyed)?.power;

    for (const [id, territory] of Object.entries(gameState.territories)) {
      if (!territory.isSupplyCenter) continue;
      const power = occupantOf(id);
      if (!power) continue;
      const mark = SUPPLY_CENTRE_MARKS[id] ?? provinceAnchor(id);
      if (!mark) continue;
      markers.push({
        id: `occupied-sc-${id}`,
        x: mark.x,
        y: mark.y,
        r: 5.2,
        color: POWER_COLORS[power] ?? NEUTRAL_COLOR,
      });
    }

    for (const [id, dot] of Object.entries(BLACK_DOT_MARKS)) {
      const power = occupantOf(id);
      if (!power) continue;
      markers.push({
        id: `occupied-dot-${id}`,
        x: dot.x,
        y: dot.y,
        r: dot.r,
        color: POWER_COLORS[power] ?? NEUTRAL_COLOR,
      });
    }

    return markers;
  }, [gameState.territories, gameState.units]);

  const occupiedProvinceFills = useMemo(
    () => getOccupiedProvinceFills(gameState),
    [gameState.territories, gameState.units]
  );

  const unitCount = gameState.units.filter((u) => !u.destroyed).length;

  return (
    <div className="map-display">
      <img
        src={`${import.meta.env.BASE_URL}map.svg`}
        alt="Mare Nostrum Map"
        className="map-image"
        draggable={false}
      />
      <svg
        ref={overlayRef}
        className="map-overlay"
        viewBox={MAP_VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleBackgroundClick}
        onMouseMove={handleHoverMove}
        onMouseLeave={() => {
          setLocalHover(null);
          onTerritoryHover(null);
        }}
      >
        {/* Tint each occupied supply centre or city across its full province. */}
        <g className="map-province-fills" pointerEvents="none">
          {occupiedProvinceFills.map((fill) => (
            <path
              key={`occupied-province-${fill.territoryId}`}
              d={fill.path}
              fill={fill.color}
              fillOpacity={0.38}
              stroke="none"
            />
          ))}
        </g>

        {/* Province highlights */}
        <g className="map-highlights">
          {validTargets.map((id) => {
            const position = TERRITORY_POSITIONS[id];
            if (!position) return null;
            return (
              <circle
                key={`valid-${id}`}
                cx={position.x}
                cy={position.y - 4}
                r={13}
                fill={HIGHLIGHT_COLOR}
                fillOpacity={0.28}
                stroke={HIGHLIGHT_COLOR}
                strokeWidth={1.2}
                strokeOpacity={0.8}
              />
            );
          })}
          {selectedTerritoryId &&
            (() => {
              const position = TERRITORY_POSITIONS[selectedTerritoryId];
              if (!position) return null;
              return (
                <circle
                  cx={position.x}
                  cy={position.y - 4}
                  r={11}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={2}
                  strokeOpacity={0.95}
                />
              );
            })()}
          {hover && hoveredPosition && (
            <circle
              cx={hoveredPosition.x}
              cy={hoveredPosition.y - 4}
              r={10}
              fill="none"
              stroke="#ffffff"
              strokeWidth={1.2}
              strokeOpacity={0.6}
            />
          )}
          {supplyCentreMode && hover && (() => {
            const territory = gameState.territories[hover];
            const anchor = provinceAnchor(hover);
            if (!territory || !anchor) return null;
            const color = territory.isSupplyCenter
              ? '#d0d0d0'
              : territory.homePower
                ? POWER_COLORS[territory.homePower] ?? NEUTRAL_COLOR
                : NEUTRAL_COLOR;
            return (
              <circle
                cx={anchor.x}
                cy={anchor.y}
                r={7}
                fill={color}
                fillOpacity={0.45}
                stroke={color}
                strokeWidth={1.4}
              />
            );
          })()}
        </g>

        {/* The colour of the power that occupies a supply centre or a city */}
        <g className="map-occupied">
          {occupiedMarkers.map((marker) => (
            <g key={marker.id} transform={`translate(${marker.x} ${marker.y})`}>
              <circle
                r={marker.r}
                fill={marker.color}
                stroke="#020000"
                strokeWidth={1}
              />
            </g>
          ))}
        </g>

        {/* Supply centres placed by the game master */}
        <g className="map-supplycentres">
          {supplyCentreMarkers.added.map((marker) => (
            <g key={`sc-${marker.id}`} transform={`translate(${marker.x} ${marker.y})`}>
              <circle r={5.2} fill={marker.color} stroke="#ffffff" strokeWidth={1.1} />
            </g>
          ))}
          {supplyCentreMarkers.removed.map((marker) => (
            <g key={`sc-removed-${marker.id}`} transform={`translate(${marker.x} ${marker.y})`}>
              <circle r={5.2} fill="none" stroke="#d0d0d0" strokeWidth={1.2} strokeDasharray="2 2" />
              <path d="M -3.6 -3.6 L 3.6 3.6 M 3.6 -3.6 L -3.6 3.6" stroke="#d0d0d0" strokeWidth={1.2} />
            </g>
          ))}
        </g>

        {/* Units */}
        <g className="map-units">
          {Array.from(unitsByTerritory.entries()).map(([territoryId, units]) =>
            units.map((unit, index) => {
              const slot = unitSlot(territoryId, index);
              if (!slot) return null;
              const color = POWER_COLORS[unit.power] ?? NEUTRAL_COLOR;
              const outline = POWER_OUTLINE[unit.power] ?? '#333';
              const order = orderByUnit.get(unit.id);
              const isHolding = order?.type === 'hold' || (!order && gameState.phase === 'orders');
              const size = UNIT_COUNTER_SIZE;
              return (
                <g
                  key={unit.id}
                  transform={`translate(${slot.x} ${slot.y})`}
                  className={unit.mustRetreat ? 'unit-counter dislodged' : 'unit-counter'}
                >
                  {isHolding && (
                    <circle
                      r={size * 0.72}
                      fill="none"
                      stroke={outline}
                      strokeWidth={0.9}
                      strokeOpacity={0.55}
                    />
                  )}
                  <rect
                    x={-size / 2}
                    y={-size / 2}
                    width={size}
                    height={size}
                    rx={3}
                    fill={color}
                    stroke={unit.isElite ? '#c8a415' : outline}
                    strokeWidth={unit.isElite ? 2.2 : 1.2}
                  />
                  <text
                    x={0}
                    y={size * 0.3}
                    textAnchor="middle"
                    fontSize={size * 0.72}
                    fontWeight={700}
                    fill={contrastingText(color)}
                  >
                    {UNIT_GLYPH[unit.type]}
                  </text>
                  {unit.isElite && (
                    <text
                      x={size * 0.42}
                      y={-size * 0.28}
                      textAnchor="middle"
                      fontSize={size * 0.6}
                      fill="#3a2c00"
                      stroke="#ffe680"
                      strokeWidth={0.35}
                    >
                      ★
                    </text>
                  )}
                  {unit.mustRetreat && (
                    <circle
                      r={size * 0.78}
                      fill="none"
                      stroke={FAILURE_COLOR}
                      strokeWidth={1.6}
                      strokeDasharray="3 2"
                    />
                  )}
                </g>
              );
            })
          )}
        </g>

        {/* Order visualisation */}
        <g className="map-orders">
          {arrows.map((arrow) => (
            <g key={arrow.key}>
              <path
                d={arrow.path}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={0.65}
                strokeWidth={arrow.width + 2.2}
                strokeLinecap="round"
                strokeDasharray={arrow.dash}
              />
              <path
                d={arrow.path}
                fill="none"
                stroke={arrow.color}
                strokeWidth={arrow.width}
                strokeLinecap="round"
                strokeOpacity={1}
                strokeDasharray={arrow.dash}
              />
              {arrow.head && (
                <polygon points={arrow.head} fill={arrow.color} stroke="#ffffff" strokeWidth={0.5} />
              )}
              {arrow.mid && arrow.marker === 'support' && (
                <circle
                  cx={arrow.mid.x}
                  cy={arrow.mid.y}
                  r={4.5}
                  fill={arrow.color}
                  stroke="#ffffff"
                  strokeWidth={0.8}
                />
              )}
              {arrow.mid && arrow.marker === 'convoy' && (
                <rect
                  x={arrow.mid.x - 4}
                  y={arrow.mid.y - 4}
                  width={8}
                  height={8}
                  fill={arrow.color}
                  stroke="#ffffff"
                  strokeWidth={0.8}
                />
              )}
            </g>
          ))}
        </g>

        {/* Clickable province labels */}
        <g className="map-hit">
          {Object.entries(TERRITORY_POSITIONS).map(([id, position]) => {
            const text = TERRITORY_LABEL_TEXT[id] ?? '';
            const width = measureLabel(text);
            return (
              <rect
                key={id}
                x={position.x - 3}
                y={position.y - 12}
                width={Math.max(width + 6, 16)}
                height={17}
                fill="transparent"
                style={{ pointerEvents: 'all', cursor: 'pointer' }}
                onClick={(event) => {
                  event.stopPropagation();
                  onTerritoryClick(id);
                }}
                onMouseEnter={() => {
                  setLocalHover(id);
                  onTerritoryHover(id);
                }}
              />
            );
          })}
        </g>
      </svg>

      {hovered && hoveredPosition && (
        <div className="map-tooltip" style={tooltipStyle}>
          <strong>{hovered.name}</strong>
          <span>
            {hovered.type === 'sea' ? 'Sea zone' : hovered.type === 'coastal' ? 'Coastal' : 'Land'}
            {hovered.isSupplyCenter ? ' • Supply centre' : ''}
            {hovered.isCity ? ' • City (sustains a unit)' : ''}
            {hovered.isTradeNode ? ` • Trade node (${hovered.tradeNodeValue} eco)` : ''}
            {hovered.fortified ? ' • Fortified' : ''}
          </span>
          {hoveredUnits.length > 0 && (
            <span>
              {hoveredUnits
                .map((unit) => `${UNIT_GLYPH[unit.type]}${unit.isElite ? '★' : ''}`)
                .join(' ')}
            </span>
          )}
        </div>
      )}

      <div className="map-stats">
        <div>Provinces: {Object.keys(gameState.territories).length}</div>
        <div>Units: {unitCount}</div>
      </div>
    </div>
  );
}

/** Helper used by the order panel: the force of a unit including support. */
export function describeUnit(unit: Unit): string {
  return `${UNIT_GLYPH[unit.type]}${unit.isElite ? '★' : ''} (${unitForce(unit)})`;
}
