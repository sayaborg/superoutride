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
the exhaust from the valves to the mouths, written as what the [exhaust kernel](#the-exhaust-kernel) reads (K,
2026-11-25): one cylinder's exhaust valve (`valve`), one internal diameter for every tube (`diameter`, in metres) and the
tubes (`tubes`), each `{from, to, length}` with only a length in metres. Each firing phase is that cylinder's
exhaust-opening instant (start of blowdown); the offset from combustion top dead centre is common to all cylinders and
is not represented. Phase count determines cylinder count. The valve's `diameter` is that of the circle whose area is
the valve's greatest open area (for poppet valves `count × min(π·d·lift, π·d²/4)`, for a two-stroke the port window's
area), and `open` is how long it is open, seat to seat, as a share of the cycle from the firing phase.

A tube begins at a valve (`from: null`) or a junction and ends at a junction or a mouth, open to the outside
(`to: null`). [`compileEngineSound`](../src/audio/engine-sound.ts) validates an `EngineSoundDefinition` into an
`EngineSound` by these rules, each refused where it is read:

1. The valve's `diameter` is positive and its `open` within (0, 1); the exhaust's `diameter` is positive and at most
   0.5 m (`exhaust/diameter`); each tube's `length` is positive and at most 8 m (`exhaust/tubes/<n>/length`).
2. The first tubes, one for each firing phase in their order, are the cylinders', from their valves (cylinder `i`'s is
   tube `i`, the head's exhaust port included); no other tube runs from a valve (`exhaust/tubes/<n>/from`).
3. Junctions are numbered from 0 with none missing (`exhaust/tubes`).
4. A junction is where three or more tubes meet: two meeting alone are one tube, written as one of their lengths
   together, so an exhaust has one writing; a cylinder's tube may run from its valve to a mouth (`exhaust/tubes`).
5. At least one tube ends at a mouth, and every junction reaches one through tubes (`exhaust/tubes`).

The resource limits are author values bounding the kernel's work and storage and refusing broken values, not claims
about real engines or rules of the sound: 1 to 16 firing phases, at most 48 tubes and tubes of at most 8 m
(`EXHAUST_LIMITS`; the delivered sounds have at most 21 tubes, and their longest tube is 3.43 m). Firing rows identify events and collector groups.

Engine sound definitions are content: `content/engine-sounds/<id>.json` stores one
`superoutride.engine-sound` version 3 document per sound ID, its file name without `.json`, which is also its
manifest ID; the documents carry none. The fields are `format`, `version`, `cycleRevolutions`, `firingPhases`,
`exhaust` (`valve` of `{diameter, open}`, `diameter`, and `tubes` of `{from, to, length}`) and `metadata` (authoring
notes, such as each value's references; not read, and kept as written only for the DEV export). The audio layer
compiles a document: [`compileEngineSoundDocument`](../src/audio/engine-sound-document.ts) checks format, version and
field shapes with the admission toolkit and leaves value validation to `compileEngineSound`, whose failure is an
`invalid_value` diagnostic at the field the rule reads (`/exhaust/tubes/0/length`, `/exhaust/tubes/2/from`,
`/exhaust/diameter`, `/exhaust/valve/open`), or at `/exhaust/tubes` for the rules over the tubes together; the
`CompiledEngineSound` adds the sound ID and the delivered bytes' SHA-256. Firing phases are used exactly as written. The
content layer ([engine-sound catalog](../src/content/engine-sound-catalog.ts)) admits every document, delivers it as
kind `engine-sound` and passes the catalog to the vehicle catalog, whose listings resolve their `sound` in it; the same
sample-free engine kernel plays every sound. DEV's ENGINE SOUNDS panel ([Browser](browser.md#sound-controls)) changes a
sound's valve, its diameter and its tubes' lengths, each change through `compileEngineSound`; every voice whose
competitor's vehicle uses that sound fades to silence and installs it, as for any change of sound.

**Where an exhaust comes from.** A document written before EL-7 is its engine's first-written exhaust read as the
kernel reads it; that exhaust, every tube with its own diameter, and its sources are in `sayaborg/callcutter`. The
diameter is that exhaust's primaries' diameter; each tube's length is that exhaust's tube's, the tubes that run on in a
row without a junction between them added together; the valve is as it was. Each such document's note says so and
names its first-written exhaust there. A document written later is written in this form from the start and gives its
own sources in its note.

## Engine synthesis

The game's one engine kernel is the exhaust kernel below (K, 2026-11-24). The former game kernel, K's reference kernel of
2026-11-20, continues in `sayaborg/callcutter`.

### The exhaust kernel

The kernel, [`Exhaust`](../src/audio/exhaust.ts) (K, 2026-11-23), is a model of its own, reading nothing of
another sound file but the engine sound's type: one gas, in tubes of one width that have only a length,
between valves, junctions and mouths. A sound fades in four ways only: in a wall's boundary layer, in a flow's friction
on its wall (K, 2026-11-24), in a valve's jet and out of a mouth. Pressures are over the tubes' `rho c²` and flows are Mach numbers; a tube carries two waves, its pressure
their sum and its flow their difference.

| Part      | Kernel                                                                                                                                                                                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tube      | Delays each of its two waves by its length over the waves' speed, a whole number of samples (at least one); each pass takes a still gas's boundary-layer loss, growing as the root of the frequency.                                                                                                                                                                 |
| Friction  | The tube's flow rubs on its wall, all of it taken at the tube's middle (its friction, below).                                                                                                                                                                                                                                                                        |
| Junction  | Its `n` tubes meet at one pressure and it keeps no gas: `p = (2/n) sum(arriving)`; each tube's wave leaves as `p − arriving`.                                                                                                                                                                                                                                        |
| Mouth     | A sphere of the bore's area breathing into the open: the wave returns turned over through a one-pole low-pass at `ka = 1` (angular frequency `c/a`); heard is what did not return, the sphere's pressure, times the diameter. The kernel's sound is the sum over its mouths.                                                                                         |
| Valve     | A throat, `a` of the bore at `discharge × (valve/bore)² × lift²` (lift `4x(1−x)` over the opening, at most 1), between its tube and a cylinder, a still space holding its gas at `(gas/volume)^gamma`. The gas speeds up into the throat without thinning and loses its jet's head beyond it, no faster than sound in the throat; shut, it is its tube's closed end. |
| Afterfire | A charge that left its cylinder unburned: when its valve shuts, its heat swells the gas at that valve over `afterfireSeconds`, a raised cosine, entering its tube as a flow.                                                                                                                                                                                         |

With `d` the tube's stopped pressure (twice its arriving wave) above the cylinder's and `m` the flow from the tube into
the cylinder, `g m + K m²/2 = |d|`, `K = 1/a² − 1` into the cylinder and `(1 + (1/a − 1)²) density/fill` out of it;
`g` is how far the two sides give way to a flow of one, the tube's 1 and the cylinder's pressure's move in a sample,
`g = 1 + perSample × full / (fill × volume)`. The flow is solved once a sample in closed form,
`m = 2|d| / (g + sqrt(g² + 2K|d|))` (`through`), and no faster than sound in the throat. A cylinder starts holding the outside's air; its valve opens with the
middle of its opening at the middle of the exhaust stroke (a two-stroke's at bottom dead centre), and as it opens the
cylinder takes its charge, `closedCharge + (1 − closedCharge) × opening` of a full one varied by up to `chargeVariation`
(seeded xorshift32 at firings), burned unless the fuel is cut or it afterfires. Nothing allocates while rendering, and
the sound is the same however the calls divide the samples.

**What it reads.** The engine sound's exhaust as it is written ([its rules](#observations-and-engine-sounds)): the
valve, the one diameter and the tubes, cylinder `i`'s tube `i`. Junctions are numbered from 0, so their count is the
highest junction a tube names, plus one; there is no reading in between.

**Its own values.** The kernel keeps every value it uses. Its gas
(`GAS`) is burned gas everywhere, a perfect gas of `gamma` 4/3 and `R` 287 J/(kg K), `Pr` 0.71, at 101325 Pa; the waves'
speed is 480 m/s, so a centimetre of tube is a sample at 48 kHz, and the tubes' temperature follows from it,
`c²/(gamma R)`, about 602 K. The intake's charge is at 293.15 K and the cylinder's gas at 1100 K as its valve opens. The
engine's assumptions (`ENGINE`) are the valve's discharge coefficient 0.65 and a shut throttle's charge 0.3. The
friction factor (`FRICTION`) is 0.02, a commercial steel pipe's in turbulent flow at the exhaust's Reynolds numbers: an
assumption, not chosen by listening. Two values
are chosen by listening (`LISTENED`): a charge varies by up to 0.03 of a full one, and an afterfire burns over 1.5 ms.

**Its wall.** Kirchhoff's loss of a still gas, `kappa sqrt(f)` nepers a pass with `kappa = WALL × length / radius` and
`WALL = sqrt(pi mu / rho)/c × (1 + (gamma − 1)/sqrt(Pr))` at the tubes' temperature (Sutherland's viscosity), is
followed by four first-order shelves in series at corners 20, 160, 1280 and 10240 Hz (`SHELVES`, ratio 8). The shelf at
corner `f` is `kappa sqrt(f) sqrt(2) ln(8)/pi` nepers deep, the lowest carrying the shelves below it as well (its depth
times `sqrt(8)/(sqrt(8) − 1)`); each falls from 1 to `exp(−depth)` with its pole at its corner and its zero the depth
above it, both placed on the tangent `tan(pi f / rate)`. The kernel runs only above twice its highest corner, 20480 Hz,
and refuses a slower rate with a `RangeError`; it plays at the output's rate.

**Its friction.** A tube's flow rubs on its wall (Darcy): the tube takes `FRICTION × (length / diameter) × m|m|/2` of
pressure, `m` the flow's Mach number and pressure over `rho c²`. All of it is taken at one place, the tube's middle (the
midpoint rule). With `d` twice the down wave less the up wave passing the middle and `K = FRICTION × length / diameter`,
`2m + K m²/2 = |d|`, the valve's law between two halves of a tube that each give way by 1, solved by the same `through`;
`m` has the sign of `d`. The waves go on from the middle as `up + m` (down) and `down − m` (up), so no gas is lost. The
tube is not split: the two cells passing its middle are rewritten in place. A tube of one sample has no middle and no
friction.

Every tube of the exhaust kernel is as wide as the cylinders' tubes (the real headers' bore), so beyond a junction the
flow is faster than a real exhaust's, and its friction acts more strongly than a real one's: on the F40 at full throttle
(the auditor's figures) the cylinders' tubes' flow reaches Mach 0.08, the tube after their junction 0.34 and the mouth's
0.64. This follows from the
assumption that tubes have only a length, and the friction factor is not tuned to offset it.

## Engine chain

```text
exhaust kernel at the output's rate -> compressor -> gain (engineDriveLufs) -> soft clip
                                   -> voice/master gain -> master compressor
```

The kernel's sound, at the output's rate, goes through the [engine chain](../src/audio/engine-chain.ts) (K, 2026-11-21)
takes it through three stages, in this order:

1. **Compressor.** The sound's mean square over 50 ms (`level += f (x² - level)`, `f = 1 - exp(-1/(0.05 × rate))`)
   sets `x × level^(-1/4)`: a ratio of 2:1 with its threshold at the bottom, so all of the sound is compressed.
2. **Gain.** The vehicle's gain, `10^((engineDriveLufs - lufs)/20)`, brings its
   [measured](#engine-loudness) compressed sound to MIX's `engineDriveLufs`.
3. **Soft clip.** `y/(1 + |y|/2)`: below the ceiling of 2 and of unit small-signal gain (`softClip(y/2, 2)` of the
   former form).

The ratio, the 50 ms and the ceiling are the owner's values, kept by the code (`ENGINE_CHAIN`), not DEV settings. An
engine's sound therefore exceeds 1, up to 2; the mix after it (effects, music, the final bound) is K's to decide
separately. The kernel's own sound is a very small number (below BS.1770's −70 LUFS gate), so it is measured and
levelled after the compressor. The chain, like the kernel, starts from silence whenever a voice installs a kernel.

## Derived values

Derived values follow from physics and are never DEV settings: the exhaust kernel's tubes' temperature, choked flow, wall
loss and mouths' corner ([the exhaust kernel](#the-exhaust-kernel)), the rival inverse-distance law and the rival pan
geometry.

A vehicle's mechanics give its engine sound two values ([vehicle engine sound](../src/audio/vehicle-engine-sound.ts)):
one cylinder's swept volume, the displacement over the cylinders, and the geometric compression ratio.
`compileVehicleEngineSound` takes them once where the vehicle catalog pairs a vehicle's mechanics with its listing's
sound (`createVehicleDefinition`), and the vehicle's `sound` carries them; when DEV's ENGINE SOUNDS panel changes a
sound, the audio lifetime pairs it again for each vehicle using it.

The exhaust kernel's two listened values (`LISTENED`) are the owner's, kept by the code, not DEV settings. Every other
value is a DEV setting in one of the groups MIX (`MixSettings`), TIMING
(`ControlSettings`), RIVAL (`RivalSettings`), IMPACT (`ImpactSettings`) and the tire groups UNIFIED (`UnifiedSettings`)
and ROLLING (`RollingSettings`); they are the implementer's, and [Calibration](calibration.md) lists them. DEV has no
ENGINE group (K, 2026-11-21).

## Engine loudness

Vehicles' exhausts differ in level, as physics makes them; the game levels them by measurement, while each engine's own
changes of level as it is driven (idle against full throttle) stay its physics' and its compressor's. Each vehicle's
engine loudness is measured once, outside the build, and saved with the identities of what it was measured from. The
measurement ([engine loudness](../tools/authoring/engine-loudness.ts)) runs the exhaust kernel at the 48 kHz output's rate,
with the audio document's TIMING settings, on one drive, the same for every vehicle at its own idle and redline:

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
gate 10 LU below the gated mean. The procedure's record (`ENGINE_LOUDNESS_PROCEDURE`, version 9) holds the drive, the
rate and what it meters; the SHA-256 of its JSON is its identity, and a change to its results raises its
version.

`content/engine-loudness/default.json` is the one `superoutride.engine-loudness` version 6 document, with exactly
`format`, `version`, `procedureSha256`, `audioSha256` (the audio document's SHA-256) and `vehicles`: every catalog
vehicle once, in catalog order, with `vehicleId`, `vehicleSha256` (its mechanics document's SHA-256), `soundSha256`
(its engine sound document's) and `lufs`, its one loudness (LUFS). The
measurement tool writes it ([Development](development.md#measured-products)),
measuring every vehicle again when any identity differs; a build admits it as a
[measured product](content-and-gameplay.md#measured-products), refusing it as stale when any identity differs, and
delivers it as saved (kind `engine-loudness`, ID `default`). [`readEngineLoudness`](../src/content/engine-loudness.ts)
is its one reader; a vehicle whose `lufs` is not a number is refused at its `lufs`.

The game loads it once with the catalog (`loadEngineLoudness`), refusing a delivered one whose identities are not the
delivered documents'. Each engine voice, the rival's included, takes the gain `engineGain` of its vehicle's loudness; the rival's inverse-distance gain follows the chain. A delivery without the engine loudness (the
workbench's build while measurements are stale) gives every engine the gain 1, unlevelled. A changed gain (a DEV MIX
change, another rival vehicle) fades and replaces the kernel as any change does. DEV's ENGINE SOUNDS
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
vehicle is driven, through one live gate before the MASTER gain. A vehicle is driven during a run and while a vehicle's
card rests in focus on the rows, which revs its engine standing still and gives its observation as the player's, with
no rivals ([Browser](browser.md#card-rows)); menu music and effects are unchanged by it. `engine`, `tire` and `contact` are live; `music` and
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
vehicle catalog) at its gain; when a voice's sound or gain changes, it fades to silence and the new
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
replaces the kernels like a settings change. Engine sound, gain and control
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
