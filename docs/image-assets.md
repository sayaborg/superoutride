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
  format: "superoutride.sprite-lod", version: 2, name,
  width: W, height: H, anchorX, anchorY,
  variants: [alternatePalette16, ...],
  levels: [{paletteRgb555: [16 integers], indices: [row-major indices],
            mixtures: [[], [[baseIndex,weight], ...], ...]}, ...]
}
```

Master width at 40 texels/m defines physical width. Each level has at most 15 opaque colors.
Level zero preserves semantic palette slots and identity mixtures for slots 1 through 15.
A coarse slot is a positive-weight mixture of original opaque slots summing to one; unused slots
have empty mixtures. Its normal color is the mixture evaluated in the original palette.
Equal colors can occupy distinct semantic master slots.

Every entry in `variants` is a declared 16-slot replacement base palette. Evaluating the same mixtures in that
palette generates replacement level palettes; index patterns are shared. Instance palettes are immutable
choices, including normal/braking lamps. [Architecture](architecture.md#sprite-lod-metric-and-read-contract)
owns level dimensions, selection and anchor mapping.

Invalid dimensions, anchors, indices, palettes, mixtures, undeclared replacements or unknown fields
fail. Coarse colors must agree with their mixtures. Readers own packed buffers and immutable metadata.
One normalized master level is valid input; shipped sprites have full build-generated LOD.
Source masters and variant declarations are saved; completed pyramids are generated products.

## Common prefilter rules

Sprite normalization and LOD integrate direct-master boxes. RGB555 decodes through a 32-entry channel
table into linear-sRGB for averaging, then encodes to sRGB before RGB555 rounding. Opaque coverage is
area-weighted; coverage at least 0.5, including equality, is opaque. Color normalizes by opaque area;
hidden RGB and background contribute no color. Every level filters its master directly.

Footprint `rho` is source units covered per destination pixel, with octave exponent `log2(rho)`.
Sprites use master texels and nearest-exponent selection. Bands share the linear-sRGB codecs and
coverage threshold; [Architecture](architecture.md#band-rendering) owns their source-domain preblend
and lateral kernels. The legacy resident-ground recipe retains its separate encoded-sRGB integration
and chainage-level rule under [Resident ground](#resident-ground).

## Sprite LOD compilation

The compiler integrates exact master index counts in each clipped octave box. Fifteen or fewer
mixtures pass through directly. Larger sets use deterministic divisive clustering: squared linear-color
distance is the maximum across all declared base palettes; the greatest area-weighted-error group
splits around its farthest representatives. Representatives are area-weighted mixture centroids;
stable input order resolves ties. Variant edits invalidate the generated pyramid.

`content/sprites/vehicles.json` is a normalized-master dictionary with yaw/bank bindings.
Its generated library is under `dist/content/sprites/`; manifest-listed images are digest checked.
Legacy ground swatches supply normalized masters to the resident compiler; Bands have no ground image inputs.

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

Limits are 256 supplied digests, 8 MiB per saved input, 64 MiB total encoded inputs, 1048576 master
texels per image and 8388608 total level texels across unique sources. Missing, duplicate, undeclared,
corrupt or malformed inputs fail. Asset diagnostics contain `kind:"asset"`, code, digest, referring
asset indices and supplied input index where applicable; independent failures follow declaration order.
Failure publishes no graph. Decoded consumer workspaces cannot mutate the saved source.

## Saved course presentation

Background bindings use tile maps and scenery uses sprite levels. Band ground contains direct
colors and authoring constructs, not image references. [Content and gameplay](content-and-gameplay.md#saved-presentation)
owns exact fields. The following ground bindings, phases and stamps belong only to the legacy
resident schema, whose swatches use normalized sprite masters.

The resident source strip is `[-left,right)`. Its opaque `baseRgb555` is covered by the active Region's
paint profile. Null paint or transparent texels reveal the base. At 40 texels/m, source image indices
are positive-modulo `floor(40*(l-phaseL))` and `floor(40*(s-phaseS))`; source rows run toward increasing s.
Phases are saved metre origins.

Static B substitutes one saved 16-slot palette while preserving A's index pattern. B applies when
`floor((s-phaseS)/spanS)+floor((l-phaseL)/spanL)` is odd. Positive finite stripe spans maintain safe
integer cell identities. Duplicate mapped colors preserve their semantic slots.

Stamps resolve anchors to `(s,l)`, subtract `(spriteAnchor+0.5)/40` for top-left coordinates and
round each to `floor(40*coordinate+0.5)` source cells. Unrotated masters clip to the strip; later opaque
stamp texels overwrite earlier colors. Outside the strip, environment GroundBase supplies independent
left/right color-or-transparent fills. Background horizons and yaw origins belong to environment profiles.

## Resident ground

This encoding remains only for the four legacy course selections during Stage 4a. Band courses use
no resident payload, tile dictionary, ground swatch or GroundBase.

For a resident course, build produces a complete RGB555 payload and manifest for all reachable Sections. Driving and headless
previews use synchronous resident readers; all bytes are ready before ticks. The manifest binds course/build
identity, Section order/domains, grids, dictionary/coarse layouts, lengths and digests.
[Course loading](content-and-gameplay.md#course-loading) owns activation and failure handling.

A source tile is 64 by 64 cells at 40 texels/m, covering 1.6 by 1.6 m. Chainage origin is zero;
lateral grid origin is `floor(-left*40/64)*64` source cells. Final cells clip to the finite source extent.
Completed near levels are L0 64 by 16, L1 32 by 4 and L2 16 by 1 RGB555 colors per tile.
From L3 onward, Section-wide images halve lateral density and quarter chainage density per level.
All Sections share kMax: the first level, at least 3, fitting every Section into one coarse texel per axis.

A dictionary record contains all 1168 near-level colors; exact equality of the complete record defines
sharing. Payload order is little-endian Uint16 dictionary colors, then each Section's row-major
Uint32 directory and row-major Uint16 coarse images in level order. Sections follow compiled declaration order.
Completed ground colors are direct RGB555; their count is independent of source palette size.

Recipe `superoutride.resident-rgb555` v1 composes source cells at 40 by 40 texels/m. Clipped cell centers
select Region/paint/phase and stamps. Every output level averages the original composed cells by area
in decoded 8-bit encoded-sRGB, then rounds through the framebuffer/RGB555 codecs. Coarse filters cross
tile/material boundaries and clip to the finite Section domain, including its authored guards.

Runtime selects L0, advancing while `deltaSEffective >= 0.2*4^k`, clamped to available levels;
equality coarsens. A collapsed row contributes its complete effective footprint. Lookup is nearest
completed texel. The painted strip is opaque; transparency outside it comes from GroundBase.
