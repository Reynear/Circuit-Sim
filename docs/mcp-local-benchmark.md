# MCP Local Benchmark

## Status

This is the agreed first implementation milestone. The initial vertical slice
is now implemented: Compose starts the app, Postgres, and native ngspice; an
official MCP client can create and replace a project, inspect its canonical
electrical projection, simulate it, read bounded evidence, and open the
view-only browser schematic. The smoke circuit is a 5 V equal-resistor divider
and deterministically measures `VOUT = 2.5 V`.

Run it with:

```sh
npm run benchmark:up
npm run benchmark:smoke
npm run benchmark:native
npm run benchmark:release
npm run benchmark:pi:full -- --model openai-codex/gpt-5.6-luna
npm run benchmark:down
```

The deterministic release suite now contains eighty-eight behavior-complete
circuit cases plus MCP conformance checks, and the ordered complexity frontier
contains ninety-five cases. The linked intent suite contains seventy-three
evidence-grounded behavior cases. The currently implemented saved analysis is
transient only;
DC operating-point analysis remains to be implemented.

On 2026-08-29 the local image completed three full deterministic baseline
suites: 30/30 functional cases and 48/48 conformance checks passed. After the
model-client findings were incorporated, a fresh deterministic suite again
passed 10/10 cases and all 16 conformance checks. A real Pi 0.84.3 client using
`openai-codex/gpt-5.6-luna` then passed both the 3/3 smoke profile and the 10/10
full profile. Model results remain report-only; the hosted integration is still
deferred.
On 2026-08-30 the expanded official SDK release suite passed 19/19 cases with
protocol conformance in `2026-08-30T08-53-42-402Z-7d4021dd`, and the expanded
frontier passed 26/26 with protocol conformance in
`2026-08-30T08-57-10-757Z-2f4d569d`.
The next expansion passed 22/22 release cases in
`2026-08-30T09-27-46-925Z-d42ed939`, 29/29 frontier cases in
`2026-08-30T09-30-33-621Z-27430791`, and 7/7 intent-oracle cases in
`2026-08-30T09-32-07-862Z-ddf6ee0f`, all with protocol conformance. Every case
also called `render_schematic`, read the returned pinned resource through MCP,
validated its snapshot and circuit-hash identity, checked its component labels,
and retained the decoded `schematic.svg` beside its simulation artifacts.
The following expansion passed 25/25 release cases in
`2026-08-30T09-46-09-457Z-231c856b`, 32/32 frontier cases in
`2026-08-30T09-47-23-668Z-e75d181e`, and 10/10 intent-oracle cases in
`2026-08-30T09-49-21-647Z-82335478`, again with protocol conformance and pinned
SVG readback. It also exposed and fixed an ngspice-formatting error: megaohm
values now use `Meg`, since ngspice interprets a bare `M` as milli.
The next expansion passed 28/28 release cases in
`2026-08-30T10-05-46-390Z-1abb854c`, 35/35 frontier cases in
`2026-08-30T10-07-01-338Z-6a1c5167`, and 13/13 intent cases in
`2026-08-30T10-10-02-865Z-f991acc2`. All three runs passed protocol conformance,
compiled each electrical command into a canonical project, ran native ngspice,
rendered the final snapshot, and read the pinned SVG resource back through MCP.
This expansion also split intent cases into exact and behavioral topology modes:
ten still require electrical equivalence, while three admit alternate designs
that satisfy their component-family, named-net, ERC, analysis, and measured
behavior contracts.
The following expansion passed 31/31 release cases in
`2026-08-30T10-21-21-620Z-9e412d67`, 38/38 frontier cases in
`2026-08-30T10-23-40-126Z-d7b7eaa6`, and 16/16 intent cases in
`2026-08-30T10-25-59-670Z-7e2684bc`. It added loaded NMOS and PNP followers,
comparator polarity, BJT mirror compliance, complementary crossover behavior,
op amp subtraction, and three more behavioral intent cases. Repeated entries in
`requiredComponentTypes` now express minimum counts, so a vague four-diode
bridge contract still requires all four diodes without freezing their refdes.
The next expansion passed 34/34 release cases in
`2026-08-30T10-38-34-851Z-a5e775a7`, 41/41 frontier cases in
`2026-08-30T10-41-05-234Z-906e6ae1`, and 19/19 intent cases in
`2026-08-30T10-43-08-305Z-c0c9b780`. It added RC high-pass behavior, a corrected
loaded BJT divider-bias oracle, Zener regulation across a 6x current range, a
transient CMOS inverter, a Zener-referenced NMOS series regulator, emitter
degeneration comparison, and three corresponding topology-flexible designs.
The latest expansion passed 37/37 release cases in
`2026-08-30T10-54-19-255Z-e784c9fc`, 44/44 frontier cases in
`2026-08-30T10-56-45-644Z-964beb82`, and 22/22 intent cases in
`2026-08-30T10-59-39-788Z-54f90710`. It added half-wave rectification,
back-to-back Zener limiting, PNP beta comparison, an op amp window comparator,
buffered-reference load isolation, clipped common-emitter transients, and three
corresponding behavior-first designs. Behavioral scoring can now express a
bounded signal metric, so a candidate may choose its own values while still
having to land in a physically meaningful measured region.
The following expansion passed 40/40 release cases in
`2026-08-30T11-13-05-759Z-195b65f7`, 47/47 frontier cases in
`2026-08-30T11-15-42-356Z-a299315f`, and 25/25 intent cases in
`2026-08-30T11-18-44-790Z-c49b5ef8`. It added RL high-pass response, diode DC
restoration, single-versus-Darlington followers, a bridge/reservoir/Zener
post-regulator, an op amp Schmitt trigger, and a two-NPN cascode. A tagged
signal-metric comparison now scores minimum-margin greater-than and less-than
relationships, enabling three more topology-flexible designs to prove relative
load, ripple, follower-offset, and regulation behavior without exposing exact
oracle values.
The latest expansion passed 43/43 release cases in
`2026-08-30T11-29-50-812Z-4d483352`, 50/50 frontier cases in
`2026-08-30T11-32-34-775Z-ce76c30c`, and 28/28 intent cases in
`2026-08-30T11-36-07-767Z-d23b35fc`. It added a loaded diode-capacitor voltage
doubler, a PNP high-side mirror, NMOS source degeneration, doubler-fed Zener
regulation, PNP mirror compliance, and time-domain MOSFET feedback. A tagged
hysteresis observation now derives input voltages at rising and falling output
transitions, so a plain comparator cannot pass the new behavior-first Schmitt
trigger case merely by producing the same high and low levels.
The following expansion passed 46/46 release cases in
`2026-08-30T11-59-25-048Z-3017ea18`, 53/53 frontier cases in
`2026-08-30T12-02-45-130Z-21a87eed`, and 31/31 intent cases in
`2026-08-30T12-06-32-323Z-5cf87549`. It added comparator duty-cycle behavior,
diode envelope detection under load, negative-rail PNP single-versus-Darlington
followers, comparator-driven NMOS switching, and comparator window logic. A
tagged high-level-fraction observation now measures time spent above a derived
midpoint, so correct rails alone cannot satisfy a requested duty cycle.
An initial frontier run exposed that averaged traces were weighting adaptive
ngspice samples equally. The scorer and native oracle now use trapezoidal,
elapsed-time-weighted averages; the corrected switch oracle is centered on its
analytical mean and passes both host and container runtimes within 15 mV. The
pre-fix 52/53 artifact is retained as
`2026-08-30T11-52-07-589Z-bb80258c` for regression history.
The next expansion passed 49/49 release cases in
`2026-08-30T12-22-37-717Z-e95edcf0`, 56/56 frontier cases in
`2026-08-30T12-26-02-147Z-7a1e6f75`, and 34/34 intent cases in
`2026-08-30T12-29-51-546Z-0110e941`. It added a Zener-referenced NPN current
sink, balanced and steered BJT differential pairs, single- and dual-frequency
leaky op amp integrators, current-sink compliance loss, and three corresponding
behavior-first designs. The Zener/BJT graph exposed a compiler-layout defect:
when a pin's preferred outward routing point was already occupied, the router
could reuse that exact vertex and short two named nets. The compiler now searches
deterministic outward lanes, with a focused regression test and all 139 native
circuits plus 144 SVG projections confirming preserved topology.
The following expansion passed 52/52 release cases in
`2026-08-30T12-44-51-240Z-2c01f40d`, 59/59 frontier cases in
`2026-08-30T12-48-14-059Z-eba2557f`, and 37/37 intent cases in
`2026-08-30T12-52-25-015Z-974c716d`. It added practical op amp
differentiation, balanced and steered PNP differential pairs, and electrical
red-versus-blue LED behavior under direct and Zener-regulated supplies. LED
color now selects a color-specific SPICE model rather than affecting only SVG
presentation. The expanded local sweep passed all 148 compiler/simulator cases,
153 SVG projections, 565 repository tests, every typecheck, and the production
build.
The next expansion passed 55/55 release cases in
`2026-08-30T13-05-02-234Z-59e877b4`, 62/62 frontier cases in
`2026-08-30T13-08-28-622Z-a0e0a7b7`, and 40/40 intent cases in
`2026-08-30T13-13-01-036Z-c14c3ce9`. It added a negative-rail PNP
common-emitter amplifier, a Zener-referenced high-side PNP current source,
series red/blue LED behavior, complementary transient amplifiers, PNP
compliance loss, and regulated LED-string headroom. A tagged
`MeanDifferenceComparison` evidence variant now compares two measured voltage
drops with a signed margin, allowing vague equal-resistor current claims to be
gated by four named nodes. The full local sweep passed 157 compiler/simulator
cases, 162 SVG projections, 584 repository tests, every typecheck, and the
production build.
The following expansion passed 58/58 release cases in
`2026-08-30T13-25-39-244Z-86de4690`, 65/65 frontier cases in
`2026-08-30T13-29-20-147Z-150ea7cd`, and 43/43 intent cases in
`2026-08-30T13-34-23-936Z-e6536ce2`. It added feedback-compensated precision
half-wave rectification, load-induced Zener-clamp dropout, biased class-AB
output tracking, ordinary-versus-precision rectifier comparison, a three-load
Zener sweep, and class-B versus class-AB crossover behavior. A tagged
`TrackingErrorComparison` fact now compares elapsed-time-weighted normalized
RMS errors against one reference waveform, preventing adaptive solver sampling
from hiding crossover distortion. The local sweep passed 166
compiler/simulator cases, 171 SVG projections, 603 repository tests, every
typecheck, and the production build.
The next expansion passed 61/61 release cases in
`2026-08-30T13-49-33-428Z-aac41705`, 68/68 frontier cases in
`2026-08-30T13-53-55-881Z-bef0cd1c`, and 46/46 intent cases in
`2026-08-30T13-58-24-531Z-b9d4387f`. It added op amp transimpedance conversion,
collector/emitter BJT phase splitting, stacked Zener references, dual-feedback
transimpedance scaling, complementary NPN/PNP phase-splitter symmetry, and
single-versus-stacked reference comparison. Three negative controls reject
equal-output transimpedance impostors, in-phase/non-complementary phase
splitters, and Zener stacks without voltage addition. The local sweep passed
175 compiler/simulator cases, 180 SVG projections, 624 repository tests, every
typecheck, and the production build.
The following expansion passed 64/64 release cases in
`2026-08-30T14-13-59-218Z-6e13d305`, 71/71 frontier cases in
`2026-08-30T14-18-27-609Z-0b9dda95`, and 49/49 intent cases in
`2026-08-30T14-23-00-142Z-803ab475`. It added a three-op-amp instrumentation
amplifier, emitter-bypass transient gain, a loaded stacked-Zener midpoint,
common-mode rejection, bypassed-versus-unbypassed BJT comparison, and a
three-load stacked-Zener dropout sweep. Three negative controls reject an
instrumentation output that follows common mode, an emitter bypass that fails
to increase gain, and a heavily loaded lower Zener falsely reported as still in
breakdown. The local sweep passed 184 compiler/simulator cases, 189 SVG
projections, 645 repository tests, every typecheck, and the production build.
The next expansion passed 67/67 release cases in
`2026-08-30T14-41-22-149Z-30478732`, 74/74 frontier cases in
`2026-08-30T14-45-58-010Z-ac33a5fa`, and 52/52 intent cases in
`2026-08-30T14-50-57-614Z-36313c31`. It added diode-feedback logarithmic
conversion, partial emitter-resistor bypass, a capacitively filtered Zener
reference, three-decade logarithmic scaling, unbypassed/partial/full BJT gain
progression, and a three-capacitance Zener ripple sweep. The associated
negative controls reject unequal logarithmic decade steps, partial-bypass gain
outside the two endpoints, and increasing capacitance that fails to reduce
ripple. The local sweep passed 193 compiler/simulator cases, 198 SVG
projections, 666 repository tests, every typecheck, and the production build.
The following expansion passed 70/70 release cases in
`2026-08-30T15-23-45-610Z-df67650a`, 77/77 frontier cases in
`2026-08-30T15-28-40-616Z-02752771`, and 55/55 intent cases in
`2026-08-30T15-34-17-187Z-98f73003`. It added diode-input op amp
antilogarithmic conversion, an emitter-degenerated Widlar current source, and a
finite-dynamic-resistance Zener ripple model; the frontier and intent layers
then compare equal antilog input steps, ordinary versus Widlar mirror behavior,
and 10/50/100 Ohm Zener dynamic-resistance sweeps. Zener dynamic resistance is
now a canonical component property carried through the electrical projection
and emitted as SPICE diode-model `Rs`, rather than prompt metadata ignored by
the simulator. Three negative controls reject a linear-output antilog impostor,
a Widlar branch without meaningful current reduction, and a Zener sweep without
ordered DC shift and ripple growth. The local sweep passed 202
compiler/simulator cases, 207 SVG projections, 687 repository tests, every
typecheck, and the production build.

The next expansion passed 73/73 release cases in
`2026-08-30T15-57-30-374Z-2ef9eb36`, 80/80 frontier cases in
`2026-08-30T16-02-36-976Z-64087b43`, and 58/58 intent cases in
`2026-08-30T16-20-05-965Z-6a381c8d`. It added matched-base BJT
collector-voltage sweeps that expose finite Early-effect output resistance,
Zener load-line sweeps that recover incremental resistance from measured
voltage and current, and a three-decade diode log/invert/antilog chain that
recovers its input. A semantic `NetBranchCurrent` selector now resolves the
unique component joining two named nets without depending on its reference
designator, while a tagged `DifferenceRatio` fact derives output resistance
and dynamic resistance from four independently measured signals. Negative
controls reject an ideal BJT with zero Early slope, a 70 Ohm Zener presented as
50 Ohm, and a compressed log/antilog high decade. The local sweep passed all
211 compiler/simulator cases and 216 SVG projections; the final repository
gate passed 710 tests, every typecheck, and the production build.

The first 58/58 intent SDK pass in
`2026-08-30T16-08-05-427Z-c8ec7eba` exposed an evaluator-path gap during
artifact review: it had compiled and simulated the exact oracle fixtures but
had not applied the behavioral intent observations. The SDK runner now accepts
the intent manifest and scorers directly, fetches evaluator-only traces in the
MCP boundary's maximum groups of eight, and persists `derived-evidence.json`.
An intermediate strict run, `2026-08-30T16-14-24-111Z-91ba6d85`, correctly
failed the 12-signal log/antilog request at that boundary. The corrected clean
run above passed every behavioral and derived check and is the accepted intent
result.

The following expansion passed 76/76 release cases in
`2026-08-30T16-44-29-591Z-e3645bf8`, 83/83 frontier cases in
`2026-08-30T16-50-15-117Z-f35fcf39`, and 61/61 intent cases in
`2026-08-30T16-55-45-886Z-d9f90c64`. BJT Early voltage is now a canonical
positive component property carried through project validation, electrical
projection, model equivalence, catalog defaults, and SPICE `Vaf` emission.
The new cases compare 50 V and 200 V NPN output resistance; sweep 40 V, 100 V,
and 250 V PNP models; measure a nine-point VBE/VCE collector-current surface;
and separate Zener nominal breakdown, dynamic resistance, and reverse-current
effects in an eight-point matrix. Behavior-only evidence recovers 70.5 kOhm,
176.4 kOhm, and 440.9 kOhm PNP output resistances; a 2.166x current ratio per
20 mV BJT base step; finite 1.79 MOhm to 382 kOhm output resistances across
bias; 15.98 Ohm and 105.98 Ohm Zener incremental slopes; and independent 0.9 V
breakdown shifts. Negative controls reject identical Early models, linearized
VBE response, zero Early slope, collapsed Zener resistance, and collapsed
breakdown offset. The local sweep passed all 220 compiler/simulator cases and
225 SVG projections; the repository gate passed 732 tests, every typecheck,
and the production build.

The next expansion passed 79/79 release cases in
`2026-08-30T17-18-06-992Z-5f79adf7`, 86/86 frontier cases in
`2026-08-30T17-24-18-923Z-4aabb776`, and 64/64 intent cases in
`2026-08-30T17-29-52-680Z-5db98234`. MOSFET transconductance parameter and
channel-length modulation are now canonical N-channel and P-channel component
properties carried through project validation, the electrical projection,
human-readable parameters, model equivalence, and SPICE `Kp`/`Lambda`
emission; the defaults preserve the previous 50 mA/V^2 and 0.02 /V model.
The new release cases freeze NMOS output resistance versus modulation,
complementary N/P transconductance scaling, and zero-modulation square-law
overdrive. The frontier and vague-intent layers add a six-point PMOS modulation
sweep, a nine-point transconductance/overdrive surface, and a six-point
triode-to-saturation surface. Derived evidence recovers 50 kOhm, 12.5 kOhm,
and 3.125 kOhm output resistances; exact 4x and 2.25x square-law ratios; 4x and
2.5x device-strength ratios; about 2.16x triode-region current growth followed
by about 1.07x saturation flattening; and a 4x saturated-current change when
overdrive doubles. Negative controls reject collapsed modulation values,
linearized overdrive, equalized device strength, missing saturation flattening,
and broken overdrive scaling. The clean MCP artifacts contain nonempty SVG,
netlist, simulation, trace, and derived-evidence files, with trace requests
chunked to the eight-signal boundary. The local sweep passed all 229
compiler/simulator cases and 234 SVG projections; the repository gate passed
755 tests, every typecheck, and the production build.

The following expansion passed 82/82 release cases in
`2026-08-30T17-54-06-531Z-fd33069c`, 89/89 frontier cases in
`2026-08-30T17-59-33-525Z-916411fa`, and 67/67 intent cases in
`2026-08-30T18-05-53-886Z-59f70952`. Ordinary-diode saturation current,
emission coefficient, and series resistance are now canonical positive or
nonnegative component properties carried through project validation,
compiler expansion, electrical projection, human-readable parameters, model
equivalence, and per-device SPICE `Is`/`N`/`Rs` emission. Existing ordinary
diodes retain the 10 fA, 1, and 0 Ohm defaults; color-specific LED models retain
their distinct electrical parameters. The release layer compares saturation
current and emission coefficient at matched current and freezes a two-current
series-resistance matrix. The frontier adds an eight-point Is/N/current matrix,
a six-point incremental-resistance sweep, and a nine-point emission/current-
decade surface. Behavior-only evidence measures 119 mV and 238 mV saturation-
current shifts, exact 2x emission-voltage ratios, 6.62/31.62/106.62 Ohm
incremental slopes, exact 250 mV/1 V series drops at 10 mA, equal logarithmic
decade steps, and 1.5x/2x emission-step ratios. Negative controls reject
collapsed saturation-current families, collapsed emission coefficients,
missing logarithmic steps, equal series-resistance models, current-independent
parasitic drops, and unequal decade spacing. The local sweep passed all 238
compiler/simulator cases and 243 SVG projections; the repository gate passed
779 tests, every typecheck, and the production build. Official artifacts retain
matching project/run circuit hashes, native ngspice netlists, bounded trace
groups of at most eight signals, frozen source hashes, and nonempty pinned SVGs.

The next expansion passed 85/85 release cases in
`2026-08-30T18-29-22-139Z-5890d2b7`, 92/92 frontier cases in
`2026-08-30T18-34-56-737Z-8caa3c20`, and 70/70 intent cases in
`2026-08-30T18-41-53-016Z-d938a48a`. BJT transport saturation current and
forward emission coefficient are now canonical positive NPN/PNP properties
carried through project validation, compiler expansion, electrical projection,
human-readable parameters, model equivalence, and per-device SPICE `Is`/`Nf`
emission. Existing BJTs retain the 1 fA and 1 defaults alongside their beta and
Early-voltage defaults. The release cases freeze saturation-current VBE shift,
1/1.2/1.5 emission-coefficient scaling, and matched NPN/PNP signed symmetry.
The frontier adds an eight-point Is/NF/current matrix, an eight-point mirrored
complementary junction sweep, and a nine-point NF/VBE collector-current surface.
Behavior-only evidence measures 119 mV and 179 mV saturation-current shifts,
exact 1.5x emission-voltage scaling, 59.6 mV and 89.3 mV decade steps, exact
complementary magnitudes, 1.4x NF scaling, and adjacent exponential current
ratios that fall from about 4.692 to 3.627 to 2.802 as NF increases. Negative
controls reject collapsed transport-saturation-current and NF families,
missing logarithmic steps, asymmetric or wrong-polarity complementary models,
unequal complementary steps, linearized current response, collapsed NF rows,
and unequal base-voltage steps. The local sweep passed all 247
compiler/simulator cases and 252 SVG projections; the repository gate passed
802 tests, every typecheck, and the production build. The three accepted intent
artifacts retain 14, 16, and 17 passing derived facts, complete one/one/two-page
waveform evidence, matching project/run circuit hashes, native ngspice model
cards, frozen source hashes, and nonempty pinned SVGs.

The Zener junction-parameter expansion passed 88/88 release cases in
`2026-08-30T19-03-12-293Z-2129e34d`, 95/95 frontier cases in
`2026-08-30T19-08-33-591Z-31890bae`, and 73/73 intent cases in
`2026-08-30T19-15-37-425Z-3bd630c7`. Breakdown reference current, forward
saturation current, and emission coefficient are now canonical positive Zener
properties carried through project validation, compiler expansion, electrical
projection, human-readable parameters, model equivalence, and per-device SPICE
`Is`/`N`/`Bv`/`Ibv`/`Rs` emission. Existing Zeners retain 1 mA, 10 fA, and 1
defaults. The release cases freeze the reverse-voltage shift across three IBV
decades and the forward-voltage effects of Is and N. The frontier adds a
nine-point IBV/current surface, an eight-point forward Is/N/current matrix, and
eight bidirectional branches separating parameter effects. Behavior-only
evidence measures equal 59.56 mV IBV-decade offsets, matched current-response
rows, 119 mV and 238 mV Is shifts, exact 2x N scaling, 59.56 mV and 119.11 mV
current-decade steps, and forward/reverse invariants. Negative controls reject
collapsed IBV, Is, or N families, unequal rows, missing logarithmic response,
and every erased or cross-coupled bidirectional effect. The local sweep passed
all 256 compiler/simulator cases and 261 SVG projections; the repository gate
passed 824 tests, every typecheck, and the production build. Artifact audits
confirmed byte-identical persisted netlists, matching project/snapshot/run
identity, successful non-stale ngspice runs, 58 rendered Zener glyphs, all 43
derived facts, and complete two/one/one-page intent waveform evidence.

An initial 70-case release attempt is retained as
`2026-08-30T15-19-06-631Z-0bed5315`: it reached 56/70 before accumulated prior
simulation JSON filled the 4.4 GB ephemeral Postgres tmpfs. A clean benchmark
database produced the 70/70 result above. `benchmark:release` now invokes the
clean reset path, preventing persistence left by earlier local suites from
contaminating a release result.
This milestone is intentionally local before it becomes a hosted product
integration. It exists to prove that an agent can create, inspect, simulate,
and explain circuits through the same core model used by the browser.

Do not add cloud authentication, public hosting, or a second circuit model until
this loop passes reliably.

## Smallest complete loop

```text
Pi on the host
    |
    | Streamable HTTP MCP on localhost
    v
Circuit Sim Node server + ngspice container
    |
    | validated repository operations
    v
ephemeral Postgres container
```

Docker Compose starts the Circuit Sim server, native ngspice runtime, and an
ephemeral Postgres database. Pi remains on the host and receives only the
Circuit Sim MCP tools. The MCP endpoint binds to loopback for this milestone.

The local server uses one fixed `LocalPilotUser` identity supplied through an
Effect service. Repository contracts still require an owner so replacing the
local identity with OAuth does not change domain workflows.

## Source of truth

`CircuitProject` remains the only saved circuit truth.

An agent edits a geometry-free `AgentElectricalGraph`: modeled components,
terminal-to-net assignments, and saved analysis configuration. This graph is a
validated command value, not a stored model. The core deterministically compiles
it into canonical components, exact-coordinate wire polylines, labels, and a
ground marker, validates the whole resulting project, runs ERC, and then
discards the command.

```text
AgentElectricalGraph (command only)
    |
    | validate limits, references, pins, connectivity, analysis
    v
deterministic compiler
    |
    v
CircuitProject (saved truth)
    |
    +-- electrical projection
    +-- ERC
    +-- SPICE netlist
    +-- browser SVG
    +-- immutable project snapshots + simulation runs
```

The compiler may improve its layout without changing the MCP contract. Exact
connectivity—not visual wire routing—is authoritative.

## MCP surface

Expose three tools. Their actions are discriminated unions so the surface stays
small without hiding what each call does.

### `inspect_circuit`

- get server instructions and supported-component catalog on demand
- list the current user's projects
- get one project as a bounded electrical projection plus version and ERC
- get one immutable simulation run's observations
- list persisted runs for one owned project so external client behavior can be
  scored without depending on a client-specific transcript format
- get bounded waveform samples for selected signals

### `edit_circuit`

- create an empty project
- replace one project's complete electrical graph, including its explicitly
  selected `groundNet`, at an expected version

Replacement is atomic. A stale expected version returns a typed conflict with
the current version; it never merges silently. Successful replacement creates
an immutable project snapshot. MCP v1 has no object-level patch language,
delete, or undo.

`groundNet` names one of the submitted nets and the compiler canonicalizes that
net to `GND`. This keeps reference selection explicit without requiring the
agent to rewrite a user-facing alias first. For example, a graph may submit the
bottom-right mesh node as `N45` with `groundNet: "N45"`; the saved electrical
projection exposes that node as `GND`. A second submitted net named `GND` is
rejected when another net is selected as ground.

### `simulate_circuit`

- run the saved analysis for one explicit project ID using ngspice
- store the run against the exact project snapshot
- return a bounded evidence packet: status, circuit hash, ERC, diagnostics,
  scalar observations, and available trace names

Editing never starts a simulation implicitly. There is no simulator fallback.

Every stateful call requires an explicit project ID. Tool instructions should
tell the chat agent to inspect before editing, use the catalog rather than
inventing parts or pins, simulate before claiming behavior, and distinguish
simulation evidence from engineering judgment.

## Initial electrical scope

Agent-created circuits may use only components already modeled by the SPICE
exporter:

- resistor, capacitor, and inductor
- switch
- DC and sine voltage sources
- DC current source
- diode, Zener diode, and LED
- NPN and PNP bipolar transistors
- N-channel and P-channel MOSFETs with source-tied bulk models
- ideal op amps with finite open-loop gain and supply/property-limited output
- explicitly referenced ideal logic inputs, output loads, two-input AND/OR
  gates, and inverters

The current saved analysis is transient only. Static-source cases use the final
sample of a transient run. A tagged DC operating-point analysis and its
netlist/result path remain future core work—not something the MCP adapter should
fake.

The current-source catalog follows SPICE direction: positive current flows from
terminal `positive` to terminal `negative`. To raise a load above GND, connect
`positive` to GND and `negative` to the load net. This convention is included
in both server instructions and machine-readable catalog semantics.

Hard limits for an agent replacement command:

- at most 32 components
- at most 64 named nets
- unique component reference designators and net names
- exactly one submitted `groundNet`, with no competing reserved `GND` net
- every terminal reference names an existing component and catalog pin
- one terminal belongs to at most one net
- project names and SPICE-facing text must reject control characters

Whole-project schema validation and ERC run after compilation. ERC warnings are
returned as evidence; schema, connectivity, unsupported-model, and simulation
errors are explicit failures where applicable.

## Browser and visualization

Server-backed agent projects are browser-view-only in this milestone. The
existing IndexedDB editor and its projects remain untouched. A browser route
loads the canonical server project and renders it with the existing SVG
component layer.

Chat visualization uses the least machinery:

1. Return compact structured observations and bounded waveform samples from
   MCP so capable chat clients can render native tables/charts.
2. Return a browser URL for the canonical schematic.
3. Return a pinned standalone SVG generated from the same canonical glyphs as
   the editor, with an optional PNG rasterization for clients that require it.

Do not add a render AST to core. The browser renderer stays an interface-edge
consumer of `CircuitProject` until a second real renderer proves a shared
contract is needed.

## Benchmark

The strict deterministic gate uses the official MCP v2 Streamable HTTP client.
It creates a fresh project per case and exercises the real server, Postgres,
browser route, shared SVG glyph renderer, and native ngspice runtime. The
eighty-eight cases are:

1. DC source to ground
2. equal-resistor voltage divider
3. sine-driven RC low-pass response
4. sine-driven RL low-pass response
5. sine-source waveform
6. DC current-source load
7. forward-biased diode
8. reverse-biased diode
9. LED current limiter
10. Zener shunt regulator
11. NPN common-emitter current gain
12. NPN emitter follower
13. PNP high-side switch
14. N-channel MOSFET on and cutoff regions
15. P-channel MOSFET on and cutoff regions
16. rail-limited ideal op amp voltage follower
17. ideal op amp inverting amplifier
18. referenced AND, OR, and inverter truth regions
19. open and closed switch topology in one project
20. regulated and overloaded Zener shunt branches
21. NPN cutoff, forward-active, and saturation regions
22. ideal op amp non-inverting amplifier
23. PNP cutoff, forward-active, and saturation regions
24. non-inverting op amp transient gain and phase
25. active-low PMOS transient switching
26. megaohm-divider SPICE suffix and sub-microamp current
27. Zener forward conduction versus reverse breakdown
28. matched-drive NPN current-gain comparison
29. loaded NMOS source follower
30. negative-rail PNP emitter follower
31. ideal comparator high/low polarity
32. RC high-pass response at cutoff
33. emitter-degenerated BJT voltage-divider bias
34. Zener regulation across branch-current range
35. half-wave diode rectification
36. symmetric back-to-back Zener limiting
37. matched-drive PNP current-gain comparison
38. RL high-pass response at cutoff
39. diode positive-clamper DC restoration
40. single-transistor versus Darlington follower comparison
41. loaded diode-capacitor voltage doubling
42. high-side PNP current mirroring
43. NMOS source-degeneration bias comparison
44. comparator threshold and high-state duty cycle
45. loaded diode envelope detection
46. negative-rail PNP single-transistor versus Darlington follower comparison
47. Zener-referenced NPN current sinking
48. balanced NPN differential-pair current splitting
49. leaky op amp integration with reactive feedback
50. practical op amp differentiation with bounded high-frequency gain
51. balanced PNP differential-pair current splitting
52. red-versus-blue LED forward-voltage comparison
53. negative-rail PNP common-emitter transient amplification
54. Zener-referenced high-side PNP current sourcing
55. series red/blue LED drops and shared current
56. op amp precision positive half-wave rectification
57. load-induced Zener-clamp dropout in transient response
58. biased class-AB complementary emitter-follower tracking
59. op amp transimpedance current-to-voltage conversion
60. BJT collector/emitter phase splitting in transient response
61. two-device stacked Zener voltage reference
62. three-op-amp instrumentation amplification of a differential signal
63. emitter-bypassed BJT common-emitter transient amplification
64. stacked-Zener midpoint regulation under asymmetric loading
65. diode-feedback op amp logarithmic current-to-voltage conversion
66. partially bypassed BJT emitter degeneration
67. capacitively filtered Zener-reference ripple rejection
68. diode-input op amp antilogarithmic voltage-to-current conversion
69. emitter-degenerated Widlar low-current source
70. finite-dynamic-resistance Zener ripple transfer
71. BJT Early-effect collector-current change at matched base voltage
72. finite-dynamic-resistance Zener load-line shift
73. diode log/invert/antilog recovery chain
74. canonical BJT Early-voltage output-resistance comparison
75. equal-step BJT base-emitter exponential-current sweep
76. Zener breakdown-voltage and dynamic-resistance matrix
77. NMOS channel-length-modulation output-resistance comparison
78. complementary N/P MOSFET transconductance-strength comparison
79. zero-modulation NMOS square-law overdrive-current sweep
80. ordinary-diode saturation-current forward-voltage comparison
81. ordinary-diode emission-coefficient forward-voltage scaling
82. ordinary-diode series-resistance/current matrix
83. BJT transport-saturation-current base-emitter-voltage shift
84. BJT forward-emission-coefficient base-emitter-voltage scaling
85. complementary NPN/PNP junction-parameter symmetry
86. Zener breakdown-reference-current voltage shift
87. Zener forward saturation-current voltage shift
88. Zener forward emission-coefficient voltage scaling

Together these cover every component currently admitted by
`AgentElectricalGraph`. They are idealized electronics cases, not solar-panel
or photovoltaic-device models.

Conformance checks cover exact tool discovery, instructions and catalog,
invalid types and terminals, graph bounds, unsafe names, stale versions,
unknown projects and runs, deterministic graph ordering, trace bounds and
missing signals, immutable run-to-snapshot evidence, run discovery, and
untrusted-origin rejection.

```sh
# Required release gate: rebuild stack, unit tests, typechecks, and full SDK suite
npm run benchmark:release

# Run only the deterministic SDK suite against an already-running current image
npm run benchmark:sdk

# Compile every release, frontier, and hidden intent oracle; render every SVG;
# run native ngspice; and apply the deterministic scorers without MCP state
npm run benchmark:native

# Inspect calibrated ngspice observations for one deterministic fixture
./node_modules/.bin/jiti benchmarks/run-native.ts \
  --case frontier-bjt-differential-pair --details

# Explicitly destroy the ephemeral benchmark database and rebuild the stack
npm run benchmark:reset
```

Each suite and project receives a unique ID. Complete requests, MCP results,
canonical inspections, netlists, traces, evidence, and scores are written to
the gitignored `artifacts/benchmarks/<suite-id>/` directory rather than treated
as database state.

### Real model clients

Real-agent runs are a separate report because model behavior is nondeterministic
and different clients may use different providers or models. They use the same
case manifest and deterministic saved-state/evidence scorer. Final prose is
archived but is not automatically graded.

```sh
# Nine representative Pi cases
npm run benchmark:pi:smoke -- --model <provider/model>

# All eighty-eight Pi cases
npm run benchmark:pi:full -- --model <provider/model>

# Implemented adapters beyond the current Pi milestone
npm run benchmark:model -- --client claude-code --profile full --model <model>
npm run benchmark:model -- --client gemini-cli --profile full --model <model>
```

Pi has no native MCP support, so
`benchmarks/clients/pi/circuit-sim-mcp.ts` is a deliberately small adapter that
proxies exactly the three Circuit Sim tools through the official MCP client.
Claude Code uses an isolated inline MCP configuration. Gemini CLI receives an
isolated per-case `.gemini/settings.json`. Credentials remain owned by each CLI
and are never copied into artifacts or command arguments.

The smoke model profile contains nine representative cases: the divider, RC
filter, forward diode, Zener regulator, N-channel MOSFET regions, and op amp
follower, plus the logic truth regions, Zener load-dropout comparison, and the
megaohm-divider scaling regression. The full profile contains all eighty-eight.
Each case gets one attempt;
repeated full suites establish reliability rather than best-of-N retries. Model
reports are initially non-gating. Clients are reported independently with their
client and model metadata, not ranked as though model differences were client
differences.

### Linked vague-intent and question suite

The intent suite tests a different failure mode from the wiring-oriented
release and frontier manifests. The builder receives only a behavior-oriented
request plus explicit question IDs. It must derive the circuit, create one
project through MCP, simulate the final saved snapshot, and answer from the
returned evidence.

The seventy cases are:

1. an unfiltered center-tapped full-wave rectifier;
2. a first-order RC low-pass driven at cutoff;
3. a series RLC circuit driven at resonance;
4. a Zener shunt regulator rejecting supply ripple;
5. a BJT emitter follower demonstrating voltage offset and current buffering;
6. an inverting op amp demonstrating gain, phase, virtual ground, and headroom;
7. an NMOS low-side switch crossing cutoff and on regions;
8. a biased BJT common-emitter stage demonstrating gain and phase inversion;
9. a Zener-referenced BJT series regulator demonstrating current isolation; and
10. a PMOS high-side switch demonstrating active-low control;
11. a buffered Zener reference serving a heavy load;
12. a full-wave bridge supply with reservoir smoothing; and
13. a non-inverting op amp stage specified by gain, phase, and headroom;
14. an NMOS source follower specified by loaded voltage and gate offset;
15. a BJT emitter-follower current buffer; and
16. an asymmetric Zener waveform limiter;
17. an RC high-pass stage at its corner frequency;
18. a target-driven BJT divider bias point;
19. a Zener-referenced NMOS load regulator;
20. a half-wave rectifier specified by waveform behavior;
21. an op amp window detector specified by its three input regions; and
22. a clipped common-emitter stage with bounded output swing;
23. two bridge-reservoir branches compared under light and heavy loads;
24. single-transistor and Darlington followers compared from shared intent; and
25. a bridge-reservoir supply with Zener post-regulation;
26. an op amp Schmitt trigger with measured threshold separation;
27. a positive diode clamper with component values left open; and
28. a loaded diode-capacitor voltage doubler;
29. a comparator whose threshold produces roughly one-third high duty cycle;
30. two diode envelope detectors compared under light and heavy loads; and
31. paired NMOS common-source stages showing source-degeneration feedback;
32. a Zener-referenced NPN current sink with forward-active headroom;
33. differential-pair steering compared with equal common-mode drive; and
34. a leaky op amp integrator with measured gain, phase, and virtual ground.
35. a practical op amp differentiator with measured gain, phase, and virtual ground;
36. PNP differential steering compared with equal common-mode drive; and
37. red and blue LED forward drops behind a loaded Zener shunt.
38. a negative-rail PNP common-emitter amplifier with gain and phase evidence;
39. a Zener-referenced PNP current source crossing its compliance limit; and
40. equal-resistance red-only and red-plus-blue branches compared by measured
    resistor headroom.
41. ordinary diode and feedback-compensated precision rectifiers compared at
    small signal level;
42. light, medium, and heavy loads crossing Zener-clamp dropout; and
43. class-B and class-AB output stages compared by normalized tracking error.
44. equal-current dual-gain transimpedance amplifiers with measured 2x scaling;
45. complementary BJT phase splitters with phase, gain, and cancellation evidence; and
46. single and stacked Zener references demonstrating series voltage addition.
47. an instrumentation amplifier rejecting large common-mode motion while
    preserving a small differential signal;
48. bypassed and unbypassed BJT common-emitter stages compared for gain and
    emitter motion; and
49. lightly, moderately, and heavily midpoint-loaded stacked Zener references
    crossing lower-device dropout.
50. three diode-feedback logarithmic amplifiers driven across two current decades;
51. unbypassed, partially bypassed, and fully bypassed BJT emitter stages; and
52. three loaded Zener references with increasing shunt capacitance and
    decreasing ripple.
53. three diode-input antilogarithmic converters with equal voltage steps and
    equal adjacent output-magnitude ratios;
54. an ordinary NPN current mirror compared with a Widlar source through
    matched-reference bias and equal-load voltage drops; and
55. three loaded Zener references with increasing dynamic resistance, DC shift,
    and ripple transfer.
56. three matched-base BJT branches whose collector-voltage sweep exposes
    finite Early-effect output resistance;
57. three loaded Zener branches whose measured voltage/current load line
    recovers finite incremental resistance; and
58. three diode log/invert/antilog chains spanning exact input decades and
    recovering their input magnitudes.
59. three matched PNP pairs whose 40 V, 100 V, and 250 V Early models produce
    progressively larger measured output resistance;
60. a nine-point NPN VBE/VCE surface separating exponential base control from
    finite collector-voltage slope; and
61. an eight-point Zener matrix separating breakdown voltage, dynamic
    resistance, and reverse-current operating point.
62. three matched PMOS pairs whose increasing channel-length modulation
    produces decreasing measured output resistance;
63. a nine-point NMOS transconductance/overdrive surface separating linear
    device-strength scaling from square-law gate control; and
64. a six-point NMOS output-characteristic surface spanning triode operation,
    saturation flattening, and doubled overdrive.
65. an eight-point ordinary-diode matrix separating saturation current,
    emission coefficient, and logarithmic current response;
66. three matched ordinary-diode pairs whose measured incremental slopes
    separate junction response from 0, 25, and 100 Ohm series resistance; and
67. a nine-point ordinary-diode surface whose equal current decades and
    1/1.5/2 emission coefficients produce independently scored voltage steps.
68. an eight-point diode-connected BJT matrix separating transport saturation
    current, forward emission coefficient, and logarithmic current response;
69. matched NPN and PNP junction sweeps demonstrating signed complementary
    symmetry, equal decade steps, and proportional NF scaling; and
70. a nine-point forward-active BJT surface whose equal VBE steps produce
    NF-dependent exponential collector-current ratios.
71. a nine-point Zener IBV/current matrix with equal breakdown-reference-current
    decade offsets and matched operating-current response;
72. an eight-point forward Zener Is/N/current matrix separating saturation-
    current shift, emission-coefficient scaling, and logarithmic current steps;
    and
73. four forward/reverse Zener model pairs demonstrating which of Is, N, and
    IBV affects forward behavior, reverse behavior, or both.

Cases 1 through 10 use `topologyMode: "exact"`: the scorer accepts electrically
equivalent designs while preserving the requested interface nets. Cases 11
through 73 use `topologyMode: "behavioral"`: their exact oracle remains hidden
and reproducible, but candidate scoring requires only the stated component
families, named interface nets, valid analysis, clean ERC, and measured outcomes.
This makes the latter cases genuinely vague without allowing prose-only or
unsimulated answers to pass.

Each case is linked across three deliberately separate layers:

```text
public intent + questions
    -> MCP-only builder
    -> saved CircuitProject + final-snapshot simulation
    -> deterministic electrical-equivalence and waveform gate
    -> fixed Pi evaluator with no tools (report quality only)
```

The builder never receives `oracleGraph`, expected observations, reference
claims, URLs, or hashes. Hidden truth is written to artifacts only after the
builder process exits. Pi and Claude run with only the Circuit Sim MCP tools;
Gemini receives a deny-by-default admin policy that exposes only the selected
MCP server.

Online sources are used during case authoring, not fetched during a benchmark
run. Each fixture stores the source URL, retrieval date, a narrow paraphrased
claim, and the SHA-256 of that exact claim text. This freezes the rubric and
avoids network drift. The hash authenticates the checked-in claim fixture; it
is not a hash of the remote page and cannot prove that a page has not changed.

The deterministic gate is authoritative. It checks electrical equivalence to
the intended circuit while allowing harmless reference-designator changes,
internal net renaming, symmetric passive orientation, and longer/finer
analysis settings. It then checks final-snapshot/hash linkage, simulation
status, diagnostics, and waveform observations. A fixed
`openai-codex/gpt-5.6-sol` evaluator sees only compact deterministic evidence,
frozen claims, and the builder's final assistant answer. Its strict JSON is
validated for exact keys, question coverage, and allowed evidence references.
The rating is explicitly `report-only-nondeterministic` and can never change a
deterministic pass or failure.

```sh
# Compile and simulate all hidden reference circuits through the official SDK
npm run benchmark:intent:sdk

# One Luna builder attempt per case and a fixed, tool-free Sol report judge
npm run benchmark:pi:intent -- \
  --model openai-codex/gpt-5.6-luna \
  --judge-model openai-codex/gpt-5.6-sol
```

Latest deterministic result:

- suite: `2026-08-30T19-15-37-425Z-3bd630c7`
- cases: 73/73 passed
- deterministic pass rate: 1.0
- MCP conformance: passed

The live Luna/Sol result is intentionally not recorded yet: those calls send
the benchmark prompts, circuit evidence, and model answers to external model
endpoints and require explicit approval for that egress.

### Pi/Luna complexity frontier

The ordered frontier suite extends beyond the eighty-eight release cases without
changing their stable gate. It stops after the first failed model case:

```sh
# Validate every frontier reference circuit without a model
npm run benchmark:frontier:sdk

# Run one Pi/Luna attempt per case and stop at the first failure
npm run benchmark:pi:frontier -- --model openai-codex/gpt-5.6-luna
```

The current frontier has 95 circuits. The original nine progress from small
resistive and nonlinear networks through rectifiers, 31-component ladders, and
a 32-component 4-by-5 mesh. Six first-round semantic cases add split rails with
an interior ground, series RLC dynamics, current-source orientation, waveform
superposition, biased nonlinear limiting, and dual-rail rectification. Six
second-round cases combine those burdens with parallel resonance, an AC-coupled
LED clamper, center-tapped rectification, two-frequency split-rail limiting, a
reactive mixer, and asymmetric dual-rail rectification. Four active-device cases
then add asymmetric Zener clipping, a matched BJT current mirror, complementary
MOSFET regions, and both polarities of op amp output saturation.
The final case adds an explicitly referenced four-stage combinational logic
cascade and a modeled output-current load.
Three additional active-network cases cover a Zener-referenced BJT series
regulator, cascaded resistor-load NMOS inverters, and a two-transistor
Darlington emitter follower.
Three further cases add a biased common-emitter transient amplifier, a Zener
reference driving a heavily loaded op amp buffer, and ideal comparators driving
NPN low-side switching stages.
Three current cases add BJT differential-pair current steering, a two-frequency
weighted op amp summer, and a full-wave reservoir comparison under light and
heavy loads.
Three more cases add current-mirror compliance limits, a complementary class-B
emitter follower, and a two-frequency op amp difference amplifier.
The latest three add transient CMOS inversion, a Zener-referenced NMOS source
regulator, and paired BJT bias branches with and without emitter degeneration.
The newest three add a three-region op amp window comparator, paired light/heavy
loads behind one buffered Zener reference, and a transient common-emitter stage
whose collector swing clips at the supply rail.
The latest three add filtered bridge output feeding a Zener post-regulator, an
inverting Schmitt trigger with explicit hysteresis thresholds, and a stacked
two-NPN cascode bias network.
The newest three add a diode-capacitor doubler feeding a Zener regulator, a PNP
mirror crossing its output-compliance limit, and paired NMOS common-source
stages showing source-degeneration feedback in transient response.
The latest three add a threshold comparator driving an NMOS switch, paired
envelope detectors with load-dependent droop and ripple, and two comparators
combined into a window-logic pulse network.
The newest three add Zener-referenced NPN current-sink compliance, paired BJT
differential-versus-common-mode response, and matched leaky integrators driven
at two frequencies.
The latest three add matched practical differentiators at two frequencies,
complementary PNP differential-versus-common-mode behavior, and a loaded Zener
rail feeding independently modeled red and blue LEDs.
The newest three add complementary NPN/PNP common-emitter transients, a shared
Zener reference driving active and compliance-limited PNP source branches, and
equal-resistor red-only versus red-plus-blue loads on one regulated rail.
The latest three add ordinary-versus-feedback-compensated rectification, three
Zener clamp loads spanning avalanche to dropout, and class-B versus biased
class-AB crossover tracking from one drive waveform.
The newest three add equal-current transimpedance stages with a two-to-one
feedback ratio, mirrored complementary BJT phase splitters with equal collector
and emitter resistors, and single-versus-stacked Zener references under load.
The latest three add instrumentation-amplifier common-mode rejection, paired
BJT common-emitter stages with and without emitter bypass, and three stacked
Zener midpoint loads spanning regulation to lower-device dropout.
The newest three add equal voltage steps from diode-feedback logarithmic
amplifiers across consecutive current decades, unbypassed/partial/full emitter
bypass gain progression at matched bias, and Zener-reference ripple reduction
across zero, 100 uF, and 1000 uF shunt capacitance.
The latest three add equal-voltage-step diode-input antilogarithmic converters,
an ordinary NPN mirror compared against an emitter-degenerated Widlar source,
and matched loaded Zener branches whose 10, 50, and 100 Ohm dynamic resistances
produce ordered DC shift and ripple transfer.

The newest three add a three-point matched-base BJT collector-voltage sweep, a
three-point finite-resistance Zener load line, and three complete diode
log/invert/antilog chains spanning consecutive input decades.

The latest three add a six-device PNP Early-voltage sweep, a nine-point NPN
VBE/VCE current surface, and an eight-point Zener breakdown/resistance/current
matrix.

The newest three add a six-device PMOS channel-length-modulation sweep, a
nine-point NMOS transconductance/overdrive current surface, and a six-point
NMOS triode-to-saturation output-characteristic surface.

The latest three add an eight-point ordinary-diode saturation-current/emission-
coefficient/current matrix, a six-point series-resistance/current sweep, and a
nine-point emission-coefficient/current-decade surface.

The newest three add an eight-point BJT transport-saturation-current/NF/current
matrix, an eight-point matched complementary junction sweep, and a nine-point
BJT forward-emission-coefficient/VBE collector-current surface.

The latest three add a nine-point Zener breakdown-reference-current/current
surface, an eight-point forward saturation-current/emission-coefficient/current
matrix, and matched forward/reverse branches proving Zener parameter
orthogonality.

All 95 reference circuits and their numerical expectations pass through the
official SDK, MCP server, canonical project compiler, shared SVG renderer, and
native ngspice with protocol conformance. The latest result is
`2026-08-30T19-08-33-591Z-31890bae`. The SDK runner honors the pilot server's
typed retry delay when a long suite reaches a rate-limit window.
A local reference sweep after these additions passed all 256 release, frontier,
and intent-oracle circuits through the canonical compiler, plus 261 standalone
SVG projections through the shared renderer, deterministic scorers, and native
ngspice runtime with the default
server limits.

The MCP replacement graph requires `groundNet`, and the compiler canonicalizes
the selected submitted net to `GND`. That field fixed the earlier false boundary
where Luna correctly built the mesh but had no way to select `N45` as the
reference. The corrected 15-case semantic run subsequently passed 15/15 and is
archived as `2026-08-30T02-14-30-769Z-pi-e118b101`.

On 2026-08-30 Pi 0.84.3 with `openai-codex/gpt-5.6-luna` found a genuine
one-attempt construction failure in the existing 4-by-5 mesh. Luna passed the
first eight cases, selected `N45` as ground correctly, created all 32 component
values, and completed ngspice successfully. While connecting horizontal rows 2
and 3, it duplicated each row's first edge and shifted the remaining edges one
node left:

```text
H22 N21-N22   expected N22-N23
H23 N22-N23   expected N23-N24
H24 N23-N24   expected N24-N25
H32 N31-N32   expected N32-N33
H33 N32-N33   expected N33-N34
H34 N33-N34   expected N34-N35
```

The canonical topology check failed, and the simulated `N15`, `N22`, `N33`,
and `N41` voltages all fell outside tolerance. This result is archived as
`2026-08-30T02-37-04-794Z-pi-74f3da1f`. Because Luna passed the same mesh in a
prior run, this is a reliability boundary rather than proof that the topology is
never constructible. Stop-on-first-failure also means cases 10 through 21 were
not attempted in this run.

A deterministic scorer is authoritative. SDK cases require the exact canonical
graph. Model cases require an electrically equivalent canonical graph while
allowing arbitrary internal net names, reference designators, symmetric passive
terminal orientation, and longer/finer transient settings. Names explicitly
requested in a prompt remain mandatory. The scorer also checks numerical and
complete paginated waveform evidence plus exact project/snapshot/hash linkage.
The linked intent suite's LLM judge scores communication only and remains
report-only.

Promotion gate:

- zero ownership, validation, versioning, or snapshot-integrity failures
- at least 90% deterministic pass rate across three complete runs

## Deferred hosted milestone

After the benchmark passes, retain the Docker image, HTTP MCP transport, tool
schemas, and repository workflows. Replace `LocalPilotUser` with Better Auth,
GitHub sign-in, and MCP OAuth; add user scopes and public HTTPS; then select a
hosting provider based on the measured Node, ngspice, Postgres, and connection
requirements.

Alchemy v2 and provider-specific infrastructure are deliberately deferred.
Choosing them before the agent loop is measured would add a second deployment
and identity problem without reducing uncertainty in circuit behavior.

## Known hard boundaries

- Simulation can establish modeled electrical behavior, not physical safety,
  manufacturability, tolerances, thermal behavior, or regulatory compliance.
- The modeled BJT, MOSFET, Zener, op amp, and zero-delay logic behaviors are
  intentionally simplified and should not be treated as vendor device models.
- AC analysis, sweeps, optimization, Monte Carlo, and autonomous acceptance of
  design intent are outside this milestone.
- Sine sources use a PWL approximation shared by ngspice and the local Spicey
  engine. Sampling follows transient resolution and at least 32 points per
  cycle, capped at 4,096 segments; a capped run records a fidelity note.
- Chat clients differ in MCP authorization, resource rendering, and chart
  support. The structured results and browser URL are portable; rich inline UI
  cannot be assumed across clients.
- Native ngspice requires a long-lived Node/container runtime. Edge-only and
  restricted serverless runtimes are not suitable for the reference server.
- Hosted ChatGPT cannot execute this loopback benchmark. Its executable client
  run remains blocked on the deliberately deferred public HTTPS and OAuth
  milestone; the same case manifest and scorer should be reused there.
