# MDABJ
## **M**are **N**ostrum **D**iplomacy **A**djudicator **B**y **J**axon

A Diplomacy adjudicator for the **Mare Nostrum** custom variant, built with TypeScript, React, and Vite.

### Features
- Full Diplomacy-style adjudication engine
- Support for Mare Nostrum's custom rules:
  - 3 unit types: Armies, Fleets, Caravans
  - Elite units (force 2, require force 3+ to dislodge)
  - Trade nodes and economic system
  - Trade route movement for Caravans
- Custom map support (SVG-based)
- GM-first workflow with case-insensitive pasted orders, line-by-line validation, and an explicit review/apply step (plus clickable map entry)
- Automatic, exactly-once trade income collection after retreats
- Reviewed 0-7 research scoring with a preview of ledger awards
- Deployable to GitHub Pages

### Development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

The built site is output to `dist/` and deployed to GitHub Pages via GitHub Actions.

### Project Structure

```
src/
  engine/        # Core adjudication logic (no UI dependencies)
  types/         # TypeScript type definitions
  components/    # React UI components
  data/          # Map and game data (JSON)
  utils/         # Shared utilities
```

### Mare Nostrum Rules

See 
[mare_nostrum/rules.pdf](./mare_nostrum/rules.pdf)
for the complete ruleset.
