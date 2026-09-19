# Content and gameplay

This document owns current course transactions and the separately labelled Course Editor target.
[Architecture](architecture.md) owns coordinates and geometry, [image assets](image-assets.md) owns
image formats and compilation.
[NEXT](NEXT.md) identifies the implemented boundary and ordered cutovers.

## Composition and data ownership

The new [CourseDocument root](../src/main-course.ts), the default `?mode=linear` selection, loads saved JSON/images,
compiles the graph, and assembles the [shared scene](../src/runtime/course-scene.ts). The scene creates
single-Section or occurrence driving readers, saved presentation and the ordinary renderer. The headless CLI uses
this same assembly. The SEAM selection drives the two-Section split through a rotated/translated Link. CIRCUIT uses a
2 km source lap, a standing start, two required laps and two provisional DEV rivals.
The original provisional course is a finite 2.8 km LINEAR with 132 row-generated
scenery instances, two environments, varying widths, shoulders, left/right turns and height changes.
The shell retains vehicle selection, input, camera lifecycle, audio and HUD. Source paint samples level
zero without filtering; all inputs finish loading before ticks. A failed load/compile offers retry. An authored entry Port retains 30 m of source behind the
playable entrance. Reverse travel or repeated manual recovery past that entrance uses ordinary
legal-route recovery to the Port before camera observation, without progress credit.

The [vehicle catalog](../src/vehicle/vehicle-catalog.ts) owns nine production identities and their
[compiled profiles](../src/vehicle/production-vehicle-profiles.ts). Model, manufacturer, identifier,
specification and period are distinct fields. Presentation uses car/bike metadata. Browser
[key bindings](../src/browser/key-bindings.ts) own shortcuts; input owns driving aliases and tests check
collisions. Testarossa is the current default player/fixed rival. Shared starting tire calibration is
not a requirement that finished vehicles have identical tires.

Product CourseDocuments and image bytes live in `content/`. Regression inputs and read-only probes
live in `src/dev/fixtures` and `src/dev/diagnostics`. [Raster authoring](../src/course/raster-turtle.ts)
owns line/arc subdivision and radius provenance. [DEV](../src/dev/README.md) owns the fixture boundary.

## CourseDocument v7: implemented compiler boundary

[Admission and serialization](../src/course/course-document.ts),
[geometry recipe](../src/course/course-geometry.ts),
[course compilation](../src/compiler/compiled-course.ts) and
[project transactions](../src/authoring/course-project.ts) implement Gate 1 independently of the current
driving roots. The [constant LINEAR example](../tests/fixtures/linear.course.json) and
[varying LINEAR example](../tests/fixtures/varying-linear.course.json),
[linked LINEAR example](../tests/fixtures/linked-linear.course.json) and
[transformed loop](../tests/fixtures/transformed-loop.course.json) are executable inputs for
the [offline entry](development.md#course-document-compiler). A compiled document is geometry/reference
data with explicit height/physical content and verified indexed image sources, not a ready driving
Session or completed resident ground product.

### Wire fields and scopes

All fields below are required. Objects reject unknown fields; arrays retain their saved order. The
reader creates owned frozen records in schema field order and normalizes negative zero to zero.
Save emits compact UTF-8 JSON. Whitespace and object-property order do not affect source identity;
array order is saved input, including meaningful primitive, knot and stamp order. The schema includes boundary-relative scenery rows, state-selected placements and explicit
fork lock/closure anchors to the saved presentation/reference subset. Live field/actor state remains
outside the document.

| Record           | Exact v7 fields                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CourseDocument   | `format: "superoutride.course"`, `version: 7`, `id`, `units: {length: "m", angle: "deg"}`, `geometryRecipe: {id, version}`, `type: "LINEAR" \| "BRANCH" \| "CIRCUIT"`, `entrySectionId`, `sections`, `links`, `assets`, `sceneryInstances`                        |
| Section          | `id`, `start: {x, z, heading}`, `guide: {margin, mMin}`, `primitives`, `boundaries`, `bands`, `height: [{anchor, y}, ...]`, `physicalBindings: [{bandId, sections: [{anchor, material}, ...]}, ...]`, `carriageways`, `ports`, `assetIds`, `presentation`, `fork` |
| Straight         | `id`, `kind: "straight"`, `length`                                                                                                                                                                                                                                |
| Circular arc     | `id`, `kind: "arc"`, `radius`, `turn` (signed degrees)                                                                                                                                                                                                            |
| Absolute anchor  | `kind: "absolute"`, `s`                                                                                                                                                                                                                                           |
| Primitive anchor | `kind: "primitive"`, `primitiveId`, `fraction`                                                                                                                                                                                                                    |
| Boundary         | `id`, `knots: [{anchor, l}, ...]`                                                                                                                                                                                                                                 |
| Band             | `id`, `start`, `end`, `leftBoundaryId`, `rightBoundaryId`, `role` (`"pavement"`, `"shoulder"` or `"median"`)                                                                                                                                                      |
| Carriageway      | `id`, `bandIds`                                                                                                                                                                                                                                                   |
| Port             | `id`, `kind: "entry" \| "exit"`, `anchor`, `carriagewayId`                                                                                                                                                                                                        |
| Link             | `id`, `source: {sectionId, portId}`, `destination: {sectionId, portId}`, `overlap: {behind, ahead}`                                                                                                                                                               |
| Asset reference  | `id`, `format: "superoutride.sprite-lod"`, `version: 1`, `sha256`                                                                                                                                                                                                 |
| Scenery instance | `id`, `assetId`                                                                                                                                                                                                                                                   |

`presentation` is either explicit `null` (geometry/physical-only source, not ready presentation), or:

| Record            | Fields                                                                               |
| ----------------- | ------------------------------------------------------------------------------------ |
| Presentation      | `ground`, `environments`, `scenery`, `sceneryRows`                                   |
| Ground            | positive `left`, `right` extents, `baseRgb555`, `bands`, ordered `stamps`            |
| Appearance Band   | `bandId`, `sections: [{anchor, paint}, ...]`                                         |
| Paint             | `null` (reveal base), or `{assetId, phaseS, phaseL, alternate}`                      |
| Alternate         | `null` (A only), or `{paletteRgb555, spanS, spanL}`                                  |
| Stamp             | `id`, `assetId`, `anchor`, `l`                                                       |
| Environment       | `anchor`, `name`, `groundBaseLeft`, `groundBaseRight`, `background`                  |
| Background        | `assetId`, `horizonY`, `pixelsPerRadian`, `yawOrigin` (degrees in the Section frame) |
| Scenery placement | `id`, `instanceId`, `unselectedCarriagewayId`, `anchor`, `l`, `groundOffset`         |

GroundBase values are explicit RGB555 integers or `null` for transparency. Ground/source composition
and image roles are specified in [Image assets](image-assets.md#saved-course-presentation).

IDs are opaque nonblank strings without surrounding whitespace, compared exactly without Unicode/
whitespace normalization. Admission rejects padded IDs rather than silently renaming them. Course ID
is external identity; Section, Link, asset and scenery-instance IDs each have a document-wide scope. Primitive, Boundary,
Band, Carriageway and Port IDs each have a separate Section-local scope. Duplicate declaration IDs fail
admission. References resolve within their declared scope, never by array position or naming convention.
Empty arrays and unresolved references may be saved as drafts; successful compilation requires complete
semantic input. A well-formed but unavailable geometry recipe may also be saved, and fails compilation
with `unsupported_version`. Schema/format and unit mismatches fail admission. Earlier schemas are explicitly
unsupported. Geometry fixtures explicitly select v7 with `presentation: null`, `fork: null` and an empty
scenery-instance collection; no appearance or fork controls are inferred from physical Bands.
There is no implicit root from declaration order or compatibility interpretation.

Stamp IDs and scenery-placement IDs have separate Section-local scopes. Appearance resolves canonical
Band and asset references; every Band requires one binding, with a start-inclusive profile beginning
at activation and changing strictly before its end. Every present presentation has an environment
profile beginning at zero. Scenery placements resolve document-wide canonical instances whose assets
belong to the Section. Shared identity alone does not prove matching placements across a Link.
`unselectedCarriagewayId` is null for ordinary scenery, or resolves once to a canonical exit
Carriageway. Its placement lies from lock through closure, before every common exit guard.
The scene shows it after the field selects a different exit; retained occurrence history supplies
that state. Warnings and closure signs use the same saved sprite instances and ordinary rendering.
Each stamp/scenery collection and the instance collection admit 4096 entries; profiles retain the
256-node bound and the whole-document byte limit. Rows store `id`, `assetId`, `start`, `end`, `spacing`, `boundaryId`, `side` (left/right), nonnegative
`offset` and `groundOffset`. The interval is half-open; placements occur at start + index × spacing.
They follow the referenced varying Boundary on the selected side. Expansion shares canonical assets,
creates deterministic Section/row/index instances, and is limited to 4096 total Section placements.
Unsupported repair scatter and dimensioned marking/boundary recipes receive diagnostics.

Asset references bind exact saved sprite-image bytes by lowercase SHA-256. Compilation now requires
explicit saved bytes for every declared digest and resolves Section membership to canonical descriptors
with deeply frozen indexed sources. Aliased descriptors share one source, including at merges/loops.
[Image admission](image-assets.md#course-image-source-admission) owns validation, resource limits and
asset diagnostics. Document drafts still save without bytes. An empty asset list is sufficient for a
geometry fixture, not a claim of complete presentation. No mutable pixel buffers enter this product.

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
per Section: 2048 plan primitives, 32 Boundaries, 256 knots per Boundary, 32 Bands, 16 Carriageways, 4 Ports and
256 asset references, 256 height nodes, 32 physical bindings and 256 material changes per binding.
Compilation caps each Section at 16384 Raster segments, 16384 mapped-band partition
cells and 100000 m of compiled chainage, checking subdivision counts before emitting vertices and
partition size before constructing cells. A Link admits at most 8192 overlap cells.
These authoring limits bound work and diagnostics. Product's one-Section CIRCUIT is retained:
the synthetic 20.8 km high-turn workload exceeds the former 2048-segment ceiling, and exact new primitive/
segment ceilings have executable admission coverage. This is not master-course or target-device approval;
the [capacity diagnostic](development.md#course-geometry-capacity) measures host cost reproducibly.

### Supported geometry and recipe

The accepted recipe is `superoutride.raster-guide` version 4. It pins `RasterTurtle` version 1 and
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

Recipe v4 partitions at Raster vertices, all used Boundary knots and Band activation endpoints.
Each cell uses its own active lateral ordering. Widths and shared-edge references are checked on
both closed ends; linear interpolation cannot hide an intervening crossing or a zero-width plateau.
The mapped-strip Jacobian is affine in chainage/lateral position within
each Raster interval, so its boundary extrema prove local non-inversion. Varying edges under the
interpolated miter map are quadratic, not straight corner-to-corner lines. Source admission proves
local non-inversion, Band ownership and Guide metrics; it does not require global geographical
injectivity. Repeated/crossing XZ positions at different chainages remain distinct source addresses.
This explicitly supersedes v3's whole-Section separated-hull requirement. Consumer-window separation
below replaces that requirement without removing inversion or ambiguity checks.

The derived Guide envelope interpolates the maximum absolute active boundary position plus margin
at these stations. Both closed incident cells contribute at a transition, including zero-area
birth/death points; dormant profile portions do not contribute. This is a conservative upper bound
between knots, not another authored width. The Core
[local-envelope contract](architecture.md#target-local-guide-envelope) checks each complete fillet;
a distant wide straight does not widen a tight bend. The margin covers only the explicitly admitted
chart domain: no contact/vehicle query envelope or physical binding is inferred here.
`courseBoundaryAt` and `courseBandAt` expose ordinary canonical data readers. The latter takes the
Section's `bandPartition` facet (canonical `raster`, `length`, canonical `bands`), not the whole CompiledCourse. It returns
the owning Band or null for a gap/outside: longitudinal membership is `[start,end)`, except a Band
ending at Section length includes that terminal; lateral membership is `[left,right)`. At a partition
switch only starting and continuing Bands own points. Invalid/nonfinite queries throw RangeError.
No role implies grip, paint or lock eligibility.
Legacy physical/paint/junction edge classification remains unchanged until the combined runtime cutover.

Recipes v1/v2/v3 are not silently reinterpreted. Their documents remain saveable but compilation reports
`unsupported_version`; changing to v4 is an explicit source edit that invalidates prior output.
The checked-in fixtures explicitly select v4 and retain their rulers and fillet geometry.
Raster/Guide authoring-domain rejections are RangeError; internal coverage/reader invariants retain Error.

### Consumer-local geometry qualification

`compileCourseGeometryWindow` receives only canonical `raster`, `guide` and `bandPartition` facets
and an explicit positive closed `[sStart,sEnd]` interval inside their shared ruler. It returns an
immutable `local-geometry` qualification retaining those reader references and its own interval/counts.
Construction hulls remain private; there is no copied source geometry or independent coordinate table.
The partition retains the canonical Raster against which its Bands were admitted; equal lengths from
different compilations cannot substitute for matching reader references.
Wrong shapes throw TypeError; invalid intervals or mismatched ruler references throw RangeError.

The window partitions Raster Bands at exact vertices, Boundary knots and activation stations, clipping
to the two query endpoints. Exact quadratic Bernstein hulls enclose each complete outer Band envelope,
including gaps. Guide windows use the full local envelope maximum within each clipped straight/arc
interval. Endpoints plus the intersection of endpoint tangents enclose each circular offset arc.
Positive admitted Jacobians separate incident intervals; nonadjacent intervals must have disjoint
convex hulls under the existing geometric sampling tolerance. Failure to separate either mapping is
an `ambiguous_geometry` diagnostic with `mapping` and both source intervals. It is conservative, not
a claim of exact intersection. These qualification diagnostics are not document JSON Pointers.
Both mappings are checked independently; failed admission publishes no partial view.

`COURSE_GEOMETRY_WINDOW_LIMITS` admits at most 1024 cells per mapping before quadratic pair work.
Exceeding it returns `resource_limit`, not success with a truncated window. It is a work bound, not
a fixed distance guard. The consumer owner must include its entire candidate/search range and query
envelope, preserve occurrence and seed identity, and keep queries within the qualified chart domain.
This offline single-source proof does not yet establish actual driving query containment, multi-occurrence
window validity, neighboring-actor height selection or presentation visibility. A geographically crossing
Section can qualify small windows around each passage while a window containing both fails. Height and
the actual traversal disambiguate grade-separated contacts; global nearest-road fallback is not permitted.

### Explicit height and physical bindings

[Physical compilation](../src/compiler/course-physical-content.ts) resolves height anchors on the same
Section ruler. Nodes must be strictly increasing, include exactly 0 and L, and yield finite render
and smooth-physics grades. The immutable Core `HeightProfile` remains the one implementation:
piecewise-linear render height and cosine-smoothed physical/camera height, independent of lateral position.

Every Band has exactly one explicit physical binding. Its ordered, piecewise-constant material profile
begins exactly at Band activation; subsequent changes lie strictly before Band end. Start-inclusive
changes extend to the next change or Band end. Material names resolve once to the existing immutable
Physics definitions: ASPHALT, SHOULDER, GRASS, DIRT, SAND or explicit VOID. Unknown, repeated, missing or
uncovered bindings receive structured diagnostics. Structural role never supplies a material default.
Physical and appearance values/change points remain independent; no image content is inferred.

Compiled bindings point to canonical Bands and resolved material records. Compiler owns the concrete
graph above Course and Physics; material types do not propagate through Port/Link type parameters. The Physics
[Band surface adapter](../src/physics/band-surface-reader.ts) receives only the partition and bindings.
It uses canonical half-open Band ownership, returning VOID outside/in gaps. Its conservative support
bound includes active supported profile endpoints and interior Boundary knots, not dormant/VOID portions.
No geometry is copied and no reader resolves an ID. This offline facet does not replace the legacy
SurfaceMap or adapt occurrence/frame mappings for contact, projection or terrain.

### Contact and fixed-step guard admission

`compileCoursePhysicalDomains` and `compileCoursePresentationDomains` validate the root's explicit
contact and fixed-step envelopes over canonical Links. Both are required by `createCourseDrivingSource`.
They compare height, supported materials, Band edges, level-zero paint/phase, background and shared
scenery throughout the common guard; failures identify the Link and affected consumer. The root
uses 30 m guards and source-owned occurrence spans for every longer query. Camera, renderer, driver
and recovery windows concatenate spans and never enlarge the common guard.

#### Authored fork controls and coverage

Section `fork` is explicit `null` (no admitted controls) or `{lock, closure}`, both ordinary anchors.
Null remains useful for geometry-only fork fixtures and cannot qualify a runtime route lock. Compiler v11
resolves anchors once, then compiles the static fork against the canonical outgoing Links. Require two
or three exits, entry before lock, and `0 < lock < closure < every exit seam`. The admitted parallel-zone
subset lies in an authored straight outside Guide fillets. Its active Bands retain constant edges,
positive road widths, continuous supported space and supported separating medians through closure;
their half-open domains include that endpoint. Interior edge changes and unsupported bindings fail.

The compiler sorts exit Carriageways by their actual lock-line edges. Separating median centers divide
the supported interval into half-open regions, each referencing its canonical outgoing Link. Supported
outer shoulders belong to the outer regions; other active pavement must belong to an exit. There are
no independently authored region widths, lookup IDs or live field decisions in this product. Invalid
controls receive `invalid_fork` authoring diagnostics and preserve prior publication.

The playable field uses the compiled partition directly. Each fixed step first advances ordinary
vehicle mechanics for every eligible actor, then collects world-plane crossings. The first candidate
ordered by intersection fraction and stable actor ID prepares canonical successor views for the field.
Only after preparation succeeds does it publish the irreversible choice. Selection grants no progress;
each actor crosses its own exit later. The parent supplies pre-lock lookahead, with 1,250 m from
lock to exit in the provisional course. Its two carriageways separate to 120 m before their seams.

After lock, rivals follow the selected Carriageway's Boundary-derived center. At and beyond closure,
actors on a losing pavement use ordinary `wrong-course` recovery at the same chainage on the selected
road. Progress observers resync without awarding a gate or displacement. Static median support and
road geometry remain unchanged. The shared merge retains each actor's actual predecessor for reverse.

### Offline Port and Link geometry

[Port/Link compilation](../src/compiler/course-links.ts) resolves a Port to a canonical Section,
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
cyclic Link, never lap copies. Per-Section local geometry admission applies; consumer windows, not the
whole reusable source, own geographical separation qualification.

### Bounded geometry views and occurrence history

[Geometry traversal](../src/runtime/course-occurrence.ts) is a live bounded traversal over
canonical Section/Link references. Each immutable occurrence has a traversal ordinal, reusable Section
and chosen incoming Link. Its owner separately retains actual visited `occurrences`, their `active`
frame, and an ordered unvisited `selected` frontier; none is stored inside CompiledCourse. Ordinals
establish local instance identity, not checkpoint or lap credit. `select(from, link)` requires a canonical
retained forward occurrence and outgoing Link. It prepares the next instance without changing visited
history or frame; the same selection is idempotent, and replacing an existing selected/visited successor
returns `selection_locked`. Explicit selection may extend a pending itinerary without visiting it.
`forward()` advances only to an already visited or selected successor; without one it returns
`selection_required`. Visiting moves that same instance from selection to history. Reverse uses the inverse of the
visited Link and the retained predecessor, including at a merge. Re-entry reuses the same occurrence;
an already visited successor cannot silently be replaced. Failed operations preserve state.

All traversal construction limits are explicit. `retainBehind` declares the reverse-history distance
in metres from the latest entered port. `selectAhead` bounds a new selection's distance beyond the
active exit, retaining complete intersecting occurrences; the directly adjacent occurrence owns the
seam even for zero ahead distance. `maxOccurrences` bounds total visited/selected metadata and is at
least two. Exceeding either selection bound returns `selection_limit`/`occurrence_limit` without partial
mutation. Retained selections survive reverse/re-entry and do not become fictitious visits. Retain
whole intersecting occurrences, measured along visited seam spans, and discard older references after
forward traversal. Initial history can be shorter than the request; a view must still prove coverage.
Reverse beyond retention fails instead of guessing a predecessor or another lap. Occurrences share the
same Section readers/assets and never allocate geometry or image copies for a scored lap count.
Snapshots own frozen arrays; callers retaining old snapshots also retain that historical metadata.
This geometry adapter does not authorize an actor transition or implement route locks/recovery.

[Geometry views](../src/runtime/course-geometry-view.ts) map the retained visited/selected itinerary
into the still-active occurrence's coordinate basis. Compose the existing Link transforms locally; no global
unwrapped world coordinates accumulate. Each span owns one source-to-view address mapping: paired
chainage anchors, a derived lateral origin and an upright rigid transform. Lateral anchors are derived
from canonical Carriageway boundaries, never reconstructed by projecting rounded world positions.
The source Section, traversal occurrence and chosen frame remain separate identities even for a loop.

The inspection view uses finite chainage `[0,length]`. At a selected/visited seam the successor owns the point, including
when the seam is the view endpoint. Band queries delegate to the canonical half-open partition through
the same address mapping as Raster/Guide point readers. Lateral membership compares the view point
with source boundaries shifted by that mapping, preserving exact half-open ownership without a lossy
inverse boundary round trip. The zero-origin partition query retains its existing behavior. Preserve exact source Boundary/activation
stations across ruler offset cancellation; reject distinct classification stations that collapse in
the view ruler. Positive visited seam spans must also remain representable; a tiny occurrence cannot
silently disappear between larger neighbors. Continuous Core geometry retains its existing sampling tolerance. Source readers,
Boundary references, local Guide envelopes and assets are shared, not retessellated. The `geometry`
facet exposes ordinary point readers and Guide bounds without graph/occurrence metadata. The separate
driving adapters below supply actual readers without admitting an actor transition.

Every request explicitly supplies camera/render, contact, driver-lookahead and reverse/recovery
behind/ahead extents, plus a closed active-source pose interval and maximum fixed-step advance. For
each consumer require `[minS-behind, maxS+maxAdvance+ahead]` inside retained/selected geometry. Failure
returns a runtime `coverage_gap` outcome with consumer and frozen required/available intervals, not a
fabricated authoring JSON Pointer. Unrepresentable mapped stations/spans return `unrepresentable_view`.
No fixed guard is inferred. Without an explicitly selected/visited successor, coverage ends at the earliest exit seam;
no exit or parent runout is selected implicitly. A retained first occurrence with an incoming Link
starts at its entry seam, rather than inventing discarded predecessor coverage. View queries outside
the admitted interval fail explicitly. Malformed API values use TypeError/RangeError as in AGENTS.

The geometry view owns source addressing and interval coverage. Driving admission then binds its
physical and presentation readers to the root's contact/step guard products. Saved SEAM, CIRCUIT and
BRANCH roots use the same span composition and ordinary camera/renderer. Actual saved-course tests
cover frame continuity, closure transfer and parent-specific exit visibility.

The traversal owner also exposes `prepare('forward' | 'reverse')`. Preparation returns a frozen
prospective history and the same compiled/inverse Link transform without changing visited/selected
state. Build and admit the next consumer view from that history before calling its `commit()`. The optional `selectUnique` preparation also extends canonical unique continuations in the
prospective history, so all next-loop reader construction precedes publication.
Any intervening selection or movement makes the plan stale; an idempotent selection retains it.
`prepareSelection(from, link)` similarly builds a prospective selected itinerary and unique
continuations. The field prepares all affected views before publishing its choice.
A plan publishes once, including retention pruning. Existing `forward()`/`reverse()` use this same
path. This is a geometry transaction primitive, not a physical seam observation or actor commit.

### Single-Section driving view

`createCourseSectionDrivingSource` exposes ordinary geometry, height, material and projection readers
for a bounded view of one canonical source. Admission checks its actual geometry interval and rejects
foreign Links. Native segment arithmetic and projection seeds are retained; queries outside the
admitted interval fail. The shared scene uses the complete finite source interval for saved LINEAR.

### Occurrence driving and actor commit

`createCourseDrivingSource` consumes physical and presentation guard products over canonical Links.
Each occurrence owns its interval between entry and exit. The driving view composes retained and
selected spans and qualifies each source interval separately. Camera/render, projection, driver and
recovery reads cross ownership seams; their windows may extend beyond the 30 m common guard.
Guard equality covers contact and one fixed step only.

Ordinary Guide, Raster, height, surfaces, paint, environment, background and scenery readers use the
same occurrence mapping. Seeds encode occurrence ordinal and native segment index. Local projection
retains complete candidate intervals and deterministic tie order; it adds no global-search fallback.
Source readers and images are shared. Mapped metadata and retained history remain finite. The successor
owns the seam, including a closed endpoint. Scenery belongs to one owning occurrence; ground preserves
saved image phases and half-open Band edges. Outside the source strip, ordinary environment bases apply.

`createCourseDrivingGraph` prepares static readers once; `createSession()` owns one actor's traversal. Unique successors are selected within the
forward retention distance, including prospective successors before a frame commit. A physical gate observation requests forward or reverse commit; the pure
`createSeamView(...).admitMotion` checks the contact pose and one fixed step independently of consumer
windows. The prepared destination readers are constructed before publication. The transaction rotates
world position, velocity, body yaw and camera-rig yaw, rebases course/recovery coordinates and retains
all body scalars, contact memory, control state and camera vertical state. The normal camera update
then observes the destination world. No physical integration or force is repeated or corrected.
Recovery and vehicle replacement rebase their current observations without awarding a gate crossing.

The shared `createCourseScene` connects these readers to the unchanged renderer and is used by the
browser root and PNG CLI. `content/courses/seam.course.json` splits the provisional LINEAR on its flat
ridge, uses a translated/rotated destination frame and 30 m guards. The browser's SEAM selection drives
both Sections. Car and bike integration checks cover forward/reverse commit, rigid-frame picture
invariance, recovery across the seam and exact preservation of stored vehicle state.

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
`superoutride.course-compiler` version 14, including the Link recipe v1, physical recipe v2, image-source
admission recipe v1 and presentation recipe v3 descriptors.
Recipe descriptors contain stable IDs, integer semantic versions and operative numeric/data parameters,
not explanatory English. Versions pin the documented height, ownership, geometry and overlap behavior;
the physical descriptor also includes the existing material definitions. Section geometry recipe v4
revises admission without changing Raster/Guide arithmetic. Height/material edits invalidate source and build identity.
All inputs currently conservatively invalidate the complete
product. Rebuilds on the supported execution contract reproduce values and identities, but allocate
distinct graph objects. Changes to compiler/recipe semantics require a version revision; unsupported
recipes never silently migrate. Existing numerical-environment limits in Development apply.

Document admission/compilation returns `{ok: true, value}` or `{ok: false, diagnostics}`. Input diagnostics have
`kind: "input"`, `code`, a JSON Pointer `path` into the submitted input, and a causal `message`.
Schema admission reports the first malformed shape/value deterministically. After schema and asset
admission, independent scenery instances, Sections, boundaries/anchors, Bands, Carriageways, Ports,
Links and fork controls collect expected semantic errors in document/declaration order. Each dependency
phase completes its independent siblings; failed phases stop dependent construction. No placeholder
geometry or unresolved object is supplied to generate downstream cascades.

Compiler v12 replaces the former catch-all semantic code with explicit causes: empty course/Section,
Raster/Guide geometry, anchor/boundary/domain/width, Band overlap/coverage/transition, shared Boundary,
mapped inversion, Carriageway membership, height/physical binding, Port/Link/topology and unrepresentable
overlap. Clients use `code` and `path`, without parsing English messages. The diagnostic union in
`course-diagnostics.ts` enumerates these codes alongside shape/version/reference/resource and supported
presentation codes. Every validation call supplies its cause explicitly. Existing invalid-input and
geometry predicates remain in force; this reporting contract supersedes single-error semantic compilation.
Literal format/unit failures never claim to be version failures. Separate Link qualification diagnostics
and multi-failure behavior are specified above. Traversal/view failures use their runtime-specific
reasons, while project `no_source`/`stale_source` outcomes are `{ok: false, reason}` without document
diagnostics. Wrong API shapes/domains use TypeError/RangeError. Compiler adapters translate known geometry RangeErrors only; unexpected platform and invariant
exceptions propagate. Failure returns no partial product.

`createCourseProject` owns live source/publication state. `editDocument` installs an admitted immutable
draft and clears current compiled output on a changed normalized input; a no-op retains it. `save`
does not require semantic success. To reopen an unfinished draft, parse it and explicitly edit with
the admitted value. `importDocument` instead parses and compiles off to the side, installing source
and product together only on success. A failed import or build retains the current source and prior
successful product; that retained product is historical comparison data after an edit and cannot be
returned by `exportCompiled`. Generation checks discard builds/imports superseded by newer operations.
Syntax/schema import rejection occurs before advancing the operation generation, preserving an
already running compilation of the current source.

`compile(assetSources)` and `importDocument(text, assetSources)` accept the same explicit byte inputs
as `compileCourseDocument(document, assetSources)`. Each operation snapshots them before its first
digest wait. The project does not retain a mutable input-byte cache; callers supply saved bytes on
each build. Missing/corrupt inputs preserve prior publication and stale generations cannot install.

Core, physics and renderer receive ordinary readers/data. The shared scene and race composition own
live graph traversal and session state. Further GUI integration
are separate acceptance gates.

## Gates and race progress

[World gates](../src/gameplay/world-crossing-gate.ts) observe oriented physical crossings. Forward is
negative to zero/positive; reverse is positive to zero/negative. Arrival counts once, departure does
not repeat, and lateral width tolerance is independent of direction.

[Ordered race progress](../src/gameplay/ordered-race-progress.ts) accepts physical gates in authored order.
[Circuit race progress](../src/gameplay/circuit-race-progress.ts) compiles one source-local gate set and
counts accepted finishes. It reuses that set after a loop-frame resync; source geometry and gates are
never expanded into lap copies. The entry crossing earns no lap. Missing checkpoints, reverse motion,
recovery and replacement grant no new credit. Completed race progress remains fixed while driving
continues after FINISH.

The provisional circuit field uses the existing rival driver, mechanics, roster, race timing and
ranking. Every actor owns a bounded traversal over the same graph reader factory. At most the actual
predecessor, active occurrence and selected successor are retained on the 2 km source. A cumulative
rigid frame transform and chainage offset map observations into the player's current frame for
ordinary rival sprites and positional audio; these mappings grant no progress. The browser shows lap,
rank, elapsed time and FINISH. Timing starts with the standing-start signal and stops separately for
each accepted finish. These provisional two-lap/two-rival choices are development content; production
Session presets and AI reference qualification remain later milestones.

BRANCH progress composes one shared ordered checkpoint/exit gate set per canonical Section.
A completed source interval advances to the chosen successor only after the actor changes frame;
reverse and recovery resync observations while preserving earned progress. The provisional terminal
goal is 60 m before the final source end. CIRCUIT and BRANCH share field mechanics, observation,
ranking and timing composition; course presets remain deferred.

## Recovery

[Recovery](../src/gameplay/recovery.ts) is an explicit gameplay discontinuity observing support, falling,
penetration, chart excursion and overturning. `advanceVehicleWithRecovery` catches the typed suspension
travel exit; unrelated errors propagate. Reconstruct pose, velocities, wheels, actuators, powertrain
and observations at known supported coordinates while retaining steering/tire calibration.

Ordinary same-chart recovery backs off from the farther of current causal chainage and last-safe
chainage, avoiding repeated recovery onto the same launch face. Wrong-route recovery uses the legal
physical-gate approach and the actor's authored backtracking/retained-speed profile.

Gameplay observers resync once after recovery and suppress crossing credit for that reset. The browser
then resets/updates the player's camera. Earned gates, locks and laps remain intact. Known coordinates
preserve the correct occurrence; global nearest geometry is not a substitute. Vehicle replacement
reconstructs the camera in the same callback, before any render without a new physics tick.

## Rivals and future game systems

The [driver](../src/gameplay/rival-driver.ts) publishes canonical input from physical travel and Guide
lookahead, including a contiguous braking envelope. Driving policy leaves forces and route authority
unchanged. Presentation reads immutable vehicle/telemetry state. Scoring and race state belong to
gameplay, composed at the roots. Contacts, richer rivals and game effects need explicit interaction
contracts and causal tests.

## Agent authoring

Agents edit saved CourseDocuments and asset files, compile structured JSON diagnostics, inspect
product-renderer PNGs, and iterate. Scenery rows store anchored intervals, spacing, side and offset;
imports prefer primitive-relative anchors. GUI is reserved for later human inspection and adjustment.

Source observations live in a separate versioned intermediate document: chainage-indexed curvature,
grade, width, scenery, environment and checkpoint series with source provenance and calibration.
Deterministic scripts measure scanline centers, horizon and HUD speed from frames. Agents execute and
verify these scripts, classify scenery/environment, and judge fitting against product previews.
Offline `tools/course/` fitting owns primitive/knot estimation; compiler/runtime only consume authored
results. Distance/curvature/height scales are fitting inputs recorded with source edition/calibration
and remaster departures. Reference video pixels are never extracted as game assets.

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

A seam lies in an authored horizontal straight. Its practical common guard (about 30 m) certifies
physical and presentation agreement at contacts and over one fixed step. Camera/render, driver and
recovery windows follow concatenated occurrence spans, switching source at the seam; those entire
windows need not fit the common guard. Increasing fixture overlap to 500 m is not a valid substitute.
Sources retain matching height, Band/material, paint phase and shared scenery in their common region.
The transform preserves camera/world state and grants no progress. Parent-specific content uses the
ordinary span view and the exit-presentation contract below.

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

Warnings and closure are ordinary state-selected presentation. V1 has no wall collision physics.
At and beyond closure, an actor on an unselected carriageway uses legal-route recovery to the selected
road, preserving accepted progress and resetting crossing observations. Losing roads remain static geometry.

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
