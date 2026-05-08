/**
 * Lightweight logger. Info-level messages are gated behind DEBUG_LOGS so
 * production output stays quiet (and game/player IDs don't leak into stdout).
 * Errors and warnings always print.
 */
const debug =
  (process.env.NODE_ENV || 'development') !== 'production' ||
  process.env.DEBUG_LOGS === 'true';

export function log(...args) {
  if (debug) console.log(...args);
}

export function warn(...args) {
  console.warn(...args);
}

export function error(...args) {
  console.error(...args);
}

export const isDebug = debug;
