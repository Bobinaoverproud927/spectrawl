/**
 * Form filler — handles platform-specific input quirks.
 * Solves: contentEditable divs, shadow DOMs, React controlled inputs.
 */

/**
 * Fill a contentEditable div (X compose box, Notion, etc.)
 * Regular Playwright .fill() doesn't work on these.
 */
async function fillContentEditable(page, selector, text) {
  await page.click(selector)
  await page.waitForTimeout(200)
  
  // execCommand("insertText") is the only reliable method for contentEditable
  await page.evaluate(({ selector, text }) => {
    const el = document.querySelector(selector)
    if (el) {
      el.focus()
      document.execCommand('selectAll', false, null)
      document.execCommand('insertText', false, text)
    }
  }, { selector, text })
}

/**
 * Fill a React controlled input.
 * React ignores .value changes — need to trigger native input events.
 */
async function fillReactInput(page, selector, text) {
  await page.click(selector)
  await page.waitForTimeout(100)
  
  // Clear existing value
  await page.evaluate((selector) => {
    const el = document.querySelector(selector)
    if (el) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set
      nativeInputValueSetter.call(el, '')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, selector)
  
  // Type character by character (most reliable for React)
  for (const char of text) {
    await page.keyboard.press(char === ' ' ? 'Space' : char)
    await page.waitForTimeout(10 + Math.random() * 30)
  }
}

/**
 * Fill a shadow DOM input.
 * Playwright can pierce shadow DOM with >> syntax.
 */
async function fillShadowInput(page, hostSelector, inputSelector, text) {
  const selector = `${hostSelector} >> ${inputSelector}`
  await page.fill(selector, text)
}

/**
 * Smart fill — detects input type and uses appropriate method.
 */
async function smartFill(page, selector, text, opts = {}) {
  const inputType = await page.evaluate((selector) => {
    const el = document.querySelector(selector)
    if (!el) return 'not_found'
    if (el.contentEditable === 'true' || el.getAttribute('contenteditable')) return 'contentEditable'
    if (el.shadowRoot) return 'shadow'
    
    // Check if React-controlled (has __reactFiber or __reactInternalInstance)
    const keys = Object.keys(el)
    if (keys.some(k => k.startsWith('__react'))) return 'react'
    
    return 'standard'
  }, selector)

  switch (inputType) {
    case 'contentEditable':
      return fillContentEditable(page, selector, text)
    case 'react':
      return fillReactInput(page, selector, text)
    case 'shadow':
      return fillShadowInput(page, opts.hostSelector || selector, opts.inputSelector || 'input', text)
    case 'standard':
      return page.fill(selector, text)
    default:
      // Last resort: click and type
      await page.click(selector)
      await page.keyboard.type(text, { delay: opts.delay || 20 })
  }
}

module.exports = { fillContentEditable, fillReactInput, fillShadowInput, smartFill }
