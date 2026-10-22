# Five racing vehicles — adopted specification

This ledger owns the five authored racing-vehicle selections and their evidence, not the shared physics contract.
All five are selectable in FREE PLAY. No series or RACING HERO course is added. The owner's clarified scope is
**vehicle data, provisional pictures and sound, and contact explosion/recovery only**. Other physics additions need
prior confirmation. Downforce, timed shifts, transient boost, clutch heat/wear/durability and fuel consumption are
not implemented. Existing automatic shifts, launch assistance, torque protections and constant mass are game aids,
not historical equipment. In particular, these F1 cars do **not** reproduce high-speed aerodynamic cornering loads.

The [numeric ledger](racing-vehicles/numeric-ledger.csv) maps every numeric mechanics and sound field to its
original value/unit, source section, selected condition, adopted value/unit, conversion, confidence and uncertainty.
Its four confidence labels are **source verified**, **calculated**, **engineering estimate**, and **game design**.
A source beside an estimate provides vehicle context, not verification of that estimate. Calculations retain the
uncertainty of their inputs. Authored JSON remains the runtime authority; this CSV is an audit, never a second loader.
[Validation](racing-vehicles/validation.md) records the full-solver measurements and generated-picture review.

## One selection per vehicle

| ID / display                          | Fixed identity and body                                                                                                                            | Dry setup and historic transmission                                                                             | Fixed test mass                                                                                    |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `NSR500_1987` / Honda NSR500          | 1987 Wayne Gardner, Rothmans Honda, yellow #2 plates; Japan GP **setup estimate** based on the 1987 museum body, not a claimed Japan GP photograph | Slicks, steel disc brake estimate, 6-speed sequential foot shift, chain rear drive; one authored six-ratio set  | 125 kg dry + 7 fluids + 12 fuel + 78 rider/equipment = **222 kg**                                  |
| `YZR500_0W98` / Yamaha YZR500         | 1988 Eddie Lawson, Marlboro Yamaha, #3; US GP dry **setup estimate**, before the reported British carbon-brake introduction                        | Slicks, steel discs; 6-speed sequential foot shift; right lower exhausts and arched right rear arm              | 124 kg dry + 6 fluids + 12 fuel + 78 rider/equipment = **220 kg**                                  |
| `MCLAREN_MP4_4` / McLaren Honda MP4/4 | 1988 Ayrton Senna #12, Italian GP body target; low rear wing incidence approximated from team photographs, exact Monza dimensions unverified       | Slicks; carbon discs; six manual forward gears, conventional clutch; low three-shaft layout is not three speeds | 540 kg secondary-source base + 10 operating allowance + 20 fuel + 75 driver/equipment = **645 kg** |
| `FERRARI_640` / Ferrari 640 / F1-89   | 1989 Nigel Mansell #27, Belgian GP later high-airbox body; **dry practice setup**, not the wet race tires in the reference photos                  | Slicks; carbon discs; seven electrohydraulic semi-automatic forward gears, steering-wheel commands; no DCT      | 505 kg manufacturer “with liquids” + 30 fuel + 80 driver/equipment = **615 kg**                    |
| `LOTUS_79_SPECIAL` / Lotus 79 SPECIAL | 1978 Mario Andretti #5, black/gold JPS, Dutch GP exterior **setup estimate**; long sidepods, skirts, exposed wheels, front/rear wings              | Slicks, steel disc estimate; project **two actual forward gears**, rear drive; contact explosion                | 575 kg base + 10 fluids + 30 fuel + 80 driver/equipment = **695 kg**                               |

The GP choices pin one authored configuration; they do not establish inaccessible GP-specific gear sheets or wing
angles. All fuel and occupants stay fixed. Bike fuel is an estimated 16 L × 0.75 kg/L; the cars use fixed fuel mass
without claiming a fuel density. McLaren's 540 kg source does not state its weighing condition; the extra 10 kg is an
explicit conservative operating allowance. Ferrari's 505 kg already includes operating liquids: no extra coolant/oil
is added. Treating it as excluding the selected fuel and driver is an **assumption**, because the source does not
resolve their inclusion. None of these masses is a claim of a measured car at the named GP.

## Sources and conflicting evidence

Sources below were read on 2026-10-22. A modern archive or museum caption is not a second independent contemporary
measurement. No external reference photograph is included in the game assets; the provisional shapes are original code.

| Reference                                                                                                                                                                                                               | Observed evidence and limit                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Repsol, NSR500 engine evolution](https://www.boxrepsol.com/en/technology/the-honda-nsr500-engine-evolution/), heading “NSR 5000 engine 1987”                                                                           | 499 cc, 112° two-stroke V4, **156 hp at 13,000 rpm**, four 36 mm Keihin carburetors, reversed crank rotation and reversing shaft. “hp” is not defined; text mixes languages. Adopt **156 PS = 114.737805 kW** as a conservative engineering interpretation, not a verified unit. 156 mechanical hp would be 116.329180 kW. Later 1990 paired firing and 1992 Big Bang statements are not 1987 ignition data.                                            |
| [Honda NSR500 1987 photograph](https://commons.wikimedia.org/wiki/File:Honda_NSR500_1987.jpg) and [Collection Hall photograph](https://commons.wikimedia.org/wiki/File:Honda_NSR500_in_the_Honda_Collection_Hall_3.JPG) | Gardner #2, yellow plates, white/blue Rothmans body, red/gold bands, white wheels, metal frame, low and raised exhaust outlets. Museum photographs establish this provisional year's body; no specific GP or internal dimensions follow from them.                                                                                                                                                                                                      |
| [Yamaha 0W98 archive](https://global.yamaha-motor.com/race/wgp-50th/race_archive/machines/yzr500_0w98/), Specifications and Development                                                                                 | **499 cc, 150 PS**, 70° V4, crankcase reed inlet. No power RPM is stated. Lower front-pair exhausts cross under the engine to the **right**; right rear arm arches upward. Carbon brakes introduced at round 12 British GP on Rainey's machine: not proof Lawson used them at every round.                                                                                                                                                              |
| [Yamaha photograph 03](https://global.yamaha-motor.com/race/wgp-50th/race_archive/machines/yzr500_0w98/img/pic_gallery_yzr500_0w98_03.jpg)                                                                              | Lawson's red/white #3 and helmet; red wheels. Archive photos 01/02 show Lucky Strike #1 and serve only as structural references, never the selected livery.                                                                                                                                                                                                                                                                                             |
| [McLaren MP4/4 heritage](https://www.mclaren.com/racing/heritage/cars/1988-formula-1-mclaren-mp4-4/)                                                                                                                    | RA168E 1.5 L V6 turbo, 150 L, sometimes over **700 bhp**. Its **2.8 bar** conflicts with the period report's 2.5 bar; it is not silently accepted. Team image supplies low body, white/red colors and Senna's yellow helmet, not proof of an Italian-GP-specific photograph or sponsor lettering.                                                                                                                                                       |
| [David Hebb, “Formula for Success: The Honda RA168E”](https://www.motorsportmagazine.com/archive/article/july-1990/80/formula-for-success-the-honda-ra168e/), Motor Sport July 1990, p80                                | Reports Honda technical work: **685 (metric) bhp at 12,500 rpm by the end of 1988**, 313 ft lb at 10,000 rpm, over 295 ft lb from 8,000 to 12,000; 79 × 50.8 mm, 9.4:1, 2.5 bar and 150 L, IHI turbochargers, cast-iron block/aluminium heads, four valves. The explicit “metric” resolves **685 PS = 503.816644 kW**. Season-end output is not verified Italian GP output. “Safe at 13,500” is not a specified race redline; 13,000 here is estimated. |
| [Ultimatecarpage MP4/4 specifications](https://www.ultimatecarpage.com/spec/343/McLaren-MP4-4-Honda.html), Dimensions/Chassis                                                                                           | 4394 × 2134 × 940 mm, wheelbase 2875 mm, tracks 1824/1670 mm, 540 kg, six manual forward speeds. Secondary evidence; its RA186-E typo, 900 bhp and aluminium-block claims are rejected against the period technical report. The 80° bank is also listed here; the low three-shaft gearbox architecture follows the selected design brief, with Honda's detailed page inaccessible. GP conditions and weight basis unspecified.                          |
| [Ferrari F1-89](https://www.ferrari.com/en-EN/formula1/f1-89), Technical Specifications                                                                                                                                 | Tipo 035/5, **3497.96 cc, 65° V12, 84 × 52.6 mm, 11.5:1, 441 kW (600 hp) at 12,500**, five valves, injection, dry sump, multi-plate clutch, seven electrohydraulic forward gears plus reverse, 505 kg “with liquids”, 192 L; tires 25.0-10.0-13 / 26.0-15.0-13. Use unambiguous **441 kW**, not an assumed meaning of hp.                                                                                                                               |
| [Ferrari, Mansell's gears](https://www.ferrari.com/en-GW/history/moments/1989/mansells-gears/more)                                                                                                                      | Right upshift / left downshift and conventional electrohydraulic gearbox. Its 600 bhp / 12,000 rpm differs from the technical page; preserve the conflict. The hero photo has a later high airbox despite the Brazil subject. A separate photo shows the 1979 312T3 experiment and is not a 640 reference.                                                                                                                                              |
| [Mansell, 1989 Belgian GP 1](https://commons.wikimedia.org/wiki/File:Nigel_Mansell_1989_Belgian_GP_1.jpg), [GP 2](https://commons.wikimedia.org/wiki/File:Nigel_Mansell_1989_Belgian_GP_2.jpg)                          | Later high airbox, red body, black wings, white #27, red/white/blue helmet. Photographs show **wet** tires/road; body reference only. The authored dry tires and wing/gear setup are estimates, not a claimed wet race replication. No 639 prototype or 1990 641 shape is used.                                                                                                                                                                         |
| [Lotus Type 79](https://www.lotuscars.com/en-US/lotus-story/race-cars/type-79) and [Classic Team Lotus register](https://classicteamlotus.co.uk/en/about/team-lotus-register-2/type-79/)                                | 1978 JPS identity, ground-effect history, longer venturis, side skirts, one inboard tank; current official side image shows Andretti #5 black/gold body. The former media.lotuscars.com technical URL redirects to this history page, which no longer exposes the supplied 480 bhp / gearbox table. Those old-page values remain **unverified historical reference**, not newly verified specifications.                                                |
| [Cosworth heritage](https://cosworth.com/news/cosworth-to-celebrate-more-than-six-decades-of-heritage-at-goodwood-revival/)                                                                                             | DFV 3 L / 90° V8 basis; not a 1978 Lotus power or gearing sheet.                                                                                                                                                                                                                                                                                                                                                                                        |

The supplied Honda WGP/RACERS/MP4/4/RA168E pages returned branded HTTP 403 in this environment. They were **not read**
and are not counted as confirmation. The supplied Namco interview redirected to maintenance; the Atari II PDF mirror
was a scan without extractable text. Two forward gears and contact explosion are the owner's game design requirements, not a
new claim that POLE POSITION I/II depicts a Lotus 79 or that its displayed speed equals real road speed.

## Engine and chassis assumptions

| Item                           | NSR500 1987                                                                                                               | YZR500 0W98                                                                                                              | MP4/4                                                                           | F1-89 / 640                                                         | Lotus 79 SPECIAL                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Cycle / layout                 | 2-stroke, 112° V4                                                                                                         | 2-stroke, 70° V4                                                                                                         | 4-stroke, 80° V6 twin turbo                                                     | 4-stroke, 65° V12 NA                                                | 4-stroke, 90° V8 NA, DFV basis                                                                    |
| Bore × stroke                  | 54 × 54.47 mm estimate consistent with 499 cc                                                                             | 56 × 50.65 mm estimate consistent with 499 cc                                                                            | 79 × 50.8 mm reported; calculated geometry gives 1494.03 cc, adopt nominal 1494 | 84 × 52.6 mm reported; nominal 3497.96 cc                           | 85.67 × 64.9 mm estimate gives about 2993 cc                                                      |
| Intake / exhaust control       | Four 36 mm carbs; reed-valve intake and exhaust-port control are unverified year-specific details; no separate simulation | Verified crankcase reed; carb size and exhaust-control schedule unverified; no separate simulation                       | Fuel injection, two IHI turbos; static net torque only                          | Weber-Marelli injection, five valves/cylinder                       | Mechanical injection and four valves/cylinder are DFV architecture assumptions; game torque curve |
| Crank / timing                 | Single crank; 180° pin/bank-offset acoustic approximation, **not verified ignition order**, no later Big Bang             | Twin-crank arrangement not verified by the cited archive; evenly spaced acoustic approximation, no claimed crank phasing | Evenly spaced acoustic events; crank-pin geometry/firing order unverified       | Evenly spaced V12 acoustic events; cylinder firing order unverified | Flat-plane DFV basis assumed; even events, cylinder order unverified                              |
| Compression                    | Estimated 11:1 geometric, not trapped ratio                                                                               | Estimated 11:1 geometric, not trapped ratio                                                                              | Verified 9.4:1 geometric                                                        | Verified 11.5:1 geometric                                           | Estimated 11.5:1 geometric                                                                        |
| Clutch / differential          | Dry multi-plate estimate; no differential                                                                                 | Dry multi-plate estimate; no differential                                                                                | Multi-plate race clutch / limited-slip differential estimate                    | Manufacturer multi-plate clutch; differential setting unverified    | Multi-plate race clutch / limited-slip differential estimate                                      |
| Suspension                     | Telescopic fork / rear linkage monoshock estimate                                                                         | Telescopic fork / rear linkage monoshock estimate                                                                        | Double wishbone/inboard spring-damper approximation                             | Double wishbone/inboard spring-damper approximation                 | Double wishbone/inboard spring-damper approximation                                               |
| Tire outside radii, front/rear | 0.300 / 0.318 m estimates                                                                                                 | 0.300 / 0.310 m estimates                                                                                                | 0.305 / 0.322 m estimates                                                       | 0.3175 / 0.3302 m, nominal 25/26 inches × 0.0254 / 2                | 0.305 / 0.323 m estimates                                                                         |

Bore/stroke and layout annotations do not create unsupported mechanics fields. Four-stroke compression is geometric;
two-stroke trapped compression, scavenging, exhaust-port motion, boost dynamics, differential locking and individual
wishbones are unrepresented. MP4/4's 2.5 bar is historical context: no pressure computation assumes absolute or gauge
pressure. The common solver has two axle stations, not four independently suspended F1 corners. Steel/carbon brake
identities are body/setup annotations; the game uses authored torque capacities, without temperature or material models.

The primary and chain reductions are multiplied **once** into the bikes' `finalDriveRatio`: NSR 1.8 × 3.0 = 5.4,
YZR 1.6 × 3.0 = 4.8 (all estimated). Car primary reduction is 1 and their final ratios are 4.0, 4.0, 3.6 respectively.
The game's 0.9 driveline efficiency is applied once by the existing solver. Torque data are engine torque, not wheel torque.
The real manual / semi-automatic operating method is documented above; all five use the unchanged automatic game aid,
with instantaneous shifts. Ferrari shift interruption and clutch transients are explicitly outside the clarified scope.

All five torque curves have five positive points: idle A, low-band B, unique maximum torque C, true maximum power D,
and redline E. The runtime linearly interpolates torque; checking only the five power values is insufficient, so the
validation evaluates the stationary point of `rpm × (a*rpm+b)` within each segment too. The YZR's adopted 11,500 rpm
power speed is an engineering estimate; **150 PS does not determine it**. Honda's and Yamaha's estimated low-band
curves are continuous and nonzero. Their modest differences are estimates, not a sourced “straight vs cornering” bonus.

`frontAxle + rearAxle` gives wheelbase. Static front fraction is `rearAxle / wheelbase`. Inertias use estimated mass
radii `k = sqrt(I/m)`; wheel inertia uses equivalent rotating mass `I/r²`. Spring rate and damping are derived by the
existing compiler from ride frequency, station mass and damping ratio. The numeric ledger records these assumptions;
there are no hidden vehicle-ID multipliers. Ordinary tires use peak longitudinal slip 0.05, calibrated so wheelspin
can settle before the existing rolling-speed shift threshold/fuel-cut gap. Lotus uses 0.12. These are **game tire
calibration**, not manufacturer measurements. Grip is not raised to impersonate missing downforce.

MP4/4 and Lotus use estimated front/rear axle wheel inertias of 1.2/2.0 kg m², equivalent to about 12.9/19.3 kg
and 12.9/19.2 kg of rotating mass at their adopted radii. These estimates also keep the existing planner-versus-solver
braking check within its unchanged 5% tolerance. They are not period wheel measurements.

## Lotus: historical reference versus project design

| Item                 | Historical reference                                                                                        | Authored SPECIAL                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Identity             | 1978 Type 79 / Andretti #5 / JPS                                                                            | Same provisional body identity; no claim about the original arcade car                                      |
| Engine               | DFV, about 3 L, 90° V8; supplied old official-page claim **480 bhp**, not reverified after redirect         | 2993 cc, **500 kW at 10,500 rpm**, 500 N m at 9000 rpm; game uprating                                       |
| Forward transmission | Supplied old-page reference **Getrag/Lotus five-speed or Hewland FGA 400**, exact chassis/GP fit unverified | **Two actual ratios: 1st 1.8, 2nd 1.0**; possible ratio teeth 36/20 and 30/30; final 36/10 = 3.6            |
| Shift                | Historical manual race gearbox                                                                              | Existing automatic game aid; 11,500 rpm nominal 1→2 shift → 6388.89 rpm with zero-slip ratio calculation    |
| Aero                 | Real ground-effect floor/skirts and wings                                                                   | Same silhouette; drag coefficient `q=0.445 kg/m`, equivalent `CdA=2q/1.225=0.726531 m²`; no downforce model |
| Mass                 | Exact GP weighing condition unverified                                                                      | Fixed 695 kg including selected fuel and driver                                                             |
| Contact              | No historical claim                                                                                         | Every qualifying solid contact begins explosion, even at zero speed                                         |

The 500 kW curve and final ratio were designed around the two-speed gap, not by deleting four gears from an existing
car. Second gear begins in the rising torque band. Strength, heat, wear and manufacturing feasibility of the illustrative
teeth counts are not assessed. The retained launch assist is sufficient; no clutch mechanism was added. The standard numeric gear-position display is retained.

The drag choice represents a provisional low-drag wing/body setting. Because downforce is absent, no corresponding
real ground-effect downforce or high-speed cornering performance is claimed. The historical 480 bhp reference would
be about 357.936 kW if mechanical hp; it is not the SPECIAL's output ceiling. See the validation's single feasibility
table and force/power/speed plots for rolling radius, shift, terminal RPM, available power and losses.

Only the Lotus listing opts into `contactResponse: "explode"`. The [shared contact response](content-and-gameplay.md)
and [audio lifetime](audio.md) own its behavior: 1.2 seconds of blast, stopped through 2.4 seconds, recovery at zero
speed into a free road placement, then 1 second of protection. The clock continues. Continuous contact cannot retrigger;
occupied recovery waits; no gate credit comes from relocation; a new run resets the response and sound sequence.
The other four listings omit the option. Ground, paint, background and timing gates are not solid contacts.

## Reproducible provisional pictures and sound

```sh
npm run racing-pictures -- all replace
npm run contact-explosion
npm run measure -- generate
npm test
```

`tools/graphics/racing-vehicle-shapes.ts` is the complete original shape/color input. Its shape fractions, tube radii,
number glyphs and RGB palette channels are **game design / visual estimates**, not dimensioned historic drawings.
The mechanics documents supply the vehicle envelope, axles, tracks and wheel radii; the product camera supplies the
projection. `tools/build/racing-pictures.ts` uses the existing shared picture baker for **64 yaw directions × 7 banks
(−60° to +60° in 20° steps) on each bike**, and **64 × 1 on each car**, all **six LODs**. No random numbers or external
models are used. Every bank and direction is rendered, not mirrored. Number textures are independently oriented on
each side. Yamaha lower pipes cross beneath the engine and terminate on the right beside the arched right arm.

The four-palette contract is preserved with four identical copies of the one selected livery, all bearing the same
color label. These are compatibility entries, **not four historical liveries**. Brake-lamp classification is empty
and its off/on colors identical; no racing vehicle acquires road-car brake lamps. Body proportions, driver poses,
logos and tiny details remain provisional: color bands and race numbers identify the selected cars; sponsor lettering
is not reproduced. Every shape uses the same ground anchor, lighting, shadow and renderer folding rules as other vehicles.
Six complete direction/bank sheets per vehicle are written to `dist/racing-pictures/<set>-lod0.png` through `lod5.png`.

Each sound has its own authored engine-sound v2 document, using the existing acoustic kernel. The bikes have one
cycle per revolution and four separate primary/chamber/stinger paths, not the four-stroke VFR sound. NSR phases
`0,112/360,180/360,292/360` are an explicit unverified crank/bank approximation; Yamaha's evenly spaced quarter-cycle
events are another approximation. Neither claims an ignition order. Four-stroke events are evenly spaced through two
revolutions: 6 for RA168E, 12 for Tipo 035/5, 8 for DFV. Cylinder-to-collector assignments are estimated. Pipe lengths,
areas and valve/port timing are unmeasured acoustic geometry; straight chamber and turbo-throat tubes omit their
actual dynamics. The engine-loudness measurement is generated with the existing deterministic procedure.
