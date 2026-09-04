# M9.14 — Compact Touch Travel and Expanded Diagnostic Ranges

Status: current scoped DEV touch-feel and browser handling-comparison range authority.

Vehicle handling remains `DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.14 changes only two DEV-facing calibration scopes:

1. the full-scale displacement used by the existing M9.13 relative analog touch gesture;
2. the browser comparison ranges for Driver steering offset `D` and the existing independent tire
   axes `GRIP / PEAK / SLIDE`.

It does not change the M9.13 pointer-origin/role/DIRECT/release architecture, the M9.11 steering
law, M9.10 tire constitutive law, common two-station vehicle mechanics, actuator rates, production
profiles, camera, renderer, route or topology authority.

M9.14 supersedes:

- M9.13 only for the full-scale touch displacement calibration;
- M9.12A only for the current browser `D` range;
- M9.12C/M9.12B/M9.12A only for the current browser `GRIP / PEAK / SLIDE` comparison ranges.

Defaults remain unchanged.

## 2. Architecture Decision Gate

1. Touch travel calibration remains owned by the input adapter; no device-specific physics branch is
   introduced.
2. `D`, `GRIP`, `PEAK` and `SLIDE` remain existing browser DEV selector authorities; no new mechanics
   state is needed.
3. The existing steering calibration and tire calibration primitives already express every new
   value.
4. No duplicate rack, tire state, drift mode, target sideslip, touch-specific vehicle state or
   device-specific mechanics authority is added.
5. M9.11 still derives `A=M-D`; `A` remains unstored.
6. M9.12 still derives browser tire characteristics onto the same three vehicle-owned calibration
   scalars.
7. Regression covers the expanded selector products, extreme values, finite wheel solve and compact
   touch travel.

## 3. Compact touch full-scale displacement

M9.13 used a viewport-relative rule with a 72–120 CSS px clamp. M9.14 replaces only that calibration
with one fixed value:

```text
L = 64 CSS px
```

The gesture remains exactly:

```text
steering = clamp((x - x0) / L, -1, +1)
pedalAxis = clamp((y0 - y) / L, -1, +1)
```

Therefore 32 CSS px is 50% input and 64 CSS px is 100% input.

CSS pixels are independent of backing-store/native pixel density such as a Retina device pixel
ratio, so the control no longer changes with viewport dimensions or orientation. CSS px is not a
reliable physical millimeter across all devices; M9.14 therefore makes no claim of exact physical-mm
calibration.

All other M9.13 behavior is retained: pointer-down origin, left/right role ownership, two-thumb use,
DIRECT held response, existing release-rate decay after release, and presentation-only origin/vector
indicators.

## 4. Steering comparison range

Current browser steering comparison scope is:

```text
D   = 10 / 11 / 12 / 13 / 14 / 15 / 16 / 17 / 18 / 19 / 20 deg
M   = 50 / 55 / 60 / 65 / 70 deg
ACT = 0.20 / 0.225 / 0.25 / 0.275 / 0.30 s
```

Defaults remain:

```text
D=12 deg / M=60 deg / ACT=0.25 s
```

The M9.11 law remains unchanged:

```text
A = M - D
automatic = clamp(betaTravel, -A, +A)
deltaTarget = clamp(automatic + u*D, -M, +M)
```

The expanded complete browser product preserves:

```text
A >= 30 deg
```

at the extreme `M=50 / D=20`. Compiled production-profile steering seeds are unchanged.

## 5. Tire comparison ranges

Current browser tire comparison scope is:

```text
GRIP  = 2.00 / 2.20 / 2.40 / 2.60 / 2.80 / 3.00 / 3.20 / 3.40 / 3.60 / 3.80 / 4.00
PEAK  = 20 / 22 / 24 / 26 / 28 / 30 / 32 / 34 / 36 / 38 / 40 /
        42 / 44 / 46 / 48 / 50 / 52 / 54 / 56 / 58 / 60 %
SLIDE = 60 / 65 / 70 / 75 / 80 / 85 / 90 / 95 / 100 %
```

Defaults remain:

```text
GRIP=2.00 / PEAK=20% / SLIDE=80%
```

The complete browser product is:

```text
11 x 21 x 9 = 2,079 calibrations
```

The three-axis interpretation is unchanged:

```text
GRIP  = peak force height
PEAK  = common normalized slip at peak
SLIDE = large-lateral-slip plateau / peak
```

Changing one axis must preserve the other two displayed characteristics. Physics continues to store
only reference-friction multiplier, linear-stiffness multiplier and sliding-friction ratio.

## 6. Diagnostic interpretation

The upper ranges are intentionally diagnostic rather than literal production-tire claims.

In particular:

- `GRIP=4.00` is a high-force probe;
- `PEAK=60%` is a very late common normalized-slip peak and must not be presented as ordinary real
  tire realism;
- `SLIDE=60%` gives a strong post-peak drop;
- `SLIDE=100%` means the M9.10 large-lateral-slip plateau equals peak force, i.e. no post-peak force
  loss at the plateau.

If handling continues to improve monotonically toward these extreme values, the result is evidence
that the current reduced model may be compensating for omitted/compressed transient or compliance
behavior. M9.14 does not authorize new tire memory, roll state, load-transfer state or another
handling layer merely because an extreme probe feels better.

## 7. Executable acceptance

Release requires:

1. touch full scale is exactly 64 CSS px for portrait and landscape viewports;
2. 32 CSS px maps to 50% and 64 CSS px saturates at 100%;
3. the rest of M9.13 touch ownership/DIRECT/release semantics remain unchanged;
4. browser `D` choices are exactly 10–20 deg in 1-degree steps and default remains 12 deg;
5. `M` and `ACT` ranges/defaults remain unchanged;
6. every M/D combination derives `A=M-D` and the minimum browser `A` is 30 deg;
7. GRIP choices are exactly 2.00–4.00 in 0.20 steps;
8. PEAK choices are exactly 20–60% in 2% steps;
9. SLIDE choices are exactly 60–100% in 5% steps;
10. tire default remains G2.00/P20/S80;
11. changing any one tire axis preserves the other two displayed characteristics;
12. all 2,079 tire combinations remain finite in the retained scalar wheel solve;
13. no new tire/steering/touch mechanics state or lower-layer special case is added;
14. complete exact-head CI passes before release.

Because M9.14 changes current normative browser range and touch-feel authority, it requires a
standalone validation record under `docs/validation/README.md` before release.
