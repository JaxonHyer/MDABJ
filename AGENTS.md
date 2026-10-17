# Agent Guide for MDABJ (Mare Nostrum Diplomacy Adjudicator)

## Project Overview

A **Diplomacy adjudicator** for the **Mare Nostrum** custom variant (Eastern Mediterranean, 350 BC, 8 players).
TypeScript + Vite + React, deployed to GitHub Pages.

The app is a **game-master (GM) tool**: the GM loads a save file, enters every power's orders, build
actions, retreats, research scores and economic adjustments, and then exports the save file, a board
image and a stats sheet for the players.

### What It Does

- Adjudicates Diplomacy-style orders for the Mare Nostrum variant (caravans, elite units, trade nodes, economy, research)
- Renders an interactive map (SVG background + React overlay) with units, order arrows and supply-centre markers
- Full turn flow: orders → adjudication → retreat → build → next turn
- GM panel: research scoring, economic ledger, place/remove supply centres, save/load, exports

### Key Files

```
src/
  engine/
    adjudicator.ts       # Movement, combat, support, convoys, holds
    gameState.ts         # Phase machine, builds, retreats, income, supply centres
    economy.ts           # Income, banking cap (15), eco/point adjustments
    research.ts          # Research scoring table (90/75/50 -> +3/+2/+1/+0)
    orders.ts            # Legal order targets, support helpers
    testHelpers.ts       # makeState()/unit()/order() builders for tests
  types/
    game.ts              # PowerId, UnitType, Phase, Territory, Unit, Order, Economy, GameState
  data/
    territories.json     # 96 territories, 22 supply centres, symmetric adjacency
    gameData.ts          # Powers, starting positions, home centres
    mapConfig.ts         # Map geometry, power colours
    mapLayout.ts         # measureLabel(), provinceAnchor(), unitSlot()
    territoryPositions.ts # GENERATED: label + supply-centre-mark coordinates
  io/
    save.ts              # Save file format (mare-nostrum-save v1), load/export
    boardExport.ts       # Board SVG/PNG + stats sheet SVG/PNG
    turnReport.ts        # Plain text turn report for Discord
  components/
    MapDisplay.tsx       # Map renderer (units, order arrows, SC markers, hover)
    OrderPanel.tsx       # Order entry
    RetreatPanel.tsx     # Retreat decisions for dislodged units
    BuildPanel.tsx       # Build/upgrade/fortify/disband
    ResultsPanel.tsx     # Adjudication results + income
    AdminPanel.tsx       # GM tools: research, ledger, supply centres, files
    ResearchPanel.tsx    # Research phase (scoring the research of the turn)
  App.tsx                # Shell: sidebar (Play / Game master), export handlers
public/
  map.svg                # Inkscape SVG map (viewBox fixed)
mare_nostrum/
  rules.pdf              # Authoritative rules
  map.png, map.svg       # Reference map (svg viewBox fixed as well)
scripts/
  extract-map-data.mjs   # Regenerates src/data/territoryPositions.ts from map.svg
```

## Current State

### ✅ Working

1. **Map**: `viewBox="-470 0 1497 804"` on the SVG root (`width="1497" height="804"`) in both `public/map.svg`
   and `mare_nostrum/map.svg`. The React overlay uses the same viewBox, so map pixels = svg coords + 470 in x.
2. **Units on the map**: A/F/C counters in the power's colour, elite units get a gold border, a "holding" ring
   for units without an order. Position = supply-centre mark, else the province label + text width.
3. **Order visualisation**: arrows for moves (white halo, drawn above the units), dashed support indicators,
   convoy routes, green/red after adjudication.
4. **Clickable map**: click a province to select a unit, click a highlighted neighbour to order a move.
   Hover shows a tooltip (name, type, supply centre, trade node).
5. **Adjudication**: support cuts, bounce, elite force, convoys (one army per fleet per turn), holds,
   dislodgement, retreats (adjacent, unoccupied, not the attacker's origin), build phase with
   eco costs, elite upgrade (max 2), fortify (lost when the supply centre changes hands).
6. **Economy**: trade-node income (caravan = full, military = half floored, blockaded caravan = 0),
   banking cap 15, wealth = cumulative eco, research bonuses into eco/military/diplomatic ledgers.
7. **GM panel**: research score + topic per power, eco/military/diplomatic adjustments,
   place & remove supply centres (click the map), load a save file, export save/board/stats/report.
8. **Research phase**: every turn starts with the research phase (rules 4.1). The game master scores
   the research of all eight powers, the bonus goes to the matching ledger, then the turn continues
   into the orders phase.
9. **Exports**: Save (JSON), Board (SVG + PNG), Stats sheet (SVG + PNG), Turn report (txt).
   Every export is previewed in the app so the game master can show it to the players.
10. **Tests**: 97 vitest cases across adjudicator, game state, orders, research, save/load,
   turn report, DATC style edge cases and map data. `npx tsc --noEmit` is clean,
   `npm run build` succeeds.

### ⚠️ Known Gaps

- **Diplomacy (negotiation) phase** is not modelled - the rules mark it as table talk, only the result matters.
- **Policy phase** is inactive in this ruleset and is not implemented.
- **Caravan vs. hostile caravan** (both eliminated, +1 eco to the attacker) is *not* implemented: the rules
  body marks it "inactive for this round", the Quick Reference still lists it. Flag before using.
- **DATC edge cases**: `src/engine/datk.test.ts` covers the support cut rules, the self standoff,
  the bounce, the dislodged supporter, the convoy disruption and the retreat rules. The classic
  circular convoy (DATC 6.A.7) and Pandin's paradox (6.F.16) are not implemented - the rules of
  this variant are much simpler than the standard Diplomacy ones.
- The turn report lists the state of the turn; it does not build a per power Discord message.

## Game Master Workflow

1. **Game master** tab in the sidebar → **Files** → *Load save file* (a `mare-nostrum-save` JSON) or start a new game.
2. **Research phase** (the start of every turn): score the research of the eight powers and press
   *Continue to orders*.
3. **Play** tab → select a power → click its unit on the map → pick the order type → click the target.
   *Adjudicate All Orders* resolves the turn.
4. Dislodged units: **Retreat** panel. New units: **Build** panel (eco, elite, fortify, disband).
5. **Game master** tab:
   - *Research*: enter the score (0-100) and the topic (economic/military/diplomatic) → the matching ledger
     gets +3/+2/+1/+0 and the score is stored as a cumulative research score.
   - *Ledger*: adjust eco or military/diplomatic points by hand (e.g. for a caravan the GM placed by hand).
   - *Supply centres*: switch on *Place supply centre mode*, pick the owning power, click a province.
     The same control removes a supply centre again.
   - *Files*: export **Save** (JSON), **Board** (SVG/PNG), **Stats** (SVG/PNG) and the
     **Turn report** (txt, ready to paste into Discord) and hand them to the players.
6. **Finish Turn** ends the turn (15 game-years pass: 350 BC → 335 BC → …, 8 turns per semester → 245 BC).
   The next turn starts in the research phase again.

### Save file format

```jsonc
{
  "format": "mare-nostrum-save",
  "version": 1,
  "turn": 1, "year": 350, "phase": "orders",
  "territoryOverrides": { "delphi": { "isSupplyCenter": true, "homePower": "athens" } },
  "units": [...], "orders": [...], "economy": {...}, "scOwners": {...}, "researchScores": {...}
}
```

`territoryOverrides` records the supply centres the GM placed so a reload restores them on top of the
built-in map data.

## Rules Digest (authoritative source: `mare_nostrum/rules.pdf`)

### Turn order
Research → GM scoring → Policy *(inactive)* → Diplomacy → Orders → Adjudication → Income → Retreat → Build.
The income is collected **before** the build phase, so the game master can spend it right away.
It is collected exactly once per turn (the ledger and the wealth are updated in the income phase).

### Combat
- Attack force = unit force + uncut support. Elite = force 2 in attack *and* defence, needs 3+ to dislodge.
- Attack must be **strictly greater**; equal forces bounce.
- Support is cut when the supporter is attacked, except from the province being supported into.
- 7-player variant note (Hoplite defence 3) does **not** apply to this 8-player game.

### Convoys
A fleet in a sea zone can transport **one army** across that zone per turn. The fleet does not move and does
**not** add force to the attack (interpretation, see below). The transport fails if the fleet is dislodged
or if the fleet is ordered to sail away.

### Economy
- Caravan at a trade node = full node income; military unit at a node = half (floored).
- Blockaded caravan (hostile military unit on the node) = 0 income but the caravan survives.
- Banking cap 15 eco. Costs: army 6, fleet 6, caravan 4, elite upgrade 8, fortify 3.
- A new army/fleet may be paid for with 1 supply centre instead of eco; caravans need 4 eco.
- Units may not outnumber supply centres (unless paid for with eco) - disband in the build phase.

### Research and winning
- Score 90-100 → +3, 75-89 → +2, 50-74 → +1, <50 → +0 to the matching ledger (eco is capped at 15).
- The research score itself accumulates as a winning track; wealth = cumulative eco; territory = supply centres.
- The three tracks are combined into the final ranking.

### Supply centres
- Captured at the end of the turn. A supply centre that changes hands **loses its fortification**.

### Documented interpretations (rules are ambiguous here)
- A caravan in a power's home centre earns the full node value (Quick Reference wording).
- A convoying fleet transports but does not support (standard Diplomacy reading).
- The "new unit type" line in the rules refers to the caravan - the game has exactly three unit types (A/F/C).

## Data Notes

- `src/data/territories.json`: 96 territories, **22** supply centres, adjacency verified symmetric.
- `src/data/territoryPositions.ts` is **generated**: `node scripts/extract-map-data.mjs`.
  It contains `TERRITORY_POSITIONS` (96), `TERRITORY_LABEL_TEXT`, `SUPPLY_CENTRE_MARKS` (22), `NEUTRAL_MARKS` (5).
- Starting positions: Athens (SC: Athens/Rhodes/Crete, 4 eco), Sparta (Sparta/Corinth, 2 eco, elite army),
  Macedon (Macedon/Thessaly/Thrace, 2 eco), Satrapies (Bithynia/Galatia/Miletus, 3 eco),
  Persia (Damascus/Petra/Alexandria, 6 eco), Phoenicia (Sidon/Tyre/Cyprus, 5 eco),
  Carthage (Carthage/Thopsis/Maraka, 4 eco), Rome (Rome/Ravenna, 2 eco).

## Development

```bash
npm install
npm run dev          # dev server
npm run build        # production build -> dist/
npm run preview      # serve the build
npm test             # vitest (97 cases)
npx tsc --noEmit     # type check
npm run map:extract  # regenerate territoryPositions.ts from map.svg
```

## Deployment

GitHub Actions: `ci.yml` (build + type check on every push/PR) and `deploy.yml` (GitHub Pages on `main`).
Push to `main` → the site appears at `https://<user>.github.io/MDABJ/`.

## Reference

- Rules: `mare_nostrum/rules.pdf` (read this before changing the engine - it is authoritative).
- Map reference: `mare_nostrum/map.png`.
- Diplomacy adjudication edge cases: DATC - http://datc.sourceforge.net/
