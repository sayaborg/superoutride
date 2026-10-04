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

## CourseDocument

The saved format is compact UTF-8 JSON. All declared fields are required; explicit null represents
absent optional content. Unknown fields fail. Arrays preserve saved order; object-property order and
whitespace do not affect identity. Normalized records use schema field order and convert negative zero to zero.

```text
CourseDocument {
  format: "superoutride.course", version: 39,
  name, entrySectionId,
  sections, links, assets, rules
}
Section {
  id, pis,
  boundaries, strips, walls, openLimits, sprites, height: [{at, y, curveLength}],
  carriageways, environments, gates
}
```

### Geometry and reference records

| Record          | Fields                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------ |
| Plan PI         | `id`, `x`, `z`, `radius`                                                                   |
| Position        | `at: {pi, offset}`; interval `start`/`end` and gate `at` use the same `{pi, offset}` value |
| Boundary        | `id`, `knots: [{at,lateral}]`                                                              |
| Carriageway     | `id`, `left`, `right`, `lanes`                                                             |
| Link            | `id`, `from: {sectionId,carriagewayId}`, `to: {sectionId}`                                 |
| Asset reference | `id`, lowercase `sha256`                                                                   |

Asset references carry only logical identity and the exact saved-byte digest. Format and version
belong exclusively to the referenced file. Compilation admits that file and checks its own format
against each use (sprite or background). A course's relation to its images is this declared digest:
delivery supplies each reference with the bytes of the manifest `image` entry whose `sha256` equals it,
never by assuming an entry ID. [Development](development.md#build-outputs) owns the index and output layout.

`name` is the course's display name: nonblank printable ASCII (the
[text tiles'](image-assets.md#text-tiles) characters) without surrounding whitespace, at most `nameCodeUnits`
long, so it fits one line of the frame's text grid. It is shown, never used as an identity.

IDs are opaque nonblank strings without surrounding whitespace and compare exactly. A course's only
identifier is its file name without `.course.json`, which is also its manifest ID; the document carries
none, and the compiled course receives it from its catalog. Section, Link and asset IDs each have a document-wide scope.
PI, Boundary and Carriageway IDs each have their own Section-local scope. Sprites have no IDs.
Duplicate IDs fail. References
resolve in their named scopes rather than by array position.

Schema-valid drafts may contain empty arrays or unresolved references.
Compilation requires complete semantic input.
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
`{kind:"sprite",image,palette,at,lateral,groundOffset,unselectedCarriagewayId,body}`.
`image` names a sprite image in the course `assets`; `palette` is a required nonempty name
without surrounding whitespace, declared by that image. To use its default color, write the image's
`defaultPalette` name explicitly; arrays, null and omission are invalid. Compilation rejects unknown
names with `unresolved_reference` at the sprite's `/palette` JSON Pointer.
`groundOffset` is height above the authoritative road height, in metres.
Each expanded placement resolves `lateral` at its own s, so repetitions follow referenced Boundaries.
Compilation shares one immutable resource for each image/palette-name pair across Sections; the
renderer borrows the compiled decoded image and materializes one palette variant per resource. Sprites have no authored identity: compilation expands a Section's sprites once, in document order and within
`spritePlacements`, into its placements, each with its resolved position, lateral and sprite image, and a placement's
index is its identity; the solid objects and the appearance are both compiled from that one list.

`body` is null for scenery vehicles pass through (grass, bushes), or `{width, movable}` for a solid object: `width` a
positive width in metres, and `movable` null for a fixed object or `{mass, launchDegrees, knocked: {airborne, landed}}`
for a movable one ([Roadside objects](#roadside-objects)): `mass` in kilograms (positive, up to `objectMassKilograms`),
`launchDegrees` the elevation a hit throws it at (0 or more, under 90; one `invalid_numeric_domain` outside), and
`airborne` and `landed` the sprite images in the course `assets` it shows while
flying and once landed, drawn in the placement's palette (they may name one image twice). Compilation rejects a width
wider than the image's world width (its master width at 40 texels/m) and a body on a state-selected sign
(`invalid_placement`); the appearance compiler resolves the knocked images like the placement's own.

`unselectedCarriagewayId` is null for ordinary sprites or names, by id, a canonical exit Carriageway of the
Section's fork. Compiled appearance keeps that id, never a physical Carriageway object. A state-selected sign
appears at a fork occurrence once that occurrence has a selected successor on the Route whose Carriageway id
differs from the sign's; each occurrence follows its own choice, so repeated passes do not mix. The appearance
compiler owns these checks and reads the compiled fork after it: a state-selected sign requires a fork, its id
names one of that fork's exit Carriageways, and it lies from lock through closure (`invalid_fork` at the sprite;
an unknown id is `unresolved_reference` at `/unselectedCarriagewayId`). Lying at or before closure already places
it before every exit cut; a sprite's image width is not a length along s and does not enter the check.

Section `environments` is an array at the same level as `strips` and `sprites`. An empty array
means no compiled appearance and requires an empty sprite list, while preserving authored Strips and
geometry. A nonempty environment list must begin at s=0.
An environment element is `{at,name,background}` or a `repeat`; background is
`{assetId,horizonY,yawOrigin}`, naming an image in the course `assets` that uses the tiled
background format. Sprite and background references are a Section's only relation to images: an
image outside the course `assets` is `unresolved_reference`, and a Section's images are exactly those
its sprites and backgrounds reference. After expansion, environment knots must begin at s=0 and strictly increase
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
rearward camera, this follows the vehicle crossing by its camera distance. This is an immediate switch.

### Strips

Section `strips` is an ordered array of these constructs. Each record includes `kind`.

| Element  | Fields                                                                                    |
| -------- | ----------------------------------------------------------------------------------------- |
| `strip`  | `knots:[{at,left,right}]`, `color`, `material`                                            |
| `repeat` | positive `every`, integer `count`, `elements`                                             |
| `arrow`  | `at`, `lateral`, positive `width`, `length`, `direction`, RGB555 `color`                  |
| `text`   | `at`, `lateral`, `text`, positive `height`, RGB555 `color`                                |
| `curb`   | Position `start`, `end`, Lateral `left`, `right`, positive `stripe`, RGB555 `colors` list |

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
to affine pieces. A curb repeats its colors in list order from start, one color per stripe, clips the
last stripe to end, and resolves its Lateral edges over each stripe interval. The list holds at least
two colors; its ceiling is listed below. Across the full road width, a curb paints striped or
gradient road surfaces. All expanded intervals must fit the Section.

The numeric and resource table below bounds each element array, repetition, expansion work,
simultaneously active pieces, resolved slabs and cached fields. Covered pieces still count;
a piece carrying both payloads counts once. Limits reject rather than truncate.
[Architecture](architecture.md#strip-rendering) owns averaging, immutable storage and pixel kernels.

### Walls

Section `walls` is an array (empty when the Section has none) of `{boundary, from, to, solid, strips}`: a wall along the
Section Boundary `boundary` from Position `from` to Position `to`. Compilation requires `from < to` and the Boundary to
cover that interval (`invalid_wall`; an unknown Boundary is `unresolved_reference`). `solid` is null for a wall vehicles
pass through (for looks only), or `{freeFrom, freeTo}` for a solid one, which vehicles meet. Each solid end, at `from`
and at `to`, either joins another barrier line — it lies on a course limit, or on another solid wall from its `from`
through its `to`, ends included — and is then null, or is declared free with its thickness, positive metres. Compilation
checks every solid end once, within `JOIN_TOLERANCE_METERS` (1e-6 m, reading one line through two compiled readers): an
end declared joined that joins nothing, or declared free that joins a line, is `invalid_wall`. Authors join lines by
referring to the same Boundary (a slanted lead-in's knot refers to the outer Boundary the material's edge follows), so
editing one keeps them joined; a guardrail so joined to the course limit at both ends leaves no way behind it.

`strips` colors the wall as the road's [Strips](#strips) color the ground, with height in place of lateral: an array of
`{kind: "strip", color, knots}` and `repeat` elements (`repeat` as for road Strips). `color` is an RGB555 integer or
`"transparent"`, with the road Strip's meanings; a wall has no material, so a wall Strip cannot leave color unchanged and
its `color` is never null. Each of at least two knots is `{at, bottom, top}`: Position `at`, and `bottom` and `top`, metres above the
road height at that station (negative below it), the Strip's lower and upper edges. Knot stations, the edge rule
(`bottom <= top`, so a Strip may taper to zero height; `invalid_strip` otherwise), edge interpolation, repetition, later Strips overwriting
earlier ones, and the active-piece ceiling is those of road Strips, and a wall's Strip products count against the
Section's Strip ceilings together with the road's ([Numeric and resource domains](#numeric-and-resource-domains)); every Strip, repeated ones included,
lies within `[from, to]` (`invalid_wall` for an authored knot, `invalid_position` or `invalid_strip` for a repeated or
expanded one). The wall is visible where its Strips are. A wall with no Strips is invisible and must be solid (a wall
neither seen nor met is rejected); reading rejects this with `invalid_value`. Whether a wall is solid
does not affect its picture. Compilation turns a visible wall's Strips, with the road's Strip compiler, into a color
table over the wall's own interval (station `s - from`) and keeps the height range its opaque Strips span;
[Architecture](architecture.md#walls) owns how it is drawn. A visible wall needs the Section's environments.

Solid walls and the course limits are the Section's barrier lines ([Body contact](#barrier-lines)). The course limits
run along the left and right outer edges of the covered material — the material table's outermost finite covered
edges, the lateral domain's edges before `MAXIMUM_VEHICLE_REACH` — and authors never write them. Section `openLimits`
declares where a course limit does not run: an array (empty when the Section has none) of `{side, from, to}`, side
`"left"` or `"right"` from Position `from` to Position `to` (`from < to`, `invalid_value` otherwise). That side has no
course limit over the declared interval; a wall for looks only beside it does not open it. A vehicle leaving through an
open limit has no support beyond the material and falls; ordinary recovery returns it.

### Roadside objects

Compilation publishes each Section's solid objects, a physical product apart from appearance, in station order: each
`{s, l, width, bottom, top, sprite, movable}`, a solid width across the road at station `s` and lateral `l`, with no depth
along it, from height `bottom` to `top`. A solid sprite, every expanded placement with a body, is one: its body's width,
from the road height plus `groundOffset` up its image's world height (read from the image once, at compilation);
`sprite` is its placement's index among the Section's expanded sprites, the identity race and appearance share, and
`movable` holds a movable body's mass and launch elevation (null for a fixed one). A solid sprite's height, and the
widest its body may be, thus come from its image's dimensions: redrawing the image at another size changes how it
collides. Each free end of a
solid wall is another: at that end's station and the wall's lateral there, its declared thickness wide and of unlimited
height (`sprite` and `movable` are null). Joined ends and walls for looks only make no objects. Vehicles meet standing objects as they meet each other
([Body contact](#body-contact)).

An object is identified by its Section and its index among that Section's solid objects: every occurrence of a Section
holds the same objects, so a Section met again meets, and keeps knocked, the same ones. The race keeps the knocked
movable objects by that identity; a standing object has no state. One search finds the standing objects near a stretch
of Route: those of the resident occurrences whose route stations lie in it, across seams; drivers' sightings, placement
and contacts all use it. In the step a vehicle pushes a movable object it is knocked: it takes the
opposite of the push on the vehicle as its horizontal force, and an upward force of that force times
`tan(launchDegrees)`, as the velocity change of that one step, and its contacts end. Flying, it is a point under gravity
alone (`VEHICLE_GRAVITY`) on its route position and height, at constant horizontal speed, stepped with the fixed step;
walls, limits and other objects do not act on it. In the step its height reaches the road height at its station it
lands: it stays there, no longer solid, for the rest of the Session, outside the Route or off any material included. The
race publishes each knocked object's Section, placement index, state (flying or landed) and place: its route position
and height while flying, and once landed the Section and Section coordinates it lies at.

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

Grid slots are listed in grid order, from the front of the grid to its back: their route s never increases along
the list. A Session's field takes the rearmost slots: the rivals in order, then the player in the last slot. Each
slot must be on supported
material, at/after entry and before the first checkpoint, finish or lock gate. The grid must hold the
Session entries; its capacity is one player plus the product maximum rival count. Starting velocity is zero.
Checkpoint and finish Carriageways must exist at the gate and have positive supported width across their
edges. Runtime crossing width is the coordinate domain at the line. A checkpoint at a continuation seam
belongs to the preceding Section, while the runtime bounds use the successor's domain at that station.
A circuit has exactly one finish; other circuit Sections have none. The fork section below owns lock and
closure geometry; the appearance compiler checks conditional signs against it. A Section with at most one outgoing Link cannot have either
lock or closure gates.

`rules` is required: `{maxLaps}`, a position-free setting. `maxLaps` is an integer from 1 through 99;
non-circuits use 1. [Series](#series-documents) own ARCADE settings.

A course is timed exactly when a series holds it. The build generates reference runs and time budgets for
timed courses only, and only a timed course offers ARCADE and the checkpoint clock. An untimed course runs
FREE PLAY and TIME TRIAL Sessions. Compilation requires the start, grid and finish coverage described
above for every course; the grid holds at least the player. Compiled `rules` retain these settings;
compiled `gates` provide the resolved grid and per-Section landmark intervals to race and tools.

### Null meanings

Empty collections are arrays: in particular, `environments: []` means no appearance.
CourseDocument nulls each have one meaning:

| Field                            | Meaning of null                                           |
| -------------------------------- | --------------------------------------------------------- |
| Strip `color`                    | Leave the earlier color channel unchanged                 |
| Strip `material`                 | Leave the earlier material channel unchanged              |
| Strip knot `left` / `right`      | That edge is open to negative / positive lateral infinity |
| Sprite `unselectedCarriagewayId` | Ordinary sprite with no exit-selection condition          |
| Sprite `body`                    | Scenery: vehicles pass through it                         |
| Sprite body `movable`            | A fixed object                                            |

### Numeric and resource domains

All numbers are finite. `COURSE_DOCUMENT_LIMITS` in `src/course/course-limits.ts` is the single
admission table for saved documents, course compilation and supplied course images. These ceilings
protect compiler resources; they are not rendering, resident-memory or device-performance budgets.
`jsonBytes` measures a saved course document's raw bytes before UTF-8 decoding and JSON parsing
(`readCourseDocumentBytes`, used by delivery, the build and authoring tools); an in-memory value given to
`readCourseDocument`, such as a live editor draft, has no byte ceiling.

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

| Scope / table key                                                       |            Ceiling | Basis                                                                                                                                                                     |
| ----------------------------------------------------------------------- | -----------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document `jsonBytes`                                                    |       64 MiB UTF-8 | 50 stages × 2 km/stage × 1000 records/km × 256 encoded bytes/record × 2, rounded up                                                                                       |
| `idCodeUnits`                                                           |                128 | 64-character stable paths/names × 2                                                                                                                                       |
| `nameCodeUnits`                                                         |                 40 | One line of the 40-column text grid                                                                                                                                       |
| Graph `sections` / `links`                                              |          128 / 384 | 50 positions × 2, rounded up; three outgoing choices per Section                                                                                                          |
| Document `assets`                                                       |               2048 | (50 × 16 local image types + 128 shared types) × 2, rounded up                                                                                                            |
| Section `pis`                                                           |                512 | (21 × 10 + 2 endpoints) × 2, rounded up                                                                                                                                   |
| Section `heightNodes`                                                   |               1024 | (21 × 20 + 2) × 2, rounded up                                                                                                                                             |
| Each Boundary/Strip `knots`                                             |               1024 | Same 20/km knot density and margin                                                                                                                                        |
| Environment array and expanded Section `environmentKnots`               |                256 | (21 × 4 + 1) × 2, rounded up                                                                                                                                              |
| Section `boundaries`                                                    |                 32 | 16 road, median, shoulder and outer Boundaries × 2                                                                                                                        |
| Section `carriageways`                                                  |                 64 | One road activation/km × 21 × 2, rounded up; supports three-way splits                                                                                                    |
| Carriageway `carriagewayLanes`                                          |                  8 | Four lanes each way on the widest planned roads                                                                                                                           |
| Non-circuit finite `routes` from the entry                              |                256 | Reference work bound: one continuous reference run per route and vehicle                                                                                                  |
| Section `spritePlacements` (expanded)                                   |              16384 | 21 × (200 + 20)/km × 2, rounded up                                                                                                                                        |
| Each Strip/sprite array `stripElements` / `spriteElements`              |               2048 | 21 × 30/km × 2, rounded up                                                                                                                                                |
| Section `walls` / each wall's `wallStrips`                              |          1024 / 64 | Both sides × 21 km × 10 wall runs/km × 2, rounded up; 32 Strips or repeats (layers, rails, posts, patches) × 2                                                            |
| Section `openLimits`                                                    |                256 | Both sides × 21 km × 3 open stretches/km × 2, rounded up                                                                                                                  |
| Wall Strip heights `wallHeightMeters` (absolute)                        |               1000 | The Strip lateral ceiling `lateralMeters`: wall heights are read as Strip laterals                                                                                        |
| `repeatCount`                                                           |              65536 | Whole-length 1 m repetitions: 21000 × 2, rounded up                                                                                                                       |
| `repeatDepth` / `textCodeUnits`                                         |             8 / 64 | Four organizational levels × 2; 32-character road legend × 2                                                                                                              |
| Section `stripExpansion` (pieces and visited constructs separately)     |             131072 | 21 × 3000/km × 2, rounded up                                                                                                                                              |
| Each curb `curbColors`                                                  |                 64 | Two 16-step hue ramps (32 colors) × 2                                                                                                                                     |
| Section `activeStrips`                                                  |                 64 | 16 base layers + 14 glyph/marking runs + 2 curbs, doubled; counts hidden pieces                                                                                           |
| Section `stripSlabs` (all color and material tables)                    |            1048576 | Expanded-piece budget × two endpoints × four for crossing subdivisions                                                                                                    |
| Section `preblendCells`                                                 |             262144 | All 1 m dyadic levels at 42000 m in both phases (aligned and half-shifted) total fewer than 168100 cells, rounded up                                                      |
| Section `coefficientBytes`                                              |              1 GiB | Moving-edge 21 km probe used about 121 MiB in one phase; both phases measure 1.9–2.0× on the RIBBON courses, about 242 MiB; ×2 length and ×2 Strip complexity, rounded up |
| Section resolved `boundaryVertices`                                     |              65536 | 32 Boundaries × 1024 knots × 2 for inherited vertices                                                                                                                     |
| Course `gates` (also bounds each Section array)                         |               2048 | 50 stage positions × (8 checkpoints + 2 branch controls + 1 finish) × 2, plus one start, rounded up                                                                       |
| Start gate `startGridSlots`                                             |                 16 | `SESSION_RULE_LIMITS.competitors`; sixteen competitors, the player included: a gameplay capacity                                                                          |
| `lengthMeters` (chainage, signed offsets, radii and lengths)            |            42000 m | 21 km × 2                                                                                                                                                                 |
| `coordinateMeters`                                                      |         ±1000000 m | Retains 100 km native-coordinate origin allowance × 10                                                                                                                    |
| `lateralMeters` / `heightMeters`                                        |   ±1000 / ±10000 m | 100 m lateral span / 1000 m elevation envelope, each × 10                                                                                                                 |
| Movable object `objectMassKilograms`                                    |           10000 kg | A 5 t concrete barrier × 2                                                                                                                                                |
| `imageEncodedBytes` / `imageMasterTexels` per image                     |    8 MiB / 1048576 | Retained 1024² master allowance; up to 8 encoded bytes/master texel                                                                                                       |
| Unique course images `imageTotalEncodedBytes` / `imageTotalLevelTexels` | 128 MiB / 33554432 | 928 image types averaging 128×64 master texels, ×4/3 mip texels, ×2 margin; allow 4 encoded bytes/level texel, round up                                                   |

Sprite and environment expansion each allow at most `expandedLimit * (2*repeatDepth+1)` work visits:
one leaf plus up to one repeat node and one iteration per permitted nesting level. Strip expansion
retains its independent `stripExpansion` work and piece budgets. The Section ceilings on Strip products — expanded
pieces (`stripExpansion`), resolved slabs (`stripSlabs`), preblend cells (`preblendCells`) and coefficient storage
(`coefficientBytes`) — count the Section's road Strips and every wall's Strips together, color and material tables
alike. This bounds empty nested repetitions
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

Limit-only revisions retain the format version. The compiler identity identifies compiled products: it advances
when a revision can change the product of an accepted input, and a revision that only narrows admission keeps it,
since every course it still accepts compiles to the same product. Existing inputs must still satisfy the current
ceilings; no migration reader or grandfathered limit set is provided.

Course compilation owns the route-count ceiling. `enumerateCourseRoutes` is the one enumeration of a course's
finite routes from the entry, each its Link list in outgoing order (a circuit has one empty route); compilation
rejects a non-circuit course with more than `routes` of them with a `resource_limit` diagnostic at the fork Section
where the first route over the ceiling leaves the last admitted one. Reference generation and reference reading
use the same enumeration.

## Geometry and bindings

The saved PI and position fields are listed above. [Architecture](architecture.md#plan-authority)
owns their authoritative planar interpretation, coordinate domain and geometric validation.
Rendering and physics read the same plan; Section length comes from its coordinate Reader domain.
An overpass is authored as separate Sections for its passages; the coordinate-domain condition
is specified in [Architecture](architecture.md#plan-authority).

Boundary knots strictly increase. Their resolved vertices define affine edges; width and center are derived.

A Carriageway is `{id, left, right, lanes}`; both edge IDs resolve to Boundaries in its Section. `lanes`, an
integer from 1 through `carriagewayLanes` (8), divides the road between its Boundaries into equal lanes numbered from
0 at the left: the centre of lane i at station s is `left + (i + 0.5) / lanes × (right − left)`
(`courseLaneCenterAt`), and the lane nearest a lateral position is the one whose interval holds it, a position on the
line between two lanes going to the lower-numbered one (`courseLaneAt`), the one tie rule of every nearest-lane choice. The compiled Carriageway publishes `lanes`.
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

Strips reference surface materials by ID. [Vehicle physics](vehicle-physics.md#material-vehicle-and-driving-documents)
owns the Surface Material format and the material catalog, the only set of material IDs.
An authored Strip material resolves its ID against the admitted
catalog; an unknown ID reports `unresolved_reference` at that Strip's `/material` path.
Material-bearing Strips compile to finite affine pieces through the same slab resolver as color. The
coordinate domain follows the material table's outer finite covered edges plus the vehicle reach bound. Color remains
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

`sourceSha256` and `materialsSha256` are the delivered SHA-256 of the course document and the
surface-material document, the [document identity](#reference-times-and-clock) the catalog supplies.
`buildSha256` hashes `{sourceSha256,materialsSha256,compiler}`.
The compiler is `superoutride.course-compiler` version 42, incorporating Link recipe v3, physical
recipe v8, image-source recipe v2 and appearance recipe v14. Source, material or compiler/recipe
changes invalidate dependent products.

Image inputs are explicit saved bytes addressed by each declared SHA-256. Shared digests resolve to
one immutable source. [Image assets](image-assets.md#course-image-sources) owns source formats and diagnostics.
Draft saving is independent of image-byte availability.

`readCourseDocument` is the only course-document admission. Each caller that admits (delivery, the
content build, authoring tools) supplies its document path once, and receives a detached, deeply frozen
`CourseDocument`. `compileCourseDocument` receives that admitted value and does not admit it again.
Build image compilation derives the delivered document from it by replacing asset digests with its
own products. Results and input diagnostics follow the shared
[admission contract](architecture.md#content-admission-toolkit); clients use code and path.
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
text parsing through the shared product document reader, and saving of the admitted source. `editDocument` installs a schema-valid
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
The compiler builds its branch controls from those gates after Links are resolved. The zone from lock through
closure lies on straight plan: every plan segment it overlaps has zero curvature. Through closure, edges are constant, roads have positive
width, and the material table supplies one contiguous supported interval at lock. Through closure,
material span edges remain parallel and the supported interval retains the same bounds. Gate and
grid support checks also read this table. Adjacent exit Carriageways require a positive-width
supported interval between their edges; this is the separating median, defined by Carriageway edges and material.
Invalid controls produce `invalid_fork`.

Exit Carriageways are ordered by their actual lock-line edges. Median centers divide supported
space into exit intervals; outer supported shoulders belong to the outer exits. The shared half-open
[lateral rule](architecture.md#boundary-geometry-and-point-ownership) assigns exact ties to the right.
A crossing outside the coordinate domain or outside every fork interval selects no route.

The player and rivals are eligible. Lock lines use the same route-s crossing function as race lines.
The first forward crossing in a fixed step wins, using the s-derived fraction u and then stable actor
ID for an exact tie. Interpolated route l, shifted by the occurrence's lateral origin, selects the
fork interval. The winner appends one successor to the shared Route. That successor occurrence is the only
stored fork choice: the occurrence after a fork occurrence on the Route (`selectedSuccessor`). A fork occurrence
with a successor is locked, so each occurrence locks once; its choice is looked up by occurrence, so repeated
passes of one fork Section are distinct. The lock, the closed Carriageways, the legal recovery targets and state-selected signs all
derive from that successor.
Checkpoint credit remains per actor.

A driver's intent has two separate values: its lane, a lane number of the Carriageway it follows at a route station,
and its target exit, an exit index at each fork occurrence. The Carriageway an intent follows (`targetCarriageway`) is,
off forks, the Carriageway existing there; at a fork, the selected exit's once the occurrence is decided, else the
intended exit's, and the Carriageway existing there where that exit does not exist; any exit, a middle one included,
can be intended, and the grid side implies none. The followed Carriageway changes at seams and, in a branching Section,
where one road ends and another begins; at every such change lanes run on by position (`routeLaneAcross`): with the lane
centres on either side compared on the route ruler (after each occurrence's `lateralOrigin`), a lane continues as the
lane whose centre is nearest its centre there; where several lanes run on as one, the nearest of them continues and the
others end there; an equal distance goes to the lower-numbered lane in either choice. Going back across a change, a
lane comes from the lane that continues into it, or from the nearest lane where it begins there (`routeLaneBefore`).
A lane number thus names one lane of one Carriageway at every station, and a lane that does not continue ends at the
change, where its driver merges (below). Lane centres need not line up across a change: the lane that continues is the
same lane, and its driver steers for its centre. The race carries each driver's lane to its station every step. The
fork field's target (`targetL`) is the centre of the intent's lane, carried to the station, in the Carriageway the
intent follows. A grid rival's lane is the lane of the Carriageway it follows that is nearest its slot (`intentLane`),
and the player's driver and takeover start in the lane nearest the player. The recovery lane
(`recoveryL`) keeps its own rule ([Recovery](#recovery)). The race assigns each rival's target exits from the
Session seed:

```text
exit = hash(seed, rivalIndex, occurrence.ordinal) mod exitCount
```

`hash` (`rivalExit`) chains 32-bit integer avalanche steps (`Math.imul`, shifts and xor), so every runtime computes
the same exits. Reference runs intend each planned Link's exit and follow no lanes: their target is the start slot's
lateral position off forks and the target exit's Carriageway centre at forks (the reference line), so lanes do not
change their path. Scenarios drive the player by its Session driver and name their exit indices. Once a fork is decided,
drivers follow the selected exit's Carriageway, their lanes carried to it by position. Unselected roads show saved
state-selected signs. At/beyond closure, an actor is on a closed Carriageway when that exit exists at its s and
its l lies between the two edges (including the edges). It recovers at the same chainage onto the selected
road; progress observations resynchronize. Geometry stays static.

Before lock, the parent covers all required queries through fixed-step advance:
`requiredEnd <= parentEnd`. After lock the selected Link extends the Route.
At every exit, the parent owns its whole `[0,L]` interval. The successor starts at the cut;
reverse travel stays on the selected predecessor in the same route coordinates.

## Route cross sections and progress

`createRouteCrossSections` produces ordered race and fork-lock lines from the append-only Route. Each
occurrence places its Section checkpoints and FINISH at route s; a circuit repeats those lines for
each lap. Lap numbers count FINISH lines along the Route: every line after the (k-1)-th FINISH
through and including the k-th FINISH belongs to lap k. Section occurrence ordinals do not determine
laps. Reverse travel does not renumber lines. The lists change only when the Route appends an occurrence. The configured final lap's FINISH,
or the terminal Section's FINISH on a non-circuit, completes the race.

`routeCrossingFraction` accepts a forward arrival when `previous.s < line.s <= current.s` and the
interpolated l is inside the closed coordinate domain at the line. Its fraction is
`u = (line.s - previous.s) / (current.s - previous.s)`. Departure from a line does not repeat an
arrival.

Crossing times are interpolated within the outer step. `previous` and `current` are the vehicle's `(s,l)` at
the start and end of one fixed step, and u and the crossing l interpolate linearly between them; they are not
the exact crossing of the path the vehicle follows through its 12 mechanics substeps. Event times
(`stepStart + u*SIM_DT`), acceptance, the deadline, finish times and fork decisions are all decided on this
approximation. Reverse travel and recovery steps grant no crossing credit. Carriageway width and material
support do not limit a race line's width.

`createRouteProgress` is the single implementation for all course kinds. Each actor retains its next
required line, accepted finish count, status and route s. It consumes consecutive lines in order,
including several crossings in one step. A missed line remains required even after the resident window has advanced past it;
recovery does not skip it. Accepted lines cannot be earned twice by backing up and driving forward.
At the terminal FINISH, the actor's distance and exact finish time are fixed. Before finishing,
distance follows route s, including backward movement, without checkpoint-based clipping.

### Race time and events

Race time is the seconds since GO, held once by the checkpoint clock: each RUNNING fixed step adds `SIM_DT`.
Each step produces one ordered event stream (`race.events`) of every competitor's accepted crossings. An event
carries its competitor, its line (landmark, lap and whether it is the completing FINISH) and its race time,
`stepStart + u*SIM_DT`, computed by one function (`raceEventSeconds`). The stream is in race-time order;
equal times keep competitor order, the player before rivals in entry order. A step that does not run
(READY hold or an ended run) has an empty stream. Reference runs and scenarios read event times from it.

Each fact is decided once. `RouteProgress` alone records accepted crossings. The clock holds time only: race time
and the deadline, which it decides: the player's crossing candidates go to it in time order, a candidate after the
deadline is refused, one exactly at the deadline is accepted, and an accepted checkpoint's award extends the
deadline at once for later candidates in the same step. Each competitor's finish time is the time of its finish
event, its last crossing (no crossing follows a finish), recorded once in its crossings; ranking reads it. The run's
ending time is the race clock's, which stops at the ending: the race publishes it as the ending's race time, which
at GOAL is the player's finish crossing. RESULT and records read that one value.

The state before GO has one owner, the start phase: WAITING until the Session starts, then READY for the 3-second
hold (`READY_SECONDS`), GO on the step boundary nearest its end. The run outcome has one owner from GO: RUNNING, then
GOAL or GAME_OVER with its cause, `TIME`
(the deadline expired) or `RANK` (a rank limit failed the player). At the end of each running step the earliest
ending among the player's finish, a rank failure and expiry decides it, and race time stops at that ending; the race
publishes the ending's race time. The
player's own crossing wins an exact tie with a failure, as it does with expiry; expiry wins an exact tie with a rank
failure.

After the ending the race keeps moving the field: every present competitor advances each step with recovery, fork
observation and Route loading, while race time, progress, events, presence and judging hold. The player's rank is
therefore fixed at the ending: competitors unfinished at that moment rank behind a finished player. Paced rivals keep
their last utilization and speed cap. After GOAL the player's input no longer reaches its vehicle: the envelope
driver at the fixed Session driver utilization (0.75) drives it in the lane nearest the position it finished at
(on a fork, in the selected exit) and planning a stop at the finish station plus that vehicle's runout distance
(`maximumSpeed² / (2*a)`, as admitted), within any Route terminal; a Session without an envelope (a DEV-tuned
vehicle) holds the brake instead. After GAME OVER the player's throttle is released: its steering and brake still
apply and the vehicle coasts.

Rank limits are ARCADE series settings by race gate ID ([series](#series-documents)). At a gate with limit N, each
lap's crossing is judged once: the player fails at the race time of the N-th crossing of that gate and lap by
another competitor before the player's own, read from the ordered event stream. Every competitor in the Session
counts; an exact tie in event time goes to the player.

The race and clock publish facts only, never display text or display durations. The race exposes one run status
(WAITING and READY from the start phase, then RUNNING, GOAL or GAME_OVER from the run outcome) and the GAME OVER
cause, and the countdown to GO: the seconds until GO (3 while WAITING, 0 from GO) and the signal lamps lit: one as
READY begins and one more each second (1, 2, 3), none while WAITING or from GO, which the product HUD draws; the clock exposes race time, the deadline in race time
(null without a time limit) and the last extension: its awarded amount and the race time of the checkpoint that
earned it. The race exposes each competitor's progress (route s,
accepted finish count, status and next race line), finish time and, on a CIRCUIT, the race time its current lap
began, its latest lap and its best lap (its fastest complete lap); the laps are null until it completes one. A lap runs
from GO (for a competitor on the grid) or from a FINISH line crossing to the next FINISH line crossing, both at their
event times; a competitor that appeared ahead completes its first lap at its second FINISH line crossing. The Route,
whose occurrences carry fork choices; the lap count and course type. One race function gives a competitor's clock:
its finish time, else race time. The race also publishes the player's standing, its rank among the competitors
present by `rankRaceProgress` and their count, which every display reads; the rank limit of the player's next race
gate (null without one or after finishing); and, when the only present rival takes part in a stage interval holding
the player's STAGE (one rival per stage), that rival's Route station less the player's, positive while it is ahead.
For records the race also publishes each competitor's race time at every race line it has crossed (every
checkpoint and FINISH line, every lap, in order) and the FINISH gate it finished at, and the route the Route is
taking, named as reference runs name routes: the Link IDs of the one enumerated course route (`enumerateCourseRoutes`)
that holds every Link the Route has appended, empty on a CIRCUIT, and null while more than one route still does.
The run's other identities already exist: the compiled course's build identity and the Session vehicle's identity
(`sessionVehicleSha256`), which time budgets also carry. The race also counts simulation seconds, every advanced fixed step (READY and after the ending included), the time
base for displays timed across the ending, and stamps each competitor observation's latest shift with it. The shell
derives the HUD and RESULT from these facts ([Browser](browser.md#hud)).

Stages count race gates: the player's STAGE is one more than the race gates (checkpoints and FINISH lines) the
player has crossed since GO, continuing across laps and counted by number whichever branch the route takes. STAGE
k runs from the (k−1)-th gate to the k-th; STAGE 1 runs from GO to the first gate. A competitor whose entry has a
stage interval is present in the Session until the player has crossed its last stage's closing gate and the
competitor is out of view: behind the camera, or farther from it than the farthest rendered depth, both read from
the camera window in the Route runtime's loading coverage. Leaving is final. A competitor that is not present is not
moved, ranked, judged by rank limits, counted for fork arrival, observed, drawn or voiced; the race exposes each
competitor's presence and the player's STAGE. A competitor joining at a later stage appears in the step in which the
player enters that stage: at the player's route station plus its ahead distance, in its lane, moving at its
driver's planned speed there (the speed that is the driver's own planned target at that station, with the vehicle
ahead in that lane as its constraint, a standing object in that lane counting as a stopped vehicle), and awaits only
the race gates after that station. An appearance reads the drivers' sightings, refreshed as the vehicles stand when it
is decided, and the drivers' rules ([Vehicle envelopes and drivers](#vehicle-envelopes-and-drivers)): the appearing
vehicle, at its lane's centre, in line with the road and at its planned speed, is a vehicle ahead to those behind it. It waits for a
later step while its place overlaps another vehicle's footprint or while a driven vehicle behind in its lane, whose
driver never changes lanes to pass, could not stop for it (one moving backward can): for that vehicle's route speed `v_b` and its driver's braking `a_b`,
the gap Δs and the appearing speed `v`,
`v_b² > v² + 2 × a_b × max(0, Δs − (L₁ + L₂)/2 − terminalClearance − v_b × responseSeconds − v × followSeconds)`,
the same constraint the drivers plan with. A vehicle behind whose driver passes (a rival, or the player's
takeover after GOAL) moves over or matches the new vehicle's speed, and the player avoids it, so neither holds an
appearance back, however close. Session assembly rejects an ahead distance beyond the Route kept loaded ahead of
the player (the loading coverage's forward distance less one step).

Ranking is one race-layer function (`rankRaceProgress`). Finished actors rank first by finish time. Unfinished
actors rank by descending route s, which includes lap separation. Equal finish times or equal unfinished stations
share a rank. Rival positions and audio observations already use the same route coordinates as the player. Rankings count the
competitors present.

## Series documents

A series document (`superoutride.series` version 9) is the one owner of its courses' ARCADE settings. It is
saved as `content/series/<id>.series.json`; `id` equals that file name stem, which is also its manifest ID.

```json
{
  "format": "superoutride.series",
  "version": 9,
  "id": "ribbon",
  "title": "RIBBON",
  "dev": true,
  "vehicles": ["TESTAROSSA"],
  "timeMargin": 1.35,
  "fixedColors": false,
  "courses": [
    {
      "course": "ribbon-coast",
      "laps": 1,
      "entries": [
        { "vehicle": "TESTAROSSA", "color": "original", "pace": 1, "stages": null, "slot": 15, "ahead": null }
      ],
      "playerSlot": "last",
      "rankLimits": {},
      "traffic": {
        "density": 10,
        "vehicles": ["GOLF_GTI_16V", "DELTA_HF_INTEGRALE", "PX200E_ARCOBALENO"],
        "speedKilometersPerHour": 80
      }
    }
  ]
}
```

`title` is the display name. `dev: true` marks a development series: front ends show it only with DEV.
`vehicles` lists the ARCADE vehicle candidates, at least one, unique and in the catalog, in selection order.
`timeMargin` is the series' one time margin: positive, finite and at most 10. `fixedColors` says whether the
player drives in its entry's color rather than its own chosen color. `courses` lists at least one delivered
course, each with its ARCADE `laps` (1 through 99), `entries`, `playerSlot`, `rankLimits` and `traffic` (null, or
traffic settings whose vehicles are catalog vehicles; see [Traffic](#traffic)). `entries` lists the
whole field, 1 through 16 entries, each a catalog vehicle, a color its sprite set declares, a positive pace ratio `pace`, `stages` (null for the
whole run, or `{first, last}` with `last` at least `first` and no later than the stage count of every run of the
course: its race gates per route, times the laps on a circuit) and one appearance. An entry taking part from STAGE
1 has a grid `slot` index (0 through 15) and `ahead: null`; grid entries are in grid order with strictly increasing
slots. An entry whose first stage is later has `slot: null` and `ahead: {distance, lane}`: a positive distance
in metres ahead of the player and its lane number, which every Carriageway of the course has, so it is a lane on
every route. On every route the distance
falls short of the next race gate and the next fork lock after the gate opening that stage. Every candidate vehicle
has at least one grid entry, which the player can take. `playerSlot` is `own` or `last`. `rankLimits` maps a race gate ID to its rank
limit N. Admission checks each document once, from the build's files or the delivery manifest alike, against the
delivered course IDs and the vehicle catalog. Until selection screens choose a series, a course belongs to at most
one series; a second one is rejected. A series course is admitted against its compiled course: `laps` within
`maxLaps`, every entry's slot within the grid, every ahead lane below the fewest lanes of the course's Carriageways,
and rank limits naming checkpoint or FINISH gates of that course
with N an integer from 1 to below the field size (the number of entries). The build admits every series course; a
Session admits the course it drives.

The delivered series is RIBBON (`dev: true`, colors not fixed): RIBBON COAST, RIBBON FORK and RIBBON RING with
TESTAROSSA, whose fields are 1, 3 and 3 TESTAROSSA entries in its default color with pace ratio 1 in the grid's rearmost slots, with
`playerSlot: last`. RIBBON COAST has traffic (10 vehicles/km of GOLF_GTI_16V, DELTA_HF_INTEGRALE and PX200E_ARCOBALENO
at 80 km/h) on its four- and two-lane Sections, none on the one-lane `rough-track`; RIBBON FORK and RIBBON RING have
none. RIBBON COAST is the [verification course](#verification-course).
RIBBON ROUGH belongs to no series.

## FREE PLAY document

`content/free-play/default.json` is the one `superoutride.free-play` version 1 document (manifest kind `free-play`,
ID `default`): FREE PLAY's own rules, the same on every course.

```text
FreePlay {
  format: "superoutride.free-play", version: 1,
  rivalPools: [{id, forms}], traffic: [{id, density}], trafficSpeedKilometersPerHour
}
```

`rivalPools` are the POOL choices in order: each an uppercase ID and the nonempty, unique vehicle forms (`car`, `bike`)
it draws from. Each form has a pool of that form alone, the default pool of a vehicle of that form. `traffic` are the
TRAFFIC levels after OFF, in order: each an uppercase ID other than `OFF` and a density in vehicles per kilometre in
(0, 40] (`SESSION_RULE_LIMITS.trafficDensity`). `trafficSpeedKilometersPerHour` is the one traffic speed, in
(0, 864]. Admission checks the document once, from the build's file or the delivery manifest alike. The delivered
document has the pools ALL (cars and bikes), CARS and BIKES, the levels LOW (5 vehicles/km) and HIGH (30) and 80 km/h.

## Session and reference timing

### Resolved Session

ARCADE resolves its series course: a series vehicle candidate, the course's series entries and laps and the
checkpoint clock. The player takes the rearmost grid entry of its vehicle in grid order: with `own` it stands in
that entry's slot and every other grid entry in its own; with `last` it stands in the rearmost of the grid entries'
slots and the other grid entries, in order, take the slots in front. Each other entry is a rival with its own
vehicle, envelope, color, pace ratio and stage interval; one with an ahead appearance has no slot. The player's color is its entry's when the series fixes colors, otherwise the player's chosen color (the
player record's color for the vehicle when its sprite set declares it), otherwise the vehicle's default color. FREE PLAY resolves a catalog
vehicle, zero to fifteen rivals within the grid, a rival pool, a traffic level and permitted laps; it has no clock.
TIME TRIAL resolves a catalog vehicle and permitted laps on any course; the player runs alone, without
rivals or clock, and selects fork routes by driving like any first competitor at a lock line. One admission,
`compileSessionConfiguration`, derives these rules from a request and checks it against the course, its series course and
the vehicle catalog and the [FREE PLAY document](#free-play-document); the configuration carries the FREE PLAY rival pool.
ARCADE takes its series course's traffic; FREE PLAY takes the TRAFFIC choice: OFF is none, and every other level is the
FREE PLAY document's density at its traffic speed with every catalog vehicle as candidates.
Traffic settings are null or `{density, vehicles, speedKilometersPerHour}`, which series admission checks: a density in
vehicles per kilometre in (0, 40] (`SESSION_RULE_LIMITS.trafficDensity`), at least one unique vehicle ID, and the one
traffic speed in km/h in (0, 864] (`MAXIMUM_VEHICLE_SPEED` in km/h). Session resolution converts that speed to m/s once
(÷ `KILOMETERS_PER_HOUR_PER_METER_PER_SECOND`, 3.6), resolves each traffic vehicle's Session vehicle and envelope (a
missing envelope is a `RangeError`) and compiles its driver once: the rival utilization 0.75 with that speed as its
speed cap, so a vehicle whose envelope maximum is lower keeps its own maximum; curve speeds and following are any
driver's. On an untimed course, Session resolution rejects ARCADE; an ARCADE clock without its delivered time
budgets fails. Unsupported course/vehicle/grid/lap combinations fail before
activation. A Session binds immutable course, entries, lap target, start speed and timing references. Its entries
list the player first, then the rivals: each has a stable ID (`PLAYER`, then `RIVAL_01`, `RIVAL_02`, …), its grid
slot, its Session vehicle (vehicle calibration and protection settings) and that vehicle's envelope. In FREE PLAY and TIME TRIAL the
player stands in the grid's last slot and the rivals in the slots directly in front of it, `RIVAL_01` frontmost.
Each FREE PLAY rival is a vehicle/color pair drawn from the rival pool (`ALL`, `CARS` or `BIKES`; every color each
pool vehicle's sprite set declares) by the Session seed: a seeded shuffle of the pairs other than the player's own,
reused in the same order only after every pair has been drawn, so the player's pair is drawn only when the pool
holds nothing else. Each rival drives its own vehicle with that vehicle's envelope. Each entry also carries its color.
Resolving a Session with rivals requires every rival's Session vehicle and, in FREE PLAY, the pool; a missing one is a
`RangeError`, never the player's vehicle. What a Session needs is decided with its entries (`sessionDemand`): the
FREE PLAY rival pairs, every other vehicle that may drive in it (series entries, the pool when it has rivals, traffic
candidates), the clock's time budgets and ARCADE's pace schedule; the browser loads exactly these.
The start speed is a resolved Session setting: every competitor spawns at its grid slot moving at it along the
road tangent. It is finite and may be negative; product Sessions and reference runs use 0. The Session seed is a
32-bit unsigned integer that Session resolution takes with the configuration and checks; rival target exits derive from it. The
browser picks a new seed for every Session assembly ([Browser](browser.md#display-and-scheduling)); reference runs,
TIME TRIAL Sessions without rivals, use 0, and scenarios and tests fix theirs. The race builds each
competitor's mechanics from its entry's vehicle and each rival's driver from its entry's envelope; the player's
composition supplies input only.
The player's envelope is optional. A Session without one—a DEV-tuned vehicle, whose driving definition has no delivered
identity—must have no rivals and no time limit; Session resolution rejects any other combination with a RangeError,
and the race builds a rival driver only from an envelope.
Before activation, every FINISH in a Section with no outgoing Link must have at least
`maximumSpeed² / (2*a)` metres remaining to that Section's end for every entry with an envelope, the player
included. Here `a` is the minimum measured envelope braking multiplied by the fixed Session driver utilization (0.75),
for ARCADE rivals too, whose own speed plan brakes for that end at their current utilization;
the entry needing the longest stop decides the requirement. Admission rejects insufficient runout with a
RangeError naming the FINISH, that entry's vehicle, available metres and required metres; the browser shows this
through its loading failure state.
A circuit FINISH and an undecided fork are not terminal stopping points.

A run's start begins a standing run. PAUSE/hidden-page time consumes no simulation time. GOAL or GAME OVER
stops the field and preserves final rank and precise event time.
Recovery consumes simulation time and grants no crossing credit. Results are session-local.

### Reference times and clock

`tools/course` owns reference generation, its policy and report-to-budget admission. The product
reads completed envelopes and time budgets and owns live Session driving policy.
Build-generated continuous reference runs are TIME TRIAL Sessions: product physics, the configured start from the
last grid slot and finite routes/laps, with the reference driver alone and no clock. Each successful run records the race's event stream for the player
([race time and events](#race-time-and-events)): ordered crossings with their race times, including within-step
fractions. Reading a report derives the order and laps a run must record from the race's own lines: it builds the
planned route's Route and reads its `RouteCrossSections` race lines through the completing FINISH. Recovery, wrong-route choice, timeout or incomplete FINISH invalidates a timing product.
Maximum-lap runs supply their actual prefixes; starting and later-lap arrival classes remain distinct.

Identity includes course/compiler, vehicle/calibration/protection, driver policy, fixed step, start
and seed inputs. A document's identity is the SHA-256 of its delivered bytes: its manifest digest in
delivery, and in the build the digest of the bytes the build delivers (each catalog source carries it).
The vehicle digest (`sessionVehicleSha256`) is SHA-256 of the JSON
`{"vehicle":…,"driving":…,"surfaceMaterials":…}` holding the delivered SHA-256 of the vehicle mechanics,
driving and surface-material documents. Everything a Session drives—compiled mechanics, driving
settings and material physics—derives from those documents; the vehicle listing is not part of it. Any
change to their delivered bytes changes `vehicleSha256`; a listing change does not. A DEV-tuned driving
definition is not delivered and has no identity, so a Session rebuilt by DEV tuning uses no envelope or time
budgets ([Browser](browser.md#dev-controls)). This digest is a
reference-cache key component and is independently recomputed by browser envelope and budget admission;
both reject products carrying an old digest.
The reference model hash tracks compiler/mechanics code; authored JSON values belong to the per-vehicle
digest, so editing one vehicle does not invalidate unchanged vehicles' cache keys. The reference driver has one
identity, `REFERENCE_DRIVER_SHA256`: SHA-256 of its record's JSON with sorted keys. Reference-run cache keys,
saved reports (`superoutride.course-reference` and `superoutride.reference-run` version 2 record it as
`driverSha256`) and report admission all use it. Envelope measurement does not use the reference driver: its cache
key names the measurement procedure (`ENVELOPE_MEASUREMENT`: version, fixed step and reference surface). Measurement
version 2 measures on the unit reference surface ([Calibration](calibration.md#vehicle-settings));
the version advances whenever the procedure changes. The delivered envelope carries only its rows and maximum speed;
the measurement record stays in the reference cache and the `envelope` command's output. For a budget state, reference duration is the maximum upcoming interval among
continuous histories sharing that state and its legal next checkpoint/finish alternatives.

```text
budgetMs(state) = ceil(1000*timeMargin(series)*referenceSeconds(state))
```

Time budgets are keyed by course, vehicle and route state. Each delivered budget file belongs to one course and
vehicle (`<course>/<vehicle>`), and each of its values belongs to one route state, a gate and lap. A value is the
longest legal upcoming interval from that state over every route the course admits, so it never depends on the
route already driven.

The margin and duration are positive finite values. START receives the initial budget. Each newly
earned non-finish checkpoint adds the next budget once, carrying unused time without a cap. FINISH
adds none. Precise event times determine ordering; awarded budgets alone round to integer milliseconds.
All consecutive gates crossed in one step retain their race times. Earlier expiry ends the
run; a valid checkpoint or FINISH wins an exact expiry tie ([race time and events](#race-time-and-events)). Rejected late crossings earn no line or lap credit.

### Pace schedules

A pace schedule (`superoutride.pace-schedule` version 1) records a vehicle's reference pace on a series course for
ARCADE rival pace. It carries the course build and vehicle identities of a time budget and the station spacing, 5 m:
a Section's schedule stations are every 5 m from its start, then its end. `start` gives the race times from GO, in
integer milliseconds, at the entry Section's stations from the first one the reference reaches. `sections` gives,
for each Section a reference run passes from its start, the fastest time over all of that course's reference runs
from the Section's start to each station it reaches, starting at 0; times increase strictly. The build derives
both by interpolating the run's race time between fixed steps at each station's route station. An ARCADE Session
admits the player vehicle's schedule once, against the compiled course and the Session vehicle; no other vehicle's
schedule and no FREE PLAY Session reads one.

An ARCADE rival follows that schedule divided by its entry's pace ratio p. Its target time at a station sums, Section
by Section along the Route it runs, the schedule's times divided by p: a grid rival's from GO along the start
schedule, from the player vehicle's reference start; a rival appearing ahead's from its appearance, on schedule at
the first station its schedule times. Between stations the times are interpolated linearly. Its difference is race
time minus target time, positive when behind. Its target utilization is proportional to the difference: the driving
definition's `rivalPace.minimumUtilization` at `-bandSeconds` or below, `maximumUtilization` at `+bandSeconds` or
above, linear between. The rival's utilization starts at the middle of the bounds and, each fixed step, follows the
target as a first-order lag with time constant `responseSeconds`. Its speed cap is its own vehicle's envelope maximum
speed times a fraction that runs linearly from `minimumSpeedFraction` at the minimum utilization to 1 at the maximum.
Where its schedule times no station (past the last timed station of a Section, or on a Section no reference run
passes from its start), the utilization and speed cap hold and the next timed station anchors the targets anew. The
rival reads nothing else, in particular not the player's position or vehicle. FREE PLAY rivals drive at the fixed Session
driver utilization (0.75). Session resolution compiles each entry envelope's fixed driver (that utilization at the envelope's
maximum speed) once; the runout check, the race's unpaced rivals and the player's post-finish driver use that one.

### Vehicle envelopes and drivers

Generated envelopes contain maximum speed and speed-indexed acceleration, braking and lateral-response
observations for each vehicle configuration. The driver consumes an envelope, utilization, speed cap
and lane; the utilization may change from one step to the next. Its workspace caches each 5 m cell's curvature by
road and lane, and its curve speed also by envelope, utilization and speed cap, so a steady utilization reuses both; it reads a contiguous 5 m lattice up to 480 m ahead and publishes canonical steering,
throttle and brake. [Calibration](calibration.md) lists utilization values.

Drivers read the surface ahead. Each cell reads the grip factor of the material under its lane at the cell's start (no
material: no grip): its curve speed uses the envelope's lateral limit times that grip, and braking toward a cell, the
terminal or the vehicle ahead uses the planning braking times the least grip on the lane from the driver's first cell
through the cell where that braking ends. On asphalt (grip 1) the plan is the envelope's own. Steering does not read
grip.

The driver always treats the end of a Section with no outgoing Link as a zero-speed planning point.
The Route exposes that terminal station only when its tail is such a Section; loaded tails
with outgoing Links, including undecided forks and circuit continuations, do not request a stop.
The speed plan is bounded by `sqrt(2*a*d)`, with d reduced by the driver's response distance and a
2 m terminal clearance (`terminalClearance`, the distance left before a terminal or behind the vehicle ahead). The
driver holds the brake when its target speed is within the speed deadzone of zero (a stopped vehicle ahead keeps a
residual speed), using ordinary vehicle physics. It does not inspect finish status or introduce a finished-driving
state. Thus a finished LINEAR/BRANCH rival decelerates and stops on the runout while the Session
continues; a finished CIRCUIT rival keeps driving. The player's takeover after GOAL is the same driver with a stop
station as its terminal.

Drivers keep clear of other vehicles. Each step the race gives every driver (rivals and the player's takeover after
GOAL) a read-only list of the vehicles present in the Session as they stand at the step's start: route position,
route speed (its velocity along the road's tangent at its station, negative while it moves backward), travel
direction relative to the road, dimensions, the lateral each is heading for at its station (its driver's
target lateral; its own lateral while the player drives it) and the driver driving it, the player's vehicle included;
drivers write no vehicle state. The list also holds the standing
roadside objects ([Roadside objects](#roadside-objects)), fixed and movable, wall ends included, from the rearmost
present vehicle's station to the foremost one's plus the driver lookahead (`ENVELOPE_DRIVER.lookahead`), each read
from its Section's station-ordered list: an object is a stopped vehicle of zero length and its width, heading for its
own lateral, at rest in line with the road. Knocked objects and barrier lines are not in it. An object standing in a driver's lane is thus a stopped
vehicle ahead to it, and one outside every lane occupies none. A vehicle occupies both the
lanes it overlaps where it is and the lane it is heading for: it is in a lane for a driver when either its lateral or
the lateral it is heading for lies nearer that lane's centre at its station than half the two vehicles' widths. Three
judgements, each with one implementation, decide every driver decision (merging, passing, following, the player's
takeover after GOAL) and every appearance: whether a vehicle occupies a lane (this test), which vehicle is ahead in a
lane, and whether the driven vehicles behind in a lane can stop for one ahead (the plan constraint below with that one
as their vehicle ahead).

A driver's steering path into a lane is where its pursuit steering takes it: traced kinematically in the road's frame,
as on a straight road, from its lateral and travel direction, steering for the lane's centre its steering lookahead
ahead (its response distance at its speed, at least `minimumLookahead`, 8 m; within the resident Route), over four
lookaheads; the lane's centre beyond. The vehicle ahead in a lane is the nearest vehicle ahead that occupies that lane
or that the driver's steering path into it meets: comes nearer to it side to side than half the two widths anywhere
over the stations where their footprints overlap lengthwise. A vehicle a driver is moving away from thus stays ahead of
it until its path clears that vehicle, and one it can steer clear of no longer holds it back.
Drivers decide in turn, the competitors in competitor order and then the traffic in order of appearance; a driver that
moves to another lane heads for it in the list at once, so drivers deciding later in the same step see the move, while
positions and speeds stay as at the step's start.
It is a constraint of the driver's plan, braked back like a curve speed: with the gap Δs to it, its route speed `v_a`
(0 while it moves backward: it is planned for as stopped), the driver's speed `v` and planning braking `a`,

```text
gap    = max(terminalClearance + v_a × followSeconds, escape)
margin = max(0, Δs − (L₁ + L₂)/2 − gap − v × responseSeconds)
target² ≤ v_a² + 2 × a × margin
```

so a driver following at the leader's speed keeps the footprint gap `gap + v × responseSeconds`. `escape` applies to a
driver that passes, and to any driver behind a standing object (which ends its lane, below); for others it is 0. It is
the least footprint gap from which the driver's steering path from rest (at its lateral, in line with the road) into an
adjacent lane of the Carriageway it follows passes clear of the vehicle ahead side to side and stays clear, or 0 when
no adjacent lane does. Such a driver stops that far behind a stopped vehicle, at least `terminalClearance` (2 m), and
when the adjacent lane is free it starts and steers into it past the stopped vehicle; any other driver stops
`terminalClearance` behind it. The
plan is computed once per step, with and without this constraint. Whether a driver changes lanes to pass is an attribute its
builder gives it (`passes`: whether it changes lanes to pass): rivals' drivers and the player's takeover pass; traffic
drivers, which Session resolution compiles, do not. When the constraint lowers the planned speed, a driver that passes
weighs each free adjacent lane of the Carriageway it follows by the speed its plan allows there: its plan without a
vehicle ahead, behind that lane's vehicle ahead under the same constraint (the current lane's curve speeds serve, since
adjacent lanes differ little in them). It moves to the lane allowing the most, the left one on a tie, when that exceeds
its constrained plan by more than `passingMargin` (0.15 m/s), and drives that speed in its new lane. It stays
in its lane until another lane is faster by that margin. A lane is free when no
vehicle in it lies between the driver's following distance ahead, `(L₁ + L₂)/2 + v × followSeconds`, and, behind,
half the two lengths plus that vehicle's speed times `followSeconds`. With no faster free lane, or when it does not
pass, the driver follows on the constrained plan; its inputs stay throttle, brake and steering. Every driver's `a` is its envelope's minimum
braking times its utilization; the player's, for others' checks, is the Session driver's. The reference line plans
without a vehicle ahead and meets no other vehicle, so reference runs are unchanged.

Where a driver's lane ends, it merges first, passing or not: this is not a pass. A lane ends at the first change of the
followed Carriageway within the driver's lookahead across which it does not continue, by the position rule above, or at
a standing object in it (one that occupies the lane) nearer than that, whichever comes first. At a change the lane to
merge toward, when it is the first change ahead, is the lane before it that continues into the same lane; at a standing object it is the adjacent lane that does not end
within the lookahead, the lower-numbered one when both qualify, and none when neither does. The driver moves toward it
one lane at a time. Each
step that its lane ends ahead, the driver moves to the next lane toward it when that lane is free (the free-lane test
above) and every driven vehicle behind in it can follow the driver, the plan constraint above with the driver as the
vehicle ahead at its speed; vehicles in the lanes that continue do not yield. While its lane still ends at a change, the
change is a terminal of its plan, so it slows to stop `terminalClearance` short of it until it can merge; an appearance in
a lane that ends there plans to stop the same way. A standing object is the vehicle ahead in the lane it ends, and every
driver keeps its escape gap behind it, passing or not, so it can still merge from rest. A driver that passes does not move into a lane that ends within its
lookahead. Where a seam adds lanes, every lane continues as its nearest lane, and only a driver that passes moves into
an added lane, by the passing rule.

A lane count changes only at a seam or within a branching Section: in any other Section the followed Carriageway keeps
its lane count wherever it changes (`invalid_carriageway`). A Link matches the outgoing and incoming Carriageways' edges,
so a seam that changes the lane count also changes the lane width and moves the centres; RIBBON COAST's seams move them
by the amounts in the Verification course section, and its drivers steer for the new centres.

The same driver serves reference runs and live rivals. Generated runs contain precise landmark times
and optional 10 Hz position/speed/utilization traces. The browser loads generated envelopes and compact
integer-millisecond budgets. [Development](development.md#build-outputs) owns generated file locations.

## Traffic

Traffic vehicles are not competitors: they have no rank, rank limit, fork decision (the fork field never observes
them), progress, events, record or pace, and the HUD does not count them. Each is an ordinary vehicle (its own
mechanics, recovery and the same driver as rivals, except that its driver never changes lanes to pass: behind a slower
vehicle it follows at that vehicle's speed; where its lane ends it merges as every driver does) whose role in the Session is traffic; no vehicle document marks it. Heading for a
fork's exit Carriageway is not a lane change. Traffic positions lie on the Route at stations `offset + k × 1000/density` (k = 0, 1, …);
the offset in [0, spacing), and each position's vehicle, color and lane (a lane number of the Carriageway at that
station), derive from the Session seed and k through the same 32-bit mixing as rival exits. At a fork a traffic
vehicle heads for the selected exit, else for an exit drawn from the seed, k and the occurrence ordinal; one left on a
closed road recovers like any vehicle.

The appearance line is the player's route station plus the farthest rendered distance ahead of it,
`s − cameraDistance + far` from the loading coverage's view. In each step in which the line reaches a position, a
traffic vehicle appears there, at its lane's centre and its driver's planned speed behind the vehicle ahead in that
lane, the same appearance as a later stage's entry. Positions at or before the line when the Session starts never appear. A position passes unused,
never to appear later, when `min(16, 32 − competitors)` traffic vehicles are present (`SESSION_RULE_LIMITS.traffic`
and `.vehicles`), when the resident Route does not reach it yet, when the Carriageway there has one lane (traffic
appears only on roads of two or more lanes), when its place overlaps another vehicle's footprint
([Body contact](#body-contact)), or when a vehicle behind in its lane whose driver never changes lanes to pass, another traffic
vehicle in practice, could not stop for it (the appearance rule above). A traffic vehicle leaves, for good, once out of view by the same rule as competitors.
Traffic exists only where the player can see it: it appears at the farthest visible distance ahead of the player
and leaves once out of the player's view, so competitors far from the player meet none.
The race publishes traffic observations in their own list. Records do not depend on traffic settings.

## Body contact

The race computes body contact once per fixed step, from the state at the step's start, over the vehicles present
in the Session (the competitors in competitor order, then the traffic in order of appearance); the force on each holds through that step and enters its vehicle mechanics as
the external force ([Vehicle physics](vehicle-physics.md#body-contact)). There is no contact during READY. A
vehicle's contact shape is its footprint laid along the road at its route position (s, l): it does not turn with the
vehicle's yaw. Its height range runs from its bottom, its world centre-of-mass height less `desiredCgHeight`, to its
bottom plus `overallHeight`. For two vehicles with route-coordinate differences Δs and Δl and bottoms B₁ and B₂:

```text
overlapS = (L₁ + L₂)/2 − |Δs|     overlapL = (W₁ + W₂)/2 − |Δl|
overlapH = min(B₁ + H₁, B₂ + H₂) − max(B₁, B₂)
```

with overall lengths L, widths W and heights H. A contact begins when all three are positive, so a vehicle in the
air passes over one below it. Its face, an axis and a side, is decided once, as it begins, from the pair's route
positions at the start of the previous step (Δs⁻, Δl⁻): the axis is ahead-behind when the vehicles were apart
ahead-behind (`(L₁ + L₂)/2 − |Δs⁻| ≤ 0`) while overlapping side to side, and side to side in the opposite case. When
they were apart on both axes, the axis is the one that began to overlap later within the step, moving each relative
position linearly from Δ⁻ to Δ; ahead-behind when both began together. The side is the sign of that axis's relative
position Δ⁻. A contact begins with both axes already overlapping when two footprints overlapped while their heights did
not — a vehicle in the air above another vehicle or a standing object — and their heights come to overlap;
recovery and appearance never place a vehicle on another's footprint or a standing object's, so no other contact begins
overlapped. Such a contact's axis is the one with the smaller overlap in the step it begins, and its side the current
relative position. The race keeps each pair's face, keyed by the two vehicles' ids, until their footprints separate: until the
overlap along the face, `(L₁ + L₂)/2 − side × Δs` (or the width form), or the other axis's overlap is no longer
positive. The overlap along the face grows on even if a vehicle passes the other's centre. Pairs no longer in contact,
and those of vehicles gone from the Session, are forgotten. The height overlap decides only whether the vehicles
touch: while it is not positive there is no force, and a contact does not begin. The force acts along the
horizontal world direction of the face's axis, the road's tangent or its right, read at the pair's midpoint, with
equal magnitude and opposite sign on the two vehicles, on the overlap along the face; its approach speed is their
relative world velocity along that direction. The spring-damper is the Session's one `bodyContact`, read at Session resolution from the Session's driving definition
(the player's), for every contact, wall, course limit and object in the Session.

A standing object meets every vehicle present by the same rule, as a party of zero length and its width at its route
position, with its height range, at rest: its position one step earlier is its position. A fixed object never moves, so
the reduced mass is the vehicle's and only the vehicle receives the force. A movable one's reduced mass comes from the
two masses, and the push knocks it ([Roadside objects](#roadside-objects)). Each step a vehicle meets every standing
object whose route station lies within its length, across seams, so an object just past a seam is met before the
vehicle's centre crosses it; the pair is keyed by the vehicle's id and the object's identity, and the contact faces alone
hold which pairs are in contact. Near a solid wall's free end both the wall's line and the end
object can push a vehicle; their forces add.

### Barrier lines

Walls and course limits act on every vehicle present, in every step after READY, from the state at the step's start;
the race adds their force to the body contact force. A barrier line acts on a vehicle whose centre's Section station
lies within it (a wall: from its `from` through its `to`). Its overlap is half the vehicle's overall width less the
centre's lateral distance from the line, measured toward the side the line keeps it on: a course limit keeps vehicles on
its material side; a wall keeps a vehicle on the side its centre was on when it began to touch the wall, as a contact
keeps its face, until they no longer overlap (the contact faces hold that side, keyed by the vehicle's id and the wall), so
a vehicle whose centre crosses the line is pushed back, never through. While the overlap is positive the line pushes along the
road's horizontal right, away from the line, with the same spring-damper on the vehicle's own mass (the line does not
move), `F = max(0, m(ω²x + 2ζωv))`; `v` is how fast the overlap grows: the vehicle's lateral speed toward the line plus
the line's slope times the vehicle's speed along the road, since a slanted line closes on a vehicle driving along it.
Friction along the road's horizontal tangent opposes the vehicle's speed along the road with magnitude
`min(barrierFriction × F, m × |v_along| / step)`, never reversing that speed within the step. No vertical force or moment
arises and height is not compared. Recovery rules are unchanged: a vehicle past an open limit, or beyond either end of the
resident Route, recovers as before.

Recovery and appearance place no vehicle on another present vehicle's footprint. Recovery backs its target along
the Route behind each vehicle in the way, by `placementClearance`, until the place in its lane there is free (or
the resident Route begins); wrong-course recovery does the same on the selected road. An appearance whose place is
occupied waits for a later step. These choose where a vehicle is placed; they move no vehicle.

## Recovery

Airborne driving is ordinary; recovery applies only when driving cannot continue: coordinate-domain
exit, an inverted landing, falling through the heightfield, being held against a fixed object (blocked), leaving the
locked fork route (wrong course) or a manual request. [Vehicle physics](vehicle-physics.md#airborne-state-and-recovery) owns the conditions. It reconstructs
pose, velocities, wheels, actuators, powertrain and observations at known supported coordinates while
preserving steering/tire calibration and earned gates, locks and laps. Manual recovery is a race operation on the
player: the ordinary recovery toward the centre of its road, the legal-road check, a progress baseline reset that awards
no progress, then a fresh player observation.

The fixed recovery policy is one immutable record (`RECOVERY_POLICY`) shared by every competitor; it holds
rules only, no live state or target resolution:

| Policy value         | Value    | Meaning                                                                           |
| -------------------- | -------- | --------------------------------------------------------------------------------- |
| `holdSteps`          | 44       | Consecutive fixed steps a condition holds before recovery (44 × 1/60 s ≈ 0.733 s) |
| `blockedSpeed`       | 0.15 m/s | Speed below which a vehicle held against a fixed object counts as stopped         |
| `backtrackDistance`  | 8 m      | Route distance recovery backs off; loading coverage reads it                      |
| `minRecoverySpeed`   | 18 m/s   | Lower bound of the recovery speed (none for `blocked`, which recovers at rest)    |
| `maxRecoverySpeed`   | 32 m/s   | Upper bound of the recovery speed                                                 |
| `speedRetention`     | 0.58     | Share of forward speed kept, before the bounds                                    |
| `placementClearance` | 1 m      | Gap left behind the competitor a recovered vehicle is placed behind               |

The race reports, for every vehicle present, whether a fixed object pushed it in the step's contacts; the `blocked`
condition reads that report. Recovery is not a Session rule.

Route recovery backs off from the farther of causal current chainage and last-safe chainage
([Vehicle physics](vehicle-physics.md#airborne-state-and-recovery)). The race owns target resolution: its
recovery placement (its target lateral from the fork field's `recoveryL`, behind any vehicle or standing object in the
way, see [Body contact](#body-contact)) is passed to recovery separately from the policy: a driven
competitor recovers to its driving target (`targetL`, the centre of its lane); the player, which has no driver intent,
recovers to the centre of the selected Carriageway, else of the Carriageway existing there.
Wrong-route recovery uses the selected Carriageway at the observed station (`legalTarget`).
Every spawn and recovery target, route-derived or explicit, passes one check (`supportedTargetSurface`): its l
lies within the coordinate domain (`lateralAt`) and its surface has a material. Targets are race-made, so a
violation is an internal invariant failure (`Error`).
Known recovery coordinates use the shared route. Observers resynchronize once, suppress reset
crossing credit and update the player
camera before rendering. Unrelated internal faults propagate.

## Verification course

`ribbon-coast` (RIBBON COAST) is a 10.1 km LINEAR verification course, not a product course: it gathers the
situations Stage 13 exercises — lane counts, contacts, traffic, walls and roadside objects — in one timed ARCADE
course, favouring kinds of scene over looks. Its five Sections chain by Links; every Section starts and ends level at
height 0, and each starts with a taper from the previous road width. Lane counts run 4 → 2 → 1 → 2 → 4. The
reference driver completes it in 170.4 s; checkpoints come about every 2 km.

At each seam the Carriageway keeps the previous road's width (the Link rule) and then tapers, so the lane centres
move across it. Lanes continue by position (the left lane on a tie), and every continuing lane's centre moves:

| Seam                                     | Lane centres before → after (m)            | Continuing lanes | Ending lanes           | Centre shift of the continuing lanes |
| ---------------------------------------- | ------------------------------------------ | ---------------- | ---------------------- | ------------------------------------ |
| `coast-wide` → `cliff-mountain` (4 → 2)  | −5.25, −1.75, 1.75, 5.25 → −3.5, 3.5       | 0 → 0, 2 → 1     | 1 (into 0), 3 (into 2) | 1.75                                 |
| `cliff-mountain` → `rough-track` (2 → 1) | −1.75, 1.75 → 0                            | 0 → 0            | 1 (into 0)             | 1.75                                 |
| `rough-track` → `town` (1 → 2)           | 0 → −1.25, 1.25                            | 0 → 0            | —                      | 1.25                                 |
| `town` → `coast-fast` (2 → 4)            | −1.75, 1.75 → −2.625, −0.875, 0.875, 2.625 | 0 → 0, 1 → 2     | —                      | 0.875                                |

| Section            | Course stations (m) | Section stations (m) | Lanes, width                  | Content                                                                                                                     |
| ------------------ | ------------------- | -------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| A `coast-wide`     | 0–1982              | 0–1982               | 4, 14 m                       | Seaside road, grid and start, curves of 350–500 m, gentle rise; `coast-CP1` at 1950                                         |
| B `cliff-mountain` | 1982–3615           | 0–1633               | 2, 7 m (14 m tapering by 200) | Cliff road, curves of 180–220 m between straights; mountain on the left, sea on the right                                   |
| C `cliff-mountain` | 3615–5140           | 1633–3158            | 2, 7 m                        | Mountain climb and descent at 6.5–7 %, curves of 90–140 m, a sharp crest at 2278 (12 m vertical curve); `coast-CP2` at 2000 |
| D `rough-track`    | 5140–6640           | 0–1500               | 1, 5 m DIRT                   | Straight rough track, 50 m / 0.3 m undulations from 200 to 1400, sand (3 m) then grass outside; `coast-CP3` at 855          |
| E `town`           | 6640–7640           | 0–1000               | 2, 7 m with 2 m shoulders     | Town streets: straights and two near-right-angle corners of 65 and 70 m; trees and signs just outside the shoulders         |
| F `coast-fast`     | 7640–10140          | 0–2500               | 4, 14 m                       | Fast finish: long straights, curves of 450–500 m; `coast-CP4` at 362, `coast-FINISH` at 2050, 450 m runout                  |

D's undulations rise and fall 0.3 m every 25 m through 25 m vertical curves, so a crest's curvature is
0.3 × 2 / 25² = 0.00096 /m and `v² × κ` stays within 0.75 g up to 87.5 m/s, above every course vehicle's maximum speed.

Places of the Stage 13-4 content, in Section stations:

| Place                         | Section          | Stations (m)                                                            | Side            |
| ----------------------------- | ---------------- | ----------------------------------------------------------------------- | --------------- |
| Guardrail and its lead-ins    | `cliff-mountain` | Lead-in 382–432, guardrail 432–732, lead-out 732–782 (straight 372–792) | Right (sea)     |
| Rising cliff and its lead-ins | `cliff-mountain` | Lead-in 918–968, cliff 968–1168, lead-out 1168–1218 (straight 918–1218) | Left (mountain) |
| Falling cliff (open edge)     | `cliff-mountain` | 1383–1583 (straight 1333–1633)                                          | Right (sea)     |
| Short free-standing wall      | `coast-wide`     | 1300–1320 at l = −15, in the grass (straight 1108–1408)                 | Left            |
| Solid trees and signs         | `town`           | 110–980, just outside the shoulders                                     | Both            |
| Cone row                      | `coast-fast`     | 1000–1090, ten cones in the outermost right lane (straight 862–1362)    | Right           |
| Barricade                     | `coast-fast`     | 1800, outermost left lane (finish straight 1637–2500)                   | Left            |

The three walls are in place. The guardrail is a solid wall 0.3 m thick and 0.8 m high on the shoulder's outer edge
(5 m right of the centre line): a rail Strip from 0.45 to 0.75 m and a repeat of 0.2 m post Strips every 2 m over it;
invisible solid lead-ins run from the outer material edge (22 m) to it over 50 m at each end, so none of its ends is
free. The rising cliff is a solid wall 1 m thick on the left shoulder edge, with the same invisible lead-ins. Its top
rises from the road (zero height) to 20 m over its first 25 m, varies between 12 and 25 m along it and returns to the road
at its end, in three rock Strips following the top, with two single patches of other rock (at 40–55 m and 118–140 m along it).
The falling cliff is a wall for looks only, 1 m thick, dropping 40 m below the road on the right shoulder edge in two rock
Strips; the outer material narrows to that edge over 30 m before and after it, so the right side has no course limit
there and nothing is drawn beyond it. The free-standing wall is solid, 0.5 m thick and 1 m high, parallel to the road and
joined to nothing, so both its ends are fixed objects. In `town` every tree (0.6 m) and sign (0.4 m) is solid. In
`coast-fast` ten cones (0.3 m wide, 3 kg, launched at 10°) stand 10 m apart from 1000 to 1090 at l = 5.25, the centre of
the outermost right lane, and one barricade (1.5 m, 50 kg, 8°) at 1800, l = −5.25; their images and launch elevations
are provisional. Every other sprite on the course has no body.

## Evaluation test course

`ribbon-rough` (RIBBON ROUGH, DEV button 4) is a playability test circuit, not a product course. Its
extreme vertical profile and corners are authored for hands-on evaluation; its shape is not rounded off
for completion. The reference driver cannot complete it, so no series holds it: it
is untimed and delivered without reference runs or time budgets. It is a 4.2 km two-Section circuit on existing materials:

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

Speed and ground motion read from 1 m brightness bands on every surface (grass, shoulder, road, dirt,
sand). Each surface's colored Strip is followed by color-only curb elements over the same lateral and
longitudinal extent (grass, whose Strip is laterally open, uses ±1000 m). A band's color keeps its
surface's color and moves the brightest RGB555 channel by one of seven steps from −3 to +3, scaling the
other channels in proportion; every step stays a distinct color. The step order is one saved 64-entry
list, drawn once by a fixed-seed generator: adjacent bands differ, including across the 64 m repetition,
and no shorter period occurs. Every surface indexes that list by the band's whole-metre station (plus
the first Section's rounded-up length in `rough-return`, so the sequence continues around the lap). Equal
brightness therefore lines up across the road; an extent starting between whole metres begins with a
partial band. The bands carry no material.

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

## Course index

The content build delivers one course index (`superoutride.course-index` version 2) so menus can show courses
without loading them. It lists every compiled course once, in build order (course file name order), as
`{id, name, type, maxLaps, gridSlots}`: the course ID, the document's display name, the compiled topology type
(`CIRCUIT`, `LINEAR` or `BRANCH`), the document's `rules.maxLaps` and the number of grid slots of its start gate
(1 to `startGridSlots`). Every value comes from the course
document and its compilation. Admission requires exactly the delivered course entries of the manifest, each once,
and the document rules for names, laps (only `CIRCUIT` has more than one lap) and grid slots. A Session's rivals that
start from the grid fit it: at most its slots less the player's (`gridRivalCapacity`), which Session resolution checks
and FREE PLAY OPTIONS offers; ARCADE entries that appear ahead do not stand in the grid and do not count. The first entry is the default
course.

## Course loading

All selected-course inputs and generated vehicle/timing data are ready before ticks. The shared
compiler expands saved constructs and builds immutable fields for every reachable Section.
Aliases share canonical records and each reusable Section's field; repeated circuit occurrences
reuse the single source. Input or compilation failure publishes no partial reader or Session.

Replacement suspends input, audio and ticks, shows coherent loading/failure state and supports retry.
Stale arrivals cannot replace a newer selection. Resume uses a fresh clock and cleared input ownership.
Driving previews use the same compiler/readers, camera, renderer and mechanics as the browser.
