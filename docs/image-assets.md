# Image assets and compilation

This document owns saved image formats and compilation. [Architecture](architecture.md) owns projection,
logical sprite extent and anchors; [Content and gameplay](content-and-gameplay.md) owns course fields/references.

## Completed sprite images

Indexed sprites and BG tiles pack two 4-bit indices per byte, high nibble first. Index zero is
transparent (BG patterns cannot use it; see below); indices 1 through 15 are opaque. Resolved palettes have exactly 16 RGB555 entries, with slot zero
unused. RGB555 zero in an opaque slot is black. Source JSON stores row-major index arrays, except the vehicle
pictures' hexadecimal rows ([Vehicle sprite library](#vehicle-sprite-library)).
Tile palettes begin at `paletteId << 4`; the format has no separate palette-count limit. Course images use this
format; vehicle pictures use the [vehicle sprite library](#vehicle-sprite-library)'s.

```text
{
  format: "superoutride.sprite-lod", version: 4, name,
  width: W, height: H, anchorX, anchorY,
  defaultPalette: "original",
  palettes: {original: {colors: [RGB555 integers]},
             alternate: {colors: [RGB555 integers]}},
  levels: [{paletteRgb555: [16 integers], indices: [row-major indices],
            mixtures: [[], [[baseIndex,weight], ...], ...]}, ...],
  shadow?: {width, height, anchorX, anchorY, levels: [{indices: [row-major indices]}, ...]}
}
```

Master width at 40 texels/m defines physical width; a course sprite's solid width is bounded by it, and its master height at the same scale is the solid object's height. Each level has at most 15 opaque colors.
Level zero preserves semantic palette slots and identity mixtures for slots 1 through 15.
A coarse slot is a positive-weight mixture of original opaque slots summing to one; unused slots
have empty mixtures. Its normal color is the mixture evaluated in the original palette.
Equal colors can occupy distinct semantic master slots.

`palettes` is a dictionary of unique nonempty trimmed names. `defaultPalette` names its default
color. Images declare all 16 slots. Coarse generated palettes still contain 16 entries: their slots are filtered
mixtures, not semantic master slots. The resolved level-zero palette equals the resolved default color. All named
colors participate in LOD compilation. Evaluating the shared mixtures in a selected color generates its level palettes
once before drawing; patterns remain shared.

`shadow` is optional: a binary frame whose anchor is the image's base point on the road, nonzero indices opaque, drawn
at the image's scale with exactly as many levels as the image; level `k` is `ceil(w/2^k)` by `ceil(h/2^k)` with the
anchor mapped as the image's. A master carries its shadow's master level; the build reduces it, a level texel opaque
where any master texel in its box is, so a shadow never vanishes at a distance. A movable object's standing, flying and
landed images each carry one ([Content and gameplay](content-and-gameplay.md#sprites-and-environment)); the
provisional ones are the object's square seen by the size-0 contract camera ([Picture contract](#picture-contract)).
Course sprites select one declared palette by its required name, including an explicit default name.
The course compiler validates that reference and shares image/name resources. Rendering applies each
selected palette once; no raw course replacement palettes or value-by-value LOD membership checks remain.
[Architecture](architecture.md#sprite-lod-metric-and-read-contract) owns level dimensions and anchors.

Invalid dimensions, anchors, indices, palettes, mixtures or unknown fields
fail. Every saved image format in this document and the sprite recipe admit
through the [content admission toolkit](architecture.md#content-admission-toolkit) and report the
first failure at its JSON Pointer. Coarse colors must agree with their mixtures. Readers own packed buffers and immutable metadata.
One normalized master level is valid input; shipped sprites have full build-generated LOD.
Source masters and named palette declarations are saved; completed pyramids are generated products.

## Common prefilter rules

Sprite normalization and LOD integrate direct-master boxes. RGB555 decodes through a 32-entry channel
table into linear-sRGB for averaging, then encodes to sRGB before RGB555 rounding. Opaque coverage is
area-weighted; coverage at least 0.5, including equality, is opaque. Color normalizes by opaque area;
hidden RGB and background contribute no color. Every level filters its master directly.

Footprint `rho` is source units covered per destination pixel, with octave exponent `log2(rho)`.
Sprites use master texels and nearest-exponent selection. Strips share the linear-sRGB codecs and
coverage threshold; [Architecture](architecture.md#strip-rendering) owns their source-domain preblend
and pixel reads.

## Sprite LOD compilation

Source normalization, candidate palettes, LOD compilation and the sprite operations are authoring code
under `tools/graphics`. `src/image` owns the shared image readers, saved formats, filters and codecs.
The workbench, the sprite command and the build consume those same TypeScript implementations.

The compiler integrates exact master index counts in each clipped octave box. Fifteen or fewer
mixtures pass through directly. Larger sets use deterministic divisive clustering: squared linear-color
distance is the maximum across all declared colors; the greatest area-weighted-error group
splits around its farthest representatives. Representatives are area-weighted mixture centroids;
stable input order resolves ties. Color edits invalidate the generated pyramid.

The vehicle sprite set documents under `content/sprites/` hold every size of every picture; the build admits and
assembles them and generates nothing. Their library uses the same `dist/delivery/images/<sha256>.json` location as
course images; its manifest ID, `vehicles`, names no course image.
The content manifest maps the logical image name `vehicles` to its path and exact-byte SHA-256;
courses find their images by that digest ([Content and gameplay](content-and-gameplay.md#geometry-and-reference-records)).
All consumers resolve these entries through the manifest
and verify bytes before decoding. Format and version are written only inside each image file,
never in course asset references or manifest entries.
Strips have no ground image inputs.

## Tile pictures

One tile picture format serves the course sky, the series images and the title logo: 16×16 patterns of 4-bit
indices, 16-entry RGB555 palettes, and a row-major map of `columns` tiles a row in full rows, each tile binding a
pattern and a palette. Its tiles and `columns` give its height:

```text
{
  format: "superoutride.tile-picture", version: 1, name, columns,
  patterns: [{indices}], palettes,
  tiles: [[patternId,paletteId], ...]
}
```

Index 0 is transparent; a picture none of whose patterns holds index 0 is opaque and writes every pixel it covers.
A map is 1–256 tiles wide and 1–64 tiles high. `compileTilePicture` admits this document and builds the immutable
`TilePicture` reader; the reader's constructor keeps only its local invariant that every tile binds an existing pattern
and palette. Each use of the format states its own size and opacity where it admits the picture.

## Infinite tiled background

A course sky is a tile picture 40 tiles (640 pixels) high and opaque, of any width up to 256 tiles (4096 pixels); the
course compiler checks both where the course admits its sky, at the environment's `background/image`. The map is a
single infinite plane with no LOD.
The source horizon row and Section-frame yaw origin are authored; yaw and pitch scroll the map, and camera
translation has no effect. Vertically the mapping is linear: the screen horizon row
([projection](architecture.md#height-and-projection)) meets the image's horizon row, each screen row shows one
image row (`imageY = round(imageHorizonY + y - horizonY)`), and rows beyond the image's top or bottom repeat its
edge row. Horizontally it scrolls at the camera's focal length, `f` pixels per radian of camera yaw from the yaw origin, as
distant road and sprites do, and repeats at its own width: a full turn spans `2*pi*f` pixels, so a map that wide
closes on itself exactly and a narrower or wider one shifts by the difference each turn. The provisional skies are 94
tiles (1504 pixels), 359 degrees at the product's 240 px. Frame changes transform yaw origin with camera yaw.

## Text tiles

`content/text-tiles/default.json` uses `superoutride.text-tiles` version 1, the tile picture's pattern and
palette fields without a tile arrangement:

```text
{format: "superoutride.text-tiles", version: 1, name, patterns: [{indices}], palettes}
```

Patterns are 8 by 8, and index 0 is transparent as in tile pictures. Patterns 0 through 94 are the
printable ASCII characters U+0020 through U+007E in code order, so the character mapping needs no saved table.
The HUD part tiles follow them in one fixed order that code names, the same way, so their mapping needs no saved
table either, and the HUD pictures follow them; the document must hold at least all of these, and later patterns are
free. Pattern 0, the space, must
have only index 0: it is the empty tile.

| Patterns  | Names                           | Content                                                                         |
| --------- | ------------------------------- | ------------------------------------------------------------------------------- |
| 95–98     | `LAMP_ON_TL`…`_BR`              | A lit signal lamp, 2×2 tiles: body slot 1, gloss 5, rim 6, shade 7              |
| 99–102    | `LAMP_OFF_TL`…`_BR`             | An unlit signal lamp: rim 6 over a shaded body 7 with a faint gloss 5           |
| 103–147   | `METER_a_b` (0 ≤ a ≤ b ≤ 8)     | A meter cell (rows 2–5): slot 1 before column a, slot 4 to b, the slot 3 ground |
| 148–154   | `METER_RIGHT_1`…`_7`            | A meter cell filled k pixels from the right in slot 1 over the slot 3 ground    |
| 155–1522  | `TACH_c_r_b_k` (b 1–8, k 0–8)   | Tachometer tile (c, r): bars before b slots 1/8, the rest 9/10; before k lit    |
| 1523–1588 | `DIGIT_d_k` (d 0–9, then `OFF`) | Tile k of a 2×3-tile seven-segment digit: lit segments slot 1, the others 8     |
| 1589–1604 | `ARROW_LEFT_0`…`_15`            | Tile k of the 4×4-tile road arrow pointing left: slot 1 outlined in slot 2      |
| 1605–1620 | `ARROW_RIGHT_0`…`_15`           | The same pointing right                                                         |

The signal lamps are authored. The other part tiles are drawn by the HUD tiles command
([Development](development.md#hud-tiles-command)), which writes them in place:

- A meter cell is 4 pixels high with 2 pixels clear above and below; `METER_a_b` serves a meter filled from the left
  with its cut part (slot 4) at the fill's end, and `METER_RIGHT_k` a meter filled from the right.
- The tachometer's 80 bars are a pixel wide without gaps, eight to a tile; bar `i` is `4 + round(20*(i/79)^2)` pixels
  high, a quadratic curve from 4 to 24, standing on the bottom of its column's three tiles. Only the 19 of the 30
  tiles (`TACHOMETER_TILES`) that hold part of a bar have patterns: 72 each, for every split `b` between the tile's
  first and second color and every count `k` of lit bars.
- A segment digit is 16×24 pixels with a pixel's margin all round; each of its seven segments is 3 pixels thick with
  tapered ends. `DIGIT_OFF` has every segment unlit.
- The road arrow is 32×32 pixels: a head over a shaft, outlined by a pixel.

The HUD pictures follow the part tiles in one fixed order that code names as well (`HUD_PICTURES`), each with a
palette of its own after the named palettes, in that order:

| Patterns  | Palette | Name         | Picture                                          | Frames                                   |
| --------- | ------- | ------------ | ------------------------------------------------ | ---------------------------------------- |
| 1621–2772 | 9       | `prototipo`  | A steering wheel with three drilled metal spokes | 32, 11.25° apart, a full turn, 0 upright |
| 2773–3924 | 10      | `mod02`      | A steering wheel with two dark spokes            | 32, 11.25° apart, a full turn, 0 upright |
| 3925–5076 | 11      | `montecarlo` | A steering wheel with three dark spokes          | 32, 11.25° apart, a full turn, 0 upright |
| 5077–6264 | 12      | `top-bridge` | A motorcycle's top bridge and handlebars         | 33, 45/32° apart, ±22.5°, 16 upright     |

Each frame is 48×48 pixels, 6×6 tiles, each next frame turned one step further clockwise; its 36 patterns run row by
row from the top left, so frame `f`'s tile at row `r` and column `c` is the picture's first pattern plus
`36*f+6*r+c`. A picture's palette holds its 15 colors in slots 1–15. The [HUD picture generator](#hud-picture-generator)
writes the pictures and their palettes in place; no table changes.

Palettes 0 through 8 are WHITE, YELLOW, RED, DARK (unselectable items), GREEN (signal lamps and normal), BAR (unlit
lamps and empty HUD parts), VFD (the blue-green of the segment digits, whose unlit color is a faint trace) and
GREEN_YELLOW and YELLOW_RED (a tachometer tile where those colors meet), and the HUD pictures' palettes follow; later
palettes are free. A document holds at most 65536 patterns and 256
palettes (`TEXT_TILE_LIMITS`), so every pattern ID is a 16-bit and every palette ID an 8-bit unsigned integer and a
text grid cell keeps any admitted pair. A tile's palette chooses its color, so one lamp, meter, bar or digit
tile serves every color. Every named palette uses the same slots: 1 the main color, 2 the glyph shadow, 3 a meter's
ground, 4 a meter's cut part (red in every named palette), 5 a lamp's gloss, 6 its rim, 7 its shaded body, 8 the
main color unlit, and 9 and 10 the second color lit and unlit (GREEN_YELLOW's yellow and YELLOW_RED's red). The
build admits the document and delivers it as authored as the manifest `image` entry `text-tiles`.
`compileTextTiles` admits it and builds the immutable `TextTiles` reader, which encodes text to patterns
(a character without a pattern is a `RangeError`) and paints one tile's opaque pixels.
The original font draws each glyph in slot 1 with a slot 2 shadow one pixel right, down and diagonally down-right.

## External source normalization

Decoded inputs are straight-alpha 8-bit sRGB pixels and this normalization recipe, which the
[import](#sprite-operations) makes from a saved sprite recipe:

```text
{
  format: "superoutride.sprite-source", version: 2, name,
  crop: {x,y,width,height}, widthMeters,
  anchor: {x,y}, paletteRgb555
}
```

The crop is an integer rectangle inside the source. `widthMeters` calibrates the entire crop,
including transparency. Master width is `round(widthMeters*40)`, positive ties upward, at least one;
actual width is that integer divided by 40. The uniform scale is master width/crop width. Master
height is the ceiling of scaled crop height, with transparent fractional-row padding.

Source anchors are original-image texel-center coordinates and map per axis to
`(sourceAnchor+0.5-cropOrigin)*scale-0.5`. Fractional/outside anchors are valid. Exact overlap-area
integration applies to reduction and enlargement. Straight alpha weights opaque color before the
common binary coverage threshold. The supplied palette has 16 slots, including unused slot zero.
Output is one normalized master level.

Wrong/missing fields, invalid palettes, crops, anchors or metric values fail before output.
Source limits are 16777216 decoded pixels and 1048576 master texels. PNG input is at most 32 MiB
with 8-bit channels. The shared PNG adapter checks signature, dimensions, chunk bounds and CRC and
rejects animation. The input color space is sRGB; embedded metadata does not request color conversion.

## Candidate palettes

Palette generation uses alpha-weighted median cut in encoded RGB555 over visible cropped samples.
Up to the requested 1 through 15 colors preserve exact codes. Otherwise choose the box by greatest
channel range, then alpha weight, then lowest code. Channel ties use R/G/B order; sorting uses channel
then code. Split at the first cumulative half-weight with both sides nonempty.

Output colors are alpha-weighted RGB555-channel means rounded nearest with upward ties, deduplicated
and sorted. Fully transparent input yields 16 zeros; unused opaque slots repeat the first candidate.
Coincident means can reduce distinct colors. The generated palette is a saved editable value;
mask/crop edits leave it in place until explicit regeneration.

## Sprite operations

The sprite operations are functions over the content store, free of Node and the DOM; the workbench's sprite module
and the sprite command (`npm run sprite`, [Development](development.md#workbench)) call them. Each reads documents and
returns new ones, which the caller saves as one edit. They make course images; vehicle pictures come from their own
generator ([Vehicle sprite library](#vehicle-sprite-library)).

**Sources and recipes.** A source image and its recipe are production-only data: `content/sprite-sources/<name>.png`
(the PNG's own bytes) and `content/sprite-sources/<name>.json`. The build delivers neither; the authored files are
published with each build, so the workbench reopens them. The master's name is `<name>`. The recipe is
`superoutride.sprite-recipe` version 2:

```text
{format, version, crop: {x,y,width,height}, widthMeters, anchor: {x,y},
 mask: [{x,y,width,height,hidden}, ...], palette: [rgb555, ...] | null}
```

`mask` rectangles are applied in order: a hidden pixel keeps its color and takes alpha zero, and a shown one gets its
source alpha back. `palette` has 16 slots; null generates it from the masked crop
([Candidate palettes](#candidate-palettes)) with 15 colors.

**Import.** The masked source is normalized as [External source normalization](#external-source-normalization)
describes, with the recipe's palette, and written as its named file, `content/images/<name>.json` with the master in
the saved layout, `<name>` being the source's name; it replaces an image of that name, so every course naming it shows
the new image. Naming it in a course is the course's edit.

## Course image sources

Each image a course names receives explicit `{name,bytes:Uint8Array}` input: valid UTF-8 JSON for the sprite or tile picture
format. Admission works out each image's SHA-256 from its bytes and decodes each name once into an immutable reader,
a `SpriteAsset` or a tile picture; Section membership resolves to those, and rendering borrows them without
decoding. Delivery checks the bytes against the manifest digest before they reach admission.

Course image admission uses the single [document resource table](content-and-gameplay.md#numeric-and-resource-domains)
for the image count, per-image bytes/texels and aggregate bytes/texels. Missing, duplicate, unused, corrupt or
malformed inputs fail. Asset diagnostics contain `kind:"asset"`, code, the image's name and the supplied input
index where applicable; an invalid image also carries the JSON
Pointer `path` of its failure inside that image; independent failures follow declaration order.
Failure publishes no graph. The compiled course holds only the readers; build tools that compile a
master read the admitted, frozen saved document alongside its reader instead of admitting it again.

## Saved course appearance

Background bindings use tile maps and sprites uses sprite levels. Ground contains direct RGB555
colors or transparency and saved Strip constructs, not image references. The course compiler expands
the constructs and builds private numeric fields; these are not image assets or serialized payloads.
[Content and gameplay](content-and-gameplay.md#sprites-and-environment) owns the saved fields;
[Architecture](architecture.md#strip-rendering) owns ground sampling and its common color law.

## Picture contract

Every picture is a flat picture standing upright at its base point ([Architecture](architecture.md#sprites-and-painter)):
a vehicle's position seen from above at its body's underside, an object's placement at its height. Its anchor is that
point. Pictures come in sizes; size `k` (`k = 0` full size) is drawn at `40 / 2^k` texels per metre at the base point,
and the renderer draws the size nearest its scale ([Shared image level selection](architecture.md#shared-image-level-selection)).
Vehicle pictures and their generator follow this contract; this section is its only statement:

- **Camera.** Size `k` is the vehicle seen in true perspective from a camera `D_cam × 2^k` behind its base point
  (`D_cam` = 6 m) and 2.0 m above it, with a focal length of 240 px and no pitch or roll: its scale at the base point
  is `40 / 2^k` px/m, and one texel is one pixel of that camera. Every size is its own picture, drawn from its own
  camera, so the farther sizes show the vehicle closer to level; no size is made by reducing another.
- **Anchor.** A picture's anchor is the projection of its base point. The picture may extend below it.
- **Direction.** A picture is chosen by the body's yaw less the direction from the camera to the base point, in true
  perspective (`atan(x / d)` for the base point's camera-right distance `x` and depth `d`); the set's yaw images
  divide the turn evenly, image 0 seen from behind and each next one turned right by one step. Their number is the
  set's own (`yawVariants`), the same at every size; generated sets have 64 (5.625° apart).
- **Shadow.** Each size has a shadow: the vehicle cast straight down onto a level road through its base point, seen by
  the same camera. It is drawn at the same scale with its anchor at the road beneath the base point, so its anchor is
  the same base point; its frame lies on the picture's texel grid, so the two anchors differ by whole texels. Its
  opaque texels are the shadow; their indices mean nothing else. A shadow keeps at least one opaque texel at every
  size.
- **Colors.** One palette serves the whole set, every direction and size: 14 colors (slots 1–14), the brake lamp
  (slot 15) and transparency (0). Every texel names one of those 15 colors; no size mixes colors, and a smaller size is
  drawn with its own texels, not a blend of a larger one's. A color variant is a named palette of slots 1–14 (the body
  color's slots replaced); the brake lamp is slot 15 alone, whose off and on colors the set declares once, so lighting
  it changes that one color.
- **Brake lamps at a distance.** Down to 1/16 size (size 4) a picture that shows the brake lamps keeps at least one
  slot-15 texel for each of the left and right lamps; size 5 need not. This is the generator's rule; drawing does
  nothing special for lamps.

Course images are masters with build-generated pyramids ([Completed sprite images](#completed-sprite-images)): a
level is a reduction of the master, not a picture of its own; the movable objects' shadows follow the size-0 camera.

## Vehicle sprite library

Each vehicle sprite set is authored as one document, `content/sprites/<set>.json`, using
`superoutride.vehicle-sprite-set` version 3. The set's name is its file name without `.json`; the document carries
none:

```text
{format, version, yawVariants, bankVariants, bankDegrees?,
 palettes: {red: [14 RGB555], yellow: [14 RGB555], white: [14 RGB555], black: [14 RGB555]}, brakeLamp: {off: RGB555, on: RGB555},
 assets: [[pictureIndex, ...], ...], pictures: [{sizes: [Size, ...]}, ...]}
Size  = {width, height, anchorX, anchorY, rows: ["0f3a…", ...], shadow: {width, height, anchorX, anchorY, rows}}
```

`assets` binds the yaw × bank grid, `yawVariants` rows of `bankVariants` cells, to the set's `pictures`; every picture
fills at least one cell, and one picture may fill several. A picture has exactly six sizes, 0 to 5
(`VEHICLE_PICTURE_SIZES`): size 5 is the one the farthest rendered depth (200 m) selects. A frame's `rows` run top to
bottom, each `width` lowercase hexadecimal digits, one index per texel: `0` transparent, `1`–`e` the palette's slots
1–14 and `f` the brake lamp. A set has exactly four colors (`VEHICLE_COLORS`), each a palette named by its color
(`red`, `silver`, …) listing the colors of slots 1–14; the vehicle listing names the default, the first. A set declares `bankDegrees` exactly when it has more than one bank
image: the lean from vertical, in degrees in (0, 90], of the rider-and-machine centre-of-mass line that its outermost
bank images depict. Bank selection divides the vehicle's displayed lean by it.

Admission ([`vehicle-sprite-library.ts`](../src/vehicle/vehicle-sprite-library.ts)) checks each set once: it names at
four palettes of 14 colors and both lamp colors; every picture has every size; every size has its shadow, whose
anchor differs from the picture's by whole texels; and every grid cell names a picture, every picture filling one. Vehicle admission checks form-specific bank dimensions and default-color references
([Vehicle physics](vehicle-physics.md#material-vehicle-and-driving-documents)). The authoring core
([`vehicle-sprite-sets.ts`](../tools/graphics/vehicle-sprite-sets.ts)) admits each set document by the same rules,
with diagnostics at the set document's own pointers, and assembles the delivered library (manifest `image` /
`vehicles`), one document of the sets by name, `superoutride.vehicle-sprites` version 6:

```text
{format, version, sets: {testarossa: {yawVariants, bankVariants, palettes, brakeLamp, assets, pictures},
                         vfr750r: {yawVariants, bankVariants, bankDegrees: 60, palettes, brakeLamp, assets, pictures}}}
```

The vehicle domain admits the library and owns its sets at run time: for a vehicle's color and lamp state it makes the
set's one 16-slot palette once and draws every picture with it, and it selects yaw/bank pictures. The image domain supplies only the generic sprite reader.

`testarossa`, `911-turbo-3-3`, `golf-gti-16v` and `vfr750r` are generated sets ([Vehicle picture generator](#vehicle-picture-generator)). The other sets are provisional,
one per vehicle, named by its id in lower case with `_` as `-` (`911-turbo-3-3`): drawn by code, original, for an
earlier camera, and converted mechanically until generated sets replace them. Their size `k` is the reduction at
octave `k` of a full-size picture whose anchor sits at the vehicle's base point (where a camera 1.75 m up and 6 m
behind its ground line sees half the vehicle's width behind it), each reduced texel taking the set slot nearest its
mixture's color in every color and lamp state; their shadows are the vehicle's overall length by width rectangle seen
by each size's contract camera. Cars have 48 yaw images (7.5° apart); motorcycles 48 yaw by 5 bank images
(`bankDegrees` 60). Their body is slots 1–3, one color from the highlight to the shade, which each color replaces; the
brake lamp's off and on colors are 13379 and 31974.

## Vehicle picture generator

A generated set is made from four views of the vehicle and a recipe, saved under `content/vehicle-picture-sources/`:
`<set>.json` and the views `<set>-front.png`, `<set>-side.png`, `<set>-rear.png` and `<set>-top.png`. They are
production-only data, which the build does not deliver. `npm run pictures -- <set>`
([Development](development.md#pictures-command)) writes the set, `content/sprites/<set>.json`; the same sources, vehicle
mechanics document and camera definition always give the same file.

A solid made from outlines alone cannot hold what no outline shows (a hollow between two crests, a crowned roof, a
rounded shoulder), and a view cannot say what is paint where its color does not. The recipe states those things, found
by comparing the pictures with photographs of the vehicle, and is their one record. A saved set is the authority for
its vehicle's pictures, and the command replaces a saved set only when told to.

**Views.** Each view shows the whole vehicle squarely, without perspective or from far enough to have little: the side
view with the nose to the left and the tyres on the road, the top view with the nose to the left, the front and rear
views upright. The background is either near-white (`background: "white"`: pixels within 45 of white, summed over the
channels, joined to the picture's border) or transparent (`"alpha"`: alpha below 128); the vehicle is the largest part
that is not background. A view taken against anything else is cut out before it is saved; the command refuses a
`white` view whose border shows no white. The views need not share a scale or agree exactly: the mechanics document is the one
authority for the vehicle's dimensions, and each view is fitted to it.

**Recipe.** `superoutride.vehicle-picture-recipe` version 1; rows and columns are pixel-centre coordinates of the named
view, stations and heights are metres in vehicle coordinates (origin at the base point, z forward, y up):

```text
{format, version, vehicle: "TESTAROSSA", yawVariants: 64, background: "white" | "alpha",
 side:  {road, roof, frontEnd, rearEnd, frontWheel, rearWheel, frontOverhangShare},
 top:   {centre, width, frontEnd, rearEnd, ties: [[sideColumn, topColumn], ...]},
 front: {centre, width, road, roof},
 rear:  {centre, width, road, roof, undersideFromFront},
 outlines: {rearUntil, frontFrom},
 mirrors: {from, to, low, high, outside},
 glass: {above, from, to, glint},
 marks: [{view: "side" | "top" | "front" | "rear", kind: "glass" | "brakeLamp" | "trim" | "paint", polygon: [[x, y], ...]}, ...],
 surface: {stations: [z, ...], across: [x, ...], heights: [[y, ...], ...]},
 paint: {color: [r, g, b], tolerance, brightness, exposure, shade},
 slots: {body, neutral, glass: 2, accent}, bodyKeys: [brightness, ...],
 palettes: {red: [[r, g, b] × 14], yellow: [...], white: [...], black: [...]}, brakeLamp: {off: [r, g, b], on: [r, g, b]}}
```

`vehicle` names the mechanics document (`content/vehicles/<vehicle>.json`) whose overall length, width and height,
axle distances from the centre of mass and wheel radii the solid takes. Colors are written as 8-bit channels and saved
in the set as RGB555.

**Fit.** Heights follow each view's `road` and `roof` rows and the overall height; widths follow `width`, the overall
width in that view's pixels, about `centre`. Stations follow the side view: its wheel centres stand at the axles and
its ends at the overall length, the two overhangs sharing what the axles leave by `frontOverhangShare`. The view is
stretched between those marks only; within 1.12 wheel radii of a hub it keeps the height's scale, so a wheel stays
round. The top view's ends stand at the same stations, and each tie names a column of the side view and the top-view
column showing the same station (the base of the windscreen, the roof's ends).

**Solid.** The solid is the space every outline allows, on a 1 cm grid whose cells hold the share of them the solid
fills: the share the side outline covers, the share the top outline covers (each outline averaged over about one
cell, so a gentle slope is smooth rather than stepped), and all or nothing by a facing outline that passes from the rear view's to the front view's between the stations
`rearUntil` and `frontFrom` (their signed distances blended by a smooth step). Outlines are made symmetric about the
centre line. Below `undersideFromFront` the rear outline is no wider than the front's, which removes a floor shadow in
a rear view. Parts of a facing outline thinner than a 9 cm disk whose mean height lies between `low` and `high` and
whose mean distance from the centre line exceeds `outside` are mirrors: both facing outlines lose them, and the front
view's are added back at the stations between `from` and `to` where the top view stands 4 cm proud of the body's
median half width there (taken from 0.7 m behind `from`); at those stations the body's top outline runs straight
between the stations either side.

`surface` is the upper surface where no outline shows it: a net of heights in metres, `heights[station][across]`, at
`stations` falling from the nose to the tail and distances `across` rising from the centre line. The solid's top
reaches no higher than the net, read linearly between its knots; beyond its stations and distances the outlines alone
shape the solid, and a set without corrections has an empty net. The solid's edges are rounded by a Gaussian of 2.5 cm,
which keeps the tyres on the road.

**Colors.** A surface point takes each view's color in proportion to the fourth power of how squarely it faces that
view (the side view for both sides, the front view for surfaces facing forward, the rear view for those facing back,
the top view for those facing up), where the view shows the vehicle at least 3 pixels inside its outline and sees the
point: a view colors nothing deeper than 3 cm behind the solid's outermost surface in its direction, so what stands
over or before a surface is not painted onto it. A point no view colors is dark, and so
are surfaces facing the road from below the tyres' tops. Inside
0.70 of each tyre's radius the side view is smeared about the hub, so wheels are drawn turning.

A view shows paint where it is at least `paint.brightness` bright (its largest channel) and its chromaticity (each
channel over their sum) lies within `paint.tolerance` of `paint.color`'s; each view's paint is then closed over gaps
up to 1.6 cm wide, so a shut line, a handle or a script is drawn with its panel. A surface is paint when the views
coloring it show paint for at least half their weight, wheels excepted; glass when it is darker than 75, above
`glass.above` and between the stations `glass.from` and `glass.to`. `marks` say what a place is whatever its color:
inside a mark's polygon, of its view's pixels, a surface that view colors most is glass, trim (anything that is not
paint: a headlamp, a bright moulding), paint of the recipe's color (where the view shows something standing before the
paint), or a brake lamp when it also lies within 0.4 m of the tail. Marks other than brake lamps are set in their
view's paint before it closes. Paint keeps the share `paint.shade` of its views' color and takes the rest from
`paint.color`: a view shows paint with the light of the place it was taken in, and a paint whose views are mostly
reflections (a silver) is better lit by the generator alone.

**Light.** Every picture is lit alike, as under an open sky: paint and glass mirror a sky several times brighter than
the paint and a darker road, more strongly at grazing angles; a sun high and ahead to the right adds a glint; paint's
outward creases facing the sky catch the light; surfaces near the road are darker. Paint's lit color is multiplied by
`paint.exposure` before it saturates at white, which exposes a light paint down as a camera would. Each direction and size is lit as
its own camera sees it.

**Drawing.** Each size of each direction is drawn by its contract camera ([Picture contract](#picture-contract)) at 6
camera pixels per texel side at full size and twice as many at each smaller size. A texel is opaque when at least
half of it is covered, and paint, glass or lamp when at least half of its covered part is. The shadow is the solid's
outline seen from above, on the road, drawn the same way.

**Palette.** The 14 slots are, in order, `slots.body` body colors from the highlight to the darkest, `slots.neutral`
neutrals from dark to light, the dark and the light glass color, and `slots.accent` accents. A paint texel takes the
body slot whose `bodyKeys` brightness (`0.45 r + 0.35 g + 0.20 b` of its lit color) is nearest; a glass texel takes
the lightest neutral above a mean of `glass.glint`, the light glass color above 105 and the dark one below; a lamp texel takes
slot 15; any other texel takes the nearest color among the neutrals and accents of the first palette: a squared step
of brightness counts a quarter, and chromaticity in proportion to the texel's brightness (600 for a whole step at
white), so a shaded amber stays amber and a dark texel stays a dark neutral. Every palette of
the set names the same slots, so a color variant replaces the body colors and keeps the rest. By the contract's lamp
rule, sizes 1 to 4 turn each lamp's fullest texel into a lamp texel when no texel of that lamp reached half.

TESTAROSSA's saved set is a finished one, made with this generator's prototype and tuned by eye; its recipe has no
corrections. The command's draft of it looks the same and differs in about one texel in nine, mostly by one step of
the body ramp: the generator has since gained smooth slopes and the rules above. Its body colors follow the reds of the
reference game's car as seen in a screenshot; its yellow, white and black follow the same steps from light to dark,
and its palettes are the recipe's, the pictures as the prototype drew them. 911 TURBO 3.3's saved set is the command's
output for its recipe: silver, black, red and white. Its surface gives the hood between the front
wings, the wings' round tops, the crowned roof and tapering tail, the rear shoulders and the tray of the rear wing;
its marks give the windows, the headlamps and the brake lamps (the outer red lamps and the reflector square beside
each). GOLF GTI 16V's saved set is the command's output for its recipe: red, white, black and silver. Its front and rear views are fitted to the side view's lamps and bumpers rather than to their roofs, which those views show from a little above; its marks give the rear window, the mirrors, the headlamps, foglamps and indicators, the tail lamps' amber and white sections, their lower red sections as brake lamps, and the number plates as paint; its surface is empty. Its red's two lightest steps are redder than the other sets', its middle neutral lighter, so that its silver wheels read as silver, and its red accent darker, so that a texel mixing paint with black trim stays dark in every color. VFR750R's saved set is a prototype accepted as it stands, until its pictures are rendered from a 3D model: the generator's solid of four views with the rider aboard, its height taken as the rider-included 1.287 m rather than the mechanics document's, drawn at 64 yaw by 7 bank images (`bankDegrees` 60) by turning the solid about the line where its tyres meet the road, its sloping sides, which the generator colors as the underside, given back the color of the nearest side surface; its red is the paint, which the white palette keeps and the red, blue and black palettes replace. Its banks and height lie outside the command, so its views and recipe are not saved here. The reference photographs and screenshots used to judge a set are not saved here.

## HUD picture generator

The HUD pictures are drawn from sources saved under `content/hud-picture-sources/`: `recipes.json` and one source
`<name>.png` for each picture it names. They are production-only data, which the build does not deliver; the sources
are pictures K generated and holds the rights to. `npm run hud-tiles`
([Development](development.md#hud-tiles-command)) draws every picture and writes them into the
[text tiles](#text-tiles) in place of those they held; the same sources and recipes always give the same pictures.

**Recipes.** `superoutride.hud-picture-recipes` version 1:

```text
{format, version, size: 48, colors: 15, supersampling: 10, alphaThreshold: 0.5,
 steeringWheel: {white, openingRadius, erosion, rimLeather: {radius, saturation, exponent, scale},
                 edgeAngles, outerSmoothing, innerSmoothing},
 pictures: {<name>: {kind: "steeringWheel", rimCentre: [x, y], hubOffset: [x, y], gamma}
                  | {kind: "topBridge", centre: [x, y]}, ...}}
```

The recipes name exactly the text tiles' HUD pictures, whose frames and turning the generator follows. Each picture is
`size` pixels square, the text tiles' 48, in `colors` colors and transparency: a palette of its own, shared by all its
frames and saved as RGB555. `kind` says how its source is read. Coordinates are source pixels from the top-left
corner.

**Steering wheels.** A source shows the wheel squarely from the driver, upright, on white; its rim's outer diameter,
350 mm, fills the picture. The background is the white (every channel at least `white`) that a disk of
`openingRadius` fits in, grown back through the white it touches, so the white around the wheel, between the rim and
the spokes and in the lightening holes is cut out and thin white stitching stays. The rest, opened once, is the solid,
and its edge loses `erosion` pixels, which drops the light fringe; every cut-out pixel takes the color of the nearest
solid one, so filtering never mixes in white. Colors are raised to the power `gamma` (as fractions of full scale); the
rim's leather, farther than `rimLeather.radius` from the rim centre and less saturated than `rimLeather.saturation`
(the largest channel less the smallest), becomes `255 (v/255)^exponent × scale`, which evens out its sheen.

The rim's outer and inner edges are measured at `edgeAngles` angles about `rimCentre`: going inward, the first solid
pixel and the first gap after it; an inner edge whose rim thickness is a quarter or more from the median is replaced
by the edges either side. Each edge is smoothed round the circle by a Gaussian of `outerSmoothing` or `innerSmoothing`
angles and remapped radially onto the circle of its mean radius, so the rim is a perfect ring. Inside the rim the hub
is moved onto the rim centre: a point at radius r takes the source `hubOffset × (1 − r/inner radius)` away. The rim's
band is always opaque (from 3 pixels outside the inner circle to 2 inside the outer) and nothing outside the outer
circle is.

**Top bridges.** A source shows the bridge squarely from the rider, upright, on transparency; it turns about `centre`
and its width fills the picture.

**Frames.** Each frame is drawn at `supersampling` samples a side for each pixel, read bilinearly, and reduced by a
box filter over premultiplied color; a pixel covered for at least `alphaThreshold` is opaque. The palette is k-means
clustering of every opaque pixel of all the picture's frames from deterministic k-means++ seeds, and each pixel takes
its nearest color.

## Screen pictures

Screen pictures are the [tile pictures](#tile-pictures) the front end draws: the title logo and the series images.
They are saved under `content/screen-pictures/<name>.json`, each named by its file, and delivered as authored (manifest
kind `screen-picture`); delivery admits them once (`compileScreenPictures`). `title-logo` is required and is 18×7 tiles
(288×112 pixels) and may be transparent; a series image is 20×15 tiles (the 320×240 frame) and opaque, checked where
its [series document](content-and-gameplay.md#series-documents) names it.

**Generator.** `npm run screen-pictures` ([Development](development.md#screen-pictures-command)) draws every screen
picture from production-only sources that the build does not deliver: `content/screen-picture-sources/recipes.json`
and one `<name>.png` for each picture it names. K generated the sources and holds the rights to them. The same sources
and recipes always give the same pictures.

```text
{format: "superoutride.screen-picture-recipes", version: 1,
 pictures: {<name>: {columns, rows, fit: "fill" | "contain"}, ...}}
```

The picture is `columns`×`rows` tiles. `fill` scales the source to the whole picture; `contain` scales it, keeping its
aspect, to fit inside the picture, centred, the rest transparent. Scaling is the area filter: each picture pixel
averages the source area it covers, its color weighted by alpha so transparent pixels lend no color, and keeps straight
alpha. A pixel whose alpha is below 128 is index 0. Each tile then takes up to 15 RGB555 colors by median cut over
its opaque pixels (the box with the widest channel range splits at that channel's median, at a value boundary, the
first box and channel winning ties; each box's color is its rounded mean), and each opaque pixel the nearest of those
colors; there is no dithering. A tile's palette holds the colors its pixels take in value order, so identical tiles
share their pattern and palette, which are saved once.

| Picture           | Source              | Recipe          |
| ----------------- | ------------------- | --------------- |
| `title-logo`      | the logo, cut out   | 18×7, `contain` |
| `tsukuba-clubman` | 4:3                 | 20×15, `fill`   |
| `ribbon`, `trial` | 320×240 plain (DEV) | 20×15, `fill`   |
