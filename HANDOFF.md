# HANDOFF — read this first

You're picking up **Dibs**, a Chrome extension that drafts Facebook Marketplace
listings and then handles the buyer conversations. This document is written for
whoever continues the work, human or model. It covers what exists, what was
decided and why, what's verified, and what isn't.

---

## Current state in one line

Phases 1 through 5 are built and tested. **Nothing has ever run against real
Facebook.** Everything else has 199 passing assertions against the real modules.

---

## What the thing is

The owner sells items on Facebook Marketplace and gets 3–4 buyer messages a day,
mostly "is this still available?" and lowball offers. Dibs drafts the listing,
then triages and answers the buyers, escalating only when it matters.

Two Facebook accounts share one install (his and his girlfriend's). She is not
technical and is the reason Simple Mode exists: one panel, a stack of cards,
four buttons, no settings visible.

**The stated goal, in his words:** minimise his involvement until he has to
choose between two interested people, or Dibs isn't sure what to do.

---

## Architecture

    sidepanel.html/.css/.js   Four tabs: Compose, Queue, Listings, Tune
    queue-ui.js               Queue cards, trust dials, test bench
    composer.js               Comps analysis, pricing maths, copy generation
    agent.js                  Decision engine: playbooks, guardrails, scoring
    llm.js                    Three-tier router (templates / Nano / cloud)
    scan.js                   Reads open thread -> decide() -> queue
    messenger.js              Content script: reads threads, types replies
    comps.js                  Content script: reads Marketplace search results
    queue.js                  Pending items, shadow timers, graduation stats
    storage.js                Settings, listings, thread state, usage metering
    reputation.js             Buyer memory, shared across both accounts
    scheduler.js              Windows-first scheduling, optional Google Calendar
    ledger.js                 Sold-price history, listing diagnosis
    notify.js                 Desktop / ntfy / Telegram / Discord push
    background.js             Alarms: reader check, scan, shadow release, digest
    diagnose.js               Paste-into-DevTools selector diagnostic
    test/                     199 assertions against the real modules

---

## Decisions that shouldn't be quietly reversed

Each of these was argued through. If you change one, change it deliberately.

**List above target.** The user enters what they want to net; the tool derives
the listed price at +15–20% and psych-rounds it ($89, not $90). A buyer who
negotiates down to the target feels they won and the seller gets their number.

**Never answer "is this still available?" with "yes."** People tap that
reflexively while scrolling. The reply asks when they can pick up, which costs
the buyer something and filters tyre-kickers for free.

**Every first offer gets a counter, however low.** Replying costs the agent
nothing and a high anchor keeps them in play. Only a *second* offer that hasn't
moved gets cold-offed. This replaced an earlier ignore-below-threshold design at
the owner's request.

**The floor decays with listing age**, not with negotiation. Day 0–3 firm,
4–9 moderate, 10+ loosest. A parked $60 that failed on day 2 can clear on day 12
with no user action.

**Parked buyers ("considered bucket").** An offer that climbed but is still
under today's floor gets no reply for a few days, deliberately, to let other
offers surface. Re-checked daily by arithmetic. The first time a re-engagement
fires it goes to the human.

**Four playbooks never graduate to autonomy:** `red_flag`, `unknown`,
`considered_reengage`, `buyer_selection`. `agent.js` enforces this structurally
via `PLAYBOOKS[x].graduatable`, not by configuration — forcing `red_flag: auto`
into storage is ignored, and there's a test for that.

**Factual answers come only from stated item facts.** If the facts don't cover
the question, escalate. This is deliberately stricter than Meta's own auto-reply,
whose failure mode is promising things the seller doesn't offer.

**Tier-0 first, always.** Most messages never touch a model: availability pings,
anything with a price in it, floor arithmetic, parked-buyer re-checks, scheduling
maths. Measured at 86% of a realistic message mix. Don't "simplify" this by
routing everything to the cloud.

**Calendar is optional and off.** Scheduling works from typed day/time windows
alone and labels its suggestions as unchecked. Don't make Google a dependency.

**No email-to-SMS.** The carrier gateways are dead (T-Mobile ~Dec 2024, AT&T
June 2025, Verizon winding down to a March 2027 cutoff) and they fail *silently*.
ntfy is the free replacement.

---

## The reader, and why it's built the way it is

`messenger.js` is the riskiest file. Misattributing who sent what means
countering your own offer. Five defences, strongest first:

1. **Self-authorship ledger** — every sent message is recorded; a DOM match is
   definitive, not inferred.
2. **Multi-signal voting** — ledger, `You sent` aria, named-sender aria, test
   ids, avatar present, avatar *absent* (only in threads that use avatars), and
   bubble geometry in pixels. Must win by a margin, or the row is `unknown`.
3. **Canary** — before autonomous sending, Dibs must find its own last message.
   If it can't, autonomy halts globally and the user is alerted.
4. **Send preconditions** — thread id, buyer name, listing ref, last message
   must be the buyer's, composer empty and belonging to this thread, no
   near-duplicate within 30 minutes.
5. **Post-send verification** — the text must reappear attributed to us, else
   it reports `sent_unverified` rather than success.

Under 70% confident attribution, the whole read is rejected. **The failure mode
is silence, never a wrong message.** Preserve that property.

---

## Bugs already found and fixed — don't reintroduce them

Listed because several were subtle and a rewrite could bring them back.

| Bug | Why it mattered |
|---|---|
| `decide()` was never called — no scan loop existed | The app did nothing at all |
| Offer history included the offer being decided on | Every *first* offer looked like a stalled second offer and got cold-offed |
| `thread.score` never computed | Two-buyer escalation, the most important stop, never fired |
| `provenPlaybooks` never written | Auto mode was permanently unreachable |
| `listing.floorNow` never written | The under-floor guardrail silently passed everything |
| `dailySendCap` defined but never enforced | A claimed safety guard that didn't exist |
| `replyDelay` computed then discarded | Auto mode would have replied in under a second |
| `"how about 60"` / `"130 final"` / `"70 cash"` unparsed | Common offer phrasings read as no offer |
| Underpriced check sat below a `days < 3` guard | The signal only appears in the first 48h, so it could never fire |
| Linking a listing with no draft | Decisions ran against `undefined` prices |

**A lesson worth inheriting:** the first two rounds of testing reimplemented the
logic inside the test file instead of importing the real modules. Tests were
green while the app was broken. `test/` now loads the shipped files against a
mocked `chrome` and a hand-built DOM. Keep it that way.

---

## Verified vs. not

**Verified** (199 assertions, `node test/run-real.mjs` etc.): storage, the scan
loop, the full negotiation arc, red-flag handling, the two-buyer escalation,
graduation and demotion, every guardrail, quiet hours across timezones, the
scheduler with and without a calendar, ledger diagnosis, reputation, notification
routing, offer parsing, and `messenger.js` against a DOM shim including
adversarial markup.

**Not verified:** the real Facebook DOM. Every selector in `messenger.js` and
`comps.js` is an educated guess. `diagnose.js` exists to close this gap — the
user pastes it into DevTools on a real thread and it reports which selectors
matched, which signals fired, and the resulting health score, redacting names
and message text.

Also unverified: the Anthropic API call in a real extension context, Chrome's
built-in Gemini Nano path, and Google Calendar OAuth (needs a client ID in
`manifest.json`).

---

## Immediate next steps

1. Run `diagnose.js` on a real Marketplace thread; fix the selectors in
   `messenger.js` from its output. **This is the blocker.**
2. Draft and post one real listing with the Composer — zero risk, it only
   produces text.
3. Link the listing, leave everything on manual, let cards accumulate for a week.
4. Only then consider moving one playbook to shadow.

**Known blocker for the owner:** his primary machine has an enterprise Chrome
policy preventing extension installs (`chrome://policy` will show which one). A
standalone HTML version of the Composer was discussed as a no-install
alternative and has not been built.

---

## Working agreements

- Everything ships on manual. Autonomy is earned per playbook, never assumed.
- If Dibs isn't sure, it asks. Silence beats a wrong message.
- Never write a test that reimplements the logic it's testing.
- This violates Facebook's terms of service regardless of how carefully it's
  built. The mitigation is keeping a human in the send loop, which is why
  suggest-then-approve is the default and four playbooks never graduate.
