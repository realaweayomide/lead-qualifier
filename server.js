// lead-qualifier — inbound lead comes in, gets researched, scored, routed and announced.
import express from 'express'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { qualify, agentAvailable } from './src/agent.js'
import { scoreByRules } from './src/rules.js'
import { TOOLS } from './src/tools.js'

const app = express()
app.set('trust proxy', 1)
app.use(express.json({ limit: '64kb' }))
app.use(express.static('public'))

const ICP = process.env.ICP || `Small-to-mid sized businesses (5-200 staff) with manual, repetitive
sales or operations work. Good signs: they already use a CRM or tools like HubSpot, Shopify or
Slack; they mention automation, integrations or AI; they are hiring. Bad fits: students,
agencies pitching us services, backlink and SEO outreach, and one-person operations with no budget.`
const LEADS = 'leads.json'

// rate limit — the agent makes several model calls per lead, so this one actually matters
const hits = new Map()
function rateLimit(req, res, next) {
  const now = Date.now(), ip = req.ip || 'x'
  let r = hits.get(ip)
  if (!r || now > r.resetAt) { r = { n: 0, resetAt: now + 3600e3 }; hits.set(ip, r) }
  if (r.n >= 8) return res.status(429).json({ error: 'Rate limit: 8 leads per hour. The code is on GitHub if you want to run it yourself.' })
  r.n++; next()
}

function save(record) {
  const all = existsSync(LEADS) ? JSON.parse(readFileSync(LEADS, 'utf8')) : []
  all.push(record); writeFileSync(LEADS, JSON.stringify(all, null, 2))
}

async function notify(record) {
  const url = process.env.SLACK_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL
  const v = record.verdict
  const text = `*${v.tier.toUpperCase()}* lead (${v.score}/100) → ${v.route_to}\n` +
    `${record.lead.company || record.lead.email}\n${v.company_summary || ''}\n` +
    `Why: ${(v.reasons || []).slice(0, 3).join('; ')}`
  if (!url) return console.log('[lead] (no webhook set)\n' + text)
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(process.env.DISCORD_WEBHOOK_URL ? { content: text } : { text }) })
  } catch (e) { console.error('[lead] notify failed:', e.message) }
}

app.get('/api/status', (req, res) => res.json({ agent: agentAvailable(), icp: ICP.trim() }))

app.post('/api/qualify', rateLimit, async (req, res) => {
  const lead = req.body?.lead || req.body || {}
  if (!lead.email && !lead.website && !lead.company) {
    return res.status(400).json({ error: 'Give at least an email, company or website.' })
  }
  const site = lead.website || (lead.email || '').split('@')[1]
  try {
    // Always run the rules — they're free, instant, and a useful second opinion.
    const signals = site && !/gmail|yahoo|hotmail|outlook/.test(site) ? await TOOLS.find_signals({ url: site }) : null
    const rules = scoreByRules(lead, signals)

    let verdict = null, transcript = [], steps = 0, agentError = null
    if (agentAvailable()) {
      try { const out = await qualify(lead, ICP, () => {}); verdict = out.verdict; transcript = out.transcript; steps = out.steps }
      catch (e) { agentError = e.message }
    }

    const final = verdict || { ...rules, company_summary: null, suggested_opener: null, source: 'rules' }
    const disagreement = verdict ? Math.abs((verdict.score ?? 0) - rules.score) : 0
    const record = { at: new Date().toISOString(), lead, verdict: final, rules, transcript, steps, agentError, disagreement }
    save(record); notify(record)
    res.json(record)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/leads', (req, res) =>
  res.json(existsSync(LEADS) ? JSON.parse(readFileSync(LEADS, 'utf8')).slice(-20).reverse() : []))

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`lead-qualifier on http://localhost:${PORT}`)
  console.log(agentAvailable() ? '  mode: agent (researches the company, then scores)'
                               : '  mode: rules only (set LLM_API_KEY to enable the agent)')
})
