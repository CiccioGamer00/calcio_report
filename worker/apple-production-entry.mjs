import core from './worker.js';
import { withProductionProMaintenance } from './pro-production-maintenance.mjs';
import { createAppleHandler } from './apple-handler.mjs';
import { createAppReviewRouter } from './app-review-router.mjs';

// Preparation only: source gate blocks purchase activation until payment migration.
export default createAppReviewRouter(
  withProductionProMaintenance(createAppleHandler(core, 'production')),
  createAppleHandler(core, 'test'), core,
);
