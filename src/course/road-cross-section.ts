/** Road/shoulder geometry only. Visual paint and physical materials are independent consumers. */
export interface RoadCrossSection {
  readonly roadLeft: number;
  readonly roadRight: number;
  readonly shoulderWidth: number;
}

export function compileRoadCrossSection(section: RoadCrossSection): Readonly<RoadCrossSection> {
  if (
    !Number.isFinite(section.roadLeft) ||
    !(section.roadLeft > 0) ||
    !Number.isFinite(section.roadRight) ||
    !(section.roadRight > 0) ||
    !Number.isFinite(section.shoulderWidth) ||
    section.shoulderWidth < 0
  )
    throw new RangeError('road cross-section requires positive road widths and a nonnegative shoulder');
  return Object.freeze({
    roadLeft: section.roadLeft,
    roadRight: section.roadRight,
    shoulderWidth: section.shoulderWidth,
  });
}

/** Road-first classification; tolerance belongs to the consumer, not the authored width. */
export function classifyRoadCrossSection(
  section: RoadCrossSection,
  l: number,
  tolerance = 0,
): 'ROAD' | 'SHOULDER' | 'OUTSIDE' {
  if (!Number.isFinite(l) || !Number.isFinite(tolerance) || tolerance < 0)
    throw new RangeError('cross-section coordinate and tolerance must be finite');
  if (l >= -section.roadLeft - tolerance && l <= section.roadRight + tolerance) return 'ROAD';
  if (
    l >= -section.roadLeft - section.shoulderWidth - tolerance &&
    l <= section.roadRight + section.shoulderWidth + tolerance
  )
    return 'SHOULDER';
  return 'OUTSIDE';
}
