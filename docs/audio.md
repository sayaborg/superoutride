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
(`effectiveOpening`, the engine's only command and the excitation) and the last shift
(sequence, direction and engine RPM before and after, as
[vehicle physics](vehicle-physics.md#wheel-and-powertrain) publishes it). A sequence the voice has not yet heard
marks a new shift. A new `DOWN` shift with `toRpm > fromRpm` (a locked downshift) plays a blip: the
[`DOWNSHIFT_BLIP`](../src/audio/exhaust-acoustics.ts) opening peak, decaying exponentially, combined with the
effective opening by `max`. The first sequence a voice reads, and the first after `silence()` (a rival
reassignment), is only recorded. The browser supplies them once per presented frame from the race's borrowed competitor observations,
which are copied at the end of each fixed step; audio reads nothing else.
Physics owns RPM, actuators, contact loads, wheel motion and dissipated work; audio owns oscillator,
filter and envelope state. Player tire sound reads the player's observed tire observations;
rival sound uses the rival's observed powertrain values.

An [engine sound](../src/audio/engine-sound.ts) contains one or two revolutions per
cycle, ordered firing phases, the exhaust duration (`exhaustDurationDegrees`, crank degrees the exhaust
valve or port is open), collector membership, primary lengths and a common outlet length per
collector. Each firing phase is that cylinder's exhaust-opening instant (start of blowdown); the offset from
combustion top dead centre is common to all cylinders and is not represented. Phase count determines cylinder count. `compileEngineSound` validates an
`EngineSoundDefinition` into a `CompiledEngineSound`; the vehicle catalog binds the
[engine sounds](../src/vehicle/engine-sounds.ts) to the
same sample-free engine kernel. Firing rows identify events and collector groups.

## Engine synthesis

The voice reads engine RPM exactly as simulated; physics keeps it at or above idle, and the exhaust
processor's own `rpm` parameter range (1 to 24000) is the only bound; a positive RPM keeps every
crank-angle-to-time conversion finite. Excitation follows the
powertrain's effective opening, so it includes the idle-holding opening. During fuel cut the effective
opening is 0, but excitation keeps its `closedExcitation` floor, so the engine is not silent; the fuel-cut
latch makes engine RPM oscillate between redline and the fuel-cut threshold, and the sound follows that RPM.
Closed throttle has a positive excitation floor;
stronger excitation shortens pulse rise time, while decay time is independent of load.

At each firing, `strength = max(0, excitation + pulseVariation*r)` for seeded xorshift32 `r` in `[-1,1)`.
Variation is an absolute fraction of full excitation. The same seed and input history reproduce the
same event sequence; random draws occur at firing events.

The pulse model is:

```text
p' = -p/decayTime
r' = (p-r)/riseTime
```

Rise and decay are crank angles (`pulseRiseDegrees`, `pulseDecayDegrees`); an angle `D` lasts
`D/(6*rpm)` seconds at the smoothed RPM, so pulses are longer at low RPM and shorter at high RPM.
`riseTime` is the rise angle's duration divided by excitation; `decayTime` is the decay angle's duration.
Both are recomputed every sample. Firing resets `p` and keeps `r` continuous. Exact exponential evolution
across fractional firing times supplies the sample-average pulse to the pipe.

The [waveguide](../src/audio/exhaust-waveguide.ts) has bidirectional primary and outlet delays rounded
to the nearest sample at the reference wave speed. Each traversal multiplies amplitude by
`exp(-attenuationPerMeter*length)`. Equal-admittance collector scattering uses
`p = 2*sum(incoming)/portCount` and `outgoing = p-incoming`.

After a cylinder's exhaust opens, its cylinder-end reflection varies from +0.94 to -0.3 through the aperture
`16*u²*(1-u)²` over `exhaustDurationDegrees` of crank angle, then returns to its closed value. The aperture has continuous value and slope and a window
mean of 8/15. Cylinder-end and outlet low-pass filters act inside their return paths. The listening pickup
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

The default pipe coefficients are **480 m/s wave speed, -1 outlet reflection, 3100 Hz return cutoff
and 0.03 Np/m attenuation**. [Exhaust acoustics](../src/audio/exhaust-acoustics.ts) derives them for
an unflanged 50 mm internal-diameter pipe, 573.15 K air at 101325 Pa, `gamma=1.4`, `R=287 J/(kg K)`,
`Pr=0.71` and a 500 Hz loss reference.

The derivation uses `c=sqrt(gamma*R*T)`, the open-end negative reflection limit,
`fc=c/(2*pi*radius)` and
`alpha=sqrt(pi*f*nu)/(radius*c)*(1+(gamma-1)/sqrt(Pr))`. Sutherland viscosity uses
`mu0=1.716e-5 Pa s`, `T0=273 K` and `S=111 K`; density is `p/(R*T)` and `nu=mu/density`.
The resulting loss is about 0.034 Np/m before rounding. These are fixed reference coefficients.

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
