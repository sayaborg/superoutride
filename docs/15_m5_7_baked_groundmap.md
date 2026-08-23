# M5.7 — Baked GroundMap Runtime Integration

## Result

M5.7 replaces the M5 browser runtime's procedural GroundMap sampling with a compiler/build-time baked anisotropic asset while preserving the Core renderer architecture.

```text
Surface Region authoring
→ GroundMap logical profile
→ dense cyclic level 0
→ compiler 2x4 anisotropic prefilter
→ k0..k6
→ chunk + payload dedup
→ palette8 / RGB555 binary asset
→ runtime TerrainLine level selection
→ horizontal span sampling
```

Runtime does **not** perform anisotropic filtering.

## Density and alignment

The M5.4 density authority remains unchanged:

```text
q_l authority = 0.025 m/texel
q_s authority = 0.05110665314780038 m/texel
```

The compiler aligns the cyclic level-0 dimensions so they are exactly divisible through `k_max=6`:

```text
base lateral  = 960 texels
base chainage = 16384 texels
```

For the current 776.5128086698837 m debug course:

```text
actual q_l = 0.025 m/texel
actual q_s = 0.04739458060729271 m/texel
```

The actual baked grid is therefore never coarser than the M5.4 authority.

At each level:

```text
lateral texels   /= 2
chainage texels  /= 4
```

so the generated asset contains exactly levels 0 through 6.

The actual k6 chainage footprint is sufficient for the M5.6 `Delta_s_eff <= 147.5m` proof bound, while k5 is still insufficient for the measured 141.016m case.

## Storage

Level 0 uses an 8-bit palette because the source GroundMap uses a small discrete authored palette.

Filtered levels 1–6 use opaque RGB555 storage, matching the target framebuffer/color-depth direction without requiring arbitrary alpha.

Build-time result from GitHub Actions:

```text
logical chunk refs       141
unique payloads          124
binary bytes      20,220,030
raw RGBA pyramid  71,902,320
storage ratio          28.12%
```

Chunks are metadata-addressed and identical encoded payloads are shared. This is the foundation for later streaming/residency policy without changing the renderer's `(s,l)` semantics.

## Level-0 authority check

The procedural `sampleGroundMap()` function remains as the compiler authoring/source reference and DEV/test fallback.

M5.7 validates that baked level-0 texel centers reproduce that source exactly. The browser M5 runtime then loads the generated binary asset and no longer uses procedural GroundMap evaluation for normal terrain pixels.

## Runtime LOD

One TerrainLine owns one `Delta_s_eff`, therefore level selection is done once per line:

```text
k = clamp(ceil(log4(Delta_s_eff/q_s)), 0, 6)
```

The horizontal pixel loop only samples the already-selected baked level.

Lateral footprint is still diagnostic only. M5.7 does not introduce a 2D LOD table or lateral-driven promotion.

## Cyclic addressing

Each level uses the same closed-course chainage domain. Runtime sampling wraps `s` by course length before mapping it to the baked level, and tests verify identical results at `s`, `s+L`, and `s-L` for every level.

## Preserved renderer rules

M5.7 does not change:

- world-space physics authority
- chainage pseudo-depth
- one-chainage/one-scanline terrain mapping
- GroundBase transparency semantics
- SurfaceMap independence
- far-to-near Painter ordering
- sprite scaling rules
- forward-only renderer behavior

The only changed terrain-pixel source is procedural GroundMap → compiler-baked GroundMap pyramid.

## Next

The next compiler/performance block should measure and validate actual terrain and sprite output budgets:

- TerrainLine count per frame
- terrain output samples per frame and per screen row
- sprite output samples per frame and per scanline
- GroundMap LOD distribution
- close tunnel/portal stress cases

These are content/compiler validation budgets, not reasons for runtime to drop non-optional terrain arbitrarily.
