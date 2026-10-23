# CHASE H.Q. and Turbo OutRun vehicle selections

This ledger owns the fourteen additional vehicle definitions selected from the supplied arcade-vehicle report.
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
| FERRARI_F40_1990      | 1990 European F40, non-catalyst, fixed ride height   | F120-family 2936.25 cc twin-turbo flat-plane V8; 5MT            | Red, high fixed wing, round rear lamps, three exhaust outlets           |
| PORSCHE_959_1988      | 1988 European 959 Komfort                            | 2849 cc twin-turbo flat six; G+5 MT, AWD                        | White, covered oval lamps and integrated rear wing                      |
| CORVETTE_C4_1984      | 1984 MY US Base Coupe, 1YY07                         | L83 5733 cc Cross-Fire V8; Doug Nash 4+3                        | Blue early C4, four round rear lamps, no high-mounted stop lamp         |
| AUSTIN_MINI_850_1964  | Early 1964 UK standard Austin Mini 850, A-A2S7       | 848 cc A-series OHV four; 4MT, rubber-cone suspension           | Green, short upright two-door saloon; not a Cooper                      |
| WRANGLER_YJ_1995      | 1995 MY US Wrangler S YJ, soft top                   | 2464 cc MPI four; AX-5 5MT                                      | Tan, rectangular headlights, family cage, rear spare and high stop lamp |
| NOVA_250_1977         | 1977 MY US standard Nova four-door sedan             | L22 4097 cc OHV inline six; 3MT                                 | Light blue four-door body, steel wheels and chrome bumpers              |
| NOVA_9C1_1977         | 1977 MY US Nova four-door COPO 9C1 basis             | LG3 5001 cc OHV V8; game 3MT conversion                         | Black/white police recolor and static roof lights                       |

The supplied report's year choices are selections, not new identifications of the arcade sprites. In particular,
Countach/GTO/F40 production-year maxima remain estimates; F40 1990 and YJ 1995 postdate the games. The 1984
C4 intentionally substitutes a production-volume choice for an arcade appearance that may be 1986 or later.
No annual production count is asserted by these runtime definitions. The 9C1 manual gearbox is explicitly a
game conversion: the supplied police specification called for an automatic in the real car.

All four palettes are game colors, without verified period paint codes. Blue GTO and the police livery are
especially not claims of factory delivery colors. The stock-named palette key means the default game palette.

## Representation within the current model

- The C4 retains the four base ratios of the 4+3 gearbox. The separate overdrive unit and its engagement logic
  are absent. Consequently this version does not reproduce the real car's overdrive cruising or maximum-speed
  gearing. It is not presented as a seven-speed manual or given an invented fifth gear.
- The 959's G position and five road gears use six existing numeric forward positions, displayed as 1–6.
  Its front drive fraction is a fixed provisional 0.4. Dynamic PSK distribution, ride-height control and a
  separate low-range control are absent.
- The Wrangler is in 2H, using the existing rear-drive model. No transfer-case selector or four-wheel-drive
  mode is introduced. Its family cage is beneath the soft top; no early slanted cage is substituted.
- Existing automatic shifts and launch assistance operate all these manually geared source vehicles. They
  are game behavior, not evidence that the original cars had automatic transmissions or modern traction aids.
- Wings and spoilers are visual geometry only. Turbo engines use steady full-throttle torque envelopes;
  boost transients, downforce, clutch simulation and new control displays are outside this vehicle addition.
- Roof lamps on the police Nova are fixed colored geometry. They do not introduce flashing, sirens or pursuit AI.

## Numerical conventions and remaining uncertainty

Each run has one fixed 75 kg driver and no passengers or cargo. Published curb/ready masses are used as
qualified below; fuel and fluids already in those masses are not added again. For the GTO and F40 only,
Ferrari's dry masses are converted using 120 L fuel at an estimated 0.75 kg/L plus 15 kg of other fluids,
then the driver. Consumption and changing fuel mass are not simulated.

Mass bases before the driver are S4 1590, Esprit 1220, Countach 1490, 930 1335, GTO 1265, early 928 S 1520,
Pickup 1118.1, F40 1205, 959 Komfort 1450, C4 1370, Mini 630, YJ 1331, Nova six 1410 and police Nova 1500 kg.
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

The Esprit, 928s, Countach, 930, 959, Mini, Toyota and Novas still lack a read, exact-year primary gearbox
ratio table. Their provisional ratios are explicit engineering estimates, not borrowed verified facts from
another year. The F40 uses provisional gear pairs 2.769/1.722/1.227/0.963/0.767 and effective final reduction
`2.9*4/3`; the transfer reduction is folded into the existing single final-drive field. The GTO manual's
published ratios already include its transfer gears and therefore must not receive that factor a second time.
The 928 final reductions distinguish US S4 2.20 and 1984 US S 2.36; the provisional intermediate gear sets
remain separately qualified. The ordinary Nova's exact gearbox/axle option combination remains unverified.

## Evidence actually consulted

Accessed 2026-10-23 UTC. Search snippets, blocked URLs and unread manuals are not treated as source verification.
The numeric ledger distinguishes `source verified`, `calculated`, `engineering estimate` and `game design`.
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
   the US injected 420 hp. Komfort's adopted curb base is 1450 kg, not the lighter Sport's 1350 kg.
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
are not evidence for the selected 1990 non-catalyst road specification.

## Pictures and sound

[Shape authoring](../tools/graphics/chase-turbo-shapes.ts) creates original surface samples in metres. Those
samples go through the existing shared camera, palette, shadows, sprite and six-LOD baker. Each car has 64 yaw
pictures, one bank, four palettes and the existing brake-lamp slot. No source photograph, ROM image or downloaded
manual image is redistributed. Facet locations, window proportions, lights, rims, paint and details are visual
estimates; this is not a dimensioned CAD reconstruction. Dimensions include a provisional visual envelope,
so tiny mirrors, lamps or the spare can extend slightly beyond the nominal body panel dimensions.

Each car has its own existing-format sound graph with its cylinder count and evenly spaced firing phases.
Ferrari flat-plane banks alternate; the two 928s route 1-3-7-2-6-5-4-8 by banks 1–4/5–8, while Chevy V8s route
1-8-4-3-6-5-7-2 by odd/even banks. Flat sixes and V12 use alternating banks. All valve openings, diameters,
pipe dimensions and collector simplifications are estimates. They are synthesized approximations, not
recordings or independently verified exhaust acoustics. No siren, turbo sound process or physics is added.

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
