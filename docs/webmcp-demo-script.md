# Circuit Sim WebMCP demo script

Target length: 60–90 seconds. Record the actual Codex desktop app with its
in-app browser open beside the task and add human narration.

## 0:00–0:20 — The problem

Show the empty `/workbench` canvas and the `Agent-ready` badge.

> Circuit design tools are visual, but agents need structured, reliable actions.
> Circuit Sim lets both work on one circuit. WebMCP gives the agent semantic
> tools while every change stays visible to the person.

## 0:20–0:40 — Discover the tools

Show the browser or ChatGPT site-tool list. Briefly point out:

- `inspect_circuit`
- `author_circuit`
- `simulate_circuit`
- `highlight_components`

> These are top-level WebMCP tools registered by the page—no screenshots, pixel
> coordinates, or brittle UI automation.

## 0:40–1:35 — Design by conversation

Send this prompt:

> Inspect this Circuit Sim workbench. Replace it with a 12 V voltage divider
> using 1.4 kΩ and 1 kΩ resistors, highlight both resistors, run ngspice, and
> explain the measured VOUT.

Keep the canvas visible as the circuit appears. Point out the empty ERC list,
selected R1/R2, enabled Undo button, and opened Simulation panel.

> The authoring tool accepts a geometry-free electrical graph. Circuit Sim
> validates it, compiles it into the canonical project, and lays it out as an
> ordinary editable schematic. The user can undo the entire agent edit once.

## 1:35–2:05 — Evidence, not a guess

Show the simulation panel and waveform.

> ngspice measured VIN at 12 volts and VOUT at 5 volts. The agent receives these
> bounded observations from the exact project snapshot, including resistor
> currents and power—not a result inferred from the drawing.

Zoom briefly to the component inspector or voltage trace.

## 2:05–2:30 — Trust and potential

Undo, then redo, or make a quick user edit and mention the circuit-hash guard.

> If the user changes the circuit after inspection, stale agent writes are
> rejected. Circuit Sim keeps the human in the loop while eliminating mechanical
> schematic work. The same pattern can grow into teaching, debugging, design
> review, and verified hardware workflows.

End on the full circuit and tagline:

> Design circuits by conversation. Verify them by simulation. See every change.

## Recording checklist

- Use a clean browser profile and close unrelated tabs and notifications.
- Start with a fresh workbench or click Undo until the canvas is empty.
- Confirm the `Agent-ready · 4 WebMCP site tools` badge before recording.
- Confirm ngspice is available and run the prompt once before the final take.
- Keep the final video under three minutes and include audible narration.
- Upload it publicly to YouTube, then test the link in an incognito window.
