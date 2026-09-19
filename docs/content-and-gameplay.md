# Content and gameplay

This document owns current course transactions and the separately labelled Course Editor target.
[Architecture](architecture.md) owns coordinates and geometry, [image assets](image-assets.md) owns
image formats/compilation, and [ground delivery](ground-delivery.md) owns current payload transport.
[NEXT](NEXT.md) identifies the implemented boundary and ordered cutovers.

## Composition and data ownership

[Boot](../src/boot.ts) selects a catalog course through the [selector](../src/browser/course-mode-selection.ts).
The catalog owns query-to-root membership and its typed dispatcher requires the appropriate builders.
The three composition roots alone assemble concrete DEV content:

- [LINEAR](../src/main-linear.ts): a finite highway driving trial without route/FINISH/race observers.
- [BRANCHING](../src/main.ts): the open branching highway, shared route choice and rivals.
- [CIRCUIT](../src/main-circuit.ts): Tsukuba/FISCO, a finite lap window and race progress.

The [shell](../src/browser/driving-shell.ts) owns input, scheduling, player replacement, selectors,
HUD and presentation. The [lifecycle](../src/browser/driving-lifecycle.ts) orders recovery/replacement,
observer resynchronization and immediate camera reconstruction. Roots supply world, recovery profile
and resync callback. The [frame loop](../src/browser/frame-loop.ts) owns the accumulator and 0.25 s
catch-up limit. [Route driving](../src/runtime/route-driving-tick.ts) completes every actor's physics,
then arbitrates, recovers, rebinds and observes progress once per actor. [Circuit driving](../src/runtime/circuit-driving-tick.ts)
shares recovery/race/session updates. Results are keyed by actor identity, independent of roster order.
Rendering, camera and mechanics consume ordinary readers instead of mode names.

The [vehicle catalog](../src/vehicle/vehicle-catalog.ts) owns nine production identities and their
[compiled profiles](../src/vehicle/production-vehicle-profiles.ts). Model, manufacturer, identifier,
specification and period are distinct fields. Presentation uses car/bike metadata. Browser
[key bindings](../src/browser/key-bindings.ts) own shortcuts; input owns driving aliases and tests check
collisions. Testarossa is the current default player/fixed rival. Shared starting tire calibration is
not a requirement that finished vehicles have identical tires.

[Stage compilation](../src/runtime/stage-authoring-compiler.ts) builds geometry, height, visuals,
ground, surfaces, sprites and background into a [runtime package](../src/runtime/stage-runtime-content.ts).
[StageRoadView](../src/course/stage-road-view.ts) maps lateral/longitudinal coordinates for presentation.
Visual and physical views share explicit transforms with independent meanings. The shared cross-section
owns road dimensions; environment owns display extents. The terrain factory derives compiled widths
from those inputs and receives height/visual readers independently. Image changes do not split shape.

`src/dev/courses`, `src/dev/fixtures` and `src/dev/diagnostics` own shipped development composition,
regression inputs and read-only probes. [Raster authoring](../src/course/raster-turtle.ts) owns line/arc
subdivision and radius provenance. Course files own shape/topology. Focused and multi-step fixtures
share their authored inputs. [DEV](../src/dev/README.md) defines the dependency boundary.

### Current course boundary

[The glossary](README.md#vocabulary) maps current and target terms, including BRANCH/BRANCHING.
Current [successor generation](../src/runtime/raster-stage-successor.ts) copies overlap and adds a
prescribed excursion/runout. Growth promotes development terminals to forks. These are retained
content builders; current packages share one world frame and support symmetric two-way junctions.
Adjacent actors are drawn only in the player's active package. Roots still supply development grids.
These limitations are owned migration work, not target authoring or visibility rules.

The current declarative route compiler derives separate route/content/gate/handoff/registry tables,
then validates their joins. The [target reference graph](#compiled-course-reference-graph) replaces
that internal representation while retaining input validation and distinct gameplay responsibilities.

## Point-to-point route transaction

[RouteDag](../src/gameplay/route-dag.ts) owns acyclic legal stage successors. An oriented physical gate
crossing supplies progression. Its shared sign rule is negative to zero/positive for forward and
positive to zero/negative for reverse. Arrival counts once; departure from the plane does not repeat.
Lateral gate-width tolerance is separate from direction, with no crossing dead band.

1. A forward physical route gate validates a transition and enters PENDING.
2. The old chart/content stays authoritative through common overlap.
3. A forward handoff seam commits the target chart/content.
4. Current COMMIT re-expresses observations while preserving world pose and velocity.

[World gates](../src/gameplay/world-crossing-gate.ts), [handoff](../src/gameplay/route-stage-handoff.ts)
and the [multi-actor tick](../src/runtime/live-route-multi-actor-tick.ts) implement this order. Authored
overlap/runout and a valid local projection seed accompany every commit. [Continuation checks](../src/runtime/stage-continuation-link.ts)
partition at both charts' primitive boundaries and inspect endpoints/interiors, preserving circular
radius provenance. Guide chart arithmetic delegates to the Core frame primitive.

`FIRST_PHYSICAL_CROSSING_LOCKS` with `RECOVER_TO_LOCKED_BRANCH` owns shared current choice. A losing
crossing records a violation and recovers via legal gate geography, without awarding illegal progress.
Actor progress and active chart remain per-actor; route selection is field-owned. Current locking uses
separated transition gates and preserves input order for fractions within its named tie tolerance.
`INDEPENDENT` is a diagnostic policy. The target changes location, eligibility and tie ownership together.
A terminal stage entry still requires a later physical FINISH to complete the run.

## Circuit and race progress

[Circuit topology](../src/gameplay/circuit-topology.ts) authors one closed lap above Core. Current
[unfolding](../src/runtime/circuit-runtime-window.ts) materializes at least N+1 finite open copies for
N scored laps, with final runout. General readers/rendering remain topology-neutral.

[Race progress](../src/gameplay/circuit-race-progress.ts) accepts ordered forward checkpoints and FINISH.
Winding alone, skipped checkpoints, reverse travel, replacement and recovery grant no lap. Observations
are resynchronized while preserving accepted history. [Session configuration](../src/gameplay/session-configuration.ts),
[race session](../src/gameplay/race-session.ts) and [objective](../src/gameplay/run-objective.ts) own game rules.

[Tsukuba](../src/dev/courses/tsukuba-circuit.ts) and [FISCO](../src/dev/courses/fisco-circuit.ts) are functional
simplified courses; source comments distinguish reference dimensions from simplified connectors.
Their visual profiles use unfolded chainage for both boundaries and sampled section starts.

## Recovery

[Recovery](../src/gameplay/recovery.ts) is an explicit gameplay discontinuity observing support, falling,
penetration, chart excursion and overturning. `advanceVehicleWithRecovery` catches the typed suspension
travel exit; unrelated errors propagate. Reconstruct pose, velocities, wheels, actuators, powertrain
and observations at known supported coordinates while retaining steering/tire calibration.

Ordinary same-chart recovery backs off from the farther of current causal chainage and last-safe
chainage, avoiding repeated recovery onto the same launch face. Wrong-route recovery uses the legal
physical-gate approach and the actor's authored backtracking/retained-speed profile.

Route/circuit ticks resync once after recovery and suppress crossing credit for that reset. The browser
then resets/updates the player's camera. Earned gates, locks and laps remain intact. Known coordinates
preserve the correct occurrence; global nearest geometry is not a substitute. Vehicle replacement
reconstructs the camera in the same callback, before any render without a new physics tick.

## Rivals and future game systems

The [driver](../src/gameplay/rival-driver.ts) publishes canonical input from physical travel and Guide
lookahead, including a contiguous braking envelope. Driving policy leaves forces and route authority
unchanged. Presentation reads immutable vehicle/telemetry state. Scoring and race state belong to
gameplay, composed at the roots. Contacts, richer rivals and game effects need explicit interaction
contracts and causal tests.

## Concrete visual content

[Tunnel content](../src/dev/courses/tunnel.ts) owns portals/ribs, placements and its camera-offset
background interval, composed as ordinary sprites/background. General rendering remains location-neutral.
Current children continue forward from the shared overlap.

## Accepted authoring workflow: pending implementation

The target below owns future course/session/project/loading semantics. Current Sprite Tool normalization,
mask/palette editing, saved session and master/LOD exports are implemented under
[image assets](image-assets.md#sprite-tool-authoring-session) and [development](development.md#sprite-tool).
Three-dimensional capture remains a separate experiment: camera projection, origin, angle labels,
pivot, lighting, crop/anchor and sampling are open. SINGLE remains current; DUAL is deferred.

### GroundMap loading and handoff

All four current course selections use the shared shell/GroundPresentation lifecycle. Packages refer
to complete stage-local baked color sources; the compiler owns source offsets. Physics, gates and
progress remain independent. Circuit windows share one lap reader/directory/payload store.

The coordinator acquires exact frame demand and may prefetch one adjacent-chunk job under the same
limits. It loads the actually selected source; route gate -> PENDING -> seam -> COMMIT owns selection.
Pin the old frame through replacement and count shared payloads once. Camera guards, reverse, recovery
and course switching contribute demand; other actors' physical presence alone does not load images.

`ReadyFrameController` presents only a complete ready set. A miss retains the last complete frame and
simulation state, suspends ticks/input/audio, and exposes retry/exit on failure. A ready replacement
publishes synchronously, releases old pins and restarts with a fresh clock, without catch-up. Keep
physical commits, velocities, forces, event order and selected LOD unchanged during loading.

The shell clears touch/keyboard ownership and disables driving controls while waiting; course selection
remains available. Repeated held keys do not revive cleared input. Resident hits keep the scheduler
running. Page exit disposes the session; back-forward restoration reloads a fresh session. Late arrivals
from superseded requests cannot install. Failures retain immutable content identity for retry.

[Ground delivery](ground-delivery.md) owns bytes/leases. Existing integration fixtures cross real
player/rival gates and COMMIT, then delay loading without rollback. Circuit tests cover actual lap
mapping, reverse/recovery and shared directories. Real roots run through simulated DOM/canvas/HTTP
failure, retry, drawing, ticking and exit; device timing/input acceptance remains separate.

## Course Editor target

This target owns authoring, compiled-course relationships and gameplay transactions. Current paths
above remain until their corresponding cutover passes [NEXT](NEXT.md) and its causal evidence.

### Sections, ports and topology

A Section owns source geometry, height, cross-section, appearance/physical bindings, environment
profiles and placements in one chart. Its interior has no graph transition; a terminal fork can have
two or three carriageways. Ports lie inside authored support/visibility guard domains. Checkpoints
and environment changes are independent landmarks/profiles.

Links join oriented ports with a derived transform and matching common overlap. Compile finite chains,
finite fork/merge DAGs, or a lap Section with an exit-to-entry loop. A merge reuses one successor source.
Validate every exit, supported start/goal and checkpoint order. Original-game stages may identify
checkpoint intervals and environmental changes without splitting the Section.

A loop closes topology rather than source-world coordinates. Its endpoints may differ in position
and heading. The same upright transform/overlap checks apply to loops, merges and continuations;
identity applies only when port frames already match. Closure requires neither snapping, a fitted
connector nor stretching the authored path. Local heights, cross-sections and presentation must agree.
Real-circuit fidelity is a separate reference requirement. Scored lap span is positive exit-minus-entry
source chainage, excluding guards. Initial Sessions retain finite lap targets; unlimited CUSTOM remains
unselected. A bounded view reuses one lap source regardless of scored count.

### Compiled-course reference graph

IDs belong to saved documents, diagnostics, asset identities and serialization. At the admission
boundary, resolve each declared reference once, checking its scope, uniqueness and target. Build one
immutable CompiledCourse graph: Links refer to canonical source/destination ports and Sections; Bands
refer to canonical Boundaries; rules refer to canonical landmarks. Merges share one Section object.
A loop is an intentional graph cycle, not a request to copy the source.

The compiler owns private construction tables and may allocate/link nodes in phases to support cycles.
Publish only the completed validated graph, with owned readonly arrays/records and protected buffers.
`Object.freeze` on a mutable Map or an outer object alone is insufficient. A failed build publishes
nothing. Mutable actor occurrences, route locks and clocks stay outside the static graph.

Gameplay, physical and rendering facets are narrow views of this graph, derived at the owning layer.
They are not independent editable tables rejoined by strings later. Preserve the layer dependency graph:
Core, physics and rendering receive ordinary readers/data, not upward imports of CompiledCourse.
An external index may locate a loaded course/asset; steady-state relationships use resolved references.

Retain IDs as provenance and stable external identity when needed, including actor tie-breaking.
Do not require strings to disappear from runtime metadata. Serialized IDs or compact indices are
resolved/validated when loading, then expose the same reference-based product. Object identity is local
to one compilation; cross-build equivalence uses content/compiler identity rather than pointer equality.
Independent public inputs and changing numerical observations still require their boundary validation.

### Authored plan primitives

The initial format uses an ordered sequence of identified straights/circular arcs and one Section
start position/heading. Straights store positive length; arcs positive radius and nonzero signed turn.
The existing Raster compiler derives endpoints/headings. Other curves use explicitly authored piecewise
approximations with recorded reference departures. Unsupported primitives receive diagnostics; adding
a primitive requires a format/compiler revision.

Compiled Raster chord chainage is the shared s ruler. Analytic arc length is not another coordinate.
Primitive-fraction anchors resolve within that primitive's compiled interval. Tessellation preserves
radius provenance and satisfies turn, Guide and actual band-validity constraints.

### Geometry identity and anchor replay

Save an explicit geometry compiler/recipe identity and version with the authoring inputs; include it
in every dependent compiled identity. It covers straight subdivision, arc subdivision, authored angle
units, subdivision-count rounding, radius provenance, accumulation/order and anchor resolution. The
current turtle's 50 m straight steps, maximum 5-degree arc steps and degree/radian entry behavior are
part of its recipe, not invisible defaults that may change under the same identity.

Changing that recipe invalidates geometry, anchored placements/landmarks, ground and reference-time
outputs that depend on it. Reopen with the saved recipe or report an unsupported version. Recompiling
with a different tessellation is an explicit migration producing new source/build identity, preserving
the previous source and reporting anchor displacement. Absolute s values otherwise retain their numeric
value; primitive-fraction anchors follow the named primitive. Neither silently guarantees an unchanged
world point after a ruler change. Exact wire fields are established by the versioned reader at Gate 1.

### Cross-section and variable-width authoring

Course owns one longitudinal boundary geometry. A Boundary stores a stable ID and ordered knots of
longitudinal anchor plus lateral position. A Band stores an active interval, left/right Boundary
references and a structural role. A Carriageway groups pavement Bands and names an exit port where
applicable. Appearance and physical bindings independently reference this geometry.

Resolve anchors to the common s ruler and interpolate lateral positions linearly between knots.
Intervals have positive chainage length and explicit coverage. Width is `right(s)-left(s)` and center
is their mean; neither is another stored authority. Sides/carriageways may be asymmetric or unequal.
Constant width is a constant boundary profile. Shared edges reference the same Boundary object.
Display and support extents retain their separate meanings.

Pavement, shoulders and medians are structural roles rather than implicit color, grip or support.
One/two/three carriageways use the same model. Lanes are subdivisions/markings within carriageways,
with separately specified traffic behavior. Port mapping names each positive-width outgoing road.

Active bands have positive width and ordered noncrossing boundaries. Zero width is allowed only at
an explicit birth/death endpoint and owns no area. A split may change the partition at a shared station
with continuous union of pavement/median bands. At the lock line all candidate roads and separating
medians have positive width, and physical bindings supply a supported crossable median. Gates/grids
use supported positive-width regions. [Target lateral ownership](architecture.md#target-lateral-boundary-ownership)
applies equally to physical, source-visual and lock-region point classification.

Compile paint, physical support and route intent through their own readers over these references.
Evaluate varying boundaries as authored; unsupported features are diagnosed rather than replaced with
constant-width sections. Check knots, activation changes and mapped-band interiors for inversion or
intersection. [Architecture](architecture.md#compiled-boundary-geometry) owns geometric partitioning
and the [local Guide envelope](architecture.md#target-local-guide-envelope) that permits a wide straight
fork and a distant tight curve in one Section.

### Occurrences and frame commit

Keep reusable Section identity, traversal occurrence and active coordinate frame distinct. History
identifies the actual incoming Link/lap and retains coverage required by admitted reverse/recovery.
Reverse traversal follows the inverse of the visited Link.

A forward oriented seam crossing commits that actor's next occurrence/frame. Field locking chooses
the legal successor while the old frame stays active until the actor's seam. Commit transforms pose,
velocities, world angular quantities, previous observations, contact/projection caches and camera
follow state coherently. Body-local values and accepted progress stay unchanged. Recompute derived
observations from their owners; the basis change adds no physical crossing or motion.

Recovery is a separately reported discontinuity with a known supported target. Recovery/replacement
reset observation baselines while retaining gates, route locks and lap credit. Reverse travel neither
erases nor re-awards those events.

### Continuous local view

A runtime-owned bounded view follows already legal Links/occurrences to cover each consumer's declared
range: camera and rendering, contact queries, driver lookahead, reverse and recovery. It exposes ordinary
open readers with one source-to-view address mapping. Source Sections/assets are shared, including laps;
view construction does not allocate all scored laps or copy shared image data. Keep graph choice and
occurrence history above the renderer and integrator.

Compatible neighboring occurrences share a local interaction frame. Rendering/contact use transformed
geometry and validated source identity; ranking uses accepted progress. Unrelated geographic overlaps
do not cause vehicle contact. Shared scenery/actors retain stable instance identity. A neighboring
actor is visible when its transformed bounds enter the view, independent of package equality.

### Seam and overlap

A seam lies in an authored horizontal straight with compatible cross-section, support/material and
height on both sides. Guard domains cover straddling contacts, camera, lookahead, reverse and recovery.
Validate the common region under the port transform, not just one matching point. Source layers,
marking/texture phase, filter context, scenery identity, background and camera state must be continuous.
A proposed 25 m guard is not a universal consumer-range guarantee; derive required coverage.

Physical agreement and picture continuity are separate evidence. A shared scenery instance appears
once, and a transform cannot manufacture gate credit. Overlap contains only matching common content;
parent-specific content is governed by the exit contract below.

### Fork lock and handoff

The parent authors split, parallel roads/medians, lock, closure and exit ports. Static geometry stays
fixed after route choice. Require `lock < closure < exit seam` for every exit. The eligible field is
player plus rivals in every mode; traffic does not vote. With zero rivals, the player is the whole field.

Partition supported lock-line space at separating median centerlines, associating each region with
one positive-width carriageway. Use the [half-open rule](architecture.md#target-lateral-boundary-ownership):
an exact shared boundary belongs to its right-hand region; unsupported/outside crossings select none.
Compile this partition from geometry, independent of steering intent or nearest-center guesses.

Observe all eligible forward crossings before mutation. Order candidates by intersection fraction u,
then stable actor ID for an exact tie. The winner establishes one irreversible lock for that fork
occurrence. Locking grants neither a checkpoint nor an actor's frame commit. Retarget rivals immediately;
each actor later crosses its own legal seam.

Warnings and barriers are ordinary state-selected presentation/interaction content. Losing roads remain
static parent geometry. A vehicle unable to transfer uses legal-route recovery as a last resort, retaining
accepted progress. Define barrier interaction before accepting closed-road gameplay.

#### Pre-lock coverage

For every admitted pre-lock pose and fixed-step advance, parent/common content supplies all required
forward queries. In the parent-derived view require `requiredEnd <= commonEnd <= earliest exit seam`.
Required range includes camera/render, contacts and driver lookahead, not just display depth. Declared
consumer extents make this an interval-coverage check. After lock, the selected Link extends the view.
A failure identifies consumer, pose/envelope and missing extent; content provides sufficient approach.

#### Exit presentation and lateral transfer

For each exit require `parentSpecificVisibleEnd <= exit seam`. This is the exclusive end of approach
positions from which parent-specific roads/scenery contribute to the admitted camera/vehicle view,
not the feature's own chainage. At the seam itself none remains visible.

Authored static geometry, wider approach ground and ordinary scenery/hills provide departure/occlusion.
Qualify the actual product presentation over admitted camera offset/yaw/height. The successor retains
only matching common overlap, without parent-specific tails or variants. Every incoming Link of a merge
uses this same check; inverse traversal uses actual predecessor history under the same envelope.

Separately derive lock-to-closure distance from vehicle, speed, initial-state and material envelopes,
including outer-to-outer travel at three-way forks. The ideal zero-initial/final-lateral-speed bound is
`t=2*sqrt(D/a)`, distance `v*t`: D=30 m, a=5 m/s2 and v=70 m/s gives about 343 m; D=60 m gives about
485 m. These are conditional lower bounds, separate from visibility.

Qualify response time, bike attitude, combined tire demand, yaw/slip, vehicle width and median transitions
through deterministic physics scenarios. Record admitted envelopes/margins and remaster departures.

### Gates, grade separation and interaction

Known occurrence, neighborhood and height select gate/surface candidates. Actual oriented physical
crossing remains required; release, reverse, recovery, frame rebinding and raw s changes grant no
checkpoint or lap. Height/topology also disambiguate overpass contacts. Tunnel/background effects are
ordinary content. Validate mapped road/shoulder/support bands, Guide domains and nonadjacent intersections,
separately classifying intentional overpasses/lap copies. Traffic/barrier response has its own interaction
contract; player/rivals retain common vehicle mechanics.

### Resolved Session

Resolve mode/preset/settings into immutable course/vehicle/calibration references, roster, traffic/driver
policy, seed, start/finish policy, finite lap target, checkpoint budgets and record eligibility. Reject
unsupported combinations before activation. Roots compose this data; lower layers receive policies/readers.

Course rules own landmarks/order, grid/finish and permitted laps. CLASSIC references them and supplies
vehicle, roster, traffic and margin defaults. Gameplay owns start timing, completion and results.
Remaining product decisions stay in [Product](product.md#6-remaining-product-decisions).

### Reference times and clock

Run each admitted route/start/lap configuration continuously with the product fixed step, without rivals
or traffic. Record accepted crossing times including within-step fractions and derive intervals from
consecutive crossings. Keep start/later-lap arrival classes distinct. Crashed, recovered, incomplete or
unqualified runs cannot certify budgets.

Reference identity includes simulation-relevant course geometry/compiler identity, vehicle, calibration,
assist, driver, step, start and seed inputs. Changes invalidate affected outputs. Retain accepted results
and identity; qualification separately establishes comparable capability use and checkpoint difficulty.

For each budget state, take the maximum upcoming-interval duration across admitted continuous histories
sharing that state and its legal next checkpoint/finish alternatives. Distinguish arrival classes where
start/lap conditions require it. This deliberately makes shorter alternatives easier. Enumerate finite
admitted routes/laps; steering intention is not a budget input.

```text
budgetMs(state) = ceil(1000*positiveFiniteMargin(course)*referenceSeconds(state))
```

Start receives its initial budget. Each newly accepted non-finish checkpoint adds the upcoming budget,
retaining unused time without a cap. FINISH adds none. Grant each occurrence at most once. Preserve
precise event times for ordering and round only awarded budgets to integer milliseconds. Process expiry
and gates chronologically; a valid checkpoint/FINISH wins an exact expiry tie. Earlier expiry ends the
run. Explicit pause/loading consumes neither simulation time nor catch-up time.

Reference-driver acceptance has three stages: reproducible completion, comparable capability use and
accepted difficulty. Rival difficulty changes a defined planning/input policy rather than forces.
Timed presets stay uncertified until these gates pass.

### Authoring documents and assets

CourseDocument owns identity/references, geometry/profiles, Links, anchors, composition, rules and presets.
Source assets own saved bytes or edited normalized masters, recipes, identity and provenance. CompiledCourse
owns derived graph/readers/images. Editor state owns selections, panels, view and transient undo.

The versioned schema defines ID scopes, units, seeds, phases, stamp order and the pinned geometry recipe.
Display names are labels. Geometry, pixels and resolved Sessions are generated products. Sprite Tool's
local image session retains its existing scope. One public compiler composes small domain compilers,
resolves references as specified above and exposes actionable structured diagnostics. Exact wire fields,
resource limits and packed encoding are validated before GUI dependence; document revision numbering
is independent of runtime schema version.

Appearance/physical bindings may share boundary references while owning independent values and change
points. Editor conveniences may initialize both. Explicit physical regions alone change support/friction;
paint and repairs otherwise remain visual. Validate accidental mismatches separately from intentional
visible-unsupported or transparent-supported content. New physical material names need defined mechanics.

### Anchors and saved composition

A placement/landmark stores absolute Section s or a primitive ID plus fraction. Resolve to `(s,l)` through
the pinned geometry recipe. Deleted/missing anchors are errors. Only ground-image top-left positions
receive [image placement rounding](image-assets.md#ground-composition-and-stamp-placement).

Save layers, source phases, repair scatter seeds and stamp order. Image assets owns pixel order and
A/B derivation. Pattern rows compile to stable ordinary instances, shared through overlap. Source
variants match repeat borders after normalization. `repairDensity` changes visuals only.

### Save, invalidation and preview

Draft saving requires a valid parse/schema/identity boundary, independently of semantic compilation.
Malformed imports preserve the project. Save/reopen reproduces inputs and products under the pinned
compiler/recipe and supported execution contract. Ordering/digests depend on saved input, not clocks
or filesystem enumeration. Explicit migrations preserve previous source; saved bytes define replay.

Edits invalidate dependent products. Preview shows its source/build identity; stale products cannot be
exported or played as the edited course. Failed builds preserve source and prior valid products. Publish
a complete successful build atomically. Reimport explicitly resolves conflicts with edited masters.

The 2D plan is an authoring view. Driving preview uses the product compiler/readers, projection, rendering
and mechanics. Browser/Node adapters call shared pure functions. External image generation is sufficient;
opening a saved image does not upload it.

### Course loading

Before ticks, load and validate complete ground for all reachable Sections, counting shared records once
and reusing one lap source. Physics/topology have their own data. Replacement suspends input/audio/ticks,
preserves coherent state or a loading display, and offers retry/exit. Stale arrivals cannot install.
Resume with a fresh clock and cleared input ownership. Capacity failures are explicit before play,
without a hidden switch to streaming or lower-quality art. Retain content identity and failure handling
when retiring current pages/prefetch. [Development](development.md#capacity-model) owns residency/switch peaks.
