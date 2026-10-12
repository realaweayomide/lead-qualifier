// rules.js — scoring with no model involved.
//
// This runs when there's no API key, and it also runs *alongside* the agent as a sanity check.
// A rule-based score you can explain line by line is a useful thing to put next to a model's
// judgement: when they disagree sharply, that's worth a human looking at.

const FREE_EMAIL = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'proton.me', 'yandex.com']
const ROLE_PREFIX = ['info', 'admin', 'support', 'hello', 'contact', 'sales', 'noreply', 'no-reply', 'office']
const BUYING_WORDS = ['budget', 'quote', 'pricing', 'proposal', 'timeline', 'asap', 'urgent', 'start', 'hire', 'engage', 'project', 'help us', 'we need', 'looking for']
const TIMEWASTER_WORDS = ['free', 'student', 'school project', 'thesis', 'guest post', 'backlink', 'seo services', 'partnership opportunity', 'increase your ranking']

export function scoreByRules(lead, signals = null) {
  const reasons = [], concerns = []
  let score = 50

  const email = (lead.email || '').toLowerCase().trim()
  const domain = email.split('@')[1] || ''
  const local = email.split('@')[0] || ''
  const msg = (lead.message || '').toLowerCase()

  // --- email quality ---
  if (!email) { score -= 15; concerns.push('No email address given') }
  else if (FREE_EMAIL.includes(domain)) { score -= 12; concerns.push(`Personal email domain (${domain}) rather than a company one`) }
  else { score += 14; reasons.push(`Company email domain (${domain})`) }

  if (ROLE_PREFIX.some((p) => local === p || local.startsWith(p + '.'))) {
    score -= 6; concerns.push(`Role address (${local}@) — may not reach a decision maker`)
  }

  // --- what they actually said ---
  const buying = BUYING_WORDS.filter((w) => msg.includes(w))
  if (buying.length) { score += Math.min(18, buying.length * 6); reasons.push(`Message mentions ${buying.slice(0, 3).join(', ')}`) }

  const spam = TIMEWASTER_WORDS.filter((w) => msg.includes(w))
  if (spam.length) { score -= 25; concerns.push(`Message looks like outreach to us, not a lead (${spam[0]})`) }

  if (!msg) { score -= 8; concerns.push('No message — intent unclear') }
  else if (msg.length < 25) { score -= 5; concerns.push('Very short message') }
  else if (msg.length > 120) { score += 8; reasons.push('Wrote a detailed message') }

  if (!lead.company && !lead.website) { score -= 10; concerns.push('No company or website given') }

  // --- site signals, if we looked ---
  if (signals && !signals.error) {
    if (signals.mentions_automation?.length) { score += 12; reasons.push(`Site mentions ${signals.mentions_automation.slice(0, 3).join(', ')}`) }
    if (signals.tooling?.length) { score += 10; reasons.push(`Already uses ${signals.tooling.slice(0, 3).join(', ')}`) }
    if (signals.hiring) { score += 6; reasons.push('Actively hiring — usually means budget') }
    if (signals.size_hint === 'very small') { score -= 8; concerns.push('Looks like a very small operation') }
    if (signals.size_hint === 'large' || signals.size_hint === 'mid-to-large') { score += 8; reasons.push('Appears to be a larger business') }
  } else if (signals?.error) {
    concerns.push(`Could not read their website (${signals.error})`)
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const tier = score >= 75 ? 'hot' : score >= 55 ? 'warm' : score >= 35 ? 'cold' : 'disqualified'
  const route_to = tier === 'hot' ? 'founder' : tier === 'warm' ? 'sales' : tier === 'cold' ? 'nurture' : 'reject'

  return { score, tier, route_to, reasons, concerns }
}
