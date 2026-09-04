# Pi MCP benchmark client

Pi does not include a native MCP client. `circuit-sim-mcp.ts` is a deliberately
small, repo-owned extension that adapts Circuit Sim's Streamable HTTP endpoint
to Pi's custom-tool API.

From the repository root, with the local benchmark stack running:

```sh
npm run benchmark:up

pi --no-builtin-tools \
  -e ./benchmarks/clients/pi/circuit-sim-mcp.ts \
  --model <provider/model> \
  "Create and simulate a 5 V equal-resistor voltage divider. Inspect the result and report VOUT with evidence."
```

The extension discovers the endpoint's schemas before registering tools and
fails fast unless the server exposes exactly:

- `inspect_circuit`
- `edit_circuit`
- `simulate_circuit`

Override the endpoint with `CIRCUIT_SIM_MCP_URL`. Pi's normal session file
captures the assistant/tool transcript; use `--no-session` for an ephemeral
manual run. This adapter is for local benchmarking only and does not modify
global Pi configuration or install an MCP package.

The reproducible runner adds unique project names, one-attempt execution,
artifact capture, and deterministic saved-state/evidence scoring:

```sh
npm run benchmark:model -- --client pi --profile smoke --model <provider/model>
```
