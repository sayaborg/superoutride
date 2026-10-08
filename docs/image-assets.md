# Image assets and compilation

This document owns saved image formats and compilation. [Architecture](architecture.md) owns projection,
logical sprite extent and anchors; [Content and gameplay](content-and-gameplay.md) owns course fields/references.

## Completed sprite images

Indexed sprites and BG tiles pack two 4-bit indices per byte, high nibble first. Index zero is
transparent (BG patterns cannot use it; see below); indices 1 through 15 are opaque. Resolved palettes have exactly 16 RGB555 entries, with slot zero
unused. RGB555 zero in an opaque slot is black. Source JSON stores row-major index arrays.
Tile palettes begin at `paletteId << 4`; the format has no separate palette-count limit.

```text
{
  format: "superoutride.sprite-lod", version: 4, name,
  width: W, height: H, anchorX, anchorY,
  defaultPalette: "original",
  palettes: {original: {colors: [RGB555 integers]},
             alternate: {colors: [RGB555 integers]}},
  levels: [{paletteRgb555: [16 integers], indices: [row-major indices],
            mixtures: [[], [[baseIndex,weight], ...], ...]}, ...]
}
```

Master width at 40 texels/m defines physical width; a course sprite's solid width is bounded by it, and its master height at the same scale is the solid object's height. Each level has at most 15 opaque colors.
Level zero preserves semantic palette slots and identity mixtures for slots 1 through 15.
A coarse slot is a positive-weight mixture of original opaque slots summing to one; unused slots
have empty mixtures. Its normal color is the mixture evaluated in the original palette.
Equal colors can occupy distinct semantic master slots.

`palettes` is a dictionary of unique nonempty trimmed names. `defaultPalette` names its default
color. Course images declare all 16 slots. Vehicle-set images declare only slots 0 through 14:
slot 15 is reserved for the set's brake lamp, and explicitly supplying it is rejected. The same
omission applies to their level-zero `paletteRgb555`; the set supplies its off color before mixture
validation. Coarse generated palettes still contain 16 entries: their slots are filtered mixtures,
not semantic master slots. The resolved level-zero palette equals the resolved default color.
Images carry no lamp declarations. All color × set lamp-state combinations participate in LOD
compilation. Evaluating the shared mixtures in a selected combination generates its level palettes
once before drawing; patterns remain shared. Course images can freely use slot 15.
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
distance is the maximum across all declared color/lamp combinations; the greatest area-weighted-error group
splits around its farthest representatives. Representatives are area-weighted mixture centroids;
stable input order resolves ties. Color or lamp edits invalidate the generated pyramid.

The vehicle sprite set documents under `content/sprites/` hold normalized masters with yaw/bank bindings.
Their generated library uses the same `dist/delivery/images/<sha256>.json` location as course images; its manifest ID,
`vehicles`, names no course image.
The content manifest maps the logical image name `vehicles` to its path and exact-byte SHA-256;
courses find their images by that digest ([Content and gameplay](content-and-gameplay.md#geometry-and-reference-records)).
All consumers resolve these entries through the manifest
and verify bytes before decoding. Format and version are written only inside each image file,
never in course asset references or manifest entries.
Strips have no ground image inputs.

## Infinite tiled background

The image is a tile map of 16 by 16 patterns, 40 tiles (640 pixels) high and of any width up to 256 tiles (4096
pixels); its tiles give its width:

```text
{
  format: "superoutride.tile-background", version: 1, name,
  patterns: [{indices}], palettes,
  tiles: [[patternId,paletteId], ...]
}
```

Tiles are row-major, in 40 full rows, and bind a pattern and 16-entry palette. The background is opaque: admission
rejects any pattern index 0, used or not, at its JSON Pointer inside the image, so the background
writes every pixel it covers. The map is a single infinite plane with no LOD.
The source horizon row and Section-frame yaw origin are authored; yaw and pitch scroll the map, and camera
translation has no effect. Vertically the mapping is linear: the screen horizon row
([projection](architecture.md#height-and-projection)) meets the image's horizon row, each screen row shows one
image row (`imageY = round(imageHorizonY + y - horizonY)`), and rows beyond the image's top or bottom repeat its
edge row. Horizontally it scrolls at the camera's focal length, `f` pixels per radian of camera yaw from the yaw origin, as
distant road and sprites do, and repeats at its own width: a full turn spans `2*pi*f` pixels, so a map that wide
closes on itself exactly and a narrower or wider one shifts by the difference each turn. The provisional skies are 94
tiles (1504 pixels), 359 degrees at the product's 240 px. Frame changes transform yaw origin with camera yaw.
`compileTileBackground` admits this document and builds the immutable `TileBackgroundImage` reader;
the reader's constructor keeps only its local invariant that every tile binds an existing pattern and palette.

## Text tiles

`content/text-tiles/default.json` uses `superoutride.text-tiles` version 1, the tiled background's pattern and
palette fields without a tile arrangement:

```text
{format: "superoutride.text-tiles", version: 1, name, patterns: [{indices}], palettes}
```

Patterns are 8 by 8 and, unlike the background, admit index 0 as transparent. Patterns 0 through 94 are the
printable ASCII characters U+0020 through U+007E in code order, so the character mapping needs no saved table.
The HUD part tiles follow them in one fixed order that code names, the same way, so their mapping needs no saved
table either; the document must hold at least all of them, and later patterns are free. Pattern 0, the space, must
have only index 0: it is the empty tile.

| Patterns | Names                   | Content                                                                   |
| -------- | ----------------------- | ------------------------------------------------------------------------- |
| 95–103   | `BAR_FILL_0`…`_8`       | A bar cell (rows 1–6) filled k pixels from the left in slot 1 over slot 3 |
| 104–110  | `BAR_FILL_RIGHT_1`…`_7` | The same, filled k pixels from the right                                  |
| 111–118  | `BAR_MARK_0`…`_7`       | A full-height line in column k (slot 1), drawn over a bar                 |
| 119, 120 | `BAR_LEFT`, `BAR_RIGHT` | The bar's end caps                                                        |
| 121–124  | `LAMP_ON_TL`…`_BR`      | A lit signal lamp, 2×2 tiles: body slot 1, gloss 5, rim 6, shade 7        |
| 125–128  | `LAMP_OFF_TL`…`_BR`     | An unlit signal lamp: rim 6 over a shaded body 7 with a faint gloss 5     |

Palettes 0 through 5 are WHITE, YELLOW, RED, DARK (unselectable items), GREEN (signal lamps and normal) and BAR
(unlit lamps and empty HUD parts); later palettes are free. A document holds at most 65536 patterns and 256
palettes (`TEXT_TILE_LIMITS`), so every pattern ID is a 16-bit and every palette ID an 8-bit unsigned integer and a
text grid cell keeps any admitted pair. A tile's palette chooses its color, so one lamp or bar
tile serves every color. Every named palette uses the same slots: 1 the main color, 2 the glyph shadow, 3 a bar's
ground, 5 a lamp's gloss, 6 its rim and 7 its shaded body. The
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
returns new ones, which the caller saves as one edit.

**Sources and recipes.** A source image and its recipe are production-only data: `content/sprite-sources/<name>.png`
(the PNG's own bytes) and `content/sprite-sources/<name>.json`. The build delivers neither; the authored files are
published with each build, so the workbench reopens them. The master's name is `<name>`. The recipe is
`superoutride.sprite-recipe` version 1:

```text
{format, version, target: "vehicle" | "course", crop: {x,y,width,height}, widthMeters, anchor: {x,y},
 mask: [{x,y,width,height,hidden}, ...], palette: [rgb555, ...] | null, lamp: {rectangles: [{x,y,width,height}, ...], colors: [rgb555, ...]}}
```

`mask` rectangles are applied in order: a hidden pixel keeps its color and takes alpha zero, and a shown one gets its
source alpha back. `palette` has 16 slots for a course image and 15 for a vehicle image (slot 15 is the set's brake
lamp); null generates it from the masked crop ([Candidate palettes](#candidate-palettes)) with 15 or 14 colors. Only a
vehicle image has lamp pixels: those inside a `lamp` rectangle or whose source color, as RGB555, is in `lamp.colors`.

**Import.** The masked source is normalized as [External source normalization](#external-source-normalization)
describes, with the recipe's palette. A vehicle image is normalized with its 15 colors and slot 15 repeating slot 1,
which the area filter's lower-code tie rule never chooses, so artwork never takes slot 15. Then the lamp mask, as an
image of the same alpha (lamp pixels white, others black), is normalized the same way, and each opaque texel whose
lamp sample is white takes slot 15. A course image is written as its named file, `content/images/<name>.json` with
the master in the saved layout, `<name>` being the source's name; it replaces an image of that name, so every course
naming it shows the new image. Naming it in a course is the course's edit.

**Sets.** An imported image joins a set with every palette name of the set, each starting as its own colors, and the
set's default palette. Images are added, replaced (every cell showing one shows the new one) and removed (only when
no cell shows it, later indices moving down); a cell of the yaw × bank grid is bound to any image of the set, and one
image may fill several cells. The set's brake-lamp colors and `bankDegrees` are set directly.

**Named palettes.** A palette is added (a copy of an existing one), renamed or removed in every image of a set at once,
so the set's images keep one set of names; a set keeps at least two, and an image's default palette cannot be
removed. One slot of one image's palette can be set to an RGB555 color; slots 1 to 14 only.

**Adjustment.** A new named palette is derived from an existing one in every image of a set: the chosen slots (from 1
to 14; never 0 or the lamp slot) are adjusted, the others copied, and only the resulting RGB555 colors are saved. In
Oklab's polar form the hue turns by `hue` degrees, the chroma scales by `1 + saturation` (at least zero), the lightness
gains `lightness`, and then `tint.amount` of chroma is added toward `tint.hue` degrees. All zero changes nothing.

**Oklab.** An RGB555 channel code `c` is the sRGB-encoded value `c/31`; the sRGB transfer function decodes it to
linear light (`v/12.92` up to 0.04045, else `((v+0.055)/1.055)^2.4`), and linear sRGB maps to Oklab by Björn
Ottosson's published matrices and cube root. The way back inverts them, encodes with the sRGB transfer function
(`12.92v` up to 0.0031308, else `1.055v^(1/2.4)-0.055`) and rounds `31v` to the nearest code, so an unadjusted color
returns to its own code. Lightness is limited to [0, 1]; a color still outside the sRGB gamut keeps its lightness and
hue and loses chroma, the largest in-gamut fraction found by 32 bisection steps, so a color that left the gamut does
not return to its code when the adjustment is undone.

## Course image sources

Each image a course names receives explicit `{name,bytes:Uint8Array}` input: valid UTF-8 JSON for the sprite or BG
format. Admission works out each image's SHA-256 from its bytes and decodes each name once into an immutable reader,
a `SpriteAsset` or a tiled background; Section membership resolves to those, and rendering borrows them without
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

## Vehicle sprite library

Each vehicle sprite set is authored as one document, `content/sprites/<set>.json`, using
`superoutride.vehicle-sprite-set` version 1. The set's name is its file name without `.json`; the document carries
none:

```text
{format, version, yawVariants, bankVariants, bankDegrees?, brakeLamp: {off: 12321, on: 32038},
 assets: [[spriteIndex, ...], ...], sprites: [SpriteLodDocument, ...]}
```

`assets` indexes the document's own `sprites`. The authoring core
([`vehicle-sprite-sets.ts`](../tools/graphics/vehicle-sprite-sets.ts)) admits each set document by the library's rules,
with diagnostics at the set document's own pointers, then assembles the library's masters: sets in name order, each
set's images after the earlier sets' and its indices offset to match. The delivered library (manifest `image` /
`vehicles`) is one document, `superoutride.vehicle-sprites` version 4:

```text
{format, version, sprites: [SpriteLodDocument, ...],
 sets: {testarossa: {yawVariants, bankVariants, assets: [[spriteIndex, ...], ...], brakeLamp: {off, on}},
       vfr750r: {yawVariants, bankVariants, bankDegrees: 60, assets, brakeLamp}, ...}}
```

Set names are unique nonempty trimmed keys, independent of vehicle form. Each set binds a complete
positive yaw × bank grid to library images. A set declares `bankDegrees` exactly when it has more than
one bank image: the lean from vertical, in degrees in (0, 90], of the rider-and-machine centre-of-mass
line that its outermost bank images depict. Bank selection divides the vehicle's displayed lean by it.
Every image belongs to exactly one set; a set may bind one image to several cells. The build admits
the masters with the same library reader, then compiles each image with its set's lamp colors; delivered
images have complete LOD pyramids. Every image in a set declares exactly the same set of at least two
color names. Each set requires one `brakeLamp:{off,on}` declaration of RGB555 integers, shared by all
its colors and angles. Slot 15 always means the brake lamp within these images; slots 1 through 14
remain ordinary image colors. Vehicle admission checks form-specific bank dimensions and default-color
references, as specified in
[Vehicle physics](vehicle-physics.md#material-vehicle-and-driving-documents). This section is the library
format's only specification. The vehicle domain admits the library and owns its sets at run time:
per-vehicle color and lamp variants and yaw/bank image selection. The image domain supplies only the
generic sprite LOD reader and palette resolution.

The provisional pictures are one set per vehicle, named by its id in lower case with `_` as `-` (`testarossa`,
`911-turbo-3-3`): drawn by code, original, at 40 px/m on the ground line, which is the bottom row (rows below the body
are empty where it stands behind that line), with `anchorX` at the vehicle's position. Every image of a set places the
vehicle's position at the same point, half the vehicle's width behind the ground line as the scene's camera sees it, so
turning a vehicle does not move it up or down. Cars have 48 yaw images (7.5° apart); motorcycles 48 yaw by 5 bank
images (`bankDegrees` 60). Each has an `original` and an `alternate` color. Their palette slots are 1–3 body
(light, mid, dark), 4–5 glass, 6 tyres, 7 shadowed parts, 8 headlamps, 9 bumpers, 10 metal, 11–12 the rider's clothing,
13 the helmet, 14 spare and 15 the brake lamp, with set off/on colors 13379/31974. They are baked for the product
camera (240 px, 0°) and are rebaked when it changes; production art replaces them.

Vehicle pictures are baked with a camera `k` times as far from the vehicle as the scene's camera and with `k` times its
focal length, `k = 2` (`VEHICLE_SPRITE_CAMERA_FACTOR`): the scene's size with a flatter perspective. The renderer
selects a vehicle's yaw image by that camera's direction of view
([Architecture](architecture.md#sprites-and-painter)), and every set is baked with this factor.
