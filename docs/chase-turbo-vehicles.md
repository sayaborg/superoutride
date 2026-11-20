# CHASE H.Q. and Turbo OutRun vehicle selections and the RX-7 Turbo II of 1987

This ledger owns the fourteen additional vehicle definitions selected from the supplied arcade-vehicle report, and
the [Mazda RX-7 Turbo II of 1987](#mazda-rx-7-turbo-ii-of-1987-sources-versus-authored), authored by its conventions.
The F40 among the fourteen is now [the 1988 European car](#ferrari-f40-of-1988-sources-versus-authored).
It records the chosen real-car specification, the limits of the evidence, the provisional authoring inputs and
validation. Shared physics, images, sound and selection behavior retain their existing owners.

The existing 1989 Porsche 930 and 1989 Corvette C4 remain separate, byte-for-byte unchanged vehicles.
The unidentified box truck is deferred. These fourteen additions bring the selectable catalog from 21 to 35.
They enter existing FREE PLAY car/all pools through catalog membership; no course, series, traffic policy,
pursuit behavior, HUD, gear label or physics mechanism is added. They use ordinary contact and recovery.

**These are provisional vehicle reconstructions, not fourteen fully verified factory simulations.** Published
power and dimension anchors are used where identified below; several gear ratios, masses and much of the
geometry and acoustics still require better primary evidence. The [numeric ledger](chase-turbo-vehicles/numeric-ledger.csv)
classifies every numerical mechanics and sound input. Runtime JSON remains the sole numerical authority;
the ledger is an audit, not an input loader. Do not interpret a precise decimal as measurement precision.

## Fixed identities

| Runtime ID            | Chosen specification                                 | Engine / transmission                                           | Appearance anchor                                                       |
| --------------------- | ---------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| PORSCHE_928_S4_1987   | 1987 MY US 928 S4                                    | M28.41, 4957 cc DOHC 32-valve V8; G28.13 5MT                    | Black, later bumpers, large rear lamps and raised spoiler               |
| TURBO_ESPRIT_1984     | 1984 UK Turbo Esprit, Type 82                        | 910 low-compression 2174 cc carburetted turbo four; Citroen 5MT | White Giugiaro wedge, rear louvers; not the Stevens X180                |
| COUNTACH_5000_QV_1988 | 1988 MY European carburetted 5000 Quattrovalvole     | 5167 cc DOHC 48-valve V12; 5MT                                  | Yellow, rear wing and wide rear tires; not the 25th Anniversary body    |
| 911_TURBO_3_3_1986    | 1986 MY US 911 Turbo 3.3 Coupe                       | 3299 cc air-cooled turbo flat six; 4MT                          | Silver, round headlights, wide rear fenders and tea-tray spoiler        |
| FERRARI_GTO_1985      | 1985 European GTO, Tipo F114                         | F114B, 2855.08 cc twin-turbo flat-plane V8; 5MT                 | Blue arcade recolor, rear-fender slots, paired round rear lamps         |
| PORSCHE_928_S_1984    | 1984 MY US 928 S                                     | M28.19, 4664 cc SOHC 16-valve V8; 5MT                           | Red early body, rubber bumper trim and small spoiler                    |
| TOYOTA_PICKUP_1980    | 1980 MY US 49-state RN42, regular cab, long bed, 2WD | 2189 cc 20R SOHC four; 4MT                                      | Open long bed, separate upright cab, rectangular lamps                  |
| FERRARI_F40_1988      | 1988 European F40, non-catalyst, fixed ride height   | F120-family 2936.25 cc twin-turbo flat-plane V8; 5MT            | Red, high fixed wing, round rear lamps, three exhaust outlets           |
| PORSCHE_959_1987      | 1987 European 959 Komfort, left-hand drive           | 2849 cc twin-turbo flat six; G59.01 G+5 MT, AWD                 | White, covered oval lamps and integrated rear wing                      |
| CORVETTE_C4_1984      | 1984 MY US Base Coupe, 1YY07                         | L83 5733 cc Cross-Fire V8; Doug Nash 4+3                        | Blue early C4, four round rear lamps, no high-mounted stop lamp         |
| AUSTIN_MINI_850_1964  | Early 1964 UK standard Austin Mini 850, A-A2S7       | 848 cc A-series OHV four; 4MT, rubber-cone suspension           | Green, short upright two-door saloon; not a Cooper                      |
| WRANGLER_YJ_1995      | 1995 MY US Wrangler S YJ, soft top                   | 2464 cc MPI four; AX-5 5MT                                      | Tan, rectangular headlights, family cage, rear spare and high stop lamp |
| NOVA_250_1977         | 1977 MY US standard Nova four-door sedan             | L22 4097 cc OHV inline six; 3MT                                 | Light blue four-door body, steel wheels and chrome bumpers              |
| NOVA_9C1_1977         | 1977 MY US Nova four-door COPO 9C1 basis             | LG3 5001 cc OHV V8; game 3MT conversion                         | Black/white police recolor and static roof lights                       |

The supplied report's year choices are selections, not new identifications of the arcade sprites. In particular,
Countach/GTO production-year maxima remain estimates; YJ 1995 postdates the games. The F40 is K's 1988 choice. The 1984
C4 intentionally substitutes a production-volume choice for an arcade appearance that may be 1986 or later.
No annual production count is asserted by these runtime definitions. The 9C1 manual gearbox is explicitly a
game conversion: the supplied police specification called for an automatic in the real car.

Except the 959's and the 928 S4's, the four palettes are game colors, without verified period paint codes. Blue GTO
and the police livery are especially not claims of factory delivery colors. The stock-named palette key means the
default game palette.

## Representation within the current model

- The C4 retains the four base ratios of the 4+3 gearbox. The separate overdrive unit and its engagement logic
  are absent. Consequently this version does not reproduce the real car's overdrive cruising or maximum-speed
  gearing. It is not presented as a seven-speed manual or given an invented fifth gear.
- The 959's G position and five road gears are six ordinary forward gears, shown G and 1–5 by its listing's gear
  names ([below](#porsche-959-of-1987-sources-versus-authored)). Its front drive fraction is a fixed provisional 0.4.
  Dynamic PSK distribution, ride-height control and a separate low-range control are absent.
- The Wrangler is in 2H, using the existing rear-drive model. No transfer-case selector or four-wheel-drive
  mode is introduced. Its family cage is beneath the soft top; no early slanted cage is substituted.
- Existing automatic shifts and launch assistance operate all these manually geared source vehicles. They
  are game behavior, not evidence that the original cars had automatic transmissions or modern traction aids.
- Wings and spoilers are visual geometry only. Turbo engines use steady full-throttle torque envelopes;
  boost transients, downforce, clutch simulation and new control displays are outside this vehicle addition.
- Roof lamps on the police Nova are fixed colored geometry. They do not introduce flashing, sirens or pursuit AI.

## Numerical conventions and remaining uncertainty

Each run has one fixed 75 kg driver and no passengers or cargo. Published curb/ready masses are used as
qualified below; fuel and fluids already in those masses are not added again. For the GTO only,
Ferrari's dry mass is converted using 120 L fuel at an estimated 0.75 kg/L plus 15 kg of other fluids,
then the driver. The F40's 1,235 kg is K's base ([below](#ferrari-f40-of-1988-sources-versus-authored)). Consumption and changing fuel mass are not simulated.

Mass bases before the driver are S4 1590, Esprit 1220, Countach 1490, 930 1335, GTO 1265, early 928 S 1520,
Pickup 1118.1, F40 1235, 959 Komfort 1600 (K's, [below](#porsche-959-of-1987-sources-versus-authored)), C4 1370, Mini 630, YJ 1331, Nova six 1410 and police Nova 1500 kg.
S4 is a factory-table curb anchor; Pickup is 2465 lb converted from the exact long-bed column; C4 and YJ are
rounded secondary curb values. Other non-Ferrari masses remain estimates or uncertain secondary-market
interpretations. They must not be relabelled as verified dry weights.

The five-point engine curve holds the adopted maximum-torque anchor at point 2 and maximum-power anchor
at point 3. Torque at rated power is `kW * 1000 / (rpm * 2*pi/60)`. Intermediate, idle and post-power points
are engineering estimates, not a recovered dynamometer trace. The descending last segment is chosen so the
piecewise-linear curve's maximum power remains at the stated power RPM. Mechanical horsepower uses
0.7457 kW/hp; metric horsepower uses 0.73549875 kW/PS; pound-foot uses 1.355817948 Nm/lb-ft.

Loaded axle distances use an estimated rear mass fraction times wheelbase for the front distance, and its
complement for the rear. Yaw/pitch inertia use the uniform-box estimates `mass*(length²+width²)/12` and
`mass*(length²+height²)/12`. CG heights, loaded tire radii and effective wheel inertias are provisional;
wheel inertias are `25*rFront²` and `27*rRear²`, rounded to 0.001 kg m². These include an assumed rotating
assembly and are not tire-only measured values. Aero uses `quadraticDrag = 0.5*1.225*CdA`, with estimated
CdA, including the Countach's chosen wing configuration. There is no separate aerodynamic lift input.

Suspension retains the existing provisional 1.5 Hz, 0.4 damping ratio and 0.3 m travel values. Brake capacities
are game calibration: total nominal brake force is loaded mass times 11.5 m/s², split 65% front/35% rear,
converted to station torque by its rolling radius and rounded to 25 Nm. Actual braking remains subject to the
unchanged tire, load and protection rules. This is not a reconstruction of period hydraulic brake pressure,
ABS, spring rates, bump travel, tire temperature, handling limits or stopping-distance tests.

The Esprit, 928 S, Countach, 930, Mini, Toyota and Novas still lack a read, exact-year primary gearbox
ratio table. Their provisional ratios are explicit engineering estimates, not borrowed verified facts from
another year. The F40 uses gear pairs 2.769/1.722/1.227/0.963/0.767 and the European effective final reduction
`(30/11)*(28/21)`; the transfer reduction is folded into the existing single final-drive field. The GTO manual's
published ratios already include its transfer gears and therefore must not receive that factor a second time.
The 928 final reductions distinguish US S4 2.20 and 1984 US S 2.36. The S4's gears are the 1987 US G28/13's
4.067/2.714/1.934/1.463/1.000 ([below](#porsche-928-s4-of-1987-sources-versus-authored)), which already include the
gearbox's 33/21 countershaft pair and must not receive it again; the 928 S's intermediate gear set remains
provisional. The 959's six ratios are its G59.01's tooth counts as the stage auditor read them
([below](#porsche-959-of-1987-sources-versus-authored)). The ordinary Nova's exact gearbox/axle option combination
remains unverified.

## Evidence actually consulted

Accessed 2026-10-23 UTC. Search snippets, blocked URLs and unread manuals are not treated as source verification.
The numeric ledger distinguishes `source verified`, `calculated`, `engineering estimate` and `game design`, and for
the 959, the 928 S4 and the F40 of 1988 `source (auditor)`: the stage auditor's reading, not read for the PR that
wrote it ([959](#porsche-959-of-1987-sources-versus-authored), [928 S4](#porsche-928-s4-of-1987-sources-versus-authored),
[F40](#ferrari-f40-of-1988-sources-versus-authored)).
A source-verified secondary value means that page was read, not that it has primary-document authority.

1. **928 S4 factory-table transcription**, [general/engine](https://www.jenniskens.eu/Technical/TechSpecs/TechSpecs1.htm)
   and [dimensions/weights](https://www.jenniskens.eu/Technical/TechSpecs/TechSpecs7.htm). The 1987 US M28.41
   and G28.13 columns supply 4957 cc, 10:1, 235 kW at 6000, 430 Nm at 3000, 6600 rpm, 2500 mm wheelbase,
   4523/1836/1282 mm dimensions, 1551/1546 mm tracks and 1590 kg curb mass. This is an enthusiast-hosted
   transcription of factory data, not a newly authenticated original scan.
2. **1984 US Porsche 928 S owner's manual**, [p97](https://www.manualslib.com/manual/1374320/Porsche-928-S-1984.html?page=97),
   p98 and p99. M28.19/20, 4664 cc, 9.3:1, SAE J1349 174 kW at 5250, 357 Nm at 4000, maximum 6100 rpm;
   one overhead cam per bank and 225/50 VR16 tires. This resolves secondary pages that incorrectly say 4464 cc,
   DOHC or 5500 rpm. [928GT transmission chart](https://www.928gt.com/t-928trans.aspx) gives US 1983–84
   manual final ratio 2.36 and US 1987–88 manual 2.20; it does not verify this addition's intermediate gears.
3. **Ferrari official model specifications**, [GTO](https://www.ferrari.com/en-EN/auto/gto) and
   [F40](https://www.ferrari.com/en-EN/auto/f40). GTO: 294 kW at 7000, 496 Nm at 3800, 2855.08 cc, 7.6:1,
   1160 kg dry. F40: 351.5 kW at 7000, 577 Nm at 4000, 2936.25 cc, 7.7:1, 1100 kg dry. Both list dimensions,
   tracks, wheelbase, tires and 120 L tanks. Ferrari's GTO dimensions 4290/1910/1120 mm are adopted explicitly;
   the older manual's 4225/1880/1150 mm are a conflicting source, not silently averaged.
4. **Ferrari GTO owner's manual**, [public scan index](https://manualzz.com/doc/html/5370470/ferrari-288-gto-owners-manual),
   actual PDF pp10–14, visually inspected p13. Upper engine speed 7700. Gear ratios including transfer gears
   are 3.692/2.296/1.636/1.284/1.022, final 29/10 = 2.9; printed total reductions approximately
   10.707/6.659/4.745/3.723/2.964. Do not multiply by 28/21 again.
5. **Toyota 1980 US early brochure**, [ImportArchive index and full-resolution archive](https://importarchive.com/brochure/toyotatruck1980_01),
   pp21–23, exact 2WD Long Bed column on p22. 20R 2189 cc, 8.4:1, SAE net 122 lb-ft at 2400, **49-state
   95 hp at 4800** versus California 90 hp, curb 2465 lb, wheelbase 110.2 in, tracks 53/53.1 in,
   length/width/height 184.6/63.4/58.9 in, rear axle 4.11, standard 4MT, 16.1 US gallon tank.
   The high-resolution source corrects provisional readings from the small preview. RN42 is the supplied selection;
   the brochure does not independently identify the frame code in that table.
6. **CorvSport 1984 specifications**, [1984 C4](https://www.corvsport.com/1984-corvette-specifications/).
   Secondary source for L83 205 SAE hp at 4300, 290 lb-ft at 2800, 9:1, manual axle 3.07,
   255/50 VR16 tires, 96.2 in wheelbase and approximately 3020 lb curb mass. Its narrative description of
   overdrive is incomplete; [C4 history](<https://en.wikipedia.org/wiki/Chevrolet_Corvette_(C4)>) distinguishes
   the four-speed gearbox plus overdrive on the upper three gears. Exact adopted base ratios remain provisional.
7. **1995 YJ S specifications**, [Carspecs exact S 2.5 manual entry](https://www.carspecs.us/cars/1995/jeep/wrangler/3598):
   123 hp at 5250, 139 lb-ft at 3250, 2934 lb curb, 151.9/66/71.9 in, 93.4 in wheelbase and 15 gallon tank.
   [Novak AX5 guide](https://www.novak-adapt.com/knowledge/transmissions/manual/ax5.html) gives
   3.92/2.33/1.44/1/0.85, adopted in preference to unsourced 3.93/1.45 variants. Final 4.10 remains an
   option assumption. [YJ history](<https://en.wikipedia.org/wiki/Jeep_Wrangler_(YJ)>) distinguishes the 1992-on
   family cage and 1994-on high-mounted stop lamp.
8. **Secondary model histories**, [Esprit](https://en.wikipedia.org/wiki/Lotus_Esprit),
   [Countach](https://en.wikipedia.org/wiki/Lamborghini_Countach), [930](https://en.wikipedia.org/wiki/Porsche_930),
   [959](https://en.wikipedia.org/wiki/Porsche_959). These support engine families and headline anchors, with
   exact-year application still provisional where noted in the CSV. The 930 US anchor is 282 mechanical hp
   at 5500 and 377 Nm at 4000, not the European 300 PS value. The QV's carburetted 455 PS is distinct from
   the US injected 420 hp. The 959's mass is K's 1,600 kg ([below](#porsche-959-of-1987-sources-versus-authored)), no longer the 1450 kg Komfort curb mass first adopted.
9. **Mini secondary specifications**, [Mini 850](https://www.uniquecarsandparts.com/mini_850_technical_specifications.htm).
   Mixed-market page supports the 848 cc OHV family and approximate envelope, but is not an exact early-1964
   UK homologation. The 34 hp/5500, 44 lb-ft/2900, 8.3:1, curb mass and gearbox choices remain estimates.
   The contradictory SOHC description and later/Australian gear ratios are not adopted as verified UK data.
10. **Nova production records**, [NovaResource](https://www.novaresource.org/production.htm), support the supplied
    1977 family/engine selection only. They do not establish the adopted six-cylinder 110 hp/3800,
    195 lb-ft/1600 or 305 V8 145 hp/3800, 245 lb-ft/2400 engine curves, mass, track or gearbox ratios.
    Those are provisional engineering inputs pending an exact engine/market factory sheet. The police
    conversion does not claim an original 9C1 manual option.

Conflicting secondary Countach pages mix incompatible bore, gearbox, power-unit and performance figures;
they are not blanket authorities for this data. An Esprit page labelled simply “Turbo” actually describes
the 1987 Stevens body and is not the 1984 geometry source. Unread F40 racing tables and a later owner's manual
are not evidence for the selected 1988 non-catalyst road specification.

## Pictures and sound

[Shape authoring](../tools/graphics/chase-turbo-shapes.ts) creates original surface samples in metres for twelve of
the cars; the 959's pictures are baked from K's model instead, in its four period colors, and the 928 S4's in eight
Porsche colors ([Model solids](image-assets.md#model-solids)). Those samples go through the existing shared camera,
palette, shadows, sprite and six-LOD baker. Each of the twelve has 64 yaw pictures, one bank, four palettes and the
existing brake-lamp slot. No source photograph, ROM image or downloaded manual image is redistributed. Facet
locations, window proportions, lights, rims, paint and details are visual estimates; this is not a dimensioned CAD
reconstruction. Dimensions include a provisional visual envelope, so tiny mirrors, lamps or the spare can extend
slightly beyond the nominal body panel dimensions.

Each car has its own existing-format sound graph with its cylinder count and evenly spaced firing phases.
Ferrari flat-plane banks alternate (the F40's exhaust is written [below](#f40-exhaust-and-sound)); the two 928s route 1-3-7-2-6-5-4-8 by banks 1–4/5–8, the S4's banks meeting only
in its rear silencer ([below](#porsche-928-s4-of-1987-sources-versus-authored)), while Chevy V8s route
1-8-4-3-6-5-7-2 by odd/even banks. Flat sixes and V12 use alternating banks. Except the S4's and the F40's, whose
sources are given below, all valve openings, diameters, pipe dimensions and collector simplifications are estimates. They are
synthesized approximations, not recordings or independently verified exhaust acoustics. No siren, turbo sound process or physics is added.

## Reproduction and validation

```sh
npm run chase-turbo-pictures -- all replace
npm run chase-turbo-pictures -- review
npm run chase-turbo-validation
npm run measure -- generate
npm test
```

`review` redraws PNG sheets from admitted saved sprites without rebaking geometry. A single vehicle ID bakes
only its set. `replace` is required to overwrite a saved set. The generated [PNG overview](chase-turbo-vehicles/overview.png)
and [validation report](chase-turbo-vehicles/validation.md) are committed for direct review.

The validation observer uses the existing solver for fixed-duration acceleration, shifts, braking and restart;
it does not create game reference times. Catalog-dependent non-series line-comparison products and engine
loudness are refreshed only because existing content admission requires current products. No new series,
series lap-time target or time limit is authored. Existing TSUKUBA series reference products remain unchanged.

## Porsche 959 of 1987: sources versus authored

K takes TURBO OUTRUN's rival for the Porsche 959 of 1987, European Komfort (K, 2026-11-19); nothing here claims the
original says so. `PORSCHE_959_1987` is the 959 Komfort of the 1987 model year as sold in Europe, left-hand drive: the
type 959.50 twin-turbo flat six with the G59.01 gearbox, G and five road gears, and four-wheel drive. K chose the year
as the earliest it could be, before the original's 1989, and its values as faithful to the real car as can be; where
there is no source they are estimated. Its other numbers follow this ledger's
[conventions](#numerical-conventions-and-remaining-uncertainty). It is the rival of ARCADE TRIBUTE - TURBO OUTRUN's
four classes, in GRAND PRIX WHITE ([Series documents](content-and-gameplay.md#series-documents)).

The source column is the stage auditor's reading (2026-11-20), not read for the PR that wrote this section: Porsche's
parts catalogue for the 959 of the 1987 and 1988 model years, as Porsche distributes it (**catalogue**), Porsche
Newsroom (**Porsche**), and articles and specification tables (**secondary**). The catalogue's hosts were not
reachable from the PR's environment. K's decisions are the year, the specification, the mass and the gear names.

| Item              | Source (auditor's reading)                                                                                                               | Authored `PORSCHE_959_1987`                                                                       | Class                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------- |
| Built             | 113 in 1987, 179 in 1988, 292 in all (Porsche)                                                                                           | The car of 1987 (K)                                                                               | source, K                     |
| Gearbox           | G59.01 with engine 959.50; G 42/12, 1st 35/17, 2nd 31/22, 3rd 29/28, 4th 26/32, 5th 23/36; final 33/8 (catalogue)                        | **3.5, 2.058823529, 1.409090909, 1.035714286, 0.8125, 0.638888889**; final 4.125; shown G and 1–5 | source, calculated            |
| Power             | 331 kW (450 PS) at 6,500 rpm (Porsche)                                                                                                   | Point 3: 486.24201 N m at 6,500 (450 PS)                                                          | source, calculated            |
| Greatest torque   | 500 N m at 5,500 rpm (German sources agree; some give 5,000)                                                                             | Point 2: 500 N m at **5,500**                                                                     | secondary                     |
| Low-speed torque  | About 401 N m at 2,500 and about 408 at 3,000, said to be read from Porsche's 1987 curve (an article; the curve itself not seen)         | Point 1: **401 N m at 2,500**; 3,000 is not a point (the curve gives 417.5 there)                 | secondary                     |
| Redline           | The tachometer's red from 7,300 rpm (evo, an article)                                                                                    | **7,300 rpm**; point 4 at 7,300: 398.718448 N m, 0.82 of point 3's torque                         | secondary, estimate           |
| Idle point        | —                                                                                                                                        | 160 N m at 900                                                                                    | estimate                      |
| Turbochargers     | A KKK K26 (turbine size 6) left and right; the second joins at 4,000 to 4,300 rpm (catalogue, articles)                                  | Steady full-throttle curve; the second turbo's onset is not represented (K)                       | catalogue, secondary          |
| Tires             | 235/45 VR17 front, 255/40 VR17 rear (catalogue)                                                                                          | Radii 0.315 / 0.311 m (this ledger's, unchanged)                                                  | source, estimate              |
| Front track       | 1,504 mm (specification tables)                                                                                                          | **1.504 m**                                                                                       | secondary                     |
| Mass              | 1,450 kg nominal (Porsche); about 1,530 to 1,630 kg weighed (AMS's 1,566 kg among them); nominal said 150 to 200 kg light (Frère, cited) | **1,675 kg**: K's 1,600 (nominal + 150) + the 75 kg driver                                        | K, calculated                 |
| Front : rear mass | 40 : 60 (specification tables, articles)                                                                                                 | Axles **1.3632 / 0.9088 m** from the CG (wheelbase 2.272 × 0.60, × 0.40)                          | secondary                     |
| Drag              | cW 0.31 (Porsche); frontal area 1.92 m² (a forum's transcription of Porsche's table)                                                     | `q = 0.5 × 1.225 × 0.31 × 1.92` = **0.36456 kg/m**                                                | source, secondary, calculated |
| Inertias          | —                                                                                                                                        | Box estimates **3,006 / 2,762 kg m²**                                                             | calculated                    |
| Brakes            | —                                                                                                                                        | 1,675 × 11.5 m/s², 65:35, × 0.315 / 0.311 m, to 25 N m: **3,950 / 2,100 N m**                     | game design                   |
| Exhaust           | Two manifolds, a cross tube, two K26, one silencer (catalogue)                                                                           | [Calibration](calibration.md#exhaust-topologies); below                                           | catalogue, estimate           |
| Unchanged         | Length, width, height, rear track, wheelbase 2,272 mm, 2,849 cc, compression ratio                                                       | As before; CG 0.47 m, suspension, front drive 0.4, idle 900                                       | as in the CSV                 |

The six ratios were 3.5, 2.059, 1.409, 1.074, 0.861 and 0.696; the upper three are a 911 G50's and fit no 959 tooth
count. Point 1 was 235 N m at 2,000 rpm and point 2 500 N m at 5,000 rpm, both estimates; the curve now gives about
326 N m at 2,000 rpm. Point 4 keeps this ledger's rule, 0.82 of point 3's torque, and moves to the new redline.

### Representation within the current model

- G and the five road gears are six forward gears like any car's; the listing names them `G`, `1` to `5`
  (`gearNames`), which the HUD's gear digit, the card's GEARS and DRIVETRAIN show, as they show the M23 PP SPEC's `L`
  and `H`. Launch and the automatic shifts start in G and treat it as any first gear.
- The torque curve is the steady full-throttle envelope of five points, as every car's. The second turbocharger's
  onset, boost and its lag, PSK's varying split (the front share stays a fixed 0.4) and the ride-height control are
  not represented (K).
- The engine sound follows the catalogue's layout: each bank's three cylinders into its manifold, the right bank's
  cross tube to the left turbine, so the banks join before the turbines, the two turbines' throats (6 cm²), a pipe from
  each into the one silencer (inlet clamps 60 mm, no catalyst) and two outlets (the outlets' number not confirmed). The
  switching valve is not moved: the cross tube and both turbines are always open. The wastegate and its silencer are
  not written. The two exhaust valves of each cylinder are one of their combined area: two of 33 mm (the 928 four-valve
  head's, whose seat the 959 shares; the 959's own valve not confirmed) give 46.7 mm. The valve's opening (0.36 of the
  cycle, about 260 degrees), every length and the primaries' and cross tube's diameters are estimates.
- Its pictures are baked from K's model in four 1987 colors, GRAND PRIX WHITE the default
  ([Model solids](image-assets.md#model-solids)); the model's wheelbase is 2,301 mm against the 2,272 mm its driving
  uses, and its wheels are the tyres' nominal size, while its driving keeps this ledger's radii (K, 2026-11-20).

### Measured on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts
([validation](chase-turbo-vehicles/validation.md)), not compared with or tuned to the real car's figures:

| Measure                | Measured                                                          |
| ---------------------- | ----------------------------------------------------------------- |
| 0–100 km/h, 0–200 km/h | 3.75 s, 12.45 s                                                   |
| 0–400 m                | About 11.8 s, at about 197 km/h (between the run's 1 s samples)   |
| Top speed              | 320 km/h in 5 (the sixth forward gear) at 7,193 rpm, held by drag |
| Redline speeds, G to 5 | 59, 101, 147, 200, 255, 325 km/h                                  |
| Shifts                 | 60, 102, 148, 201 and 257 km/h, at 1.9, 3.8, 7.0, 12.6 and 22.7 s |
| Braking from 100 km/h  | 2.57 s, 36.1 m                                                    |

It launches in G, shifts from G to 1 and on through 5 as any car through its gears, stops from its top speed and
restarts from rest (158 km/h 8 s after stopping).

## Porsche 928 S4 of 1987: sources versus authored

K takes CHASE H.Q.'s car for the Porsche 928 S4 of 1987, United States, five-speed manual (K, 2026-11-20);
nothing here claims the original says so. `PORSCHE_928_S4_1987` is the 1987 model year's US 928 S4: left-hand drive,
the M28/41 32-valve V8, the G28/13 five-speed manual and rear drive. No series runs it yet; how CHASE H.Q.'s series
uses it is not decided. Its numbers follow this ledger's
[conventions](#numerical-conventions-and-remaining-uncertainty); K asked for the real car's values (K, 2026-11-20),
and the rows below are those Stage P928 checked.

The source column is the stage auditor's reading (2026-11-20) of the pages listed [below](#the-928-s4s-sources),
except where it names item 1 of [Evidence actually consulted](#evidence-actually-consulted), read on 2026-10-23. The
environment of the PR that wrote this section could not reach the auditor's pages, so the numeric ledger classes their
values `source (auditor)`.

| Item           | Source (auditor's reading)                                                                                                                                                    | Authored `PORSCHE_928_S4_1987`                                                        | Class                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------- |
| Gearbox        | G28/13, the 1987–88 US five-speed manual (A, C); 4.067, 2.714, 1.934, 1.463, 1.000, R 3.570 (B)                                                                               | **4.067 / 2.714 / 1.934 / 1.463 / 1**; the ratios include the 33/21 countershaft pair | source (auditor)             |
| Final drive    | 2.200 (B)                                                                                                                                                                     | 2.2                                                                                   | source (auditor)             |
| Idle           | 675 ± 25 rpm (A, B)                                                                                                                                                           | **675 rpm**; the torque curve's first point moved to it, its 249.4 N m an estimate    | source (auditor)             |
| Tracks         | 1,549 / 1,546 mm, the rear on the 8J × 16 rim (B); a specification list gives 1,551 front                                                                                     | **1.549** / 1.546 m                                                                   | source (auditor)             |
| Engine         | 4,957 cc, 10.0:1, 235 kW at 6,000, 430 N m at 3,000, 6,600 rpm (item 1; A agrees: M28/41, 100 × 78.9 mm, 316 hp SAE net, the fuel cut at 6,600, firing order 1-3-7-2-6-5-4-8) | Unchanged                                                                             | source verified              |
| Body           | 4,523 / 1,836 / 1,282 mm, wheelbase 2,500 mm, 1,590 kg (item 1; B agrees; one list gives 1,580 kg); Cd 0.34 (secondary)                                                       | Unchanged; the CdA stays an estimate                                                  | source verified              |
| Tires          | 225/50 VR16 on 7J × 16, 245/45 VR16 on 8J × 16 (B); 631 and 627 mm across                                                                                                     | Radii 0.305 / 0.306 m, the ledger's convention (unchanged)                            | engineering estimate         |
| Exhaust valves | Two per cylinder, 33 mm (a parts vendor); 17° BBDC to 2° BTDC at 1 mm lift, 195° (A); about 240° seat to seat, 8.5 mm lift (a cam regrinder's figure on a forum)              | `valve` 46.7 mm (33 × √2), `open` 0.3333 (240° of 720°)                               | source (auditor), calculated |
| Exhaust        | Below                                                                                                                                                                         | [Calibration](calibration.md#exhaust-topologies)                                      | source (auditor), estimate   |

The exhaust as the auditor read it: each bank has a stainless 4-into-1 manifold of 42 mm primaries about 15 and 20 cm
long into a 52 mm collector (an owner who modelled the engine; which cylinders take the long ones is not given); the
two banks run separately to the car's rear, "twin pipes for the full length" (A), each through its downpipe, its own
catalyst (two from 1987) and its own centre silencer, all 52 mm inside (55 mm outside, 1.5 mm wall); the banks first
meet in the transverse rear silencer, whose two inlets are 47 mm inside; two tailpipes about 59 mm outside leave at the
left rear. The factory system has no crossover. The forum and vendor figures are not primary documents; no source gives
the pipes' lengths.

### The 928 S4 in the current model

- The sound writes the two valves of a cylinder as one of their combined area, and each bank's collector, downpipe,
  catalyst and centre silencer as one 52 mm pipe (2.70 m, an estimate) to the rear silencer's node, where the two banks
  join; the silencer's body is one pipe of its two inlets' combined area, 66 mm (0.50 m, an estimate), and two tailpipes
  of 56 mm (0.25 m, an estimate) leave it. The front two cylinders of each bank are taken as those with the long
  primaries, an estimate. Some posts give one oval outlet on other years and markets; the 1987 US car is written with
  two.
- The wheel radii stay at the ledger's 0.305 and 0.306 m, about 3% under the tires' nominal 0.3157 and 0.3135 m.
- The 50:50 axle split, the CG height and the frontal area remain unverified estimates; the torque curve's points at
  675, 1,875 and 6,600 rpm remain estimates.
- No turbo, boost or pursuit control is added.

### The 928 S4 on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts, not tuned to the real
figures:

| Measure                        | Real car (US figures as quoted, not read in primary sources) | Measured                                                |
| ------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------- |
| 0–60 mph                       | 5.7 s (one list gives 5.1 s)                                 | 5.35 s (100 km/h in 5.62 s)                             |
| Quarter mile                   | 14.1 s                                                       | 13.83 s, 106.8 mph                                      |
| Top speed                      | 165 mph, about 266 km/h                                      | 271 km/h in fifth at 5,200 rpm, held by drag            |
| Redline speeds, first to fifth | —                                                            | 85, 128, 179, 237, 346 km/h                             |
| Shifts                         | —                                                            | 85, 128, 179 and 237 km/h, at 4.5, 8.1, 15.1 and 31.3 s |
| Braking from 100 km/h          | —                                                            | 2.52 s, 35.5 m                                          |

It launches, shifts through all five gears and restarts from rest (127 km/h 8 s after stopping). It is a little
quicker than the quoted figures and its top speed is slightly above the claim; the numbers are left as derived.

### The 928 S4's sources

The stage auditor's reading (2026-11-20), not reached by the PR that wrote this section:

- A: transcriptions of Porsche's Technical Specifications booklet, [928 S4 specifications](https://members.rennlist.com/pirtle/s4specs.htm)
  and [general/engine](https://www.jenniskens.eu/Technical/TechSpecs/TechSpecs1.htm).
- B: a transcription of the [1987 US owner's manual](https://members.rennlist.com/pirtle/87man22.htm); the
  countershaft pair is explained in [the S4 manual transmission](https://members.rennlist.com/pirtle/s4mtrans.htm).
- C: Porsche's [928 parts catalogue for the US, 1987–91](https://files.porsche.com/f/332100/1ff15ee75e/kat511-usa-928-91-katalog.pdf).
- Exhaust and valves, owners' and vendors' figures: [pipe measurements](https://rennlist.com/forums/928-forum/446353-exhaust-system-measurements-rear-h-pipe-install.html),
  [the layout by year](https://rennlist.com/forums/928-forum/36626-exhaust-pipe-sizes.html),
  [the primaries](https://rennlist.com/forums/928-forum/755885-s4-intake-manifold-facts-and-ideas-13.html),
  [the tailpipes](https://rennlist.com/forums/928-forum/369753-928-muffler-exhaust-tips.html),
  [the cams](https://rennlist.com/forums/928-forum/1287743-928-gt-cams-2.html) and
  [the exhaust valves](https://www.design911.com/porsche/928gt-5-0l-1989-91/porsche-engine-valves-guides-and-springs/).

## Ferrari F40 of 1988: sources versus authored

K takes TURBO OUTRUN's car for the Ferrari F40 of 1988, European specification (K, 2026-11-19); nothing here claims
the original says so. `FERRARI_F40_1988` is an ordinary European road car of 1988 without catalyst, with left-hand drive,
the fixed ride height and the five-speed manual; it mends the earlier 1990 entry rather than adding a second F40. Its
numbers follow this ledger's [conventions](#numerical-conventions-and-remaining-uncertainty).

The source column is the stage auditor's reading (2026-11-19 and 2026-11-20) of the pages listed [below](#f40-sources);
the PRs that wrote this section could not reach them, so none is marked as read here: their class is `source (auditor)`. K's decisions are the year and
market, the 1,235 kg base and the European gearing; the auditor's choices are the nominal wheel radii and the exhaust's
estimates.

| Item                 | Source (auditor's reading)                                                                        | Authored `FERRARI_F40_1988`                                                           | Class               |
| -------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| Gears                | 36/13, 31/18, 27/22, 26/27, 23/30 (FIA form B-293's standard set)                                 | 2.769 / 1.722 / 1.227 / 0.963 / 0.767, unchanged                                      | source (auditor)    |
| Final reduction      | constant pair 28/21; European differential 30/11 (the US car's is 29/10)                          | `(30/11) × (28/21)` = **3.636363636**; overall 10.069 / 6.262 / 4.463 / 3.501 / 2.787 | source (auditor), K |
| Mass                 | 1,235 kg for the 1988 car (a specification table; a US/European list gives 2,717 lb); not primary | **1,310 kg**: 1,235 + the 75 kg driver                                                | K, calculated       |
| Tyres                | 245/40 ZR17 front, 335/35 ZR17 rear                                                               | Nominal radii **0.314 / 0.333 m**; inertias `25r²` / `27r²` = 2.465 / 2.994 kg m²     | calculated          |
| Inertias             | —                                                                                                 | Box estimates **2,497 / 2,211 kg m²**                                                 | calculated          |
| Brakes               | —                                                                                                 | 1,310 × 11.5 m/s², 65:35, × the radii, to 25 N m: **3,075 / 1,750 N m**               | game design         |
| Redline              | the tachometer's red from 7,750 rpm (a secondary description)                                     | 7,750 rpm, unchanged                                                                  | source (auditor)    |
| Dimensions, engine   | Ferrari's model page (read for the earlier entry)                                                 | unchanged                                                                             | source verified     |
| Idle, CG, mass split | —                                                                                                 | 1,000 rpm, 0.44 m, 58% rear, unchanged; no source found                               | estimate            |

- The FIA form took effect in December 1989; the 1988 European owner's manual is not read. The 1,235 kg is not a
  primary figure, and whether it holds fuel is not known.
- The radii are the tyres' nominal ones, as for every car here. A road test's 43.5 km/h per 1,000 rpm in fifth implies a
  rolling radius of about 0.322 m, so the game's gearing is about 3.5% longer than the car's.
- Boost onset and lag are not represented; the torque curve is the steady full-throttle envelope, unchanged.

### F40 exhaust and sound

The engine sound is written from Ferrari's part list 021 (exhaust, cars without catalyst), as the auditor read its text:
one cast manifold per bank, the pipe between the manifolds (part 122561), an IHI turbocharger per bank, a pipe from each
turbocharger into the one silencer, and three outlets, the outer two the exhaust's and the centre one the wastegate's.
The part list's drawing is not read here, so where the crossover leaves each manifold and the silencer's inlets and
outlets are not checked against it.

| Part                          | Written                                                                            | Class                                        |
| ----------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| Exhaust valves                | Two of 26 mm a cylinder (FIA form): equal-area 36.8 mm; lift taken ≥ 6.5 mm        | source (auditor), calculated                 |
| Valve timing                  | 54° BBDC / 10° ATDC at 0.5 mm, read as the Testarossa's: about 280°, `open` 0.3889 | source (auditor), calculated                 |
| Firing order                  | 1-5-3-7-4-8-2-6, the banks alternating: phases and primaries unchanged             | source (auditor)                             |
| Eight primaries               | 0.35 × 35 mm to the right and left manifolds, unchanged                            | estimate                                     |
| Pipe between the manifolds    | 0.60 × 38 mm, always open                                                          | connection: source (auditor); size: estimate |
| Turbine throats               | 0.08 × 27.6 mm each, as the 959's                                                  | estimate                                     |
| Turbochargers to the silencer | 2 × 0.40 × 54 mm                                                                   | size: a replacement maker's main pipe        |
| Silencer to the outer outlets | 2 × 0.60 × 54 mm; the 70 mm tips are not written                                   | size: as above; lengths: estimate            |

- The wastegate is not represented, nor its centre outlet, as for the RX-7; the silencer's body is a straight pipe of
  its inlet diameter.
- The 54 mm is a replacement maker's main pipe for the catalyst car, outside or inside not stated; Ferrari's own pipe is
  not checked.
- Its engine loudness, measured again, is −22.60 LUFS against the earlier −20.40.

### F40 measured on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts, not tuned to any real
figure:

| Measure                        | Measured                                                |
| ------------------------------ | ------------------------------------------------------- |
| 0–100 km/h, 0–200 km/h         | 3.10 s, 9.50 s                                          |
| 0–400 m, 0–1,000 m             | 10.9 s, 19.6 s (between 1 s samples)                    |
| Top speed                      | 332.6 km/h in fifth at 7,465 rpm, held by drag          |
| Redline speeds, first to fifth | 97, 155, 218, 278, 349 km/h                             |
| Shifts                         | 97, 156, 218 and 278 km/h, at 3.0, 6.0, 11.4 and 21.2 s |
| Braking from 100 km/h          | 2.55 s, 36.1 m                                          |

It launches, shifts through all five gears and restarts from rest (182 km/h 8 s after stopping).

### F40 sources

The stage auditor's reading (2026-11-19 and 2026-11-20), not read for these PRs:
[FIA homologation form B-293](https://historicdb.fia.com/sites/default/files/car_attachment/1601077201/homologation_form_number_293_group_b.pdf),
[a US/European specification list](https://www.ferrarichat.com/forum/posts/139741571),
[a road test's figures as quoted](https://www.gtplanet.net/forum/threads/difficult-car-ferrari-f40.310621/),
[Ferrari's part list 021, exhaust without catalyst](https://www.allferrariparts.com/tbl12205.html) and
[a replacement maker's catalogue](https://catalogue.tubistyle.it/ferrari/f40-1987-1992.html); the 1,235 kg is from a
specification table of the 1988 car (cars-data).

## Mazda RX-7 Turbo II of 1987: sources versus authored

K takes TOP SPEED's car for the Mazda RX-7 Turbo II of 1987 (K, 2026-11-19); nothing here claims the original says so.
`RX_7_TURBO_II_1987` is the 1987 model year's FC Series 4 Turbo II as sold in the US: left-hand drive, the 13B
two-rotor engine with an intercooled single turbocharger, a five-speed manual and rear drive. Its listing selects the
5MT, the hood scoop and the 16-inch wheels; its engine is shown as `R2T`, a two-rotor turbo. FREE PLAY's classes offer
it through catalog membership, as every vehicle; no other series runs it, and how TOP SPEED's series will use it is not
decided. Its numbers follow this ledger's [conventions](#numerical-conventions-and-remaining-uncertainty).

The source column has two kinds of reading, both the stage auditor's on 2026-11-19, none made for the PRs that
wrote this section. Rows of class **source (T)** were read by the auditor in K's copy of Mazda's Turbo II training
material (`S4T2training.pdf`, 75 pages, not in the repository), on the pages given. Rows of class **source** are the
auditor's reading of the other pages listed [below](#sources), not read for these PRs. K's decisions are the width, the
US mass and length, and the power and torque anchors.

| Item                  | Source (auditor's reading)                                                                                         | Authored `RX_7_TURBO_II_1987`                                                            | Class                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------- |
| Length, width, height | 168.9 / 66.5 / 49.8 in (US); width 1,690 mm in other sources                                                       | **4.29 / 1.695 / 1.265 m**; the width is K's                                             | source, K               |
| Wheelbase             | 2,430 mm, 95.7 in (two sources agree)                                                                              | Axles **1.215 / 1.215 m** from the CG: 50:50 (a press description, not a primary source) | source, estimate        |
| Tracks                | 1,450 / 1,440 mm (two sources agree)                                                                               | 1.45 / 1.44 m                                                                            | source                  |
| Mass                  | 2,845 lb (1,290 kg) US Turbo curb; 2,851 lb elsewhere                                                              | **1,365 kg**: 1,290 + the 75 kg driver                                                   | source, calculated      |
| Engine                | 13B, two rotors, 2 × 654 cc; 8.5:1 (9.4 without turbo); 4 intake ports (6); idle 750 ± 25 rpm (pp. 1, 4B-3, 4B-45) | 1,308 cc, `cycle` 2 (below), 8.5, idle 750                                               | source (T)              |
| Power, torque         | 182 hp SAE net at 6,500 rpm; 183 lb-ft at 3,500 rpm (K's anchors)                                                  | Point 2: 248.114684 N m at 3,500; point 3: 199.385493 N m at 6,500 (135.7 kW)            | K, calculated           |
| Curve's other points  | —                                                                                                                  | 110 N m at 750, 180 at 2,000, 180 at 7,000 (power stays greatest at 6,500)               | estimate                |
| Redline               | —                                                                                                                  | **7,000 rpm**, the tachometer's red (K, 2026-11-20)                                      | game design             |
| Transmission          | 3.483, 2.015, 1.391, 1.000, 0.762; final 4.100, clutch-type LSD (two sources)                                      | As the source; the LSD is not represented                                                | source                  |
| Tires                 | 205/55VR16 on 16 × 7J, 632 mm outside diameter                                                                     | Radii 0.316 m; inertias `25r²` / `27r²` = 2.496 / 2.696 kg m²; the default tire          | source, calculated      |
| Drag                  | Cd 0.31 at launch (press); 0.29 is the aero package's and is not adopted                                           | `q = 0.5 × 1.225 × 0.31 × 1.79 m²` = **0.34 kg/m**; the frontal area is an estimate      | source, estimate        |
| CG height             | —                                                                                                                  | 0.48 m                                                                                   | estimate                |
| Inertias              | —                                                                                                                  | Box estimates **2,420 / 2,275 kg m²**                                                    | calculated              |
| Brakes                | —                                                                                                                  | 1,365 × 11.5 m/s², 65:35, × 0.316 m, to 25 N m: **3,225 / 1,725 N m**                    | game design             |
| Suspension            | —                                                                                                                  | 1.5 Hz, 0.4, 0.3 m                                                                       | game design             |
| Exhaust port          | Opens 75° BBDC, closes 48° ATDC (p. 1)                                                                             | `valve.open` 0.95 (below)                                                                | source (T), game design |
| Exhaust               | Manifold, turbo, front and main converters, Y, two 12,000 cc main silencers (pp. 4B-3, 4B-41, 4B-45)               | [Calibration](calibration.md#exhaust-topologies); lengths and diameters are estimates    | source (T), estimate    |

### Representation within the current model

- K adopted this representation, the redline and the eight paints (K, 2026-11-20): no engine kind is added.
- An engine's `cycle` is 2 or 4, and friction is FMEP × displacement over 2π × the cycle's revolutions
  ([Vehicle physics](vehicle-physics.md)). The 13B's two rotors burn twice in each output-shaft revolution and together
  discharge 1,308 cc in it, the same as a 1,308 cc two-stroke, so it is written as `cycle` 2; no third cycle is added.
- The sound fires twice in one revolution (`cycleRevolutions` 1, `firingPhases` [0, 0.5]), the interval of a
  four-stroke four; a rotor's three chambers firing over three revolutions are not represented. Each rotor's port is
  open 75 + 270 + 48 = 393 output-shaft degrees, more than the revolution, so `valve.open` is 0.95, near the format's
  limit below 1.
- Boost onset and lag, the LSD and the clutch are not represented, as for the other cars. The training material gives
  the greatest boost as 340 mmHg (13.4 inHg, about 45 kPa or 6.6 psi; p. 4B-45); it is not used. The training material
  gives neither the rev limit nor the redline.
- The twin-scroll turbine's switch (only the primary passage below 2,700 rpm, both above; p. 4B-17), the wastegate
  built into the turbocharger and the air-cooled intercooler under the hood scoop (pp. 4B-18, 4B-45) are not
  represented; the torque curve's point at 2,000 rpm (180 N m) stays an estimate.
- Its engine sound's `metadata.note` predates the training material's reading: it says "one pipe through the catalyst"
  and that the port timing was not read here. The pipes and values match the material's order
  ([Calibration](calibration.md#exhaust-topologies)); the note is mended with the next change to the sound, which
  measures its loudness again.
- Its pictures are baked from K's model in eight 1987 paints ([Model solids](image-assets.md#model-solids)); the
  model's wheelbase is 2,393 mm against the 2,430 mm its driving uses, a difference K allowed.

### Measured on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts, not tuned to the real
figures:

| Measure                        | Real car                                          | Measured                                                |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------- |
| 0–60 mph                       | 6.7 s (claimed); 7.2 s (a period television test) | 6.13 s (100 km/h in 6.50 s)                             |
| Quarter mile                   | 15.2 to 15.3 s, about 91 mph                      | 14.80 s, 95.3 mph                                       |
| Top speed                      | 230 km/h (claimed)                                | 246 km/h in fifth at 6,490 rpm, held by drag            |
| Redline speeds, first to fifth | —                                                 | 58, 101, 146, 203, 267 km/h                             |
| Shifts                         | —                                                 | 59, 101, 146 and 203 km/h, at 2.9, 6.6, 13.2 and 30.3 s |
| Braking from 100 km/h          | —                                                 | 2.48 s, 35.1 m                                          |

It launches, shifts through all five gears and restarts from rest (112 km/h 8 s after stopping). It is quicker than
the real car's tests and its top speed is above the claim; the numbers are left as derived, not tuned to them.

### Sources

[Mazda's Turbo II training material](http://foxed.ca/rx7manual/manuals/S4T2training.pdf): K's copy, 75 pages, read
by the stage auditor (2026-11-19) on the pages cited above; it is not in the repository. It gives no power, torque or
torque curve, redline or rev limit, gear ratios, mass, dimensions, tires, or exhaust lengths, diameters and port areas.

The stage auditor's other starting points (2026-11-19), not read for these PRs:
[1987 North American specifications](https://www.automobile-catalog.com/car/1987/1639295/mazda_rx-7_turbo_ii.html),
[a transcription of the US specifications and ratios](https://www.rotarycarclub.com/rotary_forum/showthread.php?p=44127),
[the launch drag coefficient](https://features.csmonitor.com/1985/1107/hmazda.html) and
[1987 Mazda paint codes](https://paintref.com/cgi-bin/colorcodedisplay.cgi?manuf=Mazda&model=&year=1987).
