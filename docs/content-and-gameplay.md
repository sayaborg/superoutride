# Content and gameplay

This document owns saved course data, authoring semantics and game rules.
[Architecture](architecture.md) owns coordinates and geometry; [Image assets](image-assets.md)
owns image formats and compilation; [Browser](browser.md) owns operation and URL settings.

## Course vocabulary

A Section is a reusable finite road/content chart. A Boundary is a longitudinal lateral-edge profile;
a Region is a structural partition between two Boundaries with an active interval and role. A Carriageway
is the road between two Section-local Boundaries. A Link connects one Carriageway at a Section end to another Section start.
A RouteOccurrence is a selected Section visit in the shared Route, with its incoming Link and fixed
route coordinates. CompiledCourse is the immutable reference graph. Every actor uses the same Route.

A Band is a colored visual strip with its own edges and active interval. Bands are ordered and may
overlap or erase earlier colors; they do not refer to physical Regions. Regions remain nonoverlapping
structural partitions with material bindings. One concept has one name in both source and compiled data.

Checkpoints, starts, finishes and environment changes are independent of Section boundaries.
Source identity, traversal identity and race credit are distinct.

## CourseDocument v18

The saved format is compact UTF-8 JSON. All declared fields are required; explicit null represents
absent optional content. Unknown fields fail. Arrays preserve saved order; object-property order and
whitespace do not affect identity. Normalized records use schema field order and convert negative zero to zero.

```text
CourseDocument {
  format: "superoutride.course", version: 18,
  reference, id, units: {length: "m", angle: "deg"},
  geometryRecipe: {id, version},
  type: "LINEAR" | "BRANCH" | "CIRCUIT", entrySectionId,
  sections, links, assets, sceneryInstances, rules
}
Section {
  id, pis,
  boundaries, regions, height: [{at, y, curveLength}],
  physicalBindings: [{regionId, sections: [{at, material}]}],
  carriageways, assetIds, presentation, fork
}
```

### Geometry and reference records

| Record           | Fields                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Plan PI          | `id`, `x`, `z`, `radius`                                                                               |
| Position         | `at: {pi, offset}`; interval `start`/`end` and fork `lock`/`closure` use the same `{pi, offset}` value |
| Boundary         | `id`, `knots: [{at,lateral}]`                                                                          |
| Region           | `id`, `start`, `end`, `leftBoundaryId`, `rightBoundaryId`, `role`                                      |
| Carriageway      | `id`, `left`, `right`                                                                                  |
| Link             | `id`, `from: {sectionId,carriagewayId}`, `to: {sectionId}`                                             |
| Asset reference  | `id`, `format`, `version`, lowercase `sha256`                                                          |
| Scenery instance | `id`, `assetId`, `paletteRgb555` (null or one declared base-palette replacement)                       |

Region roles are `pavement`, `shoulder` or `median`. Asset formats are
`superoutride.sprite-lod` version 2 and `superoutride.tile-background` version 1.

`reference` is null or:

```text
{
  source: {kind: "video" | "analyzed-data", location, edition},
  observations: {location, sha256},
  calibration: {distanceScale, curvatureScale, heightScale},
  remasterDeviations: string[]
}
```

Distance scale is positive; curvature/height scales are nonnegative; each is at most 100.
Locations describe provenance. The observation digest identifies exact intermediate-file bytes.
These values participate in source identity; compilation consumes the saved geometry directly.

IDs are opaque nonblank strings without surrounding whitespace and compare exactly. Course ID is
external identity. Section, Link, asset and scenery-instance IDs each have a document-wide scope.
PI, Boundary, Region and Carriageway IDs each have their own Section-local scope;
scenery placement and row IDs also have their declared Section-local scopes. Duplicate IDs fail. References
resolve in their named scopes rather than by array position.

Schema-valid drafts may contain empty arrays, unresolved references or an unavailable geometry recipe.
Compilation requires complete semantic input and reports `unsupported_version` for an unavailable recipe.
A geometry draft uses `presentation: null`, `fork: null`, `rules: null` and explicit asset/instance arrays.

### Lateral positions

`Lateral` is a finite number in metres (positive right), or `{boundary, offset}` with a
Section-local Boundary ID and a signed metre offset (positive right). The field is named
`lateral` on Boundary knots, scenery placements, scenery rows and grid slots; grid references
use the entry Section. Numeric values and offsets lie in `[-1000,1000]`, and every resolved
l must also lie in that range. Band, Region and physical-binding formats are unchanged.

A point placement evaluates a numeric Lateral directly, or the referenced Boundary at its s
plus offset. The Boundary must cover that station, including each expanded row instance.
Unused row endpoints need no Boundary coverage. References may name any Boundary in the same
Section, including one not used by a Region; declaration order does not constrain references.

Boundary references must be acyclic. For each interval `[a,b]` between the Boundary's own
resolved knot stations, compilation takes both endpoints and every interior breakpoint from
either endpoint's referenced Boundary, including inherited breakpoints. Each endpoint defines
an expression: a numeric Lateral is constant; a reference reads its Boundary at the evaluation
station and adds its offset. Both references must cover the entire closed interval `[a,b]`.
At each collected station s, evaluate the two expressions as A(s) and B(s), then store
`A(s) + (B(s)-A(s)) * (s-a)/(b-a)` (using the endpoint expression directly at a or b).
The published Boundary linearly interpolates these stored points; it does not continuously
blend the two expressions between them. When both endpoint expressions refer to the same
Boundary with the same offset, the result follows its shape exactly.

Document reading owns field shapes, finite numeric bounds and IDs. Compilation owns reference
existence, cycles, interval coverage, resolved-value bounds and expansion limits. Unknown
Boundaries report `unresolved_reference`; cycles and insufficient coverage report
`invalid_boundary`; resolved numeric bounds report `invalid_numeric_domain`, and expansion
beyond the Section point budget reports `resource_limit`. Compiled Boundary points retain
`{at: {s}, l}`; scenery and grid also retain their resolved numeric l. Runtime readers do not
resolve authored references.

### Saved presentation

`presentation` is null or `{ground,environments,scenery,sceneryRows}`. Ground is always a Band field.
The other presentation records are:

| Record            | Fields                                                                         |
| ----------------- | ------------------------------------------------------------------------------ |
| Background        | `assetId`, `horizonY`, Section-frame degree `yawOrigin`                        |
| Scenery placement | `id`, `instanceId`, `unselectedCarriagewayId`, `at`, `lateral`, `groundOffset` |
| Scenery row       | `id`, `assetId`, `start`, `end`, `spacing`, `lateral`, `groundOffset`          |

Environment profiles begin at zero. Assets belong to the referencing Section and resolve to canonical
sprite/background descriptors. Each environment is `{at,name,background}`; environment changes
affect BG and labels, independently of ground colors.

#### Band ground

The canonical colored ground is `{kind:"bands",bands:[elements...]}`. Array order is Painter order:
a later covering Band replaces the earlier color, including when its own color is transparent.
Uncovered ground is transparent. All Band s/l coordinates are Section-local metres, independent of
Boundaries, Region roles and physical materials.

| Element  | Fields and meaning                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| `band`   | `color`, `knots:[{s,left,right}]`; affine edges between consecutive knots                                        |
| `repeat` | positive `every`, integer `count`, `elements`; expand in copy order, shifting each copy by `index*every` along s |
| `arrow`  | `s`, `l`, positive `width`, `length`, `direction`, opaque `color`; normalized forward/left/right arrow           |
| `text`   | `s`, `l`, `text`, positive `height`, opaque `color`; built-in 5-by-7 cell lettering                              |
| `curb`   | `start`, `end`, `left`, `right`, positive `stripe`, two opaque `colors`; alternating rectangular runs            |

Band `color` is RGB555 integer 0 through 32767 or null for transparency. Zero is opaque black.
Null `left` means an open negative side; null `right` an open positive side. Open flags stay consistent
through a Band's knots. Finite edges obey `left <= right`; zero-width taper endpoints are allowed.
There are 2 through 256 strictly increasing knots, inside `[0,Section.length]`. The active interval
runs from the first to the last knot. Interior ownership is half-open; the final endpoint is sampled
from its adjacent slab. An empty list describes a transparent plane, and an all-open Band fills it.
Cliffs and bridge exteriors are ordinary transparent Bands, including sloping or open edges.

An arrow's s is its near bounding edge and l its lateral center. Width and length are its final
lateral/longitudinal bounding dimensions. Direction is `forward`, `left` or `right`; its polygon is
split into affine Band pieces. Text s/l denotes the near/left edge of its bounding cells. Height
covers seven cells, horizontal advance is six cells per character and supported text is uppercase
A–Z, digits 0–9 and spaces, from 1 through 64 characters. Foreground row runs become rectangular Bands.
A curb alternates its two colors from start; the last stripe clips to end. Nested repetitions preserve
declaration order and count includes the original placement. All resulting intervals must fit the Section.

Each element array admits 4096 records, repeat count is 1 through 4096 and nesting is at most eight.
Expansion visits at most 65536 constructs and publishes at most 65536 affine pieces. Compilation
rejects more than 64 simultaneously active expanded Bands, including covered ones. Resolved slab and
cached dyadic-cell counts each admit 1048576 per Section; unique profile coefficient storage is at
most 64 MiB per Section. Limits reject rather than truncate authored content. Source constructs are
saved; their expanded lists, resolved slabs and preblended profiles are compiler products only.
[Architecture](architecture.md#band-rendering) owns the averaging, immutable storage and pixel kernels.

Ground colors and constructs reference neither assets nor Regions. Scenery and BG retain their
shared image formats.

Scenery placements resolve document-wide instances. `unselectedCarriagewayId` is null for ordinary
scenery or names a canonical exit Carriageway. Such signs lie from lock through closure, before the
exit cut, and appear when the field selects another exit. Their state follows the selected Links of the shared Route.

Rows use a half-open interval with placements at `start+index*spacing`. Each instance resolves its
`lateral` at that station; a numeric value places the entire row at constant l. Expanded
Section/row/index identities are deterministic. The total expanded Section placement count is at most 4096.
Each scenery and document instance collection admits 4096 records; profiles admit 256 nodes.
Unsupported presentation fields produce diagnostics.

### Authored Session rules

`rules` is null or `{grid,checkpoints,finishes,maxLaps,classic}`. Grid slots are ordered `{at,lateral}`
records in the entry Section: player first, then rivals in roster order, at most 17. Each is supported,
at/after entry and before the first required landmark. Starting velocity is zero.

Checkpoints and finishes contain `{id,sectionId,carriagewayId,at}` with unique IDs across both
collections. Their saved Carriageway references resolve to supported pavement; runtime crossing width
is the coordinate domain at the landmark. They lie after entry and no later than the
ownership exit; checkpoints are strictly ordered within a Section. Each terminal Section has one
FINISH; continuations have none. Circuit FINISH coincides with its loop exit.

`maxLaps` is an integer from 1 through 99; non-circuits use 1. CLASSIC contains `vehicleId`,
`rivalCount` (0 through 16), `lapCount` and positive finite `timeMargin` at most 10. Grid, roster and
lap values must agree. The composition root resolves vehicle IDs against the catalog.

### Numeric and resource domains

All numbers are finite. Each PI coordinate is within +/-1000000 m; radius is in `[0,100000]` m.
Endpoint radii are zero. Interior radii are positive and the deflection magnitude is strictly between
0 and 180 degrees. Consecutive PIs have distinct coordinates. The sum of neighboring arc tangent
lengths must not exceed their shared edge length; equality admits touching arcs with no intervening line.
Compilation absorbs up to the plan-position roundoff budget at touching tangents, as specified in
[Architecture](architecture.md#plan-authority).

A position's `pi` resolves in its Section. Its station is the arc midpoint for an interior PI,
and the point itself for a zero-radius endpoint. `offset` is signed chainage in metres within
`[-100000,100000]`; the resolved station must be in `[0,Section.length]`.
All height PVIs, Boundary knots, Region endpoints, physical bindings, environments, scenery row
endpoints, scenery placements, fork lock/closure, grid slots, checkpoints and finishes use these
positions. Band element stations retain their numeric metre fields. Compiled positions contain only `s`.
Numeric Lateral values, signed Lateral offsets and resolved l are within +/-1000 m;
heights within +/-10000 m. Recipe versions are integers from 1 through 65535. Resolved values must also fit their finite Section
and produce positive representable intervals.

`COURSE_DOCUMENT_LIMITS` defines 4 MiB UTF-8 JSON, 128 UTF-16 code units per ID, 16 Sections,
48 Links and 256 assets. Each Section admits 2048 PIs, 32 Boundaries, 256 knots per
Boundary, 32 Regions, 16 Carriageways, 256 asset references, 256 height nodes, 32 physical
bindings and 256 material changes per binding. Compiled Section limits are
16384 mapped-region cells, 16384 resolved Boundary points in total per Section and 100000 m chainage.
The Boundary point limit includes inherited breakpoints, rejects rather than truncates expansion,
and is separate from the authored 256-knot limit and mapped-region cell budget.

## Geometry recipe and bindings

The saved `geometryRecipe` field is `{id,version}`; CourseDocument v18 admits
`superoutride.plan-raster` version 1. The saved PI and position fields are listed above. [Architecture](architecture.md#plan-authority)
owns their authoritative planar interpretation, coordinate domain and geometric validation.
Rendering and physics read the same plan; Section length comes from its coordinate Reader domain.
An overpass is authored as separate Sections for its passages; the coordinate-domain condition
is specified in [Architecture](architecture.md#plan-authority).
The recipe identity participates in every dependent build identity.

Boundary knots are strictly increasing and cover every referencing Region's closed interval.
After Lateral resolution, interpolation between the compiled points is linear; width and center are derived. A Region has positive length and positive
interior width; zero width is permitted at its own start/end only. Regions are nonoverlapping and
shared edges reference one Boundary. Regions do not refer to or belong to Carriageways.

A Carriageway is `{id, left, right}`; both edge IDs resolve to Boundaries in its Section.
Its existence interval is the intersection of those Boundary domains, with no separate range field.
The intersection must have positive length. Membership is `[start,end)`, including the end only
when it is the Section terminal. Boundary values themselves remain readable at both endpoints.
Thus a road ending at a split is replaced at that station by the roads beginning there.
The left edge never exceeds the right edge; zero width is allowed only at isolated stations.
At any station, distinct existing Carriageways cannot overlap over a positive lateral interval.
Compilation proves these conditions over affine Boundary cells and at activation changes;
violations report `invalid_carriageway`, and unknown edge IDs report `unresolved_reference`.

Until Regions are replaced by Strips, compilation also requires the union of existing Carriageway
interiors to equal the union of pavement Region interiors at every station. This temporary check
reports `invalid_carriageway` and will be removed with Regions in 7-3b. It creates no membership
relationship. Cut lines, landmarks, fork exits, driving targets and recovery read Carriageway
Boundaries directly. Landmark support is checked across the entire interval between those edges
using the material surface, independently of Region roles.

Every open Section cell has active Region coverage. Across an activation change, both the complete
Region union and the pavement/median union are continuous. Positive-width replacements and zero-width
birth/death endpoints use the same rule. Roles name structure; appearance and physical bindings supply values.
[Architecture](architecture.md#boundary-geometry-and-point-ownership) owns mapped geometry and point ownership.

`courseBoundaryAt` samples the canonical edge. `courseRegionAt` reads the Section's canonical
`regionPartition` and returns the owning Region or null outside/in gaps. Longitudinal membership is
`[start,end)`, with the terminal included when the Region ends at Section length. At a switch,
starting/continuing Regions own the point. Invalid or nonfinite queries fail with RangeError.

Profile Knots resolve on the same ruler, increase strictly and include exactly zero and L.
`curveLength` is nonnegative in metres; endpoint lengths are zero and adjacent curves do not overlap.
[Architecture](architecture.md#height-and-projection) defines the analytic profile and the polyline used only for ground-row generation.

Every Region has one explicit piecewise-constant physical binding beginning at its activation;
subsequent changes precede its end. Materials are ASPHALT, SHOULDER, GRASS, DIRT, SAND or VOID.
Missing, duplicate, unknown or uncovered bindings fail. Outside/gaps are VOID. Supported bounds
include active supported endpoints and interior Boundary knots. Ground appearance remains independent.

## Cut lines, Links and topology

Each Section is normalized to start at plan pose `(0,0,0)` during compilation and owns its full `[0,L]` ruler. Its entry is the cut
at `s=0`; its outgoing cut is `(s=L, Carriageway)`. The course entry and every Link destination
have exactly one positive-width Carriageway at `s=0`. Every outgoing Link names a positive-width
Carriageway at `s=L`; outgoing Links from one Section use distinct Carriageways. Violations produce
structured compilation diagnostics.

`from` identifies the outgoing Section and Carriageway; `to` identifies the destination Section.
The rigid yaw/translation maps the outgoing Carriageway center and heading at `L` to the unique
incoming center and heading at zero. Each Link independently checks that transformed left and right
edges match within 1e-7 m, heights within 1e-8 m and profile grades within 1e-10.
These bounds cover double-precision evaluation of boundaries, plan coordinates and rigid rotation
at the admitted 1,000,000 m coordinate limit; they are not a visual or driving allowance.
Other Region boundaries, materials, Bands and appearance may change at the cut.

The graph has an explicit entry. All Sections are reachable. LINEAR is a finite chain with at most
one incoming/outgoing Link per Section. BRANCH is a finite acyclic graph with two/three-way forks
and merges. Their entry has no incoming Link. CIRCUIT is one Section with an end-to-start loop;
its endpoint poses may differ in native coordinates.

## Compiled identity and project publication

CompiledCourse contains canonical Section, plan segment, Boundary, Region, Carriageway, Link,
asset and landmark references. Merges reuse the same successor; loops refer to the same source.
Owned records and arrays are immutable, including nested image data. Live actor, route-lock and
clock state belong to Sessions. Object identity is local to a compilation; cross-build identity uses digests.

`sourceSha256` hashes normalized input. `buildSha256` hashes `{sourceSha256,compiler,geometryRecipe}`.
The compiler is `superoutride.course-compiler` version 25, incorporating Link recipe v2, physical
recipe v2, image-source recipe v2 and presentation recipe v7. Descriptors include semantic versions
and operative numeric/data parameters, including material definitions. Source or compiler/recipe
changes invalidate dependent products.

Image inputs are explicit saved bytes addressed by each declared SHA-256. Shared digests resolve to
one immutable source. [Image assets](image-assets.md#course-image-sources) owns image limits and diagnostics.
Draft saving is independent of image-byte availability.

Document operations return `{ok:true,value}` or `{ok:false,diagnostics}`. Input diagnostics contain
`kind:"input"`, `code`, JSON Pointer `path` and causal `message`. Clients use code/path. Malformed
schema reports a deterministic first error; independent semantic failures follow declaration order.
Expected failures include shape, version, reference, resource, geometry, coverage, material, topology
and presentation errors. Failed compilation publishes no partial product.

`tools/course/course-project.ts` owns live source/publication state through `createCourseProject`,
and text parsing/saving through the shared product document reader. `editDocument` installs a schema-valid
immutable draft; a changed normalized value makes the prior product stale, while an equal value
keeps it current. `save` accepts semantic drafts. `importDocument` installs parsed source and compiled
product together on success. Failed imports/builds preserve source and prior successful output.
Stale output is comparison data and cannot be exported as the edited course.

`compile(assetSources)` and `importDocument(text,assetSources)` use explicit image inputs.
A superseded operation cannot publish over a newer source. `no_source` and `stale_source` are project
outcomes. API shape/domain errors follow [AGENTS](../AGENTS.md); unexpected internal faults remain visible.

## Shared route occurrences

All vehicles use one selected sequence of RouteOccurrences, including repeated circuit laps. Route
stations start at the entry Section's beginning and never rebase at seams. An occurrence's identity
and incoming Link distinguish repeated visits and retain the selected predecessor through merges.
[Architecture](architecture.md#coordinates-and-readers) owns transforms, reader composition and
extension/retention distances. Geometry/content indexes and race cross-section lists rebuild when
the shared sequence changes. All actors retain their route coordinates at a seam.

A driving scene requires compiled Session rules with a starting grid and checks its rearmost grid
station against `D_cam`. Driving beyond the entry uses the same coordinate-domain recovery rule
as any other domain exit. Recovery preserves
accepted cross sections and laps and suppresses crossing credit for that step.

## Fork lock and handoff

Section `fork` is null or `{lock,closure}` positions. Controls require two or three exits and
`entry < lock < closure < every exit seam`, with positive lock chainage. The parallel-zone subset
is contained in straight parts of the plan. Through closure, edges are constant, roads have positive
width, and explicit physical bindings support the roads, separating medians and connecting space.
Invalid controls produce `invalid_fork`.

Exit Carriageways are ordered by their actual lock-line edges. Median centers divide supported
space into regions; outer supported shoulders belong to the outer exits. The shared half-open
[lateral rule](architecture.md#boundary-geometry-and-local-windows) assigns exact ties to the right.
A crossing outside the coordinate domain or outside every fork region selects no route.

The player and rivals are eligible. Lock lines use the same route-s crossing function as race lines.
The first forward crossing in a fixed step wins, using the s-derived fraction u and then stable actor
ID for an exact tie. Interpolated route l, shifted by the occurrence's lateral origin, selects the
fork region. The winner appends one successor to the shared Route. Each occurrence locks once;
checkpoint credit remains per actor.

Rivals immediately follow the selected Carriageway center. Unselected roads show saved state-selected
signs. At/beyond closure, an actor is on a closed Carriageway when that exit exists at its s and
its l lies between the two edges (including the edges). It recovers at the same chainage onto the selected
road; progress observations resynchronize. Geometry stays static.

Before lock, the parent covers all required queries through fixed-step advance:
`requiredEnd <= parentEnd`. After lock the selected Link extends the Route.
At every exit, the parent owns its whole `[0,L]` interval. The successor starts at the cut;
reverse travel stays on the selected predecessor in the same route coordinates.

## Route cross sections and progress

`createRouteCrossSections` produces ordered race and fork-lock lines from the retained Route. Each
occurrence places its Section checkpoints and FINISH at route s; a circuit repeats those lines for
each lap. The lists change only on route extension or pruning. The configured final lap's FINISH,
or the terminal Section's FINISH on a non-circuit, completes the race.

`routeCrossingFraction` accepts a forward arrival when `previous.s < line.s <= current.s` and the
interpolated l is inside the closed coordinate domain at the line. Its fraction is
`u = (line.s - previous.s) / (current.s - previous.s)`. Departure from a line does not repeat an
arrival. Reverse travel and recovery steps grant no crossing credit. Carriageway width and material
support do not limit a race line's width.

`createRouteProgress` is the single implementation for all course kinds. Each actor retains its next
required line, accepted finish count, status and route s. It consumes consecutive lines in order,
including several crossings in one step. A missed line remains required even after route pruning;
recovery does not skip it. Accepted lines cannot be earned twice by backing up and driving forward.
At the terminal FINISH, the actor's distance and exact finish time are fixed. Before finishing,
distance follows route s, including backward movement, without checkpoint-based clipping.

Finished actors rank first by finish time. Unfinished actors rank by descending route s, which includes
lap separation. Equal finish times or equal unfinished stations share a rank. Rival positions and
audio observations already use the same route coordinates as the player.

## Session and reference timing

### Resolved Session

CLASSIC resolves the saved vehicle, rivals, laps and checkpoint clock. CUSTOM resolves a catalog
vehicle, zero to sixteen rivals, permitted laps and clock on/off. Player and rivals share the resolved
vehicle calibration and protection settings. Unsupported course/vehicle/grid/lap combinations fail before activation.
A Session binds immutable course, vehicle, roster, grid, lap target, envelope and timing references.
Before activation, every FINISH in a Section with no outgoing Link must have at least
`maximumSpeed² / (2*a)` metres remaining to that Section's end. Here `a` is the minimum measured
envelope braking multiplied by the Session driver utilization (0.75). All current competitors share
the admitted configuration and envelope, so this one requirement covers the complete field, including
a solo player. Admission rejects insufficient runout with a RangeError naming the FINISH, vehicle,
available metres and required metres; the browser shows this through its loading failure state.
A circuit FINISH and an undecided fork are not terminal stopping points.

START begins a standing run. PAUSE/hidden-page time consumes no simulation time. GOAL or GAME OVER
stops the field and preserves final rank and precise event time. NEW SESSION returns to setup.
Recovery consumes simulation time and grants no crossing credit. Results are session-local.

### Reference times and clock

`tools/course` owns reference generation, its policy and report-to-budget admission. The product
reads completed envelopes and time budgets and owns live Session driving policy.
Build-generated continuous reference runs use product physics, the configured start and finite routes/laps,
with the reference driver alone. Each successful run supplies ordered crossing times, including within-step
fractions. Recovery, wrong-route choice, timeout or incomplete FINISH invalidates a timing product.
Maximum-lap runs supply their actual prefixes; starting and later-lap arrival classes remain distinct.

Identity includes course/compiler, vehicle/calibration/protection, driver policy, fixed step, start
and seed inputs. For a budget state, reference duration is the maximum upcoming interval among
continuous histories sharing that state and its legal next checkpoint/finish alternatives.

```text
budgetMs(state) = ceil(1000*timeMargin(course)*referenceSeconds(state))
```

The margin and duration are positive finite values. START receives the initial budget. Each newly
earned non-finish checkpoint adds the next budget once, carrying unused time without a cap. FINISH
adds none. Precise event times determine ordering; awarded budgets alone round to integer milliseconds.
All consecutive gates crossed in one step retain their crossing fractions. Earlier expiry ends the
run; a valid checkpoint or FINISH wins an exact expiry tie. Rejected late crossings earn no line or lap credit.

### Vehicle envelopes and drivers

Generated envelopes contain maximum speed and speed-indexed acceleration, braking and lateral-response
observations for each vehicle configuration. The driver consumes an envelope, utilization, speed cap
and lane; it reads a contiguous 5 m lattice up to 480 m ahead and publishes canonical steering,
throttle and brake. [Calibration](calibration.md) lists utilization values.

The driver always treats the end of a Section with no outgoing Link as a zero-speed planning point.
The Route exposes that terminal station only when its retained tail is such a Section; loaded tails
with outgoing Links, including undecided forks and circuit continuations, do not request a stop.
The speed plan is bounded by `sqrt(2*a*d)`, with d reduced by the driver's response distance and a
2 m terminal clearance for the front footprint. The driver holds the brake when its target speed is
zero, using ordinary vehicle physics. It does not inspect finish status or introduce a finished-driving
state. Thus a finished LINEAR/BRANCH rival decelerates and stops on the runout while the Session
continues; a finished CIRCUIT rival keeps driving. The existing player GOAL/GAME OVER still ends
the whole Session.

The same driver serves reference runs and live rivals. Generated runs contain precise landmark times
and optional 10 Hz position/speed/utilization traces. The browser loads generated envelopes and compact
integer-millisecond budgets. [Development](development.md#build-outputs) owns generated file locations.

## Recovery

Recovery observes support loss, falling, penetration, coordinate-domain exit and overturning. It reconstructs
pose, velocities, wheels, actuators, powertrain and observations at known supported coordinates while
preserving steering/tire calibration and earned gates, locks and laps.

Route recovery backs off from the farther of causal current chainage and last-safe chainage.
Wrong-route recovery uses the selected Carriageway at the observed station.
[Vehicle physics](vehicle-physics.md#coordinate-domain-recovery) owns domain timing and target placement.
Physics' typed suspension-travel exit requests this gameplay discontinuity. Known recovery coordinates use the shared route. Observers resynchronize once, suppress reset
crossing credit and update the player
camera before rendering. Unrelated internal faults propagate.

## Observation formats

### Course observations

`superoutride.course-observations` version 1 contains `id`,
`source: {kind:"video"|"analyzed-data",location,edition}`, calibration method/units and these arrays:

| Array                | Records                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `samples`            | `{s,timeSeconds,curvaturePerMeter,grade,roadWidthMeters,heightMeters}`    |
| `sceneryRows`        | `{kind,startS,endS,spacingMeters,side,offsetMeters,groundOffsetMeters}`   |
| `environments`       | `{s,label}`                                                               |
| `checkpoints`        | `{s,name}` observation markers                                            |
| `remasterDeviations` | Nonempty descriptions of departures/assumptions                           |
| `measurements`       | Raw frame provenance and numeric measurements, or empty for analyzed data |

Samples number 2 through 4096, are strictly ordered from zero to positive distance, and may have null
time/height. Environments begin at zero; checkpoints are ordered independently of game timing.

### Frame measurements

`superoutride.frame-measurement` version 1 contains `id`, `source`, `environmentLabel`,
`frames:[{path,timeSeconds}]` and `calibration`. Frame paths are relative to the request; each PNG is
at most 16 MiB and 4194304 pixels. Requests contain 2–4096 frames with increasing nonnegative times.

| Calibration record | Fields                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `camera`           | `focalLengthPixels`, `centerXPixels`, `heightMeters`, `horizonReferencePixels`                                        |
| `horizon`          | `columns`, `top`, `bottom`, RGB-array `palette`, `tolerance`                                                          |
| `road`             | At least three distinct `rows`, `left`, `right`, `maxGapPixels`, `minWidthPixels`, `palette`, `tolerance`             |
| `hud`              | `x`, `y`, `digitWidth`, `digitHeight`, `spacing`, `count`, `palette`, `tolerance`, `maxMismatchFraction`, `templates` |

HUD templates map all digits 0 through 9 to equal-sized binary-string rows. Matching uses maximum
per-channel RGB difference; ambiguous road runs or missing/tied HUD digits fail. Measurements use a
calibrated planar pinhole approximation, horizon-based grade and integrated HUD speed. Output records
frame SHA-256, centers/horizon, HUD mismatch and geometric residuals. Scenery and semantic landmarks are authored observations.

## Course loading

All selected-course inputs and generated vehicle/timing data are ready before ticks. The shared
compiler expands saved Band constructs and builds immutable fields for every reachable Section.
Aliases share canonical records and each reusable Section's field; repeated circuit occurrences
reuse the single source. Input or compilation failure publishes no partial reader or Session.

Replacement suspends input, audio and ticks, shows coherent loading/failure state and supports retry.
Stale arrivals cannot replace a newer selection. Resume uses a fresh clock and cleared input ownership.
Driving previews use the same compiler/readers, camera, renderer and mechanics as the browser.
