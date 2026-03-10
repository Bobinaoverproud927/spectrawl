const https = require('https')
const fs = require('fs')

/**
 * CAPTCHA solver using Gemini Vision.
 * Free tier: 1,500 req/day (gemini-2.0-flash).
 * 
 * Handles: image CAPTCHAs, text CAPTCHAs, simple challenges.
 * Does NOT handle: reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile
 * (those require token solving services like 2captcha).
 * 
 * Strategy: Playwright stealth bypasses most CAPTCHAs.
 * This is the fallback when a visual CAPTCHA appears.
 */

class CaptchaSolver {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.GEMINI_API_KEY
    this.model = config.model || 'gemini-2.0-flash'
  }

  /**
   * Detect if a page has a CAPTCHA challenge.
   * Returns { hasCaptcha, type, selector } or null.
   */
  async detect(page) {
    return page.evaluate(() => {
      // Check for common CAPTCHA indicators
      const indicators = [
        // reCAPTCHA
        { selector: '.g-recaptcha, #recaptcha, [data-sitekey]', type: 'recaptcha' },
        // hCaptcha
        { selector: '.h-captcha, [data-hcaptcha-sitekey]', type: 'hcaptcha' },
        // Cloudflare Turnstile
        { selector: '.cf-turnstile, [data-turnstile-sitekey]', type: 'turnstile' },
        // Image CAPTCHA (solvable with vision)
        { selector: 'img[src*="captcha"], img[alt*="captcha"], .captcha-image', type: 'image' },
        // Text/math CAPTCHA
        { selector: '[class*="captcha"] input, #captcha-input', type: 'text' },
      ]

      for (const { selector, type } of indicators) {
        const el = document.querySelector(selector)
        if (el) return { hasCaptcha: true, type, selector }
      }

      // Check page text for CAPTCHA mentions
      const bodyText = document.body?.innerText?.toLowerCase() || ''
      if (bodyText.includes('verify you are human') || bodyText.includes('complete the captcha')) {
        return { hasCaptcha: true, type: 'unknown', selector: null }
      }

      return { hasCaptcha: false, type: null, selector: null }
    })
  }

  /**
   * Attempt to solve a visual CAPTCHA using Gemini Vision.
   * Takes a screenshot of the CAPTCHA element, sends to Gemini, returns answer.
   */
  async solveImage(page, captchaSelector) {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY required for CAPTCHA solving')
    }

    // Screenshot the CAPTCHA element
    const element = await page.$(captchaSelector)
    if (!element) throw new Error(`CAPTCHA element not found: ${captchaSelector}`)

    const screenshot = await element.screenshot({ type: 'png' })
    const base64 = screenshot.toString('base64')

    // Ask Gemini to solve it
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`
    const body = JSON.stringify({
      contents: [{
        parts: [
          { text: 'This is a CAPTCHA image. What text, numbers, or answer does it show? Reply with ONLY the answer, nothing else.' },
          { inline_data: { mime_type: 'image/png', data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 100 }
    })

    const data = await this._post(url, body)
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return answer || null
  }

  /**
   * Full solve flow: detect → solve → fill → submit.
   * Returns true if solved, false if unsolvable type.
   */
  async trySolve(page) {
    const detection = await this.detect(page)
    if (!detection?.hasCaptcha) return { solved: false, reason: 'no captcha detected' }

    // Token-based CAPTCHAs — can't solve with vision
    if (['recaptcha', 'hcaptcha', 'turnstile'].includes(detection.type)) {
      return { solved: false, reason: `${detection.type} requires token solving (2captcha/CapSolver)` }
    }

    // Image CAPTCHA — solve with Gemini Vision
    if (detection.type === 'image') {
      try {
        const answer = await this.solveImage(page, detection.selector)
        if (!answer) return { solved: false, reason: 'gemini could not read captcha' }

        // Find the input field near the CAPTCHA
        const inputSelector = await page.evaluate((captchaSelector) => {
          const captcha = document.querySelector(captchaSelector)
          // Look for nearby input
          const parent = captcha?.closest('form') || captcha?.parentElement
          const input = parent?.querySelector('input[type="text"], input:not([type])')
          if (input) {
            input.id = input.id || '__spectrawl_captcha_input'
            return '#' + input.id
          }
          return null
        }, detection.selector)

        if (inputSelector) {
          await page.fill(inputSelector, answer)
          return { solved: true, answer, type: 'image' }
        }
        return { solved: false, reason: 'could not find captcha input field', answer }
      } catch (e) {
        return { solved: false, reason: e.message }
      }
    }

    return { solved: false, reason: `unsupported captcha type: ${detection.type}` }
  }

  _post(url, body) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url)
      const req = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, res => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch (e) { reject(new Error('Invalid Gemini response')) }
        })
      })
      req.on('error', reject)
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('Gemini vision timeout')) })
      req.write(body)
      req.end()
    })
  }
}

module.exports = { CaptchaSolver }
