import { scoreByRules } from './src/rules.js'
let fails = 0
const check = (n, c, d='') => { console.log((c?'  PASS  ':'  FAIL  ')+n+(d?'  → '+d:'')); if(!c) fails++ }

const good = scoreByRules({ email:'ops@northwind.co', company:'Northwind', message:'We need help automating our order process. What is your pricing and timeline? We want to start this quarter.' },
  { mentions_automation:['automation','crm'], tooling:['hubspot'], hiring:true, size_hint:'mid-to-large' })
check('strong lead scores hot', good.tier === 'hot', good.score + '/100 ' + good.tier)
check('cites real evidence', good.reasons.length >= 3, good.reasons.length + ' reasons')

const spam = scoreByRules({ email:'info@seoboost.ru', message:'We offer guest post and backlink seo services to increase your ranking' })
check('outreach spam is disqualified', spam.tier === 'disqualified', spam.score + '/100 ' + spam.tier)

const weak = scoreByRules({ email:'someone@gmail.com', message:'hi' })
check('vague freemail lead scores low', weak.score < 45, weak.score + '/100')
check('explains the downgrade', weak.concerns.length >= 2, weak.concerns.join(' | ').slice(0,70))

const noSite = scoreByRules({ email:'ceo@acme.io', message:'We want a quote for automating invoices' }, { error:'Site timed out' })
check('unreachable site is a concern, not a crash', noSite.concerns.some(c=>/website/i.test(c)))
check('score stays in range 0-100', [good,spam,weak,noSite].every(r=>r.score>=0&&r.score<=100))
check('routing follows tier', good.route_to==='founder' && spam.route_to==='reject')

console.log('\n  ' + (fails ? fails+' FAILED' : 'all passed')); process.exit(fails)
