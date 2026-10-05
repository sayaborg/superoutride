# Procedural audio

Audio renders completed vehicle observations and never changes them. Its pressure-like pulses,
pipe dimensions and output gains form an authored acoustic surrogate rather than measured vehicle
sound. Every audio value is either derived from physics or a DEV listening setting; implementer-chosen
empirical constants are not kept. [Tire audio](tire-audio.md) owns UNIFIED synthesis, [Calibration](calibration.md) owns numeric
values, [Browser](browser.md#sound-controls) owns operation, and
[Development](development.md#audio-audition) owns audition commands and workflow.

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

An [engine sound](../src/audio/engine-sound.ts) contains one or two revolutions per
cycle, ordered firing phases, each cylinder's junction (`banks`), primary lengths and the collector graph
(`pipes`). Each firing phase is that cylinder's exhaust-opening instant (start of blowdown); the offset from
combustion top dead centre is common to all cylinders and is not represented. Phase count determines cylinder count. `compileEngineSound` validates an
`EngineSoundDefinition` into an `EngineSound`. Firing rows identify events and collector groups.

Engine sound definitions are content: `content/engine-sounds/<id>.json` stores one
`superoutride.engine-sound` version 1 document per sound ID, its file name without `.json`, which is also its
manifest ID; the documents carry none. The fields are `format`, `version`, `cycleRevolutions`, `firingPhases`,
`exhaust` (`banks`, `lengths`, `pipes` of `{length, from, to}` with `to: null` for an open end) and `metadata`
(authoring notes such as the collector `topology`; not read). The audio layer compiles a document:
[`compileEngineSoundDocument`](../src/audio/engine-sound-document.ts) checks format, version and field shapes
with the admission toolkit and leaves value validation to `compileEngineSound`; the `CompiledEngineSound` adds
the sound ID and the delivered bytes' SHA-256. Firing phases are used exactly as written. The content layer
([engine-sound catalog](../src/content/engine-sound-catalog.ts)) admits every document, delivers it as kind
`engine-sound` and passes the catalog to the vehicle catalog, whose listings resolve their `sound` in it; the
same sample-free engine kernel plays every sound.

## Engine synthesis

The voice reads engine RPM exactly as simulated; physics keeps it at or above idle, and the exhaust
processor's own `rpm` parameter range (1 to 24000) is the only bound. Excitation follows the
powertrain's effective opening, so it includes the idle-holding opening. Closed throttle has a positive
excitation floor, `closedExcitation`: weak combustion, distinct from fuel cut. While the observation reports
fuel cut, firings sound with the `pumpingExcitation` strength and no variation, as exhaust-valve blowdown
without combustion. At the limiter the physical latch alternates between redline and the fuel-cut threshold,
so combustion stops and resumes in turn and is heard as the limiter's interruption. Stronger excitation,
pumping included, shortens pulse rise time, while decay time is independent of load.

At each firing, `strength = max(0, excitation + pulseVariation*r)` for seeded xorshift32 `r` in `[-1,1)`.
Variation is an absolute fraction of full excitation. The same seed and input history reproduce the
same event sequence; random draws occur at firing events.

During overrun (observed effective opening 0 without fuel cut, judged before the blip is combined), each
firing draws a separate seeded number and becomes a pop with the `popProbability` setting. The cylinder's
combustion pulse still sounds at the closed-throttle floor, and a pulse of the `popStrength` setting fires in
that collector's pop state, which follows the same rise and decay as the cylinder pulses and enters the
collector junction as incoming pressure. Because the draw is per firing, the pop rate is proportional to RPM.
No unburnt-fuel or temperature state is kept; draw counts depend on the state, but the same seed and input
history reproduce the same sound.

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
ratio when the valve opens and does not depend on RPM. `decayTime` is the duration of the `pulseDecayDegrees`
crank angle, `D/(6*rpm)` seconds at the smoothed RPM, recomputed every sample: blowdown lasts a crank angle, so
the tail is longer at low RPM; that conversion is its only derivation. Firing resets `p` and keeps `r1` and `r2`
continuous. Exact exponential evolution across fractional firing times supplies the sample-average pulse to the
pipe.

The exhaust is a graph of junctions and pipes. Junctions are numbered from 0; each cylinder's primary ends at
its junction `banks[i]`, and each pipe runs from junction `from` to junction `to` or to an open end (`to: null`).
Every junction reaches an open end through pipes; loops are allowed, since a ring of pipes is physical. A merge
(2-1, a turbine inlet) and an H or X pipe are junctions where several pipes meet. The
[waveguide](../src/audio/exhaust-waveguide.ts) gives each primary and each pipe a bidirectional delay pair,
rounded to the nearest sample at the reference wave speed. Each traversal multiplies amplitude by
`exp(-attenuationPerMeter*length)`. Every junction scatters with equal admittance whatever the direction of its
ports: `p = 2*sum(incoming)/portCount` and `outgoing = p-incoming`, where the ports are the junction's primaries and
each attached pipe end.

After a cylinder's exhaust opens, its cylinder-end reflection varies from `cylinderClosedReflection` to
`cylinderOpenReflection` through the aperture `16*u²*(1-u)²` over `cylinderWindowCycles` of the firing cycle, then
returns to its closed value. These three are DEV settings; the window is an acoustic boundary, not the valve's
open duration: a window spanning the valve event removed the pipe resonance. The aperture has continuous value and slope and a window
mean of 8/15. Cylinder-end and outlet low-pass filters act inside their return paths. The listening pickup
sums each open end's outgoing and low-passed outgoing waves, divided by `sqrt(openEndCount)`.

A displacement pulse, pipe cross-sections and muffler segments, and packing absorption were tried (11-7b–11-7k) and
cycle speed fluctuation was considered: none improved driving sound, and each added computation.

Each acoustic step runs at the output sample rate. Integer pipe delays, the pulse approximation and
native-rate nonlinear stages define the model's temporal and spectral resolution.

## Output conditioning

```text
Collector mix -> DC removal (dcHz) -> soft clipping -> final low-pass filter
              -> voice/master gain -> compressor
```

Soft clipping uses `y = clipCeiling*x/(1+abs(x))`, with small-signal gain and asymptotic bounds `clipCeiling`.
The final filter uses `tone += a*(y-tone)`, where `a = 1-exp(-2*pi*outputCutoffHz/sampleRate)`.
It is independent of the boundary return filter. The master compressor supplies envelope-based
compression. Output depends on the engine sound, RPM, excitation and fixed mix gains.

## Derived values

Derived values follow from physics and are never DEV settings: the wave speed (`ACOUSTICS.waveSpeed`, 480 m/s),
`PIPE_COEFFICIENTS` (outlet reflection, return cutoff and attenuation; values in
[Calibration](calibration.md#derived-values)), the rival inverse-distance law and the rival pan geometry.
[Exhaust acoustics](../src/audio/exhaust-acoustics.ts) derives the pipe values under stated physical assumptions
(`REFLECTION_REFERENCE`): an unflanged 50 mm internal-diameter pipe, 573.15 K air at 101325 Pa, `gamma=1.4`,
`R=287 J/(kg K)`, `Pr=0.71` and a 500 Hz loss reference.

The derivation uses `c=sqrt(gamma*R*T)`, the open-end negative reflection limit,
`fc=c/(2*pi*radius)` and
`alpha=sqrt(pi*f*nu)/(radius*c)*(1+(gamma-1)/sqrt(Pr))`. Sutherland viscosity uses
`mu0=1.716e-5 Pa s`, `T0=273 K` and `S=111 K`; density is `p/(R*T)` and `nu=mu/density`.
The resulting loss is about 0.034 Np/m before rounding.

Every other value is a DEV setting in one of the groups ENGINE (`ExhaustSettings`), MIX (`MixSettings`),
TIMING (`ControlSettings`), RIVAL (`RivalSettings`) and the tire groups UNIFIED (`UnifiedSettings`) and ROLLING
(`RollingSettings`); the values are the implementer's, not values chosen by listening, and
[Calibration](calibration.md) lists them.

## Audio document

The game's source of these six records is content: `content/audio/default.json` is the one `superoutride.audio`
version 1 document (manifest kind `audio`, ID `default`) with exactly the fields `format`, `version`, `exhaust`,
`unified`, `rolling`, `mix`, `control` and `rival`, each holding every field of its record as a number.
[`compileAudioDocument`](../src/audio/audio-document.ts) checks format, version and shapes with the admission
toolkit and leaves value validation to each record's resolver (`resolveExhaustSettings` and the others); a resolver's
`RangeError` becomes an `invalid_value` diagnostic at the field it names, such as `/exhaust/pulseRiseMs`. The
content layer ([audio catalog](../src/content/audio-catalog.ts)) admits and delivers it, and the shell loads it
at startup: the DEV sound panels and the scene's first sync start from its values, each panel's reset returns to
them, and the DEV export saves the panels' current values in the same format. [`DEFAULT_AUDIO_SETTINGS`](../src/audio/audio-defaults.ts)
is the one set of default values: each resolver fills omitted fields from it, and it serves assemblies without the
document, the audition tools.

## Mix and lifetime

The [sound graph](../src/audio/sound-graph.ts) owns the named buses (`engine`, `tire`) and the master path:
each bus feeds the MASTER gain, then a compressor set by the MIX settings (`MixSettings`, written directly to
the compressor's parameters), then the output. Each bus declares whether it is live: a live bus sounds only while a
run is driven, through one live gate before the MASTER gain. Both buses are live.
The [audio scene](../src/audio/audio-scene.ts) loads the generators, owns the voices (player engine, selected
rival engine with its panner, player tires) on those buses, and owns rival selection, reassignment and
spatialization; the RIVAL settings (`RivalSettings`) own the audible distance, reference distance, pan floor and
reassignment time. The nearest observed vehicle within `audibleMeters` occupies the rival slot; candidates are the
rivals and traffic vehicles the race observes on the resident Route. That cutoff is game policy, not acoustics. The gain follows the
inverse-distance law `referenceMeters/max(referenceMeters, distance)` over the 3D physical world distance, and the
pan is lateral displacement in the player's yaw frame divided by `max(panMinimumMeters, distance)`. A change of rival ID silences the slot and waits the reassignment time before the new rival sounds. Each engine
voice sounds the engine sound of its competitor's vehicle (the observation's vehicle ID, resolved through the
vehicle catalog); when a voice's sound changes, it fades out and waits the transition time before the new sound
starts. ENG, TIRE and MASTER independently multiply their
outputs. A new sound kind adds one bus and connects its voices to it. Component output switches leave synthesis
state running.

The TIMING settings ([`ControlSettings`](../src/audio/audio-control-policy.ts)) are the only record of control
time constants, and each control has one smoothing authority. Voices write engine RPM, engine opening and tire
inputs directly to AudioParams (tire inputs after their one validation in
[Tire audio](tire-audio.md#observation-transport)); the kernels follow them per sample with `observationSeconds`. Output
gains, bus and master gains and the rival pan follow only through AudioParam automation (`gainSeconds`,
`mixSeconds`, `panSeconds`); silence and pre-replacement fades use `fadeSeconds`, and a discontinuity waits
`transitionSeconds` after its fade. The main thread reads these values when it schedules each change; the kernel
values (`observationSeconds`, `componentSeconds`) travel with the worklet's settings message, so a TIMING change
replaces the kernels like a settings change. Engine sound, exhaust settings and control
replacement fades to silence before installing a new kernel. New settings supersede pending values;
returning to active values cancels pending replacement. Tire replacement is specified in
[Tire audio](tire-audio.md#settings-replacement).

Construction leaves the AudioContext unopened. The first eligible gesture creates it: the CONFIRM on TITLE, or any
gesture during a run the URL started. From then on the context runs while the page is visible; only a hidden page
suspends it, and becoming visible resumes it (an eligible gesture resumes it where the browser requires one). Pause,
menus, LOADING and RESULT leave it running, and SOUND OFF only sets the MASTER gain to zero. The screen host's route
is the one procedure that tells audio both facts, whether the page is visible and whether a run is driven
(`setRoute`); audio never reads document visibility itself. While no run is driven, the live gate closes with the
silence fade (`fadeSeconds`), the worklets of the voices on live buses rest from the transition time
(`transitionSeconds`) after it, rendering silence without running their kernels, and the voices receive no
observations. When a run is driven again, the worklets wake at once and continue from the state they rested in, the
voices write the current observations, and the gate opens after the transition time, so the kernels have followed the
observations before they are heard. A page hidden without entering the back/forward cache disposes the context.
Disposal closes the context, including a graph completing initialization after disposal. Module URLs resolve within
the selected commit-versioned build.

For DEV measurement only, each worklet carries a processing meter
([`processing-meter.ts`](../src/audio/processing-meter.ts)) that reads no clock until its voice asks it to measure;
then it times each render block with `Date.now()` (whole milliseconds, the one clock every worklet scope has) and
posts the blocks, the overruns (blocks that took longer than the audio they produced) and the longest block about once
a second. The audio lifetime applies a measuring listener to every scene it builds.

An audio failure closes the affected graph and exposes retry while driving continues. A late result
from an older initialization cannot replace or close a newer graph. Invalid processor replacements
produce silence. Browsers without AudioWorklet support remain playable with unavailable sound.
The browser's normal audio session and device output controls determine audible output.
