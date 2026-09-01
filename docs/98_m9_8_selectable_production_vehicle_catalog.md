# M9.8 — Selectable Production Vehicle Catalog

Status: current normative vehicle identity, compiled-profile, browser vehicle-selection and generic
vehicle-presentation-family authority. Handling remains `DEV_UNCALIBRATED`.

## 1. Scope and supersession

M9.8 replaces M9.1's six abstract `FR / MR / RR / AWD / BIKE1 / BIKE2` selectable profiles with
nine explicitly identified production vehicles. It supersedes M9.1 only for selectable profile
identity, the former shared four-car package, the six-entry vehicle selector, player default and
rival profile identity. It preserves M9.1's common HUD boundary, exclusive pedal arbitration,
normalized front/rear drive-torque primitive and presentation-only `18:1` handwheel conversion.

M9.8 preserves the M9.0 common Two-Station Arcade Vehicle Dynamics solver, M9.5 tire comparison
state, M9.7 bounded zero-DC steering law and its three adjustable steering values. No vehicle-name,
manufacturer, model, identifier, market or product-list branch enters the solver.

## 2. Architecture decision gate

1. Product vehicle identity and selection belong to one catalog above compiled mechanics.
2. `ArcadeVehicleProfile`, its compiler, the normalized drive split and automatic powertrain
   already express every mechanical difference required by this milestone.
3. Catalog metadata is not duplicated inside the physics profile. The catalog references exactly
   one compiled profile per entry; keyboard, touch, HUD and defaults derive from that catalog.
4. The solver gains no vehicle-specific branch. Generic car/bike programmer art uses one explicit
   presentation-family field, never an identifier prefix or model-name test.
5. Real differences are ordinary authored profile data. The product rule keeps one common
   normalized tire law until later tire research is approved.
6. World-space physics, chainage renderer depth, fixed metric presentation, open runtime and
   topology invariants are unchanged.
7. Catalog-shape, exact key mapping, common-tire, distinct-mechanics, presentation-family,
   retirement, integration and steering-envelope regressions protect the boundary.

## 3. Canonical catalog schema and list

The canonical data roles are separate:

```text
manufacturer + official model/variant
identifier (optional; official and short display forms)
selected specification list
specification period
physics anchor (model year and market)
compiled profile reference
selection presentation
```

Codes are not appended to `model`. The one-line renderer alone formats:

```text
Manufacturer Model (Identifier) — Specification (Period)
```

If a code already occurs as a model token, the formatter does not repeat it. The authoritative
catalog and selected physics anchors are:

| # | Manufacturer / model | Identifier | Selected specification | Period | Physics anchor |
|---:|---|---|---|---|---|
| 1 | Ferrari Testarossa | Tipo F110 | 5-bolt wheels | 1988½–1991 | 1989 European/ROW |
| 2 | Porsche 911 Turbo 3.3 | Type 930 | G50/50 5-speed | 1989 | 1989 European/ROW |
| 3 | Chevrolet Corvette | C4 | L98; ZF 6-speed; pre-facelift | 1989–1990 | 1989 US |
| 4 | Volkswagen Golf GTI 16V | Mk2 | small bumpers | 1986–1989 | 1988 European/ROW |
| 5 | Lancia Delta HF Integrale | — | 8V; 185 PS | 1988–1989 | 1988 European/ROW |
| 6 | Honda VFR750R | RC30 | — | 1987–1990 | 1988 ROW full-power |
| 7 | BMW R 80 G/S Paris-Dakar | — | — | 1984–1987 | 1985 European/ROW |
| 8 | Harley-Davidson FXRT Sport Glide | FXRT | Evolution 1340 | 1984–1992 | 1988 US |
| 9 | Vespa PX 200 E Arcobaleno | VSX1T | 200 cc full-power | 1983–1997 | 1985 Italian/European |

`src/vehicle/vehicle-catalog.ts` owns this product list. `src/physics/vehicle-profiles.ts` owns only
compiled mechanics and the stable internal profile IDs.

## 4. Common tire boundary

All nine profiles deliberately share only the current preset-1 normalized reference tire law:

```text
muRef                       = 1.35
rhoKnee                     = 0.74
lowSpeedRegularization      = 1.0 m/s
frontNormalizedStiffness    = 9.0
rearNormalizedStiffness     = 10.5
```

This means equal normalized force shape and reference friction, not equal tires in every physical
sense. Vehicle-specific wheel radius, wheel inertia and static load remain distinct. Compiled
absolute corner stiffness is still derived from each station's own static load. M9.5 vehicle-
instance tire presets continue to multiply the unchanged compiled reference law and preserve their
existing keys, touch UI and HUD authority.

The common tire is an explicit provisional product simplification. It is not a claim that a PX200,
RC30 and Testarossa used interchangeable real tires.

## 5. Mechanical profile contract

Every catalog entry owns distinct authored values for ready-to-drive mass, yaw/pitch inertia,
front/rear CG-to-axle distance, desired CG height, suspension, wheel geometry/inertia, brake
capacity, drag and automatic-shifted powertrain. Drive layout remains one fixed scalar:

```text
frontDriveTorqueFraction = 0       rear drive
frontDriveTorqueFraction = 1       front drive
frontDriveTorqueFraction = 0.47    Delta nominal 47:53 fixed split
```

Dynamic center-differential behavior is outside M9.8. The Delta therefore consumes the existing
fixed split rather than introducing a drivetrain mode or lower-layer exception.

The existing automatic shift controller consumes real-model gear ratios and final drive. It does
not imply that the selected road vehicle had an automatic transmission. The generic launch
regularizer is consequently named `launchCouplingSlipRpm`, replacing the misleading retired
`torqueConverterSlipRpm`; it represents reduced clutch/coupling take-up in this automatic-shifted
gameplay abstraction.

## 6. Mass, source and derivation ledger

Profile mass uses one consistent convention:

```text
ready-to-drive vehicle mass + 75 kg operator
```

Where only dry or kerb figures are available, fluids/fuel are normalized explicitly before the
operator is added. The resulting compiled masses are `1625 / 1410 / 1565 / 1080 / 1290 / 276 /
280 / 380 / 190 kg` in catalog order.

The following are source anchors, not claims that every interpolated profile value was factory-
published:

- Ferrari 1988 Testarossa owner's manual: 2550 mm wheelbase, engine anchors and factory gear/final
  ratios. The five-bolt period identity follows the cited 1988½ specification.
- Porsche official Turbo generation/classic material: 1989 300 PS/412 Nm and G50/50 five-speed;
  factory workshop data anchors its ratios.
- GM 1989 Corvette vehicle information kit: L98/ZF model-year identity; ZF ratios and 3.45 final
  drive use GM model data.
- Volkswagen Newsroom Golf II GTI profile: 2475 mm wheelbase, 139 PS 16V and 1986 introduction;
  the 2Y five-speed set anchors gearing.
- Lancia Delta HF Integrale handbook: gear/final ratios and nominal 47:53 split; the 185 PS 8V
  identity supplies the engine anchor.
- Honda's 1987 VFR750R release: RC30 identity, 1410 mm wheelbase, 201 kg wet mass, torque and exact
  primary/secondary/six-speed ratios; the catalog chooses the 1988 ROW full-power curve.
- BMW Group Classic and BMW GS history: 797.5 cc, 50 PS, 1465 mm wheelbase family and 205 kg
  Paris-Dakar ready-to-drive anchor.
- Harley-Davidson service/model material anchors FXRT/Evolution identity; public period data are
  incomplete, so exact mass distribution, curve and ratio interpolation remain provisional.
- Piaggio history and original VSX1T owner-manual data anchor PX/Arcobaleno identity, 198 cc,
  12 bhp class, dry mass, 10-inch wheels and four total gear ratios.

Primary/reference URLs used for the profile ledger:

- `https://manualzz.com/doc/55732457/ferrari-1988-testarossa--testarossa-owner-s-manual`
- `https://newsroom.porsche.com/en/press-kits/50-years-porsche-turbo/The-911-Turbo-generations.html`
- `https://www.gm.com/content/dam/company/no_search/heritage-archive-docs/vehicle-information-kits/chevrolet/1989-Chevrolet-Corvette.pdf`
- `https://www.volkswagen-newsroom.com/en/vehicle-data-golf-2-gti-profile-19503`
- `https://manualzz.com/doc/24712249/lancia-delta-hf-integrale-automobile-user-manual`
- `https://global.honda/jp/news/1987/2870724.html`
- `https://www.bmwgroup-classic.com/de/modelle/bmw-motorrad-klassiker/product-description-page.md-637-1.bmw-r-80-g-s.html`
- `https://serviceinfo.harley-davidson.com/sip/`
- `https://www.scooterhelp.com/manuals/VSX1T.manual/p200.owner.pdf`

Derived/estimated rather than directly published values are: CG longitudinal decomposition from
available weight-distribution evidence, CG height, yaw/pitch inertia, ride frequencies, damping,
bump/travel limits, wheel inertia, brake torque, quadratic drag, continuous torque-curve points,
engine response and launch-coupling slip. These are transparent engineering seeds under
`DEV_UNCALIBRATED`; they must not later be described as factory specifications.

## 7. Browser selection, default, HUD and rivals

Keyboard selection in catalog order is:

```text
Q W E R A S D F V
```

Touch renders the same catalog as a 3×3 grid with short labels. The compact HUD shows the active
canonical full line only; it does not concatenate nine choices into the 320×240 driving view.
Ferrari Testarossa is the player default in all three composition roots.

Rivals use that same explicitly selected Testarossa profile for M9.8. Rival-profile variety is a
future composition decision. The rival controller and physics solver remain general, but M9.8
does not claim a recovery-free AI validation for all nine profiles and every circuit.

Generic player/rival art remains the existing `CAR` or `BIKE` programmer-art family at the frozen
2.0 m/80 px presentation metric. Real body width, unique silhouettes, motorcycle lean physics and
vehicle-specific art are outside this milestone. Presentation family is explicit catalog/profile
metadata; mechanics never consumes it.

## 8. Adjustable parameters and non-goals

M9.8 adds no new runtime tuning selector. The only adjustable steering parameters remain M9.7's:

```text
yaw-transient gain
yaw-washout time
symmetric steering traversal
```

The M9.5 tire preset remains a separate DEV selector. Mass, geometry, gearing, torque curves,
drive split, wheel values, brakes, drag, rack allocation and source anchors are compiled profile
authority, not live tuning UI.

M9.8 does not add manual shifting/clutch, boost state, engine braking, dynamic AWD, physical
motorcycle lean, unique collision width, unique vehicle art or vehicle-specific tire laws.

## 9. Executable acceptance

Regression must prove:

1. exact nine-entry metadata roles, ordering, periods and keys;
2. canonical formatting without identifier duplication;
3. exactly one normalized tire law across all nine while mass/inertia/powertrain remain distinct;
4. browser and touch selection derive from the catalog and default to Testarossa;
5. generic sprite family derives from explicit `presentationFamily`, never an ID/name prefix;
6. retired six-profile exports and `torqueConverterSlipRpm` do not exist;
7. every profile compiles and advances through ordinary world-space mechanics;
8. the M9.7 steady/deep steering envelope covers all nine profiles;
9. the fixed product rival completes retained integrated course probes without a profile branch;
10. the complete repository suite and exact-head release contract pass.

Because player body pitch is physical input to the retained camera, changing the default compiled
vehicle can shift deterministic TerrainLine/LOD and player-sprite workload counts without changing
renderer architecture. M9.8 therefore re-records the M5.8/M5.9 exact observed workload baselines
for the Testarossa default; the derived budgets and all frozen renderer rules remain unchanged.
