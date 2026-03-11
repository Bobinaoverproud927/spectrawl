/**
 * Spectrawl Crawl Engine
 * Recursively crawls a website using Jina Reader (free) with Playwright fallback.
 * Designed for AI agents: returns clean markdown, not raw HTML.
 */

const https = require('https')
const http = require('http')

const DEFAULT_OPTS = {
  depth: 1,
  maxPages: 50,
  format: 'markdown',   // markdown | html | json
  delay: 300,           // ms between requests
  stealth: false,
  scope: 'domain',      // domain | prefix | any
  timeout: 15000,
  includeLinks: true,
  skipPatterns: [
    /\.(png|jpg|jpeg|gif|svg|ico|webp|pdf|zip|gz|tar|mp4|mp3|woff|woff2|ttf|css)$/i,
    /#/,
    /^mailto:/,
    /^tel:/,
    /^javascript:/,
  ]
}

class CrawlEngine {
  constructor(browseEngine, cache) {
    this.browseEngine = browseEngine
    this.cache = cache
  }

  /**
   * Crawl a website starting from a URL.
   * @param {string} startUrl - Starting URL
   * @param {object} opts - Crawl options
   * @param {object} cookies - Optional auth cookies
   */
  async crawl(startUrl, opts = {}, cookies = null) {
    const config = { ...DEFAULT_OPTS, ...opts }
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

    return {
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
  }

  async _fetchPage(url, config, cookies) {
    // Try Jina Reader first (free, fast, clean markdown)
    try {
      const jinaUrl = `https://r.jina.ai/${url}`
      const content = await fetchText(jinaUrl, {
        'Accept': 'text/markdown',
        'X-Return-Format': config.format === 'html' ? 'html' : 'markdown',
        'X-With-Links-Summary': 'true',
        'X-Timeout': '10'
      })

      if (content && content.length > 100) {
        return parseJinaResponse(content, url)
      }
    } catch (e) {
      // fall through to Playwright
    }

    // Playwright fallback (stealth mode)
    try {
      const result = await this.browseEngine.browse(url, {
        stealth: config.stealth,
        _cookies: cookies,
        timeout: config.timeout
      })
      if (result?.content) {
        return {
          title: result.title || '',
          content: result.content,
          links: extractLinks(result.html || result.content, url)
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
      if (scope === 'domain') return parsed.hostname === baseDomain
      if (scope === 'prefix') return url.startsWith(basePrefix)
      return true // 'any'
    } catch {
      return false
    }
  }
}

function parseJinaResponse(content, sourceUrl) {
  // Jina returns markdown with a header block
  const lines = content.split('\n')
  let title = ''
  const links = []
  const contentLines = []
  let inLinksSummary = false

  for (const line of lines) {
    if (line.startsWith('Title:')) {
      title = line.replace('Title:', '').trim()
    } else if (line.startsWith('Links/Buttons:') || line.includes('## Links')) {
      inLinksSummary = true
    } else if (inLinksSummary) {
      // Extract markdown links [text](url)
      const matches = line.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)
      for (const m of matches) links.push(m[2])
    } else {
      contentLines.push(line)
    }
  }

  // Also extract inline links from content
  const inlineMatches = content.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g)
  for (const m of inlineMatches) {
    if (!links.includes(m[2])) links.push(m[2])
  }

  return {
    title: title || extractTitleFromMarkdown(contentLines.join('\n')),
    content: contentLines.join('\n').trim(),
    links: [...new Set(links)]
  }
}

function extractLinks(html, baseUrl) {
  const links = []
  const matches = html.matchAll(/href=["']([^"']+)["']/gi)
  for (const m of matches) {
    const resolved = resolveUrl(m[1], baseUrl)
    if (resolved && !links.includes(resolved)) links.push(resolved)
  }
  return links
}

function extractTitleFromMarkdown(content) {
  const match = content.match(/^#\s+(.+)/m)
  return match ? match[1].trim() : ''
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
    return u.href.replace(/\/$/, '')
  } catch {
    return url
  }
}

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.request(url, { headers: { 'User-Agent': 'Spectrawl/1.0', ...headers } }, res => {
      if (res.statusCode >= 400) { reject(new Error(`HTTP ${res.statusCode}`)); return }
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(d))
    })
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
    req.on('error', reject)
    req.end()
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

module.exports = { CrawlEngine }
