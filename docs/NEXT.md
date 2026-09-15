# Next task checkpoint

## Restart

1. Inspect the working tree and fetch exact main from the [repository](https://github.com/sayaborg/superoutride).
   Check active PRs, CI and Pages. Preserve unrelated local changes; start a `codex/` branch from the
   inspected main. Follow [AGENTS](../AGENTS.md) for release gates, including documentation-only work.
2. Read the [specification index](README.md), [architecture](architecture.md), this checkpoint and
   [audio](audio.md). Audio owns current runtime behavior; this file owns the next decision.
   The [tire evidence note](tire-squeal-research.md) supplies research and its limits, not a chosen algorithm.
3. Use Node.js 24 and the [development workflow](development.md). Run `npm ci` and `npm test`.
   CI builds the immutable physics/render reference pinned in the existing workflow. A local run
   without that reference checks determinism, not historical equivalence. Do not change the oracle.
4. Serve the built checkout over HTTP, for example `python3 -m http.server 8000`.
   Use `http://localhost:8000/?mode=circuit` for in-game CURRENT/CONTACT comparison. Audition and
   regeneration commands are in [development](development.md#tire-comparison-tools).
   Prior chat attachments, generated WAVs and former machine paths are not required.
5. Verify any release through exact Git/PR refs, CI and the Pages artifact/version. Local listening,
   source tests, deployment evidence and actual device playback are separate claims.

## Next decision: a third tire-sound method

The user selected **SPECTRAL** for the third-method experiment and asked to begin. Its first stage
is an isolated, one-contact asphalt audition: scrub plus finite-width harmonic squeal. The
[implemented trial contract](audio.md#spectral-isolated-asphalt-trial) owns the kernel and its limits;
[development](development.md#tire-comparison-tools) owns listening and regeneration commands.

Keep CURRENT and CONTACT, their A/B switch, reload default and tests unchanged. SPECTRAL is not in
the game selector, does not expand physics telemetry, and is not adopted as the final tire model.
There is no rolling layer, loose-surface catalog or two-axle trial graph yet. Do not implement those
stages merely because the full conceptual design mentioned them.

### User feedback to carry forward

- The rolling rumble sounded convincing, and smooth/rough differences were clearly audible.
  Preserve that as a listening reference, not a requirement to retain its algorithm in the third method.
- The revised friction tone was usable; CURRENT and CONTACT produced surprisingly similar impressions.
  This is subjective feedback, not proof of waveform, mechanism or physical equivalence.
- The user wants a higher, richer squeal rather than a single-tone impression, and recognizable loose
  surfaces. The published CONTACT already includes the requested treble and separate surface sketches;
  that implementation is not a general realism or final mix approval.
- Fidelity to the essential audible behavior, simplicity and phone suitability matter together.
  Expensive microscopic-looking equations do not by themselves establish a good approximation.

### Next action: listen before extending

Use the separate SPECTRAL audition and its S-only, Q-only and S+Q taps. Listen for whether finite-width
harmonic bands sound like friction rather than a whistle, wind or resonant noise, and whether scrub
plus squeal improves grip/slide/recovery. Numerical stability, spectral statistics and CI do not answer
that perceptual question. The first render uses a common synthetic macro-observation trace through
SPECTRAL, CURRENT and CONTACT adapters, not captured gameplay telemetry or calibrated acoustics.
CONTACT comparison output is explicitly friction-only because this SPECTRAL stage has no rolling layer.

If this core timbre is useful, assess rolling, loose ground and independent front/rear combination next;
only then consider a third gameplay choice and the read-only telemetry extension. If narrow bands sound
like a whistle and wider bands merely like noise without a useful intermediate region, reject the core
hypothesis and move to method four/five rather than accumulating corrective oscillators or gain tricks.
Prepared/precomputed, procedural and hybrid approaches remain eligible for future tire work; the
accepted engine's sample-free contract remains separate and unchanged.

Keep physics observations distinct from authored acoustic mappings. Do not invent local tread pressure,
temperature or stiffness. Demand rho is not grip remaining, and friction work is not acoustic watts.
Compare fixed-gain outputs without automatic normalization. Keep listening, measured spectrum,
transients, deterministic block handling, host throughput and phone gameplay budget as separate evidence.

### Decision gate

The current authorization covers the minimal experiment, not final adoption or the complete design.
Preserve valid observation, lifetime, physics and rendering coverage. Later intentional model changes
may supersede model-specific waveform expectations explicitly, but must not weaken the immutable
mechanics/render oracle or require a new synthesis model to reproduce an old model's PCM.

## Accepted engine baseline

Preserve the adopted native-rate waveguide, integrated fractional pulses, authored profiles, shared
tuning and permission/failure lifecycle. The [audio specification](audio.md) owns their details; this
checkpoint does not restate their coefficients. Engine sound is approved as a listening baseline,
not a universal device or absolute-loudness calibration. Vehicle-level differences and final tire/engine
balance remain open; do not silently normalize the engine while changing tires.

## Other implementation areas

Rendering, camera, sprites, tunnel content and race/session rules retain their existing owners in the
[specification index](README.md). Do not reopen them as part of tire method selection.

## Remaining limits

General nonadjacent road-band intersection classification is not implemented. Vertex, fillet and
supported-envelope checks do not certify complete band geometry; preserve the
[validity requirement](architecture.md#raster-and-guide) and intentional circuit copies above Core.

Handling is `DEV_UNCALIBRATED`. Per-vehicle/front/rear physical tire calibration, combined-control and
changing-terrain acceptance, and real smartphone performance/input checks remain open. Suspension
travel recovery is not proof of physical stability on arbitrary terrain. These limits are separate
from tire sound. Keep this single checkpoint and current specifications; previous experiments and
release records remain in Git/PR/CI rather than a new history directory.
