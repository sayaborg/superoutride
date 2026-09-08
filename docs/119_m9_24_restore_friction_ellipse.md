# M9.24 — Restore the Fixed Friction Ellipse

Status: current scoped withdrawal/restoration authority. Handling remains DEV_UNCALIBRATED.

## Decision

The user prefers LP2's natural control feel over LP8 and explicitly withdraws the entire
M9.23 change. This supersedes document118 in full. Restore document114's fixed L2 tire law,
five authoring/compiled values and five browser selectors, as implemented immediately before
M9.23 at d5fc817f3be6301a0328d8621e8c1197bfe035c3. No hidden exponent remains.
The withdrawal is a product decision, not proof that every nonelliptical friction law is impossible.

The exact original force norm is Math.hypot(x,y); the original square-root linear lateral
reserve is restored. GX/PX/GY/PY/KN and all their defaults, ranges, steps and keys are unchanged.
LP, its B binding, authoring/resolved field, generalized norm and dedicated probes/tests are removed.
P remains the camera key. Tire geometry is fixed, not a selectable p=2 compatibility mode.
The pre-LP exact mechanical hash serializer is restored without a schema exception.

M9.21 TCS/ABS/support, M9.22 pedal HUD, common contact/wrench/integration, profile data, steering,
ENG, recovery, route, camera and renderer stay at the preceding behavior. Only visible milestone
metadata advances to M9.24 to identify this restoration release.

## Architecture Decision Gate

1. Existing tire law/compiler own the constitutive geometry and characteristics; browser registry
   owns selector exposure. Restore those same owners.
2. Reuse the exact preceding implementation, rather than retaining LP and fixing its value.
3. Delete the added coefficient and generic norm; no duplicate state or compatibility authority.
4. No vehicle, station, route, device or product branch is introduced in lower mechanics.
5. Direct restoration is simpler than a special disabled-experiment configuration.
6. Preserve the original bounded, dissipative, load-homogeneous ellipse and monotone signed wheel
   root, shared protection/wrench, world-state truth and every frozen rendering/topology invariant.
7. The restoration regression compares original source blob hashes, proves absent LP state/key,
   and runs the restored five-axis/lifecycle/force/root/protection regressions. Complete CI retains
   the immutable same-engine b70f245 comparison over nine profiles, three rates and1152 wheel cases.

## Historical evidence and validation

Document118, its saved research/data and its released validation record remain unchanged historical
records under the repository archive contract. Their original executable probes/tests can be read
at the released M9.23 Git revision02947284f6c6fd291843495da783505068081493; current source must not
recreate those retired paths merely to satisfy historical references. The experiment is withdrawn.

This normative restoration requires a new immutable validation record after implementation-head
complete green CI, followed by record-inclusive exact-head CI and the standard force=false pure
fast-forward/main/PR/Pages identity verification. No previous release evidence is rewritten.

Local verification: complete855/855 tests passed with the pinned immutable reference. Actual
browser at320x568 and844x390 showed exactly GX/PX/GY/PY/KN plus ENG without overflow;
B left calibration unchanged, P selected MOVE, and the canvas remained320x240.
