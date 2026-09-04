# Circuit Sim

**Design circuits by conversation. Verify them by simulation. See every change.**

Circuit Sim is a shared browser workbench where a user and an agent design,
inspect, simulate, and understand the same electronic circuit. Its WebMCP tools
operate on the live schematic rather than a hidden copy: authored circuits appear
on the canvas, component highlights guide the user, and SPICE evidence returns to
the same interface.

**Live workbench:** [circuit-sim-webmcp.onrender.com/workbench](https://circuit-sim-webmcp.onrender.com/workbench)

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

### Judge testing instructions

1. Open the deployed `/workbench` URL in ChatGPT's in-app browser or Chrome 149+
   with `chrome://flags/#enable-webmcp-testing` enabled.
2. Wait for the `Agent-ready · 4 WebMCP site tools` badge.
3. Send the prompt above and allow the page tools when the client asks.
4. Confirm that R1, R2, and V1 appear, ERC reports zero issues, and the
   Simulation panel reports `VOUT` at approximately 5 V.
5. Click Undo to verify that the complete agent-authored change is reversible.

The workbench requires no account or credentials and remains free to test.

### What changed during the challenge

Circuit Sim's initial browser-editor baseline was committed on August 21, four
days before the challenge opened on August 25. The commit history shows that the
substantive canonical-core redesign, agent workspace, and WebMCP product work
were built during the challenge period, from August 29 through September 3.
That challenge work includes:

- top-level imperative WebMCP tools over the live browser editor;
- a validated, geometry-free electrical graph compiler into `CircuitProject`;
- circuit-hash protection against stale agent writes;
- visible agent activity, semantic highlighting, one-step undo, and a stable
  `/workbench` entry point;
- exact-snapshot WebMCP simulation with evidence shown to both agent and user;
- WebMCP boundary tests, deployment headers, Docker verification, and submission
  documentation.

The history is visible from the
[`8b18591` baseline](https://github.com/Reynear/Circuit-Sim/commit/8b18591)
through the
[`9fc200e` WebMCP milestone](https://github.com/Reynear/Circuit-Sim/commit/9fc200e).

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

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2FReynear%2FCircuit-Sim)

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
- [Devpost compliance checklist](docs/devpost-checklist.md)
- [Circuit agent design](docs/llm-circuit-agent.md)
- [Simulation runtime](docs/simulation-runtime.md)

Source: [github.com/Reynear/Circuit-Sim](https://github.com/Reynear/Circuit-Sim)

## License

Released under the [MIT License](LICENSE).
