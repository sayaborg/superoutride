# Core architecture and rendering contract

This document owns coordinates, geometry, projection, metric scale and layer boundaries. Implemented
contracts are described below; [Course Editor targets](#course-editor-target) identify remaining
qualification. [Image assets](image-assets.md) owns image formats and compilation,
[content and gameplay](content-and-gameplay.md) owns course transactions and authoring semantics.

## Coordinates and open geometry

Core owns shared 2D/3D vector arithmetic. Vec2 and Vec3 are readonly value contracts; authoring
replaces values instead of mutating coordinate observations. Hot Guide/Raster readers require explicit caller-owned outputs and numerical workspaces; borrowed
results remain valid until that caller reuses them. Callers needing independent observations supply
separate outputs. Sampling and projection never allocate omitted workspaces or attach scratch to
compiled curves. Per-actor physics/progress and per-renderer terrain workspaces own mutable
scratch; the static compiled graph contains no actor, lock or session state. Private numeric buffers
avoid intermediate allocation while public observations retain ordinary named fields.

World X/Y/Z is authoritative. +Y is up, yaw 0 faces +Z; positive yaw rotates toward +X. Positive
lateral `l` is right. For heading psi:

```text
t = (sin psi, cos psi)      n = (cos psi, -sin psi)
```

Course `(s,l)` is a derived observation. `s` is the shared plan chainage of Raster and Guide, distinct
from physical travel along a sloping/offset path. Local projection uses a known previous segment and
a finite clipped neighborhood. Known spawn/recovery coordinates seed that same search. Invalid seeds
fail explicitly, preserving the identity of overlapping circuit copies. Optional explicit lateral
clamping acts in the underlying Guide basis before subtracting a frame's lateral origin. Ordinary
physical projection remains unclamped.

Driving consumers accept an ordinary `GuideCoordinateReader`: a finite logical domain, point/metric
sampling and seeded local projection. Existing `GuidePath`/constant-origin inputs retain their exact
arithmetic through the same operations. Source-array inspection and explicit global projection remain
source-authoring capabilities, not bounded-reader fallbacks. Core owns curvature, ruler metric and
offset metric; physics consumes these geometric observations without opening Guide segment arrays.
Terrain/rendering consume the narrower `RasterGeometry` facet (finite length, segment stations/headings
and point mapping), not Guide fillets or the compiled course graph.

RasterPath, GuidePath, HeightProfile, VisualProfile, SurfaceMap and saved paint have the
finite domain `[0,L]`. Their source readers share 1e-9 m endpoint normalization through
`openProfileChainage`, including SurfaceMap. Raster/Guide geometric
sampling retains its separate 1e-8 m tolerance. Constructors reject nonfinite authoring before endpoint
normalization and own immutable copies. Tolerances affect sampling, not topology or awarded progress.

Consecutive authored vertices form the path. At endpoints the adjacent segment supplies the basis;
interior vertices alone own turns and fillets. Terrain visibility clips to the finite domain. Content
provides run-in/runout for camera, drawing and handoff. Occurrence views compose finite source spans. Topology remains above Core.

## Numerical norm convention

Core's `hypot2`/`hypot3` own fixed-arity distance and speed norms in the physics/gameplay hot path.
They retain the supported Node runtime's bit-exact `Math.hypot` oracle. Compilation, authored ruler
construction and offline diagnostics use `Math.hypot`; frozen camera/audio algorithms retain their
existing arithmetic. Numerical owner changes require exact regression evidence, not a blanket
replacement. The envelope driver uses `hypot2` for planar speed and distance.

## Numerical threshold ownership

[Core tolerances](../src/core/tolerances.ts) owns shared source endpoints, geometric sampling,
lateral-boundary precision, pixel-edge precision and texel-spacing precision. Units and purpose
identify a threshold; equal numeric values do not make thresholds interchangeable.

Algorithm-local cutoffs remain named at their owners: [Raster](../src/core/raster-path.ts) for segment,
miter and turn bounds; [Guide](../src/core/guide-curve.ts) for arc-center, compilation and zero-turn
checks; [terrain](../src/terrain/terrain-line.ts) for depth/span inversion and thin-row collapse;
saved paint for source-lattice ownership.

Gate direction/width, route arbitration fractions, progress/ranking time, wheel torque residuals,
contact/steering determinants, camera response, recovery penetration and UI grid matching retain their
own dimensional domains. Source normalization, exact event ordering and numerical solver termination
are different contracts. Their current values remain in the corresponding source modules.

## Raster and Guide

Raster is a polyline with `|Delta heading| <= 10 degrees` at every interior vertex. Left/right road
and ground widths are independent. Edge continuity uses the exact miter basis; the constant-width
miter ratio is `1/cos(Delta/2)`. Validate actual mapped road/ground bands for finite joins, local
inversion and unintended intersections/overlaps within the consumer's admitted window.
Width-versus-radius heuristics are insufficient. A reusable Section is a road chart, not a globally
injective XZ map; distinct chainages may cross geographically without being the same road address.

Current compilation covers finite vertices/miters, the turn limit, Guide metrics, fillet overlap and
supported envelopes. The offline [local-window proof](content-and-gameplay.md#consumer-local-geometry-qualification)
checks mapped Raster Bands and Guide envelopes. Source compilation and actual consumer/multi-occurrence
qualification are separate contracts. Occurrence, local seed and height distinguish passages;
world-nearest matching cannot replace those authorities.

At a roundoff-size fillet join, lookup retains the adjacent segment. Omitted intervals and compiled
coverage fit the reader's sampling tolerance even if dimensional validation permits a larger error.
A positive straight longer than the sampling tolerance remains a real primitive.

CourseDocument Boundaries and Bands supply varying geometry and support. Terrain enumerates Raster,
height and visual-profile boundaries; it projects the finite ground strip. Paint owns visible road edges.

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
Physical readers expose support bounds. Course Band geometry derives the local Guide envelope from
its actual active supported intervals, with an explicit margin. Contact projection uses that envelope;
source-owned view admission checks the intervals consumed by the product scene.

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

The current resident RGB555 reader supplies completed prefiltered ground. Outside its finite half-open
paint strip, the environment GroundBase selects an opaque fill or transparency. Appearance is separate
from physical support/friction. Transparent ground retains BG below as well as above its horizon.
[Image assets](image-assets.md#resident-ground) owns this shipped recipe and its source composition.

The [single infinite BG](image-assets.md#infinite-tiled-background) uses authored tile patterns and
palettes. [Drawing](../src/visual/tile-background.ts) follows the existing camera horizon and transforms
its yaw origin with the camera frame. There is no finite-distance background or runtime art generation.

The shared 2.5–200 m ground/sprite render interval and fork lookahead remain unchanged; when enclosing
structures extend beyond it, make distance a course attribute, never a per-material setting that can
leave structures floating beyond their road.

### Colored ground runtime target

This is a gated offline trial, not the current resident reader. Its authored Band contract belongs to
[Content](content-and-gameplay.md#colored-ground-authoring-target); budgets belong to
[Development](development.md#colored-ground-trial-budgets). No physical classification or force changes.

Compile the ordered Band list, not a per-pixel Band loop. For near rows, split chainage at activations,
boundary knots and crossings required to resolve affine edge order. Resolve later-over-earlier paint
into nonoverlapping affine lateral intervals, including transparency and open outer sides, then intern
equal interval lists. A row spanning a slab boundary splits only there and combines lengths. Project
interval endpoints at both row-footprint ends; fill common interior spans directly and integrate only
pixels swept by an edge with clipped affine integrals. Work is screen width plus resolved edge work,
not screen width times overlapping Bands.

For far rows, compile one-dimensional, box-filtered row rasters. Longitudinal buckets begin at 1.6 m
and double until the observed maximum render footprint is covered. At width w, lateral sampling is
`d/f` with `d=sqrt(w*f*h)` for the current camera calibration. Store RGB555 and 8-bit opaque coverage,
not exact subpixel interval arrangements. Normalize lateral u between the exact outer road edges;
this removes road-width changes from the average. At runtime, restore those edges at the exact station.
Rows are interned, with a Uint32 bucket-to-row directory per level. Open-side tails retain their declared
color/transparency rather than a GroundBase fallback.

Use [common log-footprint and linear color rules](image-assets.md#common-prefilter-rules). Interpolate
adjacent bucket centers, adjacent levels, and lateral samples without bucket/level steps. Interpolation
weights opaque color by coverage, then applies the common threshold and normalizes only opaque color;
there is no framebuffer intermediate alpha. Entirely transparent rows skip ground processing.

Footprints below 1.6 m use slabs; larger footprints use row rasters. Causal tests must bound the switch,
moving open edges and Section ownership transitions below one destination pixel, including adversarial
moving edges. Exact ordered rectangle integration remains the compile/test oracle, never a runtime
fallback. The trial must cover the entire ground plane, ownership-clipped Section spans, arrows and
transparent cliffs, and must beat or equal the resident timing/allocation baselines in every mode before
this target can replace the resident implementation.

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

Course sprites may also arrive through an ordinary camera/depth observation reader. It owns frozen
camera, position and projection metadata and borrows decoded image workspaces read-only. A pure upright
basis/ruler change transforms world positions, camera yaw and chainage while retaining the exact screen
projection and depth observations. Reprojecting a mathematically unchanged observation can change a
nearest texel through roundoff. A changed physical camera or depth interval rejects the stale reader;
normal motion creates a new observation. This cache primitive is not an actor-transition certificate.
The existing sprite-array path retains its arithmetic.

### Sprite LOD metric and read contract

The lattice is top-left aligned and untrimmed. Master W by H gives level k storage
`ceil(W/2^k)` by `ceil(H/2^k)` with nominal master-axis step `2^k`. A partial final cell is clipped
by the original logical frame. Shrinking continues on the longer axis when the other is already one;
a finite contiguous prefix is legal, through `ceil(log2(max(W,H)))` at most.

The anchor `(aX,aY)` stays in master texel-center coordinates. Level k derives each coordinate as
`((a+0.5)/2^k - 0.5)`. Default anchors are `((W-1)/2,H-1)`; fractional/outside-frame anchors are valid.
Every level represents `worldWidth` by `worldWidth*H/W` meters. Storage or opaque bounds do not
redefine physical dimensions.

Select one level using the [common footprint exponent](image-assets.md#common-prefilter-rules), with
master footprint `rho=1/g` and geometric-mean boundaries; exact boundary equality selects the coarser level.
Projection keeps continuous display extent/anchor. Pixel rasterization and image color/coverage can
still step; there is no crossfade. [Image interchange](image-assets.md#completed-sprite-images) owns
the exact reader schema and palettes. All shipped sprites receive full direct-master LOD at build time; runtime never creates a missing level.

## Layer and computation rules

Core owns Raster/Guide, height and finite source operations. Course owns shared boundary geometry.
Graphics owns framebuffer, color codec, blitting and Painter primitives. Visual owns assets and
visual profiles; Terrain projects geometric bounds; Render assembles the pipeline. Groundmap owns offline source composition, completed-image compilation and resident readers. Physics owns support/material interpretation and
Guide containment. The vehicle catalog owns presentation-family metadata.

Audio owns procedural sound and read contracts; vehicle binds acoustic profiles and browser adapts
physical observations. Audio imports Core; physics stays independent of audio. The root loads course JSON, source images and completed ground before publishing the scene.

The [hygiene graph](../tests/infrastructure/repository-hygiene.test.mjs) enforces acyclic directory
imports, including types. Product roots load saved content; fixtures and diagnostics remain test/tool inputs. Runtime supplies
ordinary narrow readers to physics, camera and rendering; compilers own static preparation.
Course topology and product choices belong in composition/gameplay, not pixel loops or mechanics.
The compiled course graph is an upper-level owner; its lower-level reader facets preserve this graph.
The implemented [document/compiler boundary](content-and-gameplay.md#coursedocument-v10-implemented-compiler-boundary)
uses `src/compiler/compiled-course.ts` over Course-owned documents/geometry and existing Core readers.
Compiler owns the immutable reference graph, Ports/Links and static content qualification; Authoring
owns the live project transaction, and Runtime owns mutable traversal/view composition. Compiler resolves
Physics-owned material records once; concrete Section/Port/Link types bind those records. The narrow Course physical-profile primitive remains reusable.
Compiler also admits saved image sources through Graphics' existing sprite validator, resolving assets
to concrete immutable indexed-source records. Image admission uses the Graphics validator; lower Course geometry still has no image dependency.
Presentation compilation uses the Graphics source metric and Visual's ordinary immutable data
facets. Compiler binds Groundmap products to canonical Section references once; Groundmap consumes
ordinary source facets without importing the graph. Appearance, outside GroundBase, scenery identity and physical support remain distinct.
Runtime may consume Camera's profile contract to derive consumer coverage; Camera remains independent
of Runtime and the course graph.
Explicit height uses Core HeightProfile. Compiler cannot import Runtime, Authoring, vehicle, renderer,
gameplay implementations. Parsed dependency checks enforce these limits.
The narrow Band surface adapter consumes only
partition/bindings, not the course graph. Separate all-Link physical qualification does not certify
presentation or product-consumer coverage. Root admission binds the product's contact/step domains and
composed consumer readers separately from source compilation.
Core's shared content digest serves course
and saved image identities without a dependency from authoring geometry to image transport.

## Compiled profile and asset boundaries

Surface, visual and height profiles own ordered immutable inputs and binary lookup.
SurfaceMap validates physical bands. Terrain merges explicit change points into adjacent positive
intervals, eliminating exact duplicates while retaining distinct authored intervals. Traversal uses
those intervals directly, without cursor nudges.

Sprite construction checks dimensions, buffers, finite anchors and positive physical width. Compiled
products retain owned immutable metadata and explicit buffer ownership. Reachability from a product
root or declared compiler identifies use; tests/tools separately consume diagnostics and fixtures.
Painter, metric, gate and coordinate regressions remain executable. Build cost, steady-state draw
cost and instrumentation cost are measured separately.

## Ground authoring boundaries

Compiled Boundary/Band geometry, physical material bindings, saved paint and environment GroundBase
have distinct authority. The offline source-paint reader evaluates canonical references; the
renderer consumes only a synchronous resident color reader and finite strip dimensions. Browser scenes
and headless previews use the same completed-ground assembly. Missing physical support is VOID regardless of paint.

## Course frames and compiled geometry

Compiled Boundaries, Port/Link transforms and bounded occurrence readers are implemented. The shared
scene consumes occurrence driving readers and commits frame changes through the runtime transaction.
[Content](content-and-gameplay.md) owns authored records and transactions;
[image assets](image-assets.md) owns image products. Source qualification and consumer admission have
separate scopes.

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
readers in its active frame. Its derived `activeRange` retains the active-source ruler alongside the
zero-based inspection window. The common occurrence driving adapter shares canonical source sampling and encodes native projection
indices with occurrence ordinals. Moving a window changes neither actor observations nor frame.
It checks complete seeded-search candidate intervals and delegates height interpolation to the
original source rather than resmoothing clipped nodes. Only bounded Raster/height metadata is
retained; geometry is not retessellated. The
[occurrence driving adapter](content-and-gameplay.md#occurrence-driving-and-actor-commit) supplies
qualified source spans, stable occurrence/native-segment seeds and saved presentation through the same mapping.
Its search distinguishes ownership seams from incomplete window candidates. Runtime pose/consumer
admission and multi-neighbor geometry have separate qualification requirements. Window addresses are not race credit.

Render's source-presentation preview owns image decoding, color conversion and reusable image workspaces.
It receives ordinary saved presentation, Raster and height facets. Runtime maps its narrow results;
neither the renderer nor the preview receives a CompiledCourse or occurrence graph.

### Compiled boundary geometry

[Authored boundaries](content-and-gameplay.md#cross-section-and-variable-width-authoring) compile into
immutable piecewise-linear readers on the one Raster s ruler. Width/center are derived. Constant and
varying widths share one representation. Partition at Raster heading, render-height and relevant
boundary knots/activation changes. Use the existing Raster/miter or Guide mapping at the responsible
consumer. Validate mapped-band interiors as well as endpoints. Paint changes alone do not split shape.

The offline compiler partitions active Bands and proves closed-cell non-inversion before publication.
Nonadjacent separation belongs to explicitly bounded consumer-window qualification, not whole-Section admission.
It exposes one narrow finite `bandPartition` facet with canonical Band references; its construction
cells are private. [Content](content-and-gameplay.md#supported-geometry-and-recipe) owns the current
activation, transition-continuity and terminal-membership rules. They do not change the current
driving readers' finite-endpoint or lateral classification contracts.

Terrain consumes and projects the compiled view's bounds once and exposes source-to-span mapping to
the final-color reader. A visible marking is paint, not another geometric road-edge authority.

### Local Guide envelope qualification

The Core profile, full-fillet validation, query clamping and conservative support containment are
implemented and covered by [local-envelope tests](../tests/geometry/local-guide-envelope.test.mjs).
The CourseDocument compiler derives varying profiles; consumer admission checks contact extents and
Link-transformed views independently of source compilation.

The [Guide envelope](#raster-and-guide) encloses supported bands and admitted contact/projection
queries plus an explicit positive chart margin. Resolve source origins and Link transforms before
computing that bound; visual ground extent is independent. Validate each complete fillet interval,
including its trim extent, at all relevant knots and interior extrema; sampling only the corner station
is insufficient. A fallback corner uses a conservative bound over its adjacent finite Raster intervals
before construction, followed by the complete-interval check.

The envelope is domain metadata, not a force, a new centerline or a lateral clamp. Each reader uses
the bound at its actual query chainage. Invalid inputs/queries remain explicit; ordinary excursion and
recovery policy handles vehicle motion. A wide straight fork therefore need not impose its width on a
distant tight bend, while a wide locally tight bend can still be rejected. For piecewise-linear L(s),
the complete interval's extrema are its clipped endpoints and interior knots. Existing constant-input
geometry and ordinary unclamped projection retain their numerical behavior.

### Lateral boundary ownership

Point classification uses half-open lateral regions `[left(s), right(s))`, with shared boundaries
resolved from the same compiled Boundary object. At a shared edge the region on its right owns the
point. The outer left edge is included; the outer right edge is outside. Gaps/outside resolve to the
consumer's declared outside result: physical VOID, visual GroundBase, or no eligible lock region.

The same rule covers pavement, shoulder, median and lock-zone membership. Geometric validation uses
closed bounds to prove containment; image filters integrate their clipped area. Neither changes point
ownership. A zero-width birth/death endpoint owns no area. Existing finite-chainage endpoint sampling
and the oriented gate's forward/reverse plane-crossing rule remain separate contracts.

Numerical tolerances validate geometric agreement and source endpoints. They do not enlarge adjacent
classification intervals or choose between two owners. A median-center lock tie belongs to the
right-hand zone. Source classification, support and gate membership require below/at/above-edge coverage.

## Course Editor target

Source-camera/variant sampling and real-art filter acceptance remain open.
[Image acceptance](image-assets.md#remaining-technical-gates),
[test design](test-design.md#course-editor-acceptance-additions) and
[development](development.md#course-editor-target-validation) define the outstanding quality and
consumer evidence. [NEXT](NEXT.md#milestones) orders the remaining playable content gates.
Target changes preserve the unchanged mechanics reference.
