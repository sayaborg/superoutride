import type { ArcadeVehicleState } from '../physics/arcade-vehicle-physics.js';
import {
  setArcadeVehicleSteeringYawPreviewTime,
  setArcadeVehicleSymmetricSteeringActuatorRate,
  setArcadeVehicleTravelDirectionSteeringGain,
} from '../physics/vehicle-calibration.js';
import {
  BROWSER_STEERING_RESPONSE_CYCLE_CODE,
  BROWSER_YAW_PREVIEW_CYCLE_CODE,
  browserSelfSteerGainForKey,
  nextBrowserSteeringResponseRate,
  nextBrowserYawPreviewTime,
  type BrowserSelfSteerGain,
  type BrowserYawPreviewTime,
} from './steering-calibration-selection.js';
import {
  mountMobileSelfSteerGainSelector,
  mountMobileSteeringResponseSelector,
  mountMobileYawPreviewSelector,
} from './mobile-selector-controls.js';

export interface BrowserSteeringCalibrationContainers {
  readonly selfSteer: HTMLElement;
  readonly yawPreview: HTMLElement;
  readonly steeringResponse: HTMLElement;
}

export interface BrowserSteeringCalibrationControls {
  handleKey(code: string): boolean;
}

/** One browser adapter connects keyboard and touch presentation to vehicle-owned calibration. */
export function mountBrowserSteeringCalibrationControls(
  containers: BrowserSteeringCalibrationContainers,
  getVehicle: () => ArcadeVehicleState,
  documentRef: Document = document,
): BrowserSteeringCalibrationControls {
  const initial = getVehicle().steeringCalibration;
  const gainSelector = mountMobileSelfSteerGainSelector(
    containers.selfSteer,
    initial.travelDirectionGain,
    selectGain,
    documentRef,
  );
  const yawPreviewSelector = mountMobileYawPreviewSelector(
    containers.yawPreview,
    initial.yawPreviewTime,
    selectYawPreview,
    documentRef,
  );
  const responseSelector = mountMobileSteeringResponseSelector(
    containers.steeringResponse,
    initial.steeringActuatorResponse.applyRate,
    selectResponse,
    documentRef,
  );

  function selectGain(gain: BrowserSelfSteerGain): void {
    setArcadeVehicleTravelDirectionSteeringGain(getVehicle(), gain);
    gainSelector.setActive(gain);
  }

  function selectYawPreview(yawPreviewTime: BrowserYawPreviewTime): void {
    setArcadeVehicleSteeringYawPreviewTime(getVehicle(), yawPreviewTime);
    yawPreviewSelector.setActive(yawPreviewTime);
  }

  function selectResponse(rate: number): void {
    setArcadeVehicleSymmetricSteeringActuatorRate(getVehicle(), rate);
    responseSelector.setActive(rate);
  }

  return Object.freeze({
    handleKey(code: string): boolean {
      const gain = browserSelfSteerGainForKey(code);
      if (gain !== null) {
        selectGain(gain);
        return true;
      }
      const vehicle = getVehicle();
      if (code === BROWSER_YAW_PREVIEW_CYCLE_CODE) {
        selectYawPreview(nextBrowserYawPreviewTime(
          vehicle.steeringCalibration.yawPreviewTime,
        ));
        return true;
      }
      if (code === BROWSER_STEERING_RESPONSE_CYCLE_CODE) {
        selectResponse(nextBrowserSteeringResponseRate(
          vehicle.steeringCalibration.steeringActuatorResponse.applyRate,
        ));
        return true;
      }
      return false;
    },
  });
}
