# Agent Guide for MDABJ (Mare Nostrum Diplomacy Adjudicator)

## Project Overview

A **Diplomacy adjudicator** for the **Mare Nostrum** custom variant (Eastern Mediterranean, 350 BC, 8 players).
TypeScript + Vite + React, deployed to GitHub Pages.

The app is a **single game-master (GM) page**: there is no player page. The GM enters every power's
orders, build actions, retreats, research scores and economic adjustments, and then exports the save
file, a board image and a stats sheet for the players.

### What It Does

- Adjudicates Diplomacy-style orders for the Mare Nostrum variant (caravans, elite units, trade nodes, economy, research)
- Renders an interactive map (SVG background + React overlay) with units, order arrows and supply-centre markers
- Guides the GM through the four steps of a turn: **Move → Retreats → Build/Disband → Score research**
- GM tools: economic ledger, place/remove supply centres, save/load, exports (save, board, stats, turn report)

### Key Files

```
src/
  engine/
    adjudicator.ts       # Movement, combat, support, convoys, holds
    gameState.ts         # Phase machine, builds, retreats, income, supply centres
    economy.ts           # Income, banking cap (15), eco/point adjustments
    research.ts          # Research score input validation and reward bands (0-7 -> +0 to +3)
    orders.ts            # Legal order targets, support helpers
    orderText.ts         # Case/spacing-tolerant order text parsing and validation
    turnSnapshot.ts     # Safe turn-start unit state for re-adjudication
    testHelpers.ts       # makeState()/unit()/order() builders for tests
  types/
    game.ts              # PowerId, UnitType, Phase, Territory, Unit, Order, Economy, GameState
  data/
    territories.json     # 96 territories, 22 supply centres, symmetric adjacency
    gameData.ts          # Powers, starting positions, home centres
    mapConfig.ts         # Map geometry, power colours
    mapLayout.ts         # measureLabel(), provinceAnchor(), unitSlot()
    territoryPositions.ts # GENERATED: label + supply-centre-mark + black-dot coordinates
  io/
    save.ts              # Save file format (mare-nostrum-save v1), load/export
    boardExport.ts       # Board SVG/PNG + stats sheet SVG/PNG
    turnReport.ts        # Plain text turn report for Discord
  components/
    MapDisplay.tsx       # Map renderer (units, order arrows, SC markers, occupancy colours, hover)
    OrderPanel.tsx       # Paste/preview/review order text + map/unit-by-unit entry
    RetreatPanel.tsx     # Retreat decisions for dislodged units
    BuildPanel.tsx       # Build/upgrade/fortify/disband
    ResultsPanel.tsx     # Adjudication results + income
    AdminPanel.tsx       # GM tools: ledger, supply centres, files
    ResearchPanel.tsx    # Step 4: enter and review all powers' research scores (0-7 -> points)
  App.tsx                # Shell: 4-step navigation, order/build handlers, export handlers
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
   Hover shows a tooltip (name, type, supply centre, city, trade node).
5. **Adjudication**: support cuts, bounce, elite force, convoys (one army per fleet per turn), holds,
   dislodgement, retreats (adjacent, unoccupied, not the attacker's origin), build phase with
   eco costs, elite upgrade (max 2), fortify (lost when the supply centre changes hands).
6. **Economy**: trade-node income (caravan = full, military = half floored, blockaded caravan = 0),
   banking cap 15, wealth = cumulative eco, research bonuses into eco/military/diplomatic ledgers.
7. **Four-step turn UI**: the sidebar shows the steps **1 Move → 2 Retreats → 3 Build / Disband →
   4 Score research** with a short hint per step. The GM may navigate between steps freely, but
   phase-changing actions are enabled only in their proper phase to prevent skipping work or
   collecting income early. The game master tools (ledger, supply centres, files, exports) live in a
   collapsible *Game master tools* drawer at the bottom of the sidebar.
8. **Turn order**: Move (orders + adjudication) → Retreats → Build/Disband → Score research → Move.
   The engine phase machine is `orders → adjudication → retreats → builds → research → orders`;
   `createInitialState()` starts in `orders`, `advanceTurn()` ends in `research`.
9. **Re-adjudication is safe before retreats are resolved**: the GM can return to step 1 during the
   Retreats step, change an order and adjudicate again from the turn-start snapshot. Order editing is
   locked once retreats and income are resolved. A save loaded after adjudication has no in-memory
   turn-start snapshot, so re-adjudication is disabled rather than risking moving units twice.
10. **Income is collected exactly once per turn**: `collectIncome(state)` is guarded by `state.incomeTurn`.
    It is called when the retreats are resolved and again when the turn is finished - the second call
    is a no-op. The income is added to the ledger **before** the supply centre count is refreshed.
11. **Cities sustain a unit**: the small black dots of the map are cities. A city cannot host a new
    unit (builds only happen in home supply centres, rules 3.3), but every city a power occupies
    sustains one of its military units - just like a supply centre (rules 2.2). A power may therefore
    keep `supply centres + occupied cities + units paid for with eco` military units.
12. **Occupancy colours**: every occupied territory that has a supply centre **or a black dot** is
    tinted across its full province with the occupying power's colour, and its supply-centre circle
    or black city dot is recoloured too. `MapDisplay.tsx` draws the fill paths before the markers;
    `src/data/territoryFillPaths.ts` contains the map-aligned province geometry.
13. **Exports**: Save (JSON), Board (SVG + PNG), Stats sheet (SVG + PNG, with a *Cities* column),
    Turn report (txt, with a *CITIES* section).
14. **Tests**: 139 vitest cases across adjudication, order text parsing, turn snapshots, game state,
    research, save/load, turn report, DATC-style edge cases, map data and occupied-province fills. `npm run build`
    succeeds and includes the TypeScript check.

### ⚠️ Known Gaps

- `npm run lint` is currently unavailable because the repository has no ESLint configuration.
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

The whole game is played on one page. The sidebar shows the four steps of the turn, the map is on
the right, the *Game master tools* drawer is at the bottom.

1. **Start / continue**: open the *Game master tools* → *Files* → *Load save file* (a `mare-nostrum-save`
   JSON) or start a new game.
2. **Step 1 - Move**: paste a form response into *Paste order text*. Case and repeated spaces are
   ignored; use one order per line or separate orders with commas/semicolons. Choose a default power
   in *Select Power*, or label lines with a power heading such as `Athens:`. The supported forms
   include `A Athens -> Corinth`, `F Rhodes hold`, `A Corinth support A Athens`,
   `A Delphi support A Athens to Thessaly`, `F Aegean Sea convoy A Athens to Rhodes`, and
   `C Piraeus trade Corinth`. Inspect every parsed line and error, select *Review*, then explicitly
   *Apply reviewed orders*; any parse/legality error blocks the import. Alternatively expand
   *Enter or edit orders using the map* to keep using the clickable/unit-by-unit editor. Orders for
   units omitted from a paste are left unchanged. Then press *Adjudicate All Orders*.
   *Adjudicate All Orders* can be pressed again at any time - the adjudication is repeated from the
   snapshot of the start of the turn, so it is safe to change an order and adjudicate again.
3. **Step 2 - Retreats**: every dislodged unit gets buttons for the legal retreat provinces
   (adjacent, unoccupied, not the province the attacker came from). Units without a retreat are
   eliminated. *Resolve retreats & collect eco* confirms the choices and automatically collects
   trade income for every power exactly once before the Build Phase. The receipt is shown in the
   adjudication results panel.
4. **Step 3 - Build / Disband**: spend the eco points (army 6, fleet 6, caravan 4, elite upgrade 8,
   fortify 3). Free military-unit slots come from controlled supply centres and occupied cities;
   additional units may be paid for with eco. Cities sustain a unit but are never build locations.
   Disband if military units exceed supply-centre + city capacity plus eco-paid units (*Finish Turn*
   stays disabled).
5. **Step 4 - Score research**: enter a whole-number research score (0-7) and topic (economic /
   military / diplomatic) for every power; enter 0 when there was no submission. Review the complete
   ledger preview and explicitly apply it once. The rescaled reward bands are 0-3 → +0, 4-5 → +1,
   6 → +2, 7 → +3 to the matching ledger; economic research becomes eco points for the next
   build phase. The entered 0-7 value is also added to the cumulative research track. *Apply all
   scores & continue to Move* starts the next turn.
6. **Game master tools** (drawer):
   - *Ledger*: adjust eco or military/diplomatic points by hand (e.g. for a caravan the GM placed by hand).
   - *Supply centres*: switch on *Place supply centre mode*, pick the owning power, click a province.
     The same control removes a supply centre again.
   - *Files*: export **Save** (JSON), **Board** (SVG/PNG), **Stats** (SVG/PNG) and the
     **Turn report** (txt, ready to paste into Discord) and hand them to the players.

*Finish Turn* ends the turn (15 game-years pass: 350 BC → 335 BC → …, 8 turns per semester → 245 BC).

### Save file format

```jsonc
{
  "format": "mare-nostrum-save",
  "version": 1,
  "turn": 1, "year": 350, "phase": "builds",
  "territoryOverrides": { "delphi": { "isSupplyCenter": true, "homePower": "athens" } },
  "units": [...], "orders": [...], "economy": {...}, "scOwners": {...},
  "lastIncome": {...}, "incomeTurn": 1, "researchScores": {...}
}
```

`territoryOverrides` records the supply centres the GM placed so a reload restores them on top of the
built-in map data. `incomeTurn` and `lastIncome` preserve the exactly-once income guard and receipt
across reloads; the optional `researchScoresTurn` marker prevents a research batch being applied twice.

## Rules Digest (authoritative source: `mare_nostrum/rules.pdf`)

### Turn order
Research → GM scoring → Policy *(inactive)* → Diplomacy → Orders → Adjudication → Income → Retreat → Build.
The income is collected **before** the build phase, so the game master can spend it right away.
It is collected exactly once per turn (`collectIncome()` is guarded by `state.incomeTurn`).
In the app the order is presented as: **Move → Retreats → Build/Disband → Score research → Move**.

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
- A new army/fleet may use an unoccupied sustaining slot from a supply centre or an occupied city;
  additional units may be paid for with eco (rules 3.3). Caravans need 4 eco.
- Military units may not exceed controlled supply centres + occupied cities + eco-paid units -
  disband in the build phase if they do. An eco-paid unit does not consume a future free slot.
  Pending builds are charged in order: free slots are used first, then later builds cost eco.

### Research and winning
- The GM input is a small integer from 0 to 7. To preserve the previous reward cutoffs, 0-3 → +0,
  4-5 → +1, 6 → +2, and 7 → +3 to the matching ledger (eco is capped at 15). This is a UI scale
  choice, not a new rulebook interpretation; old 0-100 save-file reports remain readable.
- The entered 0-7 value itself accumulates as the research winning track; wealth = cumulative eco;
  territory = supply centres. The three tracks are combined into the final ranking.

### Supply centres
- Captured at the end of the turn. A supply centre that changes hands **loses its fortification**.

### Cities (the black dots of the map)
- The black dots/cities are **not named in the rulebook text**; I searched all 14 pages. Section 2.2
  defines the **filled circle** as the marker for a supply centre, and says it sustains one army or
  fleet. Section 2.3 defines the **gold star** as a trade node. Those sections do not define the black dots.
- Your clarified rule is: a city **cannot build a unit**, but it **can sustain one military unit**. That
  is consistent with the distinction in 3.3: new armies/fleets are built at home supply centres, while
  the support cap counts the sustaining locations. The city rule itself comes from your clarification,
  not an explicit black-dot rule in the PDF.
- Implemented as a pool: a power may keep `supply centres it controls + cities it occupies + units
  paid for with economic points` military units. A city is occupied when a unit of the power stands
  in it; the city is tagged with `"isCity": true` in `src/data/territories.json`. A city slot is only
  provided while occupied, and it does not make the city a build location.

### Documented interpretations (rules are ambiguous here)
- A caravan in a power's home centre earns the full node value (Quick Reference wording).
- A convoying fleet transports but does not support (standard Diplomacy reading).
- The "new unit type" line in the rules refers to the caravan - the game has exactly three unit types (A/F/C).

## Data Notes

- `src/data/territories.json`: 96 territories, **22** supply centres, adjacency verified symmetric.
- `src/data/territoryPositions.ts` is **generated**: `node scripts/extract-map-data.mjs`.
  It contains `TERRITORY_POSITIONS` (96), `TERRITORY_LABEL_TEXT`, `SUPPLY_CENTRE_MARKS` (22),
  `NEUTRAL_MARKS` (5) and `BLACK_DOT_MARKS` (11 city dots of the printed map).
- The black dots are **original artwork of the printed map**, not something that was added - the rulebook
  only knows the filled circle (supply centre) and the gold star (trade node). They mark the cities and
  are used to show the owner of a city in the colour of the occupying power. The 11 cities are flagged
  with `"isCity": true` in `src/data/territories.json`; a test keeps that list and the extracted
  `BLACK_DOT_MARKS` in sync.
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
npm test             # vitest (139 cases)
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
