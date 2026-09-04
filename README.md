# Circuit Sim

**Design circuits by conversation. Verify them by simulation. See every change.**

Circuit Sim is a shared browser workbench where a user and an agent design,
inspect, simulate, and understand the same electronic circuit. Its WebMCP tools
operate on the live schematic rather than a hidden copy: authored circuits appear
on the canvas, component highlights guide the user, and SPICE evidence returns to
the same interface.

## WebMCP challenge build

Open `/workbench` in a WebMCP-capable browser or client. The page registers four
top-level imperative WebMCP tools:

| Tool | What it does |
| --- | --- |
| `inspect_circuit` | Reads agent instructions, the component catalog, the current electrical circuit, ERC results, or the latest simulation. |
| `author_circuit` | Replaces the complete electrical graph through validated core operations. The visible edit is autosaved and undoable. |
| `simulate_circuit` | Runs the exact active snapshot through ngspice or the in-process spicey engine, persists the run, and shows measurement evidence. |
| `highlight_components` | Selects components by reference designator so the user can follow the agent's explanation on the canvas. |

The best first prompt is:

> Inspect this Circuit Sim workbench. Replace it with a 12 V voltage divider
> using 1.4 kΩ and 1 kΩ resistors, highlight both resistors, run ngspice, and
> explain the measured VOUT.

The expected result is a three-component circuit with no ERC issues and a
simulated `VOUT` of 5 V.

## Why it is safe to collaborate here

`CircuitProject` remains the sole source of circuit truth. WebMCP is a browser
interface over the same validated core operations used by the editor; it does
not maintain a second agent-owned circuit model.

- The agent must inspect and return the current circuit hash before authoring.
  Stale writes are rejected if the user changes the circuit in between.
- Inputs are validated with the canonical Effect Schemas, including component
  properties, terminal names, graph size, and analysis limits.
- Agent authoring creates one editor-history checkpoint, so the user can undo it
  in one click.
- ERC findings and exact-snapshot SPICE measurements are visible in the browser.
- Tool results use explicit tagged success and failure values with retry guidance.
- WebMCP runs as top-level page tools with `Origin-Agent-Cluster: ?1` and
  `Permissions-Policy: tools=(self)` response headers.

## Run it

### Docker (recommended)

Docker installs the native ngspice runtime used by the demo.

```sh
docker build -t circuit-sim .
docker run --rm -p 3000:3000 circuit-sim
```

Then open [http://localhost:3000/workbench](http://localhost:3000/workbench).

For a public demo, the included `render.yaml` defines a free Render web service
that builds the same Dockerfile and health-checks `/workbench`. Connect the public
repository as a Render Blueprint; no application environment variables are
required for the browser workbench or SPICE demo.

### Local development

Circuit Sim requires Node.js 24 and npm 11.

```sh
npm ci
npm run dev
```

Open [http://localhost:3000/workbench](http://localhost:3000/workbench). Install
the `ngspice` executable to use the native engine, or select `spicey` for the
in-process fallback.

## Verify it

```sh
npm test
npm run typecheck
npm run build
npm run verify:spice-runtime
```

The unit suite covers the canonical circuit model, graph compiler, WebMCP tool
boundary, editor state, persistence, simulation, MCP server, and benchmarks.

## Architecture

```text
WebMCP-capable agent             User in browser
        |                             |
        +---- WebMCP page tools ------+
                      |
             validated Effect Schemas
                      |
          canonical CircuitProject operations
             |                      |
      electrical projection      visible editor
             |
       ERC + SPICE netlist
             |
      ngspice / spicey run
             |
   exact-snapshot observations
```

The browser stores projects and simulation runs as validated snapshots in
IndexedDB. The simulation request crosses a validated server boundary. The
repository also includes an HTTP MCP interface and deterministic circuit-agent
benchmarks, built on the same core.

## Demo and submission material

- [Three-minute demo script](docs/webmcp-demo-script.md)
- [Hackathon submission copy](docs/webmcp-submission.md)
- [Circuit agent design](docs/llm-circuit-agent.md)
- [Simulation runtime](docs/simulation-runtime.md)

## License

Released under the [MIT License](LICENSE).
