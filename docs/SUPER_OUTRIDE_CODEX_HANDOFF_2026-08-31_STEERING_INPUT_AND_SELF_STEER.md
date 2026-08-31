# SUPER OUTRIDE — Steering Input Residual and Self-Steer Handoff

This is active takeover context for the post-M9.1 steering investigation. It is not normative
physics authority and it does not authorize weakening M9.0, M9.1 or frozen renderer invariants.

## Current resolution status

The stale steering-source defect described below was subsequently fixed in the input layer and
released on `main` at `69cb666fab2be3cc3039c8e52b8f6239a8fe9bd9`. One shared steering arbiter now owns keyboard
and touch correction semantics; the causal cases in section 3 are executable regressions. Sections
1 through 3 remain the historical diagnosis and must not be interpreted as an instruction to redo
or relocate that fix.

The separate self-steer investigation became M9.2 authority in
`92_m9_2_selectable_self_steer_gain.md`. The current calibration candidate preserves the accepted
additive formula and independently selects travel-direction gain, yaw-preview time and symmetric
driver-steering actuator response. It does not change the input arbiter, tires, final road-wheel
response or camera.

## 0. Minimal instruction for the next thread

```text
Read AGENTS.md,
docs/87_m9_0_two_station_arcade_vehicle_dynamics.md,
docs/91_m9_1_dual_yaw_camera_modes.md, and
docs/SUPER_OUTRIDE_CODEX_HANDOFF_2026-08-31_STEERING_INPUT_AND_SELF_STEER.md
completely. First fix the confirmed stale steering-source defect in the input layer with one shared
steering authority and causal browser/input regressions. Do not mask it in camera or physics. Then
investigate excessive neutral-input countersteer as a separate vehicle-control calibration change.
Do not combine the two causes in one ad hoc patch.
```

## 1. Exact checkpoint

Repository:

```text
/Users/harak/Documents/ChatGPT/super outride
```

Released `main`, PR #100 head/merge and deployed Pages version:

```text
c7a862547530622f50a7a82e62cbf8e608141210
```

Released exact-head validation:

```text
544 tests
544 pass
0 fail
0 skipped
```

Pages main-push workflow `33331678166` built and deployed that exact SHA successfully.

The preparation branch is:

```text
codex/m9-2-steering-input-stale-source
```

At handoff authoring it is based exactly on the released `origin/main`. No steering fix has been
implemented or published yet.

## 2. User-observed input defect — confirmed causal state

The exact symptom is:

```text
RIGHT remains active internally
press LEFT  -> neutral
release LEFT -> RIGHT returns
RIGHT remains until an input/lifecycle reset
```

This is an input-state defect, not steering actuator lag, self-steer, tire force or BODY-camera
perception.

Current keyboard steering stores `ArrowLeft` and `ArrowRight` independently in
`KeyboardInput.pressedCodes`. Current touch steering stores pointer ids independently in
`TouchInput.leftPointers` and `TouchInput.rightPointers`. Both resolve through:

```text
left == right -> 0
left only     -> -1
right only    -> +1
```

Therefore one stale RIGHT source produces the reported truth table exactly:

```text
right down/stale                 -> +1
left down while stale right      ->  0
left up while stale right remains -> +1
```

A direct keyboard trace on the released build reproduced:

```json
[
  {"event":"right down","steering":1},
  {"event":"left down while right held","steering":0},
  {"event":"left up","steering":1},
  {"event":"right up","steering":0}
]
```

The existing regression already contains the phrase `exact stale-right opposite-button symptom`,
but it proves only that a later `visibilitychange` reset clears the state. It does not prevent an
older stale direction from resurfacing during ordinary play.

The BODY camera does not write input state. Its causal relevance is behavioral: once the vehicle is
at a large angle to the road, the player rapidly overlaps or reverses steering sources. That exposes
the independent-left/right state machine and any missing keyup/pointer terminal. The current model
has no way to reconcile a lost terminal event while the page remains focused and visible.

## 3. Required input-layer design correction

The owner is the device/input-adapter layer. Do not add any of these masks:

- camera-mode input reset;
- yaw-angle input reset;
- physics-side steering clamp based on camera or road alignment;
- periodic arbitrary timeout that releases a genuinely held direction;
- recovery-only clearing as the primary fix.

The clean target is one shared steering-source authority, analogous in placement to the shared pedal
authority but with steering-specific semantics:

```text
latest non-repeat steering press becomes the sole active steering source
opposite press supersedes the older active source
release of the active source returns to neutral
release of a superseded source is ignored
superseded sources never resume
keyboard auto-repeat cannot resurrect a superseded source
blur/pagehide/hidden reset remains a final lifecycle guard
keyboard and touch publish through the same authority
```

This deliberately differs from throttle/brake resume semantics. A steering direction that was
superseded during a correction must not reappear after the correction is released.

Prefer one small `SteeringInputArbiter` (or an equivalently simple single-active-source primitive)
shared by `KeyboardInput` and `TouchInput`. Remove duplicate left/right truth from device merging
rather than adding another state beside it. Do not inspect vehicle yaw, camera mode or route kind.

Required causal regressions:

1. Keyboard: RIGHT down, LEFT down, LEFT up leaves neutral even when RIGHT keyup was lost.
2. Keyboard: a repeat event from the superseded RIGHT source cannot resurrect RIGHT.
3. Touch: stale RIGHT pointer, LEFT down, LEFT up leaves neutral without waiting for page lifecycle.
4. Mixed device: stale touch RIGHT, keyboard LEFT correction, keyboard release leaves neutral.
5. Active-source release, blur, pagehide and hidden visibility all remain exact neutral.
6. Ordinary isolated LEFT and RIGHT presses remain digital `-1/0/+1` requests.
7. No camera, vehicle, route or physics state is imported by the steering arbiter.

## 4. Excessive neutral-input countersteer — separate issue

The user also reports that an ordinary steering press followed by release produces visibly excessive
automatic countersteer. The user understands that the self-steer stabilizes the body; the complaint
is magnitude/feel, not the existence of stabilization.

M9.0 currently owns:

```text
target = betaTravel - yawRate * steeringYawPreviewTime + driverOffset
```

with:

```text
steeringYawPreviewTime = 0.12 s
full steering-actuator release <= 0.25 s
betaTravel gain = 1 (implicit)
```

A deterministic flat-asphalt FR probe at 25 m/s, with `0.35 s` RIGHT request and then neutral,
without throttle, measured:

```text
peak neutral-input opposite road-wheel angle: -3.87 degrees
peak yaw rate after release:                 +22.97 degrees/second
reverse yaw-rate peak:                        -6.93 degrees/second
approximate settle time:                       1.15 seconds
```

The effect exists without tire saturation. In the earlier probe, coast front/rear utilization
remained about `0.48 / 0.45`. Throttle can amplify it through rear combined slip, but tire tuning is
not the first authority to change.

Do not combine this calibration with the stale-source hotfix. First make canonical steering request
trustworthy. Then add a dedicated deterministic calibration envelope covering at least:

- press duration and release at several speeds;
- peak opposite road-wheel angle after neutral request;
- peak same-direction and reverse yaw rate;
- body-sideslip decay and settle time;
- coast versus driven-rear combined-slip cases;
- FR/MR/RR/AWD and BIKE profile compatibility.

Only after that evidence should the next milestone choose among existing release rate and yaw-preview
authority or an explicit profile-owned travel-direction feedback gain. Do not tune tires merely to
hide an over-authoritative Driver law.

## 5. Recommended staged order

```text
A. input stale-source hotfix
   -> single shared steering authority
   -> focused causal regressions
   -> complete npm test
   -> browser reproduction at high body/road angle

B. steering-control calibration milestone
   -> quantitative envelope first
   -> explicit normative/profile decision
   -> smallest coherent controller change
   -> complete cross-profile regression

C. release only exact validated SHA
   -> PR exact-head green
   -> non-force fast-forward main
   -> main-push Pages build/deploy
   -> public endpoint and UI verification
```

The new thread must not treat the earlier assistant conclusion that this was only BODY-camera
perception as evidence. That conclusion was withdrawn after the user supplied the exact persistent
input truth table and the input implementation reproduced it.
