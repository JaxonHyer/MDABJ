# Agent Guide for MDABJ (Mare Nostrum Diplomacy Adjudicator)

## Project Overview

This is a **Diplomacy adjudicator** for the **Mare Nostrum** custom variant, set in the Eastern Mediterranean circa 350 BC. It's built with TypeScript + Vite + React and deploys to GitHub Pages.

### What This Project Does

- Adjudicates Diplomacy-style orders for a custom 8-player game
- Supports Mare Nostrum's unique rules: Caravans, Elite units, Trade nodes, Economic system
- Renders an interactive SVG map with unit positions and order visualization
- Allows entering orders for all powers and resolving them simultaneously

### Key Files

```
src/
  engine/
    adjudicator.ts       # Core adjudication logic (movement, combat, support, convoys)
    gameState.ts         # State management helpers
  types/
    game.ts              # TypeScript types (Power, Unit, Territory, Order, etc.)
  data/
    territories.json     # 90+ territories with adjacencies, supply centers, trade nodes
    gameData.ts          # Power definitions and starting positions
  components/
    MapDisplay.tsx       # SVG map renderer
    OrderPanel.tsx       # Order entry UI
    PowerSelector.tsx    # Power selection
    ResultsPanel.tsx     # Adjudication results display
  App.tsx                # Main app component
public/
  map.svg                # Inkscape SVG map (NEEDS FIX - see below)
mare_nostrum/
  rules.pdf              # Complete rules document
  map.png                # Reference PNG map
  map.svg                # Original SVG (same issue as public/map.svg)
```

## Current State (As of Last Commit)

### ✅ What Works

1. **Complete territory graph**: 90+ territories with adjacencies defined in `territories.json`
2. **Starting positions**: All 8 powers with correct units per rules Section 7
3. **Order entry UI**: Select power → select unit → choose order type → select target
4. **Adjudication engine**: Basic movement resolution, support cutting, elite units, convoys
5. **TypeScript types**: Full type definitions for game state
6. **Build system**: Vite + React + TypeScript, builds cleanly
7. **CI/CD**: GitHub Actions for CI and GitHub Pages deployment

### ⚠️ Known Issues & Incomplete Features

#### 1. **CRITICAL: SVG Map Display Issue**

**Problem**: The SVG only shows a tiny sliver of the map instead of the full view.

**Root Cause**: The SVG's `viewBox` attribute is set to `0 0 28.111067 63.577217`, but the actual content (paths, labels, embedded image) uses much larger coordinates. From the label positions:
- x coordinates range from ~-448 to ~1327
- y coordinates range from ~26 to ~791

**Fix Required**:
```svg
<!-- Current (WRONG) -->
<svg viewBox="0 0 28.111067 63.577217" ...>

<!-- Should be (CORRECT) -->
<svg viewBox="-500 0 1900 850" ...>
```

Edit `public/map.svg` and `mare_nostrum/map.svg` to fix the viewBox. The exact values may need tweaking, but something like `-500 0 1900 850` should work.

#### 2. **Unit Rendering on Map**

**Current**: Units are listed in the OrderPanel but not visually shown on the map.

**Needed**: 
- Render unit markers (A, F, C) on the map at their territory positions
- Show Elite units with a special marker (★ or outline)
- Color units by their power's color
- Use the label coordinates from the SVG to position units

**Implementation approach**:
- Extract label positions from SVG (already done in analysis - see territory coordinates)
- Create a coordinate mapping: `territoryId -> {x, y}`
- Render SVG elements (circles/rectangles with text) at those coordinates
- Overlay on top of the map image

#### 3. **Order Visualization**

**Current**: Orders are entered via dropdowns but not shown on the map.

**Needed**:
- Draw arrows for move orders (from unit's territory to target)
- Draw support indicators (dashed lines or brackets)
- Draw convoy routes
- Color-code by success/failure after adjudication

**Implementation approach**:
- Add SVG `<line>` or `<path>` elements for each order
- Use different colors/styles for different order types
- Show results after adjudication (green = success, red = failure)

#### 4. **Retreat and Build Phases**

**Current**: Only the movement/orders phase is implemented.

**Needed** (per rules Section 4):
- **Retreat phase**: Dislodged units must retreat to valid adjacent territory or be eliminated
- **Build phase**: Spend economic points to build new units or upgrade to Elite
- **Disband**: If units > supply centers, must disband

**Implementation approach**:
- Add phase state machine: `orders -> adjudication -> retreats -> builds -> complete`
- Retreat logic: Calculate valid retreat destinations (adjacent, unoccupied, not from attacker's territory)
- Build logic: Validate economic costs, home center availability
- UI for each phase

#### 5. **Economic System**

**Current**: Economic points are tracked but not calculated from trade nodes.

**Needed** (per rules Section 4.7):
- Caravans at trade nodes generate full income
- Military units at trade nodes generate half income (rounded down)
- Blockaded caravans generate 0 income
- Banking cap of 15 points

**Implementation approach**:
- Add `calculateIncome(gameState)` function
- Iterate through trade nodes, check occupying units
- Update economy after adjudication phase

#### 6. **Clickable Map Provinces**

**Current**: Map is just an image, not interactive.

**Needed**:
- Make territories clickable (click to select unit, click adjacent to move)
- Hover effects to highlight territories
- Show territory info on hover (name, type, supply center, trade node)

**Implementation approach**:
- Use SVG paths from the "Border Lines" layer
- Add `onClick` and `onMouseEnter` handlers
- Highlight selected territory and valid move targets

#### 7. **Adjudication Edge Cases**

**Current**: Basic adjudication works, but Diplomacy has many edge cases.

**Needed** (from DATC - Diplomacy Adjudicator Test Cases):
- Circular convoys (convoy paradoxes)
- Support cutting from the territory being supported into
- Self-standoff scenarios
- Dislodged unit back-into-attacker scenarios
- Multiple convoys and convoy disruption

**Implementation approach**:
- Reference DATC test cases: http://datc.sourceforge.net/
- Add unit tests for edge cases
- Implement proper convoy disruption logic

#### 8. **Save/Load Game State**

**Current**: Game state is lost on page refresh.

**Needed**:
- Serialize game state to JSON
- Save to localStorage or download as file
- Load from file or URL parameter

## Architecture Notes

### Adjudication Engine (`src/engine/adjudicator.ts`)

The adjudicator follows this flow:
1. **Resolve support cuts**: Check if any supporting units are attacked
2. **Resolve movements**: Calculate attack/defense force for each move
3. **Resolve dislodgements**: Mark units that must retreat

Key rules:
- Attack force = unit force (1 or 2 for elite) + uncut support
- Defense force = defender force + uncut support
- Attack succeeds only if attack > defense (equal = bounce)
- Elite units count as force 2 but support can still be cut

### Territory Data (`src/data/territories.json`)

Each territory has:
- `id`: Unique identifier (snake_case)
- `name`: Display name
- `type`: "land" | "sea" | "coastal"
- `isSupplyCenter`: Whether it's a supply center
- `homePower`: Which power it's a home center for (or null)
- `isTradeNode`: Whether it's a trade node
- `tradeNodeValue`: Eco points per turn (if trade node)
- `adjacent`: Array of adjacent territory IDs
- `tradeRoutes`: Array of connected trade node IDs (for caravans)

### Game State (`src/types/game.ts`)

```typescript
interface GameState {
  turn: number;
  year: number;           // BC year, starts at 350
  phase: Phase;           // 'orders' | 'adjudication' | 'retreats' | 'builds' | 'complete'
  territories: Record<string, Territory>;
  units: Unit[];
  orders: Order[];
  results: AdjudicationResult[];
  economy: Record<PowerId, { eco: number; supplyCenters: number }>;
  activePower: PowerId | null;
}
```

## Development

```bash
npm install
npm run dev      # Start dev server with hot reload
npm run build    # Build for production (outputs to dist/)
npm run preview  # Preview production build
```

## Deployment

The project uses GitHub Actions:
- **CI** (`.github/workflows/ci.yml`): Runs on every push/PR, builds and type-checks
- **Deploy** (`.github/workflows/deploy.yml`): Deploys to GitHub Pages on push to `main`

To deploy:
1. Push to `main` branch
2. GitHub Actions will build and deploy to `gh-pages` branch
3. Site will be available at `https://<username>.github.io/MDABJ/`

## Mare Nostrum Rules Summary

### Powers (8 total)
- **Athens** (green): Naval power, controls Piraeus
- **Sparta** (blue): Land power, starts with Elite Hoplites
- **Macedon** (tan): Northern power, 3 supply centers
- **Satrapies** (orange): Trojan territory, 3 supply centers
- **Persia** (brown): Largest power, controls Egypt
- **Phoenicia** (purple): Commercial powerhouse
- **Carthage** (yellow): Western anchor, navy-focused
- **Rome** (red): Weakest start, highest growth potential

### Unit Types
- **Army (A)**: Moves on land, can be convoyed by fleets
- **Fleet (F)**: Moves on sea/coast, can transport armies
- **Caravan (C)**: Moves along trade routes, generates income at trade nodes

### Elite Units
- Count as force 2 in attack and defense
- Require force 3+ to dislodge
- Support can still be cut with a single attack
- Max 2 per power
- Cost 8 Eco to upgrade

### Combat
- Attack force must be **strictly greater** than defense force to dislodge
- Equal forces = bounce (neither moves)
- Support adds +1 to force (or +2 for elite supporters)
- Support is cut if supporter is attacked from any direction except the territory being supported into

### Economic System
- **Caravan at trade node**: Full income (node value)
- **Military unit at trade node**: Half income (rounded down)
- **Blockaded caravan**: 0 income
- **Banking cap**: Max 15 Eco points between turns

### Unit Costs
- Army: 6 Eco or 1 supply center
- Fleet: 6 Eco or 1 supply center (coastal home center)
- Caravan: 4 Eco (at trade node or home center)
- Elite upgrade: 8 Eco (max 2 per power)

## Next Steps Priority Order

1. **Fix SVG viewBox** (critical - map is unusable)
2. **Render units on map** (visual feedback)
3. **Add order visualization** (arrows, support indicators)
4. **Make map clickable** (better UX)
5. **Implement retreat phase** (complete game flow)
6. **Implement build phase** (complete game flow)
7. **Add economic calculation** (trade income)
8. **Save/load functionality** (persistence)
9. **Adjudication edge cases** (robustness)
10. **Polish and UX improvements** (tooltips, animations, etc.)

## Questions?

If you're unsure about a rule, check `mare_nostrum/rules.pdf`. For Diplomacy adjudication edge cases, see the DATC: http://datc.sourceforge.net/

The original map reference is `mare_nostrum/map.png` - use it to verify territory positions and adjacencies.
