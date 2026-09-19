# Core architecture and rendering contract

This document owns coordinates, geometry, projection, metric scale and layer boundaries. Current
implementation is described first; [Course Editor targets](#course-editor-target) take effect at their
validated cutover. [Image assets](image-assets.md) owns image formats and compilation,
[ground delivery](ground-delivery.md) owns current transport/residency, and
[content and gameplay](content-and-gameplay.md) owns course transactions and authoring semantics.

## Coordinates and open geometry

Core owns shared 2D/3D vector arithmetic. Vec2 and Vec3 are readonly value contracts; authoring
replaces values instead of mutating coordinate observations.

World X/Y/Z is authoritative. +Y is up, yaw 0 faces +Z; positive yaw rotates toward +X. Positive
lateral `l` is right. For heading psi:

```text
t = (sin psi, cos psi)      n = (cos psi, -sin psi)
```

Course `(s,l)` is a derived observation. `s` is the shared plan chainage of Raster and Guide, distinct
from physical travel along a sloping/offset path. Local projection uses a known previous segment and
a finite clipped neighborhood. Known spawn/recovery coordinates seed that same search. Invalid seeds
fail explicitly, preserving the identity of overlapping circuit copies. Optional explicit lateral
clamping acts in the underlying Guide basis before subtracting a stage's lateral origin. Ordinary
physical projection remains unclamped.

RasterPath, GuidePath, HeightProfile, VisualProfile, logical/baked GroundMap and SurfaceMap have the
finite domain `[0,L]`. Their source readers share 1e-9 m endpoint normalization through
`openProfileChainage`, including SurfaceMap and unfolded circuit adapters. Raster/Guide geometric
sampling retains its separate 1e-8 m tolerance. Constructors reject nonfinite authoring before endpoint
normalization and own immutable copies. Tolerances affect sampling, not topology or awarded progress.

Consecutive authored vertices form the path. At endpoints the adjacent segment supplies the basis;
interior vertices alone own turns and fillets. Terrain visibility clips to the finite domain. Content
provides run-in/runout for camera, drawing and handoff. Current CIRCUIT unfolds authored topology into
a finite ordinary open window before constructing these readers. Topology remains above Core.

## Numerical threshold ownership

[Core tolerances](../src/core/tolerances.ts) owns shared source endpoints, geometric sampling,
lateral-boundary precision, pixel-edge precision and texel-spacing precision. Units and purpose
identify a threshold; equal numeric values do not make thresholds interchangeable.

Algorithm-local cutoffs remain named at their owners: [Raster](../src/core/raster-path.ts) for segment,
miter and turn bounds; [Guide](../src/core/guide-curve.ts) for arc-center, compilation and zero-turn
checks; [terrain](../src/terrain/terrain-line.ts) for depth/span inversion and thin-row collapse;
[GroundMap](../src/groundmap/ground-map-lod.ts) for level/texel rounding; and the
[target envelope](../src/groundmap/ground-map-target-envelope.ts) for footprint capacity.

Gate direction/width, route arbitration fractions, progress/ranking time, wheel torque residuals,
contact/steering determinants, camera response, recovery penetration and UI grid matching retain their
own dimensional domains. Source normalization, exact event ordering and numerical solver termination
are different contracts. Their current values remain in the corresponding source modules.

## Raster and Guide

Raster is a polyline with `|Delta heading| <= 10 degrees` at every interior vertex. Left/right road
and ground widths are independent. Edge continuity uses the exact miter basis; the constant-width
miter ratio is `1/cos(Delta/2)`. Validate actual mapped road/ground bands for finite joins, local
inversion and unintended intersections/overlaps. Width-versus-radius heuristics are insufficient.

Current compilation covers finite vertices/miters, the turn limit, Guide metrics, fillet overlap and
supported envelopes. [NEXT](NEXT.md#remaining-limits) records the remaining nonadjacent-band check.
Intentional coincident lap copies are classified separately from accidental authoring intersections.

At a roundoff-size fillet join, lookup retains the adjacent segment. Omitted intervals and compiled
coverage fit the reader's sampling tolerance even if dimensional validation permits a larger error.
A positive straight longer than the sampling tolerance remains a real primitive.

Current driving `RoadCrossSection` and `TerrainVisualProfile` widths are constant per source/view.
The specialized junction varies its cross-section. Current terrain enumerates Raster, render-height
and visual-section boundaries. The offline CourseDocument compiler implements varying Boundary
readers and Band activation/tapers; terrain/physical integration remains the [target](#compiled-boundary-geometry).

Guide rounds the coordinate curve with straight/circular fillets; the rendered road stays Raster.
For turn Delta and radius R:

```text
mu = abs(Delta) / (2*tan(abs(Delta)/2))     (mu = 1 at zero turn)
kappa = sign(Delta)/R
J = mu*(1 - kappa*l)
Rmin = sup(L(s), s in complete fillet)/(1 - mMin/mu)
trim = R*tan(abs(Delta)/2)
max Guide/Raster deviation = R*(sec(abs(Delta)/2) - 1)
```

Require `0 < mMin < mu`, `J >= mMin` throughout the chart, and nonoverlapping adjacent trims.
Opposite-curvature fillets retain the compiler's intervening-straight requirement. Guide is G1:
position/tangent are continuous, while parameter speed changes between 1 and mu.

R comes from the local chart bound or circular-authoring provenance. `GuidePath.envelope` is one
owned immutable piecewise-linear profile. Constant `lMax` authoring is compiled to two equal knots;
explicit profiles use the same reader and fillet algorithm. There is no independently stored scalar
limit. Explicit projection clamping and physical race-gate width use the bound at their query chainage.
Current physical readers still expose a global support bound, so containment conservatively requires
`maxSupportedAbsL + abs(lateralOrigin) < min(L(s))`; the reader's conservative local bound
includes junction support and boundary tolerance. [Containment](../src/physics/surface-guide-envelope.ts)
is checked at packages, registries, circuit windows and linear composition. Visual extent is separate.
Existing successor geometry generators explicitly require a constant source envelope; they do not
substitute its maximum for a varying profile. These generators are not adapters for CourseDocument
varying Bands. The chart edge enforces
`J >= mMin > 0`, not the singularity `J = 0`. Physical local projection remains
unclamped; ordinary excursion/recovery behavior owns out-of-chart motion.

## Height and projection

Terrain height is `Y(s,l)=Y(s)`. Render height is piecewise linear; physical and camera height use the
same smooth height implementation. [Render height mapping](../src/render/render-height-space.ts)
maps an actor's physical clearance above local ground into render height, preserving physical Y.

[Projection](../src/core/projection.ts) owns the complete pseudo projection:

```text
d = s_object - s_camera                  d > 0
xr = (X-Xcam)*cos(psiCam) - (Z-Zcam)*sin(psiCam)
scale = f/d
screenX = cx + scale*xr
screenY = cy - f*sin(phi) - scale*(Y-Ycam)*cos(phi)
horizonY = cy - f*sin(phi)
```

Depth is chainage difference. Equal depth gives equal scale; equal depth/height gives equal screen Y.
Each terrain chainage maps to one horizontal line. [Terrain generation](../src/terrain/terrain-line.ts)
uses this projection with forward visibility limited by road heading and camera direction. Horizontal
texture mapping is affine. Globally far-to-near terrain permits hills/dips to overdraw a row. A thin
or degenerate projected span collapses to one destination row with its complete source footprint.

## Camera and fixed metric

The player reference is physical width 2 m, source width 80 texels and screen width 80 px. Thus
`f/D_cam = 40 px/m`, `D_cam = f/40`; current f is 200 px and D_cam is 5 m. Near/far depths are
2.5/200 m. FOV changes preserve this metric by changing D_cam.

The [camera](../src/camera/camera.ts) keeps `s_camera=s_vehicle-D_cam`. XZ offset follows selected yaw:
body yaw by default, movement yaw as the alternate. Projection derives player horizontal centering.
Vertical following is bounded and smoothed; body pitch is subtracted from downward base pitch and
camera roll is zero. Current composition uses base pitch 12 degrees, player anchor row 190,
vertical-follow time constant 0.22 s and correction bound 4 m. These are presentation parameters.

## Ground and background

GroundMap appearance and SurfaceMap support/friction are independent. Each emitted terrain line uses
GroundBase outside its finite GroundMap strip. Each side selects a solid color or transparency;
transparency retains farther content. Far Background is a complete image, including below its horizon,
aligned by its source-horizon anchor. Yaw scrolls it; camera roll and alpha blending remain absent.
The [background format](../src/visual/far-background.ts) owns 640x320 pixels, horizon row 126 and yaw
density 200 source pixels/radian. Yaw density and focal length have different units.

Current shipped ground is precompiled. Paint samplers are compiler inputs and explicit diagnostics;
product rendering receives a complete scene-local final-color reader. Source offsets, shoulders and
junction paint are already resolved. `roadMarkings` owns ordinary paint and `junctionMarkings` paint
relative to carriageway centers; omitted paint means an unmarked road.

Current source spacing at reference depth d0 is:

```text
qL = d0/f
qS = d0*d0/(f*h*cos(phi))
```

The current pyramid reduces lateral density by `2^k` and chainage density by `4^k`. Current selection
uses `ceil(log4(deltaSEffective/qS))`, bounded by the compiled pyramid; lateral footprint is diagnostic.
Collapsed rows include the full source interval. `deltaSEffective <= dMax-dMin` bounds coverage.
[Image assets](image-assets.md#current-ground-compilation) owns encoding/filtering and
[ground delivery](ground-delivery.md) owns manifests, bytes, admission and leases.

## Sprites and Painter

Sprites have one logical master frame, physical width, a texel-center anchor and an ordered array of
completed bitmap levels. The [blitter](../src/graphics/sprite.ts) owns nearest sampling.
`g = (f/d)*worldWidth/masterWidth` is uniform master-texel magnification. Course anchors use render
height and known s; dynamic actors use observed s and mapped physical height.

Yaw/bank variants are discrete authored images. Presentation uses nearest samples, binary alpha and
one SINGLE sprite per vehicle. Bank is presentation-only. Runtime bitmap rotation, arbitrary visual
scale, z-buffering and alpha blending are outside this rendering contract.

Painter order is optional clear, full background, one far-to-near terrain/world-sprite merge, player,
then HUD. Terrain wins equal depth before sprites. Player is last among world visuals. The
[renderer](../src/render/renderer.ts) allocates detailed workload arrays only under instrumentation.

### Sprite LOD metric and read contract

The lattice is top-left aligned and untrimmed. Master W by H gives level k storage
`ceil(W/2^k)` by `ceil(H/2^k)` with nominal master-axis step `2^k`. A partial final cell is clipped
by the original logical frame. Shrinking continues on the longer axis when the other is already one;
a finite contiguous prefix is legal, through `ceil(log2(max(W,H)))` at most.

The anchor `(aX,aY)` stays in master texel-center coordinates. Level k derives each coordinate as
`((a+0.5)/2^k - 0.5)`. Default anchors are `((W-1)/2,H-1)`; fractional/outside-frame anchors are valid.
Every level represents `worldWidth` by `worldWidth*H/W` meters. Storage or opaque bounds do not
redefine physical dimensions.

Starting at L0, coarsen while `g <= 1/(sqrt(2)*2^k)`, clamped to available levels. Equality coarsens.
Projection keeps continuous display extent/anchor. Pixel rasterization and image color/coverage can
still step; there is no crossfade. [Image interchange](image-assets.md#completed-sprite-images) owns
the exact reader schema and palettes. Current programmer art remains single-level.

### Offline sprite LOD authoring recipe

The [image compiler contract](image-assets.md#offline-sprite-lod-authoring-recipe) owns this recipe.

### External sprite source normalization

The [image source contract](image-assets.md#external-sprite-source-normalization) owns PNG normalization.

### Sprite Tool authoring session

The [image session contract](image-assets.md#sprite-tool-authoring-session) owns the saved tool format.

## Layer and computation rules

Core owns Raster/Guide, height and finite source operations. Course owns shared boundary geometry.
Graphics owns framebuffer, color codec, blitting and Painter primitives. Visual owns assets and
visual profiles; Terrain projects geometric bounds; Render assembles the pipeline. GroundMap owns
image readers, baking, filtering and footprints. Physics owns support/material interpretation and
Guide containment. The vehicle catalog owns presentation-family metadata.

Audio owns procedural sound and read contracts; vehicle binds acoustic profiles and browser adapts
physical observations. Audio imports Core; physics stays independent of audio. Browser owns HTTP
and may consume GroundMap delivery contracts. GroundMap owns no browser/network operations.

The [hygiene graph](../tests/infrastructure/repository-hygiene.test.mjs) enforces acyclic directory
imports, including types. Composition roots alone import concrete DEV content. Runtime supplies
ordinary narrow readers to physics, camera and rendering; compilers own static preparation.
Course topology and product choices belong in composition/gameplay, not pixel loops or mechanics.
The compiled course graph is an upper-level owner; its lower-level reader facets preserve this graph.
The implemented [document/compiler boundary](content-and-gameplay.md#coursedocument-v3-implemented-compiler-boundary)
uses `src/runtime/compiled-course.ts` over Course-owned documents/geometry and existing Core readers.
Explicit height uses Core HeightProfile; Course's generic physical-binding records reference canonical
Bands while Runtime resolves Physics-owned materials. The document compiler's former geometry-only
direct-import boundary now additionally admits only the physical-content compiler and the existing
Physics surface-material contract. The physical compiler and overlap qualifier cannot import vehicle,
renderer, image-delivery or gameplay implementations. Parsed dependency checks enforce these limits.
The narrow Band surface adapter consumes only
partition/bindings, not the course graph. Separate all-Link physical qualification does not certify
presentation or product-consumer coverage. Its separate offline entry installs no new driving path.
Core's shared content digest serves course
and current GroundMap identities without a dependency from authoring geometry to image transport.

## Compiled profile and asset boundaries

Surface, logical ground, visual and height profiles own ordered immutable inputs and binary lookup.
SurfaceMap validates physical bands. Terrain merges explicit change points into adjacent positive
intervals, eliminating exact duplicates while retaining distinct authored intervals. Traversal uses
those intervals directly, without cursor nudges.

Sprite construction checks dimensions, buffers, finite anchors and positive physical width. Compiled
products retain owned immutable metadata and explicit buffer ownership. Reachability from a product
root or declared compiler identifies use; tests/tools separately consume diagnostics and fixtures.
Painter, metric, gate and coordinate regressions remain executable. Build cost, steady-state draw
cost and instrumentation cost are measured separately.

## Ground authoring boundaries

Current `RoadCrossSection` owns road/shoulder dimensions, shared by paint and stage views. Junctions
derive outgoing dimensions from their incoming cross-section. Terrain dimensions are compiler output.
Current child shoulders are 1 m and highway-parent shoulders 1.5 m. Visual extents and physical support
are independent; route intent consumes geometry and its chainage transform rather than paint storage.

Paint, GroundBase and physical surface profiles keep independent values/change points. The stadium's
sand/dirt fixtures intentionally retain grass-colored diagnostic paint. Current branching ground is
drawn to 13 m while ordinary physical outside bands end at 12 m. Missing support is VOID.

Current edge classification remains road-priority for ordinary visual paint, left-inclusive ordered
physical bands, and the junction's explicit tolerance. The [target partition](#target-lateral-boundary-ownership)
replaces these together with new reader tests; a documentation move leaves current pixels/physics intact.

## Accepted authoring target

The [target geometry](#course-editor-target), [target images](image-assets.md#course-editor-target) and
[course model](content-and-gameplay.md#course-editor-target) are implemented at the gates in NEXT.
Source-camera/variant sampling and real-art filter acceptance remain open; SINGLE presentation remains.

### GroundMap compilation and residency

[Current image compilation](image-assets.md#current-ground-compilation) and
[current delivery](ground-delivery.md) own the existing paged implementation. This section retains
navigation for existing links; each detailed contract has one owner.

## Course Editor target

This section owns target frame and geometric reader contracts. Local Guide envelopes and the offline
Boundary/active-Band and geometric Port/Link subsets are implemented. Offline bounded geometry views
now share source readers through occurrence mappings. Complete content/consumer qualification, runtime
Link commits and joint physical/visual edge cutovers remain pending. [Content](content-and-gameplay.md#course-editor-target) owns authored
records and transactions; [image assets](image-assets.md#course-editor-target) owns image products.

### Frame transform and coordinates

Derive `destinationFromSource` from oriented ports: R is yaw rotation about +Y taking source forward
to destination forward, and `t = pDestination - R*pSource`. Then `p' = R*p+t`, `v' = R*v`.
The inverse uses `transpose(R)` and `-transpose(R)*t`. Identity is a value for any Link kind,
including loops. Port anchors are authored; transforms are immutable compiled output.

The ordinary [Core planar transform](../src/core/planar-transform.ts) implements this math without
course knowledge. Offline Links derive poses and validate their selected Carriageway overlap at the
[course compiler boundary](content-and-gameplay.md#offline-port-and-link-geometry). World Y is unchanged.

Transform world-expressed orientation/angular quantities and state caches coherently. Body-local
components, wheel speeds, control scalars and validated progress retain their values. The
[commit transaction](content-and-gameplay.md#occurrences-and-frame-commit) owns atomic state replacement.
This change of basis preserves metric length, world up and gravity. Matching common overlap and
horizontal seam geometry are separate checks. A port match alone does not certify continuity.

Core retains finite open readers, Raster/Guide, `Y(s,l)=Y(s)` and chainage pseudo-projection. The runtime-owned [offline geometry view](content-and-gameplay.md#bounded-geometry-views-and-occurrence-history)
composes upright transforms and source addresses across a retained itinerary, exposing narrow point
readers in its active frame. It neither recompiles Raster/Guide nor supplies the current driving
interfaces. Complete consumer/content qualification remains required. Those addresses are not race credit.

### Compiled boundary geometry

[Authored boundaries](content-and-gameplay.md#cross-section-and-variable-width-authoring) compile into
immutable piecewise-linear readers on the one Raster s ruler. Width/center are derived. Constant and
varying widths share one target representation. Partition at Raster heading, render-height and relevant
boundary knots/activation changes. Use the existing Raster/miter or Guide mapping at the responsible
consumer. Validate mapped-band interiors as well as endpoints. Paint changes alone do not split shape.

The offline compiler partitions active Bands and proves closed-cell geometry before publication.
It exposes one narrow finite `bandPartition` facet with canonical Band references; its construction
cells are private. [Content](content-and-gameplay.md#supported-geometry-and-recipe) owns the current
activation, transition-continuity and terminal-membership rules. They do not change the current
driving readers' finite-endpoint or lateral classification contracts.

Terrain consumes and projects the compiled view's bounds once and exposes source-to-span mapping to
the final-color reader. Retire stage reprojection and diagnostic road-edge coordinates with consumer
and identical-output tests. A visible marking is paint, not another geometric road-edge authority.

### Target local Guide envelope

The Core profile, full-fillet validation, query clamping and conservative support containment are
implemented and covered by [local-envelope tests](../tests/geometry/local-guide-envelope.test.mjs).
Playable source data remains constant. The CourseDocument compiler derives varying profiles offline;
consumer-specific contact extents and Link-transformed views remain later Gate 2 work.

Use a longitudinal chart envelope `L(s)` in the underlying Guide basis, replacing the Section-wide
`lMax` constraint at the target cutover. Its immutable conservative profile encloses the supported
bands and admitted contact/projection queries plus an explicit positive chart margin. Resolve source
origins/Link transforms before computing that bound; visual ground extent is an independent quantity.
A constant profile represents the existing constant-envelope case.

Keep the same pointwise metric `J = mu*(1-kappa*l) >= mMin`. For each complete fillet interval I,
use `L_I = sup(L(s), s in I)` in `Rmin = L_I/(1-mMin/mu)`. Validate the final interval at all relevant
knots and interior extrema, including its trim extent; sampling only the corner station is insufficient.
Circular provenance continues to determine authored-arc radii. A fallback corner uses a conservative
bound over its adjacent finite Raster intervals before construction, followed by the complete-interval
check. Trims, coverage and opposite-turn clearance retain their existing constraints.

The envelope is domain metadata, not a force, a new centerline or a lateral clamp. Each reader uses
the bound at its actual query chainage. Invalid inputs/queries remain explicit; ordinary excursion and
recovery policy handles vehicle motion. A wide straight fork therefore need not impose its width on a
distant tight bend, while a wide locally tight bend can still be rejected. For piecewise-linear L(s),
the complete interval's extrema are its clipped endpoints and interior knots. Existing constant-input
geometry and ordinary unclamped projection retain their numerical behavior.

### Target lateral boundary ownership

Point classification uses half-open lateral regions `[left(s), right(s))`, with shared boundaries
resolved from the same compiled Boundary object. At a shared edge the region on its right owns the
point. The outer left edge is included; the outer right edge is outside. Gaps/outside resolve to the
consumer's declared outside result: physical VOID, visual GroundBase, or no eligible lock region.

The same rule covers pavement, shoulder, median and lock-zone membership. Geometric validation uses
closed bounds to prove containment; image filters integrate their clipped area. Neither changes point
ownership. A zero-width birth/death endpoint owns no area. Existing finite-chainage endpoint sampling
and the oriented gate's forward/reverse plane-crossing rule remain separate contracts.

Numerical tolerances validate geometric agreement and source endpoints. They do not enlarge adjacent
classification intervals or choose between two owners. In particular, a median-center lock tie goes
to the right-hand zone in the target. Migrate source classification, support and gate membership as one
explicit behavior revision with below/at/above-edge tests; retain the current rules until that cutover.

### Source and completed images

[Image assets](image-assets.md#source-and-completed-images) owns the common source and completed-color formats.

### Source lattice and tile dictionary

[Image assets](image-assets.md#source-lattice-and-tile-dictionary) owns the candidate output lattice.

### Ground LOD and filter

[Image assets](image-assets.md#ground-lod-and-filter) owns filtering and ground level selection.

### Ground composition and stamp placement

[Image assets](image-assets.md#ground-composition-and-stamp-placement) owns pixel composition and placement rounding.

### Static A/B recipe

[Image assets](image-assets.md#static-ab-recipe) owns the single saved-recipe workflow.

### Bounded compilation and resident data

[Image assets](image-assets.md#bounded-compilation-and-resident-data) owns completed target data;
[course loading](content-and-gameplay.md#course-loading) owns activation and replacement.

### Remaining technical gates

[Test design](test-design.md#course-editor-acceptance-additions) and
[development](development.md#course-editor-target-validation) define evidence for graph, geometry,
image and loading cutovers. [Image candidates](image-assets.md#remaining-technical-gates) retain their
separate quality/format gates. Target changes preserve the unchanged mechanics reference.
