const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

/**
 * Rate limiter for platform actions.
 * Tracks action history and enforces per-platform limits.
 * Also handles action deduplication and dead letter queue.
 */
class RateLimiter {
  constructor(config = {}) {
    const dbPath = config.dbPath || './data/ratelimit.db'
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.limits = config.limits || {}
    
    this._init()
  }

  _init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS action_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        account TEXT,
        action TEXT NOT NULL,
        content_hash TEXT,
        status TEXT DEFAULT 'success',
        error TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_action_log_platform 
        ON action_log(platform, created_at);
      
      CREATE INDEX IF NOT EXISTS idx_action_log_hash 
        ON action_log(content_hash, created_at);
    `)
  }

  /**
   * Check if an action is allowed under rate limits.
   * @returns {{ allowed: boolean, reason?: string, retryAfter?: number }}
   */
  check(platform, action, params = {}) {
    const limit = this.limits[platform]
    if (!limit) return { allowed: true }

    const now = Math.floor(Date.now() / 1000)
    const hourAgo = now - 3600

    // Check posts per hour
    if (limit.postsPerHour) {
      const count = this.db.prepare(
        'SELECT COUNT(*) as cnt FROM action_log WHERE platform = ? AND action = ? AND created_at > ? AND status = ?'
      ).get(platform, action, hourAgo, 'success')

      if (count.cnt >= limit.postsPerHour) {
        // Find when the oldest action in this window will expire
        const oldest = this.db.prepare(
          'SELECT created_at FROM action_log WHERE platform = ? AND action = ? AND created_at > ? AND status = ? ORDER BY created_at ASC LIMIT 1'
        ).get(platform, action, hourAgo, 'success')

        const retryAfter = oldest ? (oldest.created_at + 3600 - now) : 3600
        return {
          allowed: false,
          reason: `Rate limit: max ${limit.postsPerHour} ${action}s per hour on ${platform}`,
          retryAfter
        }
      }
    }

    // Check minimum delay between actions
    if (limit.minDelayMs) {
      const last = this.db.prepare(
        'SELECT created_at FROM action_log WHERE platform = ? AND status = ? ORDER BY created_at DESC LIMIT 1'
      ).get(platform, 'success')

      if (last) {
        const elapsed = (now - last.created_at) * 1000
        if (elapsed < limit.minDelayMs) {
          return {
            allowed: false,
            reason: `Min delay: wait ${Math.ceil((limit.minDelayMs - elapsed) / 1000)}s between actions on ${platform}`,
            retryAfter: Math.ceil((limit.minDelayMs - elapsed) / 1000)
          }
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Check if this action is a duplicate (same content recently posted).
   */
  isDuplicate(platform, contentHash, windowSeconds = 86400) {
    const cutoff = Math.floor(Date.now() / 1000) - windowSeconds
    const existing = this.db.prepare(
      'SELECT id FROM action_log WHERE platform = ? AND content_hash = ? AND created_at > ? AND status = ?'
    ).get(platform, contentHash, cutoff, 'success')

    return !!existing
  }

  /**
   * Log an action (success or failure).
   */
  log(platform, action, params = {}) {
    const now = Math.floor(Date.now() / 1000)
    this.db.prepare(`
      INSERT INTO action_log (platform, account, action, content_hash, status, error, retry_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      platform,
      params.account || null,
      action,
      params.contentHash || null,
      params.status || 'success',
      params.error || null,
      params.retryCount || 0,
      now
    )
  }

  /**
   * Get failed actions for retry (dead letter queue).
   */
  getFailedActions(maxRetries = 3) {
    return this.db.prepare(
      'SELECT * FROM action_log WHERE status = ? AND retry_count < ? ORDER BY created_at ASC'
    ).all('failed', maxRetries)
  }

  close() {
    this.db.close()
  }
}

module.exports = { RateLimiter }
