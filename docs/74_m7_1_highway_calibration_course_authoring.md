# M7.1 Highway Calibration Course Authoring

Status: released course-authoring authority candidate; vehicle handling remains `DEV_UNCALIBRATED`.

M7.1 changes the public CIRCUIT development fixture used for repeated human handling trials. It does not change the frozen renderer, vehicle solver, topology model, race-lap authority or any handling parameter.

## 1. Architecture decision gate

1. Course shape, road cross-section, height and paint belong to DEV course authoring. SurfaceMap remains physical support authority; GroundMap remains visual authority.
2. Existing RasterPath, GuidePath, HeightProfile, SurfaceMap, GroundMap and finite CIRCUIT runtime-window primitives express the requirement without a new engine mode.
3. Road width and paint are authored once for the current fixture. Physics receives only ordinary SurfaceMap support, and renderer receives only ordinary GroundMap/Terrain profiles.
4. No route-, circuit-, stage-, car- or bike-specific branch is added to renderer or vehicle physics.
5. The existing CIRCUIT composition is the calibration entry because it supports repeatable laps without weakening open Core.
6. World-state authority, open lower-layer paths, chainage pseudo-depth, metric presentation, ten-degree Raster-turn limit, physical lap gates and zero camera roll remain unchanged.
7. `tests/m7-1-highway-calibration-course.test.mjs` checks the causal authoring boundaries, including actual contact release over the airborne probe.

## 2. Scope and roadway interpretation

The M7.1 calibration road is one continuous, same-direction, four-lane DEV proving roadway:

```text
lane count            = 4
lane width            = 3.5 m
total asphalt width   = 14.0 m
road lateral domain   = -7.0 m .. +7.0 m
player start lane     = l = -1.75 m
rival start lane      = l = +1.75 m
```

This is deliberately not a divided `2 + median + 2` opposing-traffic cross-section. Opposing traffic and a physical median would change product traffic, collision, spawn and route rules and require a separate explicit decision.

The 1.5 m shoulders are current DEV fixture authoring. M7.1 does not claim that shoulder value as a universal Japanese expressway standard.

## 3. Japanese road-reference values

The numerical references are drawn from official Japanese road material:

- MLIT Road Structure Ordinance Article 15 lists an ordinary minimum horizontal radius of 460 m at design speed 100 km/h and 710 m at 120 km/h.
- MLIT road-structure tables use 3.5 m as the standard high-speed lane width for the relevant high-standard road classes.
- MLIT longitudinal-marking guidance gives 0.15 m lane separators, and 0.20 m outer edge lines for design-speed-80-km/h-or-higher motor-vehicle-only roads.
- The same guidance gives 8 m paint plus 12 m gap for high-speed lane-boundary broken lines. NILIM evidence for NEXCO-managed roads also records the 8 m + 12 m pattern.

Primary references:

```text
https://www.mlit.go.jp/road/road_e/r1_standard_2.html
https://www.mlit.go.jp/road/sign/pdf/kouzourei_full.pdf
https://www.mlit.go.jp/road/sign/kijyun/pdf/19741226kukakusenn.pdf
https://www.nilim.go.jp/lab/bcg/siryou/tnn/tnn1270pdf/ks1270.pdf
```

M7.1 authoring uses:

```text
minimum end-curve source radius = 470 m
alternating sweep radius         = 720 m
lane separator width             = 0.15 m
lane separator pattern           = 8 m ON + 12 m OFF
outer edge-line width            = 0.20 m solid
```

After Raster-to-Guide filleting, the measured minimum finite Guide radius remains approximately 469.55 m, above the 460 m reference. Every Raster turn is at most 5 degrees, below the frozen 10-degree maximum.

These are calibration-course geometry references, not permission to infer final tire grip or final safe gameplay speed from civil-road design rules.

## 4. Course structure

The explicit authored lap is approximately 7.762 km, compared with the earlier approximately 0.766 km stadium fixture. It contains:

- two long calibration sides;
- alternating left/right 720 m sweep curves;
- two 470 m end curves;
- moderate long-wave elevation changes;
- one intentionally severe crest/drop on the initial straight.

The lap is authored as one explicit closed-lap source above Core. CIRCUIT compilation still unfolds three scored laps plus one ordinary finite runout copy. Renderer, camera and physics consume only that resulting open window.

## 5. Airborne proving section

The initial straight contains an intentionally non-road-standard vertical feature:

```text
s=260 m   y=  9 m
s=350 m   y= 14 m
s=380 m   y= -4 m
```

This exception exists to exercise the M7.0 support/contact separation. The regression launches an ordinary car from `s=250 m` at 60 m/s with neutral input and proves that both contacts leave `CONTACT` and the body-ground gap exceeds the retained-contact threshold.

The test freezes the existence and causal function of the proving feature, not its final gameplay feel. Human trial remains authority for whether the crest should be gentler, sharper, earlier or later.

## 6. Paint and physical independence

GroundMap now accepts explicit longitudinal marking authoring. A marking owns lateral center, width and either solid or dash/gap pattern. The historic fixtures retain their existing center-dash result when no explicit marking list is supplied.

Paint never creates support or changes friction. The M7.1 SurfaceMap independently authors asphalt over `-7 m .. +7 m`, then shoulder and grass bands. This preserves the frozen GroundMap/SurfaceMap separation.

## 7. Spawn and recovery

Vehicle constructors accept an explicit initial Guide lateral coordinate. M7.1 uses lane centers rather than spawning on a lane separator.

Ordinary recovery may receive a gameplay-profile `targetL`. The calibration player and rival profiles return their actors to their respective lane centers. Explicit branch recovery targets remain separately authored and unchanged.

## 8. Still uncalibrated

M7.1 does not freeze:

- tire friction or slip curves;
- steering gain or useful-slip limit;
- TCS/ABS intervention;
- engine torque, gear ratios or shift scheduling;
- jump severity or final camera cue gains;
- shoulder width as a product roadway standard;
- final traffic direction, median or opposing-traffic rules.

Those remain subject to human driving evaluation and later explicit milestones.
