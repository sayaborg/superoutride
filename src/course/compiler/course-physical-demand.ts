import { compileCourseConsumerDemand } from './course-consumer-demand.js';

/** All physical consumers are explicit, independent of the separately qualified presentation domain. */
export function compileCoursePhysicalDemand(input: unknown) {
  return compileCourseConsumerDemand(input, ['contact', 'driverLookahead', 'reverseRecovery']);
}
