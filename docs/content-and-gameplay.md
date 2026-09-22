# Content and gameplay

This document owns saved course data, authoring semantics and game rules.
[Architecture](architecture.md) owns coordinates and geometry; [Image assets](image-assets.md)
owns image formats and compilation; [Browser](browser.md) owns operation and URL settings.

## Course vocabulary

A Section is a reusable finite road/content chart. A Boundary is a longitudinal lateral-edge profile;
a Region is a structural partition between two Boundaries with an active interval and role. A Carriageway
groups pavement Regions. A Port is an oriented connection anchor in a Section; a Link connects an exit
Port to an entry Port. An occurrence is a traversal of a Section with a particular incoming Link and
history. A view is a bounded reader over occurrence spans in one frame. CompiledCourse is the immutable
reference graph. An actor's frame commit changes its occurrence and coordinate basis after a physical seam crossing.

A Band is a colored visual strip with its own edges and active interval. Bands are ordered and may
overlap or erase earlier colors; they do not refer to physical Regions. Regions remain nonoverlapping
structural partitions with material bindings. One concept has one name in both source and compiled data.

Checkpoints, starts, finishes and environment changes are independent of Section boundaries.
Source identity, traversal identity and race credit are distinct.

## CourseDocument v12

The saved format is compact UTF-8 JSON. All declared fields are required; explicit null represents
absent optional content. Unknown fields fail. Arrays preserve saved order; object-property order and
whitespace do not affect identity. Normalized records use schema field order and convert negative zero to zero.

```text
CourseDocument {
  format: "superoutride.course", version: 12,
  reference, id, units: {length: "m", angle: "deg"},
  geometryRecipe: {id, version},
  type: "LINEAR" | "BRANCH" | "CIRCUIT", entrySectionId,
  sections, links, assets, sceneryInstances, rules
}
Section {
  id, start: {x, z, heading}, guide: {margin, mMin}, primitives,
  boundaries, regions, height: [{anchor, y}],
  physicalBindings: [{regionId, sections: [{anchor, material}]}],
  carriageways, ports, assetIds, presentation, fork
}
```

### Geometry and reference records

| Record           | Fields                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Straight         | `id`, `kind: "straight"`, `length`                                                               |
| Circular arc     | `id`, `kind: "arc"`, `radius`, signed degree `turn`                                              |
| Absolute anchor  | `kind: "absolute"`, `s`                                                                          |
| Primitive anchor | `kind: "primitive"`, `primitiveId`, `fraction`                                                   |
| Boundary         | `id`, `knots: [{anchor,l}]`                                                                      |
| Region           | `id`, `start`, `end`, `leftBoundaryId`, `rightBoundaryId`, `role`                                |
| Carriageway      | `id`, `regionIds`                                                                                |
| Port             | `id`, `kind: "entry" \| "exit"`, `anchor`, `carriagewayId`                                       |
| Link             | `id`, `source: {sectionId,portId}`, `destination: {sectionId,portId}`, `overlap: {behind,ahead}` |
| Asset reference  | `id`, `format`, `version`, lowercase `sha256`                                                    |
| Scenery instance | `id`, `assetId`, `paletteRgb555` (null or one declared base-palette replacement)                 |

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
Primitive, Boundary, Region, Carriageway and Port IDs each have their own Section-local scope;
scenery placement and row IDs also have their declared Section-local scopes. Duplicate IDs fail. References
resolve in their named scopes rather than by array position.

Schema-valid drafts may contain empty arrays, unresolved references or an unavailable geometry recipe.
Compilation requires complete semantic input and reports `unsupported_version` for an unavailable recipe.
A geometry draft uses `presentation: null`, `fork: null`, `rules: null` and explicit asset/instance arrays.

### Saved presentation

`presentation` is null or `{ground,environments,scenery,sceneryRows}`. Ground is always a Band field.
The other presentation records are:

| Record            | Fields                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Background        | `assetId`, `horizonY`, Section-frame degree `yawOrigin`                                    |
| Scenery placement | `id`, `instanceId`, `unselectedCarriagewayId`, `anchor`, `l`, `groundOffset`               |
| Scenery row       | `id`, `assetId`, `start`, `end`, `spacing`, `boundaryId`, `side`, `offset`, `groundOffset` |

Environment profiles begin at zero. Assets belong to the referencing Section and resolve to canonical
sprite/background descriptors. Each environment is `{anchor,name,background}`; environment changes
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
common exit guard, and appear when the field selects another exit. Their state follows occurrence history.

Rows use a half-open interval with placements at `start+index*spacing`. The side is left/right;
nonnegative offset follows the corresponding side of the referenced varying Boundary. Expanded
Section/row/index identities are deterministic. The total expanded Section placement count is at most 4096.
Each scenery and document instance collection admits 4096 records; profiles admit 256 nodes.
Unsupported presentation fields produce diagnostics.

### Authored Session rules

`rules` is null or `{grid,checkpoints,finishes,maxLaps,classic}`. Grid slots are ordered `{anchor,l}`
records in the entry Section: player first, then rivals in roster order, at most 17. Each is supported,
at/after entry and before the first required landmark. Starting velocity is zero.

Checkpoints and finishes contain `{id,sectionId,carriagewayId,anchor}` with unique IDs across both
collections. Their positive pavement width is supported. They lie after entry and no later than the
ownership exit; checkpoints are strictly ordered within a Section. Each terminal Section has one
FINISH; continuations have none. Circuit FINISH coincides with its loop exit.

`maxLaps` is an integer from 1 through 99; non-circuits use 1. CLASSIC contains `vehicleId`,
`rivalCount` (0 through 16), `lapCount` and positive finite `timeMargin` at most 10. Grid, roster and
lap values must agree. The composition root resolves vehicle IDs against the catalog.

### Numeric and resource domains

All numbers are finite. Length/radius and Link overlap extents are in `(0,100000]` m. Start X/Z are
within +/-1000000 m; start heading and nonzero arc turn are within +/-360 degrees. Absolute anchors
are in `[0,100000]` m and primitive fractions in `[0,1]`. Lateral values are within +/-1000 m;
heights within +/-10000 m. Guide margin is in `(0,1000]` m and `0 < mMin < 1`.
Recipe versions are integers from 1 through 65535. Resolved values must also fit their finite Section
and produce positive representable intervals.

`COURSE_DOCUMENT_LIMITS` defines 4 MiB UTF-8 JSON, 128 UTF-16 code units per ID, 16 Sections,
48 Links and 256 assets. Each Section admits 2048 plan primitives, 32 Boundaries, 256 knots per
Boundary, 32 Regions, 16 Carriageways, 4 Ports, 256 asset references, 256 height nodes, 32 physical
bindings and 256 material changes per binding. Compiled Section limits are 16384 Raster segments,
16384 mapped-region cells and 100000 m chainage. A Link admits 8192 overlap cells.

## Geometry recipe and bindings

The geometry recipe is `superoutride.raster-guide` version 4, using RasterTurtle version 1.
Straights emit `ceil(length/50)` equal steps; arcs emit `ceil(abs(turnDegrees)/5)` equal angular
steps in authored degrees, converted with `PI/180`. Arc radius provenance covers the initial and
emitted vertices; a following arc supplies the shared vertex's radius.

The document ruler is the sequential `Math.hypot` sum of emitted Raster vertex differences in
primitive order. Each primitive has a resolved interval. Fractions 0 and 1 use its exact endpoints;
interior fractions use `start+fraction*(end-start)`. Absolute anchors keep their numeric chainage.
The recipe identity participates in every dependent build identity.

Boundary knots are strictly increasing and cover every referencing Region's closed interval.
Interpolation is linear; width and center are derived. A Region has positive length and positive
interior width; zero width is permitted at its own start/end only. Regions are nonoverlapping and
shared edges reference one Boundary. Every pavement Region belongs to exactly one Carriageway, whose
active members form a contiguous group in each longitudinal cell.

Every open Section cell has active Region coverage. Across an activation change, both the complete
Region union and the pavement/median union are continuous. Positive-width replacements and zero-width
birth/death endpoints use the same rule. Roles name structure; appearance and physical bindings supply values.
[Architecture](architecture.md#boundary-geometry-and-local-windows) owns mapped geometry and point ownership.

`courseBoundaryAt` samples the canonical edge. `courseRegionAt` reads the Section's canonical
`regionPartition` and returns the owning Region or null outside/in gaps. Longitudinal membership is
`[start,end)`, with the terminal included when the Region ends at Section length. At a switch,
starting/continuing Regions own the point. Invalid or nonfinite queries fail with RangeError.

Height nodes resolve on the same ruler, are strictly increasing and include exactly zero and L.
They produce finite render and physical grades through Core HeightProfile.

Every Region has one explicit piecewise-constant physical binding beginning at its activation;
subsequent changes precede its end. Materials are ASPHALT, SHOULDER, GRASS, DIRT, SAND or VOID.
Missing, duplicate, unknown or uncovered bindings fail. Outside/gaps are VOID. Supported bounds
include active supported endpoints and interior Boundary knots. Ground appearance remains independent.

## Ports, Links and topology

A Port lies strictly inside its Section and references a positive-width Carriageway. Its pose uses
the outer-edge center and forward Guide heading. Each Link connects an exit to an entry using the
[Port-derived upright transform](architecture.md#course-frames).

Link recipe `superoutride.carriageway-link` version 1 requires positive overlap extents fitting both
charts, authored straight guards outside Guide fillets and Raster headings agreeing within 1e-10 radians.
Selected Carriageways have positive contiguous pavement coverage and matching transformed Raster and
Guide outer edges throughout the overlap, within 1e-7 m. Internal pavement subdivisions may differ.
Distinct source stations must remain representable in the common seam-relative ruler.

The graph has an explicit entry. Each Section has at most one entry Port shared by incoming merge
Links. Every exit has exactly one outgoing Link and follows entry with positive chainage span.
Fork exits use distinct Carriageways; terminal Sections have no exits. All Sections are reachable.

LINEAR is a finite chain with at most one incoming/outgoing Link per Section. BRANCH is a finite
acyclic graph with two/three-way forks and merges. Their entry has no incoming Link.
CIRCUIT is one Section with an exit-to-entry loop and a positive source lap span. The loop closes
topology through its transform; its endpoint world positions/headings may differ.

### Contact and presentation domains

`compileCoursePhysicalDomains` and `compileCoursePresentationDomains` bind the root's explicit
contact and fixed-step envelopes over canonical Links. A driving source requires both results.
Within the common guard, height, supported materials, Region edges, resolved Band colors, BG and shared
scenery agree. The current root supplies 30 m guards. Longer camera/render, driver and recovery reads
use source-owned occurrence spans. Domain mismatches identify the Link and affected consumer.

## Compiled identity and project publication

CompiledCourse contains canonical Section, primitive, Boundary, Region, Carriageway, Port, Link,
asset and landmark references. Merges reuse the same successor; loops refer to the same source.
Owned records and arrays are immutable, including nested image data. Live actor, route-lock and
clock state belong to Sessions. Object identity is local to a compilation; cross-build identity uses digests.

`sourceSha256` hashes normalized input. `buildSha256` hashes `{sourceSha256,compiler,geometryRecipe}`.
The compiler is `superoutride.course-compiler` version 18, incorporating Link recipe v1, physical
recipe v2, image-source recipe v2 and presentation recipe v5. Descriptors include semantic versions
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

`createCourseProject` owns live source/publication state. `editDocument` installs a schema-valid
immutable draft; a changed normalized value makes the prior product stale, while an equal value
keeps it current. `save` accepts semantic drafts. `importDocument` installs parsed source and compiled
product together on success. Failed imports/builds preserve source and prior successful output.
Stale output is comparison data and cannot be exported as the edited course.

`compile(assetSources)` and `importDocument(text,assetSources)` use explicit image inputs.
A superseded operation cannot publish over a newer source. `no_source` and `stale_source` are project
outcomes. API shape/domain errors follow [AGENTS](../AGENTS.md); unexpected internal faults remain visible.

## Occurrences and frame commit

An occurrence has an ordinal, canonical Section and actual incoming Link. Traversal contains visited
history, one active frame and a selected unvisited frontier. `select(from,link)` prepares a canonical
successor; repeating the same selection is idempotent. Replacing a selected/visited successor returns
`selection_locked`. `forward()` requires an existing successor or returns `selection_required`.
Reverse follows the inverse visited Link, including at merges; re-entry uses that same occurrence.

`retainBehind` is reverse-history distance from the latest entered Port. `selectAhead` bounds forward
selection beyond the active exit; the adjacent occurrence covers the seam even at zero ahead distance.
`maxOccurrences` is at least two and bounds total retained metadata. Complete intersecting occurrences
are retained. Exceeding bounds yields `selection_limit` or `occurrence_limit`; reverse beyond retained
history fails. Failed operations preserve the traversal.

A view declares camera/render, contact, driver and reverse/recovery behind/ahead extents, a closed
active-source pose interval and maximum fixed-step advance. Every required range
`[minS-behind,maxS+maxAdvance+ahead]` lies inside available geometry. Otherwise `coverage_gap` identifies
the consumer and required/available intervals. Unrepresentable mapped stations produce
`unrepresentable_view`. An unselected exit bounds forward coverage; discarded predecessors supply none.
The successor owns a seam, including a view endpoint.

`prepare('forward'|'reverse')` and `prepareSelection(from,link)` return prospective state. Prepared
views precede publication. A plan commits once; intervening selection/movement makes it stale.
The optional `selectUnique` preparation extends unique continuations in that prospective history.

A physical seam crossing requests the actor transition. Its contact pose and one-step motion fit
the motion guard, and destination readers must be available. Commit transforms world position,
velocity, orientation and camera yaw, and rebases course/recovery observations atomically. Body-local
state, wheel/control scalars, camera vertical state and earned progress are invariant under the basis change.
Physics owns `reframeVehicle`; [Architecture](architecture.md#course-frames) owns its transform.

An exhausted motion domain or unavailable destination uses legal-route recovery on the retained
selected approach, leaving the active frame and earned progress intact. Recovery/replacement resynchronize
observations. A source entry retains at least 30 m run-in; reverse/manual recovery past the playable
entrance returns to its supported Port before the camera observes it.

## Fork lock and handoff

Section `fork` is null or `{lock,closure}` anchors. Controls require two or three exits and
`entry < lock < closure < every exit seam`, with positive lock chainage. The parallel-zone subset
is straight and outside Guide fillets. Through closure, edges are constant, roads have positive
width, and explicit physical bindings support the roads, separating medians and connecting space.
Invalid controls produce `invalid_fork`.

Exit Carriageways are ordered by their actual lock-line edges. Median centers divide supported
space into regions; outer supported shoulders belong to the outer exits. The shared half-open
[lateral rule](architecture.md#boundary-geometry-and-local-windows) assigns exact ties to the right.
Unsupported/outside crossings select no route.

The player and rivals are eligible. All forward lock-plane crossings in a fixed step are ordered
by intersection fraction, then stable actor ID for an exact tie. The first candidate selects one
irreversible route for that fork occurrence after the field's successor views are ready. Locking,
each actor's seam crossing and checkpoint credit are separate events.

Rivals immediately follow the selected Carriageway center. Unselected roads show saved state-selected
signs. At/beyond closure, actors on losing pavement recover at the same chainage onto the selected
road; progress observations resynchronize. Geometry stays static.

Before lock, parent/common content covers all required queries through fixed-step advance:
`requiredEnd <= commonEnd <= earliestExitSeam`. After lock the selected Link extends the view.
At every exit, `parentSpecificVisibleEnd <= exitSeam`; the exclusive visibility end describes approach
positions, so no parent-specific roads/scenery contribute at the seam. Shared successors use matching
common overlap; reverse traversal follows the actual predecessor.

## Physical crossings and progress

World gates observe oriented plane crossings. Forward is negative to zero/positive; reverse is
positive to zero/negative. Arrival counts once and departure does not repeat it. Width tolerance is
independent of crossing direction; race gates use supported Carriageway width rather than Guide envelope width.

Ordered progress follows authored checkpoints and continuation/exit gates. Circuit progress reuses
one source-local gate set for each lap and counts valid finishes; grid release earns no lap.
BRANCH advances its completed Section interval only after the actor changes frame. The current
ordered-progress implementation includes synthetic `:EXIT` continuation gates. They grant no clock extension.
Missing checkpoints, reverse, recovery and replacement grant no new credit. Earned progress remains
fixed after FINISH. Rival positions/audio use the player's observation frame; ranking uses validated progress.

## Session and reference timing

### Resolved Session

CLASSIC resolves the saved vehicle, rivals, laps and checkpoint clock. CUSTOM resolves a catalog
vehicle, zero to sixteen rivals, permitted laps and clock on/off. Player and rivals share the resolved
vehicle calibration and protection settings. Unsupported course/vehicle/grid/lap combinations fail before activation.
A Session binds immutable course, vehicle, roster, grid, lap target and timing references.

START begins a standing run. PAUSE/hidden-page time consumes no simulation time. GOAL or GAME OVER
stops the field and preserves final rank and precise event time. NEW SESSION returns to setup.
Recovery consumes simulation time and grants no crossing credit. Results are session-local.

### Reference times and clock

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
run; a valid checkpoint or FINISH wins an exact expiry tie. Rejected late crossings do not raise progress.

### Vehicle envelopes and drivers

Generated envelopes contain maximum speed and speed-indexed acceleration, braking and lateral-response
observations for each vehicle configuration. The driver consumes an envelope, utilization, speed cap
and lane; it reads a contiguous 5 m lattice up to 480 m ahead and publishes canonical steering,
throttle and brake. [Calibration](calibration.md) lists current utilization values.

The same driver serves reference runs and live rivals. Generated runs contain precise landmark times
and optional 10 Hz position/speed/utilization traces. The browser loads current envelopes and compact
integer-millisecond budgets. [Development](development.md#build-outputs) owns generated file locations.

## Recovery

Recovery observes support loss, falling, penetration, chart excursion and overturning. It reconstructs
pose, velocities, wheels, actuators, powertrain and observations at known supported coordinates while
preserving steering/tire calibration and earned gates, locks and laps.

Same-chart recovery backs off from the farther of causal current chainage and last-safe chainage.
Wrong-route recovery uses the legal approach and the actor's backtracking/retained-speed profile.
Physics' typed suspension-travel exit requests this gameplay discontinuity. Known coordinates preserve
occurrence identity. Observers resynchronize once, suppress reset crossing credit and update the player
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
