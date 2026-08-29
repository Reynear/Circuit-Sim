# Simulation Runtime

The browser never runs the native SPICE binary. The client sends the
`CircuitProject` document to a TanStack server function, which:

1. Decodes the unversioned canonical project schema.
2. Generates `ElectricalCircuit` and a transient SPICE netlist from it.
3. Applies the same runtime preflight limits for either explicit engine choice.
4. Runs the selected `spicey` engine, or writes a temporary `.cir` file and
   runs `ngspice -b -r result.raw -o ngspice.log circuit.cir`.
5. Size-checks ngspice output files before reading and parses transient signals
   plus diagnostics.
6. Returns `SimulationOutput`; the client derives status from diagnostics and
   persistence adds run identity, time, and project-snapshot linkage.

## Code boundaries

- `packages/core/src/circuit/` owns the canonical project, electrical
  projection, exact-coordinate connectivity, and the small schema-derived
  `CircuitEdit` algebra. It does not own hit testing, selection bounds, snap
  routing, SVG glyphs, or a renderer scene model.
- `packages/core/src/simulation/` owns netlist generation and the canonical
  simulation input/output types.
- `src/server/simulation/run-simulation.server.ts` owns engine selection and
  shared preflight policy.
- `src/server/simulation/engines/` owns Spicey execution, native ngspice
  process/files, and ngspice-specific output parsing.
- `src/server/simulation/spice.functions.ts` only decodes the request and
  encodes the result at the TanStack boundary.
- `src/browser/simulation/` owns browser Atom orchestration and persistence of
  the returned run; it does not execute a solver.
- `src/browser/editor/` owns interaction geometry, proximity-based snap
  proposals, gesture state, and editor orchestration. Every project change is
  expressed as `PutObject` or `RemoveObjects` before applying.
- `src/features/editor/` owns direct SVG rendering, hit areas, previews, and the
  consolidated visual overlays.

The core package typechecks without React, DOM, Node, Dexie, TanStack, or
simulator dependencies. Core and server tests use Node; browser tests alone use
jsdom.

Local development looks for `NGSPICE_BIN` first, then common Homebrew/Linux
paths. Production should ship ngspice in the server image. The included
`Dockerfile` installs Debian's `ngspice` package in the runtime image.

To validate the reference runtime locally:

```bash
npm run verify:spice-runtime
```

The check builds the production Docker image and runs `ngspice --version` inside
the container. It requires a running Docker daemon.

## Runtime Limits

The server blocks oversized simulations before launching either engine.

| Environment variable | Default |
| --- | ---: |
| `SPICE_MAX_OBJECTS` | `300` |
| `SPICE_MAX_NETS` | `250` |
| `SPICE_MAX_DURATION_MS` | `60000` |
| `SPICE_MIN_TIME_STEP_MS` | `0.001` |
| `SPICE_MAX_ESTIMATED_POINTS` | `50000` |
| `SPICE_MAX_NETLIST_BYTES` | `250000` |
| `NGSPICE_TIMEOUT_MS` | `15000` |
| `NGSPICE_MAX_OUTPUT_BYTES` | `4194304` |

Keep these limits conservative for shared deployments. The goal is reliable
interactive simulation, not unbounded batch analysis.

## Hosted Deployment

Use a Node server runtime that can spawn child processes and write temporary
files. The included `Dockerfile` is the reference deployment shape: build the
TanStack app, install the native `ngspice` package in the runtime image, and run
`vite start` with `HOST=0.0.0.0`.

Serverless runtimes that disallow `child_process.spawn`, native binaries, or
temporary files must select `spicey` explicitly or move ngspice into a separate
worker/container service behind an authenticated internal API. The server never
substitutes one engine for another.
