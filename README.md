# Dibs

Draft, price, and post Marketplace listings — then let Dibs handle the buyers.

## Install

Same steps on the Mac and the PC:

1. `chrome://extensions` → turn on **Developer mode**
2. **Load unpacked** → pick this folder
3. Click the Dibs icon to open the side panel
4. **Tune** tab → paste an Anthropic API key → Save settings

When you're done hand-installing on her laptop, publish it **Unlisted** to the
Chrome Web Store and install from that URL instead. Chrome then auto-updates
both machines on its own and she never touches anything technical again.

Nothing else is required. Calendar and phone alerts are both optional and both
off to begin with.

## Before autonomy: the reading check

Dibs will not send anything on its own until it has proven it can tell your
messages from the buyer's. Open any buyer thread in Messenger, go to **Tune →
Check the reading**, and it shows you its guess about the last message. You
confirm or correct it. That's the whole calibration.

If it gets it wrong, or if it later loses track, autonomy switches off globally
and everything queues for you by hand. A banner appears at the top of the Queue
saying so. This is the most important safety property in the tool: a misread
thread means countering your own offer, so being unable to read is treated as
more serious than being unable to reply.

## The four tabs

**Compose** — describe the item, hit *Check local prices*. Dibs opens a
background Marketplace search in your area, reads local asking prices off the
results page, trims the tails, and gives you three numbers: list price (set
above your target on purpose), target, and today's floor. Then *Write the
listing* produces a title and description with per-field copy buttons, plus a
photo shot list. Post it on Facebook yourself and add photos there.

**Queue** — a stack of cards, one per buyer who needs a reply. Clear it from
the keyboard: `Enter` sends, `E` edits, `S` skips, `X` stops a shadow send.
This is the only tab she needs.

**Listings** — paste the live Marketplace link and your prices, floor, and item
facts carry straight over from the draft. Each row shows day count, today's
floor, an interest thermometer, and a diagnosis when something's wrong.

**Tune** — trust dials, the test bench, meeting windows and locations, and the
usage meter.

## Meeting times

Type day and time ranges: `sat 10:00-14:00, sun 12-4pm, wed 6pm-8pm`. Dibs
offers times from those, spread across different days rather than three in a
row, and shows you a live preview of what it would propose.

Locations are a plain list, and Dibs only ever proposes from it. Mark one
`(public)` and that one gets used for anything over $150 or any buyer you
haven't dealt with before. A police safe-exchange lot is the right default for
that slot.

**Google Calendar is an optional toggle**, off by default. With it off,
everything above still works — Dibs just labels its suggestions "not checked
against a calendar" so you know to glance before confirming. Switching it on
skips times that clash with real events and can add the handoff to your
calendar. It needs a Google OAuth client ID (Cloud Console → Credentials →
OAuth client → Chrome extension) pasted into `manifest.json` under
`oauth2.client_id`. If you never do that, nothing breaks.

## Phone alerts — the free options

Escalations and the evening digest. Pick whichever you'd actually notice:

| Channel | Cost | Setup |
|---|---|---|
| Desktop notification | free | Already on. Only reaches you at the computer. |
| **ntfy** | free, no account | Install the ntfy app, invent a topic name nobody would guess, paste it in. Easiest phone option. |
| Telegram | free | @BotFather → `/newbot` → paste the token and your chat ID. Bots cost nothing. |
| Discord webhook | free | Server settings → Integrations → New Webhook. |
| Your own webhook | yours | Posts JSON, for wiring into anything else. |

There's a **Send a test alert** button so you can confirm it reaches your phone
before you rely on it.

**Why there's no email-to-SMS option.** It's the obvious first idea and it no
longer works. T-Mobile's `tmomail.net` stopped delivering around December 2024,
AT&T shut down `txt.att.net` and `mms.att.net` on 17 June 2025, and Verizon's
`vtext.com` is winding down with a hard cutoff of 31 March 2027 and messages
already being dropped by spam filtering. They also **fail silently** — no
bounce, no error, the alert simply never arrives. Nothing that can quietly stop
working should be carrying "two buyers are competing, pick one." ntfy does the
same job for free and tells you when it fails.

For the same reason Dibs doesn't send email: doing it properly from an extension
means either OAuth into your mail account or a third-party sending API, both of
which are more moving parts than a push topic for a worse result.

## How it decides

`agent.js`, in order:

1. **Two serious buyers at once → stops and asks you.** Always. Lays them out
   side by side with offers and scores. The machine never picks for you.
2. **Red flags → stops and asks you.** Shipping requests, odd payment methods,
   pushing you off Messenger. Never answered automatically under any setting.
3. **Offers → arithmetic, no model.** First offer gets countered near list no
   matter how low it was. A second offer that barely moved gets cold-offed —
   no reply, thread dropped. One that climbed but is still under today's floor
   gets **parked** for a few days to see who else turns up. At or above the
   floor, it accepts.
4. **Availability → template.** Never a bare "yes" — it asks when they can pick
   up, so tyre-kickers filter themselves out for free.
5. **Anything else → a model, restricted to your stated item facts.** If the
   facts don't cover the question, it asks you rather than guessing. This is
   deliberately stricter than Meta's own auto-reply, whose failure mode is
   promising things you don't offer.

The floor eases on its own as a listing ages — day 4 and day 10 each loosen it
a step. A parked $60 that failed on day 2 can clear on day 12 with no action
from you, and the first time that happens it comes to you for approval.

## Trust dials

Every playbook has three positions:

- **Manual** — drafts, waits for your tap
- **Shadow** — sends on its own but holds ten minutes with a stop button
- **Auto** — sends immediately, subject to the guardrails

Shadow is the rung worth living on for a while. Dibs watches your approval rate
and offers the promotion itself: *"23 sent as written, 1 edited, none rejected
— move to shadow?"* Two stops or two regret flags and it steps back down on its
own and tells you why.

Four playbooks never graduate: scam patterns, messages it can't place, going
back to a parked buyer, and choosing between two buyers.

Guardrails override the dial regardless: anything at or above your ask-me
dollar line, anything that would go under today's floor, quiet hours, and the
first time any behaviour fires on a new listing.

Every edit you make becomes a voice example for that playbook. After enough of
them it sounds like you, with no retraining.

## Why so little of this calls a model

Three tiers, cheapest first:

- **Tier 0, no model at all.** Availability pings, every message with a price
  in it (including bare numbers — "how about 60"), floor arithmetic, the daily
  re-check on parked buyers, scheduling maths, cold-off decisions. On a
  realistic message mix this is **86%** of volume, and it costs nothing forever.
- **Tier 1, Gemini Nano on your own machine.** Rewording canned replies so
  twelve availability answers aren't identical. No key, no billing. Falls
  through to tier 2 if unavailable.
- **Tier 2, cloud.** Pricing analysis, listing copy, genuinely novel questions,
  the two-buyer card. The static prompt prefix is cached, so a listing with
  fifteen inquiries pays for its context once instead of fifteen times.

The Tune tab shows the split. Tier 2 should stay small and boring.

## Platform hygiene

Built in as defaults, not settings:

- Tab-open only. No background service worker touches Facebook, no stored
  session tokens, no headless path. The alarms only do arithmetic on stored
  numbers.
- Randomised 2–15 minute reply delay.
- Quiet hours, and a hard daily send cap well above your real volume so a bug
  can't fire two hundred messages.
- One reply per thread per cycle. No bulk anything.
- Fail closed: if `messenger.js` can't tell which thread it's looking at or
  who said what, it reports nothing and sends nothing.

None of this makes it sanctioned. Automating platform interaction is against
Facebook's terms however politely it's done, and the real mitigation is keeping
a human tapping send — which is exactly what Manual and Shadow are for.

## How the reader stays honest

This is the part that had to be foolproof, because everything else depends on
it. Five defences in `messenger.js`, strongest first:

1. **Self-authorship ledger.** Dibs records every message it sends. Anything in
   the page matching the ledger is *definitively* ours — known, not inferred.
   This alone rescues attribution when Facebook strips its aria labels.
2. **Multi-signal voting.** Five independent signals per message: ledger match,
   `You sent` aria prefix, named-sender aria, test ids, sender avatar, and
   bubble geometry measured in pixels rather than computed flex styles. They
   must agree by a margin, or the message is marked unreadable. A lone
   geometry hint is never enough. Two independent signals agreeing with nothing
   dissenting is, which is what keeps it working through markup changes.
3. **Canary test.** Before any autonomous send, Dibs looks for its own last
   message in the thread. If it can't find and correctly attribute something it
   *knows* it sent, the reader has drifted — autonomy halts globally and you get
   an urgent alert.
4. **Send preconditions.** Thread id, buyer name and listing must all match what
   the queued reply was written for; the last message must be the buyer's; the
   composer must be empty and belong to the thread that was read; and no
   near-identical message may exist in the ledger within 30 minutes.
5. **Post-send verification.** The text must reappear in the thread attributed
   back to us. Anything short of that reports "sent but unconfirmed" rather than
   claiming success.

If fewer than 70% of a thread's messages can be confidently attributed, the
whole read is rejected. Total markup collapse yields health 0.00 and nothing
sends — the failure mode is silence, never a wrong message.

Every blocked send gives you a plain-English reason in the panel, because these
are design decisions rather than errors: *"The last message in that thread is
already yours — the buyer hasn't replied yet."*

## Known rough edges

- Comps are *asking* prices, not sold prices. Overpriced listings are exactly
  the ones still sitting there, so the median leans high. Dibs trims the tails
  and states its confidence honestly rather than inventing precision.
- `comps.js` reads Facebook's search results page and will need selector
  attention eventually. It fails to a manual price entry box rather than
  guessing.
- **The one gap in the reader:** if you reply to a buyer by hand in Messenger
  rather than through Dibs, that message isn't in the ledger, so attribution
  falls back to the voting signals for it. The `already_replied` guard and the
  canary cover most of the consequences, but if you're going to reply manually,
  it's cleanest to use the "I'll take it" button on the card first.
- Gemini Nano isn't on every machine. There's a graceful cloud fallback, so
  nothing breaks — it just costs slightly more on hers.

## Files

| File | What it does |
|---|---|
| `sidepanel.html/.css/.js` | The four tabs and the Composer |
| `queue-ui.js` | Queue cards, trust dials, test bench |
| `agent.js` | The decision engine, playbooks, guardrails, scoring |
| `llm.js` | Three-tier router: templates, Nano, cloud |
| `composer.js` | Comps analysis, pricing maths, copy generation |
| `comps.js` | Content script, reads Marketplace search results |
| `messenger.js` | Content script, reads threads and types replies |
| `queue.js` | Pending items, shadow timers, graduation stats |
| `reputation.js` | Buyer memory, shared across both accounts |
| `scheduler.js` | Google Calendar, slots, approved locations |
| `ledger.js` | Sold-price history, underpricing and stale diagnosis |
| `notify.js` | Local and Telegram push, evening digest |
| `background.js` | Alarms: shadow release, parked review, digest |
| `storage.js` | Settings, listings, usage metering |

## Tests

    node test/run-real.mjs
    node test/run-content.mjs
    # ...see test/README.md for the full list

199 assertions against the real modules, not reimplementations. See
`test/README.md` for what each suite covers.
