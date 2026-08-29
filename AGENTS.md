# Circuit Sim

Circuit Sim is an environment for humans and agents to design, simulate, and understand electronic circuits together.

## What matters most?

### 1. One circuit, many interfaces

Humans need visual tools for drawing schematics, editing values, and comparing measurements. Agents need structured, text-based tools for inspecting circuits, running simulations, gathering information, and making precise changes.

Each interface should be designed for its users rather than forced into the same interaction model. All interfaces must share the same core circuit model and behavior. No interface should maintain a competing interpretation of the circuit.

### 2. One source of circuit truth

`CircuitProject` is the authoritative representation of a saved circuit. Connectivity, simulation inputs, netlists, measurements, exports, and agent-facing views should be derived from it.

Generated code and other derived representations are artifacts, not additional sources of truth. Changes should enter through validated circuit operations and be reflected everywhere that consumes the project.

### 3. Keep the human in the loop

Agents should help translate a user’s intent into circuit design, simulation, measurement, and explanation. Their conclusions should be grounded in inspectable circuit data and simulation results rather than hidden assumptions.

Automation should reduce mechanical work without obscuring what changed, why it changed, or what supports the result. The user remains responsible for intent and final decisions.

## A note on simplicity

I value ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity merely because it already exists, and do not introduce machinery because it appears architecturally impressive. Understand the real constraint, then find the smallest model that makes the correct behavior unsurprising.

Balance “measure twice, cut once” with YAGNI. Fight scope creep, understand the developer’s intent, and honor it with an implementation that is both minimal and realistic.

## A small glossary

When communicating about the project, use these terms consistently:

- **user** — the person directing the circuit work.
- **agent** — an LLM or other automated system acting on the user’s behalf.
- **interface** — a way for a human or agent to interact with Circuit Sim, such as the browser, a CLI, or MCP tools.
- **core** — the UI-independent circuit model, validation, operations, simulation, and analysis.
- **electrical projection** — a derived view of the circuit’s components, values, terminals, and connectivity without editor geometry.
- **simulation run** — the validated result of simulating one exact electrical circuit snapshot.

## Current scope

The browser editor is the only interface currently being built. Keep domain behavior independent from the browser where practical, but do not introduce speculative abstractions for MCP, CLI, or other future integrations.

Design the core so those interfaces can be added later. Implement them only when the task requires them.

## How it works

`CircuitProject` contains the saved schematic and simulation configuration. Projects and simulation runs are persisted as validated snapshots in IndexedDB.

```text
CircuitProject
├── objects: fixed components, wire polylines, and annotations
├── analysis configuration
├── project snapshots
├── electrical projection → snapshot identity and agent workspace
└── extracted connectivity → SPICE netlist → selected simulator → simulation result
```

Simulation requests cross a validated server boundary. The server generates the netlist, runs the explicitly selected SPICE engine, validates the result, and returns it to be stored with the exact project snapshot that produced it.

Components are fixed-size canonical objects with a position, quarter-turn rotation, flip flag, properties, and catalog terminals. Wires are polylines and provide the stretchable geometry between terminals. Connectivity is derived from exact shared terminal and wire-vertex coordinates. The browser may use proximity to propose snaps, but edits must commit an exact coordinate and insert a wire vertex where needed. Crossing wire interiors do not connect, and junction dots are derived UI feedback rather than saved objects.

The browser renders component and annotation SVG directly from canonical objects. Do not add a core render-scene or visual-AST model unless a second real renderer demonstrates a shared contract that cannot remain at the interface edge.

Browser hit testing, selection bounds, snap routing, handles, text formatting, and placement thresholds live under `src/browser/editor/`, not core. Browser transformations must become `CircuitEdit` values before changing a project. `PutObject`, `RemoveObjects`, and `MoveComponent` are the only edit variants; undo and redo restore in-memory project snapshots.

The minimal `newCircuitProject` constructor lives beside the canonical schema. Reusable user-facing sample circuits belong in `src/examples/`; artificial edge cases belong in `tests/fixtures/`. Examples may be shared by browser, agent, and future integration tests, but they are data built with core—not core behavior.

## Keep the core independent

Circuit modeling, validation, simulation, and analysis must not depend on React, the browser, or a particular agent protocol.

Interfaces should translate user or agent actions into shared domain operations, then present the resulting state in a form suited to that interface. Put shared behavior in the core; keep visual interaction, CLI formatting, tool schemas, and protocol details at the edges.

## Domain types and validation

Define domain models with canonical Effect v4 Schemas and derive their TypeScript types from those schemas. Do not maintain separate runtime validation and static type definitions for the same data.

Validate data when it enters the system, then let internal code operate on validated domain types. Keep validation and failure ownership close to the domain that defines the rules.

## Browser interface

Keep React components focused on interaction and presentation. Circuit rules, validation, connectivity, simulation behavior, and reusable operations belong outside the UI.

Separate temporary interface state—such as selection, tools, dialogs, and viewport state—from the saved circuit. Do not create a second UI-owned model of data already represented by `CircuitProject`.

## How to approach changes

Understand the affected types, ownership, and data flow before editing. Prefer the smallest complete mental model of the change, not merely the smallest diff.

Fix problems at their origin. Keep each failure owned in one place, and avoid adding guards or fallbacks that hide an unclear design.

Refactor adjacent code when necessary to complete the design, and remove paths that the new design supersedes. If a simple design is not clear, stop and present the options with a recommendation before editing.

## Taste

Prefer inferred types over redundant annotations. `any` is the enemy.
