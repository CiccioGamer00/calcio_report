import core from './worker.js';
import { createAppleHandler } from './apple-handler.mjs';
import { createAppReviewRouter } from './app-review-router.mjs';

// Preparation only: source gate blocks purchase activation until payment migration.
export default createAppReviewRouter(
  createAppleHandler(core, 'production'), createAppleHandler(core, 'test'), core,
);
