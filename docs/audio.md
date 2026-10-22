# Procedural audio

Audio renders completed vehicle observations and never changes them. Its pressure-like pulses,
pipe dimensions and output gains form an authored acoustic surrogate rather than measured vehicle
sound. Every audio value is either derived from physics or a DEV listening setting; implementer-chosen
empirical constants are not kept. [Tire audio](tire-audio.md) owns UNIFIED synthesis, [Calibration](calibration.md) owns numeric
values, [Browser](browser.md#sound-controls) owns operation.

## Observations and engine sounds

The [acoustic observation](../src/audio/vehicle-audio-observation.ts) contains powertrain and tire
inputs. A vehicle audio emitter ([audio scene](../src/audio/audio-scene.ts)) adds the competitor ID and
its physical world pose; player and rivals are supplied in the same emitter form. From the powertrain, audio reads engine RPM, the effective opening
(`effectiveOpening`, the engine's only command and the excitation), the fuel-cut latch (`fuelCut`) and the
last shift
(sequence, direction and engine RPM before and after, as
[vehicle physics](vehicle-physics.md#wheel-and-powertrain) publishes it). A sequence the voice has not yet heard
marks a new shift. A new `DOWN` shift with `toRpm > fromRpm` (a locked downshift) plays a blip: an opening peak of the
`blipOpening` setting, decaying exponentially with `blipDecaySeconds`, combined with the effective opening by
`max`. The first sequence a voice reads, and the first after `silence()` (a rival
reassignment), is only recorded. The browser supplies them once per presented frame from the race's borrowed competitor observations,
which are copied at the end of each fixed step; audio reads nothing else.
Physics owns RPM, actuators, contact loads, wheel motion and dissipated work; audio owns oscillator,
filter and envelope state. Player tire sound reads the player's observed tire observations;
rival sound uses the rival's observed powertrain values and its own vehicle's engine sound.

An [engine sound](../src/audio/engine-sound.ts) contains one or two revolutions per cycle, ordered firing phases and
the exhaust from the valves to the tail: one cylinder's exhaust valve (`valve`), each cylinder's primary and the pipes,
every tube with its length and internal diameter in metres. Each firing phase is that cylinder's exhaust-opening instant
(start of blowdown); the offset from combustion top dead centre is common to all cylinders and is not represented. Phase
count determines cylinder count, and the primaries follow the firing phases' order: cylinder i's primary runs from its
valve, the head's exhaust port included, to junction `to`. Each pipe runs from junction `from` to junction `to`, or to
an open end (`to: null`), as far as the tailpipes; a turbine is a short, narrow pipe of its throat. The valve's
`diameter` is that of the circle whose area is the valve's greatest open area (for poppet valves
`count × min(π·d·lift, π·d²/4)`, for a two-stroke the port window's area), and `open` is how long it is open, seat to
seat, as a share of the cycle from the firing phase. The resource limits are author values bounding the kernel's work
and delay storage, not claims about real engines: 1 to 16 firing phases and 1 to 16 pipes, every tube longer than 0
and at most 4 m, and wider than 0 and at most 0.5 m. Each primary and pipe is a delay pair of
`length × rate / waveSpeed` samples, rounded and at least one (`waveSpeed` 480 m/s), so the longest sound stores at
most 2 × (16 + 16) × 4 m × 192000 / 480 = 102400 samples. `compileEngineSound` validates an `EngineSoundDefinition`
into an `EngineSound`: positive valve diameter, `open` within (0, 1), one primary per firing phase, tubes within the
limits and the junctions' topology. Firing rows identify events and collector groups.

Engine sound definitions are content: `content/engine-sounds/<id>.json` stores one
`superoutride.engine-sound` version 2 document per sound ID, its file name without `.json`, which is also its
manifest ID; the documents carry none. The fields are `format`, `version`, `cycleRevolutions`, `firingPhases`,
`exhaust` (`valve` of `{diameter, open}`, `primaries` of `{length, diameter, to}` and `pipes` of
`{length, diameter, from, to}` with `to: null` for an open end) and `metadata` (authoring notes, such as each value's
references; not read, and kept as written only for the DEV export). The audio layer compiles a document:
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

## Engine synthesis

The voice reads engine RPM exactly as simulated; physics keeps it at or above idle, and the exhaust
processor's own `rpm` parameter range (1 to 24000) is the only bound: 1 keeps the crank's samples per degree,
`rate / (6 × rpm)`, finite, and 24000 is an author value above every catalog redline. Excitation follows the
powertrain's effective opening, so it includes the idle-holding opening. Closed throttle has a positive
excitation floor, `closedExcitation`: weak combustion, distinct from fuel cut. While the observation reports
fuel cut, firings sound with the `pumpingExcitation` strength and no variation, as exhaust-valve blowdown
without combustion. At the limiter the physical latch alternates between its clear and entry thresholds (1.03 and 1.05 times redline),
so combustion stops and resumes in turn and is heard as the limiter's interruption. Stronger excitation,
pumping included, shortens pulse rise time, while decay time is independent of load and RPM.

At each firing, `strength = max(0, excitation + pulseVariation*r)` for seeded xorshift32 `r` in `[-1,1)`.
Variation is an absolute fraction of full excitation. The same seed and input history reproduce the
same event sequence; random draws occur at firing events.

The pulse model is:

```text
p'  = -p/decayTime
r1' = (p-r1)/(riseTime/2)
r2' = (r1-r2)/(riseTime/2)
```

The pipe receives `r2`. Two equal stages of `riseTime/2` keep the one-stage mean delay `riseTime` and the
pulse area `strength*decayTime`, while the pressure onset starts with zero slope (C1): a slope discontinuity
at firing would be heard as a click.

`riseTime` is `pulseRiseMs` divided by excitation, in absolute time: the wavefront is set by the pressure
ratio when the valve opens and does not depend on RPM. `decayTime` is the cylinder's blowdown time constant
(`pulseDecaySeconds`, [derived](#derived-values)), also in absolute time: the time the cylinder's gas takes to leave
through its valve and primary, whatever the RPM, so in crank angle the tail spans 6–10° at idle and 44–74° at redline
on the delivered vehicles. Cylinders with equal decay times share the per-sample pulse weights. Firing resets `p` and
keeps `r1` and `r2` continuous. Exact exponential evolution across fractional firing times supplies the sample-average pulse to the
pipe.

The exhaust is a graph of junctions and tubes. Junctions are numbered from 0; each cylinder's primary ends at
its junction `to`, and each pipe runs from junction `from` to junction `to` or to an open end (`to: null`).
Every junction reaches an open end through pipes; loops are allowed, since a ring of pipes is physical. A merge
(2-1, a turbine inlet), a log manifold's run of merges and an H or X pipe are junctions where several tubes meet. The
[waveguide](../src/audio/exhaust-waveguide.ts) gives each primary and each pipe a bidirectional delay pair,
rounded to the nearest sample at the reference wave speed. Each traversal applies the tube's wall loss
`exp(-alpha(f)*length)` ([derived values](#derived-values)) as four first-order shelves of unity DC gain. Every junction
scatters by its ports' cross-sections whatever their direction: `p = 2*sum(A_k*incoming_k)/sum(A_k)` and
`outgoing_k = p-incoming_k`, where the ports are the junction's primaries and each attached pipe end and `A_k` is the
port's tube's cross-section; with equal tubes this is equal-admittance scattering.

Each primary's valve end reflects by the valve's open area against the primary's cross-section. The valve opens at
its cylinder's firing phase and stays open for the sound's `valve.open` share of the cycle; at position `u` in that
interval its open area is `A_v = A_valve*16*u²*(1-u)²` (`A_valve = pi*valve.diameter²/4`), the lift curve approximated
with continuous value and slope at both ends, and zero while closed. The pressure reflection is
`R = (A_p-A_v)/(A_p+A_v)`, with `A_p` the primary's cross-section: a closed valve reflects +1, and through the open
valve a wave passes into the port's area beyond and does not return. The cylinder's pulse enters the primary at the
valve end. Each open end reflects with `OUTLET_REFLECTION` (-1) through a one-pole low-pass at its pipe's
`c/(2*pi*radius)`. The listening pickup sums each open end's outgoing and low-passed outgoing waves, divided by
`sqrt(openEndCount)`.

Pipe cross-sections enter through each tube's diameter (scattering, wall loss and open-end cutoff); silencer,
catalyst and collector-box bodies are written as straight pipes of their inlet diameter, and a run of equal pipes as
one. A displacement pulse, expansion chambers and packing absorption were tried (11-7b–11-7k) and cycle speed
fluctuation was considered: none improved driving sound, and each added computation.

Each acoustic step runs at the output sample rate. Integer pipe delays, the pulse approximation and
native-rate nonlinear stages define the model's temporal and spectral resolution. The kernel renders in blocks (`render`) of at
most 64 samples and never longer than its shortest delay line, so every arrival a block reads was written before it:
a block computes each cylinder's pulse and valve end sample by sample, reads every line, scatters at every junction,
then passes every line's leaving waves through its wall loss and writes them. Each sample's arithmetic, and the order
of every sum (a junction's ports: its primaries in cylinder order, then each pipe's `from` and `to` ends; the pickup's
open ends in pipe order), is the same as rendering that sample alone, so the output does not depend on how the calls
divide the samples. The pulse weights are prepared again only when the excitation changes.

## Output conditioning

```text
Collector mix -> DC removal (dcHz) -> low-pass (outputCutoffHz)       physics: the exhaust's pressure
              -> drive (engineDriveLufs) -> soft clipping (clipCeiling)  listening
              -> voice/master gain -> compressor
```

The DC removal and the low-pass are the exhaust's own: `dc += a*(x-dc)` and `tone += b*(x-dc-tone)` with
`a = 1-exp(-2*pi*dcHz/sampleRate)` and `b = 1-exp(-2*pi*outputCutoffHz/sampleRate)`, both [derived](#derived-values):
the DC goes and the idle's fundamental stays, and the output keeps the band in which the one-dimensional pipes hold.
The waveguide returns this pressure; the exhaust processor then applies the listening stage: the drive, the gain that
brings the vehicle's [measured engine loudness](#engine-loudness) to MIX's `engineDriveLufs`, then soft clipping
`y = clipCeiling*x/(1+abs(x))` (`softClip`), with small-signal gain and asymptotic bounds `clipCeiling`. Every engine
thus enters the soft clip equally loud, and these two DEV values set how it is clipped for all alike: how hard it enters
(`engineDriveLufs`) and its bound (`clipCeiling`). The smooth saturation's added components are small and fall off
steeply above the signal, so they are not filtered again. The master compressor supplies envelope-based compression.
Output depends on the engine sound, the vehicle's engine and measured loudness, RPM, excitation and fixed mix gains.

## Derived values

Derived values follow from physics and are never DEV settings: the wave speed (`ACOUSTICS.waveSpeed`, 480 m/s),
each tube's wall-loss filter and open-end cutoff, the open-end and valve-end reflections, each vehicle's output
low-pass, DC removal and pulse decay (values in [Calibration](calibration.md#derived-values)), the rival
inverse-distance law and the rival pan geometry.
[Exhaust acoustics](../src/audio/exhaust-acoustics.ts) derives the pipe values under stated physical assumptions
(`REFLECTION_REFERENCE`): 573.15 K air at 101325 Pa, `gamma=1.4`, `R=287 J/(kg K)` and `Pr=0.71`; each tube's radius
`a` is its document's.

The derivation uses `c=sqrt(gamma*R*T)`, the unflanged open-end negative reflection limit, `fc=c/(2*pi*a)` and
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
domain's edge for tubes beyond the data; on the delivered sounds `f_z` reaches at most 16.0 kHz.

The four shelves in series are applied in parallel form, `C + sum R_k/(1+a1_k*z^-1)`: the poles `a1_k` are shared by
every tube (`wallLossPoles`) and each tube carries the weights `C = prod b1_k/a1_k` and the residues `R_k` at
`z^-1 = -1/a1_k` (`wallLossWeights`), computed once when the sound is assembled. A traversal updates
`u_k = x - a1_k*u_k` for k = 0..3 and writes `y = C*x + R_0*u_0 + R_1*u_1 + R_2*u_2 + R_3*u_3`, summed left to right.
For every delivered tube at 44.1 and 48 kHz the loss is 0.89–1.10 times Kirchhoff's from 50 Hz to 8 kHz, the DC gain is
1 within 1e-12 and the parallel form matches the series within 1e-12. The one-pole low-pass this replaced, fitted by
least squares in dB up to Nyquist, was set by the 10–20 kHz loss and left the audible band nearly lossless (0.1 % of
Kirchhoff's loss at 100 Hz and 3 % at 1 kHz on a 0.3 m by 36 mm tube), so tube resonances rang 10 to 100 times longer
than the wall allows.

Three values follow from a vehicle and its engine sound together. `compileVehicleEngineSound`
([vehicle engine sound](../src/audio/vehicle-engine-sound.ts)) computes them once where the vehicle catalog pairs a
vehicle's mechanics with its listing's sound (`createVehicleDefinition`), and the vehicle's `sound` carries them; when
DEV's ENGINE SOUNDS panel changes a sound, the audio lifetime computes them again for each vehicle using it:

- The output low-pass `outputCutoffHz = 1.841*c/(pi*D)`, the first transverse mode of `D`, the widest open-end pipe's
  diameter (the lowest such cutoff): above it the one-dimensional pipe model does not hold.
- The DC removal `dcHz = idleRpm/60 * cylinders/cycleRevolutions / 2`, half the idle firing frequency.
- Each cylinder's pulse decay `pulseDecaySeconds = V_cyl/(A_eff*c_cyl*psi*)`: the cylinder's volume at bottom dead
  centre `V_cyl = displacement/cylinders * r/(r-1)` (`r` the mechanics' `compressionRatio`), leaving through
  `A_eff = min(C_d*A_valve, A_primary)`, the narrower of the valve's effective area and the primary, at the cylinder
  gas's sound speed `c_cyl = sqrt(gamma*R*T_evo)` and the choked-flow coefficient
  `psi* = sqrt(gamma)*(2/(gamma+1))^((gamma+1)/(2*(gamma-1)))`.

The pulse decay's two assumptions stand beside the gas assumptions (`BLOWDOWN_REFERENCE`): the cylinder gas's
temperature when the exhaust valve opens, `T_evo = 1100 K` (petrol engines are typically 1000–1300 K), and the
exhaust valve's discharge coefficient `C_d = 0.65` (measured exhaust valves give 0.6–0.7 at working lift).

Every other value is a DEV setting in one of the groups ENGINE (`ExhaustSettings`), MIX (`MixSettings`),
TIMING (`ControlSettings`), RIVAL (`RivalSettings`), IMPACT (`ImpactSettings`) and the tire groups UNIFIED
(`UnifiedSettings`) and ROLLING (`RollingSettings`); ENGINE's values are the owner's, chosen by listening, the others
the implementer's, and [Calibration](calibration.md) lists them.

## Engine loudness

Vehicles' exhausts differ in level, as physics makes them; the game levels them by measurement, while each engine's own
changes of level as it is driven (idle against full throttle) stay its physics'. No automatic gain control follows the
sound. Each vehicle's engine loudness is measured once, outside the build, and saved with the identities of what it was
measured from. The
measurement ([engine loudness](../tools/authoring/engine-loudness.ts)) runs the game's exhaust kernel at 48 kHz with the
audio document's ENGINE and TIMING settings on one drive, the same for every vehicle at its own idle and redline:

| Seconds | Engine speed        | Opening |
| ------- | ------------------- | ------- |
| 1       | idle                | 0       |
| 3       | idle to redline     | 1       |
| 0.3     | redline             | 1       |
| 1.7     | redline to 2500 rpm | 0       |
| 1.5     | 3000 to 3500 rpm    | 0.3     |
| 0.5     | 3500 rpm to idle    | 0       |

Engine speed changes linearly within a segment, and fuel is never cut. The kernel's output, the exhaust's pressure
before the soft clip, is metered by ITU-R BS.1770-4 integrated loudness: K-weighting, the mean square of 400 ms blocks
every 100 ms, the absolute gate at −70 LUFS and the relative gate 10 LU below the gated mean. The procedure's record
(`ENGINE_LOUDNESS_PROCEDURE`) holds the drive and the rate; the SHA-256 of its JSON is its identity, and a change to its
results raises its version.

`content/engine-loudness/default.json` is the one `superoutride.engine-loudness` version 1 document, with exactly
`format`, `version`, `procedureSha256`, `audioSha256` (the audio document's SHA-256) and `vehicles`: every catalog
vehicle once, in catalog order, with `vehicleId`, `vehicleSha256` (its mechanics document's SHA-256), `soundSha256`
(its engine sound document's) and `lufs`. The measurement tool writes it ([Development](development.md#measured-products)),
measuring every vehicle again when any identity differs; a build admits it as a
[measured product](content-and-gameplay.md#measured-products), refusing it as stale when any identity differs, and
delivers it as saved (kind `engine-loudness`, ID `default`). [`readEngineLoudness`](../src/content/engine-loudness.ts)
is its one reader.

The game loads it once with the catalog (`loadEngineLoudness`), refusing a delivered one whose identities are not the
delivered documents'. Each engine voice, the rival's included, drives its exhaust into the soft clip by
`engineDriveGain = 10^((engineDriveLufs - lufs)/20)` (MIX's target against the vehicle's measured loudness); the rival's
inverse-distance gain follows the clip as before. A delivery without the engine loudness (the workbench's build while
measurements are stale) drives every engine by 1, unlevelled. A changed drive (a DEV MIX change, or another rival
vehicle) fades and replaces the kernel as a settings change does. DEV's ENGINE and ENGINE SOUNDS panels change the
engines at once, but the loudness stays the one measured for the delivered values: the DEV panel says so
([Browser](browser.md#sound-controls)) until the changed values are adopted and measured again.

## Audio document

The game's source of these seven records is content: `content/audio/default.json` is the one `superoutride.audio`
version 8 document (manifest kind `audio`, ID `default`) with exactly the fields `format`, `version`, `exhaust`,
`unified`, `rolling`, `mix`, `control`, `rival` and `impact`, each holding every field of its record as a
number.
[`compileAudioDocument`](../src/audio/audio-document.ts) checks format, version and shapes with the admission
toolkit and leaves value validation to each record's resolver (`resolveExhaustSettings` and the others); a resolver's
`RangeError` becomes an `invalid_value` diagnostic at the field it names, such as `/exhaust/pulseRiseMs`. The
content layer ([audio catalog](../src/content/audio-catalog.ts)) admits and delivers it, and the shell loads it
at startup: the DEV sound panels and the scene's first sync start from its values, each panel's reset returns to
them, and the DEV export saves the panels' current values in the same format. [`DEFAULT_AUDIO_SETTINGS`](../src/audio/audio-defaults.ts)
is the one set of default values: each resolver fills omitted fields from it, and it serves an assembly built without
the document.

Sound settings are admitted once. The resolvers are the one value check, applied only where settings enter: the
audio document's compilation and each change on a DEV sound panel (the ENGINE panel included), where a rejected value
keeps the previous setting. Loading the audio document module admits `DEFAULT_AUDIO_SETTINGS` through the same
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
`title` (the text SELECT MUSIC lists, in characters the text tiles draw), `selectionOrder` (a positive integer, unique
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
condition; a run with MUSIC OFF has none and plays no music, while its effects still sound. A run from the selection
screens plays the track chosen on SELECT MUSIC (MUSIC OFF when the run offers no track); one from the URL plays the player
record's latest track, else the first, and adds no URL parameter. The [run music](../src/shell/run-music.ts) is the
one owner of when a run's track plays, and it reads only the race's status and whether the run is live, never a clock
or a HUD timer. When a run's race enters READY (its first signal lamp), its track starts from its beginning and
loops. While the run is not live (paused, or the page hidden) the track pauses, and it continues from where it paused
when the run is live again. At GOAL or GAME OVER it fades out over the TIMING `musicFadeSeconds` and stays silent
through RESULT. Leaving the run (RETRY, QUIT or a RESULT item) stops it, and a new run, whether RETRY's or a DEV
rebuild's, starts its track from the beginning at its own READY. Menus, the PRE-RACE card and RESULT play no run track. A run the
URL started before any gesture has no audio at its READY, so its track does not play. The audition on SETTINGS plays a
track from its beginning, looped, through the same form; it is not the run's track.

The [menu music](../src/shell/menu-music.ts) is the one owner of the selection screens' music, a series' title track:
it plays from its beginning, looped, through the same form, keeps playing while the screens ask for the same track,
stops when they ask for another or none, crossfades to another over SELECT SERIES' slide (16 fixed steps: the old
track fades out linearly as the new one rises from its beginning), and fades out over the black transition into READY
(8 fixed steps).

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
vehicle catalog); when a voice's sound changes, it fades to silence and the new sound starts once it is silent. ENG, TIRE and MASTER independently multiply their
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
replaces the kernels like a settings change. Engine sound, exhaust settings and control
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
