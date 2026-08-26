# M7.3 Grip Calibration Pass 1 and Instrument HUD

Status: release authority candidate. Exact release status is established by Git/PR/main-ref and main-push Pages workflow identity. Handling remains `DEV_UNCALIBRATED`; human driving evaluation remains final product-feel authority.

M7.3 is the first explicit numerical handling pass after the M7.0 architecture freeze. It responds to human trial evidence that the current paved-road response feels too low-grip and is not practically controllable. It also makes speed, engine RPM, automatic transmission and selected gear unambiguous in both browser compositions.

## 1. Architecture decision gate

1. Physical surface friction belongs to SurfaceMap material authority. Car steering response and useful-slip use belong to the car profile. RPM and selected gear remain automatic-powertrain state; their display belongs to the HUD.
2. Existing material, vehicle-profile, post-assist control and HUD primitives express the request. No new solver, state copy or input abstraction is introduced.
3. World velocity remains the only stored linear-velocity authority. The HUD reads derived speed plus authoritative powertrain state and does not feed values back into physics.
4. No route-, stage-, composition-, car- or bike-specific branch is added to common dynamics or the renderer.
5. Shared paved grip changes once in `SURFACE_MATERIALS`; car-specific useful-steer behavior changes once in `M5_CAR_PROFILE`.
6. Contact separation, world integration, Guide observation, renderer depth, metric scale and topology invariants are unchanged.
7. `tests/m7-3-grip-and-instrument-hud.test.mjs` checks material hierarchy, the useful-slip boundary, a causal 100 ms digital-steering response and both composition roots' always-visible instrument line.

## 2. Instrument display

The top HUD line in both BRANCHING and CIRCUIT now uses explicit labels:

```text
SPD 162km/h RPM  4321 AT GEAR 4
```

During an active shift the line appends `UP` or `DN`. This line reports:

- derived world planar speed converted to km/h;
- authoritative engine RPM;
- automatic transmission mode;
- currently selected forward gear.

Actual steering, post-TCS drive, post-ABS brake and intervention labels remain separately visible.

## 3. Paved grip pass 1

Human trial reported that the previous response was not practically controllable. The first candidate changes are:

```text
ASPHALT friction          1.05 -> 1.30
SHOULDER friction         0.82 -> 0.95
car front slip utilization 1.60 -> 1.00
car steering response tau 0.10 -> 0.16 s
```

Grass, dirt and sand friction remain unchanged so paved and off-road behavior do not collapse into one material feel.

The previous car steering target could reach 1.6 times the linear front friction-slip estimate before clamping. That exceeded the stated useful-steer rule: additional rack travel in that region could deepen understeer without increasing available lateral force. The new value stops at the linear friction estimate. The slightly slower actuator response makes digital taps continuous and more legible without adding automatic countersteer.

The shared asphalt increase applies to both vehicle models and also increases the physical drive/brake envelope observed by TCS and ABS. No hidden vehicle- or course-specific multiplier is introduced.

## 4. Regression envelope

The deterministic first-pass probe starts the car on flat M7.2 asphalt at 45 m/s, applies one 100 ms full digital steering tap, then returns neutral. During the first second it must remain supported on asphalt and stay below 2.5 degrees maximum absolute sideslip.

This is a causal regression for the reported unusable response, not a claim that 2.5 degrees is the final product-feel target. Later human trials may deliberately supersede the numerical envelope and must update this milestone's later authority rather than silently weakening the test.

## 5. Still deferred

- final paved/off-road friction values;
- final car rack map, corner stiffness and yaw balance;
- final motorcycle bank response;
- automatic countersteer policy;
- final TCS/ABS thresholds and intervention feel;
- final engine, gear ratio and shift-schedule tuning.
