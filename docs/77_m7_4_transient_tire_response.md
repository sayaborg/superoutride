# M7.4 Transient Tire Response

Status: implementation candidate. Handling remains `DEV_UNCALIBRATED`; human driving evaluation remains final product-feel authority.

M7.4 responds to human trial evidence that the apparent low-grip problem is primarily a tire-force transient and controllability problem. It does not raise paved friction again. It replaces the car solver's instantaneous linear-force hard clamp with explicit axle-force memory, speed-dependent relaxation and smooth saturation.

## 1. Architecture decision gate

1. Front/rear tire-force resolution and its transient state belong to the car-specific solver. Common world body, support/contact observation and integration remain unchanged authorities.
2. The existing reduced front/rear axle model can express the behavior. A four-independent-tire solver and a new common contact abstraction are unnecessary.
3. `frontLateralForce` and `rearLateralForce` are force-memory state, not duplicate world velocity, pose or contact truth. World velocity remains the only linear-motion authority.
4. No route, stage, composition or renderer branch is added. The motorcycle solver remains independently model-specific.
5. Existing contact phases gate whether each car axle may produce force. An airborne axle no longer receives static normal load merely because the other axle remains in contact.
6. SurfaceMap friction, support/contact separation, Guide observation, world integration, topology and renderer invariants are preserved.
7. `tests/m7-4-transient-tire-response.test.mjs` checks force ownership, progressive onset/release, bounded jerk/sideslip, airborne-axle force removal and recovery reset.

## 2. Previous causal problem

The M7.3 car path calculated each axle in one tick as:

```text
slip angle -> linear cornering force -> hard friction-circle clamp
```

Steering rack travel was filtered, but tire force itself had no history. Force slope changed abruptly at the friction limit, while contact with either axle caused the solver to assign static load to both axles. Raising material friction could move the clamp but could not correct this time-domain behavior.

## 3. Candidate car model

The quasi-static target remains a reduced bicycle-model axle force. Its friction-circle-limited target is now smoothly saturated with `tanh`, then approached through a first-order relaxation length:

```text
F_target = F_available * tanh(F_linear / F_available)
tau      = clamp(relaxationLength / speed, tau_min, tau_max)
F_next   = F_current + (F_target - F_current) * (1 - exp(-dt / tau))
```

Current candidate profile:

```text
front effective relaxation length = 1.6 m
rear effective relaxation length  = 1.2 m
minimum response tau              = 0.025 s
maximum response tau              = 0.16 s
```

These are reduced-model effective axle values, not claims about a specific production tire carcass. They remain human-tunable car-profile authority.

If an axle contact phase is `AIRBORNE`, its normal load and lateral force are zero for that solve. Unsupported motion also clears both axle forces. Recovery and motorcycle-to-car model switching clear the car-only force memory rather than carrying a stale tire impulse into a new physical situation.

## 4. Deterministic probe

On flat M7.2 asphalt at 45 m/s, a 100 ms full digital steering tap followed by neutral currently measures:

```text
maximum lateral-acceleration jerk  < 35 m/s^3
maximum absolute sideslip         < 2.5 degrees
2-second final absolute yaw rate  < 0.2 degrees/s
2-second final lateral acceleration < 0.05 m/s^2
```

The candidate measured approximately 27.4 m/s^3 jerk and 2.22 degrees sideslip. An instantaneous version of the same smooth force curve measured approximately 41.8 m/s^3 jerk. These regressions prove the intended causal transient and settling behavior; they do not declare the final feel correct.

## 5. Deliberately unchanged

- M7.3 asphalt and shoulder friction values;
- digital input semantics and actual steering HUD;
- automatic countersteer policy;
- motorcycle bank/yaw solver;
- four-independent-tire modeling;
- final tire curve shape, relaxation values, load transfer and thermal behavior.
