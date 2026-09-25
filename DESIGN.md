# Dibs — Build Plan v3
*(working name — alternatives at the bottom)*

**Core goal:** Reduce your involvement to two moments — (1) choosing between two+ serious buyers, and (2) anything the agent isn't confident about. Everything else runs itself.

**Design principles**
1. The agent's default when unsure is *ask*, never guess.
2. Your girlfriend should be able to use it without ever opening a settings screen.
3. One codebase, two machines (Mac + PC), you push improvements and both update themselves.
4. Every price decision is a function of three variables: **how long it's been listed**, **how much interest exists right now**, and **buyer quality** — never a static number.

---

## PART 0 — Listing Composer (where every sale starts)

The workflow starts *in the tool*, not on Facebook. You draft here, then copy-paste into Marketplace and add photos there.

### 0.1 The flow

1. **You describe the item** — free text or voice is fine ("Herman Miller Aeron, size B, black, bought 2019, one worn armrest pad, works fine"). Optionally drop in photos for reference; the tool doesn't upload them, it just uses them to write better copy and spot flaws worth disclosing.
2. **Tool runs comps** (§0.2) and comes back with a recommended target, list price, and the reasoning.
3. **Tool drafts the listing** — title, description, category, condition (§0.3).
4. **You edit inline** until you're happy. Tone slider (plain / friendly / detailed), length control.
5. **Copy blocks** — separate one-tap copy buttons for **Title**, **Price**, **Description**, so each pastes cleanly into its own Marketplace field. No reformatting, no hunting through a blob of text.
6. **Photo shot-list** — tool tells you exactly which shots to take for this item type before you post (§0.4).
7. **You post on Facebook**, add photos, hit publish.
8. **You paste the live listing URL back in** — and this is the important part: **the Listing Profile auto-populates from the draft.** Target, list, floor curve, item facts, and firm no's are all already known because you drafted it here. No second data-entry step. The negotiation agent goes live the moment you paste the URL.

That last step is the whole reason drafting belongs in the tool: it eliminates the only tedious part of v1's design.

### 0.2 Comps research — use the browser you're already in

Novel advantage here: the extension is already running in a browser logged into Facebook. So rather than relying on general web pricing data, it can **open a Marketplace search tab for the item in your actual radius and read the local asking prices straight off the results page.** That's the most relevant comp set that exists for you — same platform, same metro, same moment.

What it should return:

- 5–10 local comparables with asking price, condition, and how long each has been listed.
- The spread (low / median / high), and a flag on any listing that's clearly stale — a $400 desk sitting for six weeks is not a comp, it's a warning.
- **Original retail price** (web lookup) — needed for anchoring in the description.
- A second opinion from broader sold-price data where available (eBay sold listings are useful for anything brandable and shippable, even though you're selling locally).

**Important caveat the tool should state on screen:** Marketplace shows *asking* prices, not *sold* prices. Active listings skew high because the overpriced ones are the ones still sitting there. The recommendation should lean on the median of *recently posted* comps and treat long-sitting listings as evidence of overpricing.

**Then it recommends:**
- **Target** = realistic local market rate for the condition.
- **List price** = target +15–20%, psych-rounded ($89, not $90) so there's negotiating room built in.
- **Floor** = a % of target, with the day-0–3 / 4–9 / 10+ decay curve pre-filled.
- **Confidence level** — "8 close comps, tight spread, confident" vs. "2 loose comps, wide spread, this is a guess." Say so honestly rather than projecting false precision.
- **A speed-vs-price choice**: one tap to switch between "maximize price" (list high, expect 1–3 weeks) and "sell fast" (15–20% below market, days). Different item, different mood, different answer — and the choice should propagate to the floor curve automatically.

### 0.3 Copy generation

**Title:** brand + model + key spec + condition. The algorithm surfaces visually but search is text-based, so the title needs the words a buyer would actually type. No "moving sale!!" filler.

**Description template it should follow:**
- One-line what-it-is, with the specifics a buyer needs to not message you (dimensions, size, capacity, model year).
- **Retail anchor** — "Retail $250, asking $95." Pure anchoring, and it works.
- Condition, honestly, including flaws. Disclosing the scuff up front costs you nothing and prevents a haggle ambush at the handoff.
- What's included (cables, case, chairs, manual).
- Terms: local pickup, cash, firm or OBO. **Stating your negotiation posture in the listing reduces lowball volume before it starts** — "price is firm" genuinely thins the $30-offer crowd.
- Why you're selling. One line, builds trust, costs nothing.

**Category:** most specific subcategory available — miscategorized items don't appear in filtered searches at all.

**Timing nudge:** if it's Tuesday afternoon, the tool should say so — evening posts outperform daytime, and Thursday around 8:30 PM is the commonly cited peak because it lets buyers plan weekend pickup. It should offer to hold the draft and remind you.

### 0.4 Photo shot-list

Generated per item type, since the right shots for a couch aren't the right shots for a laptop. Standard core: all sides, a straight-on hero shot, close-up of every flaw you mentioned, accessories laid out, and something for scale. Natural daylight, clean background.

This matters more than the copy does — well-lit multi-photo listings reportedly sell around 3x faster than single-photo ones, and daylight shots draw substantially more inquiries than dim or cluttered ones. The tool should refuse to mark a draft "ready" until you've confirmed you have at least 6.

### 0.5 Relist support

When the floor curve hits day 10 and the agent recommends a relist, the Composer **re-drafts** rather than just telling you to lower the price: new title angle, new lead photo suggestion from your shot list, adjusted price. A relist with the same tired copy gets the same tired result.

---

## PART 1 — Selling Strategy (the money layer)

The agent shouldn't just respond well — it should sell well.

### 1.1 Pricing: you're probably listing too low

The standard guidance is to **anchor above your target**: if you want $70, list at $85. A buyer who offers $70–75 feels like they won the negotiation while you still hit your number. Industry advice is to set an OBO price about 10–15% above your target, and that used items typically move at 10–30% below new price depending on demand.

So restructure the Listing Profile around **target-first, not list-first**:

- You enter **what you actually want to net** (your target).
- The tool *calculates* the list price: target × 1.15–1.20, rounded to a psychological number. Pricing just below a round number ($49 instead of $50) is standard advice because it increases perceived value and click-through.
- Your floor is expressed as a **percentage of target**, not a dollar figure, so it scales across items automatically.

**On your $75 example:** I can't tell you whether that's high or low without knowing the item — that's the one input you haven't given me. But the method the tool should use (and should walk you through before you post):
1. Search 5 local comparables for the same item, note the spread.
2. Note the *original retail* price — worth putting in the listing itself. "Retail $250, asking $95" makes your price read as a bargain through pure anchoring.
3. Set target at market rate, list 15–20% above it.
4. If you want speed over price, 15–20% *below* average market is the fast-sale lever — but that's a deliberate choice, not a default.

Tell me the actual item, condition, and your metro area and I'll run comps and give you a real number.

### 1.2 Listing quality (agent-assisted, pre-post checklist)

Since you post manually, the tool should give you a quick pre-flight checklist rather than doing nothing until messages arrive:

- **Photos:** 6+ shots, all sides, close-ups of every flaw, accessories included. Natural daylight. Listings with 3+ clear well-lit photos reportedly sell ~3x faster than single-photo ones, and daylight shots draw substantially more inquiries than dim or cluttered ones. This is the single highest-leverage thing you control.
- **Title:** the algorithm is visual but search is text-based — brand + model + key spec, not "nice desk."
- **Category:** most specific subcategory available; miscategorized items don't show up in filtered searches.
- **Timing:** evening posts outperform daytime; Thursday around 8:30 PM is the commonly cited sweet spot since it gives buyers time to plan weekend pickup. The first 60–120 minutes after posting are the critical window for algorithmic pickup — which is exactly when fast replies matter most, and exactly what the agent is for.
- **Terms stated up front:** "local pickup, cash only, price firm/OBO." Stating your negotiation posture in the listing reduces lowball volume before it starts.

### 1.3 Strategic defaults I'd bake in

- **No shipping, ever.** Seller protection on shipped Marketplace items is weak — a "not as described" claim can get the buyer refunded without requiring a return. Local cash only. This also kills an entire scam category. Make it a hard rule the agent enforces.
- **Refresh cadence:** small edits every ~48 hours (change a word, nudge price $1–2) retrigger the algorithm; full relist every 7–10 days. **The agent should handle these reminders and pair them with the floor curve** — a relist is the natural moment to actually lower the price, and the tool should prompt you: "day 10, 40 views, no credible offers — drop list from $85 to $79 and relist?"
- **Don't pay to boost.** Reported experience is that boosting buys views, not messages. If photos and price are right, organic reach is enough.
- **Bundling as a counter-tool.** Instead of dropping price, add value: "I'll throw in the cables/case at $75." This preserves your number while letting the buyer feel they won. Give the agent a per-listing list of sweeteners it's allowed to offer *before* it's allowed to cut price.

### 1.4 The "is this still available?" insight

This is your highest-volume message and the standard reply is wrong. Experienced sellers don't answer "yes" — people tap that button reflexively while scrolling, so "yes" gets you a dead thread. **Reply with a question that costs the buyer something to answer.** Default script:

> "Yep, still available — when were you thinking you could pick it up?"

This filters instantly: real buyers name a time, tire-kickers vanish, and you've spent zero effort either way. This should be the agent's default for playbook A, not a bare confirmation.

---

## PART 2 — Accounts, Hosting & Distribution

### 2.1 Answer to your hosting question: publish it "Unlisted" on the Chrome Web Store

This is the clean solution to "one version, two computers, I push changes."

- **Unlisted** publishing means there's no public store listing and no search visibility — only someone with the direct URL can install it. You install from that URL on your Mac, she installs from the same URL on her PC.
- Chrome periodically checks for new versions of installed extensions and **updates them automatically without user intervention**. So you bump the version, upload, and her laptop picks it up on its own. She never has to do anything technical, ever.
- Auto-update checks run roughly every 5–6 hours, and store-side propagation can lag — sometimes up to a day or two. If you need a change *now*, `chrome://extensions` → developer mode → "Update extensions now" forces it.
- Cross-platform is free: same extension, Chrome on macOS and Chrome on Windows.

**Caveats worth knowing going in:**
- Unlisted still goes through the same review process and policy requirements as a public listing. Review can take a while, and you'll need to justify permissions and provide privacy details. Extensions in this exact category do exist on the store, so it's passable — but expect a review cycle on your first submission.
- "Private" (trusted-testers) publishing is the alternative if you'd rather it be locked to two named Google accounts instead of anyone-with-the-link.

**Dev loop:** keep `load unpacked` from a local git clone on your Mac for fast iteration, and only publish to Unlisted when you have something stable enough to push to her machine. That way you're not waiting on store review to test your own changes.

### 2.2 Settings sync — "shared brain, separate hands"

Extension code auto-updates, but *configuration* shouldn't live only in the code. Put shared config (playbook scripts, floor curves, red-flag patterns, approved meeting locations, buyer reputation history) in a small hosted store — Supabase/Firebase free tier, or even a private repo the extension reads from.

Then:
- You improve a script once; both installs use it immediately, no version bump needed.
- **Buyer reputation is shared across both accounts.** Someone who no-showed on her listing gets flagged when they message you. This is a genuinely novel advantage of running two accounts through one tool, and it's the kind of thing no commercial tool does.
- Each account keeps its own *listings* and its own message queue — shared brain, separate hands.

### 2.3 Two accounts, one tool

- Extension detects which account the current Facebook tab is logged into and scopes everything accordingly. No credential storage, no cross-account posting.
- Per-account settings: her trust level, her availability windows, her tone preference can differ from yours entirely.

---

## PART 3 — Listing Profile

**Mostly auto-filled from the Composer draft (§0.1 step 8).** You paste the live Marketplace URL and everything below is already populated — you're reviewing, not typing. Fields listed here for completeness and because they're all editable after the fact.

| Field | Notes |
|---|---|
| **Target price** | What you want to net. The tool derives list price from this. |
| **List price** | Auto-suggested at target +15–20%, psych-rounded. Editable. |
| **Floor as % of target** | e.g. 80% — scales automatically across items |
| **Floor curve** | Time-decay schedule, see §3.1 |
| **First-counter anchor** | Default: list price minus one small step |
| **Cold-off rule** | When a buyer's second offer hasn't materially moved |
| **Item facts** | Condition, dimensions, age, defects, why selling, what's included. The agent may only answer from this. |
| **Photo notes** (optional) | "photo 3 shows the scratch on the left panel" — lets it answer visual questions accurately instead of guessing |
| **Sweeteners** | Non-price concessions it can offer before cutting price (§1.3) |
| **Firm no's** | No shipping, no holds >48h, no meeting at buyer's address, etc. |
| **Urgency** | "Need this gone by Saturday" vs. "no rush" — shifts the whole floor curve aggressively |

**Presets:** save profiles as templates by item type (furniture / electronics / tools) so repeat listings are two taps. This is most of what makes it usable for a non-technical person.

### 3.1 Time-Decayed Floor

Your acceptable price on day 1 isn't your acceptable price on day 14, so the floor is a curve, not a number.

| Days listed | Behavior |
|---|---|
| 0–3 | Firm. Floor near target. Hold the line — early interest is the most valuable signal you have. |
| 4–9 | Eases moderately. Agent will trade toward the middle to keep momentum. |
| 10+ | Eases toward true bottom-line. Pair with a relist + list-price drop (§1.3). |

The agent always negotiates against *today's* floor. A $60 offer that failed on day 2 can clear on day 12 with no action from you.

### 3.2 Interest-Adjusted Overlay

The floor curve is modified by live demand:

- **0–1 credible buyers:** hold nearer the floor's easier end. Don't be proud with no leverage.
- **2 credible buyers:** hold firm, let them compete.
- **3+ credible buyers:** you're underpriced. **Agent should tell you to raise the list price or hold at target**, not discount. Multiple simultaneously interested buyers is the signal to price *up*, and standard guidance agrees — low views with no offers after a week means drop, multiple interested buyers asking about the same listing means consider raising.

---

## PART 4 — Response Playbooks

Each is a separately editable script block so you can tune one without touching the others.

### A. "Is this still available?"
Commitment-forcing reply, not a bare "yes" (§1.4). If a sale is already pending, say so and offer to circle back if it falls through — keeps a backup warm.

### B. Offers & negotiation

No offer gets an instant decline — replying costs the agent nothing and a high anchor keeps them in play.

1. **First offer, any amount:** counter near list. Listed $75, offered $30 → counter $70. Fixed anchor regardless of how low they opened.
2. **Second offer, barely moved** ($35 after your $70): they've shown they won't move. **Cold-off — stop engaging.** They got one real chance.
3. **Second offer, meaningfully improved** ($60): **considered bucket.** Don't counter, don't accept. Deliberately delay reply for a few days to let other offers surface. Visible to you as "holding — considered," not silently ghosted.
4. **Revisiting considered buyers:** re-check against *today's* floor on a daily schedule. If the eased floor now clears their number and nothing better came in, re-engage. **First time this triggers on any listing, it surfaces to you for approval** before auto-running.
5. **At/above target:** accept-track → scheduling.
6. **Before ever cutting below floor:** try a sweetener (§1.3).

Net effect: every real buyer gets one legitimate counter, non-movers get dropped quietly, and plausible-middle buyers get parked rather than decided on in isolation.

### C. "Can I come see it?"
Straight into scheduling (Part 5). Never open-ended "when works for you" — always propose specific slots.

### D. Condition / how-it-works questions
Answered **only** from Item Facts. Not covered → escalate. This is deliberately stricter than Meta's own auto-reply, whose known failure mode is guessing and promising things you don't offer — and you don't find out until the buyer shows up expecting something different.

### E. Red flags → escalate, never auto-reply
Requests to ship or pay online; third-party payment links; overpayment offers; pushing to move off Messenger immediately; extreme urgency with no negotiation; brand-new accounts; stock-photo profiles. These are the textbook patterns and none of them should ever get an automated response.

### F. Ambiguous / anything else
Escalate. Low bar for "I'm not sure" early on.

---

## PART 5 — Meeting Coordination

Google Calendar API — fully legitimate, no gray zone here.

- **Availability windows** you set once: preferred days/times for handoffs.
- **Approved locations only.** Many police departments run designated safe exchange zones in well-lit lots — make one your default for anything valuable or any buyer without an established history. Home pickup only for items too big to move and only with your explicit per-deal approval.
- Agent finds open slots inside your windows, proposes 2–3 specific times, confirms, and creates the event with buyer name, item, and thread link in the notes.
- **No-show reduction:** auto-confirm the morning of. Unconfirmed by a set cutoff → agent flags it and can re-engage the runner-up from the considered bucket. No-shows are the biggest hidden time cost in Marketplace selling and almost nothing addresses them.
- Anything outside your windows or locations → drafted, not sent.

---

## PART 6 — Agent Strategy & Multi-Buyer Logic

- **Interest score per buyer,** updated per message: responsiveness, movement toward your price, whether they've asked to meet, specificity of questions (a detailed question about dimensions outranks ten "still available?"s).
- **Buyer reputation, cross-account and cross-listing:** repeat lowballers, past no-shows, past smooth buyers. Shared between both accounts (§2.2). A known-good repeat buyer can get a slightly better price automatically — that's a real relationship worth pricing in.
- **Never** reveal one buyer's offer to another. Track all offers in your view only.
- **The two-buyer trigger:** two buyers cross "serious" → **stop, escalate, side-by-side card**: names, offers, interest scores, reputation, flags, and a recommendation with reasoning. You decide.
- **Runner-up management:** the agent keeps the second-best warm ("still deciding, I'll follow up tomorrow") rather than declining them, until the winner actually shows up with cash.
- **Timeout/decay:** one automated follow-up after a quiet period, then cooled. No repeated pinging.
- **Considered bucket** re-checked daily against the current floor, independent of buyer activity.

---

## PART 7 — Controls, UX & Graduating to Auto

### 7.0 Platform hygiene

Rules to bake in as non-negotiable defaults, not settings. These keep the tool's behavior indistinguishable from yours because, in approve mode, it *is* yours:

- **Tab-open only.** No background service worker acting on Messenger while the browser's closed. No stored session tokens, no headless fallback, ever.
- **Human-paced replies.** Randomized 2–15 minute delay, with natural variance rather than a fixed offset. Instant replies read as botlike to buyers as much as to Facebook. Keep it short enough to preserve the fast-response advantage.
- **Volume ceiling.** Hard cap on messages sent per hour and per day, well above your real volume (3–4/day) so it never trips — but it means a bug can't fire 200 messages.
- **Quiet hours.** No sends between, say, 11pm and 7am. You wouldn't be messaging buyers at 3am, and nothing good comes of looking like you would.
- **No bulk anything.** One reply per thread per cycle. No mass-messaging, no scraping beyond the comps lookup you'd do by hand anyway, no auto-posting listings.
- **Rate-limit the comps scrape** too — a handful of searches when you draft a listing, not continuous polling.
- **Fail closed.** If the DOM changed and the script isn't confident it's reading the right thread, it stops and queues for you. Never guess at where to type.

None of this is a guarantee. It's a ToS violation regardless of how politely it's done, and the real mitigation is keeping a human in the send loop.

### 7.1 Two-mode interface

**Simple Mode** (her default, and yours at first) — one panel, one job. A stack of cards:

> **Sarah M.** · Dining table · $85 · day 4
> *"Would you take $60?"*
> ┌ Suggested reply ─────────────┐
> │ I could do $75 — it's in great │
> │ shape and the chairs are       │
> │ included.                      │
> └────────────────────────────────┘
> [ Send ]  [ Edit ]  [ Skip ]  [ I'll take this one ]

No settings, no jargon, badge count on the extension icon. That's the whole interface.

**Advanced Mode** — everything else, behind one toggle.

### 7.2 Layout

Use Chrome's **side panel**, not a popup — a popup closes the moment you click away, which is fatal for a queue you're working through. Three tabs:

**Queue** — the card stack above. Keyboard-driven: `Enter` send, `E` edit, `S` skip, `↓` next. With 3–4 messages a day you should be able to clear the whole queue in under 30 seconds without touching the mouse.

**Listings** — one row per active item: photo thumb, list price, day counter, an **interest thermometer** (how many credible buyers right now), best current offer, and today's floor. At a glance you know which listings are hot, cold, or need a relist. Row expands to the full profile.

**Tune** — playbook cards and trust dials (§7.3).

**Visual language:** one accent color, status conveyed by subtle background tint rather than a rainbow of badges. Dark mode. Money always formatted consistently. Day-counter and floor shown together everywhere a price appears, since they're meaningless apart.

**The gap worth naming:** this is a desktop extension, but you're not at your desk all day. Add a **push-out channel** — digest and urgent escalations to email, Telegram, or SMS — so "two buyers are competing, pick one" reaches you in 5 minutes instead of whenever you next open Chrome. Read-only notifications, with actions still happening in the panel.

### 7.3 The trust dial — how you'll actually graduate to auto

Not one global switch. **Every playbook gets a three-position dial**, and the middle position is the one that matters:

| Position | Behavior |
|---|---|
| **Manual** | Drafts a reply, waits for your tap. Nothing sends without you. |
| **Shadow** | Auto-sends, but holds for N minutes (default 10) with a big **Cancel** button in the panel. You get the benefit of automation while retaining a veto. |
| **Auto** | Sends immediately, subject to the guardrails below. |

Shadow is the rung most tools skip and it's how you'll actually get comfortable. You'll flip things to Shadow long before you'd flip them to Auto, and most of the time you'll let the timer run out.

**Suggested graduation order**, which you'll likely discover anyway: availability replies → factual answers → first counters → follow-up counters. Red flags, ambiguous messages, considered-bucket re-engagement, and final buyer selection stay **Manual permanently** — there's no version of this where the machine picks between two buyers for you.

### 7.4 Earned trust — let the tool propose its own promotions

This is the part that makes graduation effortless. Track per playbook: **sent, approved unedited, edited, rejected.** Edit rate is your trust metric, and the tool watches it for you:

> **Availability replies** — 23 approved, 1 edited, 0 rejected over 9 days.
> You've barely touched these. Move to **Shadow**?  [ Yes ] [ Not yet ]

And symmetrically, **automatic demotion**: if you cancel two Shadow sends or flag two auto-sent replies as wrong, that playbook drops back a rung on its own and tells you why. Trust moves in both directions without you having to remember to adjust anything.

### 7.5 Guardrails that override the dial

Even at Auto, these bounce a message back to Manual:

- **Price ceiling on autonomy** — auto-negotiate freely under $50, always ask above $300. One slider, and probably the single most useful control in the tool.
- Confidence below your threshold.
- Message doesn't cleanly match any playbook.
- Buyer has a flag or bad history.
- Would take the price below today's floor.
- First time a new behavior fires on a listing (e.g. considered-bucket re-engagement) — always shows you once before it ever runs unsupervised.

### 7.6 Tweaking — turn edits into rules

Two features do all the work here:

**1. "Make this the rule."** When you edit a suggested reply, the panel shows a side-by-side diff of its draft vs. your version and offers one button: *make this the new rule.* Your edit becomes a few-shot example on that playbook immediately. Over a few weeks of normal use, it converges on your voice without you ever opening a prompt editor.

**2. Test bench.** Each playbook card has a box where you paste a sample buyer message and see exactly what it would reply — before saving. Change a rule, test it against three real messages from your history, then save. Playbooks are written in plain English ("counter near list on the first offer, never mention the floor, offer a sweetener before cutting price"), not code, so she can read them too.

Plus a **scenario replay**: re-run last week's real conversations against your edited playbooks and see what would have changed. Best way to build confidence before flipping anything to Auto.

### 7.7 Standing controls

- Master on/off per listing, per account.
- **Kill switch** — one click halts everything, everywhere, both accounts.
- **Time-boxed trials** — "try Auto for 48 hours," then it reverts to Shadow and asks how it went. Removes the fear from flipping a switch.
- **Daily digest** — every conversation, state, offers on the table, actions taken. Read it even once you trust it.
- Full exportable log per listing.
- Per-buyer "handle personally" override at any time.
- **Regret button** on every sent message: logs it as a negative example and counts toward auto-demotion.

### 7.8 Learning loop

Every diff between its draft and your edit becomes a labeled example on that playbook. Every regret flag becomes a negative one. After ~50 edits it sounds like you, with no retraining — just accumulated examples. This is the mechanism by which it learns how you like to work with people.

---

## PART 8 — Novel Additions I'd Push For

1. **Sold-price ledger.** Log every final sale: item, list price, target, actual, days-to-sell, number of inquiries. After 20 sales you have your *own* comps for your *own* metro, which beats any general pricing advice. Feed it back into list-price suggestions.
2. **"Am I underpriced?" alert.** 5+ inquiries in 24h → the agent tells you to raise the price, not discount. Most sellers miss this entirely.
3. **Stale-listing intervention.** Day 7, low views → photo/title problem. Low views but decent messages → price problem. Different diagnoses, different fixes, and the agent should say which.
4. **Bundle detector.** Two buyers interested in two of your listings → suggest offering a bundle to whichever is closer to committing.
5. **Scam-pattern library** that grows. When you manually flag something as a scam, the pattern goes into the shared config and protects both accounts going forward.
6. **Composer learns from outcomes.** Once the sold-price ledger has history, the Composer's price recommendations should weight your own realized sales above scraped comps — your actual results in your actual market beat anyone's general advice. Same for copy: titles and descriptions from listings that sold fast become the templates.
7. **Weekly performance readout.** Items sold, average % of target realized, average days-to-sell, how many hours you *didn't* spend messaging. This is how you'll know if the thing is actually working.

---

## PART 8.5 — Token Efficiency

The honest starting point: at 3–4 messages a day, your cloud spend is pennies a month no matter how carelessly this is built. So the goal isn't cost — it's **not calling a model when a model isn't needed**, which also makes the tool faster, more predictable, and easier to debug. Then if volume ever grows, the architecture already holds.

### 8.5.1 Most messages shouldn't touch an LLM at all

Route every incoming message through tiers, cheapest first. Only escalate when the tier below can't handle it.

**Tier 0 — pure code, zero tokens.** Handles the majority of your volume:
- "Is this still available?" and its ~20 variants → regex/fuzzy match → canned commitment-forcing reply with the listing's details interpolated. This is your single highest-volume message and it never needs a model.
- **Any message containing a dollar amount** → parse the number with a regex. The *decision* is then pure arithmetic: compare against today's floor curve, the first-counter anchor, and the cold-off rule. No inference required to know that $35 on a $75 item after a $70 counter means cold-off.
- The reply itself is a template with variables: `"I could do {counter} — {sweetener}."`
- Daily considered-bucket re-check: arithmetic against stored numbers. Zero tokens, runs forever for free.
- Scheduling slot math, no-show confirmations, relist reminders: all deterministic.

**Tier 1 — on-device, still free.** Chrome ships the Prompt API backed by Gemini Nano, which runs entirely on the user's machine with no API keys and no per-request billing. Use it for the cheap-and-fuzzy jobs where a regex is too brittle:
- Intent classification (availability / offer / question / scheduling / red flag / unknown).
- Sentiment and tone read for buyer scoring.
- Paraphrasing a canned reply so your twelve "still available?" responses aren't byte-identical — which is good for both buyer experience and platform hygiene.

Caveats worth designing around: Nano isn't tuned for factual accuracy, its context window is small, and it isn't available on every machine — so always implement a graceful cloud fallback and never rely on it for anything where being wrong costs money.

**Tier 2 — cloud model, the only thing you pay for.** Reserve for what actually needs judgment:
- Messages that don't match a playbook.
- Multi-part or unusual questions about the item.
- The two-buyer comparison card.
- The Composer's description writing (§0.3).

Realistically that's a handful of calls a week.

### 8.5.2 Make the calls you do make cheap

- **Cache the static prefix.** The listing's item facts, playbook rules, and your voice examples don't change between messages on the same listing. Put them in a cached prompt prefix — on a listing that gets 15 messages, you pay for that context once instead of fifteen times. Biggest single win available.
- **Never send raw transcripts.** Send compact state instead: `offers: [30, 35]`, `day: 4`, `floor_today: 62`, `buyer_score: 0.3`. A negotiation's entire relevant history is a handful of numbers, not a chat log.
- **Rolling summary** for the rare long thread — one summary line, updated, rather than accumulating turns.
- **Cap output.** These are two-sentence replies. Set a tight max token limit; there's no reason for the model to think out loud to say "I could do $75."
- **One call per decision.** Classify, decide, and phrase in a single structured call returning JSON, not three chained ones.
- **Debounce.** Buyer sends three messages in 90 seconds → wait, concatenate, respond once. Saves tokens and reads more human.
- **Dedupe.** Identical or near-identical message from the same buyer → reuse the prior reply, no call.

### 8.5.3 The Composer is where tokens *should* go

Don't optimize this one. It runs once per listing, it's the part that determines what you actually sell the thing for, and a good description is worth many multiples of the call's cost. Spend freely on pricing analysis and copy; save on "is this available."

Do keep the **comps parsing** token-free though — read the Marketplace results page structurally from the DOM, don't feed raw HTML to a model. That's the one place naive design would burn real money.

### 8.5.4 Visibility

- **Usage meter in the Tune tab**: calls this month, spend, and a breakdown by tier so you can see how much is being handled for free. The number should be boring, and if it isn't, something's misrouted.
- **Monthly budget cap** with a soft warning and a hard stop that falls back to Manual queueing rather than failing silently.
- **Per-listing cost** next to per-listing profit in the sold-price ledger. Tells you honestly whether the tool is earning its keep.



**Phase 1 — Listing Composer (local, Mac only)**
Ship this first — it's useful on day one with zero risk, since it touches nothing but a draft. Item input, Marketplace comps scrape, price recommendation, title/description generation, copy blocks, photo shot-list. Output is text you paste yourself. No Messenger interaction at all yet, so nothing here is in ToS gray area.

**Phase 1.5 — Messenger skeleton**
Content script reading/writing Messenger DOM on one account. Listing Profile auto-populated from Composer draft + pasted URL. LLM call → suggested reply → Simple Mode queue. No auto-send.

**Phase 2 — Strategy layer**
Playbooks A–F as separate editable blocks. Floor curve + interest overlay. Considered bucket. Interest scoring. Two-buyer escalation.

**Phase 3 — Multi-account + sync**
Hosted shared config. Account detection. Cross-account buyer reputation. Publish Unlisted to Chrome Web Store, install on her PC.

**Phase 4 — Calendar**
Google Calendar integration, approved locations/windows, morning-of confirmations, no-show → runner-up flow.

**Phase 5 — Trust + intelligence**
Trust dials, shadow mode, earned-trust promotion prompts, guardrails, test bench, scenario replay, digest, kill switch, push-out notifications. Sold-price ledger, underpriced alerts, stale-listing diagnosis, learning loop.

---

## Naming

**Dibs** — my pick. Marketplace-native (calling dibs is exactly what a buyer is doing), short, friendly, works as a verb in the UI: *"Sarah called dibs."* Easy for anyone to say out loud, and it doesn't sound like a bot or a growth-hacking tool, which matters if a buyer ever notices the name.

Runners-up:
- **Stoop** — the place you hand things off from. Warm, understated.
- **Firm** — pun on "price is firm." Confident, a little funny, very short.
- **Hondo** — from haggle/hondle. Sounds like a guy who negotiates for you, which is exactly what it is.
- **Tire Kicker** — self-aware and funny, but it names the problem rather than the product.

---

## Standing Risk Note

This still runs against Facebook's terms of service for automated platform interaction, even in tab-open extension form. Suggest-then-approve meaningfully reduces that exposure since a human reviews and sends each message — one more reason to graduate playbooks slowly rather than flipping everything to auto at once. Revisit this as you move toward auto-send.
