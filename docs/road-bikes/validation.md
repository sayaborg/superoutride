# Road-bike validation

The [source ledger](../road-bikes.md) owns the specification choices and uncertainties. These are
shared-game-solver results, not real motorcycle performance claims. [Full measurements](measurements.json)
include 240 one-second acceleration samples per bike, every braking step, shift-event RPM and conditions.
The runtime mechanics JSON remains authoritative; no values were changed to enforce a performance order.

## Conditions and interpretation

The authored catalog is admitted by `npm run road-bike-validation`. Each bike starts from rest at s=100 m
on a 60 km straight, flat, windless ASPHALT, grip factor 1 and rolling resistance 0.014, alone.
Fixed mass includes 75 kg rider, 5 kg equipment and 10 L fuel; the individual fluid adjustments are in the ledger.
Full throttle is requested for 240 s, with the existing input actuator rates, automatic shifts, launch assistance,
wheel-slip and pitch protections. Simulation uses 1/60 s steps and 12 vehicle substeps.

The acceleration run ends at the fixed time, not at the first apparent maximum. A result is marked settled only
when the final 10 s speed range is below 0.1 km/h and every one-second acceleration sample in that interval
has magnitude below 0.01 m/s². All five satisfy this criterion. No sampled fuel cut occurred in that interval.
Reported travel is from the initial position. Target times use the first step at or above the target speed,
without interpolating a substep time. No 300/350 km/h measurement is implied; those speeds were not reached.

The 100–stop run uses a fresh rolling vehicle at exactly 100 km/h, standard initial gear/engine state,
controls initially released, then full brake requested with the existing actuator rates and no reaction delay.
The end threshold is below 0.1 m/s (0.36 km/h), not mathematically zero. A separate full-speed braking run
records every downshift; after that stop, full throttle is requested for 8 s to check restart.
A fresh vehicle at 25 m/s alternates steering `0.25*sin(time)` for 12 s with throttle 0.3 and the shared
front-steering rule 0.8. This checks finite left/right response, not maximum cornering grip.

## Acceleration, terminal state and braking

| Vehicle       | 0–100 s | 0–100 distance m | Speed at 240 s km/h |  Travel m | Final rpm / gear | 100–stop s | 100–stop m | End km/h |
| ------------- | ------: | ---------------: | ------------------: | --------: | ---------------- | ---------: | ---------: | -------: |
| CB900F_1981   |   4.733 |           63.335 |             205.856 | 13304.529 | 8975.2 / 5       |      2.767 |     38.570 |    0.057 |
| GSX1100SZ     |   3.833 |           50.270 |             233.742 | 15138.834 | 9415.2 / 5       |      2.683 |     37.531 |    0.019 |
| GPZ900R_A1    |   3.983 |           49.754 |             232.516 | 15043.530 | 9961.6 / 6       |      2.567 |     36.004 |    0.070 |
| GSX_R750_1985 |   3.850 |           48.443 |             227.637 | 14772.415 | 11016.4 / 6      |      2.583 |     36.342 |    0.078 |
| VMAX1200_1985 |   3.817 |           48.996 |             228.629 | 14846.006 | 9209.1 / 5       |      2.767 |     38.402 |    0.066 |

The GSX-R's sampled 11016 rpm is slightly above its authored 11000 rpm curve endpoint. The existing
shared fuel-cut entry is above redline, and tire slip separates engine speed from zero-slip road speed.
Neither redline nor the theoretical gearing table is a hard vehicle-speed cap. Shift-event RPM similarly
includes discrete-step and wheel-slip effects; it need not equal the nominal no-slip calculation.

The VMAX's 228.6 km/h result is about 3.1 km/h below the period test's 144 mph (231.7 km/h), but rider posture,
wind, grade, tire and rollout conditions are not completely reported by that test. Its 0–60 mph and 60–0 mph
results are different speed intervals from this 0–100/100–stop protocol. No exact period calibration is claimed.
Comparable target-market measurements with complete conditions were not verified for the other four bikes.
Estimated drag, loaded radii/masses, the modern common tire model and game assists limit all comparisons;
particularly the brake results do not establish period tire/brake performance.

| Vehicle       | Restart after 8 s km/h | Left/right lateral acceleration range m/s² | Full-speed brake s / m | Final brake km/h |
| ------------- | ---------------------: | ------------------------------------------ | ---------------------- | ---------------: |
| CB900F_1981   |                139.957 | -4.713 to 4.717                            | 5.183 / 142.467        |            0.033 |
| GSX1100SZ     |                162.180 | -4.660 to 4.713                            | 5.617 / 175.359        |            0.174 |
| GPZ900R_A1    |                160.715 | -4.653 to 4.681                            | 5.350 / 166.257        |            0.087 |
| GSX_R750_1985 |                163.345 | -4.630 to 4.622                            | 5.217 / 158.666        |            0.286 |
| VMAX1200_1985 |                167.794 | -4.566 to 4.580                            | 5.567 / 167.333        |            0.196 |

## Gearing and actual automatic shifts

Nominal upper-point speeds assume the authored effective rear rolling radius, no slip and an engine exactly at
redline. Total reduction is gearbox × aggregate primary/middle/final reduction. Nominal post-upshift RPM is
redline × next ratio / current ratio. The source ledger keeps the real transmission stages separately.
Actual rows come from solver shift events. Downshift time starts at the full-speed braking request.

### CB900F_1981

| Gear | Gearbox ratio | Total reduction | Nominal redline km/h | Nominal post-upshift rpm |
| ---- | ------------: | --------------: | -------------------: | -----------------------: |
| 1    |   2.533000000 |    13.379579564 |               87.397 |                   6709.6 |
| 2    |   1.789000000 |     9.449691212 |              123.743 |                   7386.5 |
| 3    |   1.391000000 |     7.347412228 |              159.149 |                   7922.4 |
| 4    |   1.160000000 |     6.127245280 |              190.841 |                   8189.7 |
| 5    |   1.000000000 |     5.282108000 |              221.376 |                        — |

| Event    | Time s | Speed km/h | From rpm | To rpm |
| -------- | -----: | ---------: | -------: | -----: |
| up 1→2   |  3.967 |     87.743 |   9771.2 | 6903.1 |
| up 2→3   |  6.433 |    124.021 |   9719.2 | 7557.9 |
| up 3→4   | 10.400 |    159.264 |   9683.0 | 8075.4 |
| up 4→5   | 18.783 |    190.948 |   9660.2 | 8327.9 |
| down 5→4 |  0.617 |    181.376 |   6897.4 | 8003.8 |
| down 4→3 |  1.267 |    151.553 |   7060.5 | 8463.1 |
| down 3→2 |  2.067 |    117.292 |   6590.2 | 8471.8 |
| down 2→1 |  2.917 |     82.815 |   6013.6 | 8509.0 |

### GSX1100SZ

| Gear | Gearbox ratio | Total reduction | Nominal redline km/h | Nominal post-upshift rpm |
| ---- | ------------: | --------------: | -------------------: | -----------------------: |
| 1    |   2.500000000 |    12.428571429 |               92.298 |                   6755.6 |
| 2    |   1.777777778 |     8.838095238 |              129.794 |                   7379.5 |
| 3    |   1.380952381 |     6.865306122 |              167.090 |                   7739.2 |
| 4    |   1.125000000 |     5.592857143 |              205.106 |                   8119.7 |
| 5    |   0.961538462 |     4.780219780 |              239.974 |                        — |

| Event    | Time s | Speed km/h | From rpm | To rpm |
| -------- | -----: | ---------: | -------: | -----: |
| up 1→2   |  3.483 |     92.939 |   9814.2 | 6981.2 |
| up 2→3   |  5.483 |    130.195 |   9755.6 | 7579.2 |
| up 3→4   |  8.517 |    167.276 |   9714.6 | 7914.6 |
| up 4→5   | 14.417 |    205.244 |   9685.3 | 8278.3 |
| down 5→4 |  1.117 |    184.086 |   6710.4 | 7848.5 |
| down 4→3 |  1.867 |    149.752 |   6386.3 | 7836.1 |
| down 3→2 |  2.633 |    116.265 |   6099.8 | 7848.8 |
| down 2→1 |  3.433 |     82.873 |   5626.9 | 7907.6 |

### GPZ900R_A1

| Gear | Gearbox ratio | Total reduction | Nominal redline km/h | Nominal post-upshift rpm |
| ---- | ------------: | --------------: | -------------------: | -----------------------: |
| 1    |   2.800000000 |    13.979411765 |               92.295 |                   7500.0 |
| 2    |   2.000000000 |     9.985294118 |              129.213 |                   8352.3 |
| 3    |   1.590909091 |     7.942847594 |              162.440 |                   8800.0 |
| 4    |   1.333333333 |     6.656862745 |              193.820 |                   9086.5 |
| 5    |   1.153846154 |     5.760746606 |              223.970 |                   9425.0 |
| 6    |   1.035714286 |     5.170955882 |              249.516 |                        — |

| Event    | Time s | Speed km/h | From rpm | To rpm |
| -------- | -----: | ---------: | -------: | -----: |
| up 1→2   |  3.600 |     92.674 |  10842.6 | 7747.1 |
| up 2→3   |  5.583 |    129.612 |  10782.7 | 8578.4 |
| up 3→4   |  8.183 |    162.652 |  10742.0 | 9003.5 |
| up 4→5   | 12.333 |    194.051 |  10713.3 | 9271.5 |
| up 5→6   | 25.033 |    224.109 |  10692.2 | 9597.5 |
| down 6→5 |  0.683 |    203.482 |   7255.1 | 8085.6 |
| down 5→4 |  1.217 |    176.088 |   7529.9 | 8698.0 |
| down 4→3 |  1.817 |    147.308 |   7295.3 | 8700.8 |
| down 3→2 |  2.467 |    117.429 |   6945.4 | 8726.9 |
| down 2→1 |  3.233 |     83.785 |   6305.1 | 8821.0 |

### GSX_R750_1985

| Gear | Gearbox ratio | Total reduction | Nominal redline km/h | Nominal post-upshift rpm |
| ---- | ------------: | --------------: | -------------------: | -----------------------: |
| 1    |   2.769230769 |    14.490161002 |               91.599 |                   8192.7 |
| 2    |   2.062500000 |    10.792151163 |              122.987 |                   8784.3 |
| 3    |   1.647058824 |     8.618331053 |              154.008 |                   9350.0 |
| 4    |   1.400000000 |     7.325581395 |              181.186 |                   9642.9 |
| 5    |   1.227272727 |     6.421775899 |              206.686 |                   9816.6 |
| 6    |   1.095238095 |     5.730897010 |              231.603 |                        — |

| Event    | Time s | Speed km/h | From rpm |  To rpm |
| -------- | -----: | ---------: | -------: | ------: |
| up 1→2   |  3.483 |     92.349 |  11380.6 |  8479.0 |
| up 2→3   |  5.017 |    123.402 |  11324.3 |  9044.9 |
| up 3→4   |  7.167 |    154.340 |  11279.3 |  9588.4 |
| up 4→5   | 10.017 |    181.509 |  11250.0 |  9862.5 |
| up 5→6   | 14.900 |    206.874 |  11228.0 | 10020.2 |
| down 6→5 |  0.683 |    198.679 |   7848.8 |  8796.8 |
| down 5→4 |  1.150 |    174.148 |   8295.7 |  9460.0 |
| down 4→3 |  1.683 |    148.081 |   8108.4 |  9535.2 |
| down 3→2 |  2.333 |    117.810 |   7657.8 |  9584.4 |
| down 2→1 |  3.017 |     87.543 |   7235.6 |  9708.6 |

### VMAX1200_1985

| Gear | Gearbox ratio | Total reduction | Nominal redline km/h | Nominal post-upshift rpm |
| ---- | ------------: | --------------: | -------------------: | -----------------------: |
| 1    |   2.529411765 |    12.807656396 |               88.307 |                   6658.0 |
| 2    |   1.772727273 |     8.976190476 |              126.001 |                   7223.0 |
| 3    |   1.347826087 |     6.824706694 |              165.723 |                   7590.6 |
| 4    |   1.076923077 |     5.452991453 |              207.411 |                   8191.3 |
| 5    |   0.928571429 |     4.701814059 |              240.548 |                        — |

| Event    | Time s | Speed km/h | From rpm | To rpm |
| -------- | -----: | ---------: | -------: | -----: |
| up 1→2   |  3.383 |     91.688 |   9830.8 | 6899.9 |
| up 2→3   |  5.033 |    126.580 |   9784.8 | 7440.9 |
| up 3→4   |  7.817 |    166.004 |   9737.6 | 7781.0 |
| up 4→5   | 14.317 |    207.621 |   9703.0 | 8366.5 |
| down 5→4 |  0.717 |    196.959 |   7280.1 | 8442.8 |
| down 4→3 |  1.550 |    157.415 |   6838.1 | 8554.9 |
| down 3→2 |  2.417 |    119.277 |   6513.2 | 8562.4 |
| down 2→1 |  3.283 |     83.546 |   6032.4 | 8601.8 |

## Picture review and reproducibility

[Overview](overview.png), [bank samples](banks.png), [four palettes with tail/brake lamps](palettes-and-lamps.png)
[frame/hash review](review.json) and [bank grounding audit](ground-check.json). Overview rows follow the table below; each row shows eight yaw directions.
The bank sheet contains all seven banks from −45° to +45° per bike with eight yaw samples. The palette sheet stacks
stock/red/blue/black, tail then brake, eight yaw samples each. The individual LOD sheets contain all 64 yaw
angles at all seven banks, eight images per row. PNGs preserve native texels.

| Vehicle       | Game frame               | All directions and banks by LOD                                                                                                                                                   |
| ------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CB900F_1981   | [PNG](CB900F_1981.png)   | [0](cb900f-1981-lod0.png) · [1](cb900f-1981-lod1.png) · [2](cb900f-1981-lod2.png) · [3](cb900f-1981-lod3.png) · [4](cb900f-1981-lod4.png) · [5](cb900f-1981-lod5.png)             |
| GSX1100SZ     | [PNG](GSX1100SZ.png)     | [0](gsx1100sz-lod0.png) · [1](gsx1100sz-lod1.png) · [2](gsx1100sz-lod2.png) · [3](gsx1100sz-lod3.png) · [4](gsx1100sz-lod4.png) · [5](gsx1100sz-lod5.png)                         |
| GPZ900R_A1    | [PNG](GPZ900R_A1.png)    | [0](gpz900r-a1-lod0.png) · [1](gpz900r-a1-lod1.png) · [2](gpz900r-a1-lod2.png) · [3](gpz900r-a1-lod3.png) · [4](gpz900r-a1-lod4.png) · [5](gpz900r-a1-lod5.png)                   |
| GSX_R750_1985 | [PNG](GSX_R750_1985.png) | [0](gsx-r750-1985-lod0.png) · [1](gsx-r750-1985-lod1.png) · [2](gsx-r750-1985-lod2.png) · [3](gsx-r750-1985-lod3.png) · [4](gsx-r750-1985-lod4.png) · [5](gsx-r750-1985-lod5.png) |
| VMAX1200_1985 | [PNG](VMAX1200_1985.png) | [0](vmax1200-1985-lod0.png) · [1](vmax1200-1985-lod1.png) · [2](vmax1200-1985-lod2.png) · [3](vmax1200-1985-lod3.png) · [4](vmax1200-1985-lod4.png) · [5](vmax1200-1985-lod5.png) |

```sh
npm run road-bike-pictures -- all replace
npm run road-bike-validation
npm run measure -- generate
npm test
```

Picture outputs are under `dist/road-bike-pictures/`; solver traces and the five actual game-renderer PNGs
are under `dist/road-bike-validation/`. `npm test` builds first and generates game PNGs during the road-bike
scenarios. It clears `dist`, so preserve the picture/measurement outputs before running it, or rerun their
commands afterwards. Published review copies live in this directory. No manual PNG painting is required.

The scenario tests load delivered content, start each bike in FREE PLAY, observe changing engine RPM/load
through the audio bridge, check tail/brake state, resolve real rival contact without explosion, recover and reset.
Separate shared-solver scenarios cover every upshift/downshift, stop, restart and both steering directions.
The four-stroke sound documents use two crank revolutions per acoustic cycle; no two-stroke sound is reused.

## Reviewed image results

All 13,440 logical frame sizes (5 × 64 yaw × 7 banks × 6 LODs) have visible pixels, a nonempty shadow
and integral shared sprite/shadow anchors. All 35 authored bank poses use a tire as their support surface;
both tires contact at neutral, with 0–12.1 mm front clearance under banking from the differing tire widths.
That is less than half a native texel. Every complete LOD sheet and the three aggregates were visually reviewed.

All five have four distinct palettes. Neutral rear views retain reserved lamp slot 15 through LOD4;
neutral front views do not expose the rear lamp. LOD5 keeps a visible texel but does not guarantee a lamp texel.
The review JSON hashes match the final saved sprites. A fresh independent CB900F generation reproduced its
sprite and PNG outputs byte-for-byte; the other four were not independently regenerated a second time after
the final bake. The shared procedural regression separately checks deterministic regeneration.

The prior NSR solid sampler defaults were compared across all seven banks without a byte difference.
The extracted sheet helper reproduced all five previous racing sheets. Existing saved vehicle/sprite/sound
files remain unchanged. The common distant-silhouette fix does affect future fresh baking of previously empty
far-LOD cells; it does not retroactively rewrite those saved assets.

The extended measurement observer also reproduced the prior NSR 240-second final speed and braking scalars
exactly. Observations were added around the existing update loop; no shared physics code was changed.

## Final verification

On Node 24.19.0 / npm 11.9.0, `npm test` passed lint, formatting, both TypeScript builds,
all four dependency checks, content admission/build and all 139 tests, including the ten new road-bike
scenarios and the latest main's crest-rendering scenarios. The five game frames above come from this run.
`npm run measure -- generate` reported no pending measurements, removals or report changes.

The numeric audit matched all 398 mechanics/sound values to the CSV. The saved solver report's input
hashes match the final mechanics and common driving definition. The existing 30 m/s brake-plan agreement
check passes without a tolerance change: GPZ900R's observed distance is 3.245% above its steady plan,
and GSX-R750's is 4.421% above. These comparisons are model consistency checks, not historical validation.

All 65 baseline content files outside the 15 regenerated non-series line products remain byte-identical,
including every existing vehicle, listing, saved sprite and sound, the common driving definition,
FREE PLAY/series rules and TSUKUBA line/reference times. The 15 line products retain their geometry
and all existing vehicle comparison rows; only the five new vehicle rows are added. Existing loudness
records are also unchanged. This addition makes no changes under `src/`.
