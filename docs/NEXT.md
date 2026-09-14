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

Engine control domains now have one acoustic-settings owner, including deliberately narrower UI limits.
The lifecycle retires failed audio without stopping presentation and supports later gesture retry;
current-time AudioParam following has a non-native hold fallback. These are waveform-preserving changes.
Use `node tools/exhaust-levels.mjs [build-directory]` to compare fixed-gain kernel RMS/peak across profiles
and RPM/load before final mix calibration. Vehicle level differences remain; do not silently normalize
the approved engine or mistake kernel RMS for perceived loudness.

Use `/tools/audio-browser.html` for engine audition. The spectral and paired timing tools documented
in [audio](audio.md#verification-and-limits) remain useful regressions, not runtime dependencies. A sound-preserving
cleanup can use `tools/exhaust-equivalence.mjs` against a pre-edit build. It is not an equivalence claim
between deliberately different synthesis models. Current tests cover waveform quality, native worklet
output, tuning, lifetime and unchanged physics/rendering; inspect the latest run rather than freezing
historical test counts here.

## Next work: assess the contact-model tire trial

The user explicitly restarted tire design and selected a minimal passive-contact plus nonlinear-friction
prototype. The [audio specification](audio.md#contact-model-listening-trial-not-gameplay) owns its model,
input interpretation, coefficients and limits. Existing gameplay tires and the accepted engine are
unchanged: the new source is an isolated diagnostic, not an alternate production method.

Build and serve [the contact trial page](../tools/tire-contact-browser.html). Test front/rear separately
and together; solo rolling and friction taps at unchanged listening gain. All controls use representative
contact units; do not feed axle newtons or game slip directly into this experiment. Generate offline
comparisons with `node tools/tire-contact-render.mjs OUTPUT_DIRECTORY [RATE]`; current source contains
all required scenarios and tests, with no dependency on a previous conversation attachment.

The user found the trial rolling rumble convincing and could distinguish the two texture sketches.
Preserve those road taps as the accepted contact-sound baseline; friction timbre is not yet approved.
The trial still uses one passive mode and one tangential mode per axle. Before adding coupled modes,
a lower tangential mechanical impedance was sufficient to produce pitch variation and harmonics in
that same equation. Only friction settings and its fixed velocity pickup changed. No extra oscillator,
phase reset, pitch map or axle-specific detuning was introduced. See audio.md for coefficient ownership.

Assess the new front-only and mixed slip-sweep WAVs at fixed listening gain. The earlier 6-7 second
near-null is a specific regression, not proof that all front/rear interference is resolved. Use
`node tools/tire-contact-characterize.mjs [BUILD_DIRECTORY]` for pitch/harmonics and all window metrics;
keep diagnostic reports outside source. Revisit roughness/contact coupling or a small mode expansion
only if listening or broader-domain tests identify a remaining need.

The model remains local-contact diagnostics, not the gameplay replacement. Physical observation mapping,
whole-domain spectral checks, engine/tire mix and actual Android/iOS performance/listening must precede
adoption. No automatic engine normalization. If useful timbre demands many local modes/contact states,
consider a reduced model or precomputation instead.

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
