# Measured validation

These observations use the existing solver and the fixed conditions embedded in [measurements.json](measurements.json).
They are game outcomes from provisional vehicle data, not measured performance of real examples. The acceleration run lasts 240 s; its final speed is not asserted as an equilibrium unless the final samples support that conclusion.

| Vehicle               | 0–100 s |     0–200 s | Final km/h | Final gear | 100–0 m | 100–0 s |
| --------------------- | ------: | ----------: | ---------: | ---------: | ------: | ------: |
| PORSCHE_928_S4_1987   |    5.62 |       19.52 |      270.8 |          5 |   35.54 |    2.52 |
| TURBO_ESPRIT_1984     |    5.70 |       24.02 |      241.5 |          5 |   36.33 |    2.58 |
| COUNTACH_5000_QV_1985 |    4.15 |       13.25 |      284.5 |          5 |   35.58 |    2.52 |
| 911_TURBO_3_3_1986    |    5.25 |       18.68 |      260.9 |          4 |   35.94 |    2.55 |
| FERRARI_GTO_1985      |    3.60 |       11.83 |      302.2 |          5 |   36.12 |    2.55 |
| PORSCHE_928_S_1984    |    6.28 |       27.15 |      238.2 |          4 |   35.71 |    2.55 |
| TOYOTA_PICKUP_1980    |   11.30 | not reached |      157.3 |          4 |   35.86 |    2.57 |
| FERRARI_F40_1988      |    3.10 |        9.50 |      332.6 |          5 |   36.09 |    2.55 |
| PORSCHE_959_1987      |    3.75 |       12.45 |      320.2 |          6 |   36.06 |    2.57 |
| CORVETTE_C4_1984      |    6.45 |       27.87 |      214.7 |          4 |   35.23 |    2.50 |
| AUSTIN_MINI_850_1964  |   22.63 | not reached |      119.7 |          4 |   37.48 |    2.67 |
| WRANGLER_YJ_1995      |   11.02 | not reached |      163.2 |          4 |   36.14 |    2.57 |
| NOVA_250_1977         |   11.92 | not reached |      172.3 |          3 |   35.28 |    2.50 |
| NOVA_9C1_1977         |    9.48 | not reached |      180.8 |          3 |   34.98 |    2.48 |

All fourteen stopped both after the acceleration run and from a fresh rolling 100 km/h state, restarted, and produced lateral acceleration in both directions without non-finite state. Reaction time is excluded.

The 928 S and the YJ settle in fourth gear under the existing automatic-shift rule in this flat full-throttle run; their fifth ratios exist but are not reached in this observation. No new shift rule or force was added to make them use top gear. The C4 has only the four base gears represented: its overdrive limitation is documented in the [owning ledger](../chase-turbo-vehicles.md).

Acceleration differs from period road tests because mass, curve shape, tires and drag are partly estimated and the game uses shared launch assistance and instantaneous shifts. Published 0–100 times were not used to tune hidden per-car multipliers.

## Picture review

The [complete overview](overview.png), [CHASE H.Q. selections](chase-hq.png) and [Turbo OutRun additions](turbo-outrun.png) show eight sampled directions at native sprite scale. Each row is labelled with its runtime ID. The Porsche 959 of 1987, the 928 S4 of 1987 and the F40 of 1988 are not among them: their pictures are baked from K's models ([Model solids](../image-assets.md#model-solids)).

| Vehicle               | Eight directions                 | Colors and brake lamps                              | All 64 directions by LOD                                                                                                                                                                                                          |
| --------------------- | -------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TURBO_ESPRIT_1984     | [PNG](turbo-esprit-1984.png)     | [PNG](turbo-esprit-1984-palettes-and-lamps.png)     | [0](turbo-esprit-1984-lod0.png) / [1](turbo-esprit-1984-lod1.png) / [2](turbo-esprit-1984-lod2.png) / [3](turbo-esprit-1984-lod3.png) / [4](turbo-esprit-1984-lod4.png) / [5](turbo-esprit-1984-lod5.png)                         |
| COUNTACH_5000_QV_1985 | [PNG](countach-5000-qv-1985.png) | [PNG](countach-5000-qv-1985-palettes-and-lamps.png) | [0](countach-5000-qv-1985-lod0.png) / [1](countach-5000-qv-1985-lod1.png) / [2](countach-5000-qv-1985-lod2.png) / [3](countach-5000-qv-1985-lod3.png) / [4](countach-5000-qv-1985-lod4.png) / [5](countach-5000-qv-1985-lod5.png) |
| 911_TURBO_3_3_1986    | [PNG](911-turbo-3-3-1986.png)    | [PNG](911-turbo-3-3-1986-palettes-and-lamps.png)    | [0](911-turbo-3-3-1986-lod0.png) / [1](911-turbo-3-3-1986-lod1.png) / [2](911-turbo-3-3-1986-lod2.png) / [3](911-turbo-3-3-1986-lod3.png) / [4](911-turbo-3-3-1986-lod4.png) / [5](911-turbo-3-3-1986-lod5.png)                   |
| FERRARI_GTO_1985      | [PNG](ferrari-gto-1985.png)      | [PNG](ferrari-gto-1985-palettes-and-lamps.png)      | [0](ferrari-gto-1985-lod0.png) / [1](ferrari-gto-1985-lod1.png) / [2](ferrari-gto-1985-lod2.png) / [3](ferrari-gto-1985-lod3.png) / [4](ferrari-gto-1985-lod4.png) / [5](ferrari-gto-1985-lod5.png)                               |
| PORSCHE_928_S_1984    | [PNG](porsche-928-s-1984.png)    | [PNG](porsche-928-s-1984-palettes-and-lamps.png)    | [0](porsche-928-s-1984-lod0.png) / [1](porsche-928-s-1984-lod1.png) / [2](porsche-928-s-1984-lod2.png) / [3](porsche-928-s-1984-lod3.png) / [4](porsche-928-s-1984-lod4.png) / [5](porsche-928-s-1984-lod5.png)                   |
| TOYOTA_PICKUP_1980    | [PNG](toyota-pickup-1980.png)    | [PNG](toyota-pickup-1980-palettes-and-lamps.png)    | [0](toyota-pickup-1980-lod0.png) / [1](toyota-pickup-1980-lod1.png) / [2](toyota-pickup-1980-lod2.png) / [3](toyota-pickup-1980-lod3.png) / [4](toyota-pickup-1980-lod4.png) / [5](toyota-pickup-1980-lod5.png)                   |
| CORVETTE_C4_1984      | [PNG](corvette-c4-1984.png)      | [PNG](corvette-c4-1984-palettes-and-lamps.png)      | [0](corvette-c4-1984-lod0.png) / [1](corvette-c4-1984-lod1.png) / [2](corvette-c4-1984-lod2.png) / [3](corvette-c4-1984-lod3.png) / [4](corvette-c4-1984-lod4.png) / [5](corvette-c4-1984-lod5.png)                               |
| AUSTIN_MINI_850_1964  | [PNG](austin-mini-850-1964.png)  | [PNG](austin-mini-850-1964-palettes-and-lamps.png)  | [0](austin-mini-850-1964-lod0.png) / [1](austin-mini-850-1964-lod1.png) / [2](austin-mini-850-1964-lod2.png) / [3](austin-mini-850-1964-lod3.png) / [4](austin-mini-850-1964-lod4.png) / [5](austin-mini-850-1964-lod5.png)       |
| WRANGLER_YJ_1995      | [PNG](wrangler-yj-1995.png)      | [PNG](wrangler-yj-1995-palettes-and-lamps.png)      | [0](wrangler-yj-1995-lod0.png) / [1](wrangler-yj-1995-lod1.png) / [2](wrangler-yj-1995-lod2.png) / [3](wrangler-yj-1995-lod3.png) / [4](wrangler-yj-1995-lod4.png) / [5](wrangler-yj-1995-lod5.png)                               |
| NOVA_250_1977         | [PNG](nova-250-1977.png)         | [PNG](nova-250-1977-palettes-and-lamps.png)         | [0](nova-250-1977-lod0.png) / [1](nova-250-1977-lod1.png) / [2](nova-250-1977-lod2.png) / [3](nova-250-1977-lod3.png) / [4](nova-250-1977-lod4.png) / [5](nova-250-1977-lod5.png)                                                 |
| NOVA_9C1_1977         | [PNG](nova-9c1-1977.png)         | [PNG](nova-9c1-1977-palettes-and-lamps.png)         | [0](nova-9c1-1977-lod0.png) / [1](nova-9c1-1977-lod1.png) / [2](nova-9c1-1977-lod2.png) / [3](nova-9c1-1977-lod3.png) / [4](nova-9c1-1977-lod4.png) / [5](nova-9c1-1977-lod5.png)                                                 |

[Sprite review](review.json) records each saved sprite hash, yaw/bank dimensions and per-LOD transparency/lamp counts. The smallest LOD follows the existing baker and can omit a brake-lamp pixel. All larger rear-facing views use the reserved brake color; body recolors preserve windows, trim, lamps and wheels.

Reproduction commands and source limitations are in the [owning ledger](../chase-turbo-vehicles.md).
