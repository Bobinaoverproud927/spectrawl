const http = require('http')

/**
 * Camoufox client — connects to existing Camoufox HTTP service.
 * Camoufox is a modified Firefox with anti-fingerprint patches.
 * Runs as a persistent service, we just send commands via REST API.
 * 
 * Default: http://localhost:9869 (existing service on Hetzner)
 */
class CamoufoxClient {
  constructor(config = {}) {
    this.baseUrl = config.url || process.env.CAMOUFOX_URL || 'http://localhost:9869'
    this.timeout = config.timeout || 30000
  }

  /**
   * Check if Camoufox service is running.
   */
  async health() {
    try {
      const data = await this._get('/health')
      return { available: true, url: data.url }
    } catch (e) {
      return { available: false, error: e.message }
    }
  }

  /**
   * Navigate to a URL.
   */
  async navigate(url, opts = {}) {
    return this._post('/navigate', {
      url,
      timeout: opts.timeout || this.timeout,
      wait: opts.wait || 3000
    })
  }

  /**
   * Get page text content.
   */
  async getText() {
    return this._get('/text')
  }

  /**
   * Take a screenshot.
   */
  async screenshot() {
    return this._get('/screenshot')
  }

  /**
   * Click an element.
   */
  async click(selector, opts = {}) {
    return this._post('/click', {
      selector,
      timeout: opts.timeout || 10000,
      wait: opts.wait || 1000
    })
  }

  /**
   * Type text.
   */
  async type(text, opts = {}) {
    return this._post('/type', {
      text,
      delay: opts.delay || 20
    })
  }

  /**
   * Press a key.
   */
  async press(key) {
    return this._post('/press', { key })
  }

  /**
   * Update cookies.
   */
  async setCookies(cookies) {
    return this._post('/cookies', { cookies })
  }

  /**
   * Post to Reddit (uses built-in Reddit automation).
   */
  async redditPost(subreddit, title, body) {
    return this._post('/post', { subreddit, title, body })
  }

  /**
   * Reply to Reddit post/comment.
   */
  async redditReply(url, text) {
    return this._post('/reply', { url, text })
  }

  /**
   * Delete a Reddit post.
   */
  async redditDelete(url) {
    return this._post('/delete', { url })
  }

  async _get(path) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.baseUrl + path)
      http.get({
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        timeout: this.timeout
      }, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (res.statusCode >= 400) reject(new Error(parsed.error || `HTTP ${res.statusCode}`))
            else resolve(parsed)
          } catch (e) { reject(new Error(`Invalid response from Camoufox: ${data.slice(0, 200)}`)) }
        })
      }).on('error', reject)
    })
  }

  async _post(path, body) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(this.baseUrl + path)
      const bodyStr = JSON.stringify(body)
      const opts = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        },
        timeout: this.timeout
      }
      const req = http.request(opts, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data)
            if (res.statusCode >= 400) reject(new Error(parsed.error || `HTTP ${res.statusCode}`))
            else resolve(parsed)
          } catch (e) { reject(new Error(`Invalid response from Camoufox: ${data.slice(0, 200)}`)) }
        })
      })
      req.on('error', reject)
      req.write(bodyStr)
      req.end()
    })
  }
}

module.exports = { CamoufoxClient }
