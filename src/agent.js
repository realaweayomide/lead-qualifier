// agent.js — the tool loop.
//
// This is all an "AI agent" actually is: a model, a set of tools, and a loop that keeps going
// until the model stops asking for tools. Everything else is plumbing. The interesting
// engineering is in the guardrails:
//
//   • a hard cap on iterations, so a confused model can't loop forever burning money
//   • every tool result fed back verbatim, so the model reasons over facts not summaries
//   • a transcript of what it actually did, so a human can audit the decision
//   • a schema'd final answer, so the output is usable by the next system, not prose

import { TOOLS, TOOL_SCHEMA } from './tools.js'

const API_KEY = process.env.LLM_API_KEY
const BASE_URL = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
const MODEL = process.env.LLM_MODEL || 'gpt-4o-mini'
const MAX_STEPS = 6

export const agentAvailable = () => Boolean(API_KEY)

const systemPrompt = (icp) => `You qualify inbound sales leads.

The ideal customer looks like this:
${icp}

Process:
1. Research the lead's company using your tools before judging anything. Always look at the website.
2. Base every statement on what the tools returned. If the site is unreachable, say so and score
   on what you have — never invent details about a company you could not read.
3. Then return your verdict.

When you are done researching, reply with ONLY a JSON object:
{
  "company_summary": "1-2 sentences on what they actually do, from the site",
  "score": 0-100,
  "tier": "hot" | "warm" | "cold" | "disqualified",
  "reasons": ["specific evidence-based reasons, citing what you found"],
  "concerns": ["anything that counts against them, or that you could not verify"],
  "route_to": "founder" | "sales" | "nurture" | "reject",
  "suggested_opener": "one sentence a human could actually send, referencing something real"
}`

export async function qualify(lead, icp, onStep = () => {}) {
  if (!API_KEY) return null

  const messages = [
    { role: 'system', content: systemPrompt(icp) },
    { role: 'user', content:
      `New inbound lead:\n` +
      `Name: ${lead.name || '(not given)'}\n` +
      `Email: ${lead.email || '(not given)'}\n` +
      `Company: ${lead.company || '(not given)'}\n` +
      `Website: ${lead.website || '(not given)'}\n` +
      `Message: ${lead.message || '(none)'}` },
  ]

  const transcript = []

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, temperature: 0.2, messages, tools: TOOL_SCHEMA }),
    })
    if (!res.ok) throw new Error(`Model returned ${res.status}`)

    const msg = (await res.json()).choices?.[0]?.message
    if (!msg) throw new Error('Empty response from model')
    messages.push(msg)

    const calls = msg.tool_calls || []
    if (!calls.length) {
      // No more tools wanted — this should be the verdict.
      const raw = (msg.content || '').replace(/```json|```/g, '').trim()
      let verdict
      try { verdict = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)) }
      catch { throw new Error('Agent finished without usable JSON') }
      return { verdict, transcript, steps: step + 1 }
    }

    for (const call of calls) {
      const name = call.function?.name
      let args = {}
      try { args = JSON.parse(call.function?.arguments || '{}') } catch {}
      const fn = TOOLS[name]
      const result = fn ? await fn(args) : { error: `No such tool: ${name}` }

      transcript.push({ step: step + 1, tool: name, args, summary: summarise(name, result) })
      onStep(transcript[transcript.length - 1])

      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 6000) })
    }
  }

  throw new Error(`Agent used all ${MAX_STEPS} steps without reaching a verdict`)
}

/** Short human-readable note for the audit trail — the raw result goes back to the model. */
function summarise(tool, r) {
  if (r?.error) return `failed: ${r.error}`
  if (tool === 'fetch_website') return `read ${r.url} — "${(r.title || '').slice(0, 60)}"`
  if (tool === 'find_signals') {
    const on = Object.entries(r).filter(([k, v]) => v === true || (Array.isArray(v) && v.length)).map(([k]) => k)
    return on.length ? `signals: ${on.join(', ')}` : 'no strong signals found'
  }
  return 'done'
}
