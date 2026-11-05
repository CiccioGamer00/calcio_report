import core from './worker.js';
import { createAppleHandler } from './apple-handler.mjs';

// Preserve the accepted isolated Sandbox deployment.
export default createAppleHandler(core, 'test');
