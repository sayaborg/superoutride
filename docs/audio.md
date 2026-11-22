# Procedural audio

Audio renders completed vehicle observations and never changes them. The engine's sound is a physical model of its
exhaust, written in waves over the gas's own units rather than measured vehicle sound. Every audio value is either
derived from physics, a physical assumption stated with its value, a value the owner chose by listening and the code
keeps, or a DEV listening setting; implementer-chosen empirical constants are not kept. [Tire audio](tire-audio.md)
owns UNIFIED synthesis, [Calibration](calibration.md) owns numeric values, [Browser](browser.md#sound-controls) owns
operation.

## Observations and engine sounds

The [acoustic observation](../src/audio/vehicle-audio-observation.ts) contains powertrain and tire
inputs. A vehicle audio emitter ([audio scene](../src/audio/audio-scene.ts)) adds the competitor ID and
its physical world pose; player and rivals are supplied in the same emitter form. From the powertrain, audio reads
engine RPM, the effective opening (`effectiveOpening`, the engine's only command), the fuel-cut latch (`fuelCut`), the
last shift (sequence, direction and engine RPM before and after) and the afterfires' count (`afterfire`), as
[vehicle physics](vehicle-physics.md#wheel-and-powertrain) publishes them. A sequence or count the voice has not yet
heard marks a new shift or new afterfires. A new `DOWN` shift with `toRpm > fromRpm` (a locked downshift) plays a blip:
an opening peak of `DOWNSHIFT_BLIP.opening` (1), decaying exponentially with `DOWNSHIFT_BLIP.decaySeconds` (0.25 s),
combined with the effective opening by `max`; the two values are the owner's, chosen by listening, and the code keeps
them ([engine voice](../src/audio/engine-voice.ts)). Each afterfire not yet heard sends the kernel one `afterfire()`, in
the same form. The first sequence and count a voice reads, and the first after `silence()` (a rival reassignment), are
only recorded. The browser supplies them once per presented frame from the race's borrowed competitor observations,
which are copied at the end of each fixed step; audio reads nothing else. When an engine afterfires is the game's to
decide, not the sound's: the powertrain decides it for every vehicle, whether it sounds or not
([vehicle physics](vehicle-physics.md#wheel-and-powertrain)).
Physics owns RPM, actuators, contact loads, wheel motion and dissipated work; audio owns oscillator,
filter and envelope state. Player tire sound reads the player's observed tire observations;
rival sound uses the rival's observed powertrain values and its own vehicle's engine sound.

An [engine sound](../src/audio/engine-sound.ts) contains one or two revolutions per cycle, ordered firing phases and
the exhaust from the valves to the tail: one cylinder's exhaust valve (`valve`), each cylinder's primary and the pipes,
every tube with its length and internal diameter in metres, and a pipe may add the thickness of the wool lining it
(`wool`, in metres; [derived values](#derived-values)). Each firing phase is that cylinder's exhaust-opening instant
(start of blowdown); the offset from combustion top dead centre is common to all cylinders and is not represented. Phase
count determines cylinder count, and the primaries follow the firing phases' order: cylinder i's primary runs from its
valve, the head's exhaust port included, to junction `to`. Each pipe runs from junction `from` to junction `to`, or to
an open end (`to: null`), as far as the tailpipes; a turbine is a short, narrow pipe of its throat. The valve's
`diameter` is that of the circle whose area is the valve's greatest open area (for poppet valves
`count × min(π·d·lift, π·d²/4)`, for a two-stroke the port window's area), and `open` is how long it is open, seat to
seat, as a share of the cycle from the firing phase. The resource limits are author values bounding the kernel's work
and storage, not claims about real engines: 1 to 16 firing phases and 1 to 32 pipes (32 so that a silencer can later be
written as a wide pipe), every tube longer than 0 and at most 4 m, and wider than 0 and at most 0.5 m. A pipe's `wool`
is absent, 0 (compiled as absent), or more than 0 and less than half its diameter, refused at `/exhaust/pipes/<n>/wool`.
`compileEngineSound` validates an `EngineSoundDefinition` into an `EngineSound`: positive valve diameter, `open` within
(0, 1), one primary per firing phase, tubes within the limits and the junctions' topology. Firing rows identify events
and collector groups.

Engine sound definitions are content: `content/engine-sounds/<id>.json` stores one
`superoutride.engine-sound` version 2 document per sound ID, its file name without `.json`, which is also its
manifest ID; the documents carry none. The fields are `format`, `version`, `cycleRevolutions`, `firingPhases`,
`exhaust` (`valve` of `{diameter, open}`, `primaries` of `{length, diameter, to}` and `pipes` of
`{length, diameter, from, to}` with `to: null` for an open end and an optional `wool`, which a primary does not take)
and `metadata` (authoring notes, such as each value's references; not read, and kept as written only for the DEV
export). The audio layer compiles a document:
[`compileEngineSoundDocument`](../src/audio/engine-sound-document.ts) checks format, version and field shapes
with the admission toolkit and leaves value validation to `compileEngineSound`, whose failure is an `invalid_value`
diagnostic at the field the rule reads (`/exhaust/primaries/0/length`, `/exhaust/pipes/1/diameter`,
`/exhaust/primaries/2/to`, `/exhaust/valve/open`), or at `/exhaust/pipes` for the pipes' count and topology (junctions
numbered from 0, one open end reached from every junction), rules over the pipes together; the `CompiledEngineSound`
adds the sound ID and the delivered bytes' SHA-256. Firing phases are used exactly as written. The content layer
([engine-sound catalog](../src/content/engine-sound-catalog.ts)) admits every document, delivers it as kind
`engine-sound` and passes the catalog to the vehicle catalog, whose listings resolve their `sound` in it; the
same sample-free engine kernel plays every sound. DEV's ENGINE SOUNDS panel ([Browser](browser.md#sound-controls))
changes a sound's valve and its primary and pipe lengths and diameters, each change through `compileEngineSound`; every voice whose
competitor's vehicle uses that sound fades to silence and installs it, as for any change of sound.

The delivered sounds have no silencers yet: each will be written into its document as a wide pipe, one vehicle at a
time. Without them the blowdown's shocks reach the outside whole, so the engines are loud and rough; that is the model's
right answer for these exhausts (K, 2026-11-20), and no smoothing stands in for the silencers.

## Engine synthesis

The [kernel](../src/audio/exhaust-waveguide.ts) is K's reference kernel of 2026-11-20, its arithmetic kept exactly. The
exhaust is a network of tubes and the spaces their ends open into. There is one kind of space: a junction is a space
with no volume, a cylinder a space whose volume its piston moves. The outside alone is apart, and it is where the
sound is heard. Engine RPM and opening are observations, followed per sample with TIMING's `observationSeconds`; there
are no torque or crank dynamics. Pressures and waves are over the tubes' `rho c^2`: a wave is `w = p / (rho c^2)`, and a
flow's Mach number is the difference of the two waves at a tube's end.

**The one law of a tube's end.** Every end opens, through a throat of `a` of the tube's cross-section, into a space
whose width is `1/sigma` of the tube's (a cylinder or the outside: `sigma = 0`; at a junction, the tube's cross-section
over the other ends' sum, at most 1). A narrowing stream keeps its total pressure; a widening one keeps its momentum and
so loses the head of `u_throat - u_after`. With `m` the flow from the tube into the space and `P` the space's pressure:

```text
tube -> space:  p_end - P =  m²/2 * ((1/a - sigma)² + sigma² - 1)
space -> tube:  p_end - P = -m²/2 * (1 + (1/a - 1)² - sigma²) / q
```

`q` weighs the space's gas against the tube's (1 where they are the same gas). An end whose stopped pressure stands `d`
above its space's has the flow `m + K m|m|/2 = d` of its head `K`. A valve's flow is not faster than sound in its throat:
`m` is at most `choked × a` out of the tube, and that times the cylinder gas's sound speed over the tube's into it.

**Lines.** Each primary and pipe is two lines, one each way. A line carries its tube's wall loss and a pipe's wool
([derived values](#derived-values)), then `N = round(length × rate / waveSpeed)` samples (at least 1) in which a value
`w` travels at `c (1 + steepening w)`: a strong wave runs faster, later values overtake earlier ones, and where they do
they form a shock that keeps the wave's area. The value arriving now is the one sent at the `t` that makes
`-k S(t) + (t - (now - N))²/2` least (`S` the running sum of `w`, `k = steepening × N`: Lax and Oleinik). Each `t` is a
straight line in `now - N`, so the least is the lower envelope of the lines; sent in order and asked in order, each
line enters and leaves the envelope once. Between two samples where the residual crosses nothing, the arriving value is
interpolated. The shocks make the blowdown's crack.

**Spaces.** A space holds gas `G`, counted as the volume it would fill at the outside's pressure, in a volume `V`; its
pressure is `(G/V)^gamma`. Each sample, every junction finds the pressure at which its ends' flows, each by the law,
bring nothing in over the sample (it holds nothing): two ends make one quadratic; more are solved by Newton's step kept
between the pressures already known too low and too high, to within `1e-9`, in at most 60 rounds. A cylinder finds its
pressure the same way with its one end, its valve the end's throat, its gas filling the volume along the tangent of
`fill = (1 + gamma P)^(1/gamma)` within the sample; it keeps what it held and what its valve brought.

**Mouths.** The outside is a space of `sigma = 0` whose pressure at a mouth is `P = w_in - lowpass(w_in)`, the one-pole
corner at `ka = 1` (`c/(2 pi a)`). What is heard is the sum over the open ends of that pressure times the mouth's
inner diameter: the outside pushing back on the mouth. There is no DC removal and no output low-pass.

**Cylinders.** Each cylinder's valve opens at its firing phase and is open for `valve.open` of the cycle; its open
area over the primary's is `min(1, C_d × (valve.diameter / primary.diameter)² × 16 u²(1-u)²)` at position `u` in that
interval, a lift of zero value and slope at both ends. The opening is centred: its middle stands at the middle of a
four-stroke's exhaust stroke, and at a two-stroke's bottom dead centre; the piston moves the volume
`clearance + swept (1 - cos angle)/2` (`clearance = swept/(r - 1)`, `swept` one cylinder's share of the displacement
and `r` the compression ratio, both from the vehicle's mechanics). As its valve opens, a cylinder takes its charge: the
share `closedCharge + (1 - closedCharge) × opening` of a full one, varied at each firing by up to `chargeVariation`
(seeded xorshift32, drawn only at firings, so the same input history gives the same sound), burned at `burnedKelvin` and
let out with the density that follows from its expansion. A cylinder holds nothing and lets nothing out from the
kernel's start until its valve first opens (K, 2026-11-21): a valve already open when the kernel starts stays shut to
the flow until it opens again, so a new kernel starts without a burst.

**Fuel cut and afterfire.** While the observation reports fuel cut, a cylinder lets out the air it drew, unburned, at
the intake's temperature. An afterfire is a charge that does not burn in its cylinder: `afterfire()` marks the next
cylinder to open; it lets its charge out at the intake's temperature, and when its valve shuts the charge burns at its
primary's junction, entering it as its gas's swelling (the heat it would have given in the cylinder, given at the
junction's steady pressure) over `afterfireSeconds`, a raised cosine in time. During fuel cut an `afterfire()` still
marks the next charge, which, unburned, does not burn.

The kernel renders sample by sample; each sample's arithmetic, and the order of every sum (a junction's ends: its
primaries in cylinder order, then each pipe's `from` and `to` ends in pipe order; the mouths in pipe order; the
afterfires burning, latest first), is the same however the calls divide the samples. A line's ring holds the power of
two at or above `4N + 8` values, so a sound of at most 2 × (16 + 32) lines stores at most 96 rings of 8192 values (at
4 m and 192 kHz) in each of its four arrays.

**Its rate.** The kernel runs at the output's rate over a divisor of 1, 2, 4 or 8
([`ExhaustRenderer`](../src/audio/exhaust-rate.ts)), and its sound is brought up to the output's rate by doubling once
for each halving: each sample between two is the cubic through the four around it, `(-a + 9b + 9c - d)/16`. The kernel
takes the observations of the first output sample of each of its own. It is the same model at every rate, only the rate
it is given differs; tube lengths are rounded to the samples of that rate (K, by listening). The player's ENGINE SOUND
QUALITY (K, 2026-11-21; [Browser](browser.md#player-record)) sets the player's divisor, and a rival runs at half the
player's rate:

| ENGINE SOUND QUALITY | Player            | Rival      |
| -------------------- | ----------------- | ---------- |
| HIGH                 | 1 (48 kHz output) | 2 (24 kHz) |
| MID (default)        | 2 (24 kHz)        | 4 (12 kHz) |
| LOW                  | 4 (12 kHz)        | 8 (6 kHz)  |

A wall-loss shelf whose corner the rate does not carry is left out ([derived values](#derived-values)). A change of
quality is a change of the voices' kernels: each voice fades to silence and installs its new one, as for any change of
sound.

**The light kernel.** A second kernel, [`ExhaustLight`](../src/audio/exhaust-light.ts) (K, 2026-11-22), is the game
kernel with linear tubes: the same cylinders, gas (`GAS`), valve law, wall loss, mouths, afterfire, start (no flow
before a valve first opens) and listened values (`EXHAUST_LISTENING`), heard the same way, the mouths' pressure times
their diameter. A wave does not steepen, and a junction or a mouth is no jet:

| Part               | Light kernel                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tube               | Two delay lines of `N` samples, rounded as the game kernel's; each wave written passes its tube's wall loss.                                                                                                                        |
| Junction           | One pressure `p = 2 sum(area × arriving) / sum(area)`; each tube's wave leaves as `p - arriving`. An afterfire's swelling enters as a flow: `p` rises by `swelling × 4 rate / (pi c sum(d²))`.                                      |
| Mouth              | The wave returns turned over and low-passed at `ka = 1` (`openEndCutoffHz`); what is heard is `diameter × (outgoing − its low-pass)`.                                                                                               |
| Cylinder and valve | The end law into a space of `sigma = 0`, solved once a sample in closed form from the cylinder's pressure as the sample begins; no faster than sound in the throat, and no more than brings the cylinder level with its tube's end. |

It reads a sound through `straightened` (K, 2026-11-22): its wool is not read, and a box is read as a straight way
through. A box is a pipe that is not an outlet, is wider than `LIGHT_BOX_DIAMETER` (75 mm, K by ear, 2026-11-23: the
NSR500 of 1984's 62 mm silencer is better not a box) and is wider than every tube it meets at both its ends (primaries
included); it is read as wide as the widest of those tubes, its length kept. The 150 mm turbine rooms and the
two-strokes' 86 mm chambers are boxes by the same rule. The value is the light kernel's alone, with no vehicle's
exception.

## Engine chain

```text
kernel at rate/divisor -> doubled to the output's rate -> compressor -> gain (engineDriveLufs) -> soft clip
                       -> voice/master gain -> master compressor
```

After the kernel's sound is at the output's rate, the [engine chain](../src/audio/engine-chain.ts) (K, 2026-11-21)
takes it through three stages, in this order:

1. **Compressor.** The sound's mean square over 50 ms (`level += f (x² - level)`, `f = 1 - exp(-1/(0.05 × rate))`)
   sets `x × level^(-1/4)`: a ratio of 2:1 with its threshold at the bottom, so all of the sound is compressed.
2. **Gain.** The vehicle's gain for the divisor its kernel runs at, `10^((engineDriveLufs - lufs)/20)`, brings its
   [measured](#engine-loudness) compressed sound to MIX's `engineDriveLufs`.
3. **Soft clip.** `y/(1 + |y|/2)`: below the ceiling of 2 and of unit small-signal gain (`softClip(y/2, 2)` of the
   former form).

The ratio, the 50 ms and the ceiling are the owner's values, kept by the code (`ENGINE_CHAIN`), not DEV settings. An
engine's sound therefore exceeds 1, up to 2; the mix after it (effects, music, the final bound) is K's to decide
separately. The kernel's own sound is a very small number (below BS.1770's −70 LUFS gate), so it is measured and
levelled after the compressor. The chain, like the kernel, starts from silence whenever a voice installs a kernel.

## Derived values

Derived values follow from physics and are never DEV settings: the wave speed (`ACOUSTICS.waveSpeed`, 480 m/s),
each tube's wall-loss filter and open-end corner, the rival inverse-distance law and the rival pan geometry.
[Exhaust acoustics](../src/audio/exhaust-acoustics.ts) derives the pipe values under stated physical assumptions
(`REFLECTION_REFERENCE`): 573.15 K air at 101325 Pa, `gamma=1.4`, `R=287 J/(kg K)` and `Pr=0.71`; each tube's radius
`a` is its document's.

The kernel's gas (`GAS`) is a set of physical assumptions, none chosen by listening: `gamma` 1.4; `steepening`
`(gamma + 1)/2 = 1.2`; `choked` 0.5787, `(2/(gamma + 1))^((gamma + 1)/(2(gamma - 1)))` to four places; the tubes' gas at
`REFLECTION_REFERENCE`'s 573.15 K, which sets the waves' speed and is the unit of density; the intake's charge at
293.15 K; the burned charge at `BLOWDOWN_REFERENCE`'s 1100 K (petrol engines are typically 1000–1300 K when the exhaust
valve opens); the exhaust valve's discharge coefficient `C_d`, `BLOWDOWN_REFERENCE`'s 0.65 (measured exhaust valves give
0.6–0.7 at working lift); and `closedCharge` 0.3, the share of the intake's pressure a shut throttle leaves to the
cylinders.

The derivation uses `c=sqrt(gamma*R*T)`, `fc=c/(2*pi*a)` for the mouth's corner and
Kirchhoff's wall loss `alpha(f)=sqrt(pi*f*nu)/(a*c)*(1+(gamma-1)/sqrt(Pr))`. Sutherland viscosity uses
`mu0=1.716e-5 Pa s`, `T0=273 K` and `S=111 K`; density is `p/(R*T)` and `nu=mu/density`. A traversal's loss
`exp(-alpha(f)*L)` grows as `sqrt(f)`: `ln|H(f)| = -kappa*sqrt(f)` with `kappa = alpha(f)*L/sqrt(f)`, fixed per tube.
The kernel applies it as four first-order shelves at corners `f_k = 20*8^k` Hz (20, 160, 1280 and 10240 Hz, ratio
`r = 8`), the same for every tube, each `D_k = kappa*(sqrt(2)*ln(r)/pi)*sqrt(f_k)` nepers deep. A shallow shelf's
loss has the form `x²/(1+x²)` of frequency over its corner, and over an unbounded geometric series of corners
`integral of x^(1/2)/(1+x²) dx = pi/sqrt(2)` makes the sum exactly `kappa*sqrt(f)`; the shelves omitted below 20 Hz
sum to `D_0/(sqrt(r)-1)`, which the lowest shelf carries (its depth times `sqrt(r)/(sqrt(r)-1)`), and the DC gain
stays 1. Each shelf is the analog `(wp/wz)(s+wz)/(s+wp)` through the bilinear transform: `K = 2*rate`,
`wp = K*tan(pi*f_k/rate)`, `wz = K*tan(pi*f_z/rate)` with zero `f_z = min(f_k*exp(D_k), 0.49*rate)`; with
`g = wp/wz`, `b0 = g*(K+wz)/(K+wp)`, `b1 = g*(wz-K)/(K+wp)` and `a1 = (wp-K)/(K+wp)`. The `0.49*rate` cap is the
domain's edge for tubes beyond the data; on the delivered sounds at 48 kHz `f_z` reaches at most 16.0 kHz.

The carried shelves in series are applied in parallel form, `C + sum R_k/(1+a1_k*z^-1)`: the poles `a1_k` are shared
by every tube (`wallLossPoles`) and each tube carries the weights `C = prod b1_k/a1_k` and the residues `R_k` at
`z^-1 = -1/a1_k` (`wallLossWeights`), computed once when the kernel is built. A shelf whose pole lies off the unit
circle (`|a1| >= 1`: its corner at or above half the rate, as 10240 Hz at a kernel rate of 12 or 6 kHz) is not carried:
its pole is 0 and its weight 0, and the other shelves are applied as they are. A traversal updates
`u_k = x - a1_k*u_k` for k = 0..3 and writes `y = C*x + R_0*u_0 + R_1*u_1 + R_2*u_2 + R_3*u_3`, summed left to right.
For every delivered tube at 44.1 and 48 kHz the loss is 0.89–1.10 times Kirchhoff's from 50 Hz to 8 kHz, the DC gain is
1 within 1e-12 and the parallel form matches the series within 1e-12.

A pipe's `wool`, glass wool lining it `t` thick (K, 2026-11-22), makes its wall a yielding one: the wool's flow
resistance `R = sigma*t` stands before the spring of the gas within the wool's thickness, `gamma*p0/t`, so a slow wave
cannot enter the wall and loses nothing, and a fast one loses what the resistance takes. With `rho*c = gamma*p0/c`, they
balance at `f0 = gamma*p0/(2*pi*R*t)`, and one traversal loses `A*f²/(f0²+f²)` nepers, at most
`A = (2*L/(D-2t))*(rho*c/R)`, where `D-2t` is the bore the gas runs straight through; a pipe twice as thick in wool
starts losing at a quarter of the frequency and, the narrower bore aside, half as deep. `sigma` (`WOOL.resistivity`) is
30,000 Pa s/m², an estimate, not a measurement: light building glass wool measures 3,000–6,000 (Tarnow 2002), a
silencer's packing is denser, and hot exhaust is more viscous; `p0` is `REFLECTION_REFERENCE`'s 101,325 Pa. Each of the
pipe's two lines, never a primary's, carries one more first-order shelf after its wall loss (`woolShelf`): its pole
`f_p = f0*sqrt((1-exp(-2A))/(2A))`, where its loss far below matches `A*f²/f0²`, and its zero
`f_z = min(f_p*exp(A), 0.49*rate)`, where its loss far above is `A`, through the bilinear transform as the wall loss's
shelves; a rate below `f_p/0.49` does not carry it. The shelf's gain is at most 1. The wool changes the loss alone:
the pipe's junction area and delay stay those of its `diameter` and `length`, because the wool is mostly gas, through
which a slow wave fills the whole body. Not represented: a loss that grows with the wave's height, and the volume within
the wool.

A vehicle's mechanics give its engine sound two values ([vehicle engine sound](../src/audio/vehicle-engine-sound.ts)):
one cylinder's swept volume, the displacement over the cylinders, and the geometric compression ratio.
`compileVehicleEngineSound` takes them once where the vehicle catalog pairs a vehicle's mechanics with its listing's
sound (`createVehicleDefinition`), and the vehicle's `sound` carries them; when DEV's ENGINE SOUNDS panel changes a
sound, the audio lifetime pairs it again for each vehicle using it.

Two values are the owner's, chosen by listening, and the code keeps them (`EXHAUST_LISTENING`, not DEV settings): each
firing's charge varies by up to `chargeVariation` 0.03 of a full charge, and an afterfire's charge burns over
`afterfireSeconds` 1.5 ms. Every other value is a DEV setting in one of the groups MIX (`MixSettings`), TIMING
(`ControlSettings`), RIVAL (`RivalSettings`), IMPACT (`ImpactSettings`) and the tire groups UNIFIED (`UnifiedSettings`)
and ROLLING (`RollingSettings`); they are the implementer's, and [Calibration](calibration.md) lists them. DEV has no
ENGINE group (K, 2026-11-21).

## Engine loudness

Vehicles' exhausts differ in level, as physics makes them; the game levels them by measurement, while each engine's own
changes of level as it is driven (idle against full throttle) stay its physics' and its compressor's. Each vehicle's
engine loudness is measured once at each divisor, outside the build, and saved with the identities of what it was
measured from. The measurement ([engine loudness](../tools/authoring/engine-loudness.ts)) runs the game's kernel at each
of the output's rate over 1, 2, 4 and 8, brought up to the 48 kHz output, with the audio document's TIMING settings on
one drive, the same for every vehicle at its own idle and redline:

| Seconds | Engine speed        | Opening |
| ------- | ------------------- | ------- |
| 1       | idle                | 0       |
| 3       | idle to redline     | 1       |
| 0.3     | redline             | 1       |
| 1.7     | redline to 2500 rpm | 0       |
| 1.5     | 3000 to 3500 rpm    | 0.3     |
| 0.5     | 3500 rpm to idle    | 0       |

Engine speed changes linearly within a segment; fuel is never cut and nothing afterfires. The engine's compressed sound,
after the chain's compressor from silence and before its gain and soft clip, is metered by ITU-R BS.1770-4 integrated
loudness: K-weighting, the mean square of 400 ms blocks every 100 ms, the absolute gate at −70 LUFS and the relative
gate 10 LU below the gated mean. The procedure's record (`ENGINE_LOUDNESS_PROCEDURE`, version 4) holds the drive, the
rate, the divisors and what it meters; the SHA-256 of its JSON is its identity, and a change to its results raises its
version.

`content/engine-loudness/default.json` is the one `superoutride.engine-loudness` version 2 document, with exactly
`format`, `version`, `procedureSha256`, `audioSha256` (the audio document's SHA-256) and `vehicles`: every catalog
vehicle once, in catalog order, with `vehicleId`, `vehicleSha256` (its mechanics document's SHA-256), `soundSha256`
(its engine sound document's) and `lufs`, its four loudnesses at the divisors 1, 2, 4 and 8, in that order. The
measurement tool writes it ([Development](development.md#measured-products)),
measuring every vehicle again when any identity differs; a build admits it as a
[measured product](content-and-gameplay.md#measured-products), refusing it as stale when any identity differs, and
delivers it as saved (kind `engine-loudness`, ID `default`). [`readEngineLoudness`](../src/content/engine-loudness.ts)
is its one reader; a vehicle without exactly four loudnesses is an `invalid_value` at its `lufs`.

The game loads it once with the catalog (`loadEngineLoudness`), refusing a delivered one whose identities are not the
delivered documents'. Each engine voice, the rival's included, takes the gain `engineGain` of its vehicle's loudness at
the divisor it runs at; the rival's inverse-distance gain follows the chain. A delivery without the engine loudness (the
workbench's build while measurements are stale) gives every engine the gain 1, unlevelled. A changed gain (a DEV MIX
change, another rival vehicle, another quality) fades and replaces the kernel as any change does. DEV's ENGINE SOUNDS
panel changes the engines at once, but the loudness stays the one measured for the delivered values: the DEV panel says
so ([Browser](browser.md#sound-controls)) until the changed values are adopted and measured again.

## Audio document

The game's source of these six records is content: `content/audio/default.json` is the one `superoutride.audio`
version 9 document (manifest kind `audio`, ID `default`) with exactly the fields `format`, `version`, `unified`,
`rolling`, `mix`, `control`, `rival` and `impact`, each holding every field of its record as a number.
[`compileAudioDocument`](../src/audio/audio-document.ts) checks format, version and shapes with the admission
toolkit and leaves value validation to each record's resolver (`resolveMixSettings` and the others); a resolver's
`RangeError` becomes an `invalid_value` diagnostic at the field it names, such as `/mix/engineDriveLufs`. The
content layer ([audio catalog](../src/content/audio-catalog.ts)) admits and delivers it, and the shell loads it
at startup: the DEV sound panels and the scene's first sync start from its values, each panel's reset returns to
them, and the DEV export saves the panels' current values in the same format. [`DEFAULT_AUDIO_SETTINGS`](../src/audio/audio-defaults.ts)
is the one set of default values: each resolver fills omitted fields from it, and it serves an assembly built without
the document.

Sound settings are admitted once. The resolvers are the one value check, applied only where settings enter: the
audio document's compilation and each change on a DEV sound panel, where a rejected value keeps the previous setting.
Loading the audio document module admits `DEFAULT_AUDIO_SETTINGS` through the same
resolvers, so the defaults are admitted records too; an invalid default is an internal `Error`. The sound graph, the
scene, the voices, the worklets and the kernels take admitted records and use them as given; they never resolve a
record again. A worklet is a thread boundary, but its messages carry the same page's admitted records, so it checks
neither their shape nor their values.

## Recordings and music documents

A recording is an authored audio file played as it is: AAC-LC in an MP4 container (`.m4a`), one format with no
fallback and no conversion. Recordings are content in three groups, each an authored directory: `content/music/<id>.m4a`,
`content/effects/<name>.m4a` and `content/impacts/<name>.m4a`. Each is delivered as its authored bytes under manifest
kind `recording` with the ID `<group>/<name>` (such as `effects/goal`), verified by SHA-256 like every delivered file.
[`recordings.ts`](../src/audio/recordings.ts) is the one list of the 17 effect names (`countdown-lamp`, `countdown-go`,
`checkpoint`, `lap`, `extend`, `goal`, `game-over`, `menu-move`, `menu-confirm`, `menu-back`, `menu-deny`,
`menu-entry`, `press-start`, `series-slide`, `prerace`, `final-lap`, `new-record`) and impact names
(`vehicle`, `wall`, `object`, `movable`); the build requires exactly these and playback reads the same list. Volume
balance between recordings is authored in the files: the game keeps no per-recording gain, equalization or trim.

Each track has a music document, `content/music/<id>.json`: one `superoutride.music` version 1 document (manifest
kind `music`, ID `<id>`, its file name without `.json`; the document carries none) with exactly `format`, `version`,
`title` (the track's name, in characters the text tiles draw), `selectionOrder` (a positive integer, unique
among tracks, ordering the list) and `loop` (`start` and `end` in seconds from the start of the decoded recording,
`0 <= start < end`). [`compileMusicDocument`](../src/audio/music-document.ts) admits one document. Loop points are set
by ear in the workbench's music module ([Development](development.md#workbench)).

The content build ([recording catalog](../src/content/recording-catalog.ts)) admits the recordings and the music
documents together; each failure is a diagnostic and nothing falls back. It reads each recording's MP4 boxes without a
decoder: the file starts with `ftyp`, the movie holds exactly one track, an audio (`soun`) track with one `mp4a` sample
description whose decoder configuration is MPEG-4 audio with audio object type 2 (AAC-LC); every field it reads lies
within its own box or descriptor, and one too short for its fields is a malformed file. The track's duration is
its edit list's playable span when it has one, which excludes the encoder's priming, else its media duration. The effect
and impact groups must hold exactly the listed names; every track's document has its `music/<id>` recording and every
music recording its document; there is at least one track; selection orders are unique; a title fits one menu line
(the text grid's 40 columns); and `loop.end` is within the recording's duration. Whether a browser can decode a
recording is known only when it decodes it. The game admits delivered music documents again when it loads them.

## Recording playback

[Recording playback](../src/audio/recording-playback.ts) is the one player of recordings, for music, effects and
impacts alike. The shell reads a recording's verified bytes from delivery and the scene decodes them
(`decodeAudioData`), so the audio layer never reads delivery. A playback plays a decoded recording on a named bus at a
volume from 0 to 1, once or looped; each playback has its own source and gain, so playbacks of one recording overlap.
A playback starts at the recording's beginning, at full volume or rising linearly over a given fade-in (a title
track's crossfade), unless it is given a start position (the workbench's music module
starts a few seconds before `loop.end`); a looped playback, once it reaches `loop.end`, returns to `loop.start`
sample-accurately (the source's own loop). A playback from the beginning starts at full volume, since recordings start
at their first sample, and one from elsewhere fades in over `fadeSeconds`; pausing fades out with the silence fade and
stops the source when it is silent, keeping the position, and
playing again starts a new source from that position with the silence fade in. A playback sounds one source at a time: playing again before the paused source has stopped
starts the new source when it stops. Stopping fades the same way and ends the playback; a fade-out ramps linearly to
zero over a given time and ends it.

The shell's [recording player](../src/shell/recording-player.ts) decodes off the frame and menu path: a request returns
at once and sounds when its recording is decoded, unless it was stopped first. Once the page's audio has first been
started, the player owns every looped request until it is stopped: one made while there is no audio scene (while the
audio initializes, or after a failure), or whose scene a retry replaced, sounds from its recording's beginning on the
next scene, paused if it is paused. A request made before the audio was ever started is silent, and a recording played
once belongs to the scene it was asked of and is dropped with it. Decoded effects and impacts are kept;
one music track is kept at a time, and a request for another releases the previous. Decodes belong to the scene they
were made on: a new scene starts without them, and a request bound again takes only its latest binding's decode, so a
decode that finishes after a newer request or scene makes nothing. A decoded stereo track takes
`duration × sampleRate × 2 × 4` bytes (about 63 MB for three minutes at 44.1 kHz, 3.9 MB for an 11-second placeholder).
A recording the browser cannot decode stays silent: the reason goes to the console once and, with `dev=1`, the audio
timing HUD names it; it is not decoded again, and the game continues.

## Music

The run request carries its track, as it carries the color; the track is neither a run rule nor a record
condition; a run with MUSIC OFF has none and plays no music, while its effects still sound. There is no SELECT MUSIC:
a course's race tracks go with the course (K, 2026-11-08): a run from the rows requests its course's first race track
([Course sounds](content-and-gameplay.md#course-sounds)), or MUSIC OFF when it has none, and a run from the URL MUSIC
OFF. The [run music](../src/shell/run-music.ts) is the
one owner of when a run's track plays, and it reads only the race's status and whether the run is live, never a clock
or a HUD timer. When a run's race goes RUNNING at GO, after the signal (K, 2026-11-11), its track starts from
its beginning and loops. While the run is not live (paused, or the page hidden) the track pauses, and it continues from where it paused
when the run is live again. At GOAL or GAME OVER it fades out over the TIMING `musicFadeSeconds` and stays silent
through RESULT. Leaving the run (RETRY, QUIT or a RESULT item) stops it, and a new run, whether RETRY's or a DEV
rebuild's, starts its track from the beginning at its own GO. Menus, the PRE-RACE card and RESULT play no run track. A run the
URL started before any gesture has no audio at its GO, so its track does not play. The audition on SETTINGS plays a
track from its beginning, looped, through the same form; it is not the run's track.

The [menu music](../src/shell/menu-music.ts) is the one owner of the rows' music, a series' title track: it plays
from its beginning, looped, through the same form, keeps playing while the rows ask for the same track, stops when
they ask for none, and fades out over a time when they ask: over 0.25 s on a move on SELECT SERIES and on leaving it
for TITLE, and over the black transition into READY (8 fixed steps). SELECT SERIES asks for the series in focus
once the row has rested 30 fixed steps (0.5 s; K, 2026-11-09); the series' world keeps it, and RESULT's way back into
the world starts it from its beginning ([Browser](browser.md#card-rows)).

## Sound effects

Effects are recordings played once on the `effects` bus, each at full volume; the game keeps no per-effect gain. The
delivered menu and race effects are two-operator FM tones, AAC-LC mono at 44.1 kHz, their levels authored in the files.
The contact explosion is seeded noise and a falling tone, AAC-LC mono at 48 kHz, generated by `npm run contact-explosion`.
Its playback and lifetime follow the [contact response](content-and-gameplay.md#authored-contact-response). The
scene decodes every effect when it is built, so the first of each sounds when it happens.

The [run effects](../src/shell/run-effects.ts) read only race facts, after every fixed step of the run: `countdown-lamp`
as each signal lamp lights during READY, `countdown-go` at GO, and for each of the player's crossings in the step's
events one sound: none for the crossing that finishes the run (GOAL's effect sounds), else `extend` when the crossing
extended the clock, else `final-lap` at a circuit's finish line when the lap it begins is the last, else `lap` at the
finish line and `checkpoint` at a checkpoint. At GOAL `goal` and at GAME OVER `game-over` (effects of about 1.3 s) play
once, from that moment, while the track fades beneath them; the outcome effect may sound on into RESULT and stops when
the run is left or its run is replaced. When RESULT shows NEW RECORD after a finish, `new-record` plays once as
RESULT appears, after the outcome effect at the default RESULT delay; a circuit lap that sets a TIME ATTACK record
plays it as the lap completes. Each happening sounds once: a step's facts are read once, so two
crossings in one frame both sound, a pause runs no steps, and a new run (RETRY or a DEV rebuild) starts afresh. Other competitors'
crossings never sound. Menu commands sound through the screen host ([Browser](browser.md#menu-input)).

## Contact sound

The player's contacts sound on the `contact` bus, a live bus that follows the MASTER volume alone. Only contacts of the
player's own vehicle sound, from the race's [player contact
observations](content-and-gameplay.md#player-contact-observations). Only the instant a contact begins sounds: sliding
along a wall or another vehicle has no sound of its own.

A hit is a recording: each contact of the player's that begins plays its counterpart's impact recording
(`impacts/vehicle`, `impacts/wall` for a wall, a course limit or a wall's free end, `impacts/object`,
`impacts/movable`) once on the `contact` bus, in the fixed step the contact begins, with no lookahead and no waiting
for the contact to end. Its volume is `W / (W + reference)` of the recording's full volume, from the work `W` the
contact's damper term dissipated: linear in a small work and approaching the full volume for a large one. The reference
work is one IMPACT setting ([`ImpactSettings`](../src/audio/impact-acoustics.ts)) per counterpart, since the counterparts'
masses differ by orders of magnitude. There is no threshold: a small work gives a quiet hit. Impacts are decoded when
the scene is built.

## Mix and lifetime

The [sound graph](../src/audio/sound-graph.ts) owns the named buses (`engine`, `tire`) and the master path:
each bus feeds the MASTER gain, then a compressor set by the MIX settings (`MixSettings`, written directly to
the compressor's parameters), then the output. Each bus declares whether it is live: a live bus sounds only while a
vehicle is driven, through one live gate before the MASTER gain. A vehicle is driven during a run and on SELECT
VEHICLE's ENGINE page, which revs the shown vehicle's engine standing still and gives its observation as the
player's, with no rivals ([Browser](browser.md#engine)); menu music and effects are unchanged by it. `engine`, `tire` and `contact` are live; `music` and
`effects` are not. The player record's volumes are the one source of the MASTER gain and of the `music` (MUSIC) and `effects`
(EFFECTS) bus gains; the DEV ENG and TIRE mix
values set the live buses' gains. A volume change applies at once through the bus and master gains.
The [audio scene](../src/audio/audio-scene.ts) loads the generators, owns the voices (player engine, selected
rival engine with its panner, player tires) on those buses, and owns rival selection, reassignment and
spatialization; the RIVAL settings (`RivalSettings`) own the audible distance, reference distance, pan floor and
reassignment time. The nearest observed vehicle within `audibleMeters` occupies the rival slot; candidates are the
rivals and traffic vehicles the race observes on the resident Route. That cutoff is game policy, not acoustics. The gain follows the
inverse-distance law `referenceMeters/max(referenceMeters, distance)` over the 3D physical world distance, and the
pan is lateral displacement in the player's yaw frame divided by `max(panMinimumMeters, distance)`. A change of rival ID silences the slot and waits the reassignment time before the new rival sounds. Each engine
voice sounds the engine sound of its competitor's vehicle (the observation's vehicle ID, resolved through the
vehicle catalog) at its divisor and gain; when a voice's sound, divisor or gain changes, it fades to silence and the new
kernel starts once it is silent. ENG, TIRE and MASTER independently multiply their
outputs. A new sound kind adds one bus and connects its voices to it. Component output switches leave synthesis
state running.

The TIMING settings ([`ControlSettings`](../src/audio/audio-control-policy.ts)) are the only record of control
time constants, and each control has one smoothing authority. Voices write engine RPM, engine opening and tire
inputs directly to AudioParams (tire inputs after their one validation in
[Tire audio](tire-audio.md#observation-transport)); the kernels follow them per sample with `observationSeconds`. Output
gains, bus and master gains and the rival pan follow only through AudioParam automation (`gainSeconds`,
`mixSeconds`, `panSeconds`). The silence fade (`fadeToSilence`, over `fadeSeconds`) ramps linearly to zero and
reaches it at a known time; every discontinuity (a kernel replaced, a source stopped, a worklet resting) happens at
that time, in silence. `transitionSeconds` is the time woken kernels follow the observations before the live gate
opens. The main thread reads these values when it schedules each change; the kernel
values (`observationSeconds`, `componentSeconds`) travel with the worklet's settings message, so a TIMING change
replaces the kernels like a settings change. Engine sound, divisor, gain and control
replacement fades to silence before installing a new kernel. New settings supersede pending values;
returning to active values cancels pending replacement. Tire replacement is specified in
[Tire audio](tire-audio.md#settings-replacement).

Construction leaves the AudioContext unopened. The first eligible gesture creates it: the CONFIRM on TITLE, or any
gesture during a run the URL started. From then on the context runs while the page is visible; only a hidden page
suspends it, and becoming visible resumes it (an eligible gesture resumes it where the browser requires one). Pause,
menus, the PRE-RACE card and RESULT leave it running, and SOUND OFF only sets the MASTER gain to zero: whether the clock
runs depends on visibility alone, so nothing is scheduled on a stopped clock while the sound is off. The screen host's route
is the one procedure that tells audio both facts, whether the page is visible and whether a vehicle is driven
(`setRoute`); audio never reads document visibility itself. While no vehicle is driven, the live gate closes with the
silence fade, the worklets of the voices on live buses rest from the moment it is silent, rendering silence without
running their kernels, and the voices receive no observations. When a vehicle is driven again, the worklets wake at once
and continue from the state they rested in, the voices write the current observations, and the gate opens
`transitionSeconds` after it is silent, so the kernels have followed the observations before they are heard. A page hidden without entering the back/forward cache disposes the context.
Disposal closes the context, including a graph completing initialization after disposal. Module URLs resolve within
the selected commit-versioned build.

For DEV measurement only, each worklet carries a processing meter
([`processing-meter.ts`](../src/audio/processing-meter.ts)) that reads no clock until its voice asks it to measure;
then it times each render block with `Date.now()` (whole milliseconds, the one clock every worklet scope has) and
posts the blocks, the overruns (blocks that took longer than the audio they produced) and the longest block about once
a second. The audio lifetime applies a measuring listener to every scene it builds.

An audio failure closes the affected graph and exposes retry while driving continues; a retry builds a new graph, on
which the playing music starts again from its beginning ([recording player](#recording-playback)). A worklet processor's failure is
one: every voice (tire and engine) watches its worklets' `processorerror`
([`processor-failure.ts`](../src/audio/processor-failure.ts)) and its next update throws, which fails the graph. A late result
from an older initialization cannot replace or close a newer graph. Invalid processor replacements
produce silence. Browsers without AudioWorklet support remain playable with unavailable sound, and so does a device
whose output rate lies outside the synthesis's sample rates (`SYNTHESIS_RATE_DOMAIN`,
[Tire audio](tire-audio.md#numerical-domain)): its first context is closed before any voice is built, one console
error names the rate, and the sound stays unavailable, with no retry.
The browser's normal audio session and device output controls determine audible output.
