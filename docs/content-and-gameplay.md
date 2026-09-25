# Content and gameplay

This document owns saved course data, authoring semantics and game rules.
[Architecture](architecture.md) owns coordinates and geometry; [Image assets](image-assets.md)
owns image formats and compilation; [Browser](browser.md) owns operation and URL settings.

## Course vocabulary

A Section is a reusable finite road/content chart. A Boundary is a longitudinal lateral edge;
a Carriageway
is the road between two Section-local Boundaries. A Link connects one Carriageway at a Section end to another Section start.
A RouteOccurrence is a selected Section visit in the shared Route, with its incoming Link and fixed
route coordinates. CompiledCourse is the immutable reference graph. Every actor uses the same Route.

A Strip supplies color, material or both between its own lateral edges. Section Strips are ordered;
color and material overwrite independently. Compiled Sections publish their two cross-section tables.

Checkpoints, starts, finishes and environment changes are independent of Section boundaries.
Source identity, traversal identity and race credit are distinct.

## CourseDocument v25

The saved format is compact UTF-8 JSON. All declared fields are required; explicit null represents
absent optional content. Unknown fields fail. Arrays preserve saved order; object-property order and
whitespace do not affect identity. Normalized records use schema field order and convert negative zero to zero.

```text
CourseDocument {
  format: "superoutride.course", version: 25,
  id,
  entrySectionId,
  sections, links, assets, rules
}
Section {
  id, pis,
  boundaries, strips, sprites, height: [{at, y, curveLength}],
  carriageways, assetIds, environments, gates
}
```

### Geometry and reference records

| Record          | Fields                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| Plan PI         | `id`, `x`, `z`, `radius`                                                                   |
| Position        | `at: {pi, offset}`; interval `start`/`end` and gate `at` use the same `{pi, offset}` value |
| Boundary        | `id`, `knots: [{at,lateral}]`                                                              |
| Carriageway     | `id`, `left`, `right`                                                                      |
| Link            | `id`, `from: {sectionId,carriagewayId}`, `to: {sectionId}`                                 |
| Asset reference | `id`, lowercase `sha256`                                                                   |

Asset references carry only logical identity and the exact saved-byte digest. Format and version
belong exclusively to the referenced file. Compilation admits that file and checks its own format
against each use (sprite or background). Delivery resolves digests through the content manifest;
[Development](development.md#build-outputs) owns the index and output layout.

IDs are opaque nonblank strings without surrounding whitespace and compare exactly. Course ID is
external identity. Section, Link and asset IDs each have a document-wide scope.
PI, Boundary and Carriageway IDs each have their own Section-local scope. Sprites have no IDs.
Duplicate IDs fail. References
resolve in their named scopes rather than by array position.

Schema-valid drafts may contain empty arrays or unresolved references.
Compilation requires complete semantic input.
A geometry draft uses empty environment, sprite and race-gate arrays and `rules: null`.
Branching Sections still require lock and closure gates.

### Lateral positions

`Lateral` is a finite number in metres (positive right), or `{boundary, offset}` with a
Section-local Boundary ID and a signed metre offset (positive right). The field is named
`lateral` on Boundary knots, sprites and grid slots; grid references
use the entry Section. Numeric values and offsets lie in `[-1000,1000]`, and every resolved
l must also lie in that range. Strip edges use the same Lateral values in `left` and `right`.

A point placement evaluates a numeric Lateral directly, or the referenced Boundary at its s
plus offset. The Boundary must cover that station, including each repeated sprite. References may name any Boundary in the same
Section; declaration order does not constrain references.

Boundary references must be acyclic. For each interval `[a,b]` between the Boundary's own
resolved knot stations, compilation takes both endpoints and every interior vertex from
either endpoint's referenced Boundary, including inherited vertices. Each endpoint defines
an expression: a numeric Lateral is constant; a reference reads its Boundary at the evaluation
station and adds its offset. Both references must cover the entire closed interval `[a,b]`.
At each collected station s, evaluate the two expressions as A(s) and B(s), then store
`A(s) + (B(s)-A(s)) * (s-a)/(b-a)` (using the endpoint expression directly at a or b).
The published Boundary linearly interpolates these stored vertices; it does not continuously
blend the two expressions between them. When both endpoint expressions refer to the same
Boundary with the same offset, the result follows its shape exactly.

Document reading owns field shapes, finite numeric bounds and IDs. Compilation owns reference
existence, cycles, interval coverage, resolved-value bounds and expansion limits. Unknown
Boundaries report `unresolved_reference`; cycles and insufficient coverage report
`invalid_boundary`; resolved numeric bounds report `invalid_numeric_domain`, and expansion
beyond the Section vertex budget reports `resource_limit`. Compiled Boundary vertices retain
`{at: {s}, l}`; sprites and grid also retain their resolved numeric l. Runtime readers do not
resolve authored references.

### Sprites and environment

Section `sprites` is an ordered array of `sprite` or `repeat` elements. A sprite is
`{kind:"sprite",image,palette,at,lateral,groundOffset,unselectedCarriagewayId}`.
`image` names a sprite image in that Section's `assetIds`; `palette` is a required nonempty name
without surrounding whitespace, declared by that image. To use its default color, write the image's
`defaultPalette` name explicitly; arrays, null and omission are invalid. Compilation rejects unknown
names with `unresolved_reference` at the sprite's `/palette` JSON Pointer.
`groundOffset` is height above the authoritative road height, in metres.
Each expanded placement resolves `lateral` at its own s, so repetitions follow referenced Boundaries.
Compilation shares one immutable resource for each image-source/palette-name pair across Sections;
decoded images and palette variants are shared by the renderer. Sprites have no authored identity.

`unselectedCarriagewayId` is null for ordinary sprites or names a canonical exit Carriageway.
Such signs lie from lock through closure, before the exit cut, and appear when the field selects
another exit. Their state follows the selected Links of the shared Route.

Section `environments` is an array at the same level as `strips` and `sprites`. An empty array
means no compiled appearance and requires an empty sprite list, while preserving authored Strips and
geometry. A nonempty environment list must begin at s=0.
An environment element is `{at,name,background}` or a `repeat`; background is
`{assetId,horizonY,yawOrigin}`. The image belongs to the referencing Section and uses the tiled
background format. After expansion, environment knots must begin at s=0 and strictly increase
inside `[0,Section.length)`, in expanded order. The compiler does not sort them.
Environment changes affect BG and labels independently of ground colors.
Background `yawOrigin` is an absolute angle in the authored Section coordinate frame: zero faces +Z
and positive degrees turn toward +X. Occurrence mapping adds the occurrence rotation to this angle.

### Shared repeat

Strips, sprites and environment lists use one recursive shape:
`{kind:"repeat",every,count,elements}`. `every` is a positive metre spacing; `count` is an integer
including the original occurrence. `elements` contains only elements of its enclosing list, including
nested repeats. One shared expansion implementation visits declaration order, then repetition index,
then child order. For index i, it adds `i*every` to every contained Position's resolved s, including
Strip knot `at`, decorative `at`, and curb `start`/`end`. Nested offsets accumulate. Lateral expressions
are evaluated at the shifted stations. All resulting Positions must fit the Section.
Repeated Strips remain color-only. The repeat depth/count and collection/expansion ceilings below
apply independently; limits reject rather than truncate. Empty repeats also consume bounded work.

### Tunnels

Author an entrance frame, repeated interior walls/ceiling frames and an exit frame as ordinary
sprites. Their images can leave the road opening transparent; no tunnel-specific geometry or
rendering state is needed. Use Strips for pavement, shoulder and lighting colors; material declarations
continue to supply physical support independently. Tunnel sprites are visual and do not add wall collision.

Place an environment knot at the entrance with an interior background, then another at the exit
restoring the exterior background and its yaw origin. For example, frames at s=100 and s=200 can bound
a tunnel; a sprite repeat at 100 with every=20 and count=6 supplies its frames. Environment knots at
0 (exterior), 100 (interior), and 200 (exterior) provide the matching background intervals.
The renderer selects the background at `camera.s`, not at a visible sprite or a distant ground row.
Thus an entrance frame visible ahead retains the exterior background; the interior begins exactly
when camera.s reaches the entrance knot, and the exterior returns at the exit knot. With the current
rearward camera, this follows the vehicle crossing by its camera distance. This is an immediate switch;
wipes and other transition effects remain a separate decision before Stage 12.

### Strips

Section `strips` is an ordered array of these constructs. Each record includes `kind`.

| Element  | Fields                                                                                   |
| -------- | ---------------------------------------------------------------------------------------- |
| `strip`  | `knots:[{at,left,right}]`, `color`, `material`                                           |
| `repeat` | positive `every`, integer `count`, `elements`                                            |
| `arrow`  | `at`, `lateral`, positive `width`, `length`, `direction`, RGB555 `color`                 |
| `text`   | `at`, `lateral`, `text`, positive `height`, RGB555 `color`                               |
| `curb`   | Position `start`, `end`, Lateral `left`, `right`, positive `stripe`, two RGB555 `colors` |

A Strip's color is an RGB555 integer from 0 through 32767, `"transparent"` to erase earlier color,
or null to leave color unchanged. Zero is opaque black. Material is a material ID or null to leave
material unchanged. Both fields cannot be null. A later covering Strip independently replaces each
non-null value. Uncovered color is transparent; uncovered material is no material. No material is
not a material ID: it has no support, zero grip and zero rolling resistance. Color-only Strips never
enter the material table, and material-only Strips never enter the color table.

Knots use Position `at` and Lateral or null edges. Null left/right opens that side to infinity;
each side's open flag must remain constant throughout a Strip. Material-bearing Strips require
two finite edges. There are at least two knots (the admission ceiling is listed below), whose resolved stations strictly increase inside
`[0,Section.length]`. The first and last knots determine the active interval. Finite edges obey
`left <= right`; zero-width taper endpoints are allowed. Ownership is `[left,right)` laterally
and `[start,end)` longitudinally, including the Section terminal in the last slab.

Strip edges use the same interval resolver as Boundary knots: collect the referenced Boundary
vertices, evaluate both endpoint expressions there, blend, then linearly interpolate.
When an edge references the same Boundary and offset at both knots, it retains that Boundary's
original line and adds the offset after evaluating it. With zero offset, every edge read equals
`courseBoundaryAt` without a rounding gap, even after unrelated slab splits.

Decorative constructs carry color only. An arrow's at is its near
bounding edge and lateral its center; width and length are its final bounding dimensions.
Direction is `forward`, `left` or `right`. Text at/lateral specifies the near/left edge of its cells;
height covers seven cells, horizontal advance is six cells per character. Text admits uppercase
A–Z, digits 0–9 and spaces; the text length ceiling is listed below. Polygon edges and glyph row runs expand
to affine pieces. A curb alternates its two colors from start, clips the last stripe to end,
and resolves its Lateral edges over each stripe interval. All expanded intervals must fit the Section.

The numeric and resource table below bounds each element array, repetition, expansion work,
simultaneously active pieces, resolved slabs and cached fields. Covered pieces still count;
a piece carrying both payloads counts once. Limits reject rather than truncate.
[Architecture](architecture.md#strip-rendering) owns averaging, immutable storage and pixel kernels.

### Section gates and Session settings

Section `gates` is an array with these records. Every `at` uses the enclosing Section's Position;
`carriageway` names a Carriageway in that Section. Only checkpoint and finish gates have IDs, and
those IDs are unique across the whole course, including across the two kinds. They are stable keys
for author-confirmed time limits. Array order supplies checkpoint order within each Section.

| Kind         | Fields after `kind`       | Placement                                                                                                         |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `start`      | `grid: [{at,lateral}]`    | Exactly one, in the entry Section, when race settings exist                                                       |
| `checkpoint` | `id`, `carriageway`, `at` | Increasing Section positions after zero, through a continuation's terminal station and strictly before its finish |
| `finish`     | `id`, `carriageway`, `at` | One per terminal Section; in a circuit, only at the terminal station of the Section returning to entry            |
| `lock`       | `at`                      | Exactly one in every Section with two or three outgoing Links                                                     |
| `closure`    | `at`                      | Exactly one in every Section with two or three outgoing Links                                                     |

Grid slots are ordered player first, then rivals in roster order. Each slot must be on supported
material, at/after entry and before the first checkpoint, finish or lock gate. The grid must hold the
CLASSIC roster; its capacity is one player plus the product maximum rival count. Starting velocity is zero.
Checkpoint and finish Carriageways must exist at the gate and have positive supported width across their
edges. Runtime crossing width is the coordinate domain at the line. A checkpoint at a continuation seam
belongs to the preceding Section, while the runtime bounds use the successor's domain at that station.
A circuit has exactly one finish; other circuit Sections have none. The fork section below owns lock,
closure and conditional-sign geometry. A Section with at most one outgoing Link cannot have either
lock or closure gates.

`rules` is null or `{maxLaps,classic}`. `classic` contains `{vehicleId,rivalCount,lapCount,timeMargin}`;
these are settings without positions. `maxLaps` is an integer from 1 through 99; non-circuits use 1.
`rivalCount` is 0 through 16; `lapCount` cannot exceed `maxLaps`; `timeMargin` is positive, finite and
at most 10. The composition root resolves vehicle IDs against the catalog.

`rules: null` means a draft without race settings. Such a draft cannot contain start, checkpoint or
finish gates; lock and closure remain required by branching topology. With non-null rules, compilation
requires the start, grid and finish coverage described above. Compiled `rules` retain only those settings;
compiled `gates` provide the resolved grid and per-Section landmark intervals to race and tools.

### Null meanings

Empty collections are arrays: in particular, `environments: []` means no appearance.
CourseDocument nulls each have one meaning:

| Field                            | Meaning of null                                                       |
| -------------------------------- | --------------------------------------------------------------------- |
| Course `rules`                   | Draft without race settings and without start/checkpoint/finish gates |
| Strip `color`                    | Leave the earlier color channel unchanged                             |
| Strip `material`                 | Leave the earlier material channel unchanged                          |
| Strip knot `left` / `right`      | That edge is open to negative / positive lateral infinity             |
| Sprite `unselectedCarriagewayId` | Ordinary sprite with no exit-selection condition                      |

### Numeric and resource domains

All numbers are finite. `COURSE_DOCUMENT_LIMITS` in `src/course/course-limits.ts` is the single
admission table for saved documents, course compilation and supplied course images. These ceilings
protect compiler resources; they are not rendering, resident-memory or device-performance budgets.
Stage 12 establishes those budgets from the complete application on named devices.

Use 21 km as the planning envelope for the approximately 20.8 km Nordschleife, with a factor of two
for longitudinal detail and length. One Section can therefore hold nearly the whole circuit; the
planned circuit representation uses at least two Sections and does not divide the long Section's budget.
Assume 10 corners/PIs, 20 PVIs/profile knots, 30 authored decoration records and 220 placements per km.
The latter includes both verges at 10 m spacing (200/km) plus 20/km for signs and other sprites.
Every corner can receive two curbs, an arrow and lettering: curbs can cover both sides of the entire
21 km at 1 m stripes, with 100 lane dashes/km and up to 10 two-character markings/km. This is
conservatively 3000 expanded pieces/km; detailed glyphs and inherited edge points consume that budget.
Counts are rounded upward to powers of two after the stated margin, except the metre ceiling.

For graph planning, Cool Riders' 50 stage positions with three outgoing choices dominate the selected
master list. Allow two Sections per position, then round 100 up to 128; up to three Links per admitted
Section gives 384. This also contains OutRun's 15 nodes/20 Links and the selected linear courses
(up to 18 named stages). These are capacity assumptions, not a reconstruction of Cool Riders' exact map.

| Scope / table key                                                       |            Ceiling | Basis                                                                                                                   |
| ----------------------------------------------------------------------- | -----------------: | ----------------------------------------------------------------------------------------------------------------------- |
| Document `jsonBytes`                                                    |       64 MiB UTF-8 | 50 stages × 2 km/stage × 1000 records/km × 256 encoded bytes/record × 2, rounded up                                     |
| `idCodeUnits`                                                           |                128 | 64-character stable paths/names × 2                                                                                     |
| Graph `sections` / `links`                                              |          128 / 384 | 50 positions × 2, rounded up; three outgoing choices per Section                                                        |
| Document `assets`                                                       |               2048 | (50 × 16 local image types + 128 shared types) × 2, rounded up                                                          |
| Section `sectionAssets`                                                 |                128 | 64 locally used image types × 2                                                                                         |
| Section `pis`                                                           |                512 | (21 × 10 + 2 endpoints) × 2, rounded up                                                                                 |
| Section `heightNodes`                                                   |               1024 | (21 × 20 + 2) × 2, rounded up                                                                                           |
| Each Boundary/Strip `knots`                                             |               1024 | Same 20/km knot density and margin                                                                                      |
| Environment array and expanded Section `environmentKnots`               |                256 | (21 × 4 + 1) × 2, rounded up                                                                                            |
| Section `boundaries`                                                    |                 32 | 16 road, median, shoulder and outer Boundaries × 2                                                                      |
| Section `carriageways`                                                  |                 64 | One road activation/km × 21 × 2, rounded up; supports three-way splits                                                  |
| Section `spritePlacements` (expanded)                                   |              16384 | 21 × (200 + 20)/km × 2, rounded up                                                                                      |
| Each Strip/sprite array `stripElements` / `spriteElements`              |               2048 | 21 × 30/km × 2, rounded up                                                                                              |
| `repeatCount`                                                           |              65536 | Whole-length 1 m repetitions: 21000 × 2, rounded up                                                                     |
| `repeatDepth` / `textCodeUnits`                                         |             8 / 64 | Four organizational levels × 2; 32-character road legend × 2                                                            |
| Section `stripExpansion` (pieces and visited constructs separately)     |             131072 | 21 × 3000/km × 2, rounded up                                                                                            |
| Section `activeStrips`                                                  |                 64 | 16 base layers + 14 glyph/marking runs + 2 curbs, doubled; counts hidden pieces                                         |
| Each color/material table `stripSlabs`                                  |            1048576 | Expanded-piece budget × two endpoints × four for crossing subdivisions                                                  |
| Section `preblendCells`                                                 |             131072 | All 1 m dyadic levels at 42000 m total fewer than 84032 cells, rounded up                                               |
| Section `coefficientBytes`                                              |            512 MiB | Moving-edge 21 km probe uses about 121 MiB; ×2 length and ×2 Strip complexity, rounded up                               |
| Section resolved `boundaryVertices`                                     |              65536 | 32 Boundaries × 1024 knots × 2 for inherited vertices                                                                   |
| Course `gates` (also bounds each Section array)                         |               2048 | 50 stage positions × (8 checkpoints + 2 branch controls + 1 finish) × 2, plus one start, rounded up                     |
| Start gate `startGridSlots`                                             |                 17 | `1 + SESSION_RULE_LIMITS.rivals`; player plus 16 rivals, a gameplay capacity rather than a density estimate             |
| `lengthMeters` (chainage, signed offsets, radii and lengths)            |            42000 m | 21 km × 2                                                                                                               |
| `coordinateMeters`                                                      |         ±1000000 m | Retains 100 km native-coordinate origin allowance × 10                                                                  |
| `lateralMeters` / `heightMeters`                                        |   ±1000 / ±10000 m | 100 m lateral span / 1000 m elevation envelope, each × 10                                                               |
| `imageEncodedBytes` / `imageMasterTexels` per image                     |    8 MiB / 1048576 | Retained 1024² master allowance; up to 8 encoded bytes/master texel                                                     |
| Unique course images `imageTotalEncodedBytes` / `imageTotalLevelTexels` | 128 MiB / 33554432 | 928 image types averaging 128×64 master texels, ×4/3 mip texels, ×2 margin; allow 4 encoded bytes/level texel, round up |

Sprite and environment expansion each allow at most `expandedLimit * (2*repeatDepth+1)` work visits:
one leaf plus up to one repeat node and one iteration per permitted nesting level. Strip expansion
retains its independent `stripExpansion` work and piece budgets. This bounds empty nested repetitions
as well as visible output. Sprite element arrays use the same 30 authored records/km × 21 km × 2
planning density as Strip arrays, rounded up to 2048; expanded placements retain the 220/km basis.

The ceilings are independent admission fences, not a promise to accept their Cartesian product.
Slab crossings and moving-edge preblend event counts depend on geometry, so input counts alone
cannot guarantee derived counts; compilation checks the actual products and rejects excess.
The 21 km density case, a nearly 42 km case reaching PI/PVI/knot/Boundary/Strip/placement ceilings,
and 50- and 128-Section three-choice graphs are disposable measured probes; their times, memory and
compiled counts belong in the PR. Images have their own aggregate bound; repeated descriptors of one
digest share a source. Authored JSON size does not include the separately supplied image bytes.

Positions resolve a Section-local PI (arc midpoint for an interior PI, endpoint otherwise) plus signed
offset. Their stations must lie in the finite Section and intervals must be positively representable.
Endpoint PI radii are zero; interior radii and deflections are positive, with deflection below 180 degrees.
Neighboring tangent lengths must fit their shared edge. The touching-tangent roundoff rule belongs to
[Architecture](architecture.md#plan-authority). Resolved Lateral values also obey the lateral ceiling.
Palette size, RGB555 range, SHA-256 length, glyph dimensions and angle units
are format values, not entries in the resource table. Session rival/lap/time-margin rules remain owned by
`SESSION_RULE_LIMITS`, shared with Session admission and controls rather than copied into document limits.

Limit-only revisions retain the format version; the compiler identity advances to identify
the revised admission policy. Existing inputs must still satisfy the current ceilings; no migration reader
or grandfathered limit set is provided.

## Geometry and bindings

The saved PI and position fields are listed above. [Architecture](architecture.md#plan-authority)
owns their authoritative planar interpretation, coordinate domain and geometric validation.
Rendering and physics read the same plan; Section length comes from its coordinate Reader domain.
An overpass is authored as separate Sections for its passages; the coordinate-domain condition
is specified in [Architecture](architecture.md#plan-authority).

Boundary knots strictly increase. Their resolved vertices define affine edges; width and center are derived.

A Carriageway is `{id, left, right}`; both edge IDs resolve to Boundaries in its Section.
Its existence interval is the intersection of those Boundary domains, with no separate range field.
The intersection must have positive length. Membership is `[start,end)`, including the end only
when it is the Section terminal. Boundary values themselves remain readable at both endpoints.
Thus a road ending at a split is replaced at that station by the roads beginning there.
The left edge never exceeds the right edge; zero width is allowed only at isolated stations.
At any station, distinct existing Carriageways cannot overlap over a positive lateral interval.
Compilation proves these conditions over affine Boundary cells and at activation changes;
violations report `invalid_carriageway`, and unknown edge IDs report `unresolved_reference`.

Every Carriageway interior must be covered by supported material throughout its existence;
violations report `invalid_carriageway`. Cut lines, landmarks, fork exits, driving targets and recovery
read Carriageway Boundaries directly. Landmark support is checked across the full edge interval.

Every open Section cell must have finite material coverage. At every longitudinal transition, both
the material-bearing cell union and the Carriageway interior union must have equal side limits.
No-material space outside that union is not an authored material. Positive-width replacements and zero-width birth/death endpoints follow
the same rule. Discontinuities report `material_transition_discontinuity` or `carriageway_transition_discontinuity`;
empty material coverage reports `material_coverage_gap`.
[Architecture](architecture.md#boundary-geometry-and-point-ownership) owns mapped geometry and point ownership.

`courseBoundaryAt` samples the canonical edge. The compiled material table owns point reads,
with lateral `[left,right)` and longitudinal `[start,end)` membership; the Section terminal is
included. Starting/continuing pieces own a switch. Original affine edge arithmetic and shifted
origin comparisons preserve Boundary ownership. [Architecture](architecture.md#material-cross-sections)
owns the common table shape and allocation-free binary readers.

Profile Knots resolve on the same ruler, increase strictly and include exactly zero and L.
`curveLength` is nonnegative in metres; endpoint lengths are zero and adjacent curves do not overlap.
[Architecture](architecture.md#height-and-projection) defines the analytic profile and the polyline used only for ground-row generation.

Surface materials are delivered by the manifest as the single `content/materials/surface.json`
`superoutride.surface-materials` version 1 document. It has `id:"surface"` and an ordered
`materials` array. Each material has a filename-safe open-set `id`, nonnegative finite
`gripFactor`, nonnegative finite `rollingResistance`, and `tireEffect`. The tire-effect enum is
`NONE`, `SMOKE`, `DUST`, `GRASS`, `WATER_SPRAY`, `SNOW` or `MUD`; it records future tire
presentation only and does not alter physics in this stage. Material IDs are content data rather than
a TypeScript enum. Adding an ID requires no course or physics code change; until audio definitions
become content in Stage 9, both tire-sound tables must have a matching ID.

The initial definitions are ASPHALT, SHOULDER, GRASS, DIRT and SAND with their pre-8-7a physical
values. There is no VOID definition. An authored Strip material resolves its ID against the admitted
catalog; an unknown ID reports `unresolved_reference` at that Strip's `/material` path.
Material-bearing Strips compile to finite affine pieces through the same slab resolver as color. The
coordinate domain follows the material table's outer finite covered edges plus margin. Color remains
independent of physical support. Outside material-bearing coverage, point reads return no material.

## Cut lines, Links and topology

Each Section retains its authored PI coordinates as its native frame and owns its full `[0,L]` ruler.
The entry Section's native frame is the world frame. Its entry is the cut
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
Other boundaries, materials, Strips and appearance may change at the cut.

The graph has an explicit entry. All Sections are reachable. The compiler derives the course kind:
a directed cycle selects CIRCUIT, otherwise any Section with at least two outgoing Links selects BRANCH,
and otherwise the kind is LINEAR. A graph combining a cycle with branches is rejected as `invalid_topology`.
The document has no authored kind selector. Compiled `course.type` publishes the derived kind.
LINEAR is a finite chain with at most
one incoming/outgoing Link per Section. BRANCH is a finite acyclic graph with two/three-way forks
and merges. Their entry has no incoming Link. Links from a Section to itself are forbidden for every type.
CIRCUIT is one directed cycle containing the entry and at least two Sections. Each Section has exactly
one outgoing Link; all Sections must be reachable from entry, and each has one incoming Link.

Compilation requires the composition of Link transforms around the cycle to return to identity in both
position and heading, within the accumulated `COURSE_LINK_RECIPE` translation and angular tolerances.
Nonclosing cycles report `cycle_not_closed`, naming a Section on the cycle and both residuals and limits.
Acyclic branch merges have no closure condition. [Architecture](architecture.md#cycle-closure)
owns the bounded algorithm and tolerance accumulation.

## Compiled identity and project publication

CompiledCourse contains canonical Section, plan segment, Boundary, Carriageway, Link,
asset and landmark references plus immutable material tables. Merges reuse the same successor; loops refer to the same source.
Owned records and arrays are immutable, including nested image data. Live actor, route-lock and
clock state belong to Sessions. Object identity is local to a compilation; cross-build identity uses digests.

`sourceSha256` hashes normalized course input. `materialsSha256` hashes the admitted normalized
surface-material document. `buildSha256` hashes `{sourceSha256,materialsSha256,compiler}`.
The compiler is `superoutride.course-compiler` version 36, incorporating Link recipe v3, physical
recipe v5, image-source recipe v2 and appearance recipe v11. Source, material or compiler/recipe
changes invalidate dependent products.

Image inputs are explicit saved bytes addressed by each declared SHA-256. Shared digests resolve to
one immutable source. [Image assets](image-assets.md#course-image-sources) owns source formats and diagnostics.
Draft saving is independent of image-byte availability.

Document operations return `{ok:true,value}` or `{ok:false,diagnostics}`. Input diagnostics contain
`kind:"input"`, `code`, JSON Pointer `path` and causal `message`. Clients use code/path.
The `plan_coordinate_overlap` variant additionally requires
`overlap: {section, intervals: [{sStart, sEnd}, ...]}`; ordinary diagnostics have no overlap fields.
`plan_coordinate_inversion` identifies the Section's PIs and the affected station in metres, never
an internal segment number. `invalid_gate` identifies gate-specific rules: gate kind, gate ID uniqueness,
counts, ordering, Carriageway support, grid, lock/closure and circuit finish conditions.
Shared shape, numeric, reference and position rules keep their own codes (for example
`invalid_shape`, `unresolved_reference` and `invalid_position`), with a path into the affected gate.
Each check chooses its code explicitly; paths do not select codes and exceptions are not recoded.
A missing gate points to its Section's `gates` collection.
`invalid_rules` is reserved for position-free race settings. Non-gate fork constraints retain
`invalid_fork`, addressed to the affected sprites, Strips, Boundaries or Carriageways.

Document reading admits `curveLength` in `[0, lengthMeters]`. Compilation checks zero endpoint
curve lengths and non-overlapping adjacent curves once, reporting `invalid_height` at the causal
PVI's `curveLength`. Profile construction consumes those admitted curves.
Strip compilation reports storage/work ceilings as `resource_limit` and unrepresentable preblend
coefficients as `invalid_numeric_domain`, addressed to the Section's `strips` collection; malformed
expanded constructs report `invalid_strip` at their authored element.
Only known authored failures become diagnostics; internal invariant exceptions are never caught
as a substitute for admission checks. Malformed
schema reports a deterministic first error; independent semantic failures follow declaration order.
Expected failures include shape, version, reference, resource, geometry, coverage, material, topology
and appearance errors. Failed compilation publishes no partial product.

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

A driving scene requires Session settings and compiled start gates, and checks the rearmost grid
station against `D_cam`. Driving beyond the entry uses the same coordinate-domain recovery rule
as any other domain exit. Recovery preserves
accepted cross sections and laps and suppresses crossing credit for that step.

## Fork lock and handoff

The number of outgoing Links determines branching. A Section with two or three exits requires exactly
one `lock` and one `closure` gate with `0 < lock < closure < every exit seam`.
The compiler builds its branch controls from those gates after Links are resolved. The parallel-zone subset
is contained in straight parts of the plan. Through closure, edges are constant, roads have positive
width, and the material table supplies one contiguous supported interval at lock. Through closure,
material span edges remain parallel and the supported interval retains the same bounds. Gate and
grid support checks also read this table. Adjacent exit Carriageways require a positive-width
supported interval between their edges; this is the separating median, defined by Carriageway edges and material.
Invalid controls produce `invalid_fork`.

Exit Carriageways are ordered by their actual lock-line edges. Median centers divide supported
space into exit intervals; outer supported shoulders belong to the outer exits. The shared half-open
[lateral rule](architecture.md#boundary-geometry-and-local-windows) assigns exact ties to the right.
A crossing outside the coordinate domain or outside every fork interval selects no route.

The player and rivals are eligible. Lock lines use the same route-s crossing function as race lines.
The first forward crossing in a fixed step wins, using the s-derived fraction u and then stable actor
ID for an exact tie. Interpolated route l, shifted by the occurrence's lateral origin, selects the
fork interval. The winner appends one successor to the shared Route. Each occurrence locks once;
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
each lap. Lap numbers count FINISH lines along the Route: every line after the (k-1)-th FINISH
through and including the k-th FINISH belongs to lap k. Section occurrence ordinals do not determine
laps. Pruning and reverse travel do not renumber lines. The lists change only on route extension or
pruning. The configured final lap's FINISH,
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
and seed inputs. The vehicle digest (`sessionVehicleSha256`) is SHA-256 of the deterministic JSON
serialization of the admitted vehicle source document, driving source document and surface-material
source document. The vehicle source includes form, metadata and sound ID. Everything else a Session
drives—compiled mechanics, driving settings and material physics—derives
from those sources. Definition readers construct these records in a fixed field order; arbitrary input
key order does not affect identity. Any vehicle, driving or surface-material value change changes
`vehicleSha256`. This digest is a
reference-cache key component and is independently recomputed by browser envelope and budget admission;
both reject products carrying an old digest. Manifest SHA-256 verifies transported bytes separately.
The reference model hash tracks compiler/mechanics code; authored JSON values belong to the per-vehicle
digest, so editing one vehicle does not invalidate unchanged vehicles' cache keys. For a budget state, reference duration is the maximum upcoming interval among
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

Airborne driving is ordinary; recovery applies only when driving cannot continue: coordinate-domain
exit, an inverted landing, falling through the heightfield, leaving the locked fork route (wrong course) or a
manual request. [Vehicle physics](vehicle-physics.md#airborne-state-and-recovery) owns the conditions. It reconstructs
pose, velocities, wheels, actuators, powertrain and observations at known supported coordinates while
preserving steering/tire calibration and earned gates, locks and laps.

Route recovery backs off from the farther of causal current chainage and last-safe chainage.
Wrong-route recovery uses the selected Carriageway at the observed station.
[Vehicle physics](vehicle-physics.md#airborne-state-and-recovery) owns domain timing and target placement.
Known recovery coordinates use the shared route. Observers resynchronize once, suppress reset
crossing credit and update the player
camera before rendering. Unrelated internal faults propagate.

## Evaluation test course

`ribbon-rough` (RIBBON ROUGH, DEV button 4) is a playability test circuit, not a product course. Its
extreme vertical profile and corners are authored for hands-on evaluation; its shape is not rounded off
for completion. The reference driver cannot complete it, so it is delivered without reference runs or
time budgets and its Sessions are untimed. It is a 4.2 km two-Section circuit on existing materials:

| Section        | Stations (m) | Content                                                                         |
| -------------- | ------------ | ------------------------------------------------------------------------------- |
| `rough-bumps`  | 0–260        | Start straight, grid                                                            |
|                | 270–482      | Narrow road; short waves 8 m / 0.3 m, 12 m / 0.45 m, 15 m / 0.6 m               |
|                | 540–1100     | Undulations 80 m / 1.6 m; 200 m right sweeper (800–1114) inside them, wide road |
|                | 1160–1340    | 12 % ramp to a sharp crest (12 m), 18.75 % landing slope                        |
|                | 1480–1485    | 4 m step drop                                                                   |
|                | 1550–1670    | Valley: 20 % down, tight sag, 20 % up                                           |
|                | 1794–1862    | Narrow hairpin of two 20 m right turns, sand trap outside                       |
|                | 1902–1965    | 40 m left turn                                                                  |
|                | 1990–2190    | Chicane of 30 m radii over 10 m / 0.3 m bumps                                   |
| `rough-return` | 8–179        | 15 % climb to a crest carrying an 80 m right kink, 15 % descent                 |
|                | 235–282      | 80 m left kink on the flat below                                                |
|                | 320–640      | Dirt road over 25 m / 0.35 m ruts, wide road                                    |
|                | 640–847      | Gradual climb                                                                   |
|                | 867–1739     | Two 150 m right sweepers, sand trap outside the first                           |

## Observation formats

### Course observations

`superoutride.course-observations` version 1 contains `id`,
`source: {kind:"video"|"analyzed-data",location,edition}`, calibration method/units and these arrays:

| Array                | Records                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `samples`            | `{s,timeSeconds,curvaturePerMeter,grade,roadWidthMeters,heightMeters}`    |
| `spriteRows`         | `{kind,startS,endS,spacingMeters,side,offsetMeters,groundOffsetMeters}`   |
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
frame SHA-256, centers/horizon, HUD mismatch and geometric residuals. Sprites and semantic landmarks are authored observations.

## Course loading

All selected-course inputs and generated vehicle/timing data are ready before ticks. The shared
compiler expands saved constructs and builds immutable fields for every reachable Section.
Aliases share canonical records and each reusable Section's field; repeated circuit occurrences
reuse the single source. Input or compilation failure publishes no partial reader or Session.

Replacement suspends input, audio and ticks, shows coherent loading/failure state and supports retry.
Stale arrivals cannot replace a newer selection. Resume uses a fresh clock and cleared input ownership.
Driving previews use the same compiler/readers, camera, renderer and mechanics as the browser.
