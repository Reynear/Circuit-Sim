# WebMCP hackathon submission copy

## Project name

Circuit Sim

## Tagline

Design circuits by conversation. Verify them by simulation. See every change.

## Elevator pitch

Circuit Sim turns a browser schematic into a shared workbench for people and AI.
Ask an agent to design, revise, simulate, or explain a circuit; WebMCP lets it
operate on the exact circuit displayed on the page, while validated topology,
electrical-rule checks, undo history, autosave, and SPICE results keep every
change visible and inspectable. There is no brittle mouse automation and no
hidden agent copy—the user and agent collaborate on one canonical circuit.

## Inspiration

Electronic design tools are built for people manipulating visual schematics.
Agents, meanwhile, are most reliable when they receive structured state and can
perform precise semantic actions. Forcing either participant through the other's
interface creates fragile automation or an opaque parallel model. Circuit Sim
was built around a simpler idea: one circuit, with a visual interface for the
user and WebMCP tools for the agent.

## What it does

Circuit Sim exposes four page-native WebMCP tools. An agent can inspect the live
circuit and component catalog, author a complete validated electrical graph,
highlight components on the canvas, and run SPICE against the exact active
snapshot. The resulting schematic remains a normal editable project. Agent
changes are visible, autosaved, and undoable, while ERC findings and measured
voltages, currents, and power appear in the same browser interface.

## How we built it

The application is TypeScript, React, TanStack Start, Effect, IndexedDB, and
ngspice/spicey. A canonical `CircuitProject` owns schematic objects and analysis
configuration. Circuit connectivity, electrical projections, circuit hashes,
SPICE netlists, and observations are derived from that project.

The page registers imperative `document.modelContext` tools. Effect Schemas are
converted to JSON Schema for discovery and decode every tool invocation at the
boundary. Authoring takes a geometry-free electrical graph, validates component
properties and terminal references, and compiles it into canonical components,
wires, labels, and ground objects through one editor mutation. Simulation uses
the existing validated server boundary and persists the run together with the
snapshot that produced it.

## How we use WebMCP

WebMCP is the product interface, not a decorative integration. It gives the
agent live structured context and actions that are difficult to express safely
through clicking: exact topology inspection, whole-circuit authoring,
snapshot-bound simulation, and semantic component highlighting. Tool activity
also drives the human interface by selecting objects, opening the relevant
panel, and showing concise status feedback.

## Trust and safety

Authoring requires the circuit hash returned by inspection. If the user edits
the project before the tool call arrives, Circuit Sim rejects the stale write.
All tool inputs cross canonical runtime validation; writes enter through editor
history and remain one-click undoable; and simulation conclusions are grounded
in stored, inspectable evidence from an exact project snapshot.

## Challenges

The central design challenge was avoiding two sources of truth. Agent-friendly
graphs intentionally omit browser geometry, but their compilation still had to
produce the exact canonical objects and connectivity used by manual editing,
ERC, persistence, and simulation. A second challenge was making WebMCP actions
feel collaborative: the page needs to visibly explain what happened rather than
silently mutate state behind the user's canvas.

## Accomplishments

- Four working top-level WebMCP tools over the live editor
- Deterministic graph-to-schematic compilation with exact connectivity
- Optimistic circuit-hash concurrency protection
- One-step undo for whole-circuit agent edits
- Native ngspice and in-process spicey execution
- Exact-snapshot simulation persistence and bounded observations
- 881 passing automated tests plus TypeScript and production-build validation

## What we learned

Good agent tools do not mirror every UI control. They expose the smallest
semantic operations that preserve the product's domain rules. WebMCP made it
possible to give the agent a circuit-native interface while keeping user-facing
state, feedback, and control in the browser.

## What's next

Next we would add proposal previews before large edits, structured circuit
diffs, measurement-goal optimization, datasheet-assisted component selection,
and collaborative explanations that highlight the relevant current path while
the simulation timeline is scrubbed.

## Links to fill before submission

- Live application: `TODO`
- Public source repository: `TODO`
- Public YouTube demo (under three minutes): `TODO`
