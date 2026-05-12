/**
 * In-memory structured audit log for outbound network requests.
 *
 * Tracks plugin-originated HTTP/HTTPS activity using a fixed-capacity ring
 * buffer so the log never grows unboundedly. No disk I/O.
 *
 * Usage:
 *   const log = createAuditLog({ maxEntries: 500 });
 *   log.append({ timestamp, method, url, ... });
 *   log.getEntries({ limit: 50 });
 */

/**
 * @typedef {object} AuditLogEntry
 * @property {number|null} requestId     - Electron webRequest details.id; used to back-fill statusCode in onCompleted.
 * @property {number}      timestamp     - Unix epoch ms (Date.now()).
 * @property {string}      method        - HTTP method, e.g. 'GET'.
 * @property {string}      url           - Request URL (query string stripped of PII is caller's responsibility).
 * @property {number|null} statusCode    - HTTP response status, or null if the response has not arrived yet.
 * @property {number|null} webContentsId - Electron webContents id, or null if unavailable.
 * @property {string|null} initiator     - Frame URL / referrer (best-effort).
 * @property {string|null} pluginId      - Attributed plugin id parsed from initiator, or null when unattributable.
 */

/**
 * @typedef {object} AuditLog
 * @property {(entry: AuditLogEntry) => void} append
 * @property {(requestId: number, partial: Partial<AuditLogEntry>) => boolean} updateByRequestId
 * @property {(opts?: { limit?: number; since?: number; pluginId?: string | null }) => AuditLogEntry[]} getEntries
 * @property {() => void}   clear
 * @property {() => number} size
 */

/**
 * Creates an in-memory audit log with a fixed-capacity ring buffer.
 *
 * @param {object} [opts]
 * @param {number} [opts.maxEntries=500] - Maximum number of entries to retain.
 *   When the buffer is full the oldest entry is discarded (FIFO).
 * @returns {AuditLog}
 */
export function createAuditLog({ maxEntries = 500 } = {}) {
  /** @type {AuditLogEntry[]} */
  const entries = [];

  /**
   * Appends an entry to the log. If the buffer is already at capacity the
   * oldest entry is dropped before inserting the new one.
   *
   * @param {AuditLogEntry} entry
   */
  function append(entry) {
    if (entries.length >= maxEntries) {
      entries.shift(); // drop oldest
    }
    entries.push(entry);
  }

  /**
   * Returns log entries in reverse-chronological order (newest first).
   *
   * @param {object}         [opts]
   * @param {number}         [opts.limit=100]   - Maximum number of entries to return.
   * @param {number}         [opts.since]       - Only return entries with timestamp > since (ms).
   * @param {string|null}    [opts.pluginId]    - Filter to a specific pluginId.
   *   Pass `null` explicitly to retrieve only entries with no attribution.
   *   Omit entirely (undefined) to return entries for any pluginId.
   * @returns {AuditLogEntry[]}
   */
  function getEntries({ limit = 100, since, pluginId } = {}) {
    let result = entries.slice(); // copy

    if (since !== undefined) {
      result = result.filter((e) => e.timestamp > since);
    }

    if (pluginId !== undefined) {
      result = result.filter((e) => e.pluginId === pluginId);
    }

    // Newest first.
    result.reverse();

    if (result.length > limit) {
      result = result.slice(0, limit);
    }

    return result;
  }

  /**
   * Finds an entry by requestId and merges the partial fields into it.
   * Used by onCompleted to back-fill statusCode without race conditions
   * across same-URL parallel requests.
   *
   * @param {number}                  requestId
   * @param {Partial<AuditLogEntry>}  partial
   * @returns {boolean} true if a match was found and updated; false otherwise
   *   (e.g. the entry was already evicted from the ring buffer).
   */
  function updateByRequestId(requestId, partial) {
    const target = entries.find((e) => e.requestId === requestId);
    if (!target) return false;
    Object.assign(target, partial);
    return true;
  }

  /** Clears all entries from the ring buffer. */
  function clear() {
    entries.length = 0;
  }

  /** Returns the number of entries currently in the buffer. */
  function size() {
    return entries.length;
  }

  return { append, updateByRequestId, getEntries, clear, size };
}
