const https = require('https')
const { URL } = require('url')

/**
 * Bing web search — scrapes Bing HTML results.
 * No API key needed. More reliable from datacenter IPs than DDG.
 * DDG actually uses Bing's index anyway — this goes direct.
 */
async function bingSearch(query, config = {}) {
  const maxResults = config.maxResults || 10

  try {
    const html = await fetchBing(query)
    
    // Detect blocks
    if (html.includes('captcha') || html.includes('unusual traffic') || html.length < 1000) {
      return []
    }

    return parseBingResults(html, maxResults)
  } catch (e) {
    return []
  }
}

function parseBingResults(html, maxResults) {
  const results = []

  // Bing result blocks: <li class="b_algo">
  const blockRegex = /<li\s+class="b_algo">([\s\S]*?)<\/li>/g
  let block
  while ((block = blockRegex.exec(html)) !== null && results.length < maxResults) {
    const content = block[1]

    // Extract URL and title from <h2><a href="...">title</a></h2>
    const linkMatch = content.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!linkMatch) continue

    const url = linkMatch[1]
    const title = stripHtml(linkMatch[2])

    // Skip Bing internal links
    if (url.includes('bing.com') || url.includes('microsoft.com/bing')) continue

    // Extract snippet from <p> or <div class="b_caption">
    const snippetMatch = content.match(/<p[^>]*>([\s\S]*?)<\/p>/i) ||
                         content.match(/<div\s+class="b_caption"[^>]*>([\s\S]*?)<\/div>/i)
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : ''

    results.push({ url, title, snippet, engine: 'bing' })
  }

  return results
}

function fetchBing(query) {
  return new Promise((resolve, reject) => {
    const path = `/search?q=${encodeURIComponent(query)}&setlang=en&count=15`
    const opts = {
      hostname: 'www.bing.com',
      path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity',
        'DNT': '1'
      }
    }

    const req = https.get(opts, res => {
      // Follow redirects
      if ([301, 302, 303].includes(res.statusCode) && res.headers.location) {
        const loc = res.headers.location
        if (loc.startsWith('http')) {
          return fetchUrl(loc).then(resolve).catch(reject)
        }
        return fetchUrl('https://www.bing.com' + loc).then(resolve).catch(reject)
      }

      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Bing timeout')) })
  })
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const client = urlObj.protocol === 'https:' ? https : require('http')
    client.get({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
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
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

module.exports = { bingSearch }
