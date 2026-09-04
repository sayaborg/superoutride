import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  BROWSER_VEHICLE_PROFILES,
  browserVehicleProfileForKey,
} from '../dist/browser/vehicle-profile-selection.js';
import * as profilesModule from '../dist/physics/vehicle-profiles.js';
import { deriveVehicleSpriteFamily } from '../dist/render/vehicle-presentation.js';
import {
  DEFAULT_VEHICLE_CATALOG_ENTRY,
  VEHICLE_CATALOG,
  formatVehicleCatalogLine,
} from '../dist/vehicle/vehicle-catalog.js';

const expected = [
  ['Ferrari', 'Testarossa', 'Tipo F110', ['5-bolt wheels'], '1988½–1991', 'KeyQ'],
  ['Porsche', '911 Turbo 3.3', 'Type 930', ['G50/50 5-speed'], '1989', 'KeyW'],
  ['Chevrolet', 'Corvette', 'C4', ['L98', 'ZF 6-speed', 'pre-facelift'], '1989–1990', 'KeyE'],
  ['Volkswagen', 'Golf GTI 16V', 'Mk2', ['small bumpers'], '1986–1989', 'KeyR'],
  ['Lancia', 'Delta HF Integrale', null, ['8V', '185 PS'], '1988–1989', 'KeyA'],
  ['Honda', 'VFR750R', 'RC30', [], '1987–1990', 'KeyS'],
  ['BMW', 'R 80 G/S Paris-Dakar', null, [], '1984–1987', 'KeyD'],
  ['Harley-Davidson', 'FXRT Sport Glide', 'FXRT', ['Evolution 1340'], '1984–1992', 'KeyF'],
  ['Vespa', 'PX 200 E Arcobaleno', 'VSX1T', ['200 cc full-power'], '1983–1997', 'KeyV'],
];

test('M9.8 catalog preserves model identifier specification and period as separate fields', () => {
  assert.equal(VEHICLE_CATALOG.length, 9);
  assert.deepEqual(VEHICLE_CATALOG.map((entry) => [
    entry.manufacturer,
    entry.model,
    entry.identifier?.officialLabel ?? null,
    [...entry.selectedSpecification],
    entry.period,
    entry.keyCode,
  ]), expected);
  assert.equal(DEFAULT_VEHICLE_CATALOG_ENTRY.profile.id, 'TESTAROSSA');
  assert.equal(new Set(VEHICLE_CATALOG.map(({ profile }) => profile.id)).size, 9);
  assert.equal(new Set(VEHICLE_CATALOG.map(({ keyCode }) => keyCode)).size, 9);
});

test('canonical one-line formatter uses short identifiers without duplicating model codes', () => {
  assert.deepEqual(VEHICLE_CATALOG.map(formatVehicleCatalogLine), [
    'Ferrari Testarossa (F110) — 5-bolt wheels (1988½–1991)',
    'Porsche 911 Turbo 3.3 (930) — G50/50 5-speed (1989)',
    'Chevrolet Corvette (C4) — L98, ZF 6-speed, pre-facelift (1989–1990)',
    'Volkswagen Golf GTI 16V (Mk2) — small bumpers (1986–1989)',
    'Lancia Delta HF Integrale — 8V, 185 PS (1988–1989)',
    'Honda VFR750R (RC30) (1987–1990)',
    'BMW R 80 G/S Paris-Dakar (1984–1987)',
    'Harley-Davidson FXRT Sport Glide — Evolution 1340 (1984–1992)',
    'Vespa PX 200 E Arcobaleno (VSX1T) — 200 cc full-power (1983–1997)',
  ]);
});

test('all nine share exactly one normalized tire law while vehicle mechanics remain profile-owned', () => {
  const tire = ({ profile }) => [
    profile.muRef, profile.rhoKnee, profile.lowSpeedRegularization,
    profile.frontNormalizedStiffness, profile.rearNormalizedStiffness,
  ];
  for (const entry of VEHICLE_CATALOG) assert.deepEqual(tire(entry), tire(VEHICLE_CATALOG[0]));
  assert.equal(new Set(VEHICLE_CATALOG.map(({ profile }) => profile.mass)).size, 9);
  assert.equal(new Set(VEHICLE_CATALOG.map(({ profile }) => profile.yawInertia)).size, 9);
  assert.equal(new Set(VEHICLE_CATALOG.map(({ profile }) => profile.powertrain)).size, 9);
  assert.equal(new Set(VEHICLE_CATALOG.map(({ profile }) => profile.frontWheelRadius)).size > 1, true);
  assert.equal(new Set(VEHICLE_CATALOG.map(({ profile }) => profile.frontDriveTorqueFraction)).size, 3);
});

test('catalog alone owns browser mapping and explicit presentation family', () => {
  assert.deepEqual(
    BROWSER_VEHICLE_PROFILES.map(({ code, profile }) => [code, profile.id]),
    VEHICLE_CATALOG.map(({ keyCode, profile }) => [keyCode, profile.id]),
  );
  for (const entry of VEHICLE_CATALOG) {
    assert.equal(browserVehicleProfileForKey(entry.keyCode), entry.profile);
    assert.equal(
      deriveVehicleSpriteFamily({ profile: entry.profile }),
      entry.profile.presentationFamily === 'BIKE' ? 'bike' : 'car',
    );
  }
});

test('legacy six-profile and launch-coupling authorities are fully retired', async () => {
  for (const retired of [
    'FR_VEHICLE_PROFILE', 'MR_VEHICLE_PROFILE', 'RR_VEHICLE_PROFILE',
    'AWD_VEHICLE_PROFILE', 'BIKE1_VEHICLE_PROFILE', 'BIKE2_VEHICLE_PROFILE',
  ]) assert.equal(retired in profilesModule, false, retired);
  const source = await readFile(new URL('../src/physics/automatic-powertrain.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /torqueConverterSlipRpm/);
  // M9.17 (doc 111, sections 1-3) removes the replacement launch-slip concept as well.
  assert.doesNotMatch(source, /launchCouplingSlipRpm/);
});
