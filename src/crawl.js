/**
 * Spectrawl Crawl Engine v2
 * Multi-page website crawler using our own browse engine (Camoufox).
 * No external dependencies (no Jina, no Cloudflare).
 * Supports sync + async (job-based) modes.
 */

const crypto = require('crypto')

const DEFAULT_OPTS = {
  depth: 2,
  maxPages: 50,
  format: 'markdown',   // markdown | html | json
  delay: 500,           // ms between requests
  stealth: true,        // use stealth browsing by default
  scope: 'domain',      // domain | prefix | any
  timeout: 30000,
  includeLinks: true,
  includePatterns: [],   // wildcard patterns to include
  excludePatterns: [],   // wildcard patterns to exclude
  merge: false,          // merge all pages into single result
  skipPatterns: [
    /\.(png|jpg|jpeg|gif|svg|ico|webp|pdf|zip|gz|tar|mp4|mp3|woff|woff2|ttf|css|js)(\?|$)/i,
    /\/_next\//,
    /\/static\//,
    /\/assets\//,
    /mintcdn\.com/,
    /#/,
    /^mailto:/,
    /^tel:/,
    /^javascript:/,
  ]
}

// In-memory job store for async crawls
const jobs = new Map()

class CrawlEngine {
  constructor(browseEngine, cache) {
    this.browseEngine = browseEngine
    this.cache = cache
  }

  /**
   * Crawl a website starting from a URL (synchronous — waits for completion).
   */
  async crawl(startUrl, opts = {}, cookies = null) {
    // Filter out undefined values from opts to avoid overriding defaults
    const cleanOpts = Object.fromEntries(
      Object.entries(opts).filter(([_, v]) => v !== undefined)
    )
    const config = { ...DEFAULT_OPTS, ...cleanOpts }
    const startTime = Date.now()

    const startParsed = new URL(startUrl)
    const baseDomain = startParsed.hostname
    const basePrefix = startUrl.replace(/\/$/, '')

    const visited = new Set()
    const queue = [{ url: startUrl, depth: 0 }]
    const pages = []
    const failed = []

    while (queue.length > 0 && pages.length < config.maxPages) {
      const { url, depth } = queue.shift()
      const normalized = normalizeUrl(url)
      if (visited.has(normalized)) continue
      visited.add(normalized)

      // Scope check
      if (!this._inScope(url, baseDomain, basePrefix, config.scope)) continue
      // Skip pattern check
      if (config.skipPatterns.some(p => p.test(url))) continue
      // Include/exclude pattern check
      if (!this._matchesFilters(url, config.includePatterns, config.excludePatterns)) continue

      try {
        const page = await this._fetchPage(url, config, cookies)
        if (!page) { failed.push({ url, error: 'empty' }); continue }

        const links = page.links || []
        pages.push({
          url,
          title: page.title || '',
          content: page.content || '',
          links: config.includeLinks ? links : undefined,
          depth
        })

        // Enqueue child links
        if (depth < config.depth) {
          for (const link of links) {
            const absLink = resolveUrl(link, url)
            if (!absLink) continue
            const normLink = normalizeUrl(absLink)
            if (!visited.has(normLink)) {
              queue.push({ url: absLink, depth: depth + 1 })
            }
          }
        }

        if (queue.length > 0 && config.delay > 0) {
          await sleep(config.delay)
        }
      } catch (e) {
        failed.push({ url, error: e.message })
      }
    }

    const result = {
      startUrl,
      pages,
      stats: {
        total: visited.size,
        crawled: pages.length,
        failed: failed.length,
        duration: Date.now() - startTime
      },
      failed: failed.length > 0 ? failed : undefined
    }

    // Merge mode: combine all pages into single content
    if (config.merge) {
      result.merged = pages.map(p => {
        return `<!-- Source: ${p.url} -->\n# ${p.title || p.url}\n\n${p.content}`
      }).join('\n\n---\n\n')
    }

    return result
  }

  /**
   * Start an async crawl job. Returns job ID immediately.
   */
  startJob(startUrl, opts = {}, cookies = null) {
    const jobId = crypto.randomUUID()
    const job = {
      id: jobId,
      startUrl,
      status: 'running',
      started: Date.now(),
      finished: 0,
      total: 0,
      pages: [],
      failed: [],
      error: null
    }
    jobs.set(jobId, job)

    // Run crawl in background
    this.crawl(startUrl, opts, cookies)
      .then(result => {
        job.status = 'completed'
        job.pages = result.pages
        job.failed = result.failed || []
        job.finished = result.stats.crawled
        job.total = result.stats.total
        job.duration = result.stats.duration
      })
      .catch(err => {
        job.status = 'errored'
        job.error = err.message
      })

    return { jobId, status: 'running' }
  }

  /**
   * Get job status/results.
   */
  getJob(jobId) {
    const job = jobs.get(jobId)
    if (!job) return null
    return {
      id: job.id,
      startUrl: job.startUrl,
      status: job.status,
      started: job.started,
      finished: job.finished,
      total: job.total,
      pageCount: job.pages.length,
      error: job.error,
      // Only include pages if completed
      pages: job.status === 'completed' ? job.pages : undefined,
      failed: job.status === 'completed' ? (job.failed.length > 0 ? job.failed : undefined) : undefined,
      duration: job.duration
    }
  }

  /**
   * List all jobs.
   */
  listJobs() {
    return Array.from(jobs.values()).map(j => ({
      id: j.id,
      startUrl: j.startUrl,
      status: j.status,
      pageCount: j.pages.length,
      started: j.started
    }))
  }

  async _fetchPage(url, config, cookies) {
    // Use our own browse engine (Camoufox) — no external dependencies
    try {
      const result = await this.browseEngine.browse(url, {
        stealth: config.stealth,
        _cookies: cookies,
        timeout: config.timeout,
        html: true,    // request raw HTML for link extraction
        noCache: true  // always fetch fresh for crawling
      })
      if (result?.content) {
        // Extract links from HTML if available, otherwise from markdown content
        const linkSource = result.html || result.content
        return {
          title: result.title || '',
          content: result.content,
          links: extractLinks(linkSource, url)
        }
      }
    } catch (e) {
      throw new Error(`Failed to fetch ${url}: ${e.message}`)
    }

    return null
  }

  _inScope(url, baseDomain, basePrefix, scope) {
    try {
      const parsed = new URL(url)
      if (scope === 'domain') return parsed.hostname === baseDomain || parsed.hostname.endsWith('.' + baseDomain)
      if (scope === 'prefix') return url.startsWith(basePrefix)
      return true // 'any'
    } catch {
      return false
    }
  }

  _matchesFilters(url, includePatterns, excludePatterns) {
    // Exclude takes priority
    if (excludePatterns && excludePatterns.length > 0) {
      for (const pattern of excludePatterns) {
        if (wildcardMatch(url, pattern)) return false
      }
    }
    // If include patterns specified, URL must match at least one
    if (includePatterns && includePatterns.length > 0) {
      return includePatterns.some(pattern => wildcardMatch(url, pattern))
    }
    return true
  }
}

/**
 * Wildcard matching: * matches anything except /, ** matches everything including /
 */
function wildcardMatch(str, pattern) {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // escape regex chars
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{GLOBSTAR\}\}/g, '.*')
  return new RegExp('^' + regex + '$').test(str)
}

function extractLinks(content, baseUrl) {
  const links = []
  // Extract from href attributes (HTML)
  const hrefMatches = content.matchAll(/href=["']([^"']+)["']/gi)
  for (const m of hrefMatches) {
    const resolved = resolveUrl(m[1], baseUrl)
    if (resolved && !links.includes(resolved)) links.push(resolved)
  }
  // Extract from markdown links
  const mdMatches = content.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)
  for (const m of mdMatches) {
    if (!links.includes(m[2])) links.push(m[2])
  }
  return links
}

function resolveUrl(url, base) {
  try {
    if (url.startsWith('http')) return url
    return new URL(url, base).href
  } catch {
    return null
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url)
    u.hash = ''
    // Remove trailing slash for consistency
    let href = u.href
    if (href.endsWith('/') && u.pathname !== '/') {
      href = href.slice(0, -1)
    }
    return href
  } catch {
    return url
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

module.exports = { CrawlEngine }
