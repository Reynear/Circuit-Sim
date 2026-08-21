# Agent instructions

This repo is a TanStack Start + React + TypeScript circuit design MVP.

## Architecture rules

- Do not use React Flow for the schematic editor.
- The schematic editor must be a custom SVG/EDA scene graph.
- The source of truth is `CircuitProject`, not generated tscircuit code.
- Generated tscircuit TSX is an artifact.
- IndexedDB persistence uses Dexie.
- Stable internal IDs use `nanoid` with entity prefixes.
- Prefer pure TypeScript domain modules for geometry, net extraction, ERC, and code generation.
- Keep React components thin; put circuit logic in `src/lib`.

## Verification

Before finishing a task, run:

```bash
npm run typecheck
npm run test
```

If a test cannot be run because the project setup is incomplete, explain what failed and why.
