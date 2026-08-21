# Simulation Runtime

The browser never runs the native SPICE binary. The client sends the
`CircuitProject` document to a TanStack server function, which:

1. Extracts the schematic netlist.
2. Generates a bounded ngspice transient netlist.
3. Writes a temporary `.cir` file.
4. Runs `ngspice -b -r result.raw -o ngspice.log circuit.cir`.
5. Parses ASCII rawfile traces plus ngspice log diagnostics.
6. Returns waveform traces, status, diagnostics, and suggested fixes to the UI.

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

The server blocks oversized simulations before launching ngspice.

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
temporary files should use the `spicey` fallback engine or move ngspice into a
separate worker/container service behind an authenticated internal API.
