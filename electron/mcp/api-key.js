/**
 * API key for the local MCP endpoint: `opk_` + 32 url-safe random characters.
 */

import crypto from 'node:crypto';

export const API_KEY_PREFIX = 'opk_';

/** @returns {string} */
export function generateApiKey() {
  // 24 random bytes -> exactly 32 base64url characters, no padding.
  return API_KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
}
