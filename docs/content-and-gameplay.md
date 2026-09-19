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

## CourseDocument v3: implemented compiler boundary

[Admission and serialization](../src/course/course-document.ts),
[geometry recipe](../src/course/course-geometry.ts),
[course compilation](../src/runtime/compiled-course.ts) and
[project transactions](../src/runtime/course-project.ts) implement Gate 1 independently of the current
driving roots. The [constant LINEAR example](../tests/fixtures/linear.course.json) and
[varying LINEAR example](../tests/fixtures/varying-linear.course.json),
[linked LINEAR example](../tests/fixtures/linked-linear.course.json) and
[transformed loop](../tests/fixtures/transformed-loop.course.json) are executable inputs for
the [offline entry](development.md#course-document-compiler). A compiled document is geometry/reference
data with explicit height/physical content, not a ready driving Session or loaded image product.

### Wire fields and scopes

All fields below are required. Objects reject unknown fields; arrays retain their saved order. The
reader creates owned frozen records in schema field order and normalizes negative zero to zero.
Save emits compact UTF-8 JSON. Whitespace and object-property order do not affect source identity;
array order is saved input, including meaningful primitive and knot order. Display labels,
appearance bindings, placements and rules are not yet wire fields.

| Record           | Exact v3 fields                                                                                                                                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CourseDocument   | `format: "superoutride.course"`, `version: 3`, `id`, `units: {length: "m", angle: "deg"}`, `geometryRecipe: {id, version}`, `type: "LINEAR" \| "BRANCH" \| "CIRCUIT"`, `entrySectionId`, `sections`, `links`, `assets`                    |
| Section          | `id`, `start: {x, z, heading}`, `guide: {margin, mMin}`, `primitives`, `boundaries`, `bands`, `height: [{anchor, y}, ...]`, `physicalBindings: [{bandId, sections: [{anchor, material}, ...]}, ...]`, `carriageways`, `ports`, `assetIds` |
| Straight         | `id`, `kind: "straight"`, `length`                                                                                                                                                                                                        |
| Circular arc     | `id`, `kind: "arc"`, `radius`, `turn` (signed degrees)                                                                                                                                                                                    |
| Absolute anchor  | `kind: "absolute"`, `s`                                                                                                                                                                                                                   |
| Primitive anchor | `kind: "primitive"`, `primitiveId`, `fraction`                                                                                                                                                                                            |
| Boundary         | `id`, `knots: [{anchor, l}, ...]`                                                                                                                                                                                                         |
| Band             | `id`, `start`, `end`, `leftBoundaryId`, `rightBoundaryId`, `role` (`"pavement"`, `"shoulder"` or `"median"`)                                                                                                                              |
| Carriageway      | `id`, `bandIds`                                                                                                                                                                                                                           |
| Port             | `id`, `kind: "entry" \| "exit"`, `anchor`, `carriagewayId`                                                                                                                                                                                |
| Link             | `id`, `source: {sectionId, portId}`, `destination: {sectionId, portId}`, `overlap: {behind, ahead}`                                                                                                                                       |
| Asset reference  | `id`, `format: "superoutride.sprite-lod"`, `version: 1`, `sha256`                                                                                                                                                                         |

IDs are opaque nonblank strings, compared exactly without Unicode/whitespace normalization. Course ID
is external identity; Section, Link and asset IDs each have a document-wide scope. Primitive, Boundary,
Band, Carriageway and Port IDs each have a separate Section-local scope. Duplicate declaration IDs fail
admission. References resolve within their declared scope, never by array position or naming convention.
Empty arrays and unresolved references may be saved as drafts; successful compilation requires complete
semantic input. A well-formed but unavailable geometry recipe may also be saved, and fails compilation
with `unsupported_version`. Schema/format and unit mismatches fail admission. Schemas v1/v2 are explicitly
unsupported; the checked-in fixtures explicitly author flat height and ASPHALT profiles for their Bands.
There is no implicit root from declaration order or compatibility interpretation.

Asset references bind the exact saved completed-sprite bytes by lowercase SHA-256. Section membership
resolves to canonical descriptor objects. Gate 1 neither fetches those bytes nor certifies image
readiness, placement or integrity; payload admission stays with the existing image reader and future
course loading. An empty asset list is sufficient for the geometry fixture. No mutable pixel buffers
enter this product.

### Domains and admission limits

All numeric inputs must be finite. Length/radius are in `(0, 100000]` m; initial X/Z are within
plus/minus 1000000 m; initial heading is in `[-360, 360]` degrees. Arc turn is nonzero in the same
angle range. Absolute anchors are in `[0, 100000]` m and fractions in `[0, 1]`. Lateral positions
are within plus/minus 1000 m, heights within plus/minus 10000 m, Guide margin in `(0, 1000]` m, and `0 < mMin < 1`. Link overlap extents
are each in `(0, 100000]` m and must fit both finite Section domains. Recipe version is
an integer in `[1, 65535]`. The geometry compiler additionally enforces finite, positive, valid
compiled intervals and the existing Core metrics; a positive authored length need not survive
floating-point geometry admission.

`COURSE_DOCUMENT_LIMITS` owns 4 MiB UTF-8 JSON, 128 UTF-16 code units per ID, 16 Sections, 48 Links and 256 assets;
per Section: 256 plan primitives, 32 Boundaries, 256 knots per Boundary, 32 Bands, 16 Carriageways, 4 Ports and
256 asset references, 256 height nodes, 32 physical bindings and 256 material changes per binding.
Compilation caps each Section at 2048 Raster segments, 4096 mapped-band partition
cells and 100000 m of compiled chainage, checking subdivision counts before emitting vertices and
partition size before the quadratic pair checks. A Link admits at most 8192 overlap cells.
These authoring limits bound work
and diagnostics; they are not whole-game or target-device capacity approval.

### Supported geometry and recipe

The accepted recipe is `superoutride.raster-guide` version 3. It pins `RasterTurtle` version 1 and
the existing Raster arithmetic: straight segments use `ceil(length/50)` equal steps; arcs use
`ceil(abs(turnDegrees)/5)` equal angular steps computed in authored degrees, then convert angles with
`PI/180`. Initial heading also uses degrees. The retained turtle radian API remains available to
existing development content; it is not a second document interpretation.

Arc radius provenance covers its initial and emitted vertices. A following arc overwrites the shared
vertex's provenance with its own radius. Turtle accumulation remains its sequential analytic chord
estimate; **the document ruler comes only from RasterPath**: sequential `Math.hypot` of emitted vertex
differences in primitive order. Each primitive retains its interval on that ruler. Fraction 0/1
resolves exactly to the interval endpoints; interior fractions use `start + fraction*(end-start)`.
Absolute anchors keep their authored s and must lie in the finite Section domain.

Each Section has piecewise-linear Boundary profiles and
Band intervals within `[0,L]`. Knots remain explicit and strictly increasing. A Boundary may cover
only part of the Section, but must cover every referencing Band's closed interval; readers never
extrapolate. Constant profiles use this same representation. Each Band has positive chainage length
and strictly positive width in its interior. Zero width is allowed only at its own start/end, never
throughout a cell. A zero-width endpoint owns no point. Bands do not overlap. Edges shared over a
positive-length interval reference one canonical Boundary; distinct edges may meet at an activation
endpoint before separating. No width approximation is substituted.

Every pavement Band belongs to exactly one Carriageway. At each longitudinal cell its active members
form one contiguous group; successive members need not coexist. The Section has at least one active
Band in every open cell. At activation changes, both the union of all Bands and the pavement/median
union must be continuous, comparing every occupied interval rather than only outer bounds. This
permits positive-width partition replacement and zero-width taper birth/death, including a static
one-to-two/three-to-one cross-section. Connections use the separate Port/Link proof below. Shoulders/medians remain
structural roles, with no inferred paint, grip or support.

Recipe v3 partitions at Raster vertices, all used Boundary knots and Band activation endpoints.
Each cell uses its own active lateral ordering. Widths and shared-edge references are checked on
both closed ends; linear interpolation cannot hide an intervening crossing or a zero-width plateau.
The mapped-strip Jacobian is affine in chainage/lateral position within
each Raster interval, so its boundary extrema prove local non-inversion. Varying edges under the
interpolated miter map are quadratic, not straight corner-to-corner lines. Their Bernstein control
hulls conservatively enclose the complete cell. Nonadjacent Raster intervals must have separated hulls;
the positive Jacobian separates same/adjacent intervals. Gaps are conservatively included. A failure
to prove separation is a `semantic_compile_failure` identifying cells, not a claim that sampled
endpoints suffice. This bounded simple-strip subset rejects overpasses/overlaps and can conservatively
reject disjoint curved strips whose hulls overlap. It does not classify general topology.

The derived Guide envelope interpolates the maximum absolute active boundary position plus margin
at these stations. Both closed incident cells contribute at a transition, including zero-area
birth/death points; dormant profile portions do not contribute. This is a conservative upper bound
between knots, not another authored width. The Core
[local-envelope contract](architecture.md#target-local-guide-envelope) checks each complete fillet;
a distant wide straight does not widen a tight bend. The margin covers only the explicitly admitted
chart domain: no contact/vehicle query envelope or physical binding is inferred here.
`courseBoundaryAt` and `courseBandAt` expose ordinary canonical data readers. The latter takes the
Section's `bandPartition` facet (`length`, canonical `bands`), not the whole CompiledCourse. It returns
the owning Band or null for a gap/outside: longitudinal membership is `[start,end)`, except a Band
ending at Section length includes that terminal; lateral membership is `[left,right)`. At a partition
switch only starting and continuing Bands own points. Invalid/nonfinite queries throw RangeError.
No role implies grip, paint or lock eligibility.
Legacy physical/paint/junction edge classification remains unchanged until the combined runtime cutover.

Recipes v1/v2 are not silently reinterpreted. Their documents remain saveable but compilation reports
`unsupported_version`; changing to v3 is an explicit source edit that invalidates prior output.
The checked-in constant/varying fixtures explicitly select v3 and retain their rulers and fillet geometry.
Raster/Guide authoring-domain rejections are RangeError; internal coverage/reader invariants retain Error.

### Explicit height and physical bindings

[Physical compilation](../src/runtime/course-physical-content.ts) resolves height anchors on the same
Section ruler. Nodes must be strictly increasing, include exactly 0 and L, and yield finite render
and smooth-physics grades. The immutable Core `HeightProfile` remains the one implementation:
piecewise-linear render height and cosine-smoothed physical/camera height, independent of lateral position.

Every Band has exactly one explicit physical binding. Its ordered, piecewise-constant material profile
begins exactly at Band activation; subsequent changes lie strictly before Band end. Start-inclusive
changes extend to the next change or Band end. Material names resolve once to the existing immutable
Physics definitions: ASPHALT, SHOULDER, GRASS, DIRT, SAND or explicit VOID. Unknown, repeated, missing or
uncovered bindings receive structured diagnostics. Structural role never supplies a material default.
Physical and appearance values/change points remain independent; no image content is inferred.

Compiled bindings point to canonical Bands and resolved material records. The graph's material type is
generic so Course does not import Physics. Runtime composes these records; the Physics
[Band surface adapter](../src/physics/band-surface-reader.ts) receives only the partition and bindings.
It uses canonical half-open Band ownership, returning VOID outside/in gaps. Its conservative support
bound includes active supported profile endpoints and interior Boundary knots, not dormant/VOID portions.
No geometry is copied and no reader resolves an ID. This offline facet does not replace the legacy
SurfaceMap or adapt occurrence/frame mappings for contact, projection or terrain.

### Offline physical overlap qualification

[Physical qualification](../src/runtime/course-physical-overlap.ts) is a separate all-or-none operation
over an explicit canonical Link list. Pass the whole course Link list for course-wide evidence; a subset
certifies only those Links. The result lists those same references with scope `physical-overlap`.
It never upgrades CompiledLink itself to a runtime-ready product.

Each guard must be horizontal across every intersecting height segment; this proves both linear render
height and smooth physical/camera height constant throughout the guard. Heights must agree under the
upright transform to the Link position tolerance (1e-7 m). Equal seam height cannot hide an interior hill.

Partition both rulers at all physical Band activation endpoints, referenced Boundary knots and material
changes, using the shared exact-station compiler. Every positive cell must remain representable in both
rulers. On the straight guards already proved by CompiledLink, compare the entire lateral support/material
field relative to the derived Port lateral anchors. Omit explicit VOID/outside and coalesce touching
same-material subdivisions. The ordered material regions and both linear edge endpoints must agree
to the same position tolerance; endpoint bounds prove the complete cell. Check each exact station too,
including the closed guard endpoints, so a start-inclusive change cannot escape the proof. This includes
nonselected roads, shoulders and medians, not just the selected pavement envelope.

The offline command checks every Link, including all incoming merge Links. Geometry-only fork fixtures
with extra unmatched parent roads fail physical qualification even though their CompiledLinks remain valid.
This proves support/material/height agreement only: it does not prove appearance, source image/phase,
scenery/background identity, product consumer coverage, parent-specific visibility or runtime transition
readiness. Those prerequisites remain before joint cutover.

### Offline Port and Link geometry

[Port/Link compilation](../src/course/course-links.ts) resolves a Port to a canonical Section,
Carriageway and anchor strictly inside its finite domain. The Port pose is derived from the active
Carriageway's outer-edge center and forward Guide heading. It requires positive pavement width;
there is no separately authored center or orientation. A Link connects an exit to an entry and owns
the [upright transform](architecture.md#frame-transform-and-coordinates) between these poses.
Equal frames produce identity; loops use the same derivation without requiring coincident endpoints.

`superoutride.carriageway-link` v1 pins that frame rule, tolerances and proof. Both guards must lie in
authored straights, outside Guide fillets, with Raster headings agreeing to 1e-10 radians. Partition
the common seam-relative interval at both charts' Raster/Guide boundaries, referenced Boundary knots
and Band activations. Retain the original station in each ruler: subtracting then adding the seam
offset must not destroy an exact activation endpoint. Distinct stations collapsing to one relative
coordinate receive a diagnostic. Guard extents must remain representable on both sides of each seam.

Each cell requires positive contiguous Carriageway coverage and continuous outer edges. Internal
pavement subdivisions may differ. For both Raster and Guide independently, transform the source edges
and compare them with destination edges. The quadratic difference's Bernstein control hull must lie
within 1e-7 m throughout each cell. Seam-center matching or a fixed set of probes is insufficient;
an interior knot, short coverage gap or mismatched Raster miter cannot escape the partition/proof.

This product certifies only the selected Carriageway's pavement geometry. It does not certify other
roads, shoulders, medians, physical bindings, height, images, material phase or scenery, nor sufficient
consumer/transfer guards. A compiled Link is **not admission for a driving transition**. Complete
common-content overlap, parent-specific visibility, consumer/content qualification and atomic runtime commit remain required
before cutover. The bounded geometry view below provides occurrence/history foundations only. Existing same-world stage continuation and
runtime readers remain unchanged.

### Offline topology

`entrySectionId` resolves to the graph's explicit entry; it is not a starting grid or race gate.
A Section has at most one entry Port, shared by incoming merge Links. Each declared exit has exactly
one outgoing Link. Exit anchors follow the entry anchor with positive chainage span when an entry
is present. Fork exits use distinct Carriageways. Leaf Sections have no exit Ports.

- LINEAR is a reachable finite chain with at most one incoming/outgoing Link per Section.
- BRANCH is a reachable finite acyclic graph, allowing two/three outgoing Links and shared successors.
- CIRCUIT is one reusable Section with one exit-to-entry loop Link and positive source span.

LINEAR/BRANCH entry has no incoming Link; every declared Section must be reachable. Cycle rejection
belongs to those authored types, not to the graph representation. CIRCUIT keeps one source and one
cyclic Link, never lap copies. Existing per-Section simple-strip geometry admission still applies;
this increment does not classify intentional geographic strip intersections.

### Bounded geometry views and occurrence history

[Geometry traversal](../src/runtime/course-occurrence.ts) is a live **offline exploration adapter** over
canonical Section/Link references. Each immutable occurrence has a traversal ordinal, reusable Section
and actual incoming Link. Its owner retains an ordered history and an active occurrence; none is stored
inside CompiledCourse. Ordinals establish local instance identity, not checkpoint or lap credit.
Forward exploration requires an explicit canonical outgoing Link. Reverse uses the inverse of the
visited Link and the retained predecessor, including at a merge. Re-entry reuses the same occurrence;
an already visited successor cannot silently be replaced. Failed operations preserve state.

`retainBehind` declares the reverse-history distance in metres from the latest entered port. Retain
whole intersecting occurrences, measured along visited seam spans, and discard older references after
forward traversal. Initial history can be shorter than the request; a view must still prove coverage.
Reverse beyond retention fails instead of guessing a predecessor or another lap. Occurrences share the
same Section readers/assets and never allocate geometry or image copies for a scored lap count.
Snapshots own frozen arrays; callers retaining old snapshots also retain that historical metadata.
This geometry adapter does not authorize an actor transition or implement route locks/recovery.

[Geometry views](../src/runtime/course-geometry-view.ts) map a retained, explicitly followed itinerary
into the active occurrence's coordinate basis. Compose the existing Link transforms locally; no global
unwrapped world coordinates accumulate. Each span owns one source-to-view address mapping: paired
chainage anchors, a derived lateral origin and an upright rigid transform. Lateral anchors are derived
from canonical Carriageway boundaries, never reconstructed by projecting rounded world positions.
The source Section, traversal occurrence and chosen frame remain separate identities even for a loop.

The view uses finite chainage `[0,length]`. At a visited seam the successor owns the point, including
when the seam is the view endpoint. Band queries delegate to the canonical half-open partition through
the same address mapping as Raster/Guide point readers. Lateral membership compares the view point
with source boundaries shifted by that mapping, preserving exact half-open ownership without a lossy
inverse boundary round trip. The zero-origin partition query retains its existing behavior. Preserve exact source Boundary/activation
stations across ruler offset cancellation; reject distinct classification stations that collapse in
the view ruler. Positive visited seam spans must also remain representable; a tiny occurrence cannot
silently disappear between larger neighbors. Continuous Core geometry retains its existing sampling tolerance. Source readers,
Boundary references, local Guide envelopes and assets are shared, not retessellated. The `geometry`
facet exposes ordinary point readers and Guide bounds without graph/occurrence metadata; it is not yet
an adapter to the existing driving GuidePath, projection, terrain or physical-contact interfaces.

Every request explicitly supplies camera/render, contact, driver-lookahead and reverse/recovery
behind/ahead extents, plus a closed active-source pose interval and maximum fixed-step advance. For
each consumer require `[minS-behind, maxS+maxAdvance+ahead]` inside retained/selected geometry. Failure
identifies the consumer, pose, advance and required/available intervals in structured diagnostics.
No fixed guard is inferred. Without a followed successor, coverage ends at the earliest exit seam;
no exit or parent runout is selected implicitly. A retained first occurrence with an incoming Link
starts at its entry seam, rather than inventing discarded predecessor coverage. View queries outside
the admitted interval fail explicitly. Malformed API values use TypeError/RangeError as in AGENTS.

The result is labelled `geometry-only`. These are declared interval checks, not measured product
consumer envelopes, complete common-content overlap, pre-lock visibility or transition qualification.
Only the selected Carriageway has the Link's existing geometric agreement proof. Other Bands can
still differ across a seam unless separately qualified. Height and physical bindings now have admitted
Section facets and a separate overlap proof above, but are not yet mapped through these views. Images/phase,
scenery/background and product camera state have no admitted CourseDocument fields/readers; none is
filled with a default or reported as certified. Their admission and separate physical/presentation proofs,
including every merge incoming Link and parent-specific exit visibility, precede runtime cutover.
The current game roots, materialized circuit windows, contacts, locks, scoring and recovery are unchanged.

### Publication, identity and diagnostics

Compilation builds private scoped Maps, resolves references once and publishes one frozen
`CompiledCourse`. Sections own canonical primitives, Boundaries, a finite `bandPartition`, Carriageways
and asset references. The partition owns the Band array; Band edges point to those Boundaries,
Carriageways to those same Bands, and fraction anchors
to those primitives. The Guide points to the Section's same Raster. Sections also own canonical Ports
and incoming/outgoing Link references. Each Port points back to its Section and Carriageway; each Link
points to its canonical source/destination Ports. Merges share the same successor Section and entry
Port. The course's `entry` and `links` reference those same objects. Construction closes all cycles and
freezes every owned record/array before publication; Maps and mutable drafts remain private. This is
one reference graph, not a RouteDag, recursive successor tree or JSON-serializable compiled object.

`sourceSha256` hashes normalized saved input. `buildSha256` hashes `{sourceSha256, compiler,
geometryRecipe}`, including the full pinned recipe descriptor. The compiler identity is
`superoutride.course-compiler` version 5, including the full Link recipe and physical recipe v1 descriptors.
The physical recipe includes the existing material definitions and height/ownership/overlap rules.
The Section geometry recipe remains v3 and carriageway-Link recipe v1: physical admission does not
change their geometry arithmetic. Height/material edits invalidate source and build identity.
All inputs currently conservatively invalidate the complete
product. Rebuilds on the supported execution contract reproduce values and identities, but allocate
distinct graph objects. Changes to compiler/recipe semantics require a version revision; unsupported
recipes never silently migrate. Existing numerical-environment limits in Development apply.

Public authoring operations return `{ok: true, value}` or `{ok: false, diagnostics}`. A diagnostic has
`code`, a JSON Pointer `path` into the submitted input, and a causal `message`. The initial reader
reports the first failure deterministically. Codes are `parse_failure`, `invalid_shape`,
`unsupported_version`, `duplicate_id`, `unresolved_reference`, `invalid_numeric_domain`,
`resource_limit`, `unsupported_feature`, `semantic_compile_failure`, and session `stale_source`.
Compiler adapters translate known geometry RangeErrors only; unexpected platform and invariant
exceptions propagate. Failure returns no partial product.

`createCourseProject` owns live source/publication state. `editDocument` installs an admitted immutable
draft and clears current compiled output on a changed normalized input; a no-op retains it. `save`
does not require semantic success. To reopen an unfinished draft, parse it and explicitly edit with
the admitted value. `importDocument` instead parses and compiles off to the side, installing source
and product together only on success. A failed import or build retains the current source and prior
successful product; that retained product is historical comparison data after an edit and cannot be
returned by `exportCompiled`. Generation checks discard builds/imports superseded by newer operations.

Core, physics and renderer receive their ordinary readers/data. They do not import the course graph;
current composition roots remain unchanged. Runtime Link/view, image, session and GUI integration
are separate acceptance gates.

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
