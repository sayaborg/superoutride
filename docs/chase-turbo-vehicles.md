# CHASE H.Q. and Turbo OutRun vehicle selections, the RX-7 Turbo II of 1987 and OUT RUN's traffic cars

This ledger owns the fourteen additional vehicle definitions selected from the supplied arcade-vehicle report, and
the [Mazda RX-7 Turbo II of 1987](#mazda-rx-7-turbo-ii-of-1987-sources-versus-authored), and OUT RUN's traffic cars,
the [Volkswagen Beetle 1500 of 1968](#volkswagen-beetle-1500-of-1968-sources-versus-authored), the
[Ford F-150 of 1975](#ford-f-150-of-1975-sources-versus-authored), the
[Chevrolet Corvette Stingray of 1970](#chevrolet-corvette-stingray-of-1970-sources-versus-authored), the
[Ford F-700 of 1980](#ford-f-700-of-1980-sources-versus-authored) and the
[BMW 325i Convertible of 1987](#bmw-325i-convertible-of-1987-sources-versus-authored), authored by its conventions.
The F40 among the fourteen is now [the 1988 European car](#ferrari-f40-of-1988-sources-versus-authored), and the
two Novas [the 1975 Nova 4-Door Sedan](#chevrolet-nova-of-1975-sources-versus-authored) and
[its police car](#the-police-nova-of-1975).
It records the chosen real-car specification, the limits of the evidence, the provisional authoring inputs and
validation. Shared physics, images, sound and selection behavior retain their existing owners.

The existing 1989 Corvette C4 remains a separate, byte-for-byte unchanged vehicle; the 1989 Porsche 930 has been
removed, the 1986 car taking its place (MF-6c, K 2026-11-22).
The 1977 Nova 250 and police Nova have been removed, the 1975 Nova 4-Door Sedan and its police car taking their places
(NV-1, NV-2, K 2026-11-26).
The unidentified box truck is deferred. These fourteen additions bring the selectable catalog from 21 to 35.
They enter existing FREE PLAY car/all pools through catalog membership; no course, series, traffic policy,
pursuit behavior, HUD, gear label or physics mechanism is added. They use ordinary contact and recovery.

**These are provisional vehicle reconstructions, not fourteen fully verified factory simulations.** Published
power and dimension anchors are used where identified below; several gear ratios, masses and much of the
geometry and acoustics still require better primary evidence. The [numeric ledger](chase-turbo-vehicles/numeric-ledger.csv)
classifies every numerical mechanics and sound input but the exhaust's diameter and tubes
([Audio](audio.md#observations-and-engine-sounds)). Runtime JSON remains the sole numerical authority;
the ledger is an audit, not an input loader. Do not interpret a precise decimal as measurement precision.

## Fixed identities

| Runtime ID                 | Chosen specification                                 | Engine / transmission                                           | Appearance anchor                                                       |
| -------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------- |
| PORSCHE_928_S4_1987        | 1987 MY US 928 S4                                    | M28.41, 4957 cc DOHC 32-valve V8; G28.13 5MT                    | Black, later bumpers, large rear lamps and raised spoiler               |
| TURBO_ESPRIT_1984          | 1984 UK Turbo Esprit, Type 82                        | 910 low-compression 2174 cc carburetted turbo four; Citroen 5MT | White Giugiaro wedge, rear louvers; not the Stevens X180                |
| COUNTACH_5000_QV_1985      | 1985 European carburetted 5000 Quattrovalvole        | 5167 cc DOHC 48-valve V12; 5MT                                  | Yellow, rear wing and wide rear tires; not the 25th Anniversary body    |
| 911_TURBO_3_3_1986         | 1986 MY European 911 Turbo 3.3 Coupe                 | 3299 cc air-cooled turbo flat six (930/66, 300 PS); 4MT         | Silver metallic, round headlights, wide rear fenders, black-rimmed tray |
| FERRARI_GTO_1984           | 1984 European GTO, Tipo F114                         | F114B, 2855.08 cc twin-turbo flat-plane V8; 5MT                 | Rosso Corsa or H.Q. BLUE, K's model; paired round rear lamps            |
| PORSCHE_928_S_1984         | 1984 MY US 928 S                                     | M28.19, 4664 cc SOHC 16-valve V8; 5MT                           | Red early body, rubber bumper trim and small spoiler                    |
| TOYOTA_PICKUP_1980         | 1980 MY US 49-state RN42, regular cab, long bed, 2WD | 2189 cc 20R SOHC four; 4MT                                      | Open long bed, separate upright cab, rectangular lamps                  |
| FERRARI_F40_1988           | 1988 European F40, non-catalyst, fixed ride height   | F120-family 2936.25 cc twin-turbo flat-plane V8; 5MT            | Red, high fixed wing, round rear lamps, three exhaust outlets           |
| PORSCHE_959_1987           | 1987 European 959 Komfort, left-hand drive           | 2849 cc twin-turbo flat six; G59.01 G+5 MT, AWD                 | White, covered oval lamps and integrated rear wing                      |
| CORVETTE_C4_1984           | 1984 MY US Base Coupe, 1YY07                         | L83 5733 cc Cross-Fire V8; Doug Nash 4+3                        | Blue early C4, four round rear lamps, no high-mounted stop lamp         |
| AUSTIN_MINI_850_1964       | Early 1964 UK standard Austin Mini 850, A-A2S7       | 848 cc A-series OHV four; 4MT, rubber-cone suspension           | Green, short upright two-door saloon; not a Cooper                      |
| WRANGLER_YJ_1995           | 1995 MY US Wrangler S YJ, soft top                   | 2464 cc MPI four; AX-5 5MT                                      | Tan, rectangular headlights, family cage, rear spare and high stop lamp |
| CHEVROLET_NOVA_1975        | 1975 MY US Nova 4-Door Sedan, 1XX69                  | LM1 5735 cc OHV V8, 4-bbl; Turbo Hydra-Matic, 3.08 axle         | Red, K's model; four-door body, chrome bumpers, no plates or badges     |
| CHEVROLET_NOVA_POLICE_1975 | The Nova of 1975 as a police car (1XX69, not 9C1)    | The Nova of 1975's, the same file's values                      | Black and white, K's model; door stars, a roof lamp                     |

The supplied report's year choices are selections, not new identifications of the arcade sprites. In particular, The
Countach's 1985 is K's choice (2026-11-22), not a claim about the arcade original; the GTO's 1984, its debut year, is
K's choice (2026-11-22) likewise; YJ 1995 postdates the games. The F40 is K's 1988 choice. The 1984 C4 intentionally
substitutes a production-volume choice for an arcade appearance that may be 1986 or later. No annual production count is
asserted by these runtime definitions.

K takes CHASE H.Q.'s rival for the Lotus Turbo Esprit of 1984, United Kingdom, Type 82 (K, 2026-11-22);
nothing here claims the original says so.

K takes the car chased in CHASE H.Q.'s second stage for the Lamborghini Countach 5000 QV of 1985, Europe
(K, 2026-11-23); nothing here claims the original says so.

K takes the car chased in CHASE H.Q.'s fourth stage for the Ferrari GTO of 1984, Europe
(K, 2026-11-23); nothing here claims the original says so.

Except the 959's, the 928 S4's, the F40's, the Turbo Esprit's, the Countach's, the 911 Turbo 3.3's, the GTO's and the
two Novas of 1975's, the four palettes are game colors, without verified period paint codes; the police car's four
liveries are K's, not claims of any department's colors. The stock-named palette key means the default game palette.
The GTO has two colors: ROSSO CORSA, the real car's, and H.Q. BLUE, the arcade original's blue, which is not a factory
color ([item 18](#evidence-actually-consulted)).

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
- The police Nova's roof lamp is part of its pictures. It does not introduce flashing, sirens or pursuit AI.

## Numerical conventions and remaining uncertainty

Each run has one fixed 75 kg driver and no passengers or cargo. Published curb/ready masses are used as
qualified below; fuel and fluids already in those masses are not added again. For the GTO only,
Ferrari's dry mass is converted using 120 L fuel at an estimated 0.75 kg/L plus 15 kg of other fluids,
then the driver. The F40's 1,235 kg is K's base ([below](#ferrari-f40-of-1988-sources-versus-authored)). Consumption and changing fuel mass are not simulated.

Mass bases before the driver are S4 1590, Esprit 1220, Countach 1490, 930 1335, GTO 1265, early 928 S 1520,
Pickup 1118.1, F40 1235, 959 Komfort 1600 (K's, [below](#porsche-959-of-1987-sources-versus-authored)), C4 1370, Mini 630, YJ 1331 and the two Novas of 1975 1616 kg.
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

The 928 S, Mini and Toyota still lack a read, exact-year primary gearbox ratio table (the Esprit's
ratios are Autocar's road-test tables, and the Countach's the period catalogue's, below). Their provisional ratios are explicit engineering estimates, not borrowed verified facts from
another year. The F40 uses gear pairs 2.769/1.722/1.227/0.963/0.767 and the European effective final reduction
`(30/11)*(28/21)`; the transfer reduction is folded into the existing single final-drive field. The GTO manual's
published ratios already include its transfer gears and therefore must not receive that factor a second time.
The 928 final reductions distinguish US S4 2.20 and 1984 US S 2.36. The S4's gears are the 1987 US G28/13's
4.067/2.714/1.934/1.463/1.000 ([below](#porsche-928-s4-of-1987-sources-versus-authored)), which already include the
gearbox's 33/21 countershaft pair and must not receive it again; the 928 S's intermediate gear set remains
provisional. The 959's six ratios are its G59.01's tooth counts as the stage auditor read them
([below](#porsche-959-of-1987-sources-versus-authored)). The two Novas of 1975's three ratios and axle are GM's
([below](#chevrolet-nova-of-1975-sources-versus-authored)).

## Evidence actually consulted

Accessed 2026-10-23 UTC. Search snippets, blocked URLs and unread manuals are not treated as source verification.
The numeric ledger distinguishes `source verified`, `calculated`, `engineering estimate` and `game design`, and for
the 959, the 928 S4, the F40 of 1988 and the Novas of 1975 `source (auditor)`: the stage auditor's reading, not read for
the PR that wrote it ([959](#porsche-959-of-1987-sources-versus-authored),
[928 S4](#porsche-928-s4-of-1987-sources-versus-authored), [F40](#ferrari-f40-of-1988-sources-versus-authored),
[Nova](#chevrolet-nova-of-1975-sources-versus-authored)); the 911 Turbo 3.3's colors (item 17) and the GTO's (item 18)
are the auditor's reading likewise.
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
   tracks, wheelbase, tires and 120 L tanks. The GTO's dimensions are the period owner's manual's
   (Cat. 345/85) 4225/1850/1150 mm, K's choice (2026-11-22); the FIA form B-273 gives 4280 mm long and 1850 mm wide,
   Ferrari's present page 4290/1910/1120 mm. The three are not reconciled. The manual's width was read here earlier as
   1880 mm; the scan could not be reached again to check it, and K's reading, 1850 mm, agrees with the FIA form.
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
   exact-year application still provisional where noted in the CSV. The 930's anchor is the European 930/66's 300 PS at 5500 and 430 Nm at 4000 (MF-6a), no longer the US 282 hp. The QV's carburetted 455 PS is distinct from
   the US injected 420 hp. The 959's mass is K's 1,600 kg ([below](#porsche-959-of-1987-sources-versus-authored)), no longer the 1450 kg Komfort curb mass first adopted.
9. **Mini secondary specifications**, [Mini 850](https://www.uniquecarsandparts.com/mini_850_technical_specifications.htm).
   Mixed-market page supports the 848 cc OHV family and approximate envelope, but is not an exact early-1964
   UK homologation. The 34 hp/5500, 44 lb-ft/2900, 8.3:1, curb mass and gearbox choices remain estimates.
   The contradictory SOHC description and later/Australian gear ratios are not adopted as verified UK data.
10. **Nova production records**, [NovaResource](https://www.novaresource.org/production.htm), supported the supplied
    1977 family/engine selection of the two Novas of 1977, which the Novas of 1975 replaced (NV-1, NV-2); no value now
    rests on them.

11. **Turbo Esprit, UK, road tests and parts** (MF-4, 2026-11-22). Autocar's December 1984 road test of the UK
    Turbo Esprit ([text](https://www.lotusespritturbo.com/Lotus_Turbo_Esprit_Road_Test_1984.htm)): 210 bhp at 6,250,
    200 lb-ft at 4,500, 7.5:1, 8 psi, 22.7 mph per 1,000 rpm in fifth. Autocar's Turbo HC table
    ([text](https://www.lotusespritturbo.com/Lotus_Turbo_Esprit_HC_Road_Test.htm)): 2.92/1.94/1.32/0.97/0.76, final
    4.38, the same box (fifth's 22.7 mph agrees); the digits from the same box's 1983 listing
    ([motormatchup](https://www.motormatchup.com/catalog/Lotus/Esprit-Turbo/1983/2DR-Coupe)). Motor Sport, September
    1981 ([text](https://www.motorsportmagazine.com/archive/article/september-1981/48/lotus-esprit-turbo/)): over
    140 lb-ft at 2,500 rpm and a two-branch manifold straight to the turbo; about 100 lb-ft at 2,000 and the 4 into 2
    ([projectm71](https://www.projectm71.com/TurboEsprit.html)). UK mass and dimensions
    ([ultimatespecs](https://www.ultimatespecs.com/car-specs/Lotus/132269/Lotus-Esprit-Turbo-22i.html)). The sound's
    valve sources: the exhaust valves ([datasheet](https://lotusmarques.com/parts/datasheets/841-lotus-esprit-turbo-exhaust-valves))
    and the cam ([table](https://users.ox.ac.uk/~ohare/engine.htm)).

12. **Countach 5000 QV of 1985** (MF-5, 2026-11-22). K's note of the period catalogue gives the gears
    2.232/1.625/1.088/0.858/0.707 and final 4.091 (45/11); two specification pages agree
    ([tripod](https://lamborghinicars.tripod.com/countachlp500qv.html),
    [supercars.net](https://www.supercars.net/blog/1985%E2%86%921988-lamborghini-countach-lp5000-qv/)). Dimensions,
    overhangs and weight split ([lambocars](https://www.lambocars.com/countach-lp500-quattrovalvole-specs-performance/)):
    the catalogue and several sources give a 2,500 mm wheelbase, but their overhangs (933 and 757 mm) and length
    (4,140 mm) give 2,450 mm, which stays. No redline source was found (an ignition box's 7,800 rpm limit on a forum and
    the catalogue's top speed in fifth at 7,300 rpm); 7,500 rpm stays. The sound's valve sources: the
    valve sizes ([supercarnostalgia](https://supercarnostalgia.com/blog/lamborghini-countach-quattrovalvole)), the cam's
    lift and duration ([Web Cam](https://www.webcamshafts.com/pages_vehicles/automobile/lamborghini/2663.html)) and the
    cam timing and clearance on a forum
    ([thread](https://www.lamborghinichat.com/forum/threads/countach-technical-thread-questions.402160/page-13)).

13. **911 Turbo 3.3 of 1986, European** (MF-6, 2026-11-22). The year and the market are K's choices (the most
    numerous European and other-market coupé year, by chassis-number tallies at
    [turbosition](https://www.turbosition.com/en/porsche-930/chassis-numbers), not the maker's figures), not a claim
    about the arcade car. European figures, 300 PS at 5,500, 430 Nm at 4,000, 1,335 kg, 4,291 mm, 2,272 mm, 930/66
    ([auto-data](https://www.auto-data.net/en/porsche-911-coupe-type-930-3.3-turbo-300hp-manual-5-speed-6654),
    [ultimatespecs](<https://www.ultimatespecs.com/de/car-specs/Porsche/239048/Porsche-911-Coupe-(911-series)-33-Turbo-4-speed.html>));
    a 1986 European car with the M930/66 engine and the 930/36 box
    ([classic driver](https://www.classicdriver.com/de/car/porsche/911-turbo/1986/1085571)). The torque curve's 950,
    3,000 and 6,800 rpm points are estimates (owners' boost figures by speed; no curve was found).

14. **GTO of 1984** (MF-7, 2026-11-22). The owner's manual (Cat. 345/85, K's note): idle 950 ± 50 rpm warm, rear
    tyres 255/50 VR16 (Goodyear); a parts list correction of 22 October 1985 adds Pirelli P7 with 265/50 VR16 rear
    "upon request". The dry 1,160 kg ([SB Race Engineering](https://sbraceengineering.co.uk/ferrari-specialists/ferrari-models-1980-to-1989/ferrari-gto/),
    [Octane](https://www.octane-magazine.com/articles/features/ferrari-288-gto-driving-and-celebrating-the-legend/),
    "without fluids") stays the base; the manual's English column calls it curb weight. The torque curve's 950 and
    3,000 rpm points are estimates (no curve was found; Octane describes a flat low end and a dramatic rise from 4,000
    rpm). The sound's valve source: the F40's
    cam timing ([thread](https://www.ferrarichat.com/forum/threads/288-and-f40-cam-specs.473123/)).

15. **Turbo Esprit's colors** (E82-1, 2026-11-23), the stage auditor's reading; neither list was reachable from
    E82-1's environment. Lotus's paint codes, the A series being the two-pack paints from about 1977
    ([SELOC wiki](https://wiki.seloc.org/a/Paint_codes)): A02 Black, A21 Monaco White (earlier L25), A23 Calypso Red
    (earlier L42), A42 British Racing Green, a metallic. A paint seller's list by year
    ([chipfixx](https://www.chipfixx.ca/pages/lotus-paint-codes)): Black, Calypso Red and Monaco White 1980–1989, A42
    as "Racing Green" 1984–1987. Both lists are Lotus's for every model, not the colors offered on the Turbo Esprit.
    Cars of 1984 described for sale: two Calypso Red Turbos, and a Turbo bought new from the works in British Racing
    Green in December 1984. Other colors of about 1984 in the same lists, not taken: Silver Diamond (A03), Silver Frost
    (A45), Essex Blue (A34), Bermuda Blue (A06), Lotus Yellow (A22) and Jupiter Red (A30). The 1984 UK catalogue's
    color table, the primary source, was not read. The base colors are provisional, not measured from paint samples
    ([Model solids](image-assets.md#model-solids)).

16. **Countach 5000 QV of 1985's colors** (C5K, 2026-11-23), the stage auditor's reading, not read for the PR that
    wrote it. An owner's post quoting the 1986 Countach QV color chart lists Rosso Siviglia (PPG 2.464.022), Nero
    Tenebre (PPG 2.467.026) and Bianco Polo Park (PPG 2.461.025) among its standard colors
    ([post](https://www.ferrarichat.com/forum/posts/144283719)); the auditor did not see the chart itself. A sale's
    description gives a QV in Giallo Fly ([classic driver](https://www.classicdriver.com/en/node/1121057)), and Giallo
    Fly is said to have been rare on the QV; the yellow is K's choice (MF-5). The black is found written both Nero
    Tenebre and Nero Tenebra; the post quoting the chart writes Tenebre, which is taken. No 1985 European color chart, a
    primary source, was read, so whether all four were offered on the 1985 European car is not checked. The base colors
    are the auditor's, not measured from paint samples.

17. **911 Turbo 3.3 of 1986, colors** (Stage P930, the stage auditor's reading of 2026-11-23; the pages could not
    be reached from the environment of the PR that wrote this item). Porsche's 1986 paint lists name Guards Red, Black,
    Silver Metallic and Grand Prix White
    ([paintscratch](https://paintscratch.com/touch_up_paint/Porsche/1986-Porsche-All-Models.html),
    [Unique Cars and Parts](https://uniquecarsandparts.com.au/colour_swatch_porsche_1986): Grand Prix White 908 / P5).
    A 930 color table ([turbosition](https://www.turbosition.com/porsche-930/color-red)) gives 027, Indischrot, as
    Guards Red, 1976 to 1986; Black is 700 / A1. Silver Metallic's 1986 code differs between sources (L936 and 980) and
    is not fixed here; its name is the same. No 1986 European color list, the primary source, was read.

18. **GTO of 1984, colors** (Stage F114, the stage auditor's reading of 2026-11-24; the pages could not be reached from
    the environment of the PR that wrote this item). Most sources say every production GTO was painted Rosso Corsa
    ([Wikipedia](https://wikipedia.com/wiki/288_GTO),
    [Ferrari's magazine](https://ferrari.com/en-BY/magazine/articles/ferrari-colors-rosso-portofino-rosso-corsa-racing-red),
    which says the 288 GTO came in this red alone, and
    [Supercar Nostalgia](https://supercarnostalgia.com/blog/ferrari-288-gto)). Its paint is given as Rosso Corsa
    FER 300/6 for 1984 to 1989 in owners' posts, one by Marcel Massini and one quoting Keith Bluemel's book
    ([post](https://www.ferrarichat.com/forum/posts/146326817), [post](https://www.ferrarichat.com/forum/posts/146912517));
    the same posts say three cars (47647, 47649 and 47711) were Rosso Chiaro, and another says a book gives 300/9
    ([thread](https://www.ferrarichat.com/forum/threads/288-gto-color-code.563599)), so the code is not fixed here; the
    name is the same. The factory's color table, the primary source, was not read. H.Q. BLUE is not a real car's color
    and has no source: its base color is the earlier procedural set's blue. Both base colors are the auditor's,
    provisional, not measured from paint samples.

Conflicting secondary Countach pages mix incompatible bore, gearbox, power-unit and performance figures;
they are not blanket authorities for this data. An Esprit page labelled simply “Turbo” actually describes
the 1987 Stevens body and is not the 1984 geometry source. Unread F40 racing tables and a later owner's manual
are not evidence for the selected 1988 non-catalyst road specification.

## Pictures and sound

[Shape authoring](../tools/graphics/chase-turbo-shapes.ts) creates original surface samples in metres for five of the
cars; the 959's pictures are baked from K's model instead, in its four period colors, the 928 S4's in eight Porsche
colors, the F40's in one, ROSSO CORSA, the Turbo Esprit's in four Lotus colors, MONACO WHITE the default, the Countach's
in its four real colors, GIALLO FLY the default, the 911 TURBO 3.3 of 1986's in four Porsche colors
([below](#porsche-911-turbo-33-of-1986-the-third-stages-car)), the GTO's in two, ROSSO CORSA the default
([below](#ferrari-gto-of-1984-the-fourth-stages-car)), the Nova of 1975's in eight GM colors, RED the default, and its
police car's in four, BLACK & WHITE the default ([below](#chevrolet-nova-of-1975-sources-versus-authored);
[Model solids](image-assets.md#model-solids)). Those samples go through the existing shared camera, palette, shadows,
sprite and six-LOD baker. Each of the five has 64 yaw
pictures, one bank, four palettes and the existing brake-lamp slot. No source photograph, ROM image or downloaded manual
image is redistributed. Facet locations, window proportions, lights, rims, paint and details are visual estimates; this
is not a dimensioned CAD reconstruction. Dimensions include a provisional visual envelope, so tiny mirrors, lamps or the
spare can extend slightly beyond the nominal body panel dimensions.

Each car has its own sound with its cylinder count and evenly spaced firing phases. Ferrari flat-plane banks alternate;
the two 928s route 1-3-7-2-6-5-4-8 by banks 1–4/5–8, while Chevy V8s route 1-8-4-3-6-5-7-2 by odd/even banks. Flat
sixes and V12 use alternating banks. Except the S4's, the F40's and the Novas of 1975's, whose sources are given below,
all valve openings and diameters are estimates. They are synthesized approximations, not recordings. No siren, turbo
sound process or physics is added.

The exhausts are written as the exhaust kernel reads them: one diameter and tubes that have only a length
([Audio](audio.md#observations-and-engine-sounds)). The exhausts as first written, and their sources, are in
`sayaborg/callcutter`, with this document as it stood at `f196885` (`origin/docs/chase-turbo-vehicles.md`).

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
- The engine sound's two exhaust valves of each cylinder are one of their combined area: two of 33 mm (the 928
  four-valve head's, whose seat the 959 shares; the 959's own valve not confirmed) give 46.7 mm. The valve's opening
  (0.36 of the cycle, about 260 degrees) is an estimate.
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

### The 928 S4 in the current model

- The sound writes the two valves of a cylinder as one of their combined area.
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
- Valves, owners' and vendors' figures: [the cams](https://rennlist.com/forums/928-forum/1287743-928-gt-cams-2.html) and
  [the exhaust valves](https://www.design911.com/porsche/928gt-5-0l-1989-91/porsche-engine-valves-guides-and-springs/).

## Ferrari F40 of 1988: sources versus authored

K takes TURBO OUTRUN's car for the Ferrari F40 of 1988, European specification (K, 2026-11-19); nothing here claims
the original says so. `FERRARI_F40_1988` is an ordinary European road car of 1988 without catalyst, with left-hand drive,
the fixed ride height and the five-speed manual; it mends the earlier 1990 entry rather than adding a second F40. Its
numbers follow this ledger's [conventions](#numerical-conventions-and-remaining-uncertainty).

The source column is the stage auditor's reading (2026-11-19 and 2026-11-20) of the pages listed [below](#f40-sources);
the PRs that wrote this section could not reach them, so none is marked as read here: their class is `source (auditor)`. K's decisions are the year and
market, the 1,235 kg base and the European gearing; the auditor's choice is the nominal wheel radii.

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

### F40 sound

The engine sound's valve and firing, as the auditor read them:

| Part           | Written                                                                            | Class                        |
| -------------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| Exhaust valves | Two of 26 mm a cylinder (FIA form): equal-area 36.8 mm; lift taken ≥ 6.5 mm        | source (auditor), calculated |
| Valve timing   | 54° BBDC / 10° ATDC at 0.5 mm, read as the Testarossa's: about 280°, `open` 0.3889 | source (auditor), calculated |
| Firing order   | 1-5-3-7-4-8-2-6, the banks alternating: phases unchanged                           | source (auditor)             |

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
and [a road test's figures as quoted](https://www.gtplanet.net/forum/threads/difficult-car-ferrari-f40.310621/); the
1,235 kg is from a
specification table of the 1988 car (cars-data).

## Porsche 911 Turbo 3.3 of 1986: the third stage's car

K takes the car chased in CHASE H.Q.'s third stage for the Porsche 911 Turbo 3.3 of 1986, Europe
(K, 2026-11-23); nothing here claims the original says so. It is the existing `911_TURBO_3_3_1986`, the 1986 European
car with the 4MT (MF-6, [item 13](#evidence-actually-consulted)), not a vehicle added again; its driving and sound are
unchanged.

- Its pictures are baked from K's model ([Model solids](image-assets.md#model-solids)), no longer generated from four
  views. The model was made to this ledger's dimensions (4,291 × 1,775 × 1,310 mm, 2,272 mm wheelbase, 1,432 / 1,501 mm
  tracks); its overhangs, 936 and 1,084 mm, not fitted, are within 4 mm of auto-data's 932 and 1,087 mm. Its wheels are
  the tires' nominal size (205/55 VR16 and 245/45 VR16: 0.316 and 0.3135 m), while its driving keeps 0.304 and 0.306 m.
- Its four colors keep their keys and the silver default; their names are Porsche's: SILVER METALLIC, BLACK, GUARDS
  RED and GRAND PRIX WHITE ([item 17](#evidence-actually-consulted)). Their base colors are provisional, the 928 S4's of
  the same names, not measured from paint samples; whether all four were offered on the 1986 European car is not
  checked against a primary source.
- The rear track: 1,501 mm is auto-data's four-speed entry; carsales and auto-data's five-speed entry give the 1986 car
  1,492 mm. The definition keeps 1,501 mm.
- The rear band is a dark grey where the real car has a red reflector; the turbo script and the band's lettering are
  rough, as the model has them.

## Ferrari GTO of 1984: the fourth stage's car

K takes the car chased in CHASE H.Q.'s fourth stage for the Ferrari GTO of 1984, Europe (K, 2026-11-23); nothing here
claims the original says so. It is the existing `FERRARI_GTO_1984`, the 1984 European car with the 5MT (MF-7,
[item 14](#evidence-actually-consulted)), not a vehicle added again; its driving and sound are unchanged.

- Its pictures are baked from K's model ([Model solids](image-assets.md#model-solids)), no longer drawn by
  [shape authoring](../tools/graphics/chase-turbo-shapes.ts). The model was made to this ledger's dimensions (4,225 ×
  1,850 × 1,150 mm, 2,450 mm wheelbase, 1,559 / 1,562 mm tracks); its overhangs, 1,021 and 754 mm, were not fitted nor
  compared with a source. Its wheels are the tires' nominal size (225/50 VR16 and 255/50 VR16: 0.3157 and 0.3307 m),
  while its driving keeps 0.305 and 0.319 m.
- Its two colors (K, 2026-11-24) are ROSSO CORSA, the real car's red and the default, and H.Q. BLUE, the arcade
  original's blue, not a factory color; the four game colors are gone ([item 18](#evidence-actually-consulted)).
  Their base colors are the auditor's, provisional.
- The outer tail lamps' amber is drawn grey, as every color that is neither paint, glass nor brake lamp; the grille's
  horse is rough, as the model has it.

## Chevrolet Nova of 1975: sources versus authored

`CHEVROLET_NOVA_1975` is the 1975 US Chevrolet Nova 4-Door Sedan (1XX69) with the LM1 350 4-barrel V8, the Turbo
Hydra-Matic and a 3.08 axle (K, 2026-11-26), in the place of the 1977 Nova 250; nothing here claims the arcade
original says so. Its listing selects the LM1, the Turbo Hydra-Matic and the 3.08 axle; its engine is shown as `V8`. It
keeps the Nova 250's place in the selection order and in TURBO OUTRUN's traffic. Its numbers follow this ledger's
[conventions](#numerical-conventions-and-remaining-uncertainty); the estimates among them add no formula or rule and no
exception for this car.

The source column is the stage auditor's reading (2026-11-26) of GM's 1975 Chevrolet Nova Vehicle Information Kit
(September 1974, GM Heritage Archive, [PDF](https://www.gm.com/content/dam/company/no_search/heritage-archive-docs/vehicle-information-kits/chevrolet/1975-Chevrolet-Nova.pdf)),
not read for the PR that wrote this section.

| Item                  | Source (auditor's reading)                                                    | Authored `CHEVROLET_NOVA_1975`                                                                 | Class       |
| --------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| Length, width, height | 196.7 / 72.2 / 53.6 in (L103, W103, H101; four-door)                          | 4.996 / 1.834 / 1.361 m                                                                        | source      |
| Tracks, wheelbase     | 61.3 / 59.0 in (W101, W102); 111.0 in (L101)                                  | 1.557 / 1.499 m; 2.8194 m                                                                      | source      |
| Mass                  | 1XX69 curb 3,416 lb (1,810 front, 1,606 rear); LM1 and Turbo Hydra-Matic +147 | **1,691 kg**: 3,563 lb (1,616 kg) + the driver                                                 | source      |
| Axles                 | —                                                                             | **1.2882 / 1.5312 m** from the CG: front share 0.543, the 147 lb taken 85 % on the front       | estimate    |
| Engine                | 350 cu in (5,735 cc), 4.00 × 3.48 in, 8.5:1; idle 600 rpm in D                | 5,735 cc, `cycle` 4, 8.5, idle 600 rpm                                                         | source      |
| Power, torque         | 155 hp at 3,800, 250 lb-ft at 2,400 (SAE net)                                 | Point 2: 338.954487 N m at 2,400; point 3: 290.451884 N m at 3,800                             | source      |
| Curve's other points  | —                                                                             | 196.593602 at 600 and 288.111314 at 1,500 (0.58 and 0.85 of point 2's), 238.170545 at 4,400    | estimate    |
| Redline               | —                                                                             | **4,400 rpm**: at 4,500 the curve's greatest power would not fall at 3,800 rpm                 | estimate    |
| Transmission          | Turbo Hydra-Matic 2.52 / 1.52 / 1.00; axle 3.08 (MVMA p. 19; Power Trains)    | The same three ratios and final, shifted by the existing automatic shifts                      | source      |
| Tires                 | FR78-14                                                                       | Radii **0.3316 m** (0.663 m across, as a 205/75-14); inertias `25r²` / `27r²` = 2.749 / 2.969  | estimate    |
| Drag, CG height       | —                                                                             | `q = 0.5 × 1.225 × 1.0 m²` = 0.6125 kg/m; 0.55 m, as the Nova 250's                            | estimate    |
| Inertias              | —                                                                             | Box estimates 3,991 / 3,778 kg m²                                                              | calculated  |
| Brakes                | —                                                                             | 1,691 × 11.5 m/s², 65:35, × 0.3316 m, to 25 N m: 4,200 / 2,250 N m                             | game design |
| Suspension            | —                                                                             | 1.5 Hz, 0.4, 0.3 m                                                                             | game design |
| Firing                | 1-8-4-3-6-5-7-2; left bank 1-3-5-7, right 2-4-6-8                             | `firingPhases` by eighths; the left bank to junction 0, the right to 1                         | source      |
| `exhaust.valve`       | 1.495–1.505 in, lift 0.4100 in; 78 BBDC / 30 ATDC (MVMA p. 9)                 | 0.0381 m, `open` 0.4 (288 / 720)                                                               | source      |
| `exhaust.diameter`    | Crossover 2.00 in, the pipes behind it 2.25 in, outside                       | **0.043 m**: the cast manifold's branch, about 38 mm inside, × 1.14                            | estimate    |
| `exhaust.tubes`       | Single exhaust, crossover, one converter, a reverse-flow silencer, two tails  | Each bank 0.20 / 0.10 / 0.10 / 0.20 m; crossover 1.0 m; one of **5.03 m**; two tails of 0.35 m | estimate    |

### The Nova of 1975 in the current model

- Its three forward gears are shifted by the existing automatic shifts, as every car's; the torque converter is not
  represented, and its tire is the default tire. Its sound's note gives every exhaust number's basis; the tubes' lengths
  and the diameter are estimates.
- Its pictures are baked from K's model in eight GM colors, RED the default, at a spacing of 0.004 m
  ([Model solids](image-assets.md#model-solids)); the number plates and badges are flat and blank.

### The Nova of 1975 on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts, not compared with the real
car's figures and not tuned:

| Measure                        | Measured                                                   |
| ------------------------------ | ---------------------------------------------------------- |
| 0–100 km/h                     | 10.25 s (60 mph in 9 to 10 s)                              |
| 0–400 m, 0–1,000 m             | 17.6 s, 32.0 s (between 1 s samples)                       |
| Speed after 240 s              | 185.2 km/h in third at 4,589 rpm, above the 4,400 rpm line |
| Redline speeds, first to third | 71, 117, 179 km/h                                          |
| Shifts                         | 71 and 118 km/h, at 5.9 and 13.7 s                         |
| Braking from 100 km/h          | 2.48 s, 35.0 m                                             |

It launches, shifts through all three gears and restarts from rest (86 km/h 8 s after stopping).

### The police Nova of 1975

`CHEVROLET_NOVA_POLICE_1975` is the Nova of 1975 as a police car (K, 2026-11-26), in the place of the police Nova of
1977: its definition is a second file of the same values, which a test holds equal, its listing names the Nova's sound,
and it keeps its predecessor's place in the selection order (45). 9C1's equipment, tyres, brakes and added mass are not
followed (K), so on the flat it measures as the Nova. It differs in its pictures alone: baked from K's second model, the
Nova's body with five boxes of roof lamp, in four liveries, BLACK & WHITE the default
([Model solids](image-assets.md#model-solids)). No series runs it yet.

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
torque curve, redline or rev limit, gear ratios, mass, dimensions, tires, or port areas.

The stage auditor's other starting points (2026-11-19), not read for these PRs:
[1987 North American specifications](https://www.automobile-catalog.com/car/1987/1639295/mazda_rx-7_turbo_ii.html),
[a transcription of the US specifications and ratios](https://www.rotarycarclub.com/rotary_forum/showthread.php?p=44127),
[the launch drag coefficient](https://features.csmonitor.com/1985/1107/hmazda.html) and
[1987 Mazda paint codes](https://paintref.com/cgi-bin/colorcodedisplay.cgi?manuf=Mazda&model=&year=1987).

## Volkswagen Beetle 1500 of 1968: sources versus authored

K takes OUT RUN's traffic Beetle for the Volkswagen Beetle 1500 of 1968 (K, 2026-11-24); nothing here claims the
original says so. `VOLKSWAGEN_BEETLE_1500_1968` is the 1968 model year's Type 1 / 113 Deluxe Sedan as sold in the US:
left-hand drive, the air-cooled 1,493 cc flat four, a four-speed manual and rear drive with the swing axle, without a
sunroof, with the upright "iron" tail lamps. Its listing selects the US car and the 4MT; its engine is shown as `F4`.
FREE PLAY's classes offer it through catalog membership, as every vehicle. Its numbers follow this ledger's
[conventions](#numerical-conventions-and-remaining-uncertainty); the estimates among them add no formula or rule and no
exception for this car.

K's decisions (2026-11-24) are the year and the specification, that it replaces the Mini 850 in OUT RUN's traffic, the
rear indicators as the model has them and the torque curve from the DIN figures. The source
column is the stage auditor's reading (2026-11-24) of parts sellers', magazines' and enthusiasts' pages, not read for
the PRs that wrote this section. The primary source, the 1968 owner's manual's tables, was a PDF without text, which the
auditor could not read.

| Item                  | Source (auditor's reading)                                                                     | Authored `VOLKSWAGEN_BEETLE_1500_1968`                                                         | Class                 |
| --------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------- |
| Length, width, height | 4,031 / 1,549 / 1,501 mm                                                                       | 4.031 / 1.549 / 1.501 m                                                                        | source                |
| Wheelbase             | 2,400 mm                                                                                       | Axles **1.392 / 1.008 m** from the CG: a rear share of 0.58 (no axle loads were read)          | source, estimate      |
| Tracks                | 1,311 / 1,350 mm                                                                               | 1.311 / 1.35 m                                                                                 | source                |
| Mass                  | 820 kg (792 to 821 kg by source)                                                               | **895 kg**: 820 + the 75 kg driver                                                             | source, calculated    |
| Engine                | Air-cooled flat four, OHV, 1,493 cc (83 × 69 mm), 7.5:1; idle 800 to 950 rpm                   | 1,493 cc, `cycle` 4, 7.5, idle 850                                                             | source                |
| Power, torque         | 44 PS DIN at 4,000 rpm, 100 N m at 2,000 rpm (K: DIN); 53 bhp SAE at 4,200, 78 lb-ft at 2,600  | Point 2: 100 N m at 2,000; point 3: 77.258453 N m at 4,000 (44 PS); the SAE figures not used   | source, K, calculated |
| Curve's other points  | —                                                                                              | 58 N m at 850 and 85 at 1,425 (0.58 and 0.85 of point 2's), 63.351931 at 4,500 (0.82 of 3's)   | estimate              |
| Redline               | No tachometer                                                                                  | **4,500 rpm**, a little above the power's                                                      | estimate              |
| Transmission          | 3.80, 2.06, 1.26, 0.89; final 4.125 (8:33)                                                     | As the source                                                                                  | source                |
| Tires                 | 5.60-15 on 4J × 15                                                                             | Radii 0.31 m (nominal 0.326, less the load's squash); inertias `25r²` / `27r²` = 2.403 / 2.595 | source, estimate      |
| Drag                  | —                                                                                              | `q = 0.5 × 1.225 × 0.48 × 1.80 m²` = **0.5292 kg/m**; Cd and the frontal area are estimates    | estimate              |
| CG height             | —                                                                                              | 0.53 m                                                                                         | estimate              |
| Inertias              | —                                                                                              | Box estimates **1,391 / 1,380 kg m²**                                                          | calculated            |
| Brakes                | —                                                                                              | 895 × 11.5 m/s², 65:35, × 0.31 m, to 25 N m: **2,075 / 1,125 N m**                             | game design           |
| Suspension            | Swing axle at the rear                                                                         | 1.5 Hz, 0.4, 0.3 m; the swing axle is not represented                                          | game design           |
| Valves                | Intake 35.5 mm, exhaust 32 mm, one each a cylinder; exhaust 44.5° BBDC to 4° ATDC at 1 mm lift | `valve` 0.032 m, `open` 0.3174 (228.5 / 720)                                                   | source                |
| Firing                | 1-4-3-2, at even intervals                                                                     | `firingPhases` 0, 0.25, 0.5, 0.75                                                              | source                |

### Representation in the current model

- Its four forward gears are shifted by the existing automatic shifts, as every car's. The swing axle's camber change
  and the rear engine's other effects beyond its mass share are not represented; its tire is the default tire.
- The torque curve is drawn from the DIN figures (K, 2026-11-24), not the US car's SAE gross ones.
- The valve's opening, 0.3174, is the cam's opening at 1 mm lift, so it is shorter than the other sounds' openings, which
  are taken seat to seat; the nominal opening was not found.
- Its pictures are baked from K's model in seven 1968 Beetle colors, SAVANNA BEIGE the default
  ([Model solids](image-assets.md#model-solids)); the wheels drawn are the tyre's nominal size, 0.326 m, while its
  driving keeps 0.31 m. The rear indicators above the tail lamps are amber, as the model has them (K); the 1968 US car's
  were red, amber from 1973.

### The Beetle on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts, not compared with the real
car's figures, which were not looked up, and not tuned:

| Measure                         | Measured                                                        |
| ------------------------------- | --------------------------------------------------------------- |
| 0–100 km/h                      | 20.3 s (60 mph in about 18.4 s)                                 |
| Quarter mile                    | About 21.1 s, at about 101 km/h (between the run's 1 s samples) |
| Speed after 240 s               | 129 km/h in fourth at 4,070 rpm, below the redline              |
| Redline speeds, first to fourth | 34, 62, 101, 143 km/h                                           |
| Shifts                          | 34, 62 and 101 km/h, at 2.7, 7.1 and 21.1 s                     |
| Braking from 100 km/h           | 2.57 s, 36.0 m                                                  |

It launches, shifts through all four gears and restarts from rest (65 km/h 8 s after stopping).

### The Beetle's sources

The stage auditor's reading (2026-11-24) of parts sellers', magazines' and enthusiasts' pages, not read for these PRs;
the pages are not listed here. The
1968 owner's manual's tables, the primary source for the mass and the axle loads, were not read. Not decided, for K
([NEXT](NEXT.md#stage-vw113--the-beetle-1500-of-1968-in-out-runs-traffic)): the estimates above and the valve's opening.

## Ford F-150 of 1975: sources versus authored

K takes OUT RUN's traffic pickup for the Ford F-150 of 1975 (K, 2026-11-25); nothing here claims the original says so.
`FORD_F_150_1975` is the 1975 Custom Regular Cab Styleside 4×2 on the 133 in wheelbase, the sixth-generation F-Series'
first F-150 in its first year: the 300 cu in inline six, the three-speed column manual and rear drive. Its listing
selects the 300 Six, the Regular Cab Styleside 4x2 and the 133 in wheelbase with the 3MT; its engine is shown as `I6`.
FREE PLAY's classes offer it through catalog membership, as every vehicle. Its numbers follow this ledger's
[conventions](#numerical-conventions-and-remaining-uncertainty); the estimates among them add no formula or rule and no
exception for this car.

K's decisions (2026-11-25) are the year and the specification, that it replaces the TOYOTA PICKUP in OUT RUN's traffic,
the dimensions as the sources give them, the model's large mirrors and rear step bumper (both options) kept, the
tailgate's outer face and both bumpers made smooth (the FORD lettering's relief and color gone), the box's inside in
the body's color, the rear bumper moved to the drawing's 25 mm behind the box, the tyres round and on the road, the
pictures' spacing (0.004 m) and the run after the manifold written as one tube. The source column is the stage
auditor's reading (2026-11-25), not read for the PRs that wrote this section, of Ford's 1975 pickup catalogue (**C**:
Ford Pickups '75, FDT-7510, July 1974, K's copy), Ford's 1976 Truck Body Builder's Layout Book of the same body (**D**,
the drawing named) and web pages (**W**).

| Item                 | Source (auditor's reading)                                                                                      | Authored `FORD_F_150_1975`                                                                                                                                  | Class              |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Length               | 215.58 in (5,476 mm) with the step bumper: 31.73 + 133.0 + 50.85 (D); 214.60 in (5,451 mm) to the box (76BB908) | **5.476 m**, with the step bumper                                                                                                                           | source             |
| Width                | Cab 79.08–79.16 in, box 79.06 in, front bumper 79.62 in (2,022 mm) (D)                                          | **2.022 m**, the front bumper                                                                                                                               | source             |
| Height               | 71.6 in (1,819 mm): an owner's post about a 1979 F-100, no support                                              | 1.819 m                                                                                                                                                     | unsupported        |
| Wheelbase, overhangs | 133.0 in (3,378 mm) (C, D); 31.73 / 49.87 in to the box's end (806 / 1,267 mm) (D)                              | Axles **1.4525 / 1.9255 m** from the CG: a rear share of 0.43 (an empty pickup)                                                                             | source, estimate   |
| Tracks               | 64.4 / 64.8 in (1,636 / 1,646 mm) (C)                                                                           | 1.636 / 1.646 m                                                                                                                                             | source             |
| Mass                 | GVW 6,050 lb less a payload of 2,275 lb with the driver (C): 3,775 lb (1,712 kg)                                | **1,787 kg**: 1,712 + the 75 kg driver                                                                                                                      | source, calculated |
| Engine               | 300 cu in (4,917 cc) OHV six, 4.00 × 3.98 in, 8.0:1 (C, W)                                                      | 4,917 cc, `cycle` 4, 8.0, idle 650 (an estimate)                                                                                                            | source, estimate   |
| Power, torque        | 120 hp net at 3,400 rpm, 223 lb-ft (302 N m) at 1,600 rpm (W); a 101 hp version is listed for the year          | Point 2: 302.347402 N m at 1,600; point 3: 251.326208 N m at 3,400 (120 hp)                                                                                 | source, calculated |
| Curve's other points | —                                                                                                               | 175.361493 N m at 650 and 256.995292 at 1,125 (0.58 and 0.85 of point 2's), 206.08749 at 4,000 (0.82 of 3's)                                                | estimate           |
| Redline              | No tachometer                                                                                                   | **4,000 rpm**, a little above the power's                                                                                                                   | estimate           |
| Transmission         | Three-speed, fully synchronized, column shift, 2.99 / 1.75 / 1.00 (C, parts tables); Ford 9 in axle (C)         | As the source; final **3.50** (only 3.25 or 3.50 could be narrowed to)                                                                                      | source, estimate   |
| Tires                | L78-15D on 5.5 in rims (C)                                                                                      | Radii 0.355 m (nominal 0.371, less the load's squash); inertias `25r²` / `27r²` = 3.151 / 3.403                                                             | source, estimate   |
| Drag                 | —                                                                                                               | `q = 0.5 × 1.225 × 0.55 × 3.0 m²` = **1.0106 kg/m**; Cd and the frontal area are estimates                                                                  | estimate           |
| CG height            | —                                                                                                               | 0.70 m                                                                                                                                                      | estimate           |
| Inertias             | —                                                                                                               | Box estimates **5,074 / 4,958 kg m²**                                                                                                                       | calculated         |
| Brakes               | —                                                                                                               | 1,787 × 11.5 m/s², 65:35, × 0.355 m, to 25 N m: **4,750 / 2,550 N m**                                                                                       | game design        |
| Suspension           | —                                                                                                               | 1.5 Hz, 0.4, 0.3 m                                                                                                                                          | game design        |
| Valves               | Intake 1.78 in, exhaust 1.56 in (39.6 mm), a later year's (W); exhaust 54° BBDC to 34° ATDC at 0.006 in (W)     | `valve` 0.0396 m, `open` 0.3722 (268 / 720)                                                                                                                 | source, estimate   |
| Firing               | 1-5-3-6-2-4, at even intervals (W)                                                                              | `firingPhases` 0 to 5/6 by sixths                                                                                                                           | source             |
| `exhaust.diameter`   | —                                                                                                               | **0.04 m**: the manifold's branch, about 35 mm, × 1.14                                                                                                      | estimate           |
| `exhaust.tubes`      | One outlet; 2.00 in pipe; silencer 6.00 in across, 27.00 in long; no catalyst on the F-150 (D, 76BB002)         | Six from the valves to junction 0, 0.32 / 0.20 / 0.10 / 0.32 / 0.20 / 0.10 m in firing order; one of **4.84 m** to the open (the drawing's layout, ±0.15 m) | source, estimate   |

The 205.28 in length in some tables is the chassis cab's, without the box, and is not used. 120 hp is taken because
the F-150, the heavier rating without a catalyst, is that version.

### The F-150 in the current model

- Its three forward gears are shifted by the existing automatic shifts, as every car's; its tire is the default tire.
- Its engine sound is written as the exhaust kernel reads it, its sources in its own note
  ([Audio](audio.md#observations-and-engine-sounds)): no expansion chamber, the log manifold's six tubes, the nearer its
  outlet the shorter, and the run after the manifold one tube (K, 2026-11-25).
- Its pictures are baked from K's model in eight 1975 Ford colors, WIND BLUE the default, at a spacing of 0.004 m
  ([Model solids](image-assets.md#model-solids)); the wheels drawn are the tyre's nominal size, 0.371 m, while its
  driving keeps 0.355 m. The large mirrors and the rear step bumper are options; the Custom's standard were small
  mirrors and no rear bumper.

### The F-150 on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts, not compared with the real
car's figures, which were not looked up, and not tuned:

| Measure                        | Measured                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| 0–100 km/h                     | 14.4 s (60 mph in about 13.2 s)                                 |
| Quarter mile                   | About 19.3 s, at about 112 km/h (between the run's 1 s samples) |
| Speed after 240 s              | 147 km/h in third at 3,860 rpm, below the redline               |
| Redline speeds, first to third | 51, 87, 153 km/h                                                |
| Shifts                         | 51 and 87 km/h, at 4.2 and 10.2 s                               |
| Braking from 100 km/h          | 2.48 s, 35.2 m                                                  |

It launches, shifts through all three gears and restarts from rest (76 km/h 8 s after stopping).

### The F-150's sources

The stage auditor's reading (2026-11-25), not read for these PRs: Ford's 1975 pickup catalogue (FDT-7510, K's copy),
[Ford's 1976 Truck Body Builder's Layout Book](https://www.fordification.net/tech/bodybuilder76.htm) (drawings 76BB002
and 76BB908; the 1976 edition, of the same body) and web pages for the engine's power, torque, firing order, valves
and cam. The service manual's tables, the primary source for the engine, and the height table 76BB060 were not read.
Not decided, for K ([NEXT](NEXT.md#stage-f150--the-f-150-of-1975-in-out-runs-traffic)): the height, the estimates
above, the power (120 or 101 hp), the valves and cam (a later year's and an enthusiast's) and the exhaust's lengths.

## Chevrolet Corvette Stingray of 1970: sources versus authored

K takes OUT RUN's traffic Corvette for the Chevrolet Corvette Stingray of 1970 (K, 2026-11-25); nothing here claims the
original says so. `CORVETTE_C3_1970` is the 1970 model year's C3 Sport Coupe, Model 19437, as sold in the US: the ZQ3
Turbo-Fire 350 V8 (300 hp SAE gross), the Muncie M20 wide-ratio four-speed manual and rear drive. Its listing selects
the ZQ3 350, the M20 4-speed and the Sport Coupe; its engine is shown as `V8`. FREE PLAY's classes offer it through
catalog membership, as every vehicle. Its numbers follow this ledger's
[conventions](#numerical-conventions-and-remaining-uncertainty); the estimates among them add no formula or rule and no
exception for this car.

K's decisions (2026-11-25) are the year and the specification, that it replaces the CORVETTE C4 1984 in OUT RUN's
traffic (the C4 1984 stays, in no series), the shape as the model has it, the outer two rear lamps alone as brake
lamps, the power taken net as every car's and the eight colors. The source column is the stage auditor's reading
(2026-11-25), not read for the PRs that wrote this section, of GM Heritage Center's 1970 Chevrolet Corvette Vehicle
Information Kit (an image PDF of 159 pages: the February 1970 specifications and the AMA specifications; the pages in
brackets), and for the net power of GM's 1971 catalogue (K's copy).

| Item                  | Source (auditor's reading)                                                                                      | Authored `CORVETTE_C3_1970`                                                                                                                                                                                                                     | Class               |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Length, width, height | 182.5 in (4,636 mm); widest 69.2 in (1,758 mm), front fender 69.0, rear 68.8 in; coupe 47.8 in (1,214 mm) (118) | 4.636 / 1.758 / 1.214 m                                                                                                                                                                                                                         | source              |
| Wheelbase, overhangs  | 98.0 in (2,489 mm); 40.6 / 43.9 in (1,031 / 1,115 mm) (118)                                                     | Axles **1.3028 / 1.1862 m** from the CG: rear share 0.5234 (below)                                                                                                                                                                              | source, calculated  |
| Tracks                | 58.7 / 59.4 in (1,491 / 1,509 mm) (118)                                                                         | 1.491 / 1.509 m                                                                                                                                                                                                                                 | source              |
| Mass                  | Coupe 1,598 front + 1,687 rear = 3,285 lb (1,490 kg); occupants' weight 28 % front, 72 % rear (155)             | **1,565 kg**: 1,490 + the 75 kg driver, the driver 28 % front; rear share 0.5234                                                                                                                                                                | source, calculated  |
| Engine                | 350 cu in OHV V8, 4.00 × 3.48 in, 10.25:1 (92, 134); idle 700 rpm, manual in neutral (92, 140)                  | 5,733 cc, `cycle` 4, 10.25, idle 700                                                                                                                                                                                                            | source              |
| Power, torque         | 300 hp gross at 4,800 rpm, 380 lb-ft at 3,200 rpm (92); 1971: 270 hp gross, 210 hp SAE net (catalogue)          | Net estimated by 210 / 270: point 2 400.719527 N m at 3,200; point 3 346.15537 N m at 4,800                                                                                                                                                     | source, K, estimate |
| Curve's other points  | —                                                                                                               | 232.417326 at 700 and 340.611598 at 1,950 (0.58 and 0.85 of point 2's), 283.847403 at 5,300 (0.82 of 3's)                                                                                                                                       | estimate            |
| Redline               | Not found                                                                                                       | **5,300 rpm** (the auditor's recollection, not checked)                                                                                                                                                                                         | estimate            |
| Transmission          | 2.52 / 1.88 / 1.46 / 1.00; final 3.36 standard (133, 92)                                                        | As the source                                                                                                                                                                                                                                   | source              |
| Tires                 | F70-15B on 15 × 8.00; loaded radius 12.6 in, 772 revolutions a mile at 45 mph (110)                             | Radii **0.332 m** (1,609.344 m / 772 / 2π); inertias `25r²` / `27r²` = 2.756 / 2.976                                                                                                                                                            | source, calculated  |
| Drag                  | —                                                                                                               | `q = 0.5 × 1.225 × 0.47 × 1.75 m²` = **0.5038 kg/m**; Cd and the frontal area are estimates                                                                                                                                                     | estimate            |
| CG height             | —                                                                                                               | 0.46 m, as the C4 1984's                                                                                                                                                                                                                        | estimate            |
| Inertias              | —                                                                                                               | Box estimates **3,206 / 2,995 kg m²**                                                                                                                                                                                                           | calculated          |
| Brakes                | —                                                                                                               | 1,565 × 11.5 m/s², 65:35, × 0.332 m, to 25 N m: **3,875 / 2,100 N m**                                                                                                                                                                           | game design         |
| Suspension            | —                                                                                                               | 1.5 Hz, 0.4, 0.3 m                                                                                                                                                                                                                              | game design         |
| Valves                | Exhaust head 1.495–1.505 in, lift 0.4100 in; exhaust 78° BBDC to 30° ATDC (288°) (137)                          | `valve` 0.0381 m, `open` 0.4 (288 / 720)                                                                                                                                                                                                        | source              |
| Firing                | 1-8-4-3-6-5-7-2; left bank 1-3-5-7, right 2-4-6-8 (134)                                                         | `firingPhases` by eighths; left bank to junction 0, right to 1                                                                                                                                                                                  | source              |
| `exhaust.diameter`    | GM gives the pipes 2.00 in outside (100, 138)                                                                   | **0.043 m**: the cast manifold's branch, about 38 mm, × 1.14                                                                                                                                                                                    | estimate            |
| `exhaust.tubes`       | Dual; two reverse-flow silencers (body 17.00 × 9.25 × 5.00 in); pipes 2.00 in outside; 2 in tails (100, 138)    | Each bank four from the valves to its junction, 0.10 m for the middle two and 0.20 m for the end two; one of **4.44 m** from each junction to the open (about 3.0 m of pipe, 1.30 m within the silencer, 0.14 m of tail, measured on the model) | source, estimate    |

### The Corvette Stingray in the current model

- Its four forward gears are shifted by the existing automatic shifts, as every car's; its tire is the default tire.
- Its power is net, as every car's (K): the 1970 car has only gross figures, so the 1971 catalogue's ratio for the same
  basic engine (8.5:1), 210 hp net to 270 hp gross, is laid on the 1970 gross power and torque at GM's speeds: 233.3 hp
  (174.0 kW) at 4,800 rpm and 295.6 lb-ft (400.7 N m) at 3,200 rpm. It is an estimate.
- Its engine sound is written as the exhaust kernel reads it, its sources in its own note
  ([Audio](audio.md#observations-and-engine-sounds)): two banks apart (GM: dual, without a crossover), no expansion
  chamber, each bank's centre-outlet manifold's four tubes and the run after it one tube; the run within the
  reverse-flow silencer is counted in its length, as for the Beetle (K).
- Its pictures are baked from K's model in eight 1970 colors, MONZA RED the default
  ([Model solids](image-assets.md#model-solids)); its wheels are drawn at the radius its driving uses, 0.332 m.

### The Corvette Stingray on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts, not compared with the real
car's figures, which were not looked up, and not tuned:

| Measure                         | Measured                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| 0–100 km/h, 0–200 km/h          | 6.58 s (60 mph in about 6.3 s), 29.1 s                                              |
| Quarter mile                    | About 14.9 s, at about 156 km/h (between the run's 1 s samples)                     |
| Speed after 240 s               | 205 km/h in fourth at 5,530 rpm, above the 5,300 rpm redline, short of the fuel cut |
| Redline speeds, first to fourth | 78, 105, 135, 197 km/h                                                              |
| Shifts                          | 78, 105 and 135 km/h, at 4.7, 7.1 and 11.0 s                                        |
| Braking from 100 km/h           | 2.48 s, 35.0 m                                                                      |

It launches, shifts through all four gears and restarts from rest (113 km/h 8 s after stopping).

### The Corvette Stingray's sources

[GM Heritage Center's 1970 Chevrolet Corvette Vehicle Information Kit](https://www.gm.com/content/dam/company/no_search/heritage-archive-docs/vehicle-information-kits/chevrolet/1970-Chevrolet-Corvette.pdf)
(an image PDF, 159 pages) and GM's 1971 catalogue (K's copy), read by the stage auditor (2026-11-25) on the pages
cited above, not for these PRs. Not decided, for K
([NEXT](NEXT.md#stage-c3--the-corvette-stingray-of-1970-in-out-runs-traffic)): the net power's estimate, the redline,
the estimates above and the exhaust's lengths.

## Ford F-700 of 1980: sources versus authored

K takes a medium van truck for OUT RUN's traffic, the Ford F-700 of 1980 (K, 2026-11-25), added to the six, not in
place of one; nothing here claims the original says so. `FORD_F_700_1980` is the 1980 US F-700 (F70) 4×2 Regular Cab
on the 171 in wheelbase, the 370-4V gasoline V8 (gasoline for its sound, K), a five-speed manual and a two-speed rear
axle, with a 14 ft × 96 in dry van body. Its listing selects the 370-4V, the 4x2 / 171 in / 5MT and the 14 ft van
body; its engine is shown as `V8`. FREE PLAY's classes offer it through catalog membership, as every vehicle. Its
numbers follow this ledger's [conventions](#numerical-conventions-and-remaining-uncertainty); the estimates among them
add no formula or rule and no exception for this car, and its paired rear wheels add none to the wheels' inertia.

K's decisions (2026-11-25) are the year and the specification, that it is added to OUT RUN's traffic, the four key
colors with the box's right side as the original and its left mirrored, the wheels' grey discs, the eight colors and
the two-speed axle written as its high range alone (five forward gears). The source column is the stage auditor's
reading (2026-11-25), not read for the PRs that wrote this section: Ford's 1980 Revised Broadcast Booklet (**F**), a
1980 F-700 sold at auction, Purple Wave EA2806 (**P**, its listing and photographs), Commercial Car Journal of October
1980, p. 236, listing the 1981 trucks (**J**), Morgan's dry freight aluminum bodies (**M**, July 2013), the TTI crash
test report 404311-6, Figure 12, measuring a 1986 F700 van truck on a 5,245 mm wheelbase (**T**), and owners' forums
(**W**). The box's frame height, 1,099 mm, is K's source's value, which the auditor could not check.

| Item                  | Source (auditor's reading)                                                                                                       | Authored `FORD_F_700_1980`                                                                                                                                                    | Class              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Identity              | F70, the F-700 gasoline (F); 370, eight cylinders, gasoline, manual "5, plus 2", GVWR 27,500 lb, 9-20 tyres (P)                  | The 370-4V, 5MT, the high range                                                                                                                                               | source, K          |
| Length, width, height | Wheelbase 171 in (P); BBC 102 in, front axle to cab back 69 in (J); box 4,410 × 2,438 × 2,169 mm, 959 kg (M)                     | **7.182 / 2.457 / 3.377 m**, the model measured (3.1 in image assets); the width the front fender                                                                             | source, calculated |
| Tracks                | 2,000 / 1,840 mm (T, the 1986 truck)                                                                                             | 2.0 / 1.823 m: the front as T, the rear the model's paired wheels' centre                                                                                                     | source, estimate   |
| Mass                  | 5,135 kg empty, 2,309 front, 2,726 rear (T, the 1986 truck with a longer box and frame)                                          | **4,955 kg**: about 4,880 empty (T less about 190 for the box and 65 for the frame) + the driver                                                                              | estimate           |
| Axles                 | Rear share 0.53 (T)                                                                                                              | **2.2149 / 2.1281 m** from the CG: a rear share of 0.51                                                                                                                       | estimate           |
| Engine                | 370 cu in (6,063 cc) OHV V8, 4.05 × 3.59 in (W, reading Ford's 1990 specifications)                                              | 6,063 cc, `cycle` 4; compression 8.0, idle 650 and redline 4,000 rpm estimates                                                                                                | source, estimate   |
| Power, torque         | 1990: 180 hp gross at 3,600, 286 lb-ft at 2,800; 163 hp, 270 lb-ft net (W); the 1980 370-4V's not found, J reads as 197 hp gross | Point 2: 366.070846 N m at 2,800; point 3: 322.419002 N m at 3,600 (163 hp, the 1990 net)                                                                                     | source, estimate   |
| Curve's other points  | —                                                                                                                                | 212.321091 at 650 and 311.160219 at 1,725 (0.58 and 0.85 of point 2's), 264.383581 at 4,000 (0.82 of 3's)                                                                     | estimate           |
| Transmission          | Five speeds, direct top, plus a two-speed axle (P); ratios not found                                                             | 6.99, 4.09, 2.24, 1.47, 1.00 (a forum's Clark 285V, "probably"); final 6.50, an Eaton two-speed's high range (6.50 / 9.04, another 1980 F-700); the low range not written (K) | estimate, K        |
| Tires                 | 9.00-20, about 1,019 mm across                                                                                                   | Radii 0.488 m (nominal 0.5095 less the F-150's share of squash); inertias `25r²` / `27r²` = 5.954 / 6.43                                                                      | estimate           |
| Drag                  | —                                                                                                                                | `q = 0.5 × 1.225 × 0.8 × 6.25 m²` = **3.0625 kg/m** (CdA 5.0 m²)                                                                                                              | estimate           |
| CG height             | —                                                                                                                                | 1.25 m                                                                                                                                                                        | estimate           |
| Inertias              | —                                                                                                                                | Box estimates **23,791 / 26,008 kg m²**                                                                                                                                       | calculated         |
| Brakes                | Hydraulic (P)                                                                                                                    | 4,955 × 11.5 m/s², 65:35, × 0.488 m, to 25 N m: **18,075 / 9,725 N m**                                                                                                        | game design        |
| Suspension            | Leaf springs (P)                                                                                                                 | 1.5 Hz, 0.4, 0.3 m                                                                                                                                                            | game design        |
| Firing                | 1-5-4-2-6-3-7-8; right bank 1-2-3-4, left 5-6-7-8 (W)                                                                            | `firingPhases` by eighths; the right bank to junction 0, the left to 1                                                                                                        | source             |
| `exhaust.valve`       | —                                                                                                                                | 0.042 m (the 385 family's exhaust valve, about 1.66 in), `open` 0.375 (270 / 720)                                                                                             | estimate           |
| `exhaust.diameter`    | —                                                                                                                                | **0.049 m**: the manifold's branch, about 43 mm, × 1.14                                                                                                                       | estimate           |
| `exhaust.tubes`       | No exhaust drawing of the 370 was read                                                                                           | Each bank 0.44 / 0.32 / 0.20 / 0.08 m to a rear outlet; 1.0 m (right) and 1.5 m (left) to junction 2; one of **2.7 m** to the open                                            | estimate           |

### The F-700 in the current model

- Its five forward gears, the two-speed axle's high range (K), are shifted by the existing automatic shifts, as every
  car's; its tire is the default tire. Its redline speed in fifth is about 113 km/h; OUT RUN's traffic at 90 km/h runs
  at about 3,180 rpm in fifth.
- Its engine sound is written as the exhaust kernel reads it, its sources in its own note
  ([Audio](audio.md#observations-and-engine-sounds)): the two banks' tubes meet in one tube to a single outlet, no
  expansion chamber, every number an estimate.
- Its pictures are baked from K's model in four key colors and eight colors, WHITE the default, at a spacing of
  0.004 m ([Model solids](image-assets.md#model-solids)); the wheels drawn are the tyre's nominal size, 0.5095 m, while
  its driving keeps 0.488 m. It is the first vehicle taller than the camera (3.377 m against 2 m), so its pictures are
  framed from its nearest point (F700-0).

### The F-700 on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts, not compared with the real
car's figures, which were not looked up, and not tuned:

| Measure                        | Measured                                                       |
| ------------------------------ | -------------------------------------------------------------- |
| 0–100 km/h                     | 37.5 s (60 mph in about 32.5 s)                                |
| Quarter mile                   | About 23.7 s, at about 88 km/h (between the run's 1 s samples) |
| Speed after 240 s              | 108 km/h in fifth at 3,840 rpm, below the redline              |
| Redline speeds, first to fifth | 16, 28, 51, 77, 113 km/h                                       |
| Shifts                         | 16, 28, 51 and 77 km/h, at 1.2, 2.4, 6.7 and 16.0 s            |
| Braking from 100 km/h          | 2.55 s, 35.4 m                                                 |

It launches, shifts through all five gears and restarts from rest (55 km/h 8 s after stopping).

### The F-700's sources

The stage auditor's reading (2026-11-25), not read for these PRs: Ford's 1980 Revised Broadcast Booklet, the Purple
Wave auction EA2806, Commercial Car Journal of October 1980, Morgan's dry freight bodies, the TTI report 404311-6 and
owners' forums, as above. No primary source for the 1980 370-4V's power, the gear and axle ratios, or the exhaust was
read. Not decided, for K ([NEXT](NEXT.md#stage-f700--the-f-700-of-1980-in-out-runs-traffic)): the estimates above.

## BMW 325i Convertible of 1987: sources versus authored

K takes a convertible for OUT RUN's traffic, the BMW 325i Convertible of 1987 (K, 2026-11-27), added to the others,
not in place of one; nothing here claims the original says so. `BMW_325I_CONVERTIBLE_1987` is the 1987 US E30 325i
Convertible, left-hand drive, with the M20B25 in-line six and a five-speed manual, its top folded and a driver in the
left seat. Its listing selects the M20B25, the 5MT and the 3.73 axle; its engine is shown as `I6`, its name as `325i`
(`325i Convertible` passes the 20-character limit of the year, two spaces and the name by two). FREE PLAY's classes
offer it through catalog membership, as every vehicle. Its numbers follow this ledger's
[conventions](#numerical-conventions-and-remaining-uncertainty); the estimates among them add no formula or rule and no
exception for this car.

The source column is the stage auditor's reading (2026-11-27) of BMW of North America's 1987 325i Convertible
catalogue ([PDF](https://www.auto-brochures.com/makes/BMW/3%20Series/BMW_US%203SeriesConvertible_1987.pdf)), BMW's
technical data for the M20 B 25 and a specification site (**S**), not read for the PR that wrote this section.

| Item                  | Source (auditor's reading)                                                   | Authored `BMW_325I_CONVERTIBLE_1987`                                                                                                                 | Class            |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Length, width, height | 176.8 / 64.8 / 53.9 in (the height with the top raised)                      | 4.491 / 1.646 / 1.369 m                                                                                                                              | source           |
| Tracks, wheelbase     | 55.4 / 55.7 in; 101.2 in                                                     | 1.407 / 1.415 m; 2.5705 m                                                                                                                            | source           |
| Mass                  | 3,015 lb unladen                                                             | **1,443 kg**: 1,368 kg + the driver                                                                                                                  | source           |
| Axles                 | —                                                                            | **1.2595 / 1.311 m** from the CG: a front share of 0.51                                                                                              | estimate         |
| Engine                | 152.2 cu in (2,494 cc), 84 × 75 mm, 8.8:1                                    | 2,494 cc, `cycle` 4, 8.8; idle 760 and redline 6,400 rpm estimates                                                                                   | source, estimate |
| Power, torque         | 168 hp at 5,800, 164 lb-ft at 4,300 (SAE net)                                | Point 2: 222.354143 N m at 4,300; point 3: 206.256377 N m at 5,800                                                                                   | source           |
| Curve's other points  | —                                                                            | 128.965403 at 760 and 189.001022 at 2,530 (0.58 and 0.85 of point 2's), 169.130229 at 6,400 (0.82 of 3's)                                            | estimate         |
| Transmission          | 3.83 / 2.20 / 1.40 / 1.00 / 0.81; axle 3.73                                  | The same five ratios and final, shifted by the existing automatic shifts                                                                             | source           |
| Tires                 | 195/65 VR14                                                                  | Radii 0.3046 m (0.6092 m across); inertias `25r²` / `27r²` = 2.32 / 2.505                                                                            | calculated       |
| Drag                  | Cd 0.40                                                                      | `q = 0.5 × 1.225 × 0.40 × 1.86 m²` = 0.4557 kg/m; the frontal area **1.86 m²**                                                                       | source, estimate |
| CG height             | —                                                                            | 0.5 m                                                                                                                                                | estimate         |
| Inertias              | —                                                                            | Box estimates 2,751 / 2,651 kg m²                                                                                                                    | calculated       |
| Brakes                | —                                                                            | 1,443 × 11.5 m/s², 65:35, × 0.3046 m, to 25 N m: 3,275 / 1,775 N m                                                                                   | game design      |
| Suspension            | —                                                                            | 1.5 Hz, 0.4, 0.3 m                                                                                                                                   | game design      |
| Firing                | 1-5-3-6-2-4                                                                  | `firingPhases` by sixths; cylinders 1–3 to junction 0, 4–6 to junction 1                                                                             | source           |
| `exhaust.valve`       | 36 mm (BMW); lift 10.1 mm, 256° (S)                                          | 0.036 m, `open` 0.3556 (256 / 720)                                                                                                                   | source           |
| `exhaust.diameter`    | Pipes 45 mm (an owners' site)                                                | **0.041 m**: the manifold's branch, the valve's 36 mm, × 1.14                                                                                        | estimate         |
| `exhaust.tubes`       | "Twin-tube exhaust with twin tailpipes, catalytic converter" (the catalogue) | Each bank 0.25 / 0.17 / 0.10 m; two down pipes of 0.75 m to the converter; two parallel tubes of **4.1 m** to the rear silencer; two tails of 0.25 m | estimate         |

### The 325i Convertible in the current model

- Its five forward gears are shifted by the existing automatic shifts, as every car's; its tire is the default tire.
- Its engine sound is written as the exhaust kernel reads it, its sources in its own note
  ([Audio](audio.md#observations-and-engine-sounds)): the two pipes from the converter to the rear silencer are two
  tubes between the same two junctions, the first exhaust so written; every length is an estimate.
- Its pictures are baked from K's model in eight BMW colors, ALPINE WHITE the default, at a spacing of 0.004 m
  ([Model solids](image-assets.md#model-solids)). Its height is the catalogue's with the top raised, 1.369 m; the
  pictures show the top folded, the windscreen's frame at 1.366 m.

### The 325i Convertible on the flat

The existing solver on this ledger's flat, dry, windless straight with the automatic shifts, not compared with the real
car's figures and not tuned:

| Measure                        | Measured                                               |
| ------------------------------ | ------------------------------------------------------ |
| 0–100 km/h, 0–200 km/h         | 8.03 s (60 mph in 7 to 8 s), 46.8 s                    |
| 0–400 m, 0–1,000 m             | 15.9 s, 29.1 s (between 1 s samples)                   |
| Speed after 240 s              | 216.6 km/h in fifth at 5,734 rpm, below the redline    |
| Redline speeds, first to fifth | 51, 90, 141, 197, 243 km/h                             |
| Shifts                         | 52, 90, 141 and 197 km/h, at 2.9, 6.5, 15.3 and 42.8 s |
| Braking from 100 km/h          | 2.57 s, 36.0 m                                         |

It launches, shifts through all five gears and restarts from rest (100 km/h 8 s after stopping).

### The 325i Convertible's sources

The stage auditor's reading (2026-11-27), not read for these PRs: BMW of North America's 1987 325i Convertible
catalogue, BMW's technical data for the M20 B 25, a specification site for the cam's lift and duration, a parts seller
and an owners' site for the exhaust, and refinish color charts for the colors
([Model solids](image-assets.md#model-solids)). No exhaust drawing was read. Not decided, for K
([NEXT](NEXT.md#stage-e30--the-325i-convertible-of-1987-in-out-runs-traffic)): the estimates above.
