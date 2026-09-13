# Next task checkpoint

## Restart

1. Use the [superoutride repository](https://github.com/sayaborg/superoutride), locally or in the cloud.
   Inspect the working tree, fetch main, and inspect current PR/CI and Pages state. The accepted
   engine and minus/plus sound controls are integrated; no earlier task or feature branch is needed.
2. Start new work on a `codex/` branch from the latest fetched main. Preserve local commits and
   changes when selecting a checkout. Do not implement directly on main or depend on temporary files
   from the previous machine. In the desktop ChatGPT project mirror, `sources/` is read-only reference
   material and the actual Git checkout is the `superoutride` subdirectory.
3. Read [AGENTS](../AGENTS.md), the [specification index](README.md), [architecture](architecture.md)
   and [audio](audio.md). The audio specification owns exact signal paths, controls and approximation
   limits. This file owns accepted decisions and next work; no prior chat or temporary output is required.
4. Use Node.js 24 and the [development workflow](development.md). Run `npm install` and `npm test`.
   `.audit-baseline`, when present, is the immutable physics/render oracle used by CI, not a
   disposable experiment. A fresh cloud checkout can build the reference pinned in the workflow.
   When its build is available, run
   `HOT_PATH_BASELINE_BUILD=.audit-baseline/dist npm test` for historical equivalence as well.
5. Reuse the local HTTP server if running; otherwise serve this repository with
   `python3 -m http.server 8000 --bind 127.0.0.1`. Use `http://127.0.0.1:8000/?mode=circuit`.
   Rebuild after source changes and reload. For device testing, use the
   [published circuit](https://sayaborg.github.io/superoutride/?mode=circuit) after confirming Pages
   deployment. Local source/build/listening, PR CI and public deployment are separate evidence;
   verify Git refs, workflow results and the deployed version rather than assuming a release succeeded.

## Accepted engine baseline

The user confirmed that the engine sound improved clearly after the fractional, integrated-pulse
revision. Preserve this as the listening baseline when starting tire work.

- One native-rate waveguide, formerly LITE. No samples, generated-waveform playback or method selector.
  Full pipe topology remains; LOOP and the 2x comparison are retired.
- Fractional firing timing, exact exponential pulse evolution and sample-average excitation reduce
  source aliasing. A smooth quartic source aperture avoids slope corners and per-cylinder trigonometry.
- Base pulse strength is 1 for all nine vehicles. Rise/decay are shared minus/plus controls, not vehicle
  multipliers. All eight tuning defaults/ranges remain provisional and are listed in [audio](audio.md#shared-tuning).
- Event strength variation defaults to ±20% of full excitation, adjustable 0–40%. Closed throttle
  retains that absolute offset, clamped at zero strength. It does not perturb firing time or RPM.
- Reflection-wave LPFs are inside the return paths. After bank mixing: DC removal → soft clipping →
  final LPF. Additional clip antialiasing is not active. Do not attribute every harsh sound to clipping.
- Engine settings are session-local; each minus/plus step applies through the common fade. Vehicle switches
  preserve tuning; reset restores defaults and page/course reload resets the session.
- SOUND START begins/resumes audio, then SOUND ON/OFF controls mute. Touch release is an activation
  path, and disposal closes audio even if the browser is still waiting for playback permission.
- The user confirmed sound on iOS Chrome after disabling the iPhone's silent mode. Preserve the
  normal platform audio-session behavior; this report does not validate every iOS version or device.
- Target Android playability with simple, light processing. The user's M4 MacBook Air listening and
  kernel timing do not certify Android, Safari/iOS, speaker response or the complete gameplay budget.

Use `/tools/audio-browser.html` for engine audition. The spectral and paired timing tools documented
in [audio](audio.md#verification-and-limits) remain useful regressions, not runtime dependencies. A sound-preserving
cleanup can use `tools/exhaust-equivalence.mjs` against a pre-edit build. It is not an equivalence claim
between deliberately different synthesis models. Current tests cover waveform quality, native worklet
output, tuning, lifetime and unchanged physics/rendering; inspect the latest run rather than freezing
historical test counts here.

## Next work: tire sound is unfinished

**Tire timbre still needs substantial work.** Its present oscillator and parameters are not an accepted
final sound. The engine approval does not apply to tires, and stability tests are not listening acceptance.

The current implementation has one independent acoustic oscillator for each player axle in a single
worklet. It observes longitudinal/lateral friction work, slip speed, support, utilization and surface.
Ordinary rolling and broadband scrub are silent by user preference; no direct white-noise output should
be reintroduced as a default. Small random perturbations only seed/roughen the current squeal oscillator.
Rival tire sounds, wind, game-event sounds and music are unimplemented.

Start with these owners:

- [Physical evidence](tire-squeal-research.md): rubber/tire experiments, their limits and design inferences.
- [Mapping and oscillator](../src/audio/tire-synthesis.ts): onset, pitch, harmonics, roughness, level and release.
- [Axle transport](../src/audio/tire-processor.ts) and [voice](../src/audio/tire-voice.ts).
- [Read-only adapter](../src/browser/vehicle-audio.ts) and [physics telemetry](../src/physics/vehicle-tire-observation.ts).
- [Tire audition](../tools/tire-browser.html), shared scenarios and offline renderer, linked from [audio](audio.md#player-tire-synthesis).

Audition front/rear separately and together; compare cornering, wheel spin/lock, grip recovery and
loose surfaces at a fixed listening gain. Refine the acoustic model/parameters as needed, preserving
sample-free synthesis, the read-only physics boundary and a small fixed voice count. Check rate/block
independence, finite states, silence/release and the final engine/tire balance. Tire calibration and
actual Android performance/listening remain open; do not expand vehicle physics to justify audio knobs.

## Other implementation areas

Visual work belongs in [rendering](../src/render/renderer.ts), [sprite assets](../src/visual/sprite-assets.ts),
[camera](../src/camera/camera.ts) and [browser presentation](../src/browser/driving-shell.ts).
[Tunnel content](../src/dev/courses/tunnel.ts) owns concrete placements and materials. Presentation
consumes vehicle/course observations without adding another physical state or depth rule.
Game-event rules belong in [sessions](../src/gameplay/race-session.ts),
[objectives](../src/gameplay/run-objective.ts) and their composition.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and
supported-envelope checks do not certify a new course's complete band geometry. Preserve the
[validity requirement](architecture.md#raster-and-guide) and distinguish intentional coincident circuit
copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear tire physics calibration, coast/turn oscillation,
combined controls and changing-terrain acceptance, and actual smartphone performance/input checks remain
open. Exiting finite suspension travel invokes gameplay recovery; this does not establish physical
stability over arbitrary terrain. These physics limits are separate from tire sound calibration.

The executable checks cover their stated scenarios and boundaries, not every possible state. Correct
structural defects with a causal regression and explicit specification revision; never conceal them
through parameter tuning. Retired implementations and previous results remain in Git; keep this single
checkpoint and current specifications instead of restoring experiment archives.
