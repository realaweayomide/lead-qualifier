// tools.js — the things the agent is allowed to do.
//
// An agent is only as good as its tools, and each tool here returns *facts*, never opinions.
// The model's job is to weigh them; the tools' job is to go and look. Keeping that line clean
// is what stops an agent from confidently scoring a lead it never actually researched.

const UA = 'Mozilla/5.0 (compatible; LeadQualifier/1.0; +https://github.com/realaweayomide)'

/** Strip tags without pulling in a parser — we only need readable text and a few signals. */
function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const TOOLS = {
  /** Fetch a company's homepage and pull out what it says about itself. */
  async fetch_website({ url }) {
    if (!url) return { error: 'No url given' }
    const target = /^https?:\/\//.test(url) ? url : `https://${url}`
    try {
      const res = await fetch(target, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(15000) })
      if (!res.ok) return { error: `HTTP ${res.status}`, url: target }
      const html = await res.text()
      const text = textOf(html)
      const title = (html.match(/<title[^>]*>([^<]{2,160})<\/title>/i) || [])[1]?.trim() || ''
      const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{10,300})/i) || [])[1]?.trim() || ''
      const headings = [...html.matchAll(/<h[12][^>]*>([^<]{3,120})<\/h[12]>/gi)].map((m) => m[1].trim()).slice(0, 10)
      return {
        url: target,
        title,
        description: desc,
        headings,
        excerpt: text.slice(0, 1800),
        reachable: true,
      }
    } catch (err) {
      return { error: err.name === 'TimeoutError' ? 'Site timed out' : err.message, url: target, reachable: false }
    }
  },

  /** Look for concrete signals on the site rather than guessing from the name. */
  async find_signals({ url }) {
    const page = await TOOLS.fetch_website({ url })
    if (page.error) return { error: page.error }
    const hay = `${page.title} ${page.description} ${page.excerpt} ${page.headings.join(' ')}`.toLowerCase()

    const has = (...words) => words.filter((w) => hay.includes(w))
    return {
      url: page.url,
      hiring: hay.includes('careers') || hay.includes('we are hiring') || hay.includes("we're hiring"),
      sells_to: has('enterprise', 'small business', 'smb', 'startups', 'agencies', 'teams'),
      mentions_automation: has('automation', 'workflow', 'integrate', 'api', 'crm', 'ai'),
      tooling: has('hubspot', 'salesforce', 'zapier', 'shopify', 'stripe', 'notion', 'slack', 'gohighlevel'),
      ecommerce: has('add to cart', 'shop now', 'checkout'),
      size_hint:
        hay.includes('fortune 500') ? 'large'
        : has('enterprise').length ? 'mid-to-large'
        : has('freelance', 'solo', 'one-person').length ? 'very small'
        : 'unknown',
    }
  },
}

export const TOOL_SCHEMA = [
  {
    type: 'function',
    function: {
      name: 'fetch_website',
      description: "Fetch a company's website and return its title, description, headings and page text.",
      parameters: { type: 'object', properties: { url: { type: 'string', description: 'Domain or full URL' } }, required: ['url'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_signals',
      description: 'Check a company website for buying signals: hiring, who they sell to, tooling, automation mentions, rough size.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  },
]
