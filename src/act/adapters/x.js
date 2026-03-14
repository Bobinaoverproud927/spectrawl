const https = require('https')
const crypto = require('crypto')

/**
 * X (Twitter) platform adapter.
 * Methods: Cookie API (GraphQL) with OAuth 1.0a fallback.
 */
class XAdapter {
  /**
   * Execute an action on X.
   * @param {string} action - post, like, retweet, delete
   * @param {object} params - { account, text, mediaIds, tweetId, _cookies }
   * @param {object} ctx - { auth, browse }
   */
  async execute(action, params, ctx) {
    switch (action) {
      case 'post':
        return this._post(params, ctx)
      case 'article':
        return this._postArticle(params, ctx)
      case 'like':
        return this._like(params, ctx)
      case 'retweet':
        return this._retweet(params, ctx)
      case 'delete':
        return this._delete(params, ctx)
      default:
        throw new Error(`Unsupported X action: ${action}`)
    }
  }

  async _post(params, ctx) {
    const { text, account, _cookies } = params

    // Try Cookie API (GraphQL) first
    if (_cookies) {
      return this._graphqlPost(text, _cookies)
    }

    // Try OAuth 1.0a if configured
    const oauthCreds = await ctx.auth.getCookies('x', account)
    if (oauthCreds?.oauth) {
      return this._oauthPost(text, oauthCreds.oauth)
    }

    throw new Error(`No auth available for X account ${account}. Run: spectrawl login x --account ${account}`)
  }

  async _graphqlPost(text, cookies) {
    // X GraphQL CreateTweet mutation
    const csrfToken = cookies.find(c => c.name === 'ct0')?.value
    if (!csrfToken) throw new Error('Missing ct0 CSRF token in X cookies')

    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ')
    
    const body = JSON.stringify({
      variables: {
        tweet_text: text,
        dark_request: false,
        media: { media_entities: [], possibly_sensitive: false },
        semantic_annotation_ids: []
      },
      features: {
        communities_web_enable_tweet_community_results_fetch: true,
        c9s_tweet_anatomy_moderator_badge_enabled: true,
        tweetypie_unmention_optimization_enabled: true,
        responsive_web_edit_tweet_api_enabled: true,
        graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
        view_counts_everywhere_api_enabled: true,
        longform_notetweets_consumption_enabled: true,
        responsive_web_twitter_article_tweet_consumption_enabled: true,
        tweet_awards_web_tipping_enabled: false,
        creator_subscriptions_quote_tweet_preview_enabled: false,
        longform_notetweets_rich_text_read_enabled: true,
        longform_notetweets_inline_media_enabled: true,
        articles_preview_enabled: true,
        rweb_video_timestamps_enabled: true,
        rweb_tipjar_consumption_enabled: true,
        responsive_web_graphql_exclude_directive_enabled: true,
        verified_phone_label_enabled: false,
        freedom_of_speech_not_reach_fetch_enabled: true,
        standardized_nudges_misinfo: true,
        tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
        responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
        responsive_web_graphql_timeline_navigation_enabled: true,
        responsive_web_enhance_cards_enabled: false
      },
      queryId: 'bDE2rBtZb3uyrczSZ_pI9g'
    })

    const data = await postJson(
      'https://x.com/i/api/graphql/bDE2rBtZb3uyrczSZ_pI9g/CreateTweet',
      body,
      {
        'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
        'Content-Type': 'application/json',
        'Cookie': cookieStr,
        'X-Csrf-Token': csrfToken,
        'X-Twitter-Auth-Type': 'OAuth2Session',
        'X-Twitter-Active-User': 'yes'
      }
    )

    if (data.errors) {
      throw new Error(`X API error: ${data.errors[0]?.message || JSON.stringify(data.errors)}`)
    }

    const tweetId = data.data?.create_tweet?.tweet_results?.result?.rest_id
    return { tweetId, url: tweetId ? `https://x.com/i/status/${tweetId}` : null }
  }

  async _oauthPost(text, oauth) {
    // OAuth 1.0a — for accounts with API keys
    const { consumerKey, consumerSecret, accessToken, accessTokenSecret } = oauth
    
    const url = 'https://api.x.com/2/tweets'
    const body = JSON.stringify({ text })
    
    const authHeader = generateOAuthHeader('POST', url, {}, {
      consumerKey, consumerSecret, accessToken, accessTokenSecret
    })

    const data = await postJson(url, body, {
      'Authorization': authHeader,
      'Content-Type': 'application/json'
    })

    return { tweetId: data.data?.id, url: `https://x.com/i/status/${data.data?.id}` }
  }

  /**
   * Post an X Article (long-form) via browser automation.
   * X API doesn't support articles — must use the web composer.
   * 
   * Flow:
   * 1. Navigate to /compose/articles (article list)
   * 2. Find existing draft or create new article via GraphQL
   * 3. Navigate to /compose/articles/edit/{articleId}
   * 4. Fill title (data-testid="twitter-article-title") and body (contenteditable)
   * 5. Auto-save triggers, or click Publish
   * 
   * @param {object} params - { title, body, account, _cookies, publish, articleId }
   * publish: true = auto-publish, false = save as draft (default: false for safety)
   * articleId: edit existing article (optional)
   */
  async _postArticle(params, ctx) {
    const { title, body, account, _cookies, publish = false, articleId } = params

    if (!_cookies) {
      throw new Error(`No auth for X/${account}. Run: spectrawl login x --account ${account}`)
    }
    if (!title) throw new Error('X article requires a title')
    if (!body) throw new Error('X article requires a body')

    // Step 1: Get article editor URL
    let editorUrl
    if (articleId) {
      editorUrl = `https://x.com/compose/articles/edit/${articleId}`
    } else {
      // First go to articles list to find/create an article
      const { page: listPage, context: listCtx } = await ctx.browse.getPage({
        _cookies,
        url: 'https://x.com/compose/articles'
      })

      try {
        await listPage.waitForTimeout(2000 + Math.random() * 1000)

        // Try to create a new article via the GraphQL API
        const csrfToken = _cookies.find(c => c.name === 'ct0')?.value
        const newArticleId = await listPage.evaluate(async (csrf) => {
          try {
            const res = await fetch('https://x.com/i/api/graphql/uKxr91kGF4E4mdN-G3x0Yw/CreateArticle', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Csrf-Token': csrf,
                'Authorization': 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
                'X-Twitter-Auth-Type': 'OAuth2Session'
              },
              body: JSON.stringify({
                variables: {},
                queryId: 'uKxr91kGF4E4mdN-G3x0Yw'
              })
            })
            const data = await res.json()
            return data?.data?.article_create?.article_results?.result?.rest_id || null
          } catch { return null }
        }, csrfToken)

        if (newArticleId) {
          editorUrl = `https://x.com/compose/articles/edit/${newArticleId}`
        } else {
          // Fallback: find existing draft link or the write button
          const draftLink = await listPage.$('a[href*="/compose/articles/edit/"]')
          if (draftLink) {
            const href = await draftLink.getAttribute('href')
            editorUrl = `https://x.com${href}`
          } else {
            // Last resort: look for a "new article" / "write" link
            editorUrl = await listPage.evaluate(() => {
              const links = Array.from(document.querySelectorAll('a[href*="article"]'))
              for (const l of links) {
                if (l.textContent.toLowerCase().includes('write') || l.textContent.toLowerCase().includes('new')) {
                  return l.href
                }
              }
              return null
            })
          }
        }

        await listPage.close()
      } catch (e) {
        await listPage.close().catch(() => {})
        throw e
      }
    }

    if (!editorUrl) {
      throw new Error('Could not find or create X article editor. Try passing articleId directly.')
    }

    // Step 2: Open the article editor
    const { page, context } = await ctx.browse.getPage({
      _cookies,
      url: editorUrl
    })

    try {
      await page.waitForTimeout(2000 + Math.random() * 1000)

      // Check we're in the editor
      const hasEditor = await page.$('[data-testid="twitter-article-title"], [contenteditable="true"]')
      if (!hasEditor) {
        const content = await page.evaluate(() => document.body.innerText)
        throw new Error(`Not in article editor. Page content: ${content.slice(0, 200)}`)
      }

      // Step 3: Fill the title
      // Title: data-testid="twitter-article-title" or placeholder "Add a title"
      // Must click and type — execCommand doesn't work on this component
      const titleEl = await page.$('[data-testid="twitter-article-title"]')
      if (titleEl) {
        await titleEl.click()
        await page.waitForTimeout(300)
        // Select all existing text and replace
        await page.keyboard.down('Control')
        await page.keyboard.press('a')
        await page.keyboard.up('Control')
        await page.waitForTimeout(100)
        await page.keyboard.type(title, { delay: 15 + Math.random() * 25 })
      } else {
        // Fallback: find by placeholder
        await page.evaluate(() => {
          const el = document.querySelector('[data-placeholder="Add a title"]')
          if (el) { el.click(); el.focus() }
        })
        await page.waitForTimeout(300)
        await page.keyboard.type(title, { delay: 15 + Math.random() * 25 })
      }

      await page.waitForTimeout(500 + Math.random() * 500)

      // Step 4: Fill the body
      // Body has placeholder "Start writing" — it's a contenteditable div
      // Click it directly to avoid navigating away
      const bodyFilled = await page.evaluate((bodyText) => {
        // Find body editor — the one with "Start writing" placeholder
        const candidates = document.querySelectorAll('[contenteditable="true"]')
        let bodyEl = null
        for (const el of candidates) {
          const placeholder = el.getAttribute('data-placeholder') || el.getAttribute('aria-describedby') || ''
          const text = el.textContent || ''
          // The body editor usually has "Start writing" or is the main content area
          if (placeholder.includes('writing') || placeholder.includes('Start') || 
              text.includes('Start writing') || el.getAttribute('aria-multiline') === 'true') {
            bodyEl = el
            break
          }
        }
        // If not found by placeholder, take the contenteditable that's NOT the title
        if (!bodyEl) {
          const title = document.querySelector('[data-testid="twitter-article-title"]')
          for (const el of candidates) {
            if (el !== title && !title?.contains(el)) {
              bodyEl = el
              break
            }
          }
        }
        if (!bodyEl) return false

        bodyEl.focus()
        // Use insertText for proper React/editor state
        document.execCommand('selectAll', false, null)
        document.execCommand('insertText', false, bodyText)
        return true
      }, body)

      if (!bodyFilled) {
        // Fallback: click on "Start writing" text and type
        const bodyArea = await page.evaluate(() => {
          const els = document.querySelectorAll('[contenteditable="true"]')
          for (const el of els) {
            if (el.textContent.includes('Start writing') || el.getAttribute('aria-multiline') === 'true') {
              el.click()
              el.focus()
              return true
            }
          }
          return false
        })
        if (bodyArea) {
          await page.waitForTimeout(300)
          await page.keyboard.type(body, { delay: 5 })
        }
      }

      await page.waitForTimeout(1500) // Let auto-save trigger

      // Take screenshot for verification
      const screenshot = await page.screenshot({ type: 'png' }).catch(() => null)
      const draftUrl = page.url()

      if (publish) {
        // Find and click Publish button
        const pubBtn = await page.$('button:has-text("Publish"), [role="button"]:has-text("Publish")')
        if (pubBtn) {
          await pubBtn.click()
          await page.waitForTimeout(3000 + Math.random() * 2000)

          // Handle confirmation dialog if present
          const confirmBtn = await page.$('button:has-text("Publish"), [data-testid*="confirm"]')
          if (confirmBtn) {
            await confirmBtn.click()
            await page.waitForTimeout(3000)
          }
        }

        const finalUrl = page.url()
        await page.close()
        return { url: finalUrl, status: 'published', title }
      } else {
        await page.close()
        return {
          url: draftUrl,
          status: 'draft',
          title,
          screenshot: screenshot ? screenshot.toString('base64') : null,
          message: 'Article saved as draft. Set publish: true to auto-publish, or review at: ' + draftUrl
        }
      }
    } catch (e) {
      await page.close().catch(() => {})
      throw e
    }
  }

  async _like(params, ctx) {
    // TODO: implement like via GraphQL
    throw new Error('X like not yet implemented')
  }

  async _retweet(params, ctx) {
    // TODO: implement retweet via GraphQL
    throw new Error('X retweet not yet implemented')
  }

  async _delete(params, ctx) {
    // TODO: implement delete via GraphQL
    throw new Error('X delete not yet implemented')
  }
}

function generateOAuthHeader(method, url, params, creds) {
  const oauthParams = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0'
  }

  const allParams = { ...params, ...oauthParams }
  const sortedKeys = Object.keys(allParams).sort()
  const paramStr = sortedKeys.map(k => `${encodeRFC3986(k)}=${encodeRFC3986(allParams[k])}`).join('&')
  const baseStr = `${method}&${encodeRFC3986(url)}&${encodeRFC3986(paramStr)}`
  const signingKey = `${encodeRFC3986(creds.consumerSecret)}&${encodeRFC3986(creds.accessTokenSecret)}`
  
  oauthParams.oauth_signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseStr)
    .digest('base64')

  const header = Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeRFC3986(k)}="${encodeRFC3986(oauthParams[k])}"`)
    .join(', ')

  return `OAuth ${header}`
}

function encodeRFC3986(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function postJson(url, body, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const opts = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }
    }
    const req = https.request(opts, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch (e) { reject(new Error(`Invalid response: ${data.slice(0, 200)}`)) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('X API timeout')) })
    req.write(body)
    req.end()
  })
}

module.exports = { XAdapter }
