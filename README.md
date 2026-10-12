# Lead Qualifier

An inbound lead arrives. Before anyone looks at it, an agent reads the company's website, scores
the fit against your ideal customer, explains why, routes it, and tells the team.

**[▶ Live demo](#)** _(add your deployed URL)_ · built by [Ayomide Awe](https://github.com/realaweayomide)

## Try it

```bash
npm install
npm test      # rules engine tests, no network
npm start     # → http://localhost:3000
```

Runs with **no API key** — it falls back to an explainable rule-based score. Add a key and you
get the agent: it researches the company first, then scores with evidence.

## What an agent actually is

A model, a set of tools, and a loop that keeps going until the model stops asking for tools.
That's it. The interesting engineering is in the guardrails:

- **A hard cap on steps** (6). A confused model can otherwise loop forever burning money.
- **Tool results go back verbatim.** The model reasons over facts, not over its own summaries.
- **Every call is recorded.** The UI shows exactly which tools ran and what they found.
- **A schema'd final answer**, so the output feeds the next system instead of being prose.

The tools return *facts*, never opinions — `fetch_website` returns what the page says,
`find_signals` returns which specific signals were present. Weighing them is the model's job.
Keeping that line clean is what stops an agent confidently scoring a company it never read.

## It scores twice, on purpose

Every lead gets both an **agent verdict** and an **explainable rule-based score** — email domain
quality, role addresses, buying language, outreach-spam markers, site signals.

The rules are free, instant, and auditable line by line. When the two scores **disagree by more
than 20 points, the UI says so**. That disagreement is a signal worth a human's attention, and
you only get it by keeping a cheap deterministic baseline next to the clever thing.

## Routing

| Score | Tier | Goes to |
|---|---|---|
| 75+ | hot | founder |
| 55–74 | warm | sales |
| 35–54 | cold | nurture |
| under 35 | disqualified | reject |

Set `SLACK_WEBHOOK_URL` or `DISCORD_WEBHOOK_URL` and qualified leads are announced automatically.

## Configure

```
LLM_API_KEY=...                  # optional — enables the agent
ICP=...                          # who you actually want. Shapes the agent's judgement.
SLACK_WEBHOOK_URL=...            # optional
```

`POST /api/qualify` with `{ name, email, company, website, message }` — wire your form straight
at it.

## What I'd change for production

- **Leads append to a JSON file.** Fine for a demo, wrong for a pipeline — this belongs in a
  database with the CRM record id attached.
- **One website fetch per lead.** Real qualification would check LinkedIn, funding data and
  tech-stack detection, each as another tool.
- **No caching.** The same domain gets re-fetched every time.
- **The ICP is a prompt**, not a scoring model. It should be tuned against leads that actually
  closed.

## License

MIT
