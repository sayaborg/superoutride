# Core Design Freeze Addendum — M6.45 Open Source Profiles

This addendum is normative. It extends the M6.44 open-path authority from geometry and SurfaceMap into stage source data. It does not change any frozen renderer mathematics, world-physics authority, fixed metric scale, Raster/Guide geometry rules, Painter order, or route handoff semantics.

## 1. General source model is open

For ordinary stage-local source data, the canonical chainage domain is:

```text
0 <= s <= L
```

The general forms are open:

```text
HeightProfile
VisualProfile
GroundMapLogicalProfile
BakedGroundMapAsset
SurfaceMap
```

Sampling outside `[0,L]` is invalid. General source objects do not modulo-wrap, clamp to the opposite endpoint, or infer a circuit.

## 2. Cyclic behavior is always explicit

Closed-course addressing is a named topology choice above the general source model:

```text
CyclicHeightProfile
CyclicVisualProfile
CyclicGroundMapLogicalProfile
CyclicBakedGroundMapAsset
CyclicSurfaceMap
```

A cyclic adapter may reuse an open source, but cyclic behavior must never be inherited merely because a consumer reads height, visuals, GroundMap, or surface data.

The architectural rule is:

> **Open is the general data model. Cyclic is a named topology adapter. The renderer is neither.**

## 3. Height authority

`HeightProfile` owns an explicit finite stage domain. The general profile requires endpoint coverage at both `s=0` and `s=L`.

The reusable stage authoring compiler may deliberately extend the final authored height value to the actual Guide endpoint when authoring change-points stop before `L`. That is a compiler rule, not hidden sampling behavior.

Therefore:

- the source object never wraps;
- the source object never guesses an endpoint;
- the compiler owns any deliberate authoring expansion;
- runtime consumers only read the compiled profile contract.

## 4. Visual authority

`VisualProfile` is an open section map over `[0,L]`.

Section lookup and distance-to-next-section logic terminate at the real stage endpoint. A visual profile does not jump from the final section to the first unless an explicit cyclic adapter is selected by a higher layer.

## 5. GroundMap logical authority

Logical GroundMap classification is open by default.

Material/marking classification at `(s,l)` follows the active stage domain. Out-of-range `s` is invalid rather than wrapped into another part of the source.

GroundMap visual semantics remain independent from SurfaceMap physical support semantics.

## 6. Baked GroundMap authority

The baked GroundMap asset remains a finite sampled representation of one stage source. M6.45 does not introduce an unnecessary asset-format migration merely to remove cyclic runtime addressing.

`BakedGroundMapAsset` samples the finite `[0,L]` domain directly. If a future circuit intentionally needs periodic addressing, it must opt into `CyclicBakedGroundMapAsset` explicitly.

LOD selection, anisotropic pyramid layout, palette/RGB555 encoding and the previously frozen density authority are unchanged.

## 7. Ordinary point-to-point content must remain open

LINEAR and BRANCHING product courses use ordinary open source profiles.

Current child/successor stage content must not select cyclic adapters merely as historical compatibility. A cyclic adapter is reserved for content whose topology is intentionally cyclic.

## 8. Runtime package and renderer boundary

Runtime content assembly and rendering consume source-reader contracts. They must not derive route topology from a concrete cyclic class name.

The renderer remains topology-neutral:

```text
d = s_render - s_camera
```

No Height/Visual/GroundMap change in M6.45 adds course-length modulo, endpoint wrapping, route identity, circuit state, or branch state to the renderer.

## 9. Circuit authority remains above Core

A future CIRCUIT mode may explicitly provide:

- endpoint connection;
- lap/unwrapped chainage authority;
- cyclic source adapters where periodic source data is desired.

It must not turn the general stage source interfaces back into implicitly cyclic structures.

## 10. Preserved invariants

M6.45 preserves all M6.44 authority, including:

- open RasterPath and GuidePath;
- no manufactured last-to-first segment;
- no synthetic endpoint turn/miter/fillet;
- renderer pseudo-depth equal to `s_render - s_camera`;
- camera chainage equal to `s_vehicle - D_cam`;
- terrain endpoint clipping rather than wrapping;
- explicit open SurfaceMap plus named cyclic adapter;
- open successor runout without artificial source closure;
- world X/Y/Z as vehicle-physics authority;
- one chainage to one horizontal scanline;
- fixed 2.0 m = 80 px player-depth metric scale;
- single far-to-near Terrain + World Sprite Painter;
- branch/circuit topology outside renderer Core.
