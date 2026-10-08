# Content and gameplay

This document owns saved course data, authoring semantics and game rules.
[Architecture](architecture.md) owns coordinates and geometry; [Image assets](image-assets.md)
owns image formats and compilation; [Browser](browser.md) owns operation and URL settings.

## Course vocabulary

A Section is a reusable finite road/content chart. A Boundary is a longitudinal lateral edge. A Section's cross-section
is its lanes and the medians between them; a road is lanes touching side by side. A Link leaves a Section end by a lane
of one road and enters another Section start.
A RouteOccurrence is a selected Section visit in the shared Route, with its incoming Link and fixed
route coordinates. CompiledCourse is the immutable reference graph. Every actor uses the same Route.

A Strip supplies color, material or both between its own lateral edges. Section Strips are ordered;
color and material overwrite independently. Compiled Sections publish their two cross-section tables.

Checkpoints, starts, finishes and environment changes are independent of Section boundaries.
Source identity, traversal identity and race credit are distinct.

## CourseDocument

The saved format is compact UTF-8 JSON. All declared fields are required; explicit null represents
absent optional content. Unknown fields fail. Arrays preserve saved order; object-property order and
whitespace do not affect identity. Normalized records use schema field order and convert negative zero to zero; the
authoring core and its tools save a course document that admits in that order.

```text
CourseDocument {
  format: "superoutride.course", version: 48,
  name, entry, maxLaps,
  sections, links
}
Section {
  id, plan, profile: [{at, y, curveLength}], lanes, centerLane,
  boundaries, strips, walls, openLimits, sprites, environments, gates
}
```

### Geometry and reference records

| Record   | Fields                                                                             |
| -------- | ---------------------------------------------------------------------------------- |
| Straight | `kind: "straight"`, `id`, positive `length`                                        |
| Arc      | `kind: "arc"`, `id`, positive `length` and `radius`, `turn: "left" \| "right"`     |
| Position | `at: {joint, offset}`; interval `start`/`end` use the same `{joint, offset}` value |
| Lane     | `kind: "lane"`, `id`, `width`                                                      |
| Median   | `kind: "median"`, `width`                                                          |
| Width    | a number, or `[{at, width}]`                                                       |
| Boundary | `id`, `knots: [{at,lateral}]`                                                      |
| Link     | `id`, `from: {section, lane}`, `to` (a Section id)                                 |

A course names its images: each name is the file `content/images/<name>.json` (the image's file name without
`.json`). The build works out each image's identity from its bytes; the delivery manifest's `image` entry of that
name delivers them, checked against its digest. A course's images are exactly those it names, at most `images` of
them; `vehicles` and `text-tiles` are the delivered vehicle sprite library and text tiles and name no course image.
An image's pixels and colors do not change the driving and are not part of course identity; the dimensions of a
solid sprite's image size its roadside object, so course identity includes them ([identity](#compiled-identity-and-project-publication)).
[Development](development.md#build-outputs) owns the index and output layout.

`name` is the course's display name: nonblank printable ASCII (the
[text tiles'](image-assets.md#text-tiles) characters) without surrounding whitespace, at most `nameCodeUnits`
long, so it fits one line of the frame's text grid. It is shown, never used as an identity.

IDs are opaque nonblank strings without surrounding whitespace and compare exactly. A course's only
identifier is its file name without `.course.json`, which is also its manifest ID; the document carries
none, and the compiled course receives it from its catalog. Section, Link and asset IDs each have a document-wide scope.
Plan element, lane and Boundary IDs each have their own Section-local scope; no plan element is named `"end"`. Sprites have no IDs.
Duplicate IDs fail. References
resolve in their named scopes rather than by array position.

Schema-valid drafts may contain empty arrays or unresolved references.
Compilation requires complete semantic input.
Branching Sections still require lock and closure gates.

### Lanes

`lanes` writes the Section's cross-section left to right as widths: lanes and the medians between them. No centre or
edge is written. The centre of lane `centerLane` is the centreline (lateral 0); the other lanes and medians lie
outward from it, each edge the sum of the widths between. A Width is one number, or values at Positions (two or more,
the first at the Section's start and the last at its end, stations strictly increasing, straight between). A list
whose values are all the same, which means that number, is not written. Widths are 0 or more. A lane is positive
somewhere, and where its width is 0 it is absent: lanes appear and end by widening from 0 or narrowing to 0. The
centre lane is wider than 0 along the whole Section. A median lies between two lanes (not at either end, never two in
a row) and is positive somewhere. Lane IDs are unique in the Section.

Compilation lays each lane's left edge, centre and right edge, and each median's width, as lines with a vertex
wherever any width changes slope. A road at a station is the lanes wider than 0 there that touch, with no median
wider than 0 between them; its edges are its outer lanes' edges. Every lane wider than 0 lies on supported material,
one continuous supported span covering it through each cell where every edge is affine (`invalid_lane`). An unknown
`centerLane` is `unresolved_reference`; other lane violations are `invalid_lane`.

### Lateral positions

`Lateral` is a finite number in metres (positive right), `{boundary, offset}` with a
Section-local Boundary ID and a signed metre offset (positive right), or `{lane, side, offset}`: lane `lane`'s
`left` edge, `center` or `right` edge plus a signed offset. A reference to a lane where its width is 0 reads the line
where its neighbours touch. The field is named
`lateral` on Boundary knots, sprites and grid slots; grid references
use the entry Section. Numeric values and offsets lie in `[-1000,1000]`, and every resolved
l must also lie in that range. Strip edges use the same Lateral values in `left` and `right`.

A point placement evaluates a numeric Lateral directly, or the referenced Boundary at its s
plus offset, or the referenced lane line. The Boundary must cover that station, including each repeated sprite. References may name any Boundary in the same
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
`{kind:"sprite",image,palette,at,lateral,groundOffset,unselectedLink,body}`.
`image` names a sprite image; `palette` is a required nonempty name
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
`airborne` and `landed` the sprite images it shows while
flying and once landed, drawn in the placement's palette (they may name one image twice). Compilation rejects a width
wider than the image's world width (its master width at 40 texels/m) and a body on a state-selected sign
(`invalid_placement`); the appearance compiler resolves the knocked images like the placement's own.

`unselectedLink` is null for ordinary sprites or names, by id, a Link leaving the Section's fork. A state-selected
sign appears at a fork occurrence once that occurrence has a selected successor on the Route whose Link is not the
sign's; each occurrence follows its own choice, so repeated passes do not mix. The appearance compiler owns these
checks and reads the compiled fork after it: a state-selected sign requires a fork and lies from lock through closure
(`invalid_fork` at the sprite); an id that is not one of the fork's Links is `unresolved_reference` at
`/unselectedLink`. Lying at or before closure already places
it before every exit cut; a sprite's image width is not a length along s and does not enter the check.

Section `environments` is an array at the same level as `strips` and `sprites`, with at least one element; every
Section has a compiled appearance. The environment list must begin at s=0.
An environment element is `{at,name,background}` or a `repeat`; background is
`{image,horizonY,yawOrigin}`, naming an image that uses the tiled
background format. Sprite and background references are a Section's only relation to images: an
image without a delivered file is `asset_missing`, and a Section's images are exactly those its sprites and
backgrounds reference. After expansion, environment knots must begin at s=0 and strictly increase
inside `[0,Section.length)`, in expanded order. The compiler does not sort them.
Environment changes affect BG and labels independently of ground colors.
Background `yawOrigin` is an absolute angle in the authored Section coordinate frame: zero faces +Z
and positive degrees turn toward +X. Occurrence mapping adds the occurrence rotation to this angle.

### Shared repeat

Strips, sprites and environment lists use one recursive shape:
`{kind:"repeat",every,count,elements}`. `every` is a positive metre spacing; `count` is an integer of at least 2
including the original occurrence. `elements` is nonempty and contains only elements of its enclosing list, including
nested repeats. One shared expansion implementation visits declaration order, then repetition index,
then child order. For index i, it adds `i*every` to every contained Position's resolved s, including
Strip `start`/`end`, wall Strip knot `at`, decorative `at`, and curb `start`/`end`. Nested offsets accumulate. Lateral expressions
are evaluated at the shifted stations. All resulting Positions must fit the Section.
Repeated Strips remain color-only. The repeat depth/count and collection/expansion ceilings below
apply independently; limits reject rather than truncate.

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
| `strip`  | Position `start`, `end`, Lateral or null `left`, `right`, `color`, `material`             |
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

A Strip covers `[start,end]`, whose resolved stations strictly increase inside `[0,Section.length]`.
Each edge is one Lateral or null, the same over the whole Strip. Null left/right opens that side to infinity.
Material-bearing Strips require two finite edges. Finite edges obey `left <= right`, `invalid_strip`
otherwise. Ownership is `[left,right)` laterally and `[start,end)` longitudinally, including the
Section terminal in the last slab. An edge whose width varies along the Strip refers to a
[Boundary](#plan-profile-and-boundaries) that varies so.

Strip edges use the same interval resolver as Boundary knots: collect the referenced Boundary
vertices, evaluate the edge expression at both ends, blend, then linearly interpolate.
When an edge references a Boundary, it retains that Boundary's
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

Section `walls` is an array (empty when the Section has none) of `{boundary, start, end, solid, strips}`: a wall along
the Section Boundary `boundary` from Position `start` to Position `end`. Compilation requires `start < end` and the
Boundary to
cover that interval (`invalid_wall`; an unknown Boundary is `unresolved_reference`). `solid` is null for a wall vehicles
pass through (for looks only), or `{freeStart, freeEnd, sound}` for a solid one, which vehicles meet; an invisible solid
wall is solid too. `sound` names the wall's record in the [wall-sound document](tire-audio.md#wall-sounds), which the
content build checks (`unresolved_reference` at `/sections/i/walls/j/solid/sound` for an unknown ID); the compiled
barrier line carries it, and a course limit's line carries none (null): it uses the record the wall-sound document
names for course limits. Each solid end, at `start`
and at `end`, either joins another barrier line — it lies on a course limit, or on another solid wall from its `start`
through its `end`, ends included — and is then null, or is declared free with its thickness, positive metres. Compilation
checks every solid end once, within `JOIN_TOLERANCE_METERS` (1e-6 m, reading one line through two compiled readers): an
end declared joined that joins nothing, or declared free that joins a line, is `invalid_wall`. Authors join lines by
referring to the same Boundary (a slanted lead-in's knot refers to the outer Boundary the material's edge follows), so
editing one keeps them joined; a guardrail so joined to the course limit at both ends leaves no way behind it.

`strips` colors the wall as the road's [Strips](#strips) color the ground, with height in place of lateral: an array of
`{kind: "strip", color, knots}` and `repeat` elements (`repeat` as for road Strips). `color` is an RGB555 integer or
`"transparent"`, with the road Strip's meanings; a wall has no material, so a wall Strip cannot leave color unchanged and
its `color` is never null. Each of at least two knots is `{at, bottom, top}`: Position `at`, and `bottom` and `top`, metres above the
road height at that station (negative below it), the Strip's lower and upper edges. Knot stations strictly increase, and the
first and last knots bound the Strip. Between knots each edge is interpolated linearly. The edge rule (`bottom <= top`, so a Strip
may taper to zero height; `invalid_strip` otherwise), repetition, later Strips overwriting earlier ones, and the active-piece
ceiling are those of road Strips, and a wall's Strip products count against the
Section's Strip ceilings together with the road's ([Numeric and resource domains](#numeric-and-resource-domains)); every Strip, repeated ones included,
lies within `[start, end]` (`invalid_wall` for an authored knot, `invalid_position` or `invalid_strip` for a repeated or
expanded one). The wall is visible where its Strips are. A wall with no Strips is invisible and must be solid (a wall
neither seen nor met is rejected); reading rejects this with `invalid_value`. Whether a wall is solid
does not affect its picture. Compilation turns a visible wall's Strips, with the road's Strip compiler, into a color
table over the wall's own interval (station `s - start`) and keeps the height range its opaque Strips span;
[Architecture](architecture.md#walls) owns how it is drawn.

Solid walls and the course limits are the Section's barrier lines ([Body contact](#barrier-lines)). The course limits
run along the left and right outer edges of the covered material — the material table's outermost finite covered
edges, the lateral domain's edges before `MAXIMUM_VEHICLE_REACH` — and authors never write them. Section `openLimits`
declares where a course limit does not run: an array (empty when the Section has none) of `{side, start, end}`, side
`"left"` or `"right"` from Position `start` to Position `end` (`start < end`, `invalid_value` otherwise). That side has no
course limit over the declared interval; a wall for looks only beside it does not open it. A vehicle leaving through an
open limit has no support beyond the material and falls; ordinary recovery returns it.

### Roadside objects

Compilation publishes each Section's solid objects, a physical product apart from appearance, in station order: each
`{s, l, width, bottom, top, sprite, movable}`, a solid width across the road at station `s` and lateral `l`, from height
`bottom` to `top`. A fixed object has no depth along the road; a movable one's footprint is the square of its width,
centred on (s, l), in contacts, drivers' sightings, placement and shadows alike, standing, flying or landed. A solid sprite, every expanded placement with a body, is one: its body's width,
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

Section `gates` is an array with these records. Every `at` uses the enclosing Section's Position; a grid slot's
`lane` names a lane of the entry Section, and the slot lies at that lane's centre. Only checkpoint and finish gates have IDs, and
those IDs are unique across the whole course, including across the two kinds. They are stable keys
for author-confirmed time limits. Array order supplies checkpoint order within each Section.

| Kind         | Fields after `kind` | Placement                                                                                                         |
| ------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `start`      | `grid: [{at,lane}]` | Exactly one, in the entry Section, when race settings exist                                                       |
| `checkpoint` | `id`, `at`          | Increasing Section positions after zero, through a continuation's terminal station and strictly before its finish |
| `finish`     | `id`, `at`          | One per terminal Section; in a circuit, only at the terminal station of the Section returning to entry            |
| `lock`       | `at`                | Exactly one in every Section with two or three outgoing Links                                                     |
| `closure`    | `at`                | Exactly one in every Section with two or three outgoing Links                                                     |

Grid slots are listed in grid order, from the front of the grid to its back: their route s never increases along
the list. A Session's field takes the rearmost slots: the rivals in order, then the player in the last slot. Each
slot must be in a lane wider than zero there, on supported
material, at/after entry and before the first checkpoint, finish or lock gate. The grid must hold the
Session entries; its capacity is one player plus the product maximum rival count. Starting velocity is zero.
At a checkpoint or finish there is a road, and every lane wider than zero there is supported across its edges. Runtime crossing width is the coordinate domain at the line. A checkpoint at a continuation seam
belongs to the preceding Section, while the runtime bounds use the successor's domain at that station.
A circuit has exactly one finish; other circuit Sections have none. The fork section below owns lock and
closure geometry; the appearance compiler checks conditional signs against it. A Section with at most one outgoing Link cannot have either
lock or closure gates.

`entry` names the Section a run enters. `maxLaps` is a position-free setting: an integer from 1 through 99;
non-circuits use 1. [Series](#series-documents) own ARCADE settings.

A course has a time limit when a class of a [series](#series-documents) runs it. The build generates reference runs
and time budgets for those courses only, and only a class offers ARCADE and the checkpoint clock. An untimed course runs
FREE PLAY and TIME TRIAL Sessions. Compilation requires the start, grid and finish coverage described
above for every course; the grid holds at least the player. Compiled `rules` retain `maxLaps`;
compiled `gates` provide the resolved grid and per-Section landmark intervals to race and tools.

### Null meanings

Empty collections are arrays. CourseDocument nulls each have one meaning:

| Field                            | Meaning of null                                           |
| -------------------------------- | --------------------------------------------------------- |
| Strip `color`                    | Leave the earlier color channel unchanged                 |
| Strip `material`                 | Leave the earlier material channel unchanged              |
| Strip `left` / `right`           | That edge is open to negative / positive lateral infinity |
| Sprite `unselectedLink`          | Ordinary sprite with no exit-selection condition          |
| Sprite `body`                    | Scenery: vehicles pass through it                         |
| Sprite body `movable`            | A fixed object                                            |
| Wall `solid`                     | A wall for looks only: vehicles pass through it           |
| Solid wall `freeStart`/`freeEnd` | That end joins a course limit or another solid wall       |

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
Assume 10 corners, 20 PVIs/profile knots, 30 authored decoration records and 220 placements per km.
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
| Images a course names (`images`)                                        |               2048 | (50 × 16 local image types + 128 shared types) × 2, rounded up                                                                                                            |
| Section `plan` elements                                                 |                512 | (21 × 10 + 2 endpoints) × 2, rounded up                                                                                                                                   |
| Section `heightNodes`                                                   |               1024 | (21 × 20 + 2) × 2, rounded up                                                                                                                                             |
| Each Boundary/wall Strip `knots`                                        |               1024 | Same 20/km knot density and margin                                                                                                                                        |
| Environment array and expanded Section `environmentKnots`               |                256 | (21 × 4 + 1) × 2, rounded up                                                                                                                                              |
| Section `boundaries`                                                    |                 32 | 16 road, median, shoulder and outer Boundaries × 2                                                                                                                        |
| Section `lanes` (lanes and medians)                                     |                 64 | Eight lanes each way with medians, with room for lanes that appear and end                                                                                                |
| Non-circuit finite `routes` from the entry                              |                256 | Reference work bound: one continuous reference run per route and vehicle                                                                                                  |
| Section `spritePlacements` (expanded)                                   |              16384 | 21 × (200 + 20)/km × 2, rounded up                                                                                                                                        |
| Each Strip/sprite array `stripElements` / `spriteElements`              |               2048 | 21 × 30/km × 2, rounded up                                                                                                                                                |
| Section `walls` / each wall's Strips (`stripElements`)                  |        1024 / 2048 | Both sides × 21 km × 10 wall runs/km × 2, rounded up; a wall's Strip array has the road's Strip array ceiling                                                             |
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
The 21 km density case, a nearly 42 km case reaching plan element/PVI/knot/Boundary/Strip/placement ceilings,
and 50- and 128-Section three-choice graphs are disposable measured probes; their times, memory and
compiled counts belong in the PR. Images have their own aggregate bound; each named image is one source. Authored
JSON size does not include the separately supplied image bytes.

A Section's plan is its centreline from its origin facing +Z: straights and arcs in order, each `length` metres along
the centreline, an arc turning `length / radius` radians to its `turn` side. The Section's length is the sum of the
lengths. A plan has at least one element, no straight follows a straight, and no arc follows an arc of the same
radius and turn (`invalid_plan`). Its joints are each element's start and the Section's end, `"end"`. A Position
resolves its joint's station plus signed offset, and is measured from the joint nearest that station; of two as near,
the earlier (`invalid_position` otherwise). So a Position is written one way, and a thing near a curve moves with it
when the road before it is edited. Stations must lie in the finite Section and intervals must be
positively representable. Resolved Lateral values also obey the lateral ceiling.
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

The saved plan and position fields are listed above. [Architecture](architecture.md#plan-authority)
owns their authoritative planar interpretation, coordinate domain and geometric validation.
Rendering and physics read the same plan; Section length comes from its coordinate Reader domain.
An overpass is authored as separate Sections for its passages; the coordinate-domain condition
is specified in [Architecture](architecture.md#plan-authority).

Boundary knots strictly increase. Their resolved vertices define affine edges; width and center are derived.

Every open Section cell must have finite material coverage. At every longitudinal transition, both
the material-bearing cell union must have equal side limits. No-material space outside that union is not an authored
material. Discontinuities report `material_transition_discontinuity`;
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

Each Section's native frame is its plan's: its origin, facing +Z. It owns its full `[0,L]` ruler.
The entry Section's native frame is the world frame. Its entry is the cut
at `s=0` through its centre lane; its outgoing cut is `(s=L, lane)`. Every Link destination begins with exactly one
road at `s=0`; the course entry may begin with any number (`invalid_link`). At a Section's end there is a road for
each outgoing Link, each Link naming a lane of its own road (one road at least when no Link leaves); otherwise
`invalid_topology`.

`from` identifies the outgoing `section` and the `lane` the Link leaves by, wider than zero at `s=L`; `to` names the
destination Section. The named lane continues as the destination's centre lane, and the lanes either side of it, in
order, as the lanes either side of that: the two roads have as many lanes, the named lane in the same place, and each
pair's widths agree within 1e-7 m (`seam_edge_mismatch`). So lanes are added or ended only inside a Section, where a
width reaches zero. The rigid yaw/translation maps the named lane's centre and heading at `L` to the destination's
centreline and heading at zero. Heights agree within 1e-8 m and profile grades within 1e-10.
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

## Course authoring operations

The authoring core reads and edits course documents for the workbench's course editor and the course command alike,
as functions from a document (and arguments) to a document or a result, free of Node and the DOM
([`tools/authoring`](../tools/authoring)). The document stays the one source: the editor keeps no model of its own,
and every result resolves through the course compiler's functions.

**Form.** `readCourseStructure` lists every element of a course an author draws or edits, by Section: plan elements at
their joints and the Section's end, PVIs and their vertical-curve ends, Boundaries (their written knots, and every
vertex the compiler resolves, written or inherited from a referenced Boundary), repeats, Strips,
arrows, texts, curbs, walls and their Strips and knots, open limits, sprites (an object when it has a body),
environments, gates, grid slots and lanes (each lane's centre line), and the course's Links. Each element has the JSON Pointer of its
record (a repeated element's one authored record), whether it is written or derived (and from what), every Position
as written (`joint`, `offset`) and resolved (`s`), every lateral as written (a number, or a Boundary and offset) and
resolved at the element's station (`l`), the repetitions enclosing it (each repeat's Pointer, the copy's index (0 the
original), its `count` and `every`, outermost first), its resolved height and plan `x` and `z`, and resolved lines for
Boundaries, Strip and curb edges and walls. Repetitions expand with `expandCourseElements`, Positions with
`resolveCoursePosition`, Boundaries with `compileCourseBoundaries` and laterals with `resolveCourseLateral` and
`resolveLateralInterval`. A document admission rejects is read as far as it goes: the result keeps admission's first
diagnostic, and each element that does not resolve carries its problem (code, message and Pointer).

**Edits that keep form** ([`course-edits.ts`](../tools/authoring/course-edits.ts)) change written numbers and nothing
else, returning the new document with each changed value's Pointer, before and after, or the reason the edit cannot
be made, leaving the document unchanged. `setCourseNumbers` sets values where a number is written (a plan element's `length`
or `radius`, a PVI's `y` or `curveLength`, a repeat's `every` or `count`), refusing a Pointer that holds anything else.
`moveCourseElement` moves an element along and across the Section as written: each Position's `offset` (its joint stays)
and each lateral's number, or a reference's `offset` (the reference stays); a repeat copy's record is its original's,
so moving any copy moves the original and every copy. A move can
be limited to some fields (a wall's `start`, a Strip's `left`) and snapped: each changed value goes to the nearest
multiple of a step, nothing else. Derived points do not move. Setting a plan element's `length` moves the joints after it, and what is measured from them, by the change; setting
an arc's `radius` keeps its length, so what follows keeps its stations and turns. `setCoursePlanTurn` sets an arc's
turn. `moveCourseJoint` moves the joint an element starts at along the Section, the element before it and the element
taking up the move, so no other joint moves. `setCourseArcRadius` sets an arc's radius with its turning angle kept:
its length scales, and a straight either side takes up the change of tangent length, so the arc's tangents meet at
the same point. `addCoursePlanElement` inserts a straight or arc with a new id; `removeCoursePlanElement` is refused
while a Position in its Section measures from its joint. `splitCoursePlanElement` splits an element in two of its
shape, the second with a new id; two straights or two like arcs in a row are a state between edits, which the course
does not admit until one of them changes.
Lane edits ([`course-lane-edits.ts`](../tools/authoring/course-lane-edits.ts)) change a Section's lanes the same way: a
lane's or median's width is set by number where a number is written, and each value of a width written at Positions
moves and is set like any element; `taperCourseWidth` writes a width's values at two stations, from what it is at the
first to a chosen width at the second, removing those between and keeping those after (one number when they all
agree), and `removeCourseWidthKnot` removes a value between the first and the last. `addCourseLane` inserts a lane, with
a new id, or a median; `removeCourseLane` is refused while anything names the lane (a reference, a grid slot, a Link or
`centerLane`); `moveCourseLane` moves a lane or median one place along the order. `setCourseCenterLane` chooses the
centre lane; every absolute lateral keeps its number, so the lanes move across the centreline by the new centre lane's
centre, which `centerLaneShift` reports, with the number of absolute laterals, before the edit is made.
`normalizeCoursePositions` measures every Position again from the joint nearest its station, the station kept and the
offset written to 1e-9 m. Every edit, operation that changes form and applied cleaning ends with it over the Sections it changed, so a
plan edit, whose joints move, and a move past a midpoint between joints leave each Position written the one way; the
rewritten Positions are among the changes. An edit may produce a document admission rejects; the compile's
diagnostics then say why.

**Operations that change form** ([`course-forms.ts`](../tools/authoring/course-forms.ts)) are made only when an author
chooses them. Each returns the new document, each changed value's Pointer, before and after, and the shift: the largest
move, in metres, of anything the Section resolves (plan points, stations, heights and lines, paired in order with the
repeats expanded); or the reason it cannot be made, leaving the document unchanged. Numbers an operation computes from
resolved values are written to 1e-9 m, which drops floating-point noise.

- `explodeCourseRepeat` replaces a repeat by the elements it stands for, in place, one level at a time: copy k is the
  repeat's elements with every Position's `offset` moved by k × `every`, as the course expands it. Its shift is 0.
- `combineCourseElements` replaces elements of one list by a repeat when they are one block (one element in station
  order, or several in list order) repeated at one spacing, each copy the same but for its Positions. The repeat holds
  the first block, in the first element's place. In a Strip list (a Section's or a wall's, or a repeat's elements in
  one), whose declaration order decides which Strip overwrites which, the elements must stand together: an element
  between them is refused at its Pointer. With tolerance 0 only exact steps combine; with a tolerance the steps are
  evened out within it. Its shift is the one above. Exploding and combining again gives the same values.
- `bindCourseLateral` makes an absolute lateral a reference to a chosen Boundary, or to a lane's left edge, centre or
  right edge, its offset giving the same lateral at the element's station; between knots the line then follows that
  line. `unbindCourseLateral` makes a reference the
  number it resolves to at the element's station; between knots the line then runs straight. A Boundary cannot refer
  to itself.

**Cleaning operations** ([`course-cleaning.ts`](../tools/authoring/course-cleaning.ts)) work in two phases over a scope
(the course, a Section, chosen elements and what they hold, or element kinds). The first proposes candidates, each with
the element it concerns, its changes and its own shift: the change applied alone and the Section read again, comparing
lines and wall heights laterally along an unchanged ruler (and vertex by vertex in the plan when the ruler changes),
other elements by plan point, and the road height. The second, `applyCleaning`, applies the chosen candidates as one
edit, returning the shift and each changed Section's centreline shift (the old centreline's largest distance from the
new one) and length change. Every applied candidate changes the course's identity, so the measured products become
stale; the driving changes only when the shift is not 0.

- `roundCandidates` rounds written numbers of chosen kinds (plan lengths, radii, Position offsets, laterals, lane and
  median widths, PVI heights, curve lengths, repeat spacings) to a step: each value off the step is a candidate.
- `unneededKnotCandidates` proposes each middle knot of a Boundary or wall Strip, and each middle PVI, whose
  removal moves nothing beyond a tolerance (0: exactly the same lines and heights). The first and last knots bound a
  line's extent and stay.
- `joinCandidates` proposes near things, within a distance but not the same, written as one: an absolute lateral near
  a Boundary or lane line at an offset it is already referred to with (or 0) becomes that reference (`join-reference` when exactly
  on it); a Position (of a knot, wall,
  curb, open limit or gate) near another element's Position takes it, either way round; a Position near a joint's station
  is measured from that joint with offset 0; a Strip's left edge near the previous Strip's right edge where it starts
  takes its written value. A join that leaves the Section unreadable is not proposed.
- `mergeCandidates` proposes each width written at Positions whose values all agree as that one number (`merge-width`),
  and, for each list, its runs of three or more elements that combine exactly into repeats,
  and each colour within a tolerance (in 5-bit steps) of a more used colour, which then takes its place everywhere.
  `sameValueGroups` shows, without changing anything, the colours with their uses, the references to a Boundary at
  one offset and the absolute laterals of one value, each with its count.

**Findings** ([`course-findings.ts`](../tools/authoring/course-findings.ts)) list what in a course is worth tidying,
apart from diagnostics and without changing anything; a course with findings builds and runs as any other, and the
build does not read them. `courseFindings` takes a step, a distance tolerance and a colour tolerance, and returns each
finding's kind, Pointer, description and the cleaning operation that answers it: values off the step (`digits`,
round), knots nothing needs at tolerance 0 (`unneeded-knot`, remove knots), near things (`near`, join), absolute
laterals exactly on a Boundary's or lane's line (`referable`, join), runs that combine into repeats (`repeatable`,
merge), widths whose values all agree (`equal-width`, merge), near colours (`near-color`, merge), Boundaries no other
value of their Section names or images no value of the course names (`unused`, no operation), and medians zero wide
throughout (`zero-median`, no operation).

**Underlay alignments** ([`course-underlays.ts`](../tools/authoring/course-underlays.ts)) are production-only numbers
in `content/course-underlays/<course>.json`, which the core neither reads nor delivers:
`{ "format": "superoutride.course-underlays", "version": 1, "sections": { "<Section id>": { image, sha256, scale, x, z,
rotation } } }`. Each Section names the image it was aligned with (its file name and SHA-256; the image is never
saved), and image pixel (u, v), v down, lies at (x, z) + R(rotation) · (scale · u, −scale · v): (x, z) is the image's
top-left corner in metres, `scale` metres per pixel (positive) and `rotation` the counter-clockwise turn of the u axis
from +x in degrees, from −360 to 360.

## Compiled identity and project publication

CompiledCourse contains canonical Section, plan segment, Boundary, lane, Link,
asset and landmark references plus immutable material tables. Merges reuse the same successor; loops refer to the same source.
Owned records and arrays are immutable, including nested image data. Live actor, route-lock and
clock state belong to Sessions. Object identity is local to a compilation; cross-build identity uses digests.

`sourceSha256` and `materialsSha256` are the delivered SHA-256 of the course document and the
surface-material document, the [document identity](#reference-times-and-clock) the catalog supplies.
`solidImages` holds the master `{width, height}`, in texels, of each solid sprite's image by name, the image
dimensions its roadside objects take their shape from ([Roadside objects](#roadside-objects)).
`buildSha256` hashes `{sourceSha256,materialsSha256,solidImages,compiler}`.
The compiler is `superoutride.course-compiler` version 47, incorporating Link recipe v4, physical
recipe v8, image-source recipe v3 and appearance recipe v14. Source, material, solid image dimension or
compiler/recipe changes invalidate dependent products.

Image inputs are explicit saved bytes, one per image the course names. [Image assets](image-assets.md#course-image-sources) owns source formats and diagnostics.
Draft saving is independent of image-byte availability.

`readCourseDocument` is the only course-document admission. Each caller that admits (delivery, the
content build, authoring tools) supplies its document path once, and receives a detached, deeply frozen
`CourseDocument`. `compileCourseDocument` receives that admitted value and does not admit it again.
Build image compilation delivers, under each name, every sprite master the course names (a placement's image or a
movable body's knocked image) compiled to its LOD and each background as its compact JSON; the delivered course document is the admitted one. Results and input diagnostics follow the shared
[admission contract](architecture.md#content-admission-toolkit); clients use code and path.
The `plan_coordinate_overlap` variant additionally requires
`overlap: {section, intervals: [{sStart, sEnd}, ...]}`; ordinary diagnostics have no overlap fields.
`plan_coordinate_inversion` identifies the Section's plan and the affected station in metres, never
an internal segment number. `invalid_gate` identifies gate-specific rules: gate kind, gate ID uniqueness,
counts, ordering, lane support, grid, lock/closure and circuit finish conditions.
Shared shape, numeric, reference and position rules keep their own codes (for example
`invalid_shape`, `unresolved_reference` and `invalid_position`), with a path into the affected gate.
Each check chooses its code explicitly; paths do not select codes and exceptions are not recoded.
A missing gate points to its Section's `gates` collection.
`invalid_rules` is reserved for position-free race settings. Non-gate fork constraints retain
`invalid_fork`, addressed to the affected sprites, Strips, Boundaries or lanes.

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

## Shared route occurrences

All vehicles use one selected sequence of RouteOccurrences, including repeated circuit laps. Route
stations start at the entry Section's beginning and never rebase at seams. An occurrence's identity
and incoming Link distinguish repeated visits and retain the selected predecessor through merges.
[Architecture](architecture.md#coordinates-and-readers) owns transforms, reader composition and
extension/retention distances. Geometry/content indexes and race cross-section lists rebuild when
the shared sequence changes. All actors retain their route coordinates at a seam.

A driving scene requires Session settings and compiled start gates, and checks the rearmost grid
station against the camera's distance behind the player (`D_cam` plus half the player's footprint, 7 m for a 2 m wide
car with the product camera): the rearmost slot must be at least that far from the entry. Driving beyond the entry uses the same coordinate-domain recovery rule
as any other domain exit. Recovery preserves
accepted cross sections and laps and suppresses crossing credit for that step.

## Fork lock and handoff

The number of outgoing Links determines branching. A Section with two or three exits requires exactly
one `lock` and one `closure` gate with `0 < lock < closure < every exit seam`.
The compiler builds its branch controls from those gates after Links are resolved. The zone from lock through
closure lies on straight plan: every plan segment it overlaps has zero curvature. From lock through closure every lane and median keeps its width, and the material table supplies one contiguous
supported interval at lock. Through closure,
material span edges remain parallel and the supported interval retains the same bounds. Gate and
grid support checks also read this table. The roads at the lock line are the exits, each the road of one outgoing
Link's lane, supported across its edges. Adjacent exit roads require a positive-width supported interval between
their edges: the separating median, defined by lane edges and material.
Invalid controls produce `invalid_fork`.

Exit roads are ordered by their actual lock-line edges. Median centers divide supported
space into exit intervals; outer supported shoulders belong to the outer exits. The shared half-open
[lateral rule](architecture.md#boundary-geometry-and-point-ownership) assigns exact ties to the right.
A crossing outside the coordinate domain or outside every fork interval selects no route.

The player and rivals are eligible. Lock lines use the same route-s crossing function as race lines.
The first forward crossing in a fixed step wins, using the s-derived fraction u and then stable actor
ID for an exact tie. Interpolated route l, shifted by the occurrence's lateral origin, selects the
fork interval. The winner appends one successor to the shared Route. That successor occurrence is the only
stored fork choice: the occurrence after a fork occurrence on the Route (`selectedSuccessor`). A fork occurrence
with a successor is locked, so each occurrence locks once; its choice is looked up by occurrence, so repeated
passes of one fork Section are distinct. The lock, the closed roads, the legal recovery targets and state-selected signs all
derive from that successor.
Checkpoint credit remains per actor.

A driver's intent has two separate values: its lane, a lane of the Section's lanes (its index left to right, medians
not counted) at a route station, and its target exit, an exit index at each fork occurrence; any exit, a middle one
included, can be intended, and the grid side implies none. Across a seam a lane continues as the lanes do: the Link's
named lane as the next Section's centre lane, and the lanes beside it in order. A lane ends where its width reaches
zero; at a fork, a lane not in the road of the Link the intent follows (the intended exit's, or the selected exit's
once the occurrence is decided) ends at the lock line, or at closure once the fork is decided, so heading for an exit
is merging; and a lane ends at a seam it does not continue across. Its driver merges toward the lane beside it that
continues (below), crossing a median only then. The race carries each driver's lane to its station every step. The
fork field's target (`targetL`) is the centre of the intent's lane, carried to the station. A grid rival starts in its
slot's lane, the lane nearest its slot (`intentLane`), and the player's driver and takeover start in the lane nearest
the player. The recovery lane
(`recoveryL`) keeps its own rule ([Recovery](#recovery)). The race assigns each rival's target exits from the
Session seed:

```text
exit = hash(seed, rivalIndex, occurrence.ordinal) mod exitCount
```

`hash` (`rivalExit`) chains 32-bit integer avalanche steps (`Math.imul`, shifts and xor), so every runtime computes
the same exits. Reference runs intend each planned Link's exit and change no lanes: their target is the centre lane's
centre, and at a fork the centre of the lane the planned Link names (the reference line). Scenarios drive the player by
its Session driver and name their exit indices. Unselected roads show saved state-selected signs. At/beyond closure, an
actor is on a closed road when its l lies within a road there that the selected Link does not leave by (edges
included). It recovers at the same chainage to the nearest lane centre of the selected road; progress observations
resynchronize. Geometry stays static.

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
approximation. Reverse travel and recovery steps grant no crossing credit. Road width and material
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
carries its competitor, its line (landmark, its kind, a checkpoint or the finish line, lap and whether it is the
completing FINISH), its race time, `stepStart + u*SIM_DT`, computed by one function (`raceEventSeconds`), and the
extension it earned (the clock's award in ms for a player crossing that extended the deadline, else null). The stream is in race-time order;
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

A series document (`superoutride.series` version 10) is the one owner of its classes, its ARCADE races. It is saved
as `content/series/<id>.series.json`; `id` equals that file name stem, which is also its manifest ID. For example:

```json
{
  "format": "superoutride.series",
  "version": 10,
  "id": "ribbon",
  "title": "RIBBON",
  "dev": true,
  "timeMargin": 1.35,
  "fixedColors": false,
  "classes": [
    {
      "id": "coast",
      "title": "COAST",
      "course": "ribbon-coast",
      "laps": 1,
      "vehicles": ["TESTAROSSA"],
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
`timeMargin` is the series' one time margin: positive, finite and at most 10. `fixedColors` says whether the
player drives in its entry's color rather than its own chosen color. `classes` lists at least one class in selection
order. A class is one ARCADE race: its `id`, unique within the series, its display name `title`, a delivered `course`,
its `laps` (1 through 99), its ARCADE vehicle candidates `vehicles` (at least one, unique and in the catalog, in
selection order), `entries`, `playerSlot`, `rankLimits` and `traffic` (null, or traffic settings whose vehicles are
catalog vehicles; see [Traffic](#traffic)). `entries` lists the
whole field, 1 through 16 entries, each a catalog vehicle, a color its sprite set declares, a positive pace ratio `pace`, `stages` (null for the
whole run, or `{first, last}` with `last` at least `first` and no later than the stage count of every run of the
course: its race gates per route, times the laps on a circuit) and one appearance. An entry taking part from STAGE
1 has a grid `slot` index (0 through 15) and `ahead: null`; grid entries are in grid order with strictly increasing
slots. An entry whose first stage is later has `slot: null` and `ahead: {distance, lane}`: a positive distance
in metres ahead of the player and its lane number, which every Section of the course has, so it is a lane on
every route. On every route the distance
falls short of the next race gate and the next fork lock after the gate opening that stage. Every candidate vehicle
of the class has at least one grid entry, which the player can take. `playerSlot` is `own` or `last`. `rankLimits`
maps a race gate ID to its rank limit N. Admission checks each document once, from the build's files or the delivery
manifest alike, against the delivered course IDs and the vehicle catalog. A course may be run by several classes of
one or several series. A class is admitted against its compiled
course: `laps` within `maxLaps`, every entry's slot within the grid, every ahead lane below the fewest lanes of the
course's Sections, and rank limits naming checkpoint or FINISH gates of that course
with N an integer from 1 to below the field size (the number of entries). The build admits every class; a
Session admits the class it drives.

The delivered series are RIBBON and TRIAL, development series; each document holds its classes, with their fields
and traffic. RIBBON COAST is the [verification course](#verification-course); TRIAL holds the
[trial courses](#trial-courses); no class runs RIBBON ROUGH.

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

ARCADE resolves its class: one of the class's vehicle candidates, its entries and laps and the
checkpoint clock. The player takes the rearmost grid entry of its vehicle in grid order: with `own` it stands in
that entry's slot and every other grid entry in its own; with `last` it stands in the rearmost of the grid entries'
slots and the other grid entries, in order, take the slots in front. Each other entry is a rival with its own
vehicle, envelope, color, pace ratio and stage interval; one with an ahead appearance has no slot. The player's color is its entry's when the series fixes colors, otherwise the player's chosen color (the
player record's color for the vehicle when its sprite set declares it), otherwise the vehicle's default color. FREE PLAY resolves a catalog
vehicle, zero to fifteen rivals within the grid, a rival pool, a traffic level and permitted laps; it has no clock.
TIME TRIAL resolves a catalog vehicle and permitted laps on any course; the player runs alone, without
rivals or clock, and selects fork routes by driving like any first competitor at a lock line. One admission,
`compileSessionConfiguration`, derives these rules from a request and checks it against the course, its class and
the vehicle catalog and the [FREE PLAY document](#free-play-document); the configuration carries the FREE PLAY rival pool.
ARCADE takes its class's traffic; FREE PLAY takes the TRAFFIC choice: OFF is none, and every other level is the
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
FREE PLAY rival pairs, every other vehicle that may drive in it (class entries, the pool when it has rivals, traffic
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
stops judging and the race clock, preserving final rank and precise event time; the vehicles and traffic keep moving
([race time and events](#race-time-and-events)).
Recovery consumes simulation time and grants no crossing credit. Results are session-local.

### Reference times and clock

`tools/course` owns reference generation, its policy and report-to-budget admission. The product
reads completed envelopes and time budgets and owns live Session driving policy.
The measurement tool's continuous reference runs are TIME TRIAL Sessions: product physics, the configured start from the
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
budgets ([Browser](browser.md#dev-controls)). This digest is saved with each measured product and is independently
recomputed by build and browser envelope and budget admission; both reject products carrying an old digest.
Each procedure that produces a measured product has one record, its name, version and the values that decide its
results, and one identity: the SHA-256 of the record's JSON ([procedure](../tools/course/procedure.ts)), as the course
compiler's record is part of a course build identity. A code change that changes a procedure's results raises that
procedure's version. Envelope measurement (`ENVELOPE_MEASUREMENT`, `superoutride.envelope-measurement` version 2)
records its fixed step, reference surface and the values deciding convergence and its trials; it measures on the unit
reference surface ([Calibration](calibration.md#vehicle-settings)). The reference run (`REFERENCE_RUN`,
`superoutride.reference-driving` version 2) records the race's fixed step, the Session seed, the reference driver (the
driver policy `ENVELOPE_DRIVER` at utilization 0.9), the envelope measurement's record and the pace schedule's station
spacing. Authored values belong to the per-vehicle digest, so editing one vehicle does not invalidate unchanged
vehicles' products. The saved measured products, report admission and the traces (`superoutride.reference-run`
version 3 and `superoutride.vehicle-envelope` version 2) record these identities as `procedureSha256`. The delivered
envelope carries only its rows and maximum speed; the measurement record is in the measurement trace
(`npm run measure -- trace`). For a budget state, reference duration is the maximum upcoming interval among
continuous histories sharing that state and its legal next checkpoint/finish alternatives.

```text
budgetMs(state) = ceil(1000*timeMargin(series)*referenceSeconds(state))
```

Reference times are keyed by course, vehicle and route state, and time budgets by series as well, through its margin.
Each delivered reference-times file (`superoutride.course-reference-times` version 1: `courseBuildSha256`,
`vehicleSha256`, `initialSeconds` and `after`, in seconds before any margin) belongs to one course and vehicle
(`<course>/<vehicle>`), and each of its values belongs to one route state, a gate and lap. A value is the longest legal
upcoming interval from that state over every route the course admits, so it never depends on the route already
driven. A timed Session admits its course's file for its vehicle (`readCourseTimeBudgets`) and derives each budget
with its series' margin as above, so every series and class running that course and vehicle reads the same file.

The margin and duration are positive finite values. START receives the initial budget. Each newly
earned non-finish checkpoint adds the next budget once, carrying unused time without a cap. FINISH
adds none. Precise event times determine ordering; awarded budgets alone round to integer milliseconds.
All consecutive gates crossed in one step retain their race times. Earlier expiry ends the
run; a valid checkpoint or FINISH wins an exact expiry tie ([race time and events](#race-time-and-events)). Rejected late crossings earn no line or lap credit.

### Measured products

The measurement tool (`npm run measure`, [Development](development.md#course-commands)) saves the measured products
under `content/` in the saved JSON layout; nothing else writes them, and they hold no run traces. Each catalog vehicle
has `content/envelopes/<vehicle>.json` and each course a class runs has `content/reference-times/<course>.json`.

A measured envelope (`superoutride.measured-envelope` version 1) has `vehicleSha256` (the Session vehicle's identity),
`procedureSha256` (the envelope measurement's identity) and `envelope`, the delivered envelope's `maximumSpeed` and
`rows`. The delivered envelope is `superoutride.rival-envelope` with the same `vehicleSha256` and `envelope`.

A reference run depends on the course, the vehicle and the procedure alone: it drives the course's `maxLaps` and a
Session reads the laps it runs, so no series or class value enters it, and classes running the same course and
vehicle share one measurement. Reference times (`superoutride.reference-times` version 2) have `courseBuildSha256`,
`procedureSha256` (the reference run's identity) and `vehicles`: one entry per vehicle some class runs on the course,
each once, in catalog order. An entry
has `vehicleId`, `vehicleSha256`, `initialSeconds` (the longest interval from START to the first gate), `after` (for
each budget landmark in the course's order, `[gate, seconds]` with one longest next interval per lap, as a time
reference times' `after`) and `schedule` (the pace schedule's `start` and `sections`). The
times are seconds before any series margin, as the reference runs measured them, and are delivered so; only a
Session's budget rounds, once, after its margin is applied. The delivered pace schedule carries the schedule's times with the course and vehicle
identities and the station spacing.

A saved product is current while its identities equal the current course build, Session vehicle and procedure
identities. Builds admit the saved products ([`compileContent`](../tools/authoring/compile-content.ts)) and derive the
delivered envelopes, reference times and schedules from them, each once. A saved product that is stale, absent or
owned by no catalog vehicle or course a class runs, or reference times whose entries are not the vehicles the
classes run on that course in catalog order (a measurement no class uses is stale), fail
with a `measurement_stale` diagnostic at the file and the stale field that names `npm run measure -- generate`; other
malformed values fail as any admitted document does. Changing a series' `timeMargin` changes only the series document
and needs no measurement. Tools that produce the measured products, or need none, compile the content without
them (`measured: false`).

Measurement is reproducible within one JavaScript engine. `Math.sin` and `Math.cos` differ between engines in their
last bits, so the saved products are written by the Node tool alone; the workbench measures with the same
implementation for its own build only, and never saves the result.

### Pace schedules

A pace schedule (`superoutride.pace-schedule` version 1) records a vehicle's reference pace on a course a class runs, for
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
and lane; the utilization may change from one step to the next. Its workspace caches each 5 m cell's curvature and grip by
road, lane and the cell's interval within the planning domain, and its curve speed also by envelope, utilization and
speed cap, so a steady utilization reuses both and a cell the domain cut short is read again once the domain grows; it reads a contiguous 5 m lattice up to 480 m ahead and publishes canonical steering,
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
margin = max(0, Δs − (F₁ + F₂)/2 − gap − v × responseSeconds)
target² ≤ v_a² + 2 × a × margin
```

so a driver following at the leader's speed keeps the footprint gap `gap + v × responseSeconds`. `escape` applies to a
driver that passes, and to any driver behind a standing object (which ends its lane, below); for others it is 0. It is
the least footprint gap from which the driver's steering path from rest (at its lateral, in line with the road) into an
adjacent lane of its road passes clear of the vehicle ahead side to side and stays clear, or 0 when
no adjacent lane does. Such a driver stops that far behind a stopped vehicle, at least `terminalClearance` (2 m), and
when the adjacent lane is free it starts and steers into it past the stopped vehicle; any other driver stops
`terminalClearance` behind it. The
plan is computed once per step, with and without this constraint. Whether a driver changes lanes to pass is an attribute its
builder gives it (`passes`: whether it changes lanes to pass): rivals' drivers and the player's takeover pass; traffic
drivers, which Session resolution compiles, do not. When the constraint lowers the planned speed, a driver that passes
weighs each free adjacent lane of its road (passing never crosses a median) by the speed its plan allows there: its plan without a
vehicle ahead, behind that lane's vehicle ahead under the same constraint (the current lane's curve speeds serve, since
adjacent lanes differ little in them). It moves to the lane allowing the most, the left one on a tie, when that exceeds
its constrained plan by more than `passingMargin` (0.15 m/s), and drives that speed in its new lane. It stays
in its lane until another lane is faster by that margin. A lane is free when no
vehicle in it lies between the driver's following distance ahead, `(F₁ + F₂)/2 + v × followSeconds`, and, behind,
half the two footprints plus that vehicle's speed times `followSeconds`. Drivers read each vehicle's footprint `F` and
each standing object's footprint (its depth along the road, its width across) as contacts do. With no faster free lane, or when it does not
pass, the driver follows on the constrained plan; its inputs stay throttle, brake and steering. Every driver's `a` is its envelope's minimum
braking times its utilization; the player's, for others' checks, is the Session driver's. The reference line plans
without a vehicle ahead and meets no other vehicle, so reference runs are unchanged.

Where a driver's lane ends, it merges first, passing or not: this is not a pass. A lane ends at the first end within the
driver's lookahead by the rule above (its width reaching zero, a fork line it must leave its road by, or a seam it does
not continue across), or at a standing object in it (one that occupies the lane) nearer than that, whichever comes
first. At such an end the lane to merge toward is the lane beside it that continues: the one wider than zero there
where a width ends, the one toward the followed road at a fork or seam; at a standing object it is the adjacent lane of
its road that does not end within the lookahead, the left one when both qualify, and none when neither does. The driver moves toward it
one lane at a time. Each
step that its lane ends ahead, the driver moves to the next lane toward it when that lane is free (the free-lane test
above) and every driven vehicle behind in it can follow the driver, the plan constraint above with the driver as the
vehicle ahead at its speed; vehicles in the lanes that continue do not yield. While its lane still ends there, that end
is a terminal of its plan, so it slows to stop `terminalClearance` short of it until it can merge; an appearance in
a lane that ends there plans to stop the same way. A standing object is the vehicle ahead in the lane it ends, and every
driver keeps its escape gap behind it, passing or not, so it can still merge from rest. A driver that passes does not move into a lane that ends within its
lookahead. Where a lane begins, widening from zero, only a driver that passes moves into it, by the passing rule. Lanes
begin and end only inside a Section: across a seam every lane continues with its width.

The same driver serves reference runs and live rivals. Generated runs contain precise landmark times
and optional 10 Hz position/speed/utilization traces. The browser loads generated envelopes and compact
integer-millisecond budgets. [Development](development.md#build-outputs) owns generated file locations.

## Traffic

Traffic vehicles are not competitors: they have no rank, rank limit, fork decision (the fork field never observes
them), progress, events, record or pace, and the HUD does not count them. Each is an ordinary vehicle (its own
mechanics, recovery and the same driver as rivals, except that its driver never changes lanes to pass: behind a slower
vehicle it follows at that vehicle's speed; where its lane ends it merges as every driver does) whose role in the Session is traffic; no vehicle document marks it. Heading for a
fork's exit is merging. Traffic positions lie on the Route at stations `offset + k × 1000/density` (k = 0, 1, …);
the offset in [0, spacing), and each position's vehicle, color and lane (a lane of the road it drives at that
station: at a fork the exit's road, else the centre lane's), derive from the Session seed and k through the same 32-bit mixing as rival exits. At a fork a traffic
vehicle heads for the selected exit, else for an exit drawn from the seed, k and the occurrence ordinal; one left on a
closed road recovers like any vehicle.

The appearance line is the player's route station plus the farthest rendered distance ahead of it,
`s − cameraDistance + far` from the loading coverage's view, whose `cameraDistance` is the camera's distance behind
the player's route position. In each step in which the line reaches a position, a
traffic vehicle appears there, at its lane's centre and its driver's planned speed behind the vehicle ahead in that
lane, the same appearance as a later stage's entry. Positions at or before the line when the Session starts never appear. A position passes unused,
never to appear later, when `min(16, 32 − competitors)` traffic vehicles are present (`SESSION_RULE_LIMITS.traffic`
and `.vehicles`), when the resident Route does not reach it yet, when its road there has one lane (traffic
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
vehicle's contact shape is its footprint, the square of its overall width (`footprint`), laid along the road at its
route position (s, l): it does not turn with the vehicle's yaw, since a long side would collide unintuitively once the
vehicle is yawed. Its height range runs from its bottom, its world centre-of-mass height less `desiredCgHeight`, to its
bottom plus `overallHeight`. For two vehicles with route-coordinate differences Δs and Δl and bottoms B₁ and B₂:

```text
overlapS = (F₁ + F₂)/2 − |Δs|     overlapL = (F₁ + F₂)/2 − |Δl|
overlapH = min(B₁ + H₁, B₂ + H₂) − max(B₁, B₂)
```

with footprints F and overall heights H. A contact begins when all three are positive, so a vehicle in the air passes
over one below it. It also begins when the height overlap is positive and the relative position, moving linearly from
(Δs⁻, Δl⁻) to (Δs, Δl), entered the overlap box during the step although the footprints are apart at both its ends:
thin footprints closing fast pass through each other within one step (two motorcycles' overlap lasts about 1.4 m of
relative travel, one step at 84 m/s), and they meet as if they had touched. A vehicle, competitor or traffic, that a recovery (its step's,
a return to the legal road or a manual recovery) or an appearance placed since the previous step moved from where it was
placed, so it sweeps nothing on its way there. Its face, an axis and a side, is decided once, as it begins, from the pair's route
positions at the start of the previous step (Δs⁻, Δl⁻): the axis is ahead-behind when the vehicles were apart
ahead-behind (`(F₁ + F₂)/2 − |Δs⁻| ≤ 0`) while overlapping side to side, and side to side in the opposite case. When
they were apart on both axes, the axis is the one that began to overlap later within the step, moving each relative
position linearly from Δ⁻ to Δ; ahead-behind when both began together. The side is the sign of that axis's relative
position Δ⁻. A contact begins with both axes already overlapping when two footprints overlapped while their heights did
not — a vehicle in the air above another vehicle or a standing object — and their heights come to overlap;
recovery and appearance never place a vehicle on another's footprint or a standing object's, so no other contact begins
overlapped. Such a contact's axis is the one with the smaller overlap in the step it begins, and its side the current
relative position. The race keeps each pair's face, keyed by the two vehicles' ids, until their footprints separate: until the
overlap along the face, `(F₁ + F₂)/2 − side × Δs` (or the lateral form), or the other axis's overlap is no longer
positive. The overlap along the face grows on even if a vehicle passes the other's centre. Pairs no longer in contact,
and those of vehicles gone from the Session, are forgotten. The height overlap decides only whether the vehicles
touch: while it is not positive there is no force, and a contact does not begin. The force acts along the
horizontal world direction of the face's axis, the road's tangent or its right, read at the pair's midpoint, with
equal magnitude and opposite sign on the two vehicles, on the overlap along the face; its approach speed is their
relative world velocity along that direction. The spring-damper is the Session's one `bodyContact`, read at Session resolution from the Session's driving definition
(the player's), for every contact, wall, course limit and object in the Session.

A standing object meets every vehicle present by the same rule, as a party of its footprint at its route position —
a movable object's the square of its width, a fixed object's its width with no depth — with its height range, at rest: its position one step earlier is its position. A fixed object never moves, so
the reduced mass is the vehicle's and only the vehicle receives the force. A movable one's reduced mass comes from the
two masses, and the push knocks it ([Roadside objects](#roadside-objects)). Each step a vehicle meets every standing
object whose footprint its own could have reached over the step, from its route station one step earlier to its station
now widened by half its footprint and half the widest resident object, across seams, so an object just past a seam is met
before the vehicle's centre crosses it and one passed within the step is met too; the pair is keyed by the vehicle's id and the object's identity, and the contact faces alone
hold which pairs are in contact. Near a solid wall's free end both the wall's line and the end
object can push a vehicle; their forces add.

### Barrier lines

Walls and course limits act on every vehicle present, in every step after READY, from the state at the step's start;
the race adds their force to the body contact force. A barrier line acts on a vehicle whose centre's Section station
lies within it (a wall: from its `from` through its `to`). Its overlap is half the vehicle's footprint (its overall width) less the
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

The contact faces record every line a vehicle touches (overlap positive), course limits included, so a line's contact
begins as a pair's does: in the step it overlaps after a step it did not.

### Player contact observations

The race publishes the contacts of the player's vehicle at the end of each fixed step (`race.playerContacts`): read-only,
the last step's only, with no sound values, and none of other vehicles' contacts with each other, with walls or with
objects. It changes no mechanics; it reports quantities the contacts already compute.

- **Rubs:** each barrier line pushing the player this step: the line's wall sound (its wall's `sound`, or null for a
  course limit, which uses the wall-sound document's own), its push `F` (N), the player's speed along the
  road `|v_along|` (m/s) and the power the line's friction removes, `|friction × v_along|` (W), which is
  `barrierFriction × F × |v_along|` unless the friction is at its `m × |v_along| / step` bound.
- **Starts:** each contact of the player that began this step: its counterpart (`vehicle`; `wall` for a wall, a course
  limit or a solid wall's free end; `object` for a fixed object; `movable` for a movable one) and the work the
  spring-damper's damper term dissipated over the step, `m × 2ζω × v² × step` (J, never negative; `m` the mass the push
  acts on, the reduced mass for two vehicles, `v` the approach speed; zero when the push is zero). The spring term
  stores energy and is not included. A pair's and a line's contact begins as the contact faces say; a movable object's
  contact is the step it is pushed and knocked.

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
recovers to the centre of the lane nearest it of the roads it may drive: at a decided fork, the selected Link's road
where that road is, else every lane there. Wrong-route recovery goes to the nearest lane centre of the selected road at
the observed station (`legalTarget`).
Every spawn and recovery target, route-derived or explicit, passes one check (`supportedTargetSurface`): its l
lies within the coordinate domain (`lateralAt`) and its surface has a material. Targets are race-made, so a
violation is an internal invariant failure (`Error`).
Known recovery coordinates use the shared route. Observers resynchronize once, suppress reset
crossing credit and update the player
camera before rendering. Unrelated internal faults propagate.

## Verification course

`ribbon-coast` (RIBBON COAST) is a LINEAR verification course, not a product course: it gathers the situations Stage 13
exercises in one timed ARCADE course, favouring kinds of scene over looks — lane counts that change at seams, roads of
four, two and one lanes, a dirt section, walls with joined and free ends, an open course edge, solid trees and signs,
and movable cones and a barricade. Its course document holds every Section, wall and object; the driving scenarios
locate what they exercise from it ([Development](development.md)).

## Evaluation test course

`ribbon-rough` (RIBBON ROUGH, DEV button 4) is a playability test circuit, not a product course. Its extreme vertical
profile and corners are authored for hands-on evaluation; its shape is not rounded off for completion. The reference
driver cannot complete it, so no class runs it: it is untimed and delivered without reference runs or time budgets.
Its surfaces carry color-only brightness Strips every metre, so speed and ground motion read on every surface; its
course document holds them.

## Trial courses

`outrun-trial-a` (OUTRUN TRIAL A) and `outrun-trial-a-steep` (OUTRUN TRIAL A STEEP) are trial courses, not product
courses: they try out the procedure of raising a course from a video. Each length is the source's displayed speed times
its duration; the strongest curve is set to 0.75 of the lateral limit and each other curve in proportion to how fast the
source's background turns there. A's hills keep the car on the ground over each crest (0.6 G at 293 km/h); A STEEP's are
matched to how the hills look on screen instead. On A STEEP the reference driver leaves the course at a crest, so its
time limit is generous; it stays so until the AI anticipates the load lost over a crest. Their scenery and pictures are
provisional; the videos and their pixels are not in the repository. The development series TRIAL holds both.

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
