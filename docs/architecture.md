# Architecture and rendering

This document owns coordinate and geometry contracts, projection, camera metric, rendering and layers.
[Content and gameplay](content-and-gameplay.md) owns course data and game rules;
[Image assets](image-assets.md) owns image formats and compilation.

## Admission boundary

Course documents and assets are checked when read and compiled; delivered manifests, vehicle
envelopes, time budgets and external Session selections are checked at their intake. Cross-object
Session admission relates the requested settings, course and vehicle before actors exist.
Inside those boundaries, course/race constructors, readers and updates trust admitted data and
internal arguments: they do not repeat shape/domain checks or retain impossible failure branches.
Outside-route sampling and live gameplay decisions remain ordinary behavior. Vehicle-domain
failure propagation belongs to the vehicle layer, not course/race input validation.

## Coordinates and readers

World X/Y/Z is authoritative: +Y is up, yaw zero faces +Z and positive yaw turns toward +X.
Positive lateral `l` points right. For heading `psi`, the planar tangent and right normal are:

```text
t = (sin(psi), cos(psi))
n = (cos(psi), -sin(psi))
```

A Section is authored as PI coordinates and radii. Its native coordinates are the authored PI
coordinates, without origin or orientation normalization. The entry Section's native frame is the
world frame. The plan starts at the first PI, with heading `atan2(dx,dz)` of the first edge.
The derived straight/circular plan is the planar authority; derived arc turns are stored in radians. `s` is true arc length
along that centerline and positive `l` is distance along its right normal. With centerline `C(s)`,
normal `N(s)` and signed curvature `kappa`, planar coordinates are `C(s) + l*N(s)`; physical
distance along an offset or sloping path is different.

The shared `CourseRoute` builds an ordered sequence of `RouteOccurrence` records. Its entry starts at
route s=0, lateral origin=0 and an identity world transform. Each successor begins at the previous
Section's end: its Section chainage begins at zero, its lateral origin accumulates the cut
offset and its world transform composes the Link transform. Thus a repeated circuit Section has a new
route interval without changing earlier route coordinates. A seam station belongs to the successor.
`routeSectionS` and `routeS` own the chainage conversion; readers select an occurrence by binary
search, read the Section, subtract the lateral origin and map X/Z and heading into route world space.
The preparation layer supplies plan, authoritative height, ground-row height polyline, material,
Strip, sprites, visual labels and background readers. It indexes visual lists only when route
occurrences change. All actors, physics, race, rendering and reference driving read these
single-layer Readers directly and retain their state in route coordinates. The same reader set
supplies the authoritative coordinates to physics and rendering.

Outside the retained Route, the Readers use the following values. Here `P`, `T` and `N` are
its endpoint position at route l=0, unit tangent and right normal, and `e` is that endpoint's s.

| Reader                     | Outside value                                                                   |
| -------------------------- | ------------------------------------------------------------------------------- |
| Plan                       | `P + (s-e) T + l N`, endpoint heading, curvature 0 and J=1                      |
| Projection                 | Project onto the endpoint tangent ray; return its s and l with `inDomain:false` |
| Height and render polyline | Respective endpoint height, derivative/grade 0                                  |
| Coordinate domain          | Empty closed interval `[+Infinity,-Infinity]`, defined by `EMPTY_ROUTE_DOMAIN`  |
| Material                   | VOID, also outside the lateral coordinate domain                                |
| Strip and sprites          | No content; Strip pixels are transparent                                        |
| Environment/background     | Nearest endpoint value                                                          |

The tangent rays participate in the same previous-s ±50 m projection window as the retained
segments. In-domain feet take precedence; otherwise the candidate nearest the previous s wins. Neither a
world-origin placeholder nor a previous-s/l=0 fallback is used. These outside values do not
create a supporting surface. Contact and recovery rules are owned by
[Vehicle physics](vehicle-physics.md#surface-and-contact).

`createRouteRuntime` owns one Route and one reader set for the entire field. No actor creates a
coordinate wrapper. Fork choice calls `route.append(link)` once; the ordinary refresh extends any
unambiguous successors and updates the closed-carriageway list. Route change metrics count refreshes
that observe a changed occurrence list and time extension, pruning and closure-list preparation.

The scene supplies loading coverage from camera dimensions, the fixed simulation period and the
catalog's compiled contact stations. Forward coverage is
`max(dCam + far, driver lookahead, projection window) + maximumStepMeters`: currently
`max(dCam + 200, 480, 50) + 240 * (1/60) = 484 m`. The 240 m/s (864 km/h) coverage speed is a
conservative loading budget above the production fleet's operating speeds; it does not clamp physics.
Rear coverage is `max(dCam + near, recovery backtrack + projection window + contactReachMeters)

- maximumStepMeters`: currently `max(dCam + 2.5, 8 + 50 + 2) + 4 = 64 m`.
Contact reach is the ceiling of the largest `hypot(forwardOffset, freeReachDown)` across the catalog's
  front/rear contact stations, so pitching or yawing a vehicle cannot enlarge that local reach.
  The step allowance retains the rear footprint until the next refresh. At an undecided fork the parent
  Section covers the lock plus the render/driver lookahead and step allowance.
  Pruning never changes existing stations or vehicle poses. A single-successor circuit repeats its
  ordered cycle of Sections for successive laps. Derived projection intervals, height knots, Strip
  intervals, sprite lists and environment boundaries rebuild only when the occurrence list changes.

`PlanCoordinateReader` is the planar query interface for both a compiled Section and its mapped
occurrences. `CompiledSection.coordinates` and `VehicleWorld.coordinates` expose this same type:

- `CourseRoute.start/end` are the single retained route extent. The world composition references that
  same object as `extent`; terrain and driver composition receive it explicitly. Route Readers publish
  no duplicate length or station range. A compiled Section retains its native domain.
- `domain.lateralAt(s,out)` gives the
  closed asymmetric `[left,right]` bounds. An occurrence subtracts its mapped lateral origin from both
  edges. Coordinate bounds do not define material support.
- `toWorld(s,l,out)` reads world X/Z and heading. `metricsAt(s,l,out)` reads `kappa`
  and offset metric `J = 1-kappa*l`. Both are determined by `(s,l)`;
  at a segment boundary the successor owns the station. Native and mapped readers use their own frame.
- `locateLocal(world,previousS,out,workspace)` searches only segment intervals intersecting
  `[previousS-50 m,previousS+50 m]`. A perpendicular foot inside its interval and the closed
  lateral domain wins over a closer centerline foot outside the domain. No endpoint-clamped point
  counts as an inside-domain foot. If none qualifies, the candidate with the smallest absolute change from previous s is returned with
  `inDomain:false`, without lateral clamping or a global search. The two endpoint tangent rays complete the route ruler
  when the window extends beyond retained occurrences.

Outside the domain, both segment feet clamped to the searched interval and endpoint-ray feet
participate in the previous-s comparison. Exact ties retain candidate order (segments first, then
entry and exit rays). In-domain selection retains occurrence ownership and centerline-distance precedence.
This follows a continuous local candidate while it remains preferred, instead of switching branches
merely because centerline distances cross. Endpoint clamping can hold s at a boundary while world
position continues moving. Global continuity is not guaranteed outside the injective domain: a path
through an arc center has no unique foot; angular branch changes, ties between distinct equally near
chainages, or the appearance of an in-domain solution on another branch can still change s discontinuously.
The finite search window also assumes successive observations remain on the local passage. These
singular/ambiguous cases are not resolved by a velocity or coordinate clamp.

`PlanCoordinateSample` and `PlanCoordinateProjection` are borrowed observations in caller-owned outputs.
`PlanProjectionWorkspace` holds reusable numerical scratch, separate from vehicle state.
`SectionPlanCoordinateReader` adds `projectionCandidates(start,end)` for mapped composition.
The requested interval lies inside the Section domain. Candidate queries return station-ordered
segment intervals; each candidate projects a bounded subinterval and reports whether its foot
was inside that subinterval before endpoint clamping. Geometry construction and its geometric
proofs inspect compiled segments.
Terrain reads the same `PlanCoordinateReader` as physics; the Route owns the extent.
`forwardEnd(start,end,yaw)` returns the first non-forward-facing tangent station, or the interval end.

Vec2/Vec3 are readonly values. Sampling APIs with caller-owned outputs return borrowed observations
valid until those outputs are reused. Compiled sources are immutable; actors and consumers own live state.
Plan, Profile, EnvironmentTimeline and ground appearance have finite domain `[0,L]`.
Station-sequence endpoints normalize within their admission budget; plan sampling has a separate geometric budget. Nonfinite source values fail.
At a segment boundary, the successor owns the interior station; the terminal endpoint uses
the final segment.

## Cycle closure

Topology admission first forbids self Links and checks reachability; DFS detects cycles and outgoing
Link counts detect branches. The derived kind admits only an acyclic
LINEAR/BRANCH graph or one unbranched CIRCUIT cycle of at least two Sections. In the latter case,
one incoming and one outgoing Link per Section plus reachability proves there is exactly one cycle.
The compiler follows that cycle from entry once and composes `destinationFromSource` transforms in
traversal order. Acyclic merges are never compared for a common world embedding.

For an accumulated transform `(R,t)` followed by a Link, the positional error budget increases by
`edgeToleranceMeters + 2*sin(headingToleranceRadians/2)*|t|`; the chord term accounts for rotating
the accumulated translation with the next Link's angular uncertainty. The angular budget increases
by `headingToleranceRadians` per Link. These constants belong to `COURSE_LINK_RECIPE`: 1e-7 m
translation and 1e-10 rad heading per Link. The latter is a wrapped-heading/composition roundoff
allowance (at most 0.1 mm at a 1,000,000 m lever arm), not a driving allowance.
The final translation norm and absolute wrapped angle `atan2(sine,cosine)` must be within those
accumulated budgets. No correction is applied to authored geometry or Link transforms.

With V Sections and E Links, topology admission uses O(V+E) time and O(V) visited/active storage;
the closure pass uses O(V) time and O(1) additional storage. It does not enumerate cycle combinations.
This bound holds at the admitted 128 Sections / 384 Links. Graphs with branching cycles are rejected
by topology admission; broadening that admitted topology requires revisiting the closure proof.

## Route cross sections

`createRouteCrossSections` maps each occurrence's checkpoints, finish and fork lock to fixed route
stations with `routeS`. Its ordered lists and closed lateral bounds rebuild only when the Route's
occurrence list changes. Bounds come from the coordinate-domain Reader at the line station, with
successor ownership at a seam. A race line retains the canonical landmark identity for time budgets
and its finish-count lap number; line identity is independent of its index in a pruned list.
For a circuit, a forward cursor follows the admitted single-successor sequence from entry and increments
the lap only after a Section's FINISH. It advances through skipped/pruned occurrences as needed and caches
lap numbers weakly by retained occurrence identity. Chainage additions follow the same order as the Route;
no division by lap length or occurrence ordinal supplies lap numbers.

The crossing calculation works entirely in `(s,l)`: forward arrival brackets the line's s, and
linear interpolation supplies both the within-step fraction and the crossing l. A constant-s line
is the normal cross section of the authoritative plan. There is no Section-world pose conversion or
world-segment intersection in progress or fork selection. Gameplay orders and consumes these
crossings as specified in [Content and gameplay](content-and-gameplay.md#route-cross-sections-and-progress).

## Numerical conventions

Euclidean norms use `Math.hypot`. Nonfinite inputs and extreme magnitudes follow the
runtime's standard `Math.hypot` behavior.

Each numerical tolerance is a named constant owned by its calculation's module. Its definition
states the unit, the absorbed error or conditioning limit, and a quantitative budget or scale estimate.
A shared calculation has one shared constant; equal numeric values with different units or purposes
do not imply shared ownership. Fixed absolute budgets are not universal error bounds for arbitrary
magnitudes. Solver residuals and model/response regularization are distinguished from roundoff.
A sampling tolerance changes neither point ownership nor earned progress.

## Plan authority

The ordered PI sequence defines tangent edges and circular fillets. At an interior PI with
signed deflection `delta` and radius `R`, each tangent setback is `R*tan(abs(delta)/2)`.
Compilation checks endpoint radii, distinct neighbors, interior deflections and tangent nonoverlap,
then emits the remaining straight parts and circular arcs in station order. A tangent remainder
within the plan-position budget (1e-8 m) is treated as zero when an incident arc is present;
this absorbs coordinate and trigonometric roundoff at touching arcs. Zero-length lines are omitted.
PI conversion runs only during compilation. Derived segments have no authored record or ID;
they retain internal geometry, exact s interval, starting pose and signed curvature.
A straight has `kappa=0`. An arc has `kappa=sign(delta)/R` and length `R*abs(delta)`.
The temporary PI station table resolves positions, including Session landmarks, and is discarded
before publication. Compilation preserves the authored native frame without translation, rotation or scaling.
Section projection onto a straight or circular arc uses closed-form geometry.
The projection window `W = 50 m` is measured in chainage in both native and mapped Readers.
At the fixed frame step and twelve vehicle substeps, longitudinal travel is a few metres even at
the provisional vehicles' highest speeds. Fifty metres also covers front/rear contact offsets
and amplified chainage motion near a small positive `J`; grade-separated passages must be
authored more than 50 m apart on the route ruler so their other passage stays outside the window.
The projection result's `inDomain` reports geometric membership; physics and recovery consume it
as specified in [Vehicle physics](vehicle-physics.md#surface-and-contact).

At each s, the Section lateral domain runs from the material table's leftmost finite covered edge minus
`PLAN_COORDINATE_MARGIN_METERS` to its rightmost finite covered edge plus that margin; the margin is 4 m.
Explicit VOID material still contributes its authored extent; the uncovered exterior does not.
The domain uses the material slab's half-open station ownership, including the Section terminal.
It retains the outer span references and reads them by binary slab lookup, without scanning authored Strips.
The map from `(s,l)` in the entire closed Section coordinate domain to world XZ is injective:
different coordinate pairs occupy different points. The local part of this condition is
`J = 1-kappa*l > 0` throughout the domain. Compilation checks every circular segment at
incident domain stations and checks separated longitudinal cells against one another using
conservative plan envelopes. `plan_coordinate_inversion` reports a local metric failure;
`plan_coordinate_overlap` reports the Section and two overlapping s intervals. An overpass
uses separate Sections for its two passages.

Rendering reads the authoritative plan directly. Each ground row maps `l=-1` and `l=+1` through
its coordinate Reader; these two points define the affine lateral mapping for the entire row.
Row boundaries contain only vertical-polyline vertices and environment boundaries, not plan vertices.
Visibility ends at the first station where `abs(wrap(heading-cameraYaw)) >= pi/2`.
On a straight the heading is constant. Within an arc, heading changes linearly with chainage;
from a forward-facing station `a`, the first limiting station is
`a + (sign(kappa)*pi/2 - wrap(heading(a)-cameraYaw))/kappa` when it lies in the arc.
The Route queries successive Sections with the camera yaw rotated into each native frame.
Occurrence rotation is computed once when the occurrence is appended.
Occurrences and height identify passages through compiled Sections; previous s keeps projection
on the local passage.

## Boundary geometry and point ownership

Compiled Boundaries remain piecewise linear on the authoritative s ruler. Their vertices come
from their own knot stations and, within each knot interval, both endpoint references' Boundary
vertices, including inherited ones. Compilation evaluates and blends the endpoint Lateral
expressions at those stations as specified in [Content and gameplay](content-and-gameplay.md#lateral-positions).
The published resolved l sequence is the only input to `courseBoundaryAt` and its consumers.
Width and center are derived from
their edges. Strip compilation resolves Lateral edges with the Boundary interval resolver,
then sends each non-null payload to the shared slab resolver. Paint-only changes do not divide
material geometry. A piece stores each finite edge as one affine line, with no duplicate endpoint
coordinates. Boundary-derived lines retain their original interval and endpoint arithmetic when
split; their offsets are added after interpolation. Numeric color lines retain slab-local interpolation.
This preserves Boundary ties without altering unrelated numeric color arithmetic.

The compilation check divides the authoritative straight and circular plan at segment ends,
domain knots and at most five degrees per arc cell. Adjacent cells share their endpoint and are
locally covered by the positive Jacobian; separated cells must have disjoint conservative
envelopes. A chord envelope is padded by `max|F''| * deltaS² / 8` for each linearly varying
lateral edge, bounding the exact curve between its endpoints. The envelope comparison uses
the plan-position roundoff budget for floating-point separation near shared
coordinates; this tolerance does not replace the curvature bound. These cells belong only to coordinate-domain validation.

Point intervals are half-open laterally: `[left(s),right(s))`. A shared edge belongs to the interval on
its right; the outer left edge is included and the outer right edge is outside. Zero-width endpoints
own no area. Gaps use the consumer's outside result: physical VOID or no eligible lock interval.
Visual Strips do not require material coverage and can cover the entire lateral plane. Closed bounds used for geometric containment and clipped areas used by image
filters do not change point ownership.

## Height and projection

Ground height is `Y(s,l)=Y(s)`. Authored Profile Knots are PVIs `(sᵢ,yᵢ,Lᵢ)`.
Between PVIs, tangent grade is `gᵢ=(yᵢ₊₁-yᵢ)/(sᵢ₊₁-sᵢ)`. For a nonzero
curve of length `Lᵢ`, let `x=s-(sᵢ-Lᵢ/2)`, `g₋=gᵢ₋₁`, and `g₊=gᵢ`.
The authoritative parabola is `Y=yᵢ-g₋Lᵢ/2+g₋x+(g₊-g₋)x²/(2Lᵢ)` and
`dY/ds=g₋+(g₊-g₋)x/Lᵢ`. Between curve tangencies,
`Y=yᵢ+gᵢ(s-sᵢ)` and `dY/ds=gᵢ`. A zero-length curve is a grade corner
at its PVI. Endpoint curves have zero length; adjacent curves do not overlap.

`ProfileReader` supplies authoritative Y and dY/ds to physics, vehicles, camera and course sprites.
Vehicles retain their physical XZ and render anchor Y; course sprites use the plan mapping and
`Y(s)+groundOffset`. The physical camera is passed directly to projection.
`ProfilePolylineReader` is used only to generate ground rows, as an internal height approximation.
Its vertices include curve tangencies and zero-length PVIs. Each parabola is divided into
`ceil(L/2 m)` equal intervals (at most 2 m), sampled from the authoritative profile.

For a parabola with grade change `deltaG`, length `L` and polyline interval `h`, the exact
maximum height difference is `abs(deltaG)*h*h/(8*L)`, attained at each interval midpoint.
Straight intervals have zero error. Thus the 2 m interval bound gives `abs(deltaG)/(2*L)` metres;
there is no universal millimetre bound without bounds on grade change and curve length.
Across the current saved courses the maximum is **0.0004495981255 m (0.449598 mm)** in RIBBON COAST;
RIBBON FORK and RIBBON RING have zero error. Other objects retain authoritative height and are
not shifted to the ground-row approximation.

```text
d = s_object-s_camera                    d > 0
xr = (X-Xcam)*cos(psiCam)-(Z-Zcam)*sin(psiCam)
scale = f/d
screenX = cx+scale*xr
screenY = cy-f*sin(phi)-scale*(Y-Ycam)*cos(phi)
horizonY = cy-f*sin(phi)
```

Depth is chainage difference. Equal depth gives equal scale, and equal depth/height gives equal
screen Y. Each terrain station projects to one horizontal line with affine horizontal texture mapping.
Forward visibility depends on road heading and camera direction. Terrain draws far to near, allowing
hills to overdraw earlier rows. A degenerate thin span occupies one row with its complete source footprint.

## Camera and fixed metric

The player reference is 2 m wide, 80 source texels and 80 screen pixels:
`f/D_cam=40 px/m`, `D_cam=f/40`. `f=200 px`, `D_cam=5 m` and near/far depths are 2.5/200 m.
FOV changes preserve this metric. Ground and sprites share this depth interval.

Camera chainage is `s_vehicle-D_cam`; its drawn XZ is the player's route-world XZ minus `D_cam` along
body yaw by default or movement yaw as the alternate. The observer's shell owns the camera rig;
rivals have no camera. Camera vertical state is unchanged across route seams. Horizontal centering follows projection. Vertical follow is bounded and smoothed, body
pitch offsets downward base pitch, and camera roll is zero. Camera values are 12 degrees
base pitch, player anchor row 190, 0.22 s vertical-follow time constant and 4 m correction bound.

## Ground and background

BG is one infinite tiled plane. Yaw and pitch change its view; translation does not.
Its yaw origin uses the shared route frame across every occurrence. The background is selected
at camera chainage `camera.s`; distant sprites and ground rows do not change that selection.
[Image assets](image-assets.md#infinite-tiled-background) owns its format and angular mapping.
Transparent ground makes no ground write, preserving the underlying Painter image, including BG
below the horizon. Physical support is independent of all ground colors.

### Material cross sections

`CompiledSection.material` contains an immutable slab table and its point reader; compiled Sections
retain only resolved tables. Material-bearing Strips produce finite affine pieces; color-only Strips
do not enter this table. Color and material use the same payload-independent Strip slab resolver:
activation and edge-crossing splits, declaration-order overwrite, equal-value span coalescing and
binary slab/span lookup. The generic cell payload `value` is RGB555/transparent for color or a material for physics.
The absent-piece value is separate from explicit material VOID so finite authored extents survive.

Point reads use binary search in s, then binary search in l over ordered spans. Intervals are
`[left,right)` and `[start,end)`; the Section terminal belongs to the last slab. Uncovered cells
read VOID. `sampleInChart` subtracts the origin from edges before comparing l, preserving exact
shifted-boundary ties. Samples are prepared once per material and borrowed without allocations;
`sectionName` reports the material type, including `VOID` outside coverage. Nonfinite queries or
stations outside a finite Section fail; Route readers provide their ordinary outside VOID result.
Gate/grid validation and fork compilation consume the same table. Support-interval construction
is compiler-only; running point reads do not allocate arrays, objects or readers.

### Strip rendering

Compilation expands the [authored constructs](content-and-gameplay.md#strips) to affine Strip
pieces and passes them through the shared material/color slab resolver described above. Resolved spans are disjoint, cover the open lateral plane and coalesce
adjacent equal colors; transparent upper Strips erase lower colors before filtering. The active count
includes hidden declarations, not just the visible resolved spans.

The course compiler averages resolved colors over dyadic s cells starting at one metre.
Each level has `ceil(L/2^n)` cells for Section length `L`; its last cell ends at `L` and
is averaged over its actual length. The top level has one cell spanning the Section.
Lateral fields store premultiplied linear-sRGB channels and coverage as piecewise-linear
functions of fixed source-l coordinates. An edge that moves across an interval becomes a ramp rather
than a relocated hard edge. Equal lateral fields share private coefficient storage and per-level indices.
Resolved records and public metadata are deeply immutable. The compiled product supplies a Reader that copies
base and node coefficients, cell length and active count into view-owned reusable scratch; compiled numeric buffers stay private.
The view layer owns row sampling and display-method selection.

A row uses the terrain projection's representative s and effective depth footprint `deltaS`.
A projected `[-1,+1]` metre ruler supplies the affine screen-to-l map; it does not clip ground.
The product has one complete method, not independently configurable s/l kernels:

| Method      | Longitudinal read                                                | Lateral read at pixel center x and width w |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------ |
| POINT-POINT | Instantaneous resolved Strips at the row's s for every footprint | Value at x                                 |
| LEVEL-POINT | One cached dyadic cell, or instantaneous Strips when `rho < 1`   | Value at x                                 |
| EXACT-BOX   | Exact integral over the row's centered depth interval            | Exact mean over `[x-w/2,x+w/2]`            |

POINT-POINT and LEVEL-POINT use the source owning s and its lateral origin; a seam belongs to its
successor. The instantaneous read follows the ordered resolved slab without preblending or sorting.
LEVEL-POINT uses `rho = deltaS / 1 m` with the [shared image selector](#shared-image-level-selection).
It reads only the containing cell, without cell/level interpolation or mixing neighboring occurrences.
Every level covers the Section through its truncated last cell. The final closed endpoint uses
that last cell.

EXACT-BOX clips the centered depth interval to route occurrence spans, maps their lateral origins
and decomposes the ranges into cached dyadic intervals, including truncated tail cells.
Partial one-metre ends outside a complete cell integrate resolved affine edges directly.
Sub-metre footprints use the same rule; zero-length footprints use the instantaneous slab.
Every cut ends one owned interval and starts the next.
Actual source lengths weight all contributions before coverage or color normalization. This is a
separable source-(s,l) row footprint, not a full perspective pixel polygon. Dyadic decomposition
does not change the mathematical integral.

The exact row workspace composes weighted lateral-field events once; the other methods read their native
lateral field directly. All methods batch constant spans with fills or transparent skips. Only varying
lateral fields and box-boundary pixels need individual evaluation. No pixel loops over authored Strips.

RGB555 decodes through the common linear-sRGB channel table. Contributions stay premultiplied until
final coverage is known. Coverage at least the shared 0.5 threshold is opaque, allowing 64 machine
epsilons of relative row-area roundoff at equality. Opaque RGB divides by opaque area once, encodes
sRGB and rounds to RGB555; transparent pixels leave the existing image unchanged. Hidden colors and
BG do not enter the average. [Browser](browser.md#ground-display-setting) owns live selection and HUD observations.

## Sprites and Painter

Sprites have a logical master frame, physical width, a master texel-center anchor and completed levels.
Magnification is `g=(f/d)*worldWidth/masterWidth`. Course anchors use known chainage and render height;
actors use observed chainage and physical-clearance mapping. Yaw/bank variants are authored images.
Rendering uses nearest sampling, binary alpha and one SINGLE sprite per vehicle; bank is visual.

Painter order is clear when requested, full BG, a far-to-near terrain/world-sprite merge, player, then HUD.
At equal depth terrain draws before sprites. The player is last among world visuals.

Course sprites enter through either a sprite array or a camera/depth observation reader. The reader
contains immutable camera/projection metadata and read-only image workspaces. An upright basis/ruler
change transforms world metadata while preserving its recorded screen projections and depths.
A different physical camera or depth interval rejects that observation. The array path computes its own projections.

### Sprite LOD metric and read contract

Master `W` by `H` has untrimmed, top-left-aligned level `k` storage
`ceil(W/2^k)` by `ceil(H/2^k)` and nominal master step `2^k`. Partial edge cells clip to the logical
frame. A contiguous prefix through `ceil(log2(max(W,H)))` is valid; the longer axis keeps shrinking.

The master anchor `(aX,aY)` maps per axis to `(a+0.5)/2^k-0.5`.
Default anchor is `((W-1)/2,H-1)`; fractional and outside-frame anchors are valid.
Every level represents `worldWidth` by `worldWidth*H/W` metres, independent of opaque/storage bounds.

For master footprint `rho=1/g`, sprites use the shared nearest-octave selector below. Display extent
and anchor remain continuous; texels and palette coverage are discrete. Builds supply full direct-master
LOD for shipped sprites.
[Image assets](image-assets.md#completed-sprite-images) owns the level/mixture encoding.

### Shared image level selection

Image's `selectImageLodLevel(scale, maxLevel)` is the single nearest-octave selection rule used by
both sprites and LEVEL-POINT. `scale = 1/rho`: destination pixels per master texel for sprites, or
`1 m / deltaS` for Strips. It selects the nearest integer `log2(rho)` exponent, clamped to the available
prefix `0..maxLevel`. There is one level per octave. At the geometric-mean boundary
`scale = 2^(-n)/sqrt(2)`, it selects the coarser exponent `n+1`. No interpolation occurs.
Strip's instantaneous sub-metre read is analogous to sprite master magnification, not a cached 1 m cell.

## Course frames

The outgoing Carriageway center at `s=L` and incoming center at `s=0` derive the upright transform `destinationFromSource`. With yaw rotation `R`:

```text
t = pDestination-R*pSource
p' = R*p+t
v' = R*v
inverse rotation = transpose(R)
inverse translation = -transpose(R)*t
```

The transform preserves world up, gravity and metric length. Source and destination height agree
at the cut line, as do their longitudinal grades. `CourseRoute` composes the inverse Link transform
into each successor's fixed world transform. Vehicle state remains in the entry-rooted route world
space across the cut. `RouteOccurrence` carries its own Section identity, route
start, lateral origin and transform, including each repeated circuit lap. The route readers convert
route s to Section s by subtracting the occurrence start, add the lateral origin for the Section query, then transform returned X/Z,
heading and lateral positions into route coordinates. The successor owns the exact seam station.
`createCourseRouteReaders` owns authoritative coordinate and height queries; `createCourseRouteVisualReaders` owns
Strip, sprite, visual and background queries. Every actor uses the same physical readers and route.

## Layer boundaries

There are two source roots: `src` for the product and `tools` for authoring and build programs.
Product code never imports tools. Neither root imports executable modules from `dist/`; tools use product source.
Reading or writing generated content under `dist/` is not a module dependency. Both roots share strict compiler
options and lint rules. [Development](development.md#typescript-tools) owns execution and checking commands.

Product source is organized by domain. Shared definitions, product compilation and runtime representation
belong inside that domain; an upper domain depends only on lower domains, and same-domain imports are unrestricted.

| Order | Layer   | Responsibility                                                                                                          |
| ----- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1     | core    | General mathematics, vectors, planar transforms, validation helpers                                                     |
| 2     | image   | Indexed images, RGB555/RGBA codecs, palettes, sprite/LOD formats, BG tiles and image filters                            |
| 3     | audio   | Sound synthesis and audio engines                                                                                       |
| 4     | course  | Course documents and compilation, road geometry, materials, occurrences, environment timelines and shared Route readers |
| 5     | vehicle | Vehicle mechanics, definitions, catalog and accepted operation requests                                                 |
| 6     | input   | Keyboard/touch adapters and arbitration producing vehicle operation requests                                            |
| 7     | race    | Sessions, progress, gates, timing, drivers, recovery and envelopes                                                      |
| 8     | view    | Cameras, projection, ground rows, sprite placement, drawing composition and framebuffer                                 |
| 9     | shell   | DOM, frame loop, HUD, DEV, startup and whole-scene composition                                                          |

The [dependency check](../tests/infrastructure/layer-dependencies.test.mjs) parses imports, type-only
imports, re-exports, inline import types, literal dynamic imports, CommonJS references, worker entries
and worklet modules. It also examines scripts in tool HTML and resolves TypeScript module aliases.
Product source has exactly these nine directories; startup files belong to shell. Every cross-domain
import follows the order and participates in the layer-cycle check, without product-layer exceptions.

There are no dependency exceptions. Course project sessions, text parsing/saving and reference
production belong to `tools/course`; the product retains shared course admission, live driving policy,
and envelope/time-budget readers. Sprite normalization, palette generation, LOD compilation and
fixtures belong to `tools/graphics`. Shared image formats, filters, codecs and product limits remain
in `src/image`; authoring-only limits stay with the tools.

Shell owns the observer's camera, and race actors contain no camera state. Race publishes camera-independent
actor observations; view owns rival sprite selection and assembly. Course owns VehicleWorld, surface
readers and the physical driving source. Race consumes that source only. Shell binds physical and
appearance products and owns the combined pre-lock render/driver query-depth admission.
RGBA conversion, sprite images and LOD formats belong
to image; framebuffer writes and sprite drawing belong to view. Compiled Strip color fields
and their scalar coefficient Reader belong to course. View owns Strip row sampling and the
three display methods; shell obtains their names from view.
Environment timelines are course data.
