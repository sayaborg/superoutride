# Content and gameplay

Current implementation is described below. The [Course Editor target](#course-editor-target) is a separately scoped future contract. Activate each change only with its executable coverage; this document does not report that the target is already implemented.

## Composition and data ownership

[Boot](../src/boot.ts) selects one course query using the [course selector](../src/browser/course-mode-selection.ts). The catalog owns query-to-root membership; its typed content dispatcher requires the builders for that route kind. All roots use that dispatcher, and only the composition roots assemble concrete DEV content:

- [LINEAR](../src/main-linear.ts): finite highway driving trial; no route graph, FINISH observer or race session.
- [BRANCHING](../src/main.ts): default open branching highway, field route choice and rivals.
- [CIRCUIT](../src/main-circuit.ts): Tsukuba or FISCO selection, finite runtime window and lap race.

The [driving shell](../src/browser/driving-shell.ts) owns common browser input, fixed-step scheduling, player replacement, selectors, HUD and presentation. Its [driving lifecycle](../src/browser/driving-lifecycle.ts) owns manual recovery or safe-spawn replacement, observer resynchronization and immediate camera reconstruction, in that order. Roots supply the current world, recovery profile and optional resync callback. [Frame loop](../src/browser/frame-loop.ts) owns the accumulator and the 0.25 s catch-up limit; roots supply tick/render callbacks. [Route driving](../src/runtime/route-driving-tick.ts) completes every actor's physics before shared arbitration, then applies recovery, chart rebinding and progress observation once per actor. [Circuit driving](../src/runtime/circuit-driving-tick.ts) shares recovery/race/session updates between player and rivals. Root code chooses content and input policy. Results are keyed by actor ID, independent of roster positions. General rendering/physics/camera layers consume ordinary data, not course-mode switches.

The [vehicle catalog](../src/vehicle/vehicle-catalog.ts) owns nine selectable production identities and references nine distinct [compiled profiles](../src/vehicle/production-vehicle-profiles.ts). Manufacturer/model, identifier, specification and period are separate fields. Presentation uses explicit car/bike metadata. Browser [key bindings](../src/browser/key-bindings.ts) map opaque profile IDs to shortcuts; the catalog contains no keyboard codes. Driving aliases belong to [keyboard input](../src/input/keyboard-input.ts), and one regression checks collisions across driving and product controls. Testarossa is the default player and fixed rival profile. Shared initial player tire settings do not imply that all finished vehicles must share tires.

[Stage authoring](../src/runtime/stage-authoring-compiler.ts) compiles open geometry, height, visuals, GroundMap, surfaces, sprites and background into a [runtime package](../src/runtime/stage-runtime-content.ts). A [road view](../src/course/stage-road-view.ts) describes stage-local lateral/longitudinal presentation. Physical and visual surface views share explicit coordinate transforms but retain independent semantics. Stage environment authoring specifies display ground extents; the package compiler takes road dimensions from its shared cross-section. The general compiler supplies no content dimensions. The same terrain-profile factory compiles all source and stage presentation: ground extents come from visual authoring and road dimensions from the shared cross-section, while height and visual readers are supplied independently. Screen height comes from the fixed logical display metric. Changes of material/visual sections do not split geometry unnecessarily.

`src/dev/courses`, `src/dev/fixtures` and `src/dev/diagnostics` separate shipped course composition, focused regression inputs and read-only telemetry. Fixtures are executable input data, not a second set of engine implementations. Shared [Raster authoring](../src/course/raster-turtle.ts) owns straight/arc subdivision and preserves authored radius provenance; course files own shapes and explicit topology. Focused and multi-step fork fixtures consume the same [second-fork data](../src/dev/courses/second-fork-authoring.ts). [DEV boundary](../src/dev/README.md) explains the allowed dependency direction.

General APIs use role-based names. Vehicle creation, updates and recovery consume `VehicleWorld`; camera updates consume its guide/height readers. Rendering consumes a target, scene and options. General runtime composition modules remain separate where they validate distinct contracts: source geometry, environment, continuation overlap, route graph and physical handoff. Module size alone is not a reason to merge those authorities.

### Current course boundary

Product topology is named `BRANCH`; `BRANCHING` is the existing DEV catalog identifier and
`?mode=branching` selector. Keep that compatibility mapping at composition, not in new course data.
The following route transaction describes the branching runtime, not the LINEAR driving trial.

Current [successor generation](../src/runtime/raster-stage-successor.ts) copies an overlap and creates
a prescribed lateral excursion/runout. Fork growth promotes terminals in the development course.
These are retained development-content builders, not a general authoring model. Current packages
share one world frame and the junction compiler accepts symmetric two-way forks. Adjacent actors
are presented only when their active package matches the player's; cross-seam actor presentation
is a known missing integration, not an intended visibility rule. Roots still own development grid
placement. The target below replaces these responsibilities through authored data and local views.

## Point-to-point route transaction

An acyclic [RouteDag](../src/gameplay/route-dag.ts) owns legal stage successors. Physical position crosses an oriented gate; steering intent, AI target, screen X or guessed centerline never chooses route progress.

Compiled stages, choices and gate geometry are immutable. The shared oriented-gate primitive detects an actual sign change: negative to zero/positive is forward, positive to zero/negative is reverse. Arrival at the plane counts once; departing from the plane does not repeat it. There is no dead band that can lose a slow crossing; finite lateral gate-width tolerance remains separate.

1. A forward physical route-gate crossing validates the legal transition and enters PENDING.
2. The old chart/content remains authoritative during the shared overlap.
3. A forward physical handoff-seam crossing commits the target chart/content.
4. COMMIT re-expresses observations only; world X/Y/Z, yaw and velocity remain continuous.

[World gates](../src/gameplay/world-crossing-gate.ts), [handoff](../src/gameplay/route-stage-handoff.ts) and [live route tick](../src/runtime/live-route-multi-actor-tick.ts) implement this ordering. Authoring compiles actual overlap and runout; no implicit closure or post-handoff pose repair is allowed. An actor's finite local projection seed must follow the committed chart explicitly.

[Continuation compilation](../src/runtime/stage-continuation-link.ts) partitions the overlap at both charts' straight/arc boundaries and checks endpoints and interval interiors, so a complete local bend cannot fall between fixed probes. Copied Raster vertices retain circular-source radius provenance. Gameplay Guide charts delegate coordinate arithmetic to the same Core frame primitive.

The field uses `FIRST_PHYSICAL_CROSSING_LOCKS` and `RECOVER_TO_LOCKED_BRANCH`. The first valid physical crossing locks a sibling choice for the field. A losing crossing records a violation and recovers through the legal physical gate's geography without awarding illegal progress. An AI desired branch is never authority. Each actor's chart/content and route progress remain separate; shared route choice is owned once by the field.

The current lock occurs at the separated transition gates. Its arbitration preserves input order
for fractions within its named tie tolerance; the `INDEPENDENT` policy remains a diagnostic option.
The target fork policy below changes the lock location, eligibility and exact-tie order together.
Its acceptance tests, rather than an isolated rename, authorize that behavioural cutover.

Entering a terminal stage is not finishing. A validated physical FINISH is still required.

## Circuit and race progress

[Circuit topology](../src/gameplay/circuit-topology.ts) explicitly authors one closed lap above Core. [Runtime unfolding](../src/runtime/circuit-runtime-window.ts) supplies finite ordinary open geometry/source readers for at least N+1 copies when scoring N laps, including runout after the final scored finish. No core modulo or circuit renderer is introduced.

[Race progress](../src/gameplay/circuit-race-progress.ts) accepts ordered forward physical checkpoints and FINISH crossings. Topological copy/winding is not an awarded lap. Skipping checkpoints, crossing backwards, swapping vehicles or recovering cannot manufacture a lap. Route and race progress use physical gate history, separate from current projected chainage. Resynchronization replaces observation baselines while preserving all validated progress.

[Session configuration](../src/gameplay/session-configuration.ts), [race session](../src/gameplay/race-session.ts) and [run objective](../src/gameplay/run-objective.ts) are the existing extension points for game rules. Avoid placing race-start, scoring, finish or route logic in rendering or vehicle integration.

The current Tsukuba and FISCO authoring lives in [Tsukuba](../src/dev/courses/tsukuba-circuit.ts) and [FISCO](../src/dev/courses/fisco-circuit.ts). They are functional simplified courses, not survey-grade reconstructions. Source comments identify published dimensions versus simplified connectors. Course selection does not change the common solver.

Circuit visual sections are unfolded into an ordinary `VisualProfile`. Both boundary lists and sampled section starts use window chainage; a second-lap sample must not report a first-lap start.

## Recovery

[Recovery](../src/gameplay/recovery.ts) is an explicit gameplay discontinuity, not ordinary integration. It observes support, falling, penetration, chart excursion and overturning. The common `advanceVehicleWithRecovery` catches only the typed suspension-travel domain exit from physics; unrelated errors are not swallowed.

Recovery reconstructs complete pose, velocity, wheel state, actuators, powertrain and observations at a supported known Guide coordinate. It retains selected steering/tire calibration. Ordinary same-chart recovery derives a backed-off target from the farther of last-safe and current causal chainage; it cannot loop forever onto the same launch face solely because last-safe did not advance in air. Explicit wrong-route recovery supplies the legal gate-derived target.

Route composition passes each actor’s recovery profile to both ordinary and locked-branch recovery. The explicit legal-gate approach owns the target coordinate; the same profile owns backtracking and retained speed.

Route and circuit driving ticks resync their route/race observer after automatic recovery, suppressing ordinary physical crossing observation for that reset. The browser lifecycle resets and updates the player's camera after the tick reports that discontinuity; it does not resync progress a second time. Recovery never awards gates, checkpoints or laps and never erases accepted progress. Known coordinates preserve the correct overlapping circuit copy. Global nearest geometry is not a substitute for that knowledge.

Vehicle replacement completes camera reconstruction in the same selector callback. A render frame may arrive before the next fixed physics tick; it must already have the new player's camera anchor.

## Rivals and future game systems

[Rival driver](../src/gameplay/rival-driver.ts) publishes ordinary input using physical world travel and a Guide lookahead. Its contiguous braking-distance envelope is a general speed-planning policy, separate from the player. Rival behavior does not change tire forces or route authority.

Next work can add visual assets, sound and game flow above these contracts. Read immutable vehicle/telemetry state for engine/skid/lean presentation. Add scoring and race state under gameplay, and compose at the roots. Do not use sound/UI state to control mechanics, or add a second notion of progress to presentation. Collisions, richer rival behavior and game-specific effects require explicit new design and causal tests; they are not presumed implemented by the current physics core.

## Concrete visual content

The [tunnel content](../src/dev/courses/tunnel.ts) owns portal/rib assets, placements and the camera-offset background interval. The browser composition assembles it with ordinary course sprites and Far Background. General rendering contains no tunnel location or special projection. Branching child authoring continues forward from the shared finite overlap; it has no alternate return-to-start shape.

## Accepted authoring workflow: pending implementation

The [Course Editor target](#course-editor-target) owns the revised future course, session, saved
project and loading contracts. Current Sprite Tool source normalization, mask/palette editing,
session save/reopen and master/LOD exports remain implemented as documented in architecture and
development. Its existing local session is distinct from the proposed CourseDocument.
The lifecycle below remains the current GroundMap integration until its replacement is validated.

Three-dimensional source capture is a separate experiment until accepted: compare fixed orthographic
and explicitly defined perspective cameras, lateral displacement versus body yaw, distance and bank.
Model origin, angle labels, pivot, lighting, crop/anchor and angle sampling remain open. Runtime
chainage projection is unchanged. DUAL/multiple vehicle slices remain deferred.

### GroundMap loading and handoff

All four course modes use this lifecycle through the shared driving shell and GroundPresentation.
Product assets are generated before startup; no procedural ground renderer is selected by a mode.

Each stage package references its complete stage-local baked color source; source lateral/chainage
offsets are compiler concerns for that asset. Package geometry, SurfaceMap, road intent, physical
gates and progress remain independent. A circuit window delegates to one lap reader and shared
payload store; virtual copies must not multiply payload bytes or require a repeated page directory.

The loading coordinator acquires exact image demand for the active presentation and optionally
prefetches its adjacent storage chunks using the same residency limits. There is one optional job
at a time; it does not predict legal successors or promise arrival before travel. Stage changes load
the actual selected source. Physical gate -> PENDING -> seam -> COMMIT continues to own selection. Pin the old frame while preparing its replacement, retain shared
payloads once, and release pins only after all consumers finish. Include camera run-in/runout,
reverse travel, manual recovery, automatic recovery and course switching in demand tests.
Geometry/physics for other actors must not force all their GroundMaps into memory.

A complete ready set is required to present a frame. If required data is unavailable, the browser
enters an explicit loading state: preserve the last complete frame and simulation state, suspend
further ticks through the common scheduler, and resume without accumulating wall-clock catch-up.
Do not rewind an already committed physical handoff or alter velocity, forces, gate order or LOD
to hide a loading delay. Integrate this lifecycle with existing input/audio suspension behavior.
Failed loading exposes retry/exit while keeping the same immutable content identity; no source
baking runs in the browser. `ReadyFrameController` now implements the scheduler/pin transaction: loading stops the common
frame loop, keeps the last completed frame pinned, exposes failures for retry, and releases stale
arrivals after replacement or disposal. Successful presentation releases the old frame and restarts
the loop with a fresh clock. Its suspension callback is the composition boundary for input/audio;
the shell clears and suspends keyboard/touch ownership, silences audio and disables driving
controls while waiting. The course selector remains available; failures expose Retry. Held keyboard
repeat does not revive cleared input on resume. A resident hit presents synchronously without
restarting the clock. Page exit disposes the session; back-forward cache restoration reloads a
fresh session. The presenter publishes complete prepared frames synchronously.

The rendering revision is owned by [architecture](architecture.md#groundmap-compilation-and-residency).
Sprite Tool/Course Editor GUI and pending image algorithms remain separate work.

The integration fixtures cross the default branch's real physical gate and COMMIT for player and
rival, then delay color delivery without modifying either transaction or accumulating simulation
time. Reverse/recovery resynchronization remains independent of payload acquisition. The actual
Tsukuba window-to-lap mapping reuses one directory and shared payloads across its seam and virtual
laps. The product-root regressions also run all four actual entry modules with simulated DOM, canvas
and transport boundaries through initial failure, retry, drawing, ticks and page exit. These are
causal integration checks; real browser/device timing and input acceptance remain separate.

## Course Editor target

This target chapter owns course, authoring and gameplay transactions for Course Editor development. Current stage frames, finite circuit unfolding and ground-loading
integration remain the implemented paths until their replacements pass the gates in [NEXT](NEXT.md).
Frame mathematics and image representation belong to [architecture](architecture.md).

### Sections, ports and topology

A Section owns source geometry, height, cross-section, appearance/physical bindings, environment
profiles and placements in one chart. Its interior has no graph transition; its terminal fork may
contain two or three carriageways. Ports lie within authored support/visibility guard domains, so a
logical boundary is not necessarily the end of an open reader. Checkpoints and environment changes
are independent landmarks/profiles, rather than reasons to split a Section.

Links connect oriented ports with a compiled transform and matching overlap. Compile finite chains,
finite fork/merge DAGs, or one lap Section with an exit-to-entry loop. A merge references its successor
source once. Validate every exit, supported starts/goals and legal checkpoint order. Original game
stages identify checkpoint intervals and may also label environmental changes.

A loop closes topology, not the Section's source-world coordinates: its endpoints may have different
positions and headings. The same upright Link transform and common-overlap checks apply to loops,
merges and continuations. Identity is used only where the port frames already match. Neither endpoint
snapping, a fitted connector nor stretching the authored path is required to obtain closure. A Link
cannot conceal incompatible local heights, cross-sections or presentation. Real-circuit fidelity
remains an authored/reference requirement, separate from the runtime's need for a globally closed map.
The scored lap span is the positive exit-minus-entry source chainage; guard content is outside it.

The initial resolved Session retains a finite lap target. Unlimited CUSTOM has not been selected.
The bounded view reuses one lap source regardless of scored lap count; it replaces materialized
N+1 geometry only after equivalent contact, visibility, progress and recovery coverage exists.

### Authored plan primitives

The first document format uses an ordered sequence of identified straights and circular arcs, with
one Section start position/heading. A straight stores positive length; an arc stores positive radius
and nonzero signed turn. Endpoints/headings are derived by the existing Raster authoring compiler;
they are not independently editable state. Piecewise arcs are an explicit approximation of other
curves, with departures recorded against the course reference. Spline/clothoid fitting is outside
this initial format, not a second hidden shape generator or runtime curve system.

Compiled Raster chord chainage is the shared `s` ruler. The analytic arc length `R*abs(turn)` is not
an alternate coordinate. Primitive-fraction anchors resolve to that primitive's compiled chainage
interval. Tessellation preserves radius provenance and satisfies the existing turn, Guide and actual
band-validity constraints. Unsupported primitives produce diagnostics instead of silently fitting or
replacing the author's shape. A later primitive requires an explicit format/compiler revision.

### Cross-section and variable-width authoring

Course owns one longitudinal boundary geometry. The semantic records below define its authority;
exact wire spelling and resource limits are established with the versioned reader at Gate 1.

| Record                        | Stored meaning                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| Boundary                      | Stable ID and ordered knots of longitudinal anchor and lateral position in metres.           |
| Band                          | Stable ID, active longitudinal interval, left/right boundary references and structural role. |
| Carriageway                   | Stable ID grouping its pavement bands and referencing a fork exit port when applicable.      |
| Appearance / physical binding | Independent values/change points referencing bands or boundary geometry.                     |

Resolve knot anchors to the shared `s` ruler, then interpolate lateral position linearly between
successive knots. Intervals have positive chainage length and explicit end coverage; an exact knot
has one position. Band width is `right(s)-left(s)` and centre is their mean, both derived. Opposite
sides and different carriageways need not be symmetric or equally wide. Constant widths are simply
constant boundary profiles. Shared edges reference the same Boundary; material or paint changes do
not duplicate it. Display extents remain independent from supported extents.

Pavement, shoulders and medians are geometric roles, not implicit colours, friction or support.
One, two or three carriageways use the same band model; the product fork limit is three, not a
LEFT/RIGHT type in the geometry. Lanes within a carriageway are subdivisions/markings referencing
that geometry, not separate roads or implicit traffic behaviour. A fork's port mapping explicitly
names each positive-width outgoing carriageway.

Within an interval, active bands have positive width and ordered, noncrossing boundaries. A band
may taper to zero only at an explicitly declared birth/death endpoint; it owns no area at that point.
A split can change the partition at a shared station when the union of the adjacent pavement and
median bands joins continuously. No active interval is silently discarded for being narrow. At the
lock line all candidate carriageways and separating medians have positive width, and authored
physical bindings provide the required supported crossable median. Gates/grids use positive supported
regions. Classification on shared edges retains each consumer's explicit boundary convention.

Compile geometry, physical support, paint and route intent from these references through their
native owners. A varying physical boundary must be evaluated as authored, not approximated by
constant-width SurfaceMap sections or inferred from image pixels. The compiler checks widths and
ordering at the union of knots/activation changes and checks the actual world bands for inversion
or intersection between them. Cross-section knots, path vertices and height boundaries enter the
geometry rules owned by architecture. Current constant-width classes are not a completed implementation
of this target. Initial file/compiler slices must reject unsupported features rather than drop them.

### Occurrences and frame commit

Keep source Section identity, traversal occurrence and active coordinate frame distinct. Occurrence
history identifies the actual incoming Link and lap context; projected local chainage does not award
progress. Retain the history/coverage required by admitted reverse travel and recovery, including
through a merge. A reverse traversal uses the inverse of the actual visited Link.

A valid forward oriented seam crossing commits the next occurrence/frame. Prior field route locking
selects the legal successor but leaves the old frame authoritative until that actor's seam. The commit
re-expresses frame-dependent pose, velocities, world angular quantities, previous observations,
contact/projection caches and camera-follow state coherently using the architecture transform.
Body-local scalars and accepted game progress remain unchanged. Derived observations are recomputed
from their owners; the basis change itself produces no physical crossing or additional motion.

Recovery is a separate, reported gameplay discontinuity with known supported target coordinates.
Recovery and vehicle replacement reset observation baselines while preserving accepted gates, route
locks and lap progress. A crossing in reverse neither erases nor re-awards those events.

### Continuous local view

Runtime composition resolves the visited predecessor and the legal successor neighbourhood into
bounded ordinary readers for rendering, camera, wheel contact, nearby actors and driver lookahead.
Its derived chainage remains continuous across Links, even where source addresses reset. A point 5 m
into the next lap is 15 m ahead of a camera 10 m before the old lap end. One lap's source data is reused.

Each consumer declares the backward/forward extent it needs, including its permitted movement within
a fixed step. View construction covers that union. Source boundaries and vehicle-centre crossings do
not truncate front-wheel contact or the camera's required scene. Lower engine layers read the view;
course graph selection stays in composition/gameplay.

Compatible neighbouring occurrences share a local interaction frame. Rendering and physical contact
use transformed geometry; race order uses validated progress. Unrelated geographical overlaps do not
create vehicle interactions. Shared scenery/actors retain stable instance identity across the view.
An actor in the selected neighbouring occurrence remains visible when its transformed bounds enter
the normal view; package equality alone is not a visibility test.

### Seam and overlap

Seams lie in horizontal straights with matching cross-sections. Validate height and physical
differentials, road/shoulder/support boundaries, material answers, texture phase, markings, fill,
scenery identity and background/yaw alignment throughout the required common region. The upright
frame-transform restriction and this horizontal-geometry restriction are distinct requirements.

Contact overlap and visible/observation coverage have separate extents derived from the admitted
vehicles, camera and recovery policies. A fixed straight length is not a certificate. At the same
physical pose, both sides of a rebind must produce matching contact answers and continuous presentation.
Overlap contains only common content whose answers and presentation match on both sides of the
Link. Parent-specific content remains owned by its parent and satisfies the exit-visibility rule
below. A shared successor has the same source data for every incoming Link.

### Fork lock and handoff

Each fork is static parent content: split, supported parallel carriageways/medians, lock line,
closure point and exit seams. The ordered positions satisfy `lock < closure < exit seam` for every
candidate exit. Rival count does not select a different rule: the eligible field is the player plus
its zero-to-sixteen rivals. Traffic is outside that set.

Partition the supported lock-line cross-section at median centre lines. Each interval names one
carriageway; a shared boundary belongs to the left interval. A crossing outside supported coverage
is not a choice. Compile this partition from the cross-section, rather than guessing a road from
steering intent or nearest centre at runtime.

Observe eligible forward physical crossings before shared mutation. Order same-tick candidates by
intersection fraction `u`, then stable actor ID for an exact tie. The winner creates one immutable
lock for that fork occurrence. This chooses the field's legal branch, not a checkpoint award or an
actor's frame commit. Retarget rival intent immediately; each actor later crosses its own legal seam.

Warnings and closure barriers are ordinary state-selected presentation/interaction content. Losing
roads remain authored static geometry, peeling away within the parent chart; selecting a route does
not reshape or repaint the GroundMap. An actor unable to transfer uses explicit legal-route recovery
as a last resort, preserving earned progress. Barrier collision/response must be specified before
closed-road gameplay is accepted; a warning graphic alone is not a physical barrier.

#### Pre-lock coverage

Before route locking, all required forward queries are answerable from parent/common content. For
all admitted pre-lock poses and fixed-step advances, let `requiredEnd` be the farthest query in the
parent-derived view, and `commonEnd` the end of content valid for every exit. Require:

```text
requiredEnd <= commonEnd <= earliest exit seam
```

`requiredEnd` includes camera/render demand, contact and driver lookahead, not just display distance.
Consumers' declared extents make this an interval-coverage check, not a request to prove arbitrary
branch rendering. After locking, the selected Link extends the view. A failed coverage check reports
the consumer, pose/envelope and missing extent; content must provide the required common approach.

#### Exit presentation and lateral transfer

Parent-specific content, including departing roads and fork scenery, must leave the admitted visible
view before the exit seam. For each exit the compiler checks, in that exit's parent approach chainage:

```text
parentSpecificVisibleEnd <= exit seam
```

`parentSpecificVisibleEnd` is the exclusive end of the approach positions from which any parent-specific
content can contribute to the view, evaluated over the admitted camera/vehicle envelope. At the seam
itself none remains visible; a feature's own chainage or a strip-edge crossing is not this bound.

Authored static geometry, wider approach ground and ordinary foreground scenery or hills provide
the departure/occlusion. Qualification checks the actual product presentation, including camera offset
and admitted yaw/height, rather than assuming an occluder works from every pose. Overlap retains only
the matching common content; the successor stores no parent-dependent road tails or scenery variants.
The same test applies to every incoming Link of a merge. Inverse traversal uses the actual predecessor
history under the same visibility envelope; it does not install parent-specific data in the successor.

Independently derive the lock-to-closure distance from the admitted vehicle, speed, initial-state
and material envelope. Cover the largest transfer, including outer-to-outer movement at a three-way
fork. The ideal bound for zero initial/final lateral speed is `t = 2*sqrt(D/a)` and `distance = v*t`.
At D=30 m, a=5 m/s² and v=70 m/s this is about 343 m; D=60 m gives about 485 m. These are conditional
lower bounds, not universal lengths or a visibility proof.

Qualification also covers steering/response time, bike attitude, combined tire demand, yaw/slip,
vehicle width and actual median transitions. Deterministic product-physics scenarios document the
admitted envelope and margins. Geometry may pass coverage while failing transfer, or the reverse.
Record any required departure from the remastered reference.

### Gates, grade separation and interaction

Known occurrence, local neighbourhood and relevant height select candidate gates/surfaces. An actual
oriented physical crossing is still required. Grid-release, reverse, recovery, frame rebinds and raw
chainage changes do not manufacture checkpoints or laps. Overpass topology and vertical separation
also disambiguate vehicle contacts. Tunnel/background presentation is ordinary authored content.

Actual road, shoulder and support bands must pass local-inversion, nonadjacent-overlap and Guide-domain
checks. Centreline checks alone are insufficient. Explicit overpasses and intended lap copies are
classified separately from accidental intersection. Existing mechanics remain shared by player/rivals;
traffic and barrier contacts use a separately specified gameplay interaction boundary.

### Resolved Session

One resolver maps the selected preset and player settings to immutable execution data. It identifies
course/vehicle/calibration inputs, roster, traffic/driver policy, deterministic seed, start/finish
policy, finite lap target, checkpoint table and record eligibility. Course topology is not a substitute
for rules. Unsupported combinations fail before activation. Roots compose the resulting data rather
than exporting mode-name switches to renderer or vehicle integration.

Course rules own checkpoint landmarks, order, grid/finish and permitted lap configurations. `classic`
references those rules and supplies its vehicle/roster/traffic/margin defaults. Start timing, completion,
record eligibility and results are gameplay responsibilities. Detailed record categories, penalties,
continue and traffic/collision policies remain product decisions in [product](product.md#6-remaining-product-decisions).

### Reference times and clock

Run each admitted route and start/lap configuration continuously at the product fixed step, with no
rivals or traffic. Record accepted crossing times including within-step fractions. Each interval is
a difference between consecutive crossings, not a separately restarted trial. Start/later-lap states
remain distinguishable. Crashed, recovered, incomplete or unqualified trials cannot certify budgets.

Reference identity covers simulation-relevant course, vehicle, calibration, assist, driver, step,
start-state and seed inputs. Input changes invalidate the reference. Retain accepted output and
identity; a deterministic run alone is not evidence of comparable near-limit skill.

For each time-budget state, take the maximum upcoming-interval duration among admitted continuous
histories sharing that state and its legal next checkpoint/finish alternatives. Keep arrival classes
separate when required by start/lap conditions. This conservative rule may make shorter alternatives
easier; this is an intentional difficulty consequence. Enumerate the admitted finite route/lap configurations;
steering intention is not a budget input.

```text
budgetMs(state) = ceil(1000 * positiveFiniteMargin(course) * referenceSeconds(state))
```

The start state supplies initial time. Each newly accepted non-finish checkpoint adds its upcoming
budget, retaining unused time without a cap. FINISH adds none. Each checkpoint occurrence grants at
most once. Preserve event-time precision for ordering; only awarded budget quantities round to integer
milliseconds. Process gates/expiry chronologically; a valid checkpoint/finish wins an exact expiry tie.
An earlier expiry ends the run. Explicit pause/loading consumes no simulation time or catch-up time.

Reference-driver acceptance separates reproducible completion, comparable capability use and actual
difficulty. Rival difficulty changes a defined input/planning policy rather than scaling physical
forces. Timed combinations remain uncertified until their reference driver and content pass acceptance.

### Authoring documents and assets

| Artifact       | Authority                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------- |
| CourseDocument | Identity/references, geometry/profiles, Links, anchors, composition, rules and presets.     |
| Source assets  | Accepted image bytes or edited normalized masters, recipes, stable identity and provenance. |
| CompiledCourse | Immutable derived data/readers/images and a validated manifest.                             |
| Editor state   | Selection, panels, view positions and transient undo history.                               |

The schema has explicit format/version, stable Section/primitive/Link/landmark/placement IDs and
immutable asset references. Names are display values. Save units, seeds, phases, ordered stamps and
inputs needed by the compiler. Derived geometry, baked pixels and resolved sessions are outputs,
not parallel editable authorities. The Sprite Tool session remains its existing image-editing format.

One public course compiler composes existing small geometry, surface, image, rule and topology
compilers. Authoring schema/reader validation is established before the GUI relies on it. Exact
wire fields, resource limits and packed output are pending executable format review, not an invented
migration/plugin framework. Revision numbering of this document does not imply a runtime schema version.

Appearance and physical bindings can reference shared boundary geometry while owning separate values
and change points. Editor conveniences may initialize both; GroundMap and SurfaceMap compile independently.
Paint/repairs remain visual unless a physical region is explicitly authored. Validation distinguishes
unintended mismatches from intentional visible unsupported or transparent supported terrain. Source
colour slots never encode physics. New physical material names require defined mechanics.

### Anchors and saved composition

Placements/landmarks save either absolute Section chainage or a primitive ID plus fraction along that
primitive. Absolute values stay absolute; fractional anchors follow the same identified primitive.
Resolve through the existing geometry into `(s,l)`. Missing/deleted anchors are reported as errors.
Only ground-image placement receives the lattice rounding defined by [architecture](architecture.md#ground-composition-and-stamp-placement).

Saved layers, source phase, deterministic repair scatter and ordered stamps are authoring input.
Their exact pixel order and A/B derivation belong to architecture. Pattern rows compile to ordinary
placements with stable identities, including through shared overlaps. Source variants must match
repeat borders after normalization. `repairDensity` is visual and leaves mechanics/audio unchanged.

### Save, invalidation and preview

Drafts can be saved before semantic compilation succeeds. Parse/version/identity checks remain
separate from course validity diagnostics. Malformed imports preserve the current project; successful
save/reopen reproduces inputs and identical products under the same compiler/recipe versions.
Canonical ordering/digests depend on stored inputs and seeds, not filesystem order or wall-clock time.
Explicit future migrations preserve the prior source. Accepted bytes, rather than prompts, define replay.

Edits invalidate dependent outputs. Preview identifies its source/build revision, and stale products
are not exported or played as the edited course. Failed builds preserve source and prior valid products;
publish a complete successful build atomically. Reimport does not overwrite an edited master implicitly.

A 2D plan is an authoring view. Driving preview compiles before starting and uses the same product
readers, projection, renderer and vehicle integration. Browser and Node adapters call shared pure
functions. Source generation may remain external; opening an image does not require network upload.

### Course loading

Before enabling ticks, load and validate the complete compiled ground set for all reachable Sections,
counting shared sources/records once and reusing one circuit lap. Physics/topology use their own data.
Course replacement suspends ticking/input/audio, preserves a coherent state or loading display, and
provides retry/exit for failure. Stale arrivals cannot install into the new selection. Resume with a
fresh clock and cleared input ownership, without accumulated catch-up.

Required ground-capacity failure is explicit before a run; it does not select streaming, repainting
or lower-resolution art during play. Keep content identity and failure handling when retiring the
current page/prefetch implementation. Whole-course and switch-peak acceptance is defined in development.
