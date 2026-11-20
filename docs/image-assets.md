# Image assets and compilation

This document owns saved image formats and compilation. [Architecture](architecture.md) owns projection,
logical sprite extent and anchors; [Content and gameplay](content-and-gameplay.md) owns course fields/references.

## Completed sprite images

Indexed sprites and BG tiles pack two 4-bit indices per byte, high nibble first. Index zero is
transparent (BG patterns cannot use it; see below); indices 1 through 15 are opaque. Resolved palettes have exactly 16 RGB555 entries, with slot zero
unused. RGB555 zero in an opaque slot is black. Source JSON stores row-major index arrays, except the vehicle
pictures' hexadecimal rows ([Vehicle sprite sets](#vehicle-sprite-sets)).
Tile palettes begin at `paletteId << 4`; the format has no separate palette-count limit. Course images use this
format; vehicle pictures use the [vehicle sprite sets](#vehicle-sprite-sets)'s.

```text
{
  format: "superoutride.sprite-lod", version: 7, name,
  width: W, height: H, anchorX, anchorY?,
  defaultPalette: "original",
  palettes: {original: {colors: [RGB555 integers]},
             alternate: {colors: [RGB555 integers]}},
  levels: [{paletteRgb555: [16 integers], indices: [row-major indices],
            mixtures: [[], [[baseIndex,weight], ...], ...]}, ...],
  shadow?: {width, height, anchorX, anchorY, levels: [{indices: [row-major indices]}, ...]},
  extend?: "left" | "right",
  lies?: true
}
```

An image stands on its bottom edge: its anchor is `(anchorX, H − 0.5)`, the height following from `H` alone, unless it
carries `anchorY` (texel centres, −0.5 ≤ anchorY ≤ H − 0.5), written only for a picture folding above its bottom edge:
what lies on the ground at the original's anchor, a picture whose ground painted at its foot lies below its base, a
roadside wall folding at the ground's row. A shadow keeps its own `anchorY`. The default anchor, which drawn pictures and new recipes
take, is the middle of the bottom edge, `((W − 1)/2, H − 0.5)` (`defaultSpriteAnchor`). Master width at 40 texels/m
defines physical width; a course sprite's solid width is bounded by it, and its master height at the same scale is the
solid object's height. Each level has at most 15 opaque colors.
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
anchor mapped as the image's. A master carries its shadow's master level; the LOD compiler reduces it, a level texel
opaque where any master texel in its box is, so a shadow never vanishes at a distance. A movable object's standing, flying and
landed images each carry one ([Content and gameplay](content-and-gameplay.md#sprites-and-environment)); the
provisional ones are the object's square seen by the size-0 contract camera ([Picture contract](#picture-contract)).
`extend` is optional: it makes the image a board extending sideways, which repeats within its plane the way it names
to the frame's edge ([Architecture](architecture.md#sprites-and-painter)); an image without it is drawn once. An
image's mirror image (`-mirrored`) extends the other way. It is for looks alone: an extending image is never a solid
object's ([Sprites and environment](content-and-gameplay.md#sprites-and-environment)).
`lies` is optional and only `true`: all of the image lies on the ground about its anchor, drawn in its colors as a
shadow is, and none of it stands ([Shadows](architecture.md#shadows)); it is for looks alone, a picture lying on the
road no material.
Course sprites select one declared palette by its required name, including an explicit default name.
The course compiler validates that reference and shares image/name resources. Rendering applies each
selected palette once; no raw course replacement palettes or value-by-value LOD membership checks remain.
[Architecture](architecture.md#sprite-lod-metric-and-read-contract) owns level dimensions and anchors.

Invalid dimensions, anchors, indices, palettes, mixtures or unknown fields
fail. Every saved image format in this document and the sprite recipe admit
through the [content admission toolkit](architecture.md#content-admission-toolkit) and report the
first failure at its JSON Pointer. Coarse colors must agree with their mixtures. Readers own packed buffers and immutable metadata.
A course image is saved with every level of its LOD, compiled from its master when it is written; the build admits it
as it is and compiles no level, and refuses a saved sprite without every level. Every tool that writes a course image
writes it through one function (`courseImageFile`), which compiles
the levels from the master, so no saved image holds a master without its levels or levels of another master. A master alone (one normalized level) is the LOD compiler's
input.

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
The sprite editor, the sprite command and the build consume those same TypeScript implementations.

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

One tile picture format serves the course sky, the series images and the title logo: 8×8 patterns of 4-bit
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
A map is 1–512 tiles wide and 1–80 tiles high. `compileTilePicture` admits this document and builds the immutable
`TilePicture` reader; the reader's constructor keeps only its local invariant that every tile binds an existing pattern
and palette. Each use of the format states its own size and opacity where it admits the picture.

## Infinite tiled background

A course sky is a tile picture 80 tiles (640 pixels) high and opaque, of any width up to 512 tiles (4096 pixels); the
course compiler checks both where the course admits its sky, at the environment's `background/image`. The map is a
single infinite plane with no LOD.
The source horizon row and Section-frame yaw origin are authored; yaw and pitch scroll the map, and camera
translation has no effect. Vertically the mapping is linear: the screen horizon row
([projection](architecture.md#height-and-projection)) meets the image's horizon row, each screen row shows one
image row (`imageY = round(imageHorizonY + y - horizonY)`), and rows beyond the image's top or bottom repeat its
edge row. The pseudo projection shares the horizon row; with the body pitched, it alone scales heights above and below
that row by `cos(phi)`. Horizontally a direction of yaw `psi` lies at image x `f*(psi - yawOrigin) + cx`, so facing
`psiCam` it shows at `cx + f*(psi - psiCam)`, `f` pixels per radian; the pseudo projection meets this only at the
centre column, taking distant road and sprites down a straight road of heading `psi` toward
`cx + f*sin(psi - psiCam)`. The map repeats at its own width: a full turn spans `2*pi*f` pixels, so a map that wide
closes on itself exactly and a narrower or wider one shifts by the difference each turn. The provisional skies are 188
tiles (1504 pixels), 359 degrees at the product's 240 px. Frame changes transform yaw origin with camera yaw.

## Drawn pictures

Drawn pictures come from a deterministic production-only program ([`tools/graphics/drawn/`](../tools/graphics/drawn)):
outlined shapes in three tones of light, at most 15 colors a picture, at 40 texels per metre, standing on the middle of
their bottom edge (the default anchor). Each picture is written as a source with its recipe,
`content/sprite-sources/<name>.png` and `.json`, and imported as a course image; replacing a source with another image
of the same name and size and running its command replaces the picture without touching a course.

The [tire puffs](tire-puffs.md)' pictures are drawn by the same program, `npm run puff-pictures`
([Development](development.md#puff-pictures-command)), in the same look: clouds of overlapping lumps, each lump lit as a
sphere from the upper left in three tones over a darker outline, opaque, standing on the middle of their bottom edge
and casting no shadow. A picture is as wide and as tall as the diameter it shows, at 40 texels per metre, for nine sizes
from 0.25 m to 4 m in steps of √2 (`k` 0 to 8, widths rounded to whole texels). Each size has two cloud shapes,
`puff-cloud-<k>-a` and `-b`, with the named palettes `smoke` (white to grey, the default), `dirt`, `sand`, `verge` and
`grass` (grass and earth), and spray's two shapes, the mist `puff-mist-<k>` and the drops `puff-drops-<k>`, with the
palette `spray`. Every palette uses slots 1 (outline), 2 (shade), 3 (middle) and 4 (light). Each is saved as a sprite
source with its recipe naming its palettes and imported as a course image; replacing a source with another of the same
name and size and importing it with the sprite command replaces the picture.

## Background transitions

The background shown is the one of the environment interval at the point the camera follows
([Architecture](architecture.md#ground-and-background)). A knot's `transition`, metres from it
([environments](content-and-gameplay.md#sprites-and-environment)), is how long its map takes to replace the one in
force before it, the share p = (s − knot) / `transition` of the point's route station s, 0 to 1; `transition` 0
replaces it at once. The change runs along the Route, so it continues past its Section's end into a Section that begins
with the new map, and it is a function of the station alone: a still frame (the course command's renders) and a run
show the same sky at the same point, whichever way the vehicle moved.

Within a change, round(240p) of the frame's 240 lines show the new map and the rest the old. The lines are taken in
the order of their numbers' 8 bits reversed, those below 240 kept (a group of eight in the order 0, 4, 2, 6, 1, 5, 3,
7), so every share is spread evenly over the frame: 1/8, 1/4, 1/2, 3/4 and 7/8 give evenly spaced stripes, and the
shares between fill the widest gaps first. Each line shows its map by that map's own scroll, yaw and horizon, so each
sky moves as the camera turns, about its own yaw origin. Both maps keep their own palettes: no palette is rewritten
and no color mixed, as a late-1980s hardware's tile plane could.

The road's and the ground's colors change over the same interval: a Strip's color pair
([Strips](content-and-gameplay.md#strips)) mixes its old color and its new in linear light by the share at each road
row's own station, so a color is fixed to its place on the road and moves with it. A Section with pairs keeps a
second ground, its pairs at their old colors, and a row within a change mixes the two before it rounds a pixel.

A knot whose map is the same picture as the one in force changes nothing. The
[course scene](../src/view/course-scene.ts) draws the sky from the readers' `skyAt` at the point the camera follows.

## Text tiles

`content/text-tiles/default.json` uses `superoutride.text-tiles` version 1, the tile picture's pattern and
palette fields without a tile arrangement:

```text
{format: "superoutride.text-tiles", version: 1, name, patterns: [{indices}], palettes}
```

Patterns are 8 by 8, and index 0 is transparent as in tile pictures. The text tiles draw the characters in one fixed
order that code names (`TEXT_CHARACTER_ORDER`): the printable ASCII characters U+0020 through U+007E in code order,
then the marks ▲ ▼ ◀ ▶ (U+25B2, U+25BC, U+25C0, U+25B6), so the character mapping needs no saved table. Text encodes
exactly these characters; any other is a `RangeError`. Menus show choices above and below with ▲ and ▼ and either
side with ◀ and ▶.

The fonts come first (`TEXT_FONTS`), each a pattern per character in that order for each of its rows; the HUD part
tiles follow them in one fixed order that code names, the same way, so their mapping needs no saved table either, and
the HUD pictures follow them; the document holds exactly these, all written by the generators. Pattern 0,
the space, must have only index 0: it is the empty tile.

| Patterns | Names                                | Content                                                                                                                      |
| -------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 0–98     | `normal`                             | The normal 8×8 font: ink slot 1, its shadow slot 2                                                                           |
| 99–197   | `ornateSmall`                        | The ornate small 8×8 font: ink slots 1–7 by row from the top, its shadow 8                                                   |
| 198–296  | `ornateLarge`, top                   | The ornate large 8×16 font's top tiles: ink slots 1–8 by row, its shadow 9                                                   |
| 297–395  | `ornateLarge`, bottom                | Its bottom tiles, with the same slots                                                                                        |
| 396–399  | `LAMP_TL`…`_BR`                      | The signal lamp, 2×2 tiles, one set whose palette gives its state: outline 1, bezel 4–6, lens 7–12, specular 13, glow rim 15 |
| 400–444  | `METER_a_b` (0 ≤ a ≤ b ≤ 8)          | A meter cell (rows 2–5): slot 1 before column a, slot 4 to b, the slot 3 ground                                              |
| 445–451  | `METER_RIGHT_1`…`_7`                 | A meter cell filled k pixels from the right in slot 1 over the slot 3 ground                                                 |
| 452–531  | `TACH_0`…`_79`                       | The tachometer's tiles in every state they reach: a tile's first color slots 1–7, its second 8–14                            |
| 532–609  | `DIGIT_g_k` (g 0–9, `OFF`, `L`, `H`) | Tile k of a 2×3-tile italic segment digit: lit core 1, edge 2; unlit 3, 4                                                    |
| 610–625  | `ARROW_LEFT_0`…`_15`                 | Tile k of the 4×4-tile road arrow pointing left, a triple chevron: outline 1, shadow 2, gradient 3–10 from the top           |
| 626–641  | `ARROW_RIGHT_0`…`_15`                | The same pointing right                                                                                                      |
| 642–647  | `TIRES_CAR_0`…`_5`                   | Tile k of the 2×3-tile tire gauge for a car: outline 1, tires 2, lines 3                                                     |
| 648–653  | `TIRES_BIKE_0`…`_5`                  | The same for a bike                                                                                                          |

The fonts, the signal lamp, the segment digits and the road arrow are the [HUD design sources](#hud-design-sources)'. The other part tiles
are drawn by the HUD tiles command ([Development](development.md#hud-tiles-command)), which writes them in place:

- A meter cell is 4 pixels high with 2 pixels clear above and below; `METER_a_b` serves a meter filled from the left
  with its cut part (slot 4) at the fill's end, and `METER_RIGHT_k` a meter filled from the right.
- The tachometer ([tachometer](../src/image/tachometer.ts)) is 26 italic bars over 10×3 tiles (80×24 pixels),
  standing on the bottom row: bar `i` (0–25) is `h(i) = 4 + round(20*(i/25)^2)` pixels high, and its pixel at height
  `k` (0 at the bottom) occupies columns `3i + floor(k/8)` and `3i + 1 + floor(k/8)`, a lean of one pixel per 8 rows
  whose right edge reaches pixel 79. A tile holds at most two colors, the first in slots 1–7 and the second in 8–14:
  each color's lit ramp `L0..L4`, dark to light, and its unlit `U0` and `U1`. With band `b = min(3, floor(k*4/24))`
  a lit pixel in a bar's left column is `L[b+1]` (`L3` at `b = 3`) and in its right column `L[b]` (`L2` at
  `b = 3`), a bar's top pixel is `L4` in both, and unlit the left column is `U0` and the right `U1`. Only the 19 of
  the 30 tiles that hold part of a bar have patterns: one for each state they reach (the number of their bars lit and
  where the color split falls among them, with fuel cut latched or not), identical patterns saved once, tile by tile
  in order of first use, so the HUD finds a state's pattern by the same rule.
- The tire gauge ([tire gauge](../src/image/tire-gauge.ts)) is 16×24 pixels over 2×3 tiles, the author's figure of
  the axles from above by the vehicle's form: tires 4×6 pixels in slot 2 and lines 2 pixels wide in slot 3, every
  other pixel beside one of them, diagonals included, the slot 1 outline. A car's tires stand at pixel columns 1–4 and
  11–14, the front at rows 1–6 and the rear at 17–22, each axle a line in columns 6–9 between its tires (rows 3–4 and
  19–20) and one line in columns 7–8 joining the axles; a bike's tires stand at columns 6–9, joined by a line in
  columns 7–8. A tile holds one palette, so the front tires lie in the top row of tiles alone, the rear in the bottom
  row alone, and the middle row holds only the line. Its patterns run row by row from the top left.

The HUD pictures follow the part tiles in one fixed order that code names as well (`HUD_PICTURES`), each with a
palette of its own after the named palettes, in that order:

| Patterns  | Palette | Name         | Picture                                          | Frames                                   |
| --------- | ------- | ------------ | ------------------------------------------------ | ---------------------------------------- |
| 654–1805  | 77      | `prototipo`  | A steering wheel with three drilled metal spokes | 32, 11.25° apart, a full turn, 0 upright |
| 1806–2957 | 78      | `mod02`      | A steering wheel with two dark spokes            | 32, 11.25° apart, a full turn, 0 upright |
| 2958–4109 | 79      | `montecarlo` | A steering wheel with three dark spokes          | 32, 11.25° apart, a full turn, 0 upright |
| 4110–5297 | 80      | `top-bridge` | A motorcycle's top bridge and handlebars         | 33, 45/32° apart, ±22.5°, 16 upright     |

Each frame is 48×48 pixels, 6×6 tiles, each next frame turned one step further clockwise; its 36 patterns run row by
row from the top left, so frame `f`'s tile at row `r` and column `c` is the picture's first pattern plus
`36*f+6*r+c`. A picture's palette holds its 15 colors in slots 1–15. The [HUD picture generator](#hud-picture-generator)
writes the pictures and their palettes in place; no table changes.

The named palettes (`TEXT_PALETTES`) come first, the authored ones and then those the HUD tiles command draws, and the
HUD pictures' palettes follow, and the document holds exactly these. The generators own the whole document: the HUD
tiles command and the HUD picture generator write every pattern and palette, and nothing else may be added. The
counts stay within 65536 patterns and 256 palettes (`TEXT_TILE_LIMITS`), so every pattern ID is a 16-bit and every
palette ID an 8-bit unsigned integer and a text grid cell keeps any admitted pair. A tile's palette chooses its color, so one glyph, lamp, meter, bar or digit
tile serves every color and the lamp every state.

| Palettes | Names                                                                 | Use                                                                         |
| -------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 0–4      | WHITE, YELLOW, RED, DARK, GREEN                                       | Authored: the normal font's colors and the meters'                          |
| 5–10     | `ORNATE_SMALL_<style>`                                                | The ornate small font's styles SUNSET, WHITE, RED, GREEN, YELLOW and ORANGE |
| 11–22    | `ORNATE_LARGE_<style>`, `…_BOTTOM`                                    | The ornate large font's styles, each a top palette and then its bottom      |
| 23–25    | SEG_VFD, SEG_YELLOW, SEG_RED                                          | The segment digits: the instruments' color, and state colors                |
| 26–30    | TACH_GREEN, TACH_YELLOW, TACH_RED, TACH_GREEN_YELLOW, TACH_YELLOW_RED | The tachometer's colors, one or where two meet                              |
| 31–33    | LAMP_OFF, LAMP_RED, LAMP_GREEN                                        | The signal lamp unlit, lit red and lit green                                |
| 34       | ARROW                                                                 | The road arrow                                                              |
| 35–75    | `TIRES_0`…`TIRES_40`                                                  | The tire gauge's tire colors, green to yellow to red                        |
| 76       | TIRES_AIR                                                             | The tire gauge's tires without load                                         |

The authored palettes are WHITE, YELLOW, RED, DARK (unselectable items) and GREEN. They use the same slots: 1 the
main color, 2 the glyph shadow, 3 a meter's ground and 4 a meter's cut part (red in every authored palette).

An ornate style keeps the source's slot meanings: a ramp down the glyph from a light top through a strong middle to a
dark bottom, and a black shadow. SUNSET's palettes are the source's; WHITE runs from white through a light blue-grey
to a cool grey, RED from pale pink through red to dark red, GREEN from pale green through green to dark green, YELLOW from
pale yellow through yellow to dark amber and ORANGE from pale peach through orange to dark brown, over
the small font's 7 ink rows and the large font's 14 (its top tile's 8 and its bottom tile's first 6; the bottom
palette's last two slots repeat the darkest). The segment digits' palettes are the source's: SEG_VFD the
instruments' blue-green, SEG_YELLOW the gear's color after a shift, and SEG_RED a spare state color. The
tachometer's colors, as 8-bit channels saved as RGB555:

| Color  | L0 → L4                                                          | U0 / U1                 |
| ------ | ---------------------------------------------------------------- | ----------------------- |
| Green  | (16,112,40) (32,168,56) (64,216,80) (136,244,136) (200,255,200)  | (36,68,44) / (28,56,36) |
| Yellow | (160,104,0) (216,160,0) (248,208,16) (255,240,112) (255,255,200) | (76,68,28) / (64,56,20) |
| Red    | (128,16,8) (192,28,16) (240,56,32) (255,136,112) (255,208,192)   | (76,32,28) / (64,24,20) |

The tire gauge's palettes share slot 1, the signal lamp's outline, and slot 3, the lamp's middle bezel grey (slot 5
of its palettes); slot 2 is the tires' color. The tire colors run from the tachometer's green to its yellow and on to
its red, each its lit ramp's `L2`, in RGB555 steps: from one end color to the next there are as many steps as the
channel that differs most differs, so that channel changes by one each step and the others by their nearest share
(`round(a + (b - a) k / n)`), and yellow is shared. Green (8,26,10) to yellow (30,25,2) is 22 steps and yellow to red
(29,7,4) 18, so `TIRES_0` is green, `TIRES_22` yellow and `TIRES_40` red. TIRES_AIR's tires are the DARK text's grey.
The HUD chooses among them ([HUD](browser.md#hud)); no tile's pattern changes with them.

The build admits the document and delivers it as authored as the
manifest `image` entry `text-tiles`. `compileTextTiles` admits it and builds the immutable `TextTiles` reader, which
encodes text to a font row's patterns (a character without a pattern is a `RangeError`) and paints one tile's opaque
pixels.

## External source normalization

Decoded inputs are straight-alpha 8-bit sRGB pixels and this normalization recipe, which the
[import](#sprite-operations) makes from a saved sprite recipe:

```text
{
  format: "superoutride.sprite-source", version: 4, name,
  crop: {x,y,width,height}, widthMeters,
  anchor: {x, y?}, paletteRgb555
}
```

The crop is an integer rectangle inside the source. `widthMeters` calibrates the entire crop,
including transparency. Master width is `round(widthMeters*40)`, positive ties upward, at least one;
actual width is that integer divided by 40. The uniform scale is master width/crop width. Master
height is the ceiling of scaled crop height, with transparent fractional-row padding.

The source anchor is an original-image texel-center coordinate across and, with `y`, down, each mapping by pixel edges
to `(sourceAnchor+0.5-cropOrigin)*scale-0.5`: `x` to the master's `anchorX` and `y` to its `anchorY`, the ground row.
Without `y` the master stands on its bottom edge. Fractional/outside anchors are valid.
Exact overlap-area integration applies to reduction and enlargement. Straight alpha weights opaque color before the
common binary coverage threshold. The supplied palette has 16 slots, including unused slot zero. Output is one
normalized master level.

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
Coincident means can reduce distinct colors.

**The color rule** (`optimizeSpritePalette`, the one 15-color choice) reads the master a recipe's masked crop
normalizes to, each texel's linear-light area sample (`sampleSpriteCrop`), opaque at coverage 0.5 or more. It starts
from median cut over those samples and from three farthest-color seeds (from the first, middle and last opaque
sample), refines each by Lloyd steps (assignment to the nearest color in linear light, centroids snapped channel by
channel to the nearest RGB555 level, at most 96 steps), and keeps the colors of least squared error over the opaque
samples, sorted, after the transparent slot. It does not claim a global optimum. Equal samples are counted once with
their number, each Lloyd step's one pass both scores its colors and gathers the next, and a sample whose distance to its
color stays below a bound on its distance to every other color is not measured against them. A generated palette is a
saved editable value; mask/crop edits leave it in place until explicit regeneration.

## Sprite operations

The sprite operations are functions over the content store, free of Node and the DOM; the sprite editor's Sprites
module ([Development](development.md#sprite-editor)) and the sprite command (`npm run sprite`) call them. Each reads
documents and returns new ones, which the caller saves as one edit. They make course images; vehicle pictures come from
their own generator ([Vehicle sprite sets](#vehicle-sprite-sets)).

**Sources and recipes.** A source image and its recipe are production-only data: `content/sprite-sources/<name>.png`
(the PNG's own bytes) and `content/sprite-sources/<name>.json`. The build delivers neither; the authored files are
published with each build, so the sprite editor reopens them. The master's name is `<name>`. The recipe is
`superoutride.sprite-recipe` version 6:

```text
{format, version, crop: {x,y,width,height}, widthMeters, anchor: {x, y?},
 mask: [{x,y,width,height,hidden}, ...], palettes: {name: [rgb555, ...], ...} | null,
 dither?: "none" | "ordered" | "diffusion", shadow?: "board", mirror?: true,
 basedOn?: [{image, bodySha256, transform: {scale, x, y},
            placement?: {image, palette, across, up, moved: {x, y}}}, ...],
 bakedSha256?: "<hex>"}
```

The fields marked `?` may be omitted, which means a recipe without them. `anchor.y` is the ground row in source
texel-centre coordinates; `dither` chooses the nearest colors (`none`), an ordered 4×4 Bayer dither or error diffusion;
`shadow: "board"` casts the board shadow; `mirror: true` also writes `<name>-mirrored`, the picture and its shadow
reflected together. `basedOn` lists the pieces a product picture is based on, at least one: a picture made from one
original lists that one, a baked picture each piece. A piece names an original picture, the SHA-256 of its body PNG
(its whole master) and the map of a source pixel p to the original body's `scale·p + (x, y)`. A
baked piece also keeps `placement`, its placement before baking, which Revert picture puts back: the picture it showed
(original or product), its palette, its lateral (`across`) and ground offset (`up`) from the baked placement's in
metres, and how far K moved it in texels (`moved`). A baked recipe, and only one, names `bakedSha256`, the SHA-256 of
the PNG baking wrote: a baked picture whose PNG has another digest has been redrawn. Import never reads `basedOn` or
`bakedSha256`. `recipeOriginal` gives the one piece of
a picture made from one original, and the helpers below that follow a picture to its original take that piece.

A new recipe's anchor is the source's default, its middle, `(W − 1)/2` for a source `W` wide (`defaultSpriteAnchor`);
the picture stands on its crop's bottom edge. `mask` rectangles are applied in order: a hidden pixel keeps its color and
takes alpha zero, and a shown one gets its source alpha back. `palettes` names one or more palettes of 16 slots: the
first is the default, which the source is normalized with, and the others color the same slots otherwise. Null
chooses one, `original`, of 15 colors by the color rule ([Candidate palettes](#candidate-palettes)) on each import.

**Import.** The masked source is normalized as [External source normalization](#external-source-normalization)
describes, with the recipe's default palette, and carries every named palette of the recipe. Its anchor maps by pixel
edges, `anchor.y` to the master's `anchorY`. With `dither` `ordered` or `diffusion`, the master's slots are chosen
from the same samples by `quantizeSpriteSamples` (a 4×4 Bayer offset in linear light, or Floyd–Steinberg error
diffusion between opaque texels) in place of the nearest slot. With `shadow: "board"` it casts the
[board shadow](architecture.md#board-shadows) of the part above its ground row. It is written as its named
file, `content/images/<name>.json` with the master and every level compiled from it in the saved layout, `<name>`
being the source's name, and with `mirror` also as `<name>-mirrored` (`mirrorSprite`: the picture and its shadow
reflected together, the light not cast again); it replaces an image of that name, so every course naming it shows the
new image. Naming it in a course is the course's edit.

**Product picture helpers.** Seven functions serve the making of a product picture; import calls none of them.

- `registerSpriteSource` fits a PNG's outline (alpha 128 or more) to a reference frame's by translation and uniform
  scale alone: from the opaque bounds it searches with decreasing steps (8 to 0.25 texels, the scale within 0.6 to 1.4
  of the bounds' fit) for the greatest overlap, a heuristic rather than a proof of a global optimum. Its transform maps
  a PNG pixel p to the frame's `scale·p + (x, y)`, as a piece's `transform` does. It measures the result by the
  area-filtered coverage of the whole transformed PNG, pixels outside the frame included: the outline IoU (marked for
  review below 0.9, `REGISTRATION_IOU_LIMIT`) and the displacement of the left, right and bottom edges in texels. It
  clips nothing.
- `alternateSpritePalettes` makes a product picture's palettes from its original's, under the original's names and the
  default first. Each product texel centre finds its original body texel through the crop and its piece's `transform`
  (`basedOnPosition`); each product slot takes the original slot most often under it (the lowest on a tie, slot 1 where
  none is); an alternate color is the product color times that slot's default-to-alternate ratio in linear light per
  channel, clamped before RGB555, or the original's alternate channel where its default channel is near black.
- `reduceSpriteSource` keeps a PNG at its saved size: only the recipe's crop, reduced to twice its master's width
  (`SAVED_SOURCE_TEXELS`, never enlarged) by the linear-light area mean of straight-alpha pixels, as normalization
  samples. The recipe follows (its crop the whole reduced PNG, its anchor mapped by pixel edges, each piece's `transform`
  composed with the reduction). Every change of a product picture's source moves its pieces' transforms by one rule,
  `composePieceTransform`: the old map after the map of a new pixel to the old source's. A recipe with a mask is refused. `sourceLowResolution` says when a saved PNG holds
  fewer than two pixels across each master texel.
- `spriteLayers` gives a level's body and its shadow frame. The body is the whole master, an original's as any other
  picture's: road data keeps a body pixel within a ground shadow's rows in the body (and puts it in the shadow frame
  too), and the game draws the shadow first and the body over it, so nothing the master holds is taken from it.
- `spriteBodyPng` writes an original picture's body, its whole master (`spriteLayers`), in its default
  palette as an 8-bit indexed PNG whose image data is in stored deflate blocks (`indexedPng`), so the same body gives
  the same bytes in Node and the browser. A piece's `bodySha256` is that PNG's SHA-256, and a product picture whose saved
  PNG has that digest is its original not yet redrawn.
- A recipe places its master on its source by one map, `masterMapping` in `sprite-source-compiler.ts`: the master's
  width (40 texels a metre) and rows (`spriteMasterHeight`, the crop's aspect kept, a fractional last row padded), the
  source pixels across a texel, and, by pixel edges, a master texel's centre on the source, a source pixel's centre in
  the master, and the affine map from master to source. Normalization's base point and extent, `masterAnchor` (the base
  point in master texels; without `anchor.y`, the last row), `withMasterAnchor` (the recipe with its base point at a
  master texel), registration, the pieces' positions, baking and the comparison all use it.
- `placedOriginalBody` places an original body in a product master's frame: each master texel takes the body's slot
  under its centre through its piece's `transform` after `masterMapping` (`piecePosition`'s map, worked out once for
  each row and column), 0 outside the body. It is what the product shows at the recipe's scale
  and anchor until it is redrawn. `placedOriginalPieces` does so for a baked picture's pieces, each through its own
  `transform` (`piecePosition`), a later piece over an earlier one, and says each texel's piece and slot. `outlineIoU`
  compares two frames of one extent: the texels opaque in both over those opaque in either.
- `originalProductSource` makes the product picture first made from an original, looking as the original does: its
  body PNG (`spriteBodyPng`) and a recipe importing the whole PNG at one texel a pixel with the original's anchor, its
  palettes under their names (the default first), `shadow: "board"` when the original has a shadow, `mirror` when asked
  and `basedOn` one piece, the original with the PNG's digest and the identity transform. Each of the 24 original pictures
  ENDURO RACER's product course still used when it was removed (K, 2026-11-06) imported so to its original's body,
  texel for texel and color for color.
- `registeredProductSource` makes K's PNG a product picture's source. It registers the PNG to picture 3, the original
  body (or a baked picture's pieces' bodies) as the recipe places it at the master's extent and base point. The recipe takes the crop of that extent in
  the PNG (whole pixels about the registration, padded with transparency past the PNG), the master's width and base
  point, `palettes: null` for the caller to choose once, and each piece's `transform` composed through the old recipe. The
  source is kept at its saved size (`reduceSpriteSource`), and the base point is rounded to a billionth of a pixel
  without leaving the master's frame. Re-registering the six redrawn samples' saved PNGs gives each master its size and
  base point again, its outline IoU against the saved image from 0.907 to 1.000.

**Generation input.** `generationInput` makes a picture's input and guide for K's generation: its frame in its colors
enlarged by nearest neighbour by the whole factor nearest to 1024 px on its longer side (`GENERATION_INPUT_SIZE`), and
the same with the ground row, the base point and the collision lines drawn over it. `GENERATION_PROMPT` is the default
prompt: keep every existing part, thin ones included, and the pose; draw no background, ground or shadow; keep the
whole object in frame on a transparent background. `generationPrompt` adds K's note. `encodeSpritePng` writes an
image as an 8-bit RGBA PNG with the same pinned pngjs.

**Baking rules.** Four functions serve baking pieces into one picture ([NEXT](NEXT.md)'s Baking); the editor alone
calls them.

- `composePieces` composes pieces as the product draws them at size 0 on a frame where the pieces' common reference
  falls on a whole pixel. Each piece's level 0 frame goes at the pixel `drawScaledSprite` puts it on (its edge at
  `ceil(edge − 0.5)`, its base point at its lateral, ground offset and K's move), in its palette's colors. A later
  piece is drawn over an earlier one, as the renderer draws pictures at one depth. Each texel says which piece and slot
  it shows. The base point is by default the middle of the outer edges across and the lowest piece's ground row, moved
  by K's whole texels, and its lateral and ground offset are those at which the composition's texels fall where the
  pieces' do.
  ENDURO RACER's start, goal and checkpoint banners composed so equalled their three pieces drawn apart by
  `drawScaledSprite`, pixel for pixel, while its course placed them as pieces (until NM-15b joined them).
- `alignBakePieces` (`sprite-bake-align.ts`) moves pieces where their seams match best (K, 2026-11-03), from where the
  original places them. The piece with the largest frame stays; its neighbours (frames overlapping, or within 4 texels
  across or up of each other while overlapping the other way) are placed from it outward, each at the move within 4
  texels across and up whose seams with the pieces placed already differ least; while that best position lies on the
  search's edge the search widens a texel at a time, up to 8 (`ALIGN_MAX_REACH`), and a best still on the edge is said
  so. A piece whose best position differs more than 0.4 (`ALIGN_MATCH_LIMIT`) has no matching seam and stays where
  the original places it, and the pieces placed after it compare against it only when it is all they meet. A seam is judged as it is drawn, a
  later piece over an earlier one: the mean linear-light distance of the texels side by side or one above the other of
  which one shows the one piece and the other the other, so a frame's clear margin and what a later piece covers are
  not compared. A position judged by fewer than 10 such pairs is not chosen, and the smaller move wins a tie. A piece
  no neighbour reaches does not move. On ENDURO RACER's banners, while its course placed them as pieces (their pieces'
  pictures `enduror-110a4`, `11108`, `10744` and the others went with NM-15b), it moved the checkpoint banner's middle
  piece 2 texels left and 2 up and its right piece 3 left and 1 down, and the start banner's middle piece 1 right and
  its right piece 2; their seams differed 0.012 to 0.231 after aligning, and the goal's poles, 0.57 or more from its
  banner wherever they stood, stayed.
- `bakedPieceTransform` gives a baked piece's map from a composition pixel to its original's body: an original piece's
  is its frame's offset; a product piece's goes on through its recipe's map to its one original; a product picture's
  reflection reaches that original's reflection, an original of its own, through the reflected map.
- `alternatePiecePalettes` makes a baked picture's palettes once from its master's colors, one for each combination of
  the pieces' palettes, named by joining the pieces' palette names with `+` (`p045+p046`), the composed combination
  first. Each product slot takes the piece and slot most often under it, and another combination recolors it as that
  slot's color in its piece's base palette becomes the combination's (`recolorSpriteColor`, the step
  `alternateSpritePalettes` takes for one original). On a one-piece picture it gives what `alternateSpritePalettes`
  gives.

## Course image sources

Each image a course names receives explicit `{name,bytes:Uint8Array}` input: valid UTF-8 JSON for the sprite or tile
picture format. Admission works out each image's SHA-256 from its bytes and decodes each name once into an immutable
reader, a `SpriteAsset` or a tile picture; Section membership resolves to those, and rendering borrows them without
decoding. Delivery checks the bytes against the manifest digest before they reach admission.

Course image admission uses the single [document resource table](content-and-gameplay.md#numeric-and-resource-domains)
for the image count, per-image bytes/texels and aggregate bytes/texels. Missing, duplicate, unused, corrupt or
malformed inputs fail. Asset diagnostics contain `kind:"asset"`, code, the image's name and the supplied input
index where applicable; an invalid image also carries the JSON
Pointer `path` of its failure inside that image; independent failures follow declaration order.
Failure publishes no graph. The compiled course holds only the readers; build tools that read a saved image read the
admitted, frozen saved document alongside its reader instead of admitting it again.

## Saved course appearance

Background bindings use tile maps and sprites uses sprite levels. Ground contains direct RGB555
colors or transparency and saved Strip constructs, not image references. The course compiler expands
the constructs and builds private numeric fields; these are not image assets or serialized payloads.
[Content and gameplay](content-and-gameplay.md#sprites-and-environment) owns the saved fields;
[Architecture](architecture.md#strip-rendering) owns ground sampling and its common color law.

## Picture contract

Every picture is drawn at its base point ([Architecture](architecture.md#sprites-and-painter)): a vehicle's position
seen from above at its body's underside, an object's placement at its height. Its anchor is that point. Every picture
folds at its anchor: what lies above stands at the anchor's depth, what lies below lies on the ground nearer than the
anchor as far as that ground faces the camera (beyond a crest, the nearer slope hides it). A course image carrying
`lies` all lies on the ground about its anchor, as its shadow would. A course image stands on its bottom edge unless it carries its anchor's height. Pictures come in sizes; size `k`
(`k = 0` full size) is drawn at `40 / 2^k` texels per metre at the base point, and the renderer draws the size nearest
its scale ([Shared image level selection](architecture.md#shared-image-level-selection)). Vehicle pictures and their
generator follow this contract; this section is its only statement:

- **Camera.** Size `k` is the vehicle seen in true perspective from a camera `D_cam × 2^k` behind its base point
  (`D_cam` = 6 m) and 2.0 m above it, with a focal length of 240 px and no pitch or roll: its scale at the base point
  is `40 / 2^k` px/m, and one texel is one pixel of that camera. Every size is its own picture, drawn from its own
  camera, so the farther sizes show the vehicle closer to level; no size is made by reducing another.
- **Anchor.** A picture's anchor is the projection of its base point. The picture may extend below it: what it shows
  there is the body's near side, drawn on the ground before the base point.
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

Course images are saved with their pyramids, compiled from the master when written ([Completed sprite
images](#completed-sprite-images)): a level is a reduction of the master, not a picture of its own; the movable objects' shadows follow the size-0 camera.

A picture may be drawn flipped left to right about its anchor (`flip`), its shadow with it, as a late-1980s board's
sprite hardware flips one. A camera looking back along the road ([Architecture](architecture.md#a-camera-looking-back))
reads the road on a reversed ruler, and two separate properties follow. First, as that ruler's consequence and no
rule of a board's, every picture without its own image for each direction, standing or lying (a course image, a tire
puff, an explosion, a strip lying on the road), is read flipped and extending sideways the other way (`mirrored`); a
picture with an image for each direction, a vehicle's, is chosen by the direction rule above, and the front of a
vehicle is its own picture. Second, a standing board seen from behind shows its back at half brightness, its palettes
halved once by the one half-brightness operation of RGB555 (`halfBright`); a picture lying on the ground keeps its
brightness.

## Vehicle sprite sets

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
1–14 and `f` the brake lamp. A set has one to eight colors (`MOST_VEHICLE_COLORS`), each a palette named by its color
(`red`, `silver`, …) listing the colors of slots 1–14; the vehicle listing names the default, the first. A set declares `bankDegrees` exactly when it has more than one bank
image: the lean from vertical, in degrees in (0, 90], of the rider-and-machine centre-of-mass line that its outermost
bank images depict. Bank selection divides the vehicle's displayed lean by it.

Admission ([`vehicle-sprite-library.ts`](../src/vehicle/vehicle-sprite-library.ts)) checks each set once, by its own
rules: its format and version; 1 to 8 palettes of 14 colors and both lamp colors; every picture has every size; every
size has its shadow, whose anchor differs from the picture's by whole texels; and every grid cell names a picture, every
picture filling one. No rule spans two sets. Vehicle admission checks form-specific bank dimensions and default-color
references ([Vehicle physics](vehicle-physics.md#material-vehicle-and-driving-documents)).

Each set is delivered as authored, one file per set (manifest `vehicle-sprite-set`, its ID the set's name), and admitted
when it is read, in the build with diagnostics at the set document's own pointers and in the page as its file arrives.
The page reads every set at startup, before any vehicle is defined, so a vehicle always holds its pictures. The vehicle
domain owns the admitted sets at run time: for a vehicle's color and lamp state it makes the set's one 16-slot palette
once and draws every picture with it, and it selects yaw/bank pictures. The image domain supplies only the generic
sprite reader.

`911-turbo-3-3`, `golf-gti-16v` and `vfr750r` are generated sets ([Vehicle picture generator](#vehicle-picture-generator)),
and `testarossa`, `rx-7-turbo-ii-1987`, `porsche-959-1987`, `porsche-928-s4-1987`, `mclaren-m23-pp-spec`, `nsr500-1984` and
`xr600r-1985` from models
([Model solids](#model-solids)). The other
sets are provisional, one per vehicle, named by its id in lower case with `_` as `-` (`911-turbo-3-3`): drawn by
code, original, for an earlier camera, and converted mechanically until generated sets replace them. Their size `k` is the reduction at
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
{format, version, vehicle: "911_TURBO_3_3", yawVariants: 64, background: "white" | "alpha",
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
half of it is covered, and paint, glass or lamp when at least half of its covered part is. If an entire silhouette
falls below half coverage, its fullest covered texel remains opaque in its ordinary classified palette color;
ties choose the first texel in row order. This keeps a distant narrow vehicle visible without changing its camera
or anchor. The shadow is the solid's outline seen from above, on the road, drawn the same way.

The generator's fixed values are author values, neither derived from a model nor recipe fields: a mirror part covers
more than 40 cells (40 cm²) of a facing outline; the wheels are the solid within 0.37 m of the body's side and within 1.05
tyre radii of a hub; the underside faces the road with a normal
below −0.55 in height; a lamp shows when it fills at least 2 % of a texel (`LAMP_SHOWS`); and the light's sun
direction, gloss and sky values ([`vehicle-pictures.ts`](../tools/graphics/vehicle-pictures.ts)).

**Palette.** The 14 slots are, in order, `slots.body` body colors from the highlight to the darkest, `slots.neutral`
neutrals from dark to light, the dark and the light glass color, and `slots.accent` accents. A paint texel takes the
body slot whose `bodyKeys` brightness (`0.45 r + 0.35 g + 0.20 b` of its lit color) is nearest; a glass texel takes
the lightest neutral above a mean of `glass.glint`, the light glass color above 105 and the dark one below; a lamp texel takes
slot 15; any other texel takes the nearest color among the neutrals and accents of the first palette: a squared step
of brightness counts a quarter, and chromaticity in proportion to the texel's brightness (600 for a whole step at
white), so a shaded amber stays amber and a dark texel stays a dark neutral. Every palette of
the set names the same slots, so a color variant replaces the body colors and keeps the rest. By the contract's lamp
rule, sizes 1 to 4 turn each lamp's fullest texel into a lamp texel when no texel of that lamp reached half.

911 TURBO 3.3's saved set is the command's
output for its recipe: silver, black, red and white. Its surface gives the hood between the front
wings, the wings' round tops, the crowned roof and tapering tail, the rear shoulders and the tray of the rear wing;
its marks give the windows, the headlamps and the brake lamps (the outer red lamps and the reflector square beside
each). GOLF GTI 16V's saved set is the command's output for its recipe: red, white, black and silver. Its front and rear views are fitted to the side view's lamps and bumpers rather than to their roofs, which those views show from a little above; its marks give the rear window, the mirrors, the headlamps, foglamps and indicators, the tail lamps' amber and white sections, their lower red sections as brake lamps, and the number plates as paint; its surface is empty. Its red's two lightest steps are redder than the other sets', its middle neutral lighter, so that its silver wheels read as silver, and its red accent darker, so that a texel mixing paint with black trim stays dark in every color. VFR750R's saved set is a prototype accepted as it stands, rendered from a 3D model of the machine with its rider rather than by this generator: the model reduced to 200,000 triangles with its two wheels and its rider as separate parts, scaled uniformly so that its hubs stand at the mechanics document's axles, and drawn by each size's contract camera at 64 yaw by 7 bank images (`bankDegrees` 60), turned about the line where its tyres meet the road, under a sky above a darker road and a sun high, ahead and to the right, its wheels blurred over a turn. Its 14 colors are five greys (slots 1–5) and three paint ramps of three steps from light to dark (slots 6–8, 9–11 and 12–14), which take the model's red, white and navy paint, the rider's leathers and helmet included, lit as one flat paint; everything else takes the nearest grey, and the tail lamps' lenses the brake lamp. Its palettes replace the three ramps: tricolor is the real tricolour (red, white, navy), red is red with white and black, blue is blue with yellow and white, and black is black with orange and grey. The model, its classification and the bake lie outside the command and are not saved here. The reference photographs and screenshots used to judge a set are not saved here.

### Procedural provisional solids

Authored provisional shapes can use `tools/graphics/procedural-vehicle-solid.ts`: deterministic surface samples of
boxes, ellipsoids, capped cylinders and wheels, or individually authored points, in metres about the common base
point. Colors and outward normals belong to those surfaces. A surface can optionally be classified as paint,
glass or a brake lamp for the existing palette and lamp rules; the default is unclassified, preserving the
racing shapes. A wheel can specify its rim radius independently of its outside radius. `finish` banks the shape
about its longitudinal ground line and raises its lowest surface to the road.

The existing picture baker accepts either one solid or an array of banks ordered from negative to positive lean,
evenly spaced across the declared `bankDegrees`. It draws every yaw and all six sizes with the same camera, lighting,
palette quantization, anchors and shadow projection as a four-view solid. The saved sprite contract is unchanged;
procedural geometry is authoring input only and is never delivered or used by vehicle physics.

### Model solids

A set can be made from a GLB model, the third source beside four views and procedural shapes. A set made from a GLB
model keeps its recipe here and not its model (K, 2026-11-16): K holds the model, the recipe names it by its SHA-256,
and the command takes its place as an argument and refuses any other. The saved set is the authority for its
pictures; the build, the tests and CI never read a model. `npm run pictures -- <set> [replace] --model <file.glb>`
([Development](development.md#pictures-command)) takes this path when `<set>.json` is a model recipe.

The model ([`glb-model.ts`](../tools/graphics/glb-model.ts)) is read as glTF 2.0 binary: its default scene's triangle
primitives through their nodes' transforms, each material's base color texture (PNG) and factor, and for a recipe with a
glossy finish (below) its roughness (the metallic-roughness texture's green times `roughnessFactor`) and
occlusion (the occlusion texture's red, the share of its surroundings a point sees, brought towards 1 by its
`strength`); nothing else of it is used, with its vertex normals where it gives them. A material without such a
texture, and every material for any other recipe, has roughness 1 and occlusion 1. Its triangles are sampled evenly by
area at the recipe's spacing, the samples following the triangles' order, so the same model and recipe always make the
same solid; each sample takes its texture's base color, roughness and occlusion (the nearest texel) and its normal: the
vertex normals interpolated across its triangle, else its face's by its winding. The recipe's axes turn the model to the vehicle's right, up and forward;
it then stands with its front axle the mechanics document's `frontAxle` ahead of the base point and its lowest sample on
the road. Its front axle is its front wheels' mean node origin (`frontWheels`), or for a model without wheel nodes a
point the recipe gives in the model's coordinates (`frontHub`). Its wheels are drawn as they stand, unless a recipe
colored by paints spins them.

**Recipe.** `superoutride.vehicle-model-recipe` version 1, saved as `content/vehicle-picture-sources/<set>.json`. A
recipe colors its set by roles, or by paints when it gives `paints`; both give the model, its front axle and the
spacing. By roles:

```text
{format, version, vehicle: "MCLAREN_M23_PP_SPEC", yawVariants: 64,
 model: {sha256, right: "-x", up: "+y", forward: "+z", frontWheels: ["wheel_FL", "wheel_FR"]},
 spacing: 0.008, colors: [entry, ...], rest: entry, shade: entry, bright: 0.9, isolatedSizes: [0, 1],
 keep: {role, toSize, shows},
 roles: [{name, when: [clause, ...], albedo: {of: "color" | "luma", times}, gloss, color: entry, dark}, ...],
 luma: [0.30, 0.59, 0.11],
 light: {main: [x, y, z], fill: [x, y, z], ambient, sky, mainWeight, fillWeight, shininess},
 hollows: {cells, widths: [metres, ...], depth, most, weight},
 steps: {sizes: [0, 1], reach, depth, share},
 palettes: {name: {entry: [r, g, b], ...}, ...}}
clause = {term, above} | {term, below} | {largest: "r" | "g" | "b"}
term   = r | g | b | value | saturation | luma | g/r   (of the base color, each channel 0–1)
```

By paints (the model's `frontHub` in place of `frontWheels` either way), with a plain finish:

```text
{format, version, vehicle: "NSR500_1984", yawVariants: 64,
 model: {sha256, right: "-x", up: "+y", forward: "+z", frontHub: [x, y, z]},
 spacing: 0.008, banks?: {count: 7, degrees: 60},
 paints: {colors: [[r, g, b], ...], within, lamp: [r, g, b]},
 ramps: {paints: [4, 4], grey: 6, sampleYaws: 16},
 light: {main, fill, ambient, sky, mainWeight, fillWeight, shininess}, gloss,
 wheels: [{center: [x, y, z], radius, rim, width}, ...],
 liveries: {name: [[r, g, b] for each paint], ...}, brakeLamp: {off: [r, g, b], on: [r, g, b]}}
```

or with a glossy finish, which a recipe gives by `glass` in place of `gloss`:

```text
{..., paints, glass: {color: [r, g, b], within, rough},
 ramps: {paints: [7], glass: 3, grey: 4, sampleYaws: 16},
 light: {main, fill, ambient, sky, mainWeight, fillWeight, greyGain},
 reflection: {paint: Reflection, glass: Reflection},
 glare: [{power, strength, glass}, ...], wheels, liveries, brakeLamp}
Reflection = {f0, horizon: [r, g, b], zenith: [r, g, b], haze: [r, g, b], ground: [r, g, b], fall, power}
```

**Paints.** A set colored by paints sorts its samples into groups by their base colors: a sample within `within` of
the `k`th of `paints.colors` in every channel is that paint's, one within `within` of `lamp` the brake lamp's; with a
glossy finish, one within `glass.within` of `glass.color` whose roughness is below `glass.rough` the glass's; any other
grey's. It is drawn by the shared baker's cameras, sizes and shadows, each texel of 6 by 6 camera pixels, in every bank
image, without hollows or step lines; with a plain finish it is lit by the light of the roles below, with each sample's
base color as its albedo and `gloss` as its highlight's strength, and with a glossy finish as its paragraph below gives.
A texel takes the group most of its pixels show; its color is the mean lit color of that group's pixels alone, so no
color mixes two groups. Each group's steps are measured from its pictures: at size 0, of every `sampleYaws`th
direction and every bank image, the group's texels are split by brightness (`0.30 r + 0.59 g + 0.11 b`) into the
group's number of steps, `ramps.paints` for each paint, `ramps.glass` for the glass and `ramps.grey` for the greys, by
one-dimensional k-means from even quantiles; each step is the mean color of its texels. A texel takes the
step of its group whose brightness is nearest its own; a lamp texel slot 15, and up to size 4 a picture that shows no
lamp texel while one texel's pixels are at least 2 % lamp draws its fullest such texel as the lamp. No dither is drawn.
Slots 1 onward are each paint's steps, then the glass's and then the greys', each from dark to light (14 in all).

A livery gives a color for each paint; the glass, the greys and the lamp are every livery's. The first is the model's own paints
in their measured steps. Another livery keeps each measured step's relation to its paint: the step as `a` times the
paint plus `b` of white, fitted by least squares over the three channels, applied to the livery's color.

With `wheels`, each wheel is spun: the samples inside its rim, within half its width of its centre along the axle (the
vehicle's right axis), are taken out and given back as rings round the axle, a `spacing` apart in every direction,
each ring the mean color, mean roughness and mean normal of the samples it took, so spokes become a disc of concentric
greys; its occlusion is the mean of those of its samples that see more than 0.3 of their surroundings, which leaves out
the layers deep inside the wheel, or of all of them where none does. The tyre
outside the rim is round already and stays as it is. The forks, brakes and swinging arm outside the wheel's width are
not spun. With `banks`, the set has `count` bank images, an odd number, evenly over ±`degrees` from leaning left to
leaning right: the model turned about the line where it meets the road (the base point's longitudinal ground line),
rider and machine together, and its lowest sample put back on the road; without it, one.

**Glossy finish.** A glossy finish is a car's: its paint and glass mirror the sky and the road, and the
sun glares on them, by each sample's roughness, and its recesses are darkened by each sample's occlusion, both of which
the model holds. With `n_p` a sample's unit normal in the picture's axes (x right, y up, z towards the viewer), `n_w`
its unit normal in the turned vehicle's axes (y up), `v` the unit direction from it to its size's camera in those axes,
`main` and `fill` made unit, and the sample's gloss `g = (1 − roughness)²`:

```text
A = ambient + sky × (0.5 + 0.5 n_w.y)
D = mainWeight × max(0, n_p·main) + fillWeight × max(0, n_p·fill)
o = 1 on glass, else the sample's occlusion
L = clamp((A o + D √o) × k, 0, 1)                k = greyGain for the greys, else 1
c = clamp(n_w·v, 0, 1),  r.y = 2 c n_w.y − v.y   the reflected direction's height
E = horizon (1 − u) + zenith u,  u = r.y^power                         where r.y ≥ 0 (the sky)
E = haze (1 − d) + ground d,     d = clamp(−r.y / fall, 0, 1)          where r.y < 0 (the road)
F = (f0 + (1 − f0)(1 − c)^5) × g
s = max(0, n_p·h),  h the unit sum of main and (0, 0, 1)
S = Σ strength × m × s^power × g                 m = the term's glass on glass, else 1
color = clamp(base color × L × (1 − F) + E × F × o + 255 × S × o, 0, 255)
```

Glass takes `reflection.glass`, the paints and the greys `reflection.paint`. Direct light is darkened only by the
square root of the occlusion, so a recess between fins darkens while a wheel's face does not sink; the reflection and
glare are darkened by the occlusion itself. The brake lamp's samples are lit alike but drawn in slot 15.

**Roles.** A model recipe's set does not take the palette quantization of the sets above: its texels take colors by
role, the recipe's alone, and no other set's pictures change. Each sample takes the first role whose clauses its base
color passes (the last role passes every color). A texel takes the role most of its visible samples have, and its
brightness is the largest channel of those samples' mean lit color. It is drawn in its role's color, or in the shade color where its brightness is below the role's `dark` share of
the role's bright texels: the `bright` quantile of that role's texels over every direction at size 0. On the
`isolatedSizes` a texel none of whose eight neighbours shares its color takes the color most of them have. Up to size
`keep.toSize`, a picture that shows the kept role in no texel, while a texel's samples are at least `keep.shows` of it,
draws its fullest such texel in the role's color. No color between two is made and no dither is drawn. Slots 1 onward
take the recipe's `colors` in order and the remaining slots `rest`; the brake lamp, unused, is `shade`, off and on.

**Brightness.** A set colored by roles has its own brightness (K, 2026-11-16): a light fixed to the picture, not the
vehicle, over the model's smooth normals, darkened where a surface lies behind its surroundings in the picture's depth.
The shared baker's cameras, sizes and shadows are its own all the same; the other sets' light and quantization are not
used and do not change. With n a sample's unit normal in the picture's axes (x right, y up, z towards the viewer) and
`up` half its height in the vehicle's axes plus half, a sample's lit color in each channel is

```text
min(1, albedo × (ambient + sky·up + mainWeight·max(0, n·main) + fillWeight·max(0, n·fill)) × hollow
       + gloss × max(0, n·h)^shininess)
```

where h is the unit half-way direction of `main` and the view (0, 0, 1), and the albedo is the base color's channels
or its luma (up to 1) for all three, times the role's `times`. `hollow` comes from the picture's depths: each texel is
held as `cells` by `cells` cells, each the mean distance from the camera of its visible samples; for each of `widths`
(a Gaussian blur's sigma in metres at the base point, the same length at every size), a cell loses `weight ×
clamp((z − blurred z) / depth, 0, most)`, the blur counting the vehicle's cells alone (the blurred depths over the
blurred coverage). A surface deeper than its surroundings darkens; one nearer does not.

On its nearest sizes a texel lying just behind a nearer surface is shade too (K, 2026-11-16): where most of its role's
cells lie more than the recipe's step behind the nearest surface within the recipe's reach. On `steps.sizes`, a
covered cell more than `steps.depth` behind the nearest covered cell of the square `steps.reach` about it (metres at
the base point, half the square's side) is a step cell, and a texel whose role's samples lie in step cells for at least
`steps.share` of them is drawn in the shade color. The picture's outline gets no such line: cells outside the vehicle
count for nothing. The order is the roles, the shade shares, the step lines, the isolated texels, the kept role.

**The McLaren M23 PP SPEC.** Its pictures alone are in eight colors, each channel off or on (K, 2026-11-16): a white
body, a second color, a helmet, cyan for its windscreen and its machinery, and black; its four liveries are white with
blue, red, green and yellow, each helmet another car's second color (K, 2026-11-16):

| Palette        | Body  | Second color | Helmet | Windscreen and machinery | Shade and black |
| -------------- | ----- | ------------ | ------ | ------------------------ | --------------- |
| `white-blue`   | white | blue         | yellow | cyan                     | black           |
| `white-red`    | white | red          | blue   | cyan                     | black           |
| `white-green`  | white | green        | red    | cyan                     | black           |
| `white-yellow` | white | yellow       | green  | cyan                     | black           |

Its six roles, in order, read the model's paint: the second color (red the largest channel, saturation above 0.5,
value above 0.25, green below 0.45 of red), the body (saturation below 0.2, value above 0.88), the helmet (red above
0.7, green above 0.6, blue below 0.35), the windscreen (blue above 0.6, red below 0.5, green above 0.45), the
machinery (luma above 0.3) and black. The body's albedo is its luma times 1.05, the machinery's and black's their
luma, and the other roles' their color; their gloss is 0.35 for the body, the second color and the helmet, 0.5 for the
windscreen, 0.55 for the machinery and 0 for black. The light (K, 2026-11-16) has `main` (−0.40, 0.70, 0.59), `fill`
(0.60, 0.20, 0.50), weights 0.34, 0.18, 0.68 and 0.10 and shininess 36; the hollows are held at 6 cells a texel, with
widths 3.75 cm and 12.5 cm, depth 0.10 m, most 0.55 and weight 0.5. The step lines are on sizes 0 and 1, with reach
2.5 cm (6 cells at size 0, 3 at size 1), depth 0.12 m and share one half (K, 2026-11-16). The shade shares are the
stage's, 0.42, 0.30, 0.40 and 0.38 for the second color, the body, the helmet and the windscreen (K, 2026-11-16:
raising them blackened whole panels turned from the light and the rear wings, and the car seen from behind became a
black mass), and 0.30 for the machinery, which the stage set at 0.40, movable between 0.30 and 0.45: at 0.40 the
engine behind showed few cyan points. The helmet is kept to size 4 at 0.02. The model is K's
`mclaren_m23_1976_rev4.glb`, kept on K's branch `codex/m23-glb-source`, never on main.

**The NSR500 of 1984.** Its set, `nsr500-1984`, is colored by paints (K, 2026-11-18) and baked from K's second model
(K, 2026-11-18). K painted the model's paints flat and alike on both sides; the red (215, 5, 17) and the blue
(32, 46, 131) are its two paints, three steps each, and everything else is the greys' eight steps (K, 2026-11-18): the
white paint (235, 235, 233), now the rider's upper body as well, falls in the lightest greys, the aluminium in the
middle ones, and the tyres and the black knee sliders (17, 17, 17) in the darkest. The magenta at the tail's tip
(255, 0, 255) is the brake lamp, whose off and on colors are `vfr750r`'s; no palette shows the magenta. Each of
the four silencers'
ends, two above each other on either side, is painted a light ring round a black hole, which fall in the greys as they
are. It is lit by the light L2 (K, 2026-11-18): `main` (−0.25, 0.85, 0.46), `fill` (0.60, 0.20, 0.50), ambient 0.16,
sky 0.26, weights 0.95 and 0.10, shininess 36, gloss 0.6, so faces turned up are light, those turned aside middling
and those turned down dark. Both wheels are spun (K, 2026-11-18), as the model's `wheel_F` and `wheel_R` give them:
centres (0, 0.2967, 0.6901) and (0, 0.3317, −0.6901) m, 3.3 mm below their radii where the tyres are flattened on the
road, radii 0.300 and 0.335, rims 0.217 and 0.230, widths 0.13 and 0.18. It has 64 directions by 7 bank images over
±60°, as `vfr750r`, sampled every 8 mm; its steps are measured from 16 directions.

Its eight liveries are white with two colors (K, 2026-11-18): the white is every livery's, and each recolors the red's
place (A: the cowl, the tail, one of the helmet's and leathers' lines) and the blue's (B: the cowl's band, the
trousers, the V on the back). Every livery's A is its own, and so is its B, so that from behind as from far away the
liveries tell apart. The first is the model's own and the default. The others' base colors are the stage's (K,
2026-11-18), for K to set in DEV, and their steps keep the measured steps' relation to the paints:

| Palette        | Name         | A                       | B                   |
| -------------- | ------------ | ----------------------- | ------------------- |
| `red-blue`     | RED/BLUE     | red 215, 5, 17          | blue 32, 46, 131    |
| `yellow-black` | YELLOW/BLACK | yellow 245, 200, 10     | black 38, 38, 42    |
| `green-yellow` | GREEN/YELLOW | green 20, 140, 60       | yellow 245, 200, 10 |
| `black-red`    | BLACK/RED    | black 38, 38, 42        | red 215, 5, 17      |
| `sky-pink`     | SKY/PINK     | light blue 70, 170, 235 | pink 240, 120, 170  |
| `navy-orange`  | NAVY/ORANGE  | navy 22, 32, 90         | orange 240, 120, 15 |
| `lime-purple`  | LIME/PURPLE  | lime 150, 210, 40       | purple 120, 50, 170 |
| `white-green`  | WHITE/GREEN  | white 235, 235, 233     | green 20, 140, 60   |

The model is K's `honda-nsr500-1984.glb` (SHA-256 `38ad7181…`), kept on K's branch `codex/nsr500-1984-glb-source`,
never on main; it has no wheel nodes, and its front hub is its `wheel_F` centre.

**The XR600R of 1985.** Its set, `xr600r-1985`, is colored by paints and baked from K's model (K, 2026-11-18), rider
and machine as one, banking together. K painted its paints flat, the rider alike on both sides: the red (225, 10, 15)
is the machine's body, tank, fenders, frame and hand guards, the boots and lines on the sleeves and legs, three steps;
the blue (22, 36, 170) the seat, the gloves, the fork boots and lines on the sleeves, legs and helmet, two steps; the
yellow (245, 195, 0) the suit, the helmet, the side covers and the front number plate, three steps; and everything
else, the engine, the wheels, the silencer on the right, the boots' white lines and the helmet's white peak and black
band and the belt, is the greys' six steps (K, 2026-11-18). The magenta of the square block on the rear fender's top
(255, 0, 255), its rear face and top, is the brake lamp, whose off and on colors are `vfr750r`'s; no palette shows the
magenta. It is lit by the light L2, as `nsr500-1984`, with gloss 0.6. Both wheels are spun, as the model's `wheel_F`
and `wheel_R` give them: centres (0, 0.347, 0.7249) and (0, 0.326, −0.7249) m, radii 0.347 and 0.326 (its real
80/100-21 and 110/100-17 tires), rims 0.281 and 0.230, widths 0.080 and 0.110; the large hubs, the front disc and the
rear sprocket and drum inside the rims become grey rings. It has 64 directions by 7 bank images over ±60°, sampled
every 8 mm; its steps are measured from 16 directions.

Its eight liveries recolor the three paints (K, 2026-11-18), each giving a color for the red's place (the machine's
body and the boots), the blue's (the seat, the gloves and the fork boots) and the yellow's (the suit, the helmet and the
side covers); the greys and the lamp are every livery's. The yellow's place, the most seen from behind, is every
livery's own, and so is the red's; the blue's, small, may repeat. The first is the model's own and the default. The
others' base colors are the stage's, for K to set in DEV, and their steps keep the measured steps' relation to the
paints; a black place's lighter steps may look grey, and a white one's like the greys:

| Palette        | Name         | Red's place             | Blue's place        | Yellow's place          |
| -------------- | ------------ | ----------------------- | ------------------- | ----------------------- |
| `red-yellow`   | RED/YELLOW   | red 225, 10, 15         | blue 22, 36, 170    | yellow 245, 195, 0      |
| `blue-white`   | BLUE/WHITE   | blue 22, 36, 170        | red 225, 10, 15     | white 235, 235, 233     |
| `white-red`    | WHITE/RED    | white 235, 235, 233     | navy 22, 32, 90     | red 225, 10, 15         |
| `yellow-blue`  | YELLOW/BLUE  | yellow 245, 195, 0      | white 235, 235, 233 | blue 22, 36, 170        |
| `black-lime`   | BLACK/LIME   | black 38, 38, 42        | purple 120, 50, 170 | lime 150, 210, 40       |
| `sky-orange`   | SKY/ORANGE   | light blue 70, 170, 235 | navy 22, 32, 90     | orange 240, 120, 15     |
| `orange-black` | ORANGE/BLACK | orange 240, 120, 15     | white 235, 235, 233 | black 38, 38, 42        |
| `pink-sky`     | PINK/SKY     | pink 240, 120, 170      | navy 22, 32, 90     | light blue 70, 170, 235 |

Each name is the red's place and the yellow's. The model is K's `honda-xr600r-1985.glb` (SHA-256 `55eee015…`), kept
on K's branch `codex/xr600r-1985-glb-source`, never on main; it has no wheel nodes, and its front hub is its `wheel_F`
centre.

**The Testarossa of 1984.** Its set, `testarossa`, is colored by paints with a glossy finish and baked from K's model
(K, 2026-11-19): the first, 1984 European coupé, with one mirror on the left A pillar, centre-lock wheels and its TRX
tyres. K painted the model flat: the body's red (231, 10, 14) is its one paint, seven steps; the glass and the other
black parts share (14, 14, 16), the glass told by its roughness below 0.5, three steps; and everything else, the black
parts, the wheels, the lenses (the orange tail lenses in grey frames) and the badges, is the greys' four steps. The
magenta (255, 0, 255) is the brake lamp, whose off and on colors, (125, 12, 18) and (255, 70, 40), are its earlier
set's. The model holds its roughness, 0.10 on the body's paint and the glass and 0.90 on the other black parts (the
rest as the model came), and its occlusion. Its finish is the stage's (F110): `light` with `main` (−0.25, 0.85, 0.46),
`fill` (0.60, 0.20, 0.50), ambient 0.08, sky 0.14, weights 0.92 and 0.06 and the greys' gain 1.5; the glass mirrors a
blue sky and the paint and greys a paler one over a dark road:

| Reflection | f0   | Horizon       | Zenith        | Haze          | Ground     | Fall | Power |
| ---------- | ---- | ------------- | ------------- | ------------- | ---------- | ---- | ----- |
| glass      | 0.80 | 232, 240, 248 | 58, 120, 222  | 205, 214, 224 | 86, 88, 92 | 0.35 | 0.6   |
| paint      | 0.10 | 205, 218, 238 | 120, 160, 230 | 70, 66, 68    | 20, 18, 20 | 0.10 | 0.6   |

and two glare terms, the white band on shoulders and roof edges (power 30, strength 2.0, glass 1.0) and the sun's small
spot (power 220, strength 4.0, glass 1.5), so a side window may burn white. Its four wheels are spun, as the model's
`extras` give them: front centres (±0.759, 0.3155, 1.53) m, radius 0.3155, width 0.24; rear (±0.83, 0.3335, −1.02),
radius 0.3335, width 0.28 (its 240/45 VR 415 and 280/45 VR 415 tyres); the rims are 0.72 of the radii, 0.227 and 0.240.
It has 64 directions, sampled every 8 mm; its steps are measured from 16 directions.

Its eight liveries are Ferrari's colors of the period (K, 2026-11-19); the glass, the greys and the lamp are every
livery's. The first, the model's own and the default, is Rosso Corsa; the eight base colors are K's (2026-11-19),
`blu-sera`'s a color chart's (#254169):

| Palette       | Name                     | Ferrari's name           | Code      | Base color    |
| ------------- | ------------------------ | ------------------------ | --------- | ------------- |
| `rosso-corsa` | ROSSO CORSA              | Rosso Corsa              | FER 300/6 | 231, 10, 14   |
| `giallo`      | GIALLO                   | Giallo                   | FER 102   | 245, 198, 18  |
| `bianco`      | BIANCO                   | Bianco                   | FER 100   | 240, 240, 236 |
| `nero`        | NERO                     | Nero                     | FER 1240  | 22, 22, 24    |
| `argento`     | ARGENTO METALLIZZATO     | Argento Metallizzato     | FER 101/C | 186, 190, 196 |
| `blu-sera`    | BLU SERA METALLIZZATO    | Blu Sera Metallizzato    | FER 504/C | 37, 65, 105   |
| `azzurro`     | AZZURRO METALLIZZATO     | Azzurro Metallizzato     | FER 505/C | 92, 148, 206  |
| `verde-scuro` | VERDE SCURO METALLIZZATO | Verde Scuro Metallizzato | FER 603/C | 16, 60, 40    |

Each name is the color's full name (K, 2026-11-19). The model is K's `ferrari-testarossa-1984.glb`
(SHA-256 `c9ef7c06…`), kept on K's branch `codex/testarossa-1984-glb-source`, never on main; it has no wheel nodes,
and its front hub is (0, 0.3155, 1.53).

**The RX-7 Turbo II of 1987.** Its set, `rx-7-turbo-ii-1987`, is baked from K's model by the Testarossa's recipe
(K, 2026-11-19): the same steps (seven reds, three glass steps and four greys), light, reflections, glare, spacing, 64
directions and brake lamp colors, none moved for this car. What differs is the model's: the body's red (243, 7, 20) is
its one paint, within 8; the glass is (10, 10, 12), within 4 and of roughness below 0.5, while its other black parts
(trim, tyres, mirrors, underside) keep their own colors and are greys; the magenta (255, 0, 255) is the brake lamp, the
tail lamps' upper row, which K painted, the lower row (amber, white, red) as the model came. The model holds its
roughness, 0.10 on the red, the glass and the brake lamp and 0.90 on the other dark parts, and its occlusion, made as
the Testarossa model's. Its four wheels are spun as the model's `extras` give them: centres (±0.725, 0.316, 1.1964) m
front and (±0.72, 0.316, −1.1964) m rear, radius 0.316, width 0.205 (205/55 VR 16); the rims are 0.72 of the radius,
0.2275. The model was scaled along each axis to the car's length, width and height, so its wheelbase is 2,393 mm
against the car's 2,430 mm, which its driving uses (K allowed the difference, 2026-11-19).

Its eight liveries are Mazda's paints for the 1987 model year (K, 2026-11-20); the glass, the greys and the lamp are
every livery's. The first, the model's own and the default, is Sunrise Red; the eight base colors are K's
(2026-11-20). Whether all eight were offered on the Turbo II is not checked:

| Palette           | Name                    | Code | Base color    |
| ----------------- | ----------------------- | ---- | ------------- |
| `sunrise-red`     | SUNRISE RED             | RH   | 243, 7, 20    |
| `noble-white`     | NOBLE WHITE             | WY   | 238, 238, 232 |
| `brilliant-black` | BRILLIANT BLACK         | PZ   | 20, 20, 22    |
| `tornado-silver`  | TORNADO SILVER METALLIC | K8   | 150, 156, 162 |
| `arctic-silver`   | ARCTIC SILVER METALLIC  | J5   | 198, 202, 206 |
| `sapphire-blue`   | SAPPHIRE BLUE METALLIC  | 5A   | 28, 44, 96    |
| `royal-maroon`    | ROYAL MAROON METALLIC   | 3A   | 88, 20, 36    |
| `satin-gold`      | SATIN GOLD METALLIC     | 1A   | 176, 152, 104 |

The model is K's `mazda-rx7-turbo2-1987.glb` (SHA-256 `58939096…`), kept on K's branch
`codex/rx7-turbo2-1987-glb-source`, never on main; it has no wheel nodes, and its front hub is (0, 0.316, 1.1964).

**The Porsche 959 of 1987.** Its set, `porsche-959-1987`, is baked from K's model by the Testarossa's recipe (K,
2026-11-19): the same steps (seven paint steps, three glass steps and four greys), light, reflections, glare, spacing,
64 directions and brake lamp colors, none moved for this car. What differs is the model's: the body's red (231, 10, 14)
is its one paint, within 8, a key for the colors and not one of them; the glass, the windscreen, the two side windows
and the rear window, is (10, 10, 12), within 4 and of roughness below 0.5, while the low openings front and rear, which
K painted the same black at roughness 0.90, and the other dark parts are greys; the headlamps' lenses keep their own
color and are greys too; the magenta (255, 0, 255) is the brake lamp, the two ends of the rear band, which K painted,
the band's middle as the model came. The model holds its roughness, 0.10 on the red, the glass and the brake lamp and
0.90 on the other dark parts, and its occlusion, made as the Testarossa model's. Its four wheels are spun as the
model's `extras` give them, at the real car's tracks and tyres: centres (±0.752, 0.3216, 1.1503) m front, radius
0.3216, width 0.235 (235/45 VR 17), and (±0.775, 0.3179, −1.1503) m rear, radius 0.3179, width 0.255 (255/40 VR 17);
the rims are the 17-inch wheels' 0.2159. These are the pictures' wheels; its driving keeps the
[ledger's](chase-turbo-vehicles.md#numerical-conventions-and-remaining-uncertainty) radii, 0.315 and 0.311 m. The
model was fitted along each axis to the car's length, width and height, so its wheelbase is 2,301 mm against the car's
2,272 mm, which its driving uses (K accepted the difference, 2026-11-20).

Its four colors are Porsche's of 1987 (K, 2026-11-20), named in English; the default is GRAND PRIX WHITE. The recipe's
first color is the model's own, measured rather than recolored, so GUARDS RED, the one red, comes first and is the
model's red; the others are recolored from it. Their base colors are provisional (the stage auditor's, not measured
from paint samples), and the two metallics are solid colors, without flake:

| Palette             | Name              | Porsche's name  | Code | Base color    |
| ------------------- | ----------------- | --------------- | ---- | ------------- |
| `guards-red`        | GUARDS RED        | Indischrot      | 027  | 231, 10, 14   |
| `grand-prix-white`  | GRAND PRIX WHITE  | Grandprixweiß   | 908  | 240, 240, 234 |
| `silver-metallic`   | SILVER METALLIC   | Silbermetallic  | 980  | 186, 190, 196 |
| `graphite-metallic` | GRAPHITE METALLIC | Graphitmetallic | 691  | 70, 73, 79    |

The model is K's `porsche-959-1987.glb` (SHA-256 `e426f91d…`), kept on K's branch `codex/porsche-959-1987-glb-source`,
never on main; it has no wheel nodes, and its front hub is (0, 0.3216, 1.1503).

**The 928 S4 of 1987.** Its set, `porsche-928-s4-1987`, is baked from K's model by the RX-7's recipe (K, 2026-11-20):
the same steps (seven paint steps, three glass steps and four greys), light, reflections, glare, spacing, 64 directions
and brake lamp colors, none moved for this car. What differs is the model's: the body's red (231, 10, 14) is its one
paint, within 8; the glass is (10, 10, 12), within 4 and of roughness below 0.5, six panes (the windscreen, the doors'
and the rear quarters' and the rear window); the magenta (255, 0, 255) is the brake lamp, the tail lamps' lower row,
which K painted, the upper row (amber and white) as the model came. The front's low intake, which K painted black
(17, 17, 17), the rear spoiler, the mirrors' backs and the underside keep their own dark colors and are greys. The flat
panel between the tail lamps is the body's color and shines bright from behind; K keeps it (2026-11-20). The model holds
its roughness, 0.10 on the red, the glass and the brake lamp and 0.90 on the other dark parts, and its occlusion, made
as the Testarossa and RX-7 models' are. Its four wheels are spun as the model's `extras` give them: centres
(±0.7745, 0.3157, 1.25) m front and (±0.773, 0.3135, −1.25) m rear, radii 0.3157 and 0.3135, widths 0.225 and 0.245
(225/50 VR 16 and 245/45 VR 16); the rims are 0.2207 (the stage auditor's). The model is 4,521 × 1,836 × 1,282 mm
(1,964 mm across the mirrors) on the car's 2,500 mm wheelbase, the full width at the front and rear fenders and the
tracks and tires the car's. The wheels drawn are the tires' nominal size, not the 0.305 and 0.306 m its driving uses.
Its one exhaust outlet, at the left rear, is the model's; the car has two.

Its eight liveries are Porsche's colors (K: eight for now, 2026-11-20; the colors, keys and base colors are the stage
auditor's, provisional); the three metallics are flat colors without flake, and whether all eight were offered on the
1987 US car is not checked:

| Palette                  | Name                   | Code | Base color    |
| ------------------------ | ---------------------- | ---- | ------------- |
| `guards-red`             | GUARDS RED             | 80K  | 231, 10, 14   |
| `black`                  | BLACK                  | 700  | 18, 18, 20    |
| `grand-prix-white`       | GRAND PRIX WHITE       | 908  | 238, 238, 232 |
| `silver-metallic`        | SILVER METALLIC        | 980  | 190, 194, 198 |
| `dark-blue`              | DARK BLUE              | 347  | 22, 30, 70    |
| `summer-yellow`          | SUMMER YELLOW          | 10W  | 240, 205, 40  |
| `venetian-blue-metallic` | VENETIAN BLUE METALLIC | 35U  | 40, 70, 120   |
| `cassis-red-metallic`    | CASSIS RED METALLIC    | 80D  | 110, 24, 44   |

The listing's default is `black` (K, 2026-11-20). The model is K's `porsche-928-s4-1987.glb` (SHA-256 `c43ba501…`),
kept on K's branch `codex/928-s4-1987-glb-source`, never on main; it has no wheel nodes, and its front hub is
(0, 0.3157, 1.25).

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
its nearest color. This choice is the HUD pictures' own: the sprite sources' [color rule](#candidate-palettes) is not
used here.

## HUD design sources

The fonts' and HUD parts' drawn pixels are saved as given under `content/hud-design-sources/`. They are
production-only data, which the build does not deliver; the [HUD tiles command](development.md#hud-tiles-command)
admits them and writes them into the [text tiles](#text-tiles) in place. Each JSON source names its characters or
parts and holds 64 palette slots per 8×8 tile, row by row; a character list must name the text tiles' characters in
their order, and a slot outside a source's slots does not admit. A source palette holds 16 RGB555 colors, as the text tiles save them. The
PNG files beside them are previews, which nothing reads.

| Source                      | Content                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `font-normal-patterns.json` | The normal font: `ascii`, U+0020–U+007E, and `extra`, the marks with their `codePoint`; slots 1–2                                                                                          |
| `font-ornate-patterns.json` | The ornate fonts, every character: `small` (slots 1–8), `large` with `top` and `bottom` (slots 1–9) and the SUNSET `palettes`                                                              |
| `seg-digits.json`           | The italic segment digits 0–9, OFF and the letters L, H and G (each segment lit as in 8 or unlit as in OFF), each 2×3 tiles row by row (slots 1–4), and the VFD, YELLOW and RED `palettes` |
| `lamp.json`                 | The signal lamp, 2×2 tiles row by row (slots 1–15), and its OFF, RED_ON and GREEN_ON `palettes`                                                                                            |
| `arrow.json`                | The road arrow, 4×4 tiles row by row `left` and `right` (slots 1–10), and its `palette`                                                                                                    |

## Screen pictures

Screen pictures are the [tile pictures](#tile-pictures) the front end draws: the title logo, the picture of the
controls and the series images.
They are saved under `content/screen-pictures/<name>.json`, each named by its file, and delivered as authored (manifest
kind `screen-picture`); delivery admits them once (`compileScreenPictures`). `title-logo` is required and is 36×14 tiles
(288×112 pixels) and may be transparent; a series image is 40×30 tiles (the 320×240 frame) and opaque, checked where
its [series document](content-and-gameplay.md#series-documents) names it and where the
[front end selection](content-and-gameplay.md#front-end-selection-document) names a series' picture by its ID.

`controls`, K's picture of the touch and keyboard controls, is the one [LOADING](browser.md#screens) stands on. It is
required, as the title logo is, and is 40×30 tiles (the 320×240 frame), its transparent pixels showing black; its
bottom tile row is left free for LOADING's percentage. LOADING reads it first, with the text tiles, before the rest of
the startup's files.

A series image is named by its series' ID, and an ARCADE TRIBUTE series' ID is `arcade-tribute-` and its original's ID,
as `arcade-tribute-pole-position-ii` (K, 2026-11-09). The main picture, which TITLE and FREE PLAY's rows stand on,
will be 40×30 tiles too and may be transparent: its source's alpha marks the clear parts through which the attract
demo shows (K, 2026-11-09); until it is made, the title logo placed in a picture of that size at tile column 2, row 2,
clear elsewhere, stands for it. Like a series image, it is FREE PLAY's card on the scaled plane, over the demo alone
on SELECT SERIES (K, 2026-11-19).

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
alpha. A pixel whose alpha is below 128 is index 0. Each tile then keeps the 15 RGB555 colors its opaque pixels use
most (of colors used alike, the first in the tile's raster order), and each other opaque pixel takes the nearest kept
color in linear light, the mean of the channels' differences (of kept colors alike near, the most used): no color is
mixed or made, and there is no dithering. A tile's palette holds the colors its pixels take in value order, so identical tiles
share their pattern and palette, which are saved once.

| Picture                             | Source            | Recipe           |
| ----------------------------------- | ----------------- | ---------------- |
| `title-logo`                        | the logo, cut out | 36×14, `contain` |
| `tsukuba-clubman`                   | 4:3               | 40×30, `fill`    |
| `arcade-tribute-enduro-racer`       | 4:3               | 40×30, `fill`    |
| `arcade-tribute-super-hang-on`      | 4:3               | 40×30, `fill`    |
| `arcade-tribute-outrun`             | 4:3               | 40×30, `fill`    |
| `arcade-tribute-turbo-outrun`       | 4:3               | 40×30, `fill`    |
| `arcade-tribute-pole-position-ii`   | 4:3               | 40×30, `fill`    |
| `arcade-tribute-final-lap-2`        | 4:3               | 40×30, `fill`    |
| `arcade-tribute-top-speed`          | 4:3               | 40×30, `fill`    |
| `arcade-tribute-continental-circus` | 4:3               | 40×30, `fill`    |
| `arcade-tribute-chase-hq`           | 4:3               | 40×30, `fill`    |
| `arcade-tribute-big-run`            | 4:3               | 40×30, `fill`    |
| `arcade-tribute-cisco-heat`         | 4:3               | 40×30, `fill`    |
| `controls`                          | 4:3               | 40×30, `fill`    |
