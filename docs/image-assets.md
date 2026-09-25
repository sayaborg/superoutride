# Image assets and compilation

This document owns saved image formats and compilation. [Architecture](architecture.md) owns projection,
logical sprite extent and anchors; [Content and gameplay](content-and-gameplay.md) owns course fields/references.

## Completed sprite images

Indexed sprites and BG tiles pack two 4-bit indices per byte, high nibble first. Index zero is
transparent; indices 1 through 15 are opaque. Palettes have exactly 16 RGB555 entries, with slot zero
unused. RGB555 zero in an opaque slot is black. Source JSON stores row-major index arrays.
Tile palettes begin at `paletteId << 4`; the format has no separate palette-count limit.

```text
{
  format: "superoutride.sprite-lod", version: 3, name,
  width: W, height: H, anchorX, anchorY,
  defaultPalette: "original",
  palettes: {original: {colors: [16 RGB555 integers], brakeLamp: {slot: 5, on: 32038}},
             alternate: {colors: [16 RGB555 integers], brakeLamp: {slot: 5, on: 32038}}},
  levels: [{paletteRgb555: [16 integers], indices: [row-major indices],
            mixtures: [[], [[baseIndex,weight], ...], ...]}, ...]
}
```

Master width at 40 texels/m defines physical width. Each level has at most 15 opaque colors.
Level zero preserves semantic palette slots and identity mixtures for slots 1 through 15.
A coarse slot is a positive-weight mixture of original opaque slots summing to one; unused slots
have empty mixtures. Its normal color is the mixture evaluated in the original palette.
Equal colors can occupy distinct semantic master slots.

`palettes` is a dictionary of unique nonempty trimmed names. `defaultPalette` names its default
color; the level-zero palette equals that color's 16 slots. Each color has `brakeLamp:null` or
`{slot,on}`: slot is 1 through 15 and on is RGB555. The off color belongs to the palette itself.
Lamp illumination replaces only that slot; it is an animation of a color, not another color choice.
All color × lamp-state combinations participate in LOD compilation. Evaluating the shared mixtures
in a selected combination generates its level palettes once before drawing; patterns remain shared.
Raw course instance palettes remain supported until the course-palette migration.
[Architecture](architecture.md#sprite-lod-metric-and-read-contract) owns level dimensions and anchors.

Invalid dimensions, anchors, indices, palettes, mixtures, undeclared replacements or unknown fields
fail. Coarse colors must agree with their mixtures. Readers own packed buffers and immutable metadata.
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

Source normalization, candidate palettes, LOD compilation and diagnostic fixtures are authoring code
under `tools/graphics`. `src/image` owns the shared image readers, saved formats, filters and codecs.
The browser tools and Node file compilers consume those same TypeScript implementations.

The compiler integrates exact master index counts in each clipped octave box. Fifteen or fewer
mixtures pass through directly. Larger sets use deterministic divisive clustering: squared linear-color
distance is the maximum across all declared color/lamp combinations; the greatest area-weighted-error group
splits around its farthest representatives. Representatives are area-weighted mixture centroids;
stable input order resolves ties. Color or lamp edits invalidate the generated pyramid.

`content/sprites/vehicles.json` is a normalized-master dictionary with yaw/bank bindings.
Its generated library uses the same `dist/content/images/<sha256>.json` location as course images.
The content manifest maps the logical image name `vehicles` to its path and exact-byte SHA-256;
course images are indexed by their digest. All consumers resolve these entries through the manifest
and verify bytes before decoding. Format and version are written only inside each image file,
never in course asset references or manifest entries.
Strips have no ground image inputs.

## Infinite tiled background

The image is an 80 by 40 tile map of 16 by 16 patterns, giving 1280 by 640 pixels:

```text
{
  format: "superoutride.tile-background", version: 1, name,
  patterns: [{indices}], palettes,
  tiles: [[patternId,paletteId], ...]
}
```

Tiles are row-major and bind a pattern and 16-entry palette. Index-zero transparency follows the
sprite convention. The map is a single infinite plane with fixed angular scale and no LOD.
Horizontal wrap covers 360 degrees at `1280/(2*pi)` pixels/radian. The source horizon and Section-frame
yaw origin are authored; yaw and pitch scroll the map. Vertical sine mapping uses the camera horizon
and compresses detail near zenith/nadir. Frame changes transform yaw origin with camera yaw.

## External source normalization

Decoded inputs are straight-alpha 8-bit sRGB pixels and this saved recipe:

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

## Sprite Tool session

The Sprite Tool uses the same normalization, palette, LOD and drawing functions as file compilation.
Its saved session contains original pixels, a binary hidden mask and the normalization recipe:

```text
{
  format: "superoutride.sprite-session", version: 2,
  source: {width,height,rgbaBase64}, hiddenBase64, recipe
}
```

`rgbaBase64` contains row-major R,G,B,A bytes; `hiddenBase64` has one byte, zero or one, per source
pixel. Both use canonical padded base64. Hide sets alpha to zero; restore recovers original alpha.
Undo/redo holds at most 32 mask operations and 8 MiB of saved mask bytes. New edits discard redo;
no-op edits consume no history. Save contains inputs rather than undo history.

Source/recipe edits make compiled products stale and disable export until a successful build.
Failed or superseded imports preserve the current session. Source/master/LOD export uses explicit actions.
Editor limits are 1048576 source pixels, 4096 per axis, 32 MiB PNG and 16 MiB session JSON.
Files are decoded locally. Preview uses the product metric and blitter.

### Candidate palettes

Palette generation uses alpha-weighted median cut in encoded RGB555 over visible cropped samples.
Up to the requested 1 through 15 colors preserve exact codes. Otherwise choose the box by greatest
channel range, then alpha weight, then lowest code. Channel ties use R/G/B order; sorting uses channel
then code. Split at the first cumulative half-weight with both sides nonempty.

Output colors are alpha-weighted RGB555-channel means rounded nearest with upward ties, deduplicated
and sorted. Fully transparent input yields 16 zeros; unused opaque slots repeat the first candidate.
Coincident means can reduce distinct colors. The generated palette is a saved editable value;
mask/crop edits leave it in place until explicit regeneration.

## Course image sources

Each declared digest receives explicit `{sha256,bytes:Uint8Array}` input. Exact bytes must match the
lowercase SHA-256 and valid UTF-8 JSON for the corresponding sprite/BG format. Aliased descriptors
share one immutable source; Section membership resolves to canonical descriptors.

Course image admission uses the single [document resource table](content-and-gameplay.md#numeric-and-resource-domains)
for descriptor count, per-image bytes/texels and aggregate unique-source bytes/texels. Missing, duplicate, undeclared,
corrupt or malformed inputs fail. Asset diagnostics contain `kind:"asset"`, code, digest, referring
asset indices and supplied input index where applicable; independent failures follow declaration order.
Failure publishes no graph. Decoded consumer workspaces cannot mutate the saved source.

## Saved course appearance

Background bindings use tile maps and sprites uses sprite levels. Ground contains direct RGB555
colors or transparency and saved Strip constructs, not image references. The course compiler expands
the constructs and builds private numeric fields; these are not image assets or serialized payloads.
[Content and gameplay](content-and-gameplay.md#sprites-and-environment) owns the saved fields;
[Architecture](architecture.md#strip-rendering) owns ground sampling and its common color law.

## Vehicle sprite library

`content/sprites/vehicles.json` uses `superoutride.vehicle-sprites` version 2:

```text
{format, version, sprites: [SpriteLodDocument, ...],
 sets: {coupe: {yawVariants, bankVariants, assets: [[spriteIndex, ...], ...]}, ...}}
```

Set names are unique nonempty trimmed keys, independent of vehicle form. Each set binds a complete
positive yaw × bank grid to library images. Delivered images have complete LOD pyramids. Every image
in a set declares exactly the same set of at least two color names, and every color declares a
brake-lamp animation. Vehicle admission checks form-specific bank dimensions and default-color
references, as specified in [Vehicle physics](vehicle-physics.md#vehicle-and-driving-documents).

The provisional coupe has its original palette and an alternate body color. Slot 5 retains tail-off
12321 and lamp-on 32038. The motorcycle uses previously unused slot 6 for tail pixels; its off color
matches those pixels' former body color, and on is 32038. The second color changes body paint.
Provisional yaw images remain reused; production directional art is deferred to stage 11 onward.
