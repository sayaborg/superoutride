# M5.4 — GroundMap Density / Anisotropic LOD Foundation

## Status

M5.4 implements the compiler-side GroundMap density and anisotropic-pyramid mathematics required by the Core Design Freeze. It does not yet replace the procedural DEV GroundMap sampler with baked texture assets.

## 1. One base-density authority

The Core rule is preserved:

```text
d0 = D_cam by default
```

From one reference depth and camera profile:

```text
q_l = d0 / f
q_s = f q_l^2 / (h cos Phi_ref)
rho_l = 1 / q_l
rho_s = 1 / q_s
```

`q_l` and `q_s` are meters represented by one base texel in lateral and chainage directions. Their reciprocals are source texels per meter.

No independent texture-density tuning knobs are introduced.

## 2. Current M5.4 reference values

The old Core example used `h=2m`. M5.4 instead recalculates from the current flat-road camera base height used by the browser DEV profile:

```text
d0      = 5.0 m
f       = 200 px
h       = 2.469902425419539 m
Phi_ref = 8 deg
```

Result:

```text
q_l   = 0.025 m/texel
q_s   = 0.051106653147800385 m/texel
rho_l = 40 texels/m
rho_s = 19.566924038402615 texels/m
```

For the Core's illustrative unique-texture envelope:

```text
W        = 24 m
L_unique = 3000 m
```

the base-level upper-bound estimate becomes:

```text
N0 ≈ 56.35 million texels
```

This is intentionally reported rather than hidden. The `d0=5m` player-scale decision makes a fully unique high-density GroundMap expensive, so later chunk reuse / authoring economy / analytic-equivalent optimizations matter.

## 3. One anisotropic pyramid

The Core uses one shared pyramid, not a 2D LOD table.

At level `k`:

```text
q_l(k) = q_l * 2^k
q_s(k) = q_s * 4^k
```

The compiler prefilter therefore reduces each level by:

```text
lateral   : 2 -> 1
chainage  : 4 -> 1
```

`src/compiler/ground-map-prefilter.ts` implements this 2x4 box-prefilter foundation over 32-bit RGBA GroundMap texels.

The builder requires exact source divisibility by `2^kMax` laterally and `4^kMax` in chainage. The future chunk baker must therefore pad/bake deterministic dimensions rather than silently dropping cyclic edge texels.

## 4. Runtime level authority

Runtime LOD is selected only from effective chainage footprint:

```text
k_s = max(ceil(log_4(Delta_s_eff / q_s)), 0)
k   = clamp(k_s, 0, k_max)
```

Lateral footprint remains diagnostic:

```text
k_l = max(ceil(log_2(Delta_l / q_l)), 0)
```

A large `k_l` must **not** raise the shared pyramid level. Doing so would blur chainage by an extra factor of four per level merely to respond to lateral minification.

`src/compiler/ground-map-lod.ts` implements both quantities separately so the API itself reflects that rule.

## 5. Required pyramid depth

The required `k_max` is derived from the maximum non-optional effective chainage footprint observed by the Road Generator envelope:

```text
k_max_required = max(ceil(log_4(Delta_s_eff_max / q_s)), 0)
```

M5.4 provides this calculation but does not yet invent `Delta_s_eff_max`. That value must come from the actual Road Generator/camera/grade/thin-span analysis rather than a guessed tuning constant.

## 6. Deliberate boundary

M5.4 adds:

- base density derivation
- current `D_cam=5m` recalculation
- unique-base-texel upper-bound estimate
- anisotropic level footprint math
- chainage-only runtime level selection
- lateral diagnostic level
- required pyramid-depth calculation
- deterministic 2x4 compiler prefilter primitive

M5.4 does **not** yet add:

- arbitrary runtime anisotropic filtering
- a 2D `(k_s,k_l)` LOD table
- guessed `Delta_s_eff_max`
- production chunk layout
- baked GroundMap asset manifest
- runtime replacement of the procedural DEV GroundMap sampler

## 7. Next

Next compiler step:

1. instrument/derive actual `Delta_s_eff` and `Delta_l` from TerrainLine generation
2. measure worst-case Road Generator envelope including hill/dip and thin-span collapse
3. derive the real `k_max`
4. connect baked GroundMap chunks/pyramid levels to runtime sampling
5. keep `k_l` diagnostic only
