import core from './worker.js';
import { withAppleReadiness } from './apple-readiness.mjs';
import { withCommunityInterest } from './community-interest.mjs';
import { withProductionProMaintenance } from './pro-production-maintenance.mjs';
import { createAppleHandler } from './apple-handler.mjs';
import { createAppReviewRouter } from './app-review-router.mjs';

// Preparation only: source gate blocks purchase activation until payment migration.
export default createAppReviewRouter(
  withProductionProMaintenance(withAppleReadiness(withCommunityInterest(createAppleHandler(core, 'production'), core))),
  createAppleHandler(core, 'test'), core,
);
