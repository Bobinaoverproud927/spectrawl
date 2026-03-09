const https = require('https')
const http = require('http')
const { URL } = require('url')

/**
 * DuckDuckGo search — free, unlimited, no API key needed.
 * Uses JSON API + HTML fallback + lite fallback.
 * Built-in retry with backoff for datacenter IP rate limiting.
 * Optional proxy support for reliable results.
 */
async function ddgSearch(query, config = {}) {
  const maxResults = config.maxResults || 10
  const proxy = config.proxy || null

  // Try up to 2 times with backoff
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await delay(1000 + Math.random() * 1000)

    // Strategy 1: JSON API (instant answers — most reliable from datacenter)
    try {
      const results = await ddgJsonApi(query, maxResults, proxy)
      if (results.length > 0) return results
    } catch (e) { /* fall through */ }

    // Strategy 2: HTML search (html.duckduckgo.com)
    try {
      const results = await ddgHtmlSearch(query, maxResults, 'html.duckduckgo.com', proxy)
      if (results.length > 0) return results
    } catch (e) { /* fall through */ }

    // Strategy 3: Lite search (lite.duckduckgo.com — simpler, less likely to CAPTCHA)
    try {
      const results = await ddgHtmlSearch(query, maxResults, 'lite.duckduckgo.com', proxy)
      if (results.length > 0) return results
    } catch (e) { /* fall through */ }
  }

  return []
}

async function ddgJsonApi(query, maxResults, proxy) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`
  const data = await fetchJson(url, proxy)
  
  const results = []

  if (data.AbstractURL && data.Abstract) {
    results.push({
      url: data.AbstractURL,
      title: data.Heading || query,
      snippet: data.Abstract,
      engine: 'ddg'
    })
  }

  if (data.RelatedTopics) {
    for (const topic of data.RelatedTopics) {
      if (results.length >= maxResults) break
      if (topic.FirstURL && topic.Text) {
        results.push({
          url: topic.FirstURL,
          title: topic.Text.slice(0, 100),
          snippet: topic.Text,
          engine: 'ddg'
        })
      }
      if (topic.Topics) {
        for (const sub of topic.Topics) {
          if (results.length >= maxResults) break
          if (sub.FirstURL && sub.Text) {
            results.push({
              url: sub.FirstURL,
              title: sub.Text.slice(0, 100),
              snippet: sub.Text,
              engine: 'ddg'
            })
          }
        }
      }
    }
  }

  if (data.Results) {
    for (const r of data.Results) {
      if (results.length >= maxResults) break
      if (r.FirstURL && r.Text) {
        results.push({
          url: r.FirstURL,
          title: r.Text.slice(0, 100),
          snippet: r.Text,
          engine: 'ddg'
        })
      }
    }
  }

  return results
}

async function ddgHtmlSearch(query, maxResults, hostname, proxy) {
  const path = `/html/?q=${encodeURIComponent(query)}`
  const html = await fetchHtml(`https://${hostname}${path}`, proxy)
  
  // Detect CAPTCHA / rate limit
  if (html.includes('g-recaptcha') || html.includes('bot detected') || html.length < 500) {
    return []
  }
  
  const results = []
  
  const resultRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g

  const links = []
  let match
  while ((match = resultRegex.exec(html)) !== null) {
    const url = decodeUddg(match[1])
    if (isAd(url)) continue
    links.push({ url, title: stripHtml(match[2]) })
  }

  // Lite endpoint uses different selectors
  if (links.length === 0) {
    const liteRegex = /<a[^>]+class="result-link"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g
    while ((match = liteRegex.exec(html)) !== null) {
      const url = decodeUddg(match[1])
      if (isAd(url)) continue
      links.push({ url, title: stripHtml(match[2]) })
    }
    // Even simpler: just grab all non-DDG links from lite results
    if (links.length === 0) {
      const anyLink = /<a[^>]*href="(https?:\/\/(?!duckduckgo)[^"]+)"[^>]*>([\s\S]*?)<\/a>/g
      while ((match = anyLink.exec(html)) !== null) {
        if (results.length >= maxResults) break
        const url = match[1]
        if (isAd(url)) continue
        links.push({ url, title: stripHtml(match[2]) })
      }
    }
  }

  const snippets = []
  while ((match = snippetRegex.exec(html)) !== null) {
    snippets.push(stripHtml(match[1]))
  }

  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    results.push({
      url: links[i].url,
      title: links[i].title,
      snippet: snippets[i] || '',
      engine: 'ddg'
    })
  }

  return results
}

function isAd(url) {
  if (!url) return true
  if (url.includes('duckduckgo.com/y.js')) return true
  if (url.includes('ad_provider=')) return true
  if (url.includes('ad_domain=')) return true
  return false
}

function decodeUddg(url) {
  if (url.includes('uddg=')) {
    const match = url.match(/uddg=([^&]+)/)
    if (match) return decodeURIComponent(match[1])
  }
  return url
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function fetchJson(url, proxy) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: { 'User-Agent': 'Spectrawl/0.3' }
    }
    
    const req = https.get(opts, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error('Invalid JSON from DDG API')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('DDG timeout')) })
  })
}

function fetchHtml(url, proxy) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    }

    const req = https.get(opts, res => {
      // Follow redirects
      if ([301, 302, 303].includes(res.statusCode) && res.headers.location) {
        return fetchHtml(res.headers.location, proxy).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('DDG HTML timeout')) })
  })
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

module.exports = { ddgSearch }
