import { courseDrivingFixture, compareCourseDriving } from '../../tests/helpers/course-driving-probe.mjs';

const course = await courseDrivingFixture();
for (const poseSlack of [0, 64]) {
  const started = performance.now();
  const report = { ...compareCourseDriving(course, { frames: 600, poseSlack }) };
  for (const key of ['vehicle', 'camera', 'frame', 'section', 'pixels']) delete report[key];
  console.log(
    JSON.stringify({
      scope: 'single-section-real-consumer-comparison',
      poseSlack,
      ...report,
      milliseconds: performance.now() - started,
      peakRssBytes: process.resourceUsage().maxRSS * 1024,
    }),
  );
}
