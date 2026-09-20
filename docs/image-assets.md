# Image assets and compilation

This document owns implemented image formats/compilers and the separately scoped Course Editor image
target. [Architecture](architecture.md) owns projection, logical metric extent, anchors and LOD lattices;
[development](development.md)
owns commands and evidence. Moving these contracts here changes neither current assets nor runtime behavior.

## Completed sprite images

The [metric/read contract](architecture.md#sprite-lod-metric-and-read-contract) defines the top-left,
untrimmed octave lattice and geometric-mean selection. The accepted completed-image record is:

```text
{ format: "superoutride.sprite-lod", version: 1, name,
  width: W, height: H, anchorX, anchorY,
  levels: [{ paletteRgb555: [opaque RGB555 integers], indices: [row-major indices] }, ...] }
```

Normalize the master to `SPRITE_SOURCE_TEXELS_PER_METER` (40); derive physical width from W once.
Each level has at most 15 distinct opaque RGB555 integers in 0..32767. Index 0 is transparent and
1..15 addresses that level's opaque palette. RGB555 value zero is opaque black. Index-array length
exactly covers the derived storage lattice. The reader owns decoded buffers, freezes metadata and
publishes pixels as read-only. Unknown fields, nonfinite anchors, invalid dimensions, missing/extra
levels and out-of-range indices fail before rendering. V1 retains transparent canvas margins and has
no crop, per-level dimensions/anchor, rotation or scale fields.

The format represents per-level palettes. Its current compiler recipe retains one authored palette;
production palette sharing/reduction remains a separate art decision. This interchange does not define
cross-asset project migration or packed production encoding. [LOD tests](../tests/rendering/sprite-lod.test.mjs)
and the [shared-blitter preview](../tools/graphics/sprite-lod.html) consume this exact format.

## Offline sprite LOD authoring recipe

The [compiler](../src/graphics/sprite-lod-compiler.ts) accepts one normalized indexed master and emits
a full octave series in the same schema. Shared `spriteLodLayout` owns dimensions for compilation,
reading and fixtures. Master pixels, logical extent and anchor remain unchanged.

Each saved recipe explicitly provides `colorSpace` (`encoded-srgb` or `linear-srgb`) and
`coverageThreshold` in (0,1]. Each level integrates axis-aligned boxes directly from the master,
clipping partial edge cells to the logical frame. Transparent texels contribute coverage area;
color averages include opaque samples. Threshold equality is opaque; zero coverage is transparent.
Thresholding alone does not preserve silhouette area or guarantee survival of thin parts.

The [area filter](../src/graphics/sprite-area-filter.ts) owns coverage, color averaging and palette
selection for normalization and LOD. Encoded mode averages shared RGB555-decoder 8-bit sRGB values;
linear mode applies the [sRGB transfer function](https://www.w3.org/TR/css-color-4/#color-conversion-code)
before averaging. Both select the nearest authored color by squared RGB distance in the selected
space; an exact tie selects the lower RGB555 integer. Every level retains palette values/order.
The recipe creates no new colors or dither, filters directly from the master, and runs before play.

[Compiler tests](../tests/rendering/sprite-lod-compiler.test.mjs) cover independent color-space results,
direct-master filtering, alpha/partial edges, tie ordering, determinism and file preservation.
Build-generated checker/coverage samples support comparison; real-art filter/coverage acceptance and
final variant palette policy remain open.

## External sprite source normalization

The [source compiler](../src/graphics/sprite-source-compiler.ts) accepts decoded straight-alpha,
8-bit sRGB pixels plus an explicit versioned recipe. Prepare sRGB externally; embedded ICC/gamma
metadata is not a conversion command. The PNG adapter uses shared framebuffer packing. JPEG/WebP,
animation and perspective correction remain outside this file workflow. The pinned decoder is an
offline/tool dependency, separate from the driving runtime.

```text
{ format: "superoutride.sprite-source", version: 1, name,
  crop: { x, y, width, height }, widthMeters,
  anchor: { x, y }, paletteRgb555, filter: { colorSpace, coverageThreshold } }
```

Crop is an integer source-pixel rectangle inside the decoded image. `widthMeters` calibrates the
whole crop, including transparent margin. Master width is `round(widthMeters*40)` with positive ties
upward, at least one; actual canvas width is that integer divided by 40. One scale, master width over
crop width, applies to both axes. Master height is the ceiling of scaled crop height. A fractional
last row adds transparent area, preserving uniform scale. This L0 padding differs from later LOD
storage beyond the logical frame. Opaque bounds do not redefine the frame or physical vehicle.

Source anchors use original-image texel-center coordinates, including crop offset. Each axis maps as
`(sourceAnchor+0.5-cropOrigin)*scale-0.5`. Fractional and outside-frame anchors are valid. Integer overlap
units express rational footprints without epsilon padding. Box integration also defines enlargement:
source cells have constant color/coverage. Straight alpha weights opaque color before binary coverage
thresholding; zero-alpha RGB contributes no background color.

The author supplies at most 15 distinct RGB555 colors. An empty palette is valid only for a fully
transparent resulting master. Palette generation is an explicit preceding action, not inferred during
normalization. Output is one normalized level, ready for review/editing and the LOD compiler. Source
and LOD recipes are separate saved inputs, including independent coverage thresholds.

Unknown/missing fields, malformed palettes and invalid crop, anchor or metric values fail before
output. Source admission is 16,777,216 decoded pixels and 1,048,576 master texels. PNG admission is
32 MiB encoded input and 8-bit channels. These are tool limits, not runtime-format/device budgets.
[Regressions](../tests/rendering/sprite-source-compiler.test.mjs) cover dimensions, footprints, alpha,
anchors, padding, color space, preservation and PNG -> master -> LOD -> product reader.

## Sprite Tool authoring session

The [Sprite Tool](../tools/graphics/sprite-tool.html) is a declared pre-game compiler entry. Graphics
owns normalization, palette generation, LOD and drawing. Tool-local code owns files, session state
and DOM interaction. Browser and Node share the [PNG adapter](../tools/graphics/sprite-png.mjs) and
pinned decoder, validating signature, dimensions, depth, chunk extents, animation rejection and CRC.
The browser wraps the bundled codec as ESM and includes its license inside the selected commit build.
It performs no canvas decode, profile conversion, CDN loading or image upload. The example PNG uses
the same decode path as imported images.

The [candidate palette generator](../src/graphics/sprite-palette.ts) is alpha-weighted median cut in
encoded RGB555, independent of filter color space. Only visible samples inside the integer crop count.
Quantize channels through the common codec and accumulate integer alpha weights. If the histogram fits
1..15 requested colors, retain exact codes. Otherwise select the box with largest channel range,
then greatest alpha weight, then lowest contained code. Choose its widest channel with R/G/B tie order,
sort by channel then code, and split at the first cumulative weight reaching half, clamped to leave
both halves nonempty. Repeat to requested box count. Each output is the alpha-weighted RGB555-channel
mean rounded to nearest with upward ties. Deduplicate and sort codes. Fully transparent crops yield
an empty palette; coincident means may reduce its size. There is no dither.

The generated palette becomes an editable saved value. Mask/crop changes leave it unchanged until
explicit regeneration. This deterministic candidate is not final art acceptance or variant sharing.

The [session](../tools/graphics/sprite-session.mjs) retains original straight-alpha pixels, a binary
hidden mask and separate source/LOD recipes. Hide sets alpha to zero; restore retrieves original alpha,
including semitransparent/invisible RGB. Mask undo/redo admits 32 operations and 8 MiB saved mask bytes.
New mask edits discard redo; no-ops consume no history. Source/recipe changes invalidate products,
clear preview and disable export until build. Failed imports preserve the session; only the newest
pending import may install.

```text
{ format: "superoutride.sprite-session", version: 1,
  source: { width, height, rgbaBase64 }, hiddenBase64, recipe, lodRecipe }
```

`rgbaBase64` contains original row-major R,G,B,A bytes independent of host endianness. `hiddenBase64`
contains one byte per source pixel, strictly 0 or 1. Both use canonical padded base64. Unknown/missing
fields, malformed bytes and invalid recipes fail before installation. Save/reopen validate through
the shared image compiler. Session files preserve inputs, not undo history; master/LOD exports contain
completed indexed images. There is no autosave or implicit overwrite. Cross-asset CourseDocument
identity/migration is a separate contract.

Editor admission is 1,048,576 source pixels, 4096 per axis, 32 MiB PNG and 16 MiB session JSON. Larger
Node-source admission remains available. A known crop width and explicit source/LOD color spaces are
required. Bottom-center anchor and threshold 0.5 are visible starting controls, not inferred vehicle
sizes or approved art policies. Preview uses the product scale/blitter. [Authoring tests](../tests/rendering/sprite-authoring.test.mjs)
cover palette ties/alpha, mask history/invalidation, portable sessions, decode parity and the complete
PNG -> session -> master/LOD -> product reader boundary.

## Course image-source admission

The [course image compiler](../src/compiler/course-image-source.ts) now admits saved image bytes into
the immutable CourseDocument graph. Each declared lowercase SHA-256 requires one explicit
`{sha256, bytes: Uint8Array}` input; repeated descriptors may share that input. It snapshots the complete
bounded input set before asynchronous hashing, verifies the exact bytes, decodes UTF-8 JSON and invokes
the existing sprite image validator. It performs no I/O, normalization, palette generation or filtering.

Canonical asset descriptors own deeply frozen indexed `SpriteLodDocument` sources. Section membership
resolves directly to these objects; descriptors sharing a digest share one source. No decoded mutable
pixel array is published through the graph. An ordinary sprite consumer can decode its own workspace
through `readSpriteLodAsset`; that workspace cannot alter the source. Ground composition will consume
the normalized master only, not the sprite's lower levels.

Admission limits are 256 supplied digests, 8 MiB per saved input, 64 MiB total encoded inputs,
1,048,576 master texels per image and 8,388,608 total level texels across unique saved sources. These
are offline resource bounds, not runtime/device budgets. The existing validator still owns image
fields, palettes, anchors, indices and octave layouts; a single normalized master remains valid.

Missing, duplicate and undeclared inputs are collected during preflight. Once the set is admitted,
independent digest, UTF-8/JSON and image errors are collected in document declaration order, independent
of input delivery order. Diagnostics have `kind: "asset"`, a specific code, digest, referring document
asset indices and the supplied input index when applicable. They do not invent JSON pointers into
CourseDocument. Failure publishes no graph. Wrong API types/domains throw TypeError/RangeError;
unexpected platform failures propagate.

This verifies source integrity and immutable sharing. The saved presentation subset below separately
binds those sources; overlap/picture continuity and Link readiness remain unqualified. Completed ground uses the separate resident compiler below.

## Saved course presentation

CourseDocument and presentation recipe v3 admit explicit Band paint profiles, static A/B mappings,
ordered stamps, environment/background profiles, shared scenery identities and state-selected road signs. [Content](content-and-gameplay.md#wire-fields-and-scopes)
owns exact fields/reference scopes. Ground and background bindings require one normalized master;
sprite LOD pyramids remain scenery inputs. Source assets resolve to the same canonical records as
Section membership, and scenery placements share a course-wide instance/asset record.

The ordinary [source evaluator](../src/groundmap/course-ground-source.ts) returns RGB555 on the finite
Section strip, with half-open lateral bounds `[-left, right)`. An explicit opaque `baseRgb555` fills
the strip. The active canonical Band selects its appearance profile using the shared half-open rule;
null paint intentionally reveals that base. Structural roles and physical materials infer no colors.
For image A, x/y indices are the positive-modulo wrap of `floor(40*(l-phaseL))` and
`floor(40*(s-phaseS))` against master width/height. These numeric metre origins are saved paint phase,
not geometry anchors. Source row direction is increasing s. Transparent index zero reveals the base;
RGB555 zero remains opaque black.

An alternate maps every opaque A slot to one explicit RGB555 value, preserving transparent indices
and geometry. Duplicate mapped colors are permitted. B is selected when the sum of the signed stripe
indices `floor((s-phaseS)/spanS)` and `floor((l-phaseL)/spanL)` is odd. Positive finite spans retain safe
integer cell identities throughout the strip. This is a static saved pattern, not runtime palette
animation; the immutable master is unchanged.

Stamps resolve their anchor to s and retain the authored l. Convert their sprite anchor to top-left
using `(anchorAxis+0.5)/40`, then apply the target `floor(40*coordinate+0.5)` rule on each axis. Store
the resulting integer grid position with its resolved anchor provenance. Sample the unrotated master
at that placement, clipped by the finite strip; later opaque stamp texels overwrite earlier paint or
stamps, while transparent texels preserve the previous color. GroundBase outside the strip remains a
separate environment value, not the strip's base or a physical support field.

Background masters must be opaque; the saved horizon is an image row, horizontal pan density is
positive pixels/radian, and yaw origin is converted from Section-frame degrees once. Environment
profiles are independent of Band paint/material changes. Scenery retains source anchors, lateral
position and height offset with canonical instance identity; geometric placement/visibility across
occurrences is a subsequent view/qualification responsibility.

This supplies complete data for this declared subset and a point-color source evaluator. It does not
generate dimensioned markings, boundary treatments or repair scatter, filter output
images, create resident records, or certify common-content overlap. Those unsupported authoring fields
fail admission. Geometry-only fixtures retain explicit absent presentation rather than guessed art.

The separate [presentation-domain qualifier](content-and-gameplay.md#declared-presentation-query-domains)
now compares the admitted subset's complete source patterns, static phase, ordered stamps, environments
and shared scenery over explicit camera/filter/anchor domains. Actual fork/merge renderer comparisons
use those saved images. This does not select a filtering recipe, publish resident records or qualify
general occurrence-mapped presentation.

## Resident ground

Build compiles all saved Section ground into a completed RGB555 payload and a manifest. The browser
validates the manifest before acquiring the payload, then validates and owns the complete bytes before
starting ticks. The headless driving scene uses the same resident readers. `course-ground-source`
remains the independent offline point-field oracle; driving performs no source-paint evaluation.

## Course Editor target

The completed-ground lattice, filter and wire layout below are implemented. Broader authoring features
remain targets; real-art review and named-device capacity/performance remain separate acceptance gates.
Geometry, physical materials, sprite metrics and sprite image-reader contracts retain their owners.

### Source and completed images

Normalized sprite masters, ground swatches and stamps use 40 source texels/m in both axes, RGB555,
at most 15 distinct opaque colors, and transparent index 0. RGB555 zero is opaque black. Even a fully
opaque ground swatch has at most 15 colors. Reuse PNG admission, crop/metric/anchor normalization,
explicit palette/coverage recipes and the common color codec. Ground consumes normalized masters,
not sprite LOD images.

Completed sprites retain their indexed-image/anchor contract. Completed ground at every level contains
fixed RGB555 colors, initially two bytes per texel; a composed mixed tile is not limited to 15 colors.
The composed ground strip has opaque coverage, with transparent source pixels revealing lower layers.
GroundBase retains separate color-or-transparent fills outside the strip. Neither controls support.

### Source lattice and tile dictionary

A source tile covers 64x64 cells: 1.6 m by 1.6 m in the Section chart. Origin, phase and metric extent
are explicit. Partial edge cells are clipped, preserving dimensions.

The completed anisotropic outputs for one near-tile footprint are L0 64x16 (40x10 texels/m),
L1 32x4 (20x2.5), and L2 16x1 (10x0.625), all RGB555. L3 onward uses coarse Section RGB555 images,
with lateral density halved and chainage density quartered per level. All Sections share kMax, the
first level (at least 3) at which every Section fits one coarse texel in each axis. Lateral grid origin
is `floor(-left*40/64)*64` source cells; chainage origin is zero. Clipped final cells retain their area.

A near record contains completed L0-L2 pixels. Deduplication compares the whole record exactly;
equal L0 with unequal lower levels remains distinct. Coarse levels use the composed Section field
across tile/material boundaries. Generate enough levels for the declared footprint envelope.

Map rows reference records and retain lateral ranges on the source lattice. Resolve variants,
orientation and phase during compilation. Entries contain tile references, without palette IDs or
flip controls. The payload is little-endian: the shared dictionary of 1,168 Uint16 colors per record,
then each Section's row-major Uint32 directory followed by its row-major Uint16 coarse images in level
order. Section order is the compiled graph's validated declaration order. Manifest grids and build
identity bind that order at admission; consumers receive canonical Section references.

### Ground LOD and filter

The resident reader adopts the renderer's existing `selectLevel(deltaSEffective)` contract. Start at
L0 and advance while `deltaSEffective >= 0.2 * 4^k`, clamped to available levels. Equality coarsens.
Collapsed rows contribute their complete effective chainage footprint. The earlier two-axis selector
candidate is superseded by this actual consumer contract; camera and renderer stay unchanged.

Recipe `superoutride.resident-rgb555` v1 composes source cells on the 40x40 texel/m lattice. Cell centres
select the half-open Band and saved image texel; finite edges clip area, and the last chainage cell uses
its clipped centre. Static A/B and ordered stamps retain the saved source rules above. Area integration
averages the RGB555 codec's decoded 8-bit encoded-sRGB channels, then rounds through the shared framebuffer
and RGB555 codecs. This deliberately changes source-preview pixels; mechanics and renderer oracles are unchanged.

Every level integrates the original composed cells. Near filters use tile-local summed areas; coarse
filters use rolling rows of unquantized channel/area sums, crossing tile and material boundaries.
No level filters previously quantized output. The finite Section source includes its authored Link/lap
guards; filtering clips only at its outer domain. These filters do not enlarge the common seam guard.

Runtime performs nearest completed-texel lookup. It retains row addresses across each scanline through
the existing reader API and shares one immutable RGB555-to-framebuffer lookup. Real-art and motion review
remain required for the chosen filter. No interpolation or acquisition occurs in a pixel query.

### Ground composition and stamp placement

Saved pixel composition is ordered: material fills/static A/B/seeded repair scatter; then boundary
treatments and dimensioned markings; then ordered stamps, with later opaque pixels covering earlier
ones. Save phase origins, seeds, widths and order. Geometry regenerates procedural content; independent
stamps remain saved placements. Boundary treatment is offline rasterization along an authored curve.

Quantize each resolved stamp top-left coordinate as `gridIndex=floor(40*coordinateMeters+0.5)`:
half-cell ties point toward the positive axis, including negative coordinates. Show the resolved
edge `gridIndex/40` in the editor while retaining the saved anchor's meaning through geometry edits.
This applies only to ground-image placement. Road geometry, vehicles, physical boundaries and rule
landmarks retain their coordinates. Bitmap shape supplies orientation/extent; placement adds no
runtime rotation, scale, skew or stretch.

### Static A/B recipe

A normalized indexed image A plus one saved color-mapping recipe are the two authoring inputs.
Each opaque slot maps to an explicit RGB555 value; transparency and index-pattern geometry stay fixed.
B is reproducible output, not an independently edited original. Duplicate target colors can be
compacted by the shared image validator. Shape-changing repairs remain separate source images.

Pattern phase selects static A/B during composition. Mixed-material and inside-tile stripe boundaries
resolve to completed colors before filtering. Ground runtime uses no palette banks, cycling, animation
or dynamic theme recoloring. Saved bytes/recipes establish replay; AI provenance is descriptive.

### Bounded compilation and resident data

Flattening defines one logical source field. Evaluate bounded tiles/strips with required filter
support, independent of batch size/traversal order. Working pixels use a 64-row source strip, one tile prefix buffer and one unquantized accumulator row
per coarse level. Source/template caches each retain at most 4 MiB (or one row); chunk and completed-tile
caches retain at most 4,096 and 2,048 keys. Dictionary/directory/final output grow only within admission
limits. Neither a whole-source image nor a whole-Section floating-point image is allocated.

The completed manifest binds format/compiler/input identity, finite domains, grids, tile records,
coarse images and lengths/digests. Include the course geometry identity in dependent image identities.
Validate assets before publishing immutable readers. Exact bytes, rather than digest equality alone,
prove deduplication. Geometry and SurfaceMap remain independent of image storage.

A ready course has all branches and one source lap resident, with shared records counted once.
Sampling is synchronous and performs neither acquisition nor prefiltering. Resolve row/span addresses
before the pixel loop. [Course loading](content-and-gameplay.md#course-loading) owns activation/retry;
[capacity](development.md#capacity-model) owns accounting, including switch peaks and the intentional
RGB555-versus-indexed storage tradeoff.

### Remaining technical gates

The lattice, selector, encoded-sRGB area recipe and packed layout are implemented. Real-art review,
whole-application measurements and named-device acceptance remain open. Existing camera/source metrics
stay fixed; whole-application measurements establish device budgets.
Revise contracts explicitly in this owner and causal tests. Vehicle lamp states remain deferred:
a later design may select immutable SINGLE-sprite variants from observations, without a shared mutable
palette or a general animation scheduler.
