/**
 * Browse engine — three tiers of stealth.
 * 
 * Tier 1: playwright-extra + stealth plugin (default, npm install)
 * Tier 2: Camoufox binary (npx spectrawl install-stealth, engine-level anti-detect)
 * Tier 3: Remote Camoufox service (set camoufox.url, for existing deployments)
 * 
 * Auto-detects best available. No config needed for most users.
 */

const os = require('os')
const path = require('path')
const { CamoufoxClient } = require('./camoufox')
const { getCamoufoxPath, isInstalled } = require('./install-stealth')
const { CaptchaSolver } = require('./captcha-solver')

class BrowseEngine {
  constructor(config = {}, cache) {
    this.config = config
    this.cache = cache
    this.browser = null

    // Remote Camoufox service (existing deployment)
    this.remoteCamoufox = config.camoufox?.url ? new CamoufoxClient(config.camoufox) : null
    this._remoteCamoufoxAvailable = null

    // CAPTCHA solver (Gemini Vision fallback)
    this.captchaSolver = new CaptchaSolver(config.captcha || {})

    // Which engine we're using
    this._engine = null
  }

  /**
   * Browse a URL and extract content.
   */
  async browse(url, opts = {}) {
    if (!opts.noCache && !opts.screenshot) {
      const cached = this.cache?.get('scrape', url)
      if (cached) return { ...cached, cached: true }
    }

    // Force remote Camoufox if explicitly requested
    if (opts.camoufox && this.remoteCamoufox) {
      return this._browseRemoteCamoufox(url, opts)
    }

    // Site-specific pre-routing: use known-working alternatives before trying direct browse
    const siteOverride = this._getSiteOverride(url)
    if (siteOverride && !opts._skipOverride) {
      try {
        const result = await siteOverride(url, opts)
        if (result && !result.blocked && (result.content || '').length > 50) {
          return result  // Override succeeded with content
        }
        if (result && result.blocked) {
          return result  // Override confirmed site is blocked — return with actionable message
        }
        // Override returned empty/null — fall through to normal browse
      } catch (e) {
        // Override failed — fall through
      }
    }

    try {
      const result = await this._browsePlaywright(url, opts)

      // Post-browse content quality check
      if (result && result.blocked) {
        console.log(`[browse] Blocked on ${url}: ${result.blockType} — ${result.blockDetail}`)
        // Try site override as fallback
        if (siteOverride) {
          try {
            const fallback = await siteOverride(url, { ...opts, _skipOverride: true })
            if (fallback && !fallback.blocked && (fallback.content || '').length > 50) {
              fallback._fallback = true
              return fallback
            }
          } catch (e) { /* fallback failed too */ }
        }
      }

      return result
    } catch (err) {
      // If blocked and remote Camoufox available, try that
      if (this._isBlocked(err) && this.remoteCamoufox) {
        console.log(`Blocked on ${url}, escalating to remote Camoufox`)
        return this._browseRemoteCamoufox(url, opts)
      }

      if (this._isBlocked(err)) {
        const hint = isInstalled()
          ? 'Site has strong anti-bot. Try configuring a residential proxy.'
          : 'Run `npx spectrawl install-stealth` for engine-level anti-detect.'
        err.message = `Blocked on ${url}: ${err.message}. ${hint}`
      }
      throw err
    }
  }

  /**
   * Get site-specific override for sites that block datacenter IPs.
   * Returns a function that fetches content via alternative methods.
   */
  _getSiteOverride(url) {
    // X/Twitter: articles and posts can't be browsed without login
    // Fallback: xAI Responses API with x_search tool (reads X posts natively)
    if ((url.includes('x.com/') || url.includes('twitter.com/')) && url.includes('/status/')) {
      return async (originalUrl, opts) => {
        const xaiKey = process.env.XAI_API_KEY
        if (!xaiKey) return null // no key, fall through to normal browse

        try {
          const https = require('https')
          const body = JSON.stringify({
            model: 'grok-4-1-fast-non-reasoning',
            input: [{ role: 'user', content: `Return the FULL exact text of this X post and all replies/thread if it's a thread. Include the author's name and handle. No commentary, no analysis, just the raw content:\n\n${originalUrl}` }],
            tools: [{ type: 'x_search' }]
          })

          const content = await new Promise((resolve, reject) => {
            const req = https.request({
              hostname: 'api.x.ai',
              path: '/v1/responses',
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${xaiKey}`,
                'Content-Length': Buffer.byteLength(body)
              },
              timeout: 30000
            }, res => {
              let data = ''
              res.on('data', c => data += c)
              res.on('end', () => {
                try {
                  const json = JSON.parse(data)
                  if (json.error) return resolve(null)
                  const output = json.output || []
                  for (const o of output) {
                    if (o.type === 'message') {
                      for (const c of (o.content || [])) {
                        if (c.text && c.text.length > 20) return resolve(c.text)
                      }
                    }
                  }
                  resolve(null)
                } catch { resolve(null) }
              })
            })
            req.on('error', () => resolve(null))
            req.setTimeout(30000, () => { req.destroy(); resolve(null) })
            req.write(body)
            req.end()
          })

          if (content && content.length > 20) {
            return {
              content,
              url: originalUrl,
              title: 'X Post (via xAI)',
              statusCode: 200,
              cached: false,
              engine: 'xai-x-search',
              blocked: false
            }
          }
        } catch (e) { /* fall through */ }
        return null // fall through to normal browse
      }
    }

    // Reddit: datacenter IPs are fully blocked (browse, JSON, RSS all fail)
    // Fallback: PullPush API (free Reddit archive, no auth, no IP block)
    if (url.includes('reddit.com')) {
      return async (originalUrl, opts) => {
        try {
          const parsed = new URL(originalUrl)
          const pathParts = parsed.pathname.split('/').filter(Boolean)
          
          // Extract subreddit and post ID from URL
          let subreddit = null, postId = null, isComments = false
          for (let i = 0; i < pathParts.length; i++) {
            if (pathParts[i] === 'r' && pathParts[i + 1]) subreddit = pathParts[i + 1]
            if (pathParts[i] === 'comments' && pathParts[i + 1]) { postId = pathParts[i + 1]; isComments = true }
          }

          const h = require('https')
          const fetchJson = (apiUrl) => new Promise((resolve) => {
            const req = h.get(apiUrl, { 
              headers: { 'User-Agent': 'Spectrawl/0.6.1' },
              timeout: 10000
            }, res => {
              if (res.statusCode !== 200) return resolve(null)
              let data = ''
              res.on('data', c => data += c)
              res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(null) } })
            })
            req.on('error', () => resolve(null))
            req.setTimeout(10000, () => { req.destroy(); resolve(null) })
          })

          let content = ''

          if (postId) {
            // Specific thread: get post + comments
            const postData = await fetchJson(`https://api.pullpush.io/reddit/search/submission/?ids=${postId}`)
            const comments = await fetchJson(`https://api.pullpush.io/reddit/search/comment/?link_id=${postId}&size=25&sort=score&sort_type=desc`)
            
            if (postData?.data?.[0]) {
              const post = postData.data[0]
              content = `# ${post.title}\n\nby u/${post.author} in r/${post.subreddit} | ${post.score} points | ${post.num_comments} comments\n\n${post.selftext || post.url || ''}\n\n---\n\n## Comments\n\n`
              if (comments?.data) {
                for (const c of comments.data) {
                  content += `**u/${c.author}** (${c.score} pts):\n${c.body}\n\n`
                }
              }
            }
          } else if (subreddit) {
            // Subreddit listing
            const sort = parsed.pathname.includes('/top') ? 'score' : 'created_utc'
            const order = sort === 'score' ? 'desc' : 'desc'
            const data = await fetchJson(`https://api.pullpush.io/reddit/search/submission/?subreddit=${subreddit}&size=25&sort=${sort}&sort_type=${order}`)
            
            if (data?.data) {
              content = `# r/${subreddit}\n\n`
              for (const post of data.data) {
                content += `- **${post.title}** (${post.score} pts, ${post.num_comments} comments) by u/${post.author}\n  ${post.url || ''}\n  ${(post.selftext || '').slice(0, 200)}\n\n`
              }
            }
          } else {
            // Generic Reddit URL — try search
            const query = parsed.searchParams.get('q') || pathParts.join(' ')
            if (query) {
              const data = await fetchJson(`https://api.pullpush.io/reddit/search/submission/?q=${encodeURIComponent(query)}&size=15&sort=score&sort_type=desc`)
              if (data?.data) {
                content = `# Reddit search: ${query}\n\n`
                for (const post of data.data) {
                  content += `- **${post.title}** in r/${post.subreddit} (${post.score} pts) by u/${post.author}\n  ${(post.selftext || '').slice(0, 200)}\n\n`
                }
              }
            }
          }

          if (content && content.length > 50) {
            return {
              content,
              url: originalUrl,
              title: subreddit ? `r/${subreddit}` : 'Reddit',
              statusCode: 200,
              cached: false,
              engine: 'pullpush-api',
              blocked: false
            }
          }
        } catch (e) { /* fall through */ }

        return {
          content: '',
          url: originalUrl,
          title: 'Reddit',
          statusCode: 403,
          cached: false,
          engine: 'blocked',
          blocked: true,
          blockType: 'reddit',
          blockDetail: 'Reddit blocked and PullPush API unavailable. Use /search with a Reddit-related query to get cached content, or configure a residential proxy.'
        }
      }
    }

    // LinkedIn: use stored cookies + proxy to browse authenticated
    if (url.includes('linkedin.com')) {
      return async (originalUrl, opts) => {
        // Cookies are auto-injected by parent Spectrawl.browse() from auth DB
        const cookies = opts._cookies

        if (!cookies || cookies.length === 0) {
          return {
            content: '',
            url: originalUrl,
            title: 'LinkedIn',
            statusCode: 401,
            cached: false,
            engine: 'blocked',
            blocked: true,
            blockType: 'linkedin',
            blockDetail: 'LinkedIn requires authentication. Add cookies: spectrawl login linkedin --account yourname'
          }
        }

        try {
          // Browse with cookies via Camoufox (needs residential proxy to avoid IP mismatch)
          const browseResult = await this.browse(originalUrl, { 
            ...opts, 
            _skipOverride: true,
            stealth: true,
            camoufox: true 
          })

          if (browseResult && !browseResult.blocked && (browseResult.content || '').length > 200) {
            return { ...browseResult, engine: 'linkedin-authenticated' }
          }
        } catch (e) { /* redirect loop or block — expected without proxy */ }

        return {
          content: '',
          url: originalUrl,
          title: 'LinkedIn',
          statusCode: 999,
          cached: false,
          engine: 'blocked',
          blocked: true,
          blockType: 'linkedin',
          blockDetail: 'LinkedIn cookies valid but rejected from this IP (datacenter). Configure a residential proxy: spectrawl config set proxy.upstreams "[{\\"url\\":\\"http://user:pass@host:port\\"}]"'
        }
      }
    }

    // Amazon: try Jina Reader  
    if (url.includes('amazon.com') || url.includes('amazon.co')) {
      return async (originalUrl, opts) => {
        try {
          const jinaUrl = `https://r.jina.ai/${originalUrl}`
          const h = require('https')
          const content = await new Promise((resolve, reject) => {
            const req = h.get(jinaUrl, {
              headers: { 'Accept': 'text/plain', 'User-Agent': 'Spectrawl/1.0' },
              timeout: 10000
            }, res => {
              if (res.statusCode !== 200) return resolve(null)
              let data = ''
              res.on('data', c => data += c)
              res.on('end', () => resolve(data))
            })
            req.on('error', () => resolve(null))
            req.setTimeout(10000, () => { req.destroy(); resolve(null) })
          })

          if (content && content.length > 100) {
            return {
              content,
              url: originalUrl,
              title: 'Amazon (via Jina Reader)',
              statusCode: 200,
              cached: false,
              engine: 'jina-reader',
              blocked: false
            }
          }
        } catch (e) { /* fall through */ }
        return null
      }
    }

    return null
  }

  /**
   * Launch Playwright with the best available browser.
   * Priority: Camoufox binary > stealth Chromium > vanilla Chromium
   */
  async _getBrowser() {
    if (this.browser) return this.browser

    // Tier 2: Local Camoufox binary (engine-level anti-detect)
    const camoufoxBinary = getCamoufoxPath()
    if (camoufoxBinary) {
      try {
        const { firefox } = require('playwright')
        this.browser = await firefox.launch({
          executablePath: camoufoxBinary,
          headless: true,
          args: ['--no-remote']
        })
        this._engine = 'camoufox'
        console.log('Browse engine: Camoufox (engine-level anti-detect)')
        return this.browser
      } catch (e) {
        console.log(`Camoufox binary failed: ${e.message}, falling back`)
      }
    }

    // Tier 1: playwright-extra + stealth plugin
    try {
      const { chromium } = require('playwright-extra')
      const stealth = require('puppeteer-extra-plugin-stealth')
      chromium.use(stealth())

      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })
      this._engine = 'stealth-playwright'
      console.log('Browse engine: stealth Playwright (JS-level anti-detect)')
      return this.browser
    } catch (e) {
      // Tier 0: vanilla playwright
      const { chromium } = require('playwright')
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })
      this._engine = 'playwright'
      console.log('Browse engine: vanilla Playwright (no anti-detect — install playwright-extra)')
      return this.browser
    }
  }

  async _browsePlaywright(url, opts) {
    const browser = await this._getBrowser()
    const context = await this._createContext(browser, opts)
    const page = await context.newPage()

    // Network request capturing
    const networkRequests = []
    if (opts.captureNetwork) {
      page.on('request', req => {
        const resourceType = req.resourceType()
        if (['xhr', 'fetch'].includes(resourceType)) {
          networkRequests.push({
            url: req.url(),
            method: req.method(),
            resourceType,
            headers: opts.captureNetworkHeaders ? req.headers() : undefined,
            postData: req.postData() || undefined
          })
        }
      })
      page.on('response', async res => {
        const req = res.request()
        const resourceType = req.resourceType()
        if (['xhr', 'fetch'].includes(resourceType)) {
          const existing = networkRequests.find(r => r.url === req.url() && r.method === req.method())
          if (existing) {
            existing.status = res.status()
            existing.contentType = res.headers()['content-type'] || null
            if (opts.captureNetworkBody) {
              try {
                const body = await res.text().catch(() => null)
                if (body && body.length < 50000) existing.body = body
              } catch (e) { /* ignore */ }
            }
          }
        }
      })
    }

    try {
      if (opts._cookies) {
        // Sanitize cookies for Playwright compatibility
        const playwrightCookies = opts._cookies.map(c => {
          const clean = { ...c }
          if (!clean.sameSite || !['Strict', 'Lax', 'None'].includes(clean.sameSite)) {
            clean.sameSite = 'Lax'
          }
          if (clean.domain && clean.domain.startsWith('.')) {
            clean.domain = clean.domain.slice(1)
          }
          delete clean.hostOnly
          delete clean.session
          delete clean.storeId
          delete clean.id
          if (clean.expirationDate && !clean.expires) {
            clean.expires = clean.expirationDate
            delete clean.expirationDate
          }
          return clean
        })
        await context.addCookies(playwrightCookies)
      }

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })

      if (opts.fastMode) {
        // Crawl mode: minimal delays, just enough for lazy-load triggers
        await page.waitForTimeout(400)
        await page.evaluate(() => {
          window.scrollBy({ top: 500, behavior: 'instant' })
        })
        await page.waitForTimeout(200)
      } else {
        // Normal browse: full human-like delays
        await page.waitForTimeout(800 + Math.random() * 1500)
        await page.evaluate(() => {
          window.scrollBy({ top: Math.floor(Math.random() * 400) + 100, behavior: 'smooth' })
        })
        await page.waitForTimeout(300 + Math.random() * 700)
      }

      const result = {}

      if (opts.extract !== false) {
        result.content = await page.evaluate(() => {
          const main = document.querySelector('main, article, [role="main"]') || document.body
          return main.innerText
        })
      }

      if (opts.html) result.html = await page.content()

      if (opts.screenshot) {
        result.screenshot = await page.screenshot({
          type: 'png', fullPage: opts.fullPage || false
        })
      }

      if (opts.saveCookies) result.cookies = await context.cookies()

      result.url = page.url()
      result.title = await page.title()
      result.statusCode = null // playwright doesn't expose easily, but we detect blocks below
      result.cached = false
      result.engine = this._engine

      // Attach captured network requests
      if (opts.captureNetwork && networkRequests.length > 0) {
        result.networkRequests = networkRequests
      }

      // Detect block pages (Cloudflare, Akamai, etc.)
      const blockInfo = detectBlockPage(result.content, result.title, result.html, result.url)
      if (blockInfo) {
        result.blocked = true
        result.blockType = blockInfo.type
        result.blockDetail = blockInfo.detail
      }

      if (!opts.screenshot) {
        this.cache?.set('scrape', url, { content: result.content, url: result.url, title: result.title })
      }

      return result
    } finally {
      await page.close()
      await context.close()
    }
  }

  async _browseRemoteCamoufox(url, opts) {
    if (this._remoteCamoufoxAvailable === null) {
      const health = await this.remoteCamoufox.health()
      this._remoteCamoufoxAvailable = health.available
    }

    if (!this._remoteCamoufoxAvailable) {
      throw new Error('Remote Camoufox configured but not running. Check camoufox.url.')
    }

    if (opts._cookies) await this.remoteCamoufox.setCookies(opts._cookies)
    await this.remoteCamoufox.navigate(url, { wait: 3000 })

    const result = { engine: 'remote-camoufox', cached: false }

    if (opts.extract !== false) {
      const textData = await this.remoteCamoufox.getText()
      result.content = textData.text
      result.title = textData.title
      result.url = textData.url
    }

    if (opts.screenshot) {
      const ssData = await this.remoteCamoufox.screenshot()
      result.screenshotPath = ssData.path
    }

    if (!opts.screenshot) {
      this.cache?.set('scrape', url, { content: result.content, url: result.url, title: result.title })
    }

    return result
  }

  _isBlocked(err) {
    const msg = (err.message || '').toLowerCase()
    return msg.includes('captcha') || msg.includes('blocked') || msg.includes('403') ||
           msg.includes('access denied') || msg.includes('challenge') ||
           msg.includes('cloudflare') || msg.includes('bot detection')
  }

  async _createContext(browser, opts) {
    const resolutions = [
      { width: 1920, height: 1080 }, { width: 1536, height: 864 },
      { width: 1440, height: 900 }, { width: 1366, height: 768 },
      { width: 2560, height: 1440 }
    ]
    const viewport = resolutions[Math.floor(Math.random() * resolutions.length)]

    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
    ]

    const contextOpts = {
      userAgent: userAgents[Math.floor(Math.random() * userAgents.length)],
      viewport,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      colorScheme: 'light',
      deviceScaleFactor: Math.random() > 0.5 ? 1 : 2
    }

    if (this.config.proxy) {
      contextOpts.proxy = {
        server: `${this.config.proxy.host}:${this.config.proxy.port}`,
        username: this.config.proxy.username,
        password: this.config.proxy.password
      }
    }

    return browser.newContext(contextOpts)
  }

  /**
   * Get a raw Playwright page for direct interaction.
   * Used by platform adapters that need browser automation (e.g., IH).
   * Caller is responsible for closing the page and context.
   * 
   * @param {object} opts - { _cookies, url }
   * @returns {{ page, context, engine }}
   */
  async getPage(opts = {}) {
    const browser = await this._getBrowser()
    const context = await this._createContext(browser, opts)

    if (opts._cookies) {
      const playwrightCookies = opts._cookies.map(c => {
        const clean = { ...c }
        if (!clean.sameSite || !['Strict', 'Lax', 'None'].includes(clean.sameSite)) {
          clean.sameSite = 'Lax'
        }
        if (clean.domain && clean.domain.startsWith('.')) {
          clean.domain = clean.domain.slice(1)
        }
        delete clean.hostOnly; delete clean.session; delete clean.storeId; delete clean.id
        if (clean.expirationDate && !clean.expires) {
          clean.expires = clean.expirationDate; delete clean.expirationDate
        }
        return clean
      })
      await context.addCookies(playwrightCookies)
    }

    const page = await context.newPage()

    if (opts.url) {
      await page.goto(opts.url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForTimeout(800 + Math.random() * 1500)
    }

    return { page, context, engine: this._engine }
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}

/**
 * Detect block/challenge pages from CDNs and bot protection services.
 * Returns { type, detail } if blocked, null if clean.
 */
function detectBlockPage(content, title, html, url) {
  const text = (content || '').toLowerCase()
  const titleLower = (title || '').toLowerCase()
  const htmlLower = (html || '').toLowerCase()

  // Cloudflare
  if (htmlLower.includes('cf-error-details') || htmlLower.includes('cf_chl_opt') ||
      text.includes('attention required') && text.includes('cloudflare') ||
      text.includes('checking if the site connection is secure') ||
      titleLower.includes('just a moment') && htmlLower.includes('cloudflare') ||
      text.includes('ray id:') && text.includes('cloudflare')) {
    return { type: 'cloudflare', detail: 'Cloudflare bot challenge or block page detected' }
  }

  // Cloudflare RFC 9457 structured error (new format)
  if (htmlLower.includes('application/problem+json') || 
      text.includes('error 1') && text.includes('cloudflare') ||
      htmlLower.includes('"type":') && htmlLower.includes('cloudflare.com/errors/')) {
    return { type: 'cloudflare-rfc9457', detail: 'Cloudflare structured error response (RFC 9457)' }
  }

  // Akamai
  if (text.includes('access denied') && htmlLower.includes('akamai') ||
      htmlLower.includes('akamaighost') ||
      text.includes('reference #') && text.includes('access denied')) {
    return { type: 'akamai', detail: 'Akamai bot detection triggered' }
  }

  // AWS WAF
  if (text.includes('request blocked') && htmlLower.includes('aws') ||
      htmlLower.includes('awswaf')) {
    return { type: 'aws-waf', detail: 'AWS WAF blocked the request' }
  }

  // Imperva / Incapsula
  if (htmlLower.includes('incapsula') || htmlLower.includes('imperva') ||
      text.includes('request unsuccessful') && text.includes('incapsula')) {
    return { type: 'imperva', detail: 'Imperva/Incapsula bot detection triggered' }
  }

  // DataDome
  if (htmlLower.includes('datadome') || htmlLower.includes('dd.js')) {
    return { type: 'datadome', detail: 'DataDome bot detection triggered' }
  }

  // PerimeterX / HUMAN
  if (htmlLower.includes('perimeterx') || htmlLower.includes('px-captcha') ||
      htmlLower.includes('human security')) {
    return { type: 'perimeterx', detail: 'PerimeterX/HUMAN bot detection triggered' }
  }

  // hCaptcha challenge
  if (htmlLower.includes('hcaptcha.com') && htmlLower.includes('h-captcha')) {
    return { type: 'hcaptcha', detail: 'hCaptcha challenge page' }
  }

  // reCAPTCHA challenge (standalone, not embedded)
  if (htmlLower.includes('recaptcha') && text.length < 500 &&
      (titleLower === '' || titleLower.includes('blocked') || titleLower.includes('verify'))) {
    return { type: 'recaptcha', detail: 'reCAPTCHA challenge page' }
  }

  // Reddit network block
  if (text.includes('been blocked by network security') ||
      text.includes('log in to your reddit account') && text.includes('blocked') ||
      text.includes('whoa there, pardner') ||
      text.includes('your request has been blocked') && url?.includes('reddit')) {
    return { type: 'reddit', detail: 'Reddit network-level IP block (datacenter IP detected)' }
  }

  // Amazon bot detection / CAPTCHA wall
  if ((text.includes('continue shopping') && text.length < 300) ||
      text.includes('sorry, we just need to make sure you') ||
      text.includes('enter the characters you see below') ||
      (text.includes('robot') && text.includes('sorry') && url?.includes('amazon')) ||
      (titleLower.includes('robot check') && url?.includes('amazon'))) {
    return { type: 'amazon', detail: 'Amazon CAPTCHA/bot detection wall' }
  }

  // LinkedIn auth wall / cookie consent wall
  if ((text.includes('sign in') && text.includes('linkedin') && text.length < 1000) ||
      (text.includes('join now') && text.includes('linkedin') && text.length < 1000) ||
      (text.includes('essential and non-essential cookies') && url?.includes('linkedin'))) {
    return { type: 'linkedin', detail: 'LinkedIn authentication or cookie consent wall' }
  }

  // Google / YouTube consent
  if (text.includes('before you continue to google') ||
      text.includes('before you continue to youtube') ||
      (titleLower.includes('consent') && (url?.includes('google') || url?.includes('youtube')))) {
    return { type: 'google-consent', detail: 'Google/YouTube consent page' }
  }

  // Generic bot detection signals
  if (text.length < 200 && (
      text.includes('access denied') || text.includes('403 forbidden') ||
      text.includes('bot detected') || text.includes('automated access') ||
      text.includes('please verify you are human') || text.includes('are you a robot'))) {
    return { type: 'generic', detail: 'Generic bot detection or access denied page' }
  }

  // Content quality heuristic — suspiciously short content from sites that should have more
  if (text.length < 100 && text.length > 0 && url) {
    const knownLargeSites = ['reddit.com', 'amazon.com', 'linkedin.com', 'facebook.com', 
                             'twitter.com', 'x.com', 'instagram.com', 'g2.com', 'yelp.com',
                             'glassdoor.com', 'indeed.com', 'zillow.com', 'ebay.com']
    if (knownLargeSites.some(s => url.includes(s))) {
      return { type: 'suspected-block', detail: `Suspiciously short content (${text.length} chars) from ${url} — likely blocked or gated` }
    }
  }

  return null
}

module.exports = { BrowseEngine }
