# Procedural audio

Audio renders completed vehicle observations and never changes them. Its pressure-like pulses,
pipe dimensions and output gains form an authored acoustic surrogate rather than measured vehicle
sound. [Tire audio](tire-audio.md) owns UNIFIED synthesis, [Calibration](calibration.md) owns numeric
settings, [Browser](browser.md#sound-controls) owns operation, and
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
rival sound uses the rival's observed powertrain values.

An [engine sound](../src/audio/engine-sound.ts) contains one or two revolutions per
cycle, ordered firing phases, collector membership, primary lengths with one primary bore, and the outlet: one to
four series segments (length and bore) from each collector to the open end. Bores are 0.01–0.3 m, primaries
0.1–3 m and the outlet 0.1–4 m in total. Engine sounds are typical sketches, not measured exhausts: a car outlet is
collector → muffler (a wide segment, an expansion chamber) → tailpipe, and the two-stroke outlet is an expansion
chamber → narrow tail. Each firing phase is that cylinder's exhaust-opening instant (start of blowdown); the offset from
combustion top dead centre is common to all cylinders and is not represented. Phase count determines cylinder count. `compileEngineSound` validates an
`EngineSoundDefinition` into a `CompiledEngineSound`; the vehicle catalog binds the
[engine sounds](../src/vehicle/engine-sounds.ts) to the
same sample-free engine kernel. Firing rows identify events and collector groups.

## Engine synthesis

The voice reads engine RPM exactly as simulated; physics keeps it at or above idle, and the exhaust
processor's own `rpm` parameter range (1 to 24000) is the only bound; a positive RPM keeps every
crank-angle-to-time conversion finite. Excitation follows the
powertrain's effective opening, so it includes the idle-holding opening. Closed throttle has a positive
excitation floor, `closedExcitation`: weak combustion, distinct from fuel cut.

Every firing fires two pulses in its cylinder:

- **Combustion** (blowdown): strength follows excitation with variation, decays over `pulseDecayDegrees`,
  and is skipped while the observation reports fuel cut.
- **Displacement** (the piston's push): always present regardless of load or fuel cut, with strength
  `pumpingExcitation`, no variation, and decay over the exhaust-stroke angle `displacementDecayDegrees`.

The pipe receives the sum of both emissions. Fuel cut only removes the combustion pulse, so the
displacement pulse remains; at the limiter the physical latch alternates between redline and the fuel-cut
threshold, so combustion stops and resumes in turn and is heard as the limiter's interruption. Stronger
excitation shortens pulse rise time, while decay time is independent of load.

At each combustion firing, `strength = max(0, excitation + pulseVariation*r)` for seeded xorshift32 `r` in `[-1,1)`.
Variation is an absolute fraction of full excitation. The same seed and input history reproduce the
same event sequence; random draws occur at firing events.

During overrun (observed effective opening 0 without fuel cut, judged before the blip is combined), each
firing draws a separate seeded number and becomes a pop with the `popProbability` setting. The cylinder's
combustion pulse still sounds at the closed-throttle floor, and a pulse of the `popStrength` setting fires in that collector's pop state, which follows the same rise and decay as the
cylinder pulses and enters the collector junction as incoming pressure. Because the draw is per firing, the
pop rate is proportional to RPM. No unburnt-fuel or temperature state is kept; draw counts depend on the
state, but the same seed and input history reproduce the same sound.

The pulse model is:

```text
p'  = -p/decayTime
r1' = (p-r1)/(riseTime/2)
r2' = (r1-r2)/(riseTime/2)
```

The pipe receives `r2`. Two equal stages of `riseTime/2` keep the one-stage mean delay `riseTime` and the
pulse area `strength*decayTime`, while the pressure onset starts with zero slope (C1): a slope discontinuity
at firing would be heard as a click.

Each pulse follows this model with its own decay angle. `riseTime` is `pulseRiseMs` divided by the pulse's
excitation (combustion excitation, or `pumpingExcitation` for displacement), in absolute time: the wavefront is set by the pressure
ratio when the valve opens and does not depend on RPM, while a crank-angle rise became a near-impulse at
high RPM. `decayTime` is the duration of the pulse's decay crank angle, `D/(6*rpm)` seconds at the
smoothed RPM, recomputed every sample: blowdown lasts a crank angle, so the tail is longer at low RPM. Firing resets `p` and keeps `r1` and `r2` continuous. Exact exponential evolution
across fractional firing times supplies the sample-average pulse to the pipe.

The [waveguide](../src/audio/exhaust-waveguide.ts) has bidirectional primary and outlet-segment delays rounded
to the nearest sample at the reference wave speed. Each traversal multiplies amplitude by
`exp(-attenuationPerMeter*length)`, with the attenuation of that pipe's bore. An outlet segment adds its packing
absorption, frequency-dependent like fibrous packing: a one-pole low-pass per traversal passes DC unchanged and
loses `absorption*length` nepers at the segment's reference frequency `absorptionHz` (Np/m 0–20, 50–8000 Hz),
more above it. Mufflers carry absorption so the chamber's overtones decay instead of ringing metallically, while
its low resonance, set by reflection at the area steps, remains; plain pipe segments and primaries carry none. Every junction scatters pressure
waves weighted by cross-section area `A`:

```text
p = 2*sum(A_i*incoming_i)/sum(A_i)
outgoing_i = p-incoming_i
```

The collector joins its primaries and the first outlet segment; each joint between consecutive outlet
segments is a two-port junction. Equal areas reduce to `p = 2*sum(incoming)/portCount`. An area step
reflects part of each wave, so a wide segment between narrow ones resonates at low frequency and blunts
wavefronts, as a muffler does. Overrun pops enter the collector as incoming pressure weighted like a primary.

After a cylinder's exhaust opens, its cylinder-end reflection varies from +0.94 to -0.3 through the aperture
`16*u²*(1-u)²` over 0.23 firing cycles (`ACOUSTICS.cylinderWindowCycles`), then returns to its closed value.
This window is an empirical acoustic boundary, not the valve's open duration: the cylinder does not act as an
open end for the whole valve event, and a window spanning it removed the pipe resonance. The aperture has continuous value and slope and a window
mean of 8/15. Cylinder-end and outlet low-pass filters act inside their return paths. The outlet filter uses the return
cutoff of the last segment's bore. The cylinder-end filter uses the primary bore's cutoff: an approximation,
since the port is not an open pipe end. The listening pickup
sums outgoing and low-passed outgoing waves, with collector mixing divided by `sqrt(collectorCount)`.

Each acoustic step runs at the output sample rate. Integer pipe delays, the pulse approximation and
native-rate nonlinear stages define the model's temporal and spectral resolution.

## Output conditioning

```text
Collector mix -> 18 Hz DC removal -> soft clipping -> final low-pass filter
              -> voice/master gain -> compressor
```

Soft clipping uses `y = 0.65*x/(1+abs(x))`, with small-signal gain 0.65 and asymptotic bounds ±0.65.
The final filter uses `tone += a*(y-tone)`, where `a = 1-exp(-2*pi*outputCutoffHz/sampleRate)`.
It is independent of the boundary return filter. The master compressor supplies envelope-based
compression. Output depends on the engine sound, RPM, excitation and fixed mix gains.

## Reference coefficients

The pipe coefficients are separate from the listening settings; DEV controls never change them. The wave
speed (480 m/s) and the outlet reflection `OUTLET_REFLECTION` are fixed. `pipeCoefficients(bore)` in
[Exhaust acoustics](../src/audio/exhaust-acoustics.ts) derives each pipe's return cutoff and attenuation from
its internal diameter, an unflanged opening, 573.15 K air at 101325 Pa, `gamma=1.4`, `R=287 J/(kg K)`,
`Pr=0.71` and a 500 Hz loss reference, rounded to 100 Hz and 0.01 Np/m.

The derivation uses `c=sqrt(gamma*R*T)`, the open-end negative reflection limit,
`fc=c/(2*pi*radius)` and
`alpha=sqrt(pi*f*nu)/(radius*c)*(1+(gamma-1)/sqrt(Pr))`. Sutherland viscosity uses
`mu0=1.716e-5 Pa s`, `T0=273 K` and `S=111 K`; density is `p/(R*T)` and `nu=mu/density`.
For a 50 mm bore the loss is about 0.034 Np/m before rounding and the cutoff 3100 Hz.

## Mix and lifetime

The [sound graph](../src/audio/sound-graph.ts) owns the named buses (`engine`, `tire`) and the master path:
each bus feeds the MASTER gain, then a compressor set by `MASTER_COMPRESSOR_SETTINGS`, then the output.
The [audio scene](../src/audio/audio-scene.ts) loads the generators, owns the voices (player engine, selected
rival engine with its panner, player tires) on those buses, and owns rival selection, reassignment and
spatialization; `RIVAL_AUDIO_POLICY` owns their audible distance, gain, pan and reassignment time. The nearest
observed rival within the audible distance occupies the rival slot; candidates are the rivals the race observes on
the resident Route. Its gain uses 3D physical world distance and its pan uses lateral displacement in the player's
yaw frame. A change of rival ID silences the slot and waits the reassignment time before the new rival sounds. ENG, TIRE and MASTER independently multiply their
outputs. A new sound kind adds one bus and connects its voices to it. Component output switches leave synthesis
state running.

[`AUDIO_CONTROL_POLICY`](../src/audio/audio-control-policy.ts) is the only record of control time
constants, and each control has one smoothing authority. Voices write engine RPM, engine opening and tire
inputs directly to AudioParams; the kernels follow them per sample with `observationSeconds`. Output
gains, bus and master gains and the rival pan follow only through AudioParam automation (`gainSeconds`,
`mixSeconds`, `panSeconds`); silence and pre-replacement fades use `fadeSeconds`, and a discontinuity waits
`transitionSeconds` after its fade. Engine sound and exhaust settings
replacement fades to silence before installing a new kernel. New settings supersede pending values;
returning to active values cancels pending replacement. Tire replacement is specified in
[Tire audio](tire-audio.md#settings-replacement).

Construction leaves the AudioContext unopened. An eligible user gesture starts or resumes audio.
Hidden or stopped shells suspend it; mute fades before suspension. Disposal closes the context,
including a graph completing initialization after disposal. Module URLs resolve within the selected
commit-versioned build.

An audio failure closes the affected graph and exposes retry while driving continues. A late result
from an older initialization cannot replace or close a newer graph. Invalid processor replacements
produce silence. Browsers without AudioWorklet support remain playable with unavailable sound.
The browser's normal audio session and device output controls determine audible output.
