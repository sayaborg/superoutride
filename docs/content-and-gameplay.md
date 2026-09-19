# Content and gameplay

This document owns current course transactions and the separately labelled Course Editor target.
[Architecture](architecture.md) owns coordinates and geometry, [image assets](image-assets.md) owns
image formats and compilation.
[NEXT](NEXT.md) identifies the implemented boundary and ordered cutovers.

## Composition and data ownership

The new [CourseDocument root](../src/main-course.ts), the default `?mode=linear` selection, loads saved JSON/images,
compiles the graph, and assembles the [shared scene](../src/runtime/course-scene.ts). The scene creates
single-Section or occurrence driving readers, saved presentation and the ordinary renderer. The headless CLI uses
this same assembly. The SEAM selection drives the two-Section split through a rotated/translated Link.
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

## CourseDocument v6: implemented compiler boundary

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
array order is saved input, including meaningful primitive, knot and stamp order. V6 adds compact boundary-relative scenery rows alongside explicit
fork lock/closure anchors to the saved presentation/reference subset. Live field/actor state remains
outside the document.

| Record           | Exact v6 fields                                                                                                                                                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CourseDocument   | `format: "superoutride.course"`, `version: 6`, `id`, `units: {length: "m", angle: "deg"}`, `geometryRecipe: {id, version}`, `type: "LINEAR" \| "BRANCH" \| "CIRCUIT"`, `entrySectionId`, `sections`, `links`, `assets`, `sceneryInstances`                        |
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
| Scenery placement | `id`, `instanceId`, `anchor`, `l`, `groundOffset`                                    |

GroundBase values are explicit RGB555 integers or `null` for transparency. Ground/source composition
and image roles are specified in [Image assets](image-assets.md#saved-course-presentation).

IDs are opaque nonblank strings without surrounding whitespace, compared exactly without Unicode/
whitespace normalization. Admission rejects padded IDs rather than silently renaming them. Course ID
is external identity; Section, Link, asset and scenery-instance IDs each have a document-wide scope. Primitive, Boundary,
Band, Carriageway and Port IDs each have a separate Section-local scope. Duplicate declaration IDs fail
admission. References resolve within their declared scope, never by array position or naming convention.
Empty arrays and unresolved references may be saved as drafts; successful compilation requires complete
semantic input. A well-formed but unavailable geometry recipe may also be saved, and fails compilation
with `unsupported_version`. Schema/format and unit mismatches fail admission. Schemas v1/v2/v3/v4/v5 are explicitly
unsupported. Geometry fixtures explicitly select v6 with `presentation: null`, `fork: null` and an empty
scenery-instance collection; no appearance or fork controls are inferred from physical Bands.
There is no implicit root from declaration order or compatibility interpretation.

Stamp IDs and scenery-placement IDs have separate Section-local scopes. Appearance resolves canonical
Band and asset references; every Band requires one binding, with a start-inclusive profile beginning
at activation and changing strictly before its end. Every present presentation has an environment
profile beginning at zero. Scenery placements resolve document-wide canonical instances whose assets
belong to the Section. Shared identity alone does not prove matching placements across a Link.
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
Both mappings are checked independently; no partial qualification is returned.

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

### Offline physical overlap qualification

[Physical qualification](../src/compiler/course-physical-overlap.ts) is a separate all-or-none operation
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

#### Declared physical query domains

`compileCoursePhysicalDomains(links, demand)` uses the same physical comparison, restricted to an
explicit seam-local query domain. The input has exactly `pose`, `step` and `consumers`; the latter
requires `contact`, `driverLookahead` and `reverseRecovery`. Each record has finite nonnegative metre
extents `{behind, ahead, left, right}`. Pose encloses all admitted actor reference positions about
the Port origin; step encloses motion in both directions and laterally before the next observation;
each consumer supplies its complete query footprint relative to those positions. There are no defaults.
This is a declared offline envelope, not a measured product limit or a vehicle/contact-size authority.

For each consumer and axis, required extent is `pose + step + footprint`. Every consumer's longitudinal
requirement must fit the authored common guard. The derived lateral domain is the bounding union of
all consumers, including reverse/recovery, and has finite positive width. Qualification compares the
entire guard within that domain, never a caller-chosen matching subset. All contributing Bands count,
including nonselected roads, medians, shoulders and VOID boundaries. A consumer expansion that reaches
unmatched sibling support fails; sibling roads outside the domain remain unchanged in the parent.

The partition additionally includes every linear Boundary crossing of either lateral-domain edge in
both source rulers. Clipped edges are then linear throughout each open cell, so endpoint comparison
proves the whole clipped field. Exact station and closed lateral-domain endpoint ownership are checked
separately. A constant-material open edge cell uses one interior witness after all crossings and
material/activation changes have been partitioned; an unrepresentable crossing/cell fails explicitly.
This is not sparse sampling of an unpartitioned guard. Full horizontal height checks remain mandatory.

Success freezes the owned demand, derived requirements and original Link references with scope
`physical-query-domain` and physical-overlap recipe v2. Failure publishes no partial qualification.
Independent Link failures and consumer coverage failures are collected deterministically in supplied
order, while dependent checks on an invalid Link stop. Qualification diagnostics have
`kind: "qualification"`, `code`, `linkIndex`, optional `consumer`, and `message`; they do not pretend
to be JSON Pointers into CourseDocument. Codes distinguish `coverage_gap`, `nonhorizontal_overlap`,
`physical_height_mismatch` and `physical_support_mismatch`. Malformed demand data instead has
`kind: "input"` and a pointer under `/demand` in the qualification request. Canonical-reference API
misuse raises TypeError/RangeError; internal invariant failures propagate.

The saved three-way fork/merge and declared demand are a positive physical-only fixture. Successor
Sections contain only their single common road, without copied sibling tails, artificial VOID holes,
or branch-dependent geometry edits. Whole-field qualification still rejects that fixture. Runtime
admission must additionally prove that real queries stay inside the qualified domain, including
neighbor interactions, reverse/recovery and pre-lock states. Camera/render coverage and presentation
visibility/continuity remain separate: physical reachability never proves that a road is invisible.

#### Declared presentation query domains

`compileCoursePresentationDomains(links, demand)` separately qualifies the admitted saved presentation
subset. Demand has the same explicit pose/step/extent form, with `cameraRender`, `groundFilter` and
`scenery` consumers. Ground filtering includes its complete query footprint and filter halo; scenery
includes every potentially visible anchor, expanded for the full bitmap and authored anchor. Each
expanded longitudinal requirement must fit the guard. The complete guard and union lateral domain
must fit both half-open source strips, including closed query endpoints.

The proof shares the physical qualifier's geometric partition, then compares paint at every profile
change, complete clipped cell and exact ownership boundary. Pattern equality requires the same
admitted image source and integer image-period displacement; static A/B spans, palette and parity must
agree. There is no phase epsilon. Base color, horizontal height, ordered intersecting stamps and their
source-lattice positions must agree. Environment/background fields and frame-relative pan origins
agree throughout the guard; angular agreement uses the Link recipe's heading tolerance because derived
Raster headings retain floating-point roundoff. Common scenery has one placement per canonical
instance in the domain, with equal mapped chainage, lateral position and render height.

Success owns immutable demand and Link references with scope `presentation-query-domain` and
presentation-overlap recipe v1. Independent Link failures are collected using qualification diagnostics;
codes distinguish missing presentation, ground, phase, environment and scenery disagreement. This is
a conservative source-pattern proof: differently encoded but coincidentally equal images can fail.
It neither chooses a ground filter nor certifies resident images or runtime transition readiness.

`coursePresentationDemand` derives straight-guard footprints from explicit camera distance, focal
length, viewport width/center, render depth interval, maximum yaw from the Port, filter radii and saved
scenery. For horizontal camera coordinates, `xr = cos(yaw)*l - sin(yaw)*ds`; the chase offset cancels.
The bound uses the farthest viewport edge/depth and the complete yaw interval, with bitmap anchor reach
expanded by the minimum cosine. Height and pitch change visible rows, not this conservative horizontal
bound. Runtime admission must still enforce the pose/yaw envelope and straight-guard premise.

The large three-way fork fixture qualifies all six Links for physical and presentation domains without
VOID holes or copied siblings. Actual ground queries remain inside the derived camera domain, and full
frames agree across paired transformed observations, including shared scenery and background. This
does not prove pre-lock coverage, each exit's complete parent-specific visible end, transfer margins,
general multi-occurrence driving readers or an atomic actor commit.

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

`compileCoursePreLockCoverage(fork, demand)` requires six explicit consumers: camera/render, ground
filter, scenery, contact, driver lookahead and reverse/recovery, using their existing demand keys.
Pose is relative to `(lock.s, 0)` and ends at lock (`ahead=0`); step includes the entire advance before
choice can take effect. Every expanded source interval must fit `[0, commonEnd]`, where `commonEnd` is
the earliest outgoing seam. Presentation queries must fit the parent strip and the union window must
pass local geometry qualification. Success retains canonical fork identity, each interval and the
owned demand under `pre-lock-query-domain`. Failures identify Section and consumer with
`kind: "fork-qualification"`, not fabricated authoring pointers. A pending successor cannot repair a
pre-lock coverage gap. This scoped proof still requires actual runtime pose/query admission.

`compileCourseExitVisibility(links, presentationDemand)` first performs full presentation-domain
qualification for every supplied Link, including shared-successor incoming Links. It derives a
conservative exclusive upper bound on parent-specific visibility: `source seam - guard.behind +
max(step.behind + footprint.behind)`. Matching content is guaranteed from that approach position through
`source seam + guard.ahead - max(step.ahead + footprint.ahead)`, under the same lateral/camera envelope.
The complete common guard contains all queries there, so parent-specific content cannot contribute.
This is a conservative bound, not a claim to have measured the exact last visible pixel. It does not
use physical reachability or a feature's own chainage as a visibility test. Success has scope
`exit-presentation-domain`; it neither qualifies lateral-transfer dynamics nor commits an actor.

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

[Geometry traversal](../src/runtime/course-occurrence.ts) is a live **offline exploration adapter** over
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

The result is labelled `geometry-only`. These are declared interval checks, not measured product
consumer envelopes, complete common-content overlap, pre-lock visibility or transition qualification.
Only the selected Carriageway has the Link's existing geometric agreement proof. Other Bands can
still differ across a seam unless separately qualified. Height and physical bindings now have admitted
Section facets and a separate overlap proof above; the scoped adapter below maps qualified common guards.
Saved images, paint/phase and scenery/background now have explicit presentation bindings and source
evaluation and separate source-domain continuity proofs. Full product camera/pose enforcement across a transition
remains unqualified. Separate physical/presentation proofs,
including every merge incoming Link and parent-specific exit visibility, precede runtime cutover.
The browser root consumes these occurrence readers for the saved two-Section LINEAR.

The traversal owner also exposes `prepare('forward' | 'reverse')`. Preparation returns a frozen
prospective history and the same compiled/inverse Link transform without changing visited/selected
state. Build and admit the next consumer view from that history before calling its `commit()`.
Any intervening selection or movement makes the plan stale; an idempotent selection retains it.
A plan publishes once, including retention pruning. Existing `forward()`/`reverse()` use this same
path. This is a geometry transaction primitive, not a physical seam observation or actor commit.

### Single-Section driving view

`createCourseSectionDrivingSource` prepares the canonical Band/material reader once. `createView`
accepts that source's active geometry view, requires one active-Section span, and qualifies its complete
source window. It publishes ordinary immutable `VehicleWorld` and `RasterGeometry` facets; consumers
receive neither Section nor occurrence/graph metadata. A view touching another occurrence returns
`unqualified_links`, even when its geometric Link already passes. Local geometry failures retain their
specific qualification diagnostics under `geometry_qualification_failed`.

Reader coordinates and projection indices remain native to the active source, independent of the
inspection window's zero. Every query checks the admitted range; local projection checks its complete
candidate-segment interval before searching. No global fallback or nearest passage selection is added.
The logical source endpoints remain distinct from the smaller readable window: insufficient coverage
must not shorten a driver's requested lookahead or change a recovery target. Height delegates to the
canonical source's original interpolation. Bounded Raster/height metadata retains original record
references; rebuilding a window creates no new geometry, height curve, image, frame or progress.

`courseSectionDrivingDemand` derives longitudinal demand from the actual camera distance, render far
depth, driver's query reach, complete physical projection neighborhoods, recovery backtrack/last-safe
station and an explicit pose/maximum-step envelope. Include both incident projection seeds at a closed
pose endpoint. Caller-owned pose slack controls reconstruction frequency; it is not a universal guard.
Runtime query checks and the real-consumer comparison detect an insufficient declaration.

This is the seam-free LINEAR vertical slice, not complete Gate 2 qualification. The comparison drives
all nine production vehicle profiles through the real contact/recovery/driver/camera/renderer path,
including reverse, unsupported excursion, moving windows and manual recovery. Its explicit diagnostic
ground/background/sprites exercise the existing renderer; they are not CourseDocument presentation
bindings or accepted product art. The common-guard adapter below extends those readers. Full lateral/pose
admission, pre-lock/exit enforcement, atomic commits and the joint edge cutover remain required. The browser and CLI use the single-Section reader for the saved LINEAR and the occurrence reader for linked courses.

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

`createCourseDrivingSession` owns one actor's traversal. Unique successors are selected within the
forward retention distance. A physical gate observation requests forward or reverse commit; the pure
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
`superoutride.course-compiler` version 13, including the Link recipe v1, physical recipe v2, image-source
admission recipe v1 and presentation recipe v1 descriptors.
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

Core, physics and renderer receive their ordinary readers/data. They do not import the course graph;
current composition roots remain unchanged. Runtime Link/view, image, session and GUI integration
are separate acceptance gates.

## Gates and race progress

[World gates](../src/gameplay/world-crossing-gate.ts) observe oriented physical crossings. Forward is
negative to zero/positive; reverse is positive to zero/negative. Arrival counts once, departure does
not repeat, and lateral width tolerance is independent of direction.

[Ordered race progress](../src/gameplay/ordered-race-progress.ts),
[circuit race progress](../src/gameplay/circuit-race-progress.ts),
[session configuration](../src/gameplay/session-configuration.ts) and
[race session](../src/gameplay/race-session.ts) remain general components for the circuit/fork milestones.
Skipped checkpoints, reverse travel, recovery and replacement grant no lap or gate credit.

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
