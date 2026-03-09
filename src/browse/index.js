/**
 * Browse engine — stealth web browsing with escalation.
 * Playwright (fast) → Camoufox (stealth) when blocked.
 */

const { CamoufoxClient } = require('./camoufox')

class BrowseEngine {
  constructor(config = {}, cache) {
    this.config = config
    this.cache = cache
    this.browser = null
    this.camoufox = new CamoufoxClient(config.camoufox || {})
    this._camoufoxAvailable = null // cached check
  }

  /**
   * Browse a URL and extract content.
   * @param {string} url
   * @param {object} opts - { auth, screenshot, extract, stealth, html, _cookies }
   */
  async browse(url, opts = {}) {
    // Check cache
    if (!opts.noCache && !opts.screenshot) {
      const cached = this.cache?.get('scrape', url)
      if (cached) return { ...cached, cached: true }
    }

    // If stealth requested or Playwright fails, use Camoufox
    if (opts.stealth) {
      return this._browseCamoufox(url, opts)
    }

    // Default: try Playwright first
    try {
      return await this._browsePlaywright(url, opts)
    } catch (err) {
      // If blocked/detected, escalate to Camoufox
      if (this._isBlocked(err)) {
        console.log(`Playwright blocked on ${url}, escalating to Camoufox`)
        return this._browseCamoufox(url, opts)
      }
      throw err
    }
  }

  /**
   * Browse with Playwright (fast, default).
   */
  async _browsePlaywright(url, opts) {
    const browser = await this._getBrowser()
    const context = await this._createContext(browser, opts)
    const page = await context.newPage()

    try {
      if (opts._cookies) {
        await context.addCookies(opts._cookies)
      }

      if (this.config.humanlike?.scrollBehavior) {
        await this._humanlikeNav(page, url)
      } else {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
      }

      const result = {}

      if (opts.extract !== false) {
        result.content = await page.evaluate(() => {
          const main = document.querySelector('main, article, [role="main"]') || document.body
          return main.innerText
        })
      }

      if (opts.html) {
        result.html = await page.content()
      }

      if (opts.screenshot) {
        result.screenshot = await page.screenshot({ 
          type: 'png',
          fullPage: opts.fullPage || false
        })
      }

      if (opts.saveCookies) {
        result.cookies = await context.cookies()
      }

      result.url = page.url()
      result.title = await page.title()
      result.cached = false
      result.engine = 'playwright'

      if (!opts.screenshot) {
        this.cache?.set('scrape', url, { content: result.content, url: result.url, title: result.title })
      }

      return result
    } finally {
      await page.close()
      await context.close()
    }
  }

  /**
   * Browse with Camoufox (stealth, anti-fingerprint).
   * Connects to existing Camoufox HTTP service.
   */
  async _browseCamoufox(url, opts) {
    // Check if Camoufox is available
    if (this._camoufoxAvailable === null) {
      const health = await this.camoufox.health()
      this._camoufoxAvailable = health.available
    }

    if (!this._camoufoxAvailable) {
      throw new Error('Camoufox not available. Start it with: systemctl start camoufox-reddit (or run service.py)')
    }

    // Inject cookies if needed
    if (opts._cookies) {
      await this.camoufox.setCookies(opts._cookies)
    }

    // Navigate
    await this.camoufox.navigate(url, { wait: 3000 })

    const result = { engine: 'camoufox', cached: false }

    // Get text content
    if (opts.extract !== false) {
      const textData = await this.camoufox.getText()
      result.content = textData.text
      result.title = textData.title
      result.url = textData.url
    }

    // Screenshot
    if (opts.screenshot) {
      const ssData = await this.camoufox.screenshot()
      result.screenshotPath = ssData.path
    }

    if (!opts.screenshot) {
      this.cache?.set('scrape', url, { content: result.content, url: result.url, title: result.title })
    }

    return result
  }

  /**
   * Check if an error indicates the page blocked/detected us.
   */
  _isBlocked(err) {
    const msg = (err.message || '').toLowerCase()
    return msg.includes('captcha') ||
           msg.includes('blocked') ||
           msg.includes('403') ||
           msg.includes('access denied') ||
           msg.includes('challenge') ||
           msg.includes('cloudflare') ||
           msg.includes('bot detection')
  }

  async _getBrowser() {
    if (this.browser) return this.browser
    const { chromium } = require('playwright')
    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    return this.browser
  }

  async _createContext(browser, opts) {
    const contextOpts = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
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

  async _humanlikeNav(page, url) {
    const delay = this.config.humanlike || {}
    const min = delay.minDelay || 500
    const max = delay.maxDelay || 2000

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(min + Math.random() * (max - min))
    
    if (delay.scrollBehavior) {
      await page.evaluate(async () => {
        const distance = Math.floor(Math.random() * 500) + 200
        window.scrollBy({ top: distance, behavior: 'smooth' })
      })
      await page.waitForTimeout(min + Math.random() * (max - min))
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
    }
  }
}

module.exports = { BrowseEngine }
