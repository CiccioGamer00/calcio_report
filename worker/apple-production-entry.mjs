import core from './worker.js';
import { createAppleHandler } from './apple-handler.mjs';

// Preparation only: source gate blocks purchase activation until payment migration.
export default createAppleHandler(core, 'production');
