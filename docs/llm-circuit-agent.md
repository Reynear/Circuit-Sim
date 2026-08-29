# Bare-Bones LLM Circuit Agent

## Status

Design agreed after review. This document defines the smallest useful agent environment for inspecting and troubleshooting a circuit. It does not define provider integration, chat persistence, or autonomous circuit editing.

## Goal

The agent should troubleshoot a circuit using the same basic loop as a person:

1. Inspect a component and its electrical neighborhood.
2. Measure relevant voltages, currents, and waveforms.
3. Form a hypothesis from those measurements.
4. Test one temporary change.
5. Compare the baseline and experimental results.
6. Separate measured facts, derived values, and conclusions.

The agent must be able to reach every circuit definition and supported measurement without receiving the entire project or every waveform point in its prompt.

## Core model

`CircuitProject` is the only editable source of truth. Everything electrical is
generated from it, and every stored run is linked to the exact project document
that produced it.

```text
CircuitProject                          editable + persisted source
    +-- objects                         fixed components, wire polylines, annotations
    +-- analysis                        transient duration + step
    |
    +-- buildElectricalCircuit()
    |     +-- ElectricalCircuit         typed behavior + terminals + nets
    |     +-- circuitHash               geometry-free electrical identity
    |     +-- circuit.txt               agent-facing rendering
    |     +-- SPICE netlist             consumes ElectricalCircuit + analysis
    |
    +-- ProjectSnapshot                 immutable exact CircuitProject document
          +-- SimulationRun             one flat stored run
                +-- projectSnapshotId
                +-- circuitHash
                +-- engine + netlist + signals + diagnostics + notes

Simulator boundary: SimulationOutput   run fields without id/time/project linkage
```

Invariants:

- `CircuitProject` has no domain version and no alternate persisted shape. The
  current schema is decoded directly from a fresh IndexedDB namespace; legacy
  documents are neither read nor migrated.
- `circuit.txt`, the circuit hash, and the SPICE netlist all consume the same
  `ElectricalCircuit`. Component properties and connectivity are not
  reinterpreted independently by each consumer.
- A `ProjectSnapshot` identifies the exact saved document, including geometry
  and analysis settings. A `circuitHash` answers the narrower electrical
  question and intentionally excludes presentation geometry and the project name.
- Every measurement — canvas, panel, or agent — comes from a validated simulation run. There is no separate heuristic or approximate measurement path.
- A simulator returns `SimulationOutput`; persistence adds ownership metadata
  once to create `SimulationRun`. Status is derived from diagnostics and is not
  another stored field.
- Engine selection is explicit. There is no solver fallback or compatibility path.

## Agent workspace

The initial workspace contains only two files.

```text
/README.md
/circuit.txt
```

Simulation results are addressed by immutable run IDs through the `circuit` command. They do not become additional files initially.

Probes are a UI-only measurement convenience. They do not appear in `circuit.txt`, in agent-facing net listings, or in the agent vocabulary. The agent has `observe` and `trace` instead.

### Circuit identity

A circuit hash is the content hash of `ElectricalCircuit` — connectivity plus
typed component behavior, excluding editor geometry. The hash is computed over
the structured circuit, not formatted `circuit.txt`, so text formatting changes
never spuriously invalidate runs.

The domain question it answers is: *are these measurements measurements of this
electrical circuit?* Moving a component on the canvas does not change the hash
and must not invalidate a run. Any connectivity or electrical-behavior change does.

### `/README.md`

The README is a concise technical reference. It documents:

- the `circuit.txt` notation,
- command availability and syntax,
- voltage, current, and power conventions,
- snapshot and run semantics,
- temporary override behavior,
- supported analyses, models, and limitations.

It must not contain a detailed troubleshooting procedure. Troubleshooting behavior belongs in the system prompt.

Suggested content:

```md
# Circuit analysis workspace

`circuit.txt` describes the current circuit snapshot.

## Circuit notation

Each component uses:

REFDES TYPE PARAMETERS [MODEL] | PIN=NET PIN=NET

Example:

Q1 npn beta=100 [model=simplified] | B=BASE C=LOAD E=GND

Terminals with the same exact net identifier are directly connected.
`NC` means a terminal is not connected to an extracted electrical net.

## Commands

circuit show
circuit component <component>
circuit around <component>
circuit net <net>
circuit connected <terminal> <terminal>
circuit path <start> <end>
circuit islands
circuit simulate op
circuit simulate tran
circuit observe <component> [--run <run>] [--at <time>]
circuit trace <signals...> [--run <run>] [--from <time>] [--to <time>]
circuit simulate <op|tran> --set <component.property=value>...

Run `circuit help <command>` for command details.

## Measurements

Voltages are relative to ground unless another reference is shown.
Terminal current is positive when flowing into the component.
Power is positive when absorbed and negative when delivered.

Every measurement identifies its simulation run and circuit snapshot.
Measurements from an older snapshot are not measurements of the current circuit.

Model parameters are not measured values. For example, configured transistor
beta and measured Ic/Ib can differ.

## Temporary simulations

`--set` creates simulation-only overrides. It never changes the saved circuit.

## Simulator capabilities

Supported and unsupported analyses, components, and measurements are reported
explicitly. An unavailable measurement is never represented as zero.
```

### `/circuit.txt`

`circuit.txt` is a compact, line-oriented representation of the complete electrical circuit. Each component occupies one line so the file is easy to read and search.

```text
CIRCUIT "NPN Switch"
HASH 8f13c2

ANALYSIS tran duration=10ms step=10us

V1 dc-voltage-source V=5V [model=ideal] | +=VCC -=GND
VIN pulse-source low=0V high=5V [model=ideal] | +=DRIVE -=GND
RB resistor R=10kOhm [model=ideal] | 1=DRIVE 2=BASE
Q1 npn beta=100 [model=simplified] | B=BASE C=LOAD E=GND
RL resistor R=330Ohm [model=ideal] | 1=VCC 2=LOAD
LED1 led color=red [model=simplified] | A=LOAD K=GND
```

The file excludes editor geometry, wire points, generated TSX, raw `CircuitProject` JSON, and raw simulator output.

### Component line grammar

```text
REFDES TYPE PARAMETERS [MODEL] | PIN=NET PIN=NET
```

Rules:

- Use human-facing reference designators and terminal names.
- Use conventional engineering units such as `10kOhm`, `100nF`, and `5V`.
- Use short stable names such as `N1` for unnamed nets.
- Show every electrical terminal; use `NC` rather than omitting an unconnected terminal.
- Omit internal property names such as `resistanceOhms` from agent-facing text.
- Include active switch and logic-input states.
- Include model fidelity so the agent knows how strongly it can trust a simulation.

Model fidelity markers:

```text
[model=ideal]
[model=simplified]
[model=part:2N3904]
[model=unsupported]
```

## Static component representations

```text
R1 resistor R=10kOhm [model=ideal] | 1=VCC 2=BASE
C1 capacitor C=100nF [model=ideal] | 1=BASE 2=GND
L1 inductor L=10mH [model=ideal] | 1=VIN 2=VOUT

S1 switch state=open [model=ideal] | 1=VIN 2=LOAD

V1 dc-voltage-source V=5V [model=ideal] | +=VCC -=GND
V2 sine-voltage-source peak=2V frequency=1kHz [model=ideal] | +=VIN -=GND
I1 dc-current-source I=1mA [model=ideal] | +=OUT -=GND

D1 diode model=DDEFAULT [model=simplified] | A=VIN K=VOUT
LED1 led color=red [model=simplified] | A=LOAD K=GND

Q1 npn beta=100 [model=simplified] | B=BASE C=LOAD E=GND
Q2 pnp beta=100 [model=simplified] | B=BASE C=LOAD E=VCC

M1 nmos threshold=2V [model=simplified] | G=GATE D=LOAD S=GND
M2 pmos threshold=-2V [model=simplified] | G=GATE D=LOAD S=VCC

U1 opamp gain=100k rails=-15V..15V [model=ideal] | -=INV +=NINV OUT=OUTPUT V+=VCC V-=VEE

IN1 logic-input state=high high=5V low=0V [model=ideal] | OUT=DRIVE
OUT1 logic-output threshold=2.5V required-current=0A | IN=LOAD
U2 and-gate inputs=2 high=5V [model=ideal] | A=A B=B Y=OUT
U3 inverter high=5V [model=ideal] | A=IN Y=OUT
```

These names are an agent-facing vocabulary. They should be generated from the canonical component definitions rather than maintained as a second component registry.

## Host architecture

The core transformations are pure and schema-backed in the
`@circuit-sim/core` workspace package:

```text
packages/core
    CircuitProject -> ElectricalCircuit -> AgentWorkspace -> interpret(command)
                             |
                             +-> SPICE netlist

browser                                      server
    React + Atom editor state                   validated TanStack boundary
    Dexie project snapshots                     runtime preflight
    DOM export adapters                         spicey | native ngspice
```

`extractNetlist` remains an internal connectivity algorithm. It is not a second
public domain model: `buildElectricalCircuit` owns its output, and electrical
consumers use `ElectricalCircuit`. UI-only probe and wire highlighting may use
the extraction details while rendering.

The browser Agent Console is the only current command front. It invokes the
same pure interpreter an eventual agent interface could use, but no CLI or MCP
runtime exists yet. A future interface should consume `@circuit-sim/core`
directly instead of introducing another circuit representation.

The long-term direction is agents that verify and create circuits from user requests. The near-term goal is narrower: validate that an agent analyzing a user-created circuit has enough context and answers correctly.

### Validation loop

- **Layer 1 — tool truth (no LLM):** golden circuits (voltage divider, RC, LED switch, one intentionally broken) with known answers. Vitest assertions over command outputs: `observe` values match hand-calculated numbers, `net`/`path` match known topology, unsupported components report diagnostics rather than zeros. Fully deterministic.
- **Layer 2 — agent adequacy (LLM):** for each golden circuit, a small question set ("why is the LED dim?", "is Q1 saturated?"). Run an agent with only the three tools and capture its tool-call sequence and answer. Failures are graded as either a context-sufficiency gap (a tool-surface problem) or an answer-correctness problem (an honest-measurement or prompt problem).
- **Layer 3 — later:** agent-driven circuit creation and correction, once analysis is validated.

BJT troubleshooting questions stay out of the golden set until the simulator can measure BJTs honestly.

## Workspace tools

The initial agent receives three tools.

### `read_file`

Reads a bounded range with line numbers.

```text
read_file path=/README.md
read_file path=/circuit.txt start_line=1 line_count=100
```

Large files must be read in chunks rather than injected into the prompt automatically.

### `search_text`

Provides constrained, grep-like discovery over workspace text.

```text
search_text pattern="Q1" path=/circuit.txt
search_text pattern="=BASE" path=/circuit.txt
search_text pattern="observe" path=/README.md
```

Output remains plain text:

```text
/circuit.txt:8: RB resistor R=10kOhm [model=ideal] | 1=DRIVE 2=BASE
/circuit.txt:9: Q1 npn beta=100 [model=simplified] | B=BASE C=LOAD E=GND
```

The tool should support:

- literal search by default,
- optional regular expressions,
- optional case sensitivity,
- optional surrounding context lines,
- a result limit,
- an explicit truncation message.

Text search is for discovery, not proof of electrical connectivity. Exact electrical questions use `circuit` commands.

### `circuit`

Provides semantic circuit queries and simulation access. It is not a general shell and does not expose host files, environment variables, processes, or network access.

## Topology commands

### Show a component

```text
> circuit component R1

R1 resistor R=1kOhm [model=ideal]
  1 -> VIN
  2 -> VOUT
```

### Show a net

```text
> circuit net VOUT

NET VOUT
  R1.2
  C1.1
```

### Verify direct connectivity

```text
> circuit connected R1.2 C1.1

YES
R1.2 and C1.1 are on VOUT.
```

The command must distinguish direct same-net connection from a path through components.

### Show a component neighborhood

```text
> circuit around Q1

Q1 npn beta=100 [model=simplified]
  B -> BASE
    RB.2 resistor R=10kOhm
  C -> LOAD
    RL.2 resistor R=330Ohm
    LED1.A led color=red
  E -> GND
    V1.-
    VIN.-
    LED1.K
```

### Show a path

```text
> circuit path VIN GND

PATH 1
VIN -> R1 -> VOUT -> C1 -> GND

PATH 2
VIN -> V1 -> GND
```

A path alternates between nets and components. It does not by itself prove that current flows under a specific condition. Path enumeration is bounded; beyond the limit the output is truncated with an explicit message, using the same policy as `search_text`.

### Show disconnected regions

```text
> circuit islands

REGION 1 grounded
  nets: VIN VOUT GND
  components: V1 R1 C1
```

## Simulation runs

Runs are immutable and identify their exact project snapshot.

```text
> circuit simulate tran

RUN tran-1
snapshot=8f13c2 engine=ngspice status=success
range=0..10ms step=10us
```

If the project changes, a previous run remains associated with its old snapshot and must not be presented as a measurement of the current project.

A run stores terminal-level signals keyed by canonical signal names (`V(Q1.B)`, `I(Q1.C)`, `Vbe(Q1)`, `P(Q1)`), not display-shaped traces. Traces and observations are pure views over run signals: lookup by signal name, read at a time, compute statistics. Display components in the app read the same run store; the canvas shows values from the latest run and marks them stale when the current circuit hash differs from the run's.

The bare-bones environment supports:

- DC operating point (`op`),
- transient analysis (`tran`).

Additional analyses should not be advertised until implemented. There is exactly one solver path per engine choice: if the requested engine is unavailable, the run fails with an explicit error. No silent engine fallback.

## Universal observation format

Every modeled component uses the same outer structure.

```text
COMPONENT <definition>
RUN <run> snapshot=<snapshot> analysis=<analysis> [time=<time>]

TERMINALS
<pin> <net> V=<voltage> I=<current>

VALUES
<component-specific objective quantities>

DIAGNOSTICS
<warnings, model limits, or unavailable measurements>
```

Conventions:

- Terminal voltage is relative to ground unless another reference is named.
- Terminal current is positive flowing into the component.
- Power is positive when absorbed and negative when delivered.
- Differential voltage directions are explicit.
- The runtime reports objective values and inexpensive mathematical derivations.
- The runtime does not provide a troubleshooting conclusion.

## Component observations

### Resistor

```text
COMPONENT R1 resistor R=1kOhm [model=ideal] | 1=VIN 2=VOUT
RUN tran-1 snapshot=8f13c2 analysis=tran time=2ms

TERMINALS
1 VIN  V=5.00V I=2.50mA
2 VOUT V=2.50V I=-2.50mA

VALUES
V(1,2)=2.50V
I(1->2)=2.50mA
P=6.25mW
```

### Capacitor

```text
VALUES
V(1,2)=3.16V
I(1->2)=1.84mA
stored-energy=5.0uJ
```

### Inductor

```text
VALUES
V(1,2)=1.20V
I(1->2)=32mA
stored-energy=5.12uJ
```

Stored energy is optional for the first implementation; terminal voltage and current are required.

### Switch

```text
VALUES
state=open
V(1,2)=5.00V
I(1->2)=0A
```

### Voltage source

```text
TERMINALS
+ VCC V=5.00V I=-20mA
- GND V=0.00V I=20mA

VALUES
V(+,-)=5.00V
I(+->-)=-20mA
P=-100mW
```

Negative power means the source is delivering power.

### Current source

```text
VALUES
I(+->-)=1.00mA
V(+,-)=3.20V
P=-3.20mW
```

### Diode and LED

```text
TERMINALS
A VIN V=5.00V I=4.20mA
K OUT V=4.31V I=-4.20mA

VALUES
Vak=0.69V
Iak=4.20mA
P=2.90mW
```

The runtime should not add a diagnosis such as `forward-biased`; the agent can interpret the objective voltage and current.

### BJT

```text
COMPONENT Q1 npn beta=100 [model=simplified] | B=BASE C=LOAD E=GND
RUN tran-1 snapshot=8f13c2 analysis=tran time=5ms

TERMINALS
B BASE V=0.43V I=18uA
C LOAD V=4.82V I=1.70mA
E GND  V=0.00V I=-1.72mA

VALUES
Vbe=0.43V
Vbc=-4.39V
Vce=4.82V
Ib=18uA
Ic=1.70mA
Ie=1.72mA
Ic/Ib=94

DIAGNOSTICS
Model uses configured beta with simplified default BJT parameters.
```

The runtime should not initially add `region=cutoff`, `region=active`, or `region=saturation`. The agent should infer operating behavior from junction voltages and currents.

PNP devices use the same positive-into-terminal current convention. Their signed values naturally reflect opposite polarity.

### MOSFET

```text
TERMINALS
G GATE V=3.30V I=0A
D LOAD V=0.18V I=42mA
S GND  V=0.00V I=-42mA

VALUES
Vgs=3.30V
Vgd=3.12V
Vds=0.18V
Vgs-Vth=1.30V
Ig=0A
Id=42mA
Is=-42mA
P=7.56mW
```

The runtime should not initially label the MOSFET operating region.

### Ideal op amp

```text
TERMINALS
- INV   V=2.51V I=0A
+ NINV  V=2.50V I=0A
OUT OUTPUT V=0.00V I=-3.2mA
V+ VCC   V=5.00V
V- GND   V=0.00V

VALUES
Vdiff=V(+,-)=-10mV
Vout=0.00V
distance-to-low-rail=0V
distance-to-high-rail=5.00V
```

Rail distances are objective derived values. The agent decides whether they indicate clipping or saturation.

### Logic input and output

Logic observations show both analog voltage and threshold-derived state.

```text
COMPONENT OUT1 logic-output threshold=2.5V | IN=LOAD

TERMINALS
IN LOAD V=1.90V I=0A

VALUES
threshold=2.50V
logic=low
margin-to-threshold=-0.60V
```

A declared threshold makes `logic=low` or `logic=high` a deterministic derivation rather than a troubleshooting conclusion.

### Unsupported component

An unavailable measurement is never represented as zero.

```text
COMPONENT Q1 npn beta=100 [model=unsupported] | B=BASE C=LOAD E=GND

DIAGNOSTICS
Q1 has no simulation model.
Terminal voltages and currents are unavailable.
```

## Waveform traces

The agent requests only the relevant signals rather than receiving every raw simulation point.

Canonical signal names include:

```text
V(VOUT)       net voltage
V(Q1.B)       voltage at a component terminal
I(Q1.C)       current flowing into a component terminal
P(Q1)         component power, positive when absorbed
Vbe(Q1)       BJT base-emitter voltage
Vce(Q1)       BJT collector-emitter voltage
Vgs(M1)       MOSFET gate-source voltage
Vds(M1)       MOSFET drain-source voltage
```

Example:

```text
> circuit trace V(Q1.B) V(Q1.C) I(Q1.B) I(Q1.C) --run tran-1

RUN tran-1 range=0..10ms

V(Q1.B)
  min=0.00V max=0.43V final=0.43V

V(Q1.C)
  min=4.78V max=5.00V final=4.82V

I(Q1.B)
  min=0A max=18uA final=18uA

I(Q1.C)
  min=0A max=1.7mA final=1.7mA

samples:
time    V(Q1.B) V(Q1.C) I(Q1.B) I(Q1.C)
0ms     0.00V    5.00V    0uA     0mA
1ms     0.43V    4.82V    18uA    1.7mA
...
```

Trace output includes statistics and a bounded number of samples. Time windows allow the agent to request more detail without dumping every point into context.

## Temporary experiments

A temporary override creates a new immutable run without changing `CircuitProject`.

```text
> circuit simulate tran --set RB.R=1kOhm

RUN tran-2
snapshot=8f13c2
status=success
temporary-overrides:
  RB.R: 10kOhm -> 1kOhm
```

The agent can then inspect the experimental run:

```text
circuit observe Q1 --run tran-2 --at 5ms
```

The initial design permits validated component-property and active-state overrides only. Override property names use the same agent-facing vocabulary as `circuit.txt` (for example `RB.R`, not internal names like `RB.resistance`). It does not permit arbitrary project mutation.

## System prompt behavior

The system prompt should remain short and own agent behavior rather than command documentation.

```text
You analyze the current circuit snapshot.

Read /README.md before using the workspace. Use read_file to inspect workspace
files and search_text to discover component, net, and capability names. Use
circuit commands to verify electrical connectivity and measurements; text
matches alone are not proof of electrical connection.

Never infer connectivity from visual proximity. Connectivity comes from exact,
committed terminal and wire-vertex coordinates in the project.
Distinguish direct same-net connection from a path through components. Never
present an unsupported simulation result as fact.

When troubleshooting:
1. Inspect the target component and surrounding connections.
2. Measure relevant voltages, currents, and waveforms.
3. State a hypothesis based on those measurements.
4. Test the hypothesis with one temporary change when possible.
5. Compare baseline and experimental results.
6. Clearly separate measured facts, derived values, and conclusions.
```

## Deliberate exclusions

The bare-bones version does not include:

- raw project JSON in the agent workspace,
- raw wire geometry,
- raw SPICE output by default,
- unrestricted Bash,
- arbitrary TypeScript or Python execution,
- network access from agent tools,
- persistent simulation files,
- autonomous changes to the saved project,
- silent engine or solver fallbacks,
- hardcoded troubleshooting diagnoses,
- AC analysis or parameter sweeps unless explicitly implemented later.

Code execution should only be added after real troubleshooting questions demonstrate that `observe`, `trace`, and temporary simulation overrides are insufficient.

## Current implementation

The clean-break domain model is implemented:

- Removed the heuristic topology-recognition solver (`measurements.ts`) and the dead demo solver. Canvas display, the measurements panel, and the property inspector now read observations derived from the latest validated simulation run.
- Removed the silent ngspice→spicey engine fallback and the `auto` engine preference. Engine selection is one explicit choice; a missing ngspice binary is an explicit failure.
- Replaced the versioned multi-sheet project with one unversioned, flat
  `CircuitProject` containing `objects` and `analysis`. Persistence uses the
  fresh `CircuitSimCurrent` namespace and directly decodes the canonical schema;
  no compatibility or migration framework exists.
- Components have one integer position, a quarter-turn rotation, a flip flag,
  properties, and fixed catalog terminals. Their SVG glyphs are browser code,
  not another core scene model.
- The component catalog is a closed exhaustive lookup. Its declaration builder
  is private; interfaces cannot register competing component interpretations.
- Wires are integer-coordinate polylines. Browser snapping proposes a target;
  the editing operation commits exact shared vertices. T-junctions connect,
  crossing interiors do not, and connection dots are derived rather than saved.
- All browser transformations compile to the schema-derived `CircuitEdit` union
  before changing the project. Undo and redo restore complete in-memory project
  snapshots rather than maintaining inverse commands.
- Added the Effect-schema-derived `ElectricalCircuit` (`electrical-circuit.ts`):
  typed component behavior, nullable terminal bindings, and structured net
  terminal references in canonical order with no geometry or object ids.
- SPICE generation, circuit hashing, `circuit.txt`, ERC electrical checks, and
  agent commands now consume the same generated circuit.
- Replaced the transport/persistence duplication with `SimulationOutput` and one
  flat `SimulationRun`. Run identity, time, project ownership, and
  `projectSnapshotId` are added only by persistence; status is derived from
  diagnostics.
- Server runtime limits apply before either engine runs. ngspice output files are
  size-checked before reading, and an empty parsed result is a failure.
- Runs observe every net rather than only probed ones. Probes remain UI-only.
- `renderCircuitTxt` uses human terminal labels (`1`, `+`, `B`), not internal pin keys.
- The stale `supportsDemoSolver` ERC check was removed; ERC now warns about components without simulation models.

Completed during the command-core pass:

- The pure command interpreter core exists (`packages/core/src/agent/`): `buildAgentWorkspace` renders the virtual `/README.md` + `/circuit.txt` workspace from `ElectricalCircuit`, and `interpretAgentCommand` handles `read_file`, `search_text` (literal/regex, case folding, context lines, bounded output with explicit truncation), and the topology-only `circuit` commands (`show`, `component`, `around`, `net`, `connected`, `path`, `islands`, `help`). Path enumeration is bounded; islands report grounded regions; every failure names what exists.
- Golden-circuit topology tests (validation layer 1, topology half) pass against the divider, RC, and a new islands demo fixture.
- The CLI front exists as an Agent Console tab in the editor over the same pure core (`AgentConsolePanel`): command input with history, circuit hash in the header, byte-for-byte interpreter output. Unit-tested.

Still open:

- Agent `observe`, bounded `trace`, and temporary simulation overrides are not implemented.
- DC operating-point analysis is not exposed.
- NPN and PNP transistors, MOSFETs, the ideal op amp, and logic components are currently marked `unmodeled`.

BJT troubleshooting must not be advertised until the simulator can provide a validated BJT model and collector, base, and emitter measurements. Until then, the agent must receive an explicit unsupported-model diagnostic.

## Implementation order

1. Define canonical `ElectricalCircuit` (Effect schema), its circuit hash, and `circuit.txt`; make SPICE consume it. ✅
2. Build the pure command interpreter core over `ElectricalCircuit`: topology-only `circuit` commands, plus `read_file` and `search_text` over the virtual workspace. ✅
3. Add the CLI front and validate with golden circuits (validation layer 1). ✅
4. Define canonical terminal-voltage, terminal-current, power, project snapshot,
   simulation output, and stored run semantics. ✅
5. Add DC operating-point support.
6. Add on-demand `observe` and bounded `trace` output for currently modeled two-terminal parts; move canvas display and the SimulationPanel onto run signals.
7. Add validated temporary property overrides.
8. Add the MCP front over the same core and run validation layer 2 (agent adequacy).
9. Add BJT simulation models and multi-terminal observations.
10. Add other component models only when their measurements can be reported honestly.

Each stage should retain one owner: `CircuitProject` for editable state,
`ElectricalCircuit` for generated electrical meaning, `ProjectSnapshot` for an
exact persisted document, and `SimulationRun` for measured behavior.
