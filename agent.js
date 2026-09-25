// The decision engine. Given a thread and a listing, decide what to say and
// whether a human needs to see it first.
//
// Order of operations matters: classify cheaply, decide with arithmetic, then
// only reach for a model if neither of those could answer. Guardrails are
// applied last and can always override the trust dial.

import { classify, floorToday, decideOffer, renderTemplate, vary, cloud, parseJson, readAmount } from "./llm.js";
import { getSettings } from "./storage.js";
import { getBuyer } from "./reputation.js";
import { proposeSlots } from "./scheduler.js";

export const PLAYBOOKS = {
  availability: { label: "Availability replies", graduatable: true },
  factual: { label: "Questions about the item", graduatable: true },
  offer_first: { label: "First counters", graduatable: true },
  offer_followup: { label: "Follow-up counters", graduatable: true },
  scheduling: { label: "Setting up a pickup", graduatable: true },
  red_flag: { label: "Anything that smells wrong", graduatable: false },
  unknown: { label: "Messages it can't place", graduatable: false },
  considered_reengage: { label: "Going back to a parked buyer", graduatable: false },
  buyer_selection: { label: "Choosing between buyers", graduatable: false },
};

export const DEFAULT_MODES = Object.fromEntries(
  Object.keys(PLAYBOOKS).map((k) => [k, "manual"])
);

/* ============================== main entry ============================== */

export async function decide({ thread, listing, allThreads }) {
  const settings = await getSettings();
  // The message being answered, and its position — the position matters,
  // because the offer history must EXCLUDE the offer we're deciding on.
  // Including it made every first offer look like a second offer that hadn't
  // moved, which cold-offed buyers who had only just said hello.
  const lastBuyerIndex = thread.messages.map((m) => m.from).lastIndexOf("buyer");
  if (lastBuyerIndex === -1) return null; // nothing from them to answer
  const last = thread.messages[lastBuyerIndex];

  const buyer = await getBuyer(thread.buyerName);
  const offerHistory = extractOffers(thread.messages.slice(0, lastBuyerIndex));
  const floor = floorToday(listing.target, settings, listing.postedAt);

  // --- competing buyers always stops the machine -------------------------
  const serious = (allThreads || []).filter((t) => t.score >= 0.6);
  if (serious.length >= 2) {
    return escalate("buyer_selection", {
      reason: `${serious.length} buyers are serious at once. Pick one.`,
      comparison: serious.map((t) => ({
        name: t.buyerName,
        offer: t.bestOffer,
        score: t.score,
        note: t.note,
      })),
    });
  }

  const c = classify(last.text);

  /* ---- red flags: never answered automatically, ever ---- */
  if (c.intent === "red_flag") {
    return escalate("red_flag", {
      reason: "This matches a scam pattern — shipping, an odd payment method, or pushing you off Messenger.",
      buyerMessage: last.text,
    });
  }

  if (buyer.flagged) {
    return escalate("red_flag", {
      reason: `You flagged ${thread.buyerName} before: ${buyer.flagNote || "no note"}.`,
      buyerMessage: last.text,
    });
  }

  /* ---- offers: pure arithmetic, no model ---- */
  if (c.intent === "offer") {
    const d = decideOffer({
      amount: c.amount,
      listPrice: listing.listPrice,
      target: listing.target,
      floor,
      offerHistory,
    });

    const playbook = offerHistory.length === 0 ? "offer_first" : "offer_followup";

    if (d.move === "cold_off") {
      return {
        playbook,
        action: "no_reply",
        note: `${thread.buyerName} went $${offerHistory.at(-1)} → $${c.amount}. Not moving. Dropping the thread.`,
        tier: 0,
      };
    }

    if (d.move === "consider") {
      return {
        playbook,
        action: "park",
        revisitAt: Date.now() + (d.revisitAfterDays || 3) * 86400000,
        note: `$${c.amount} is under today's floor of $${floor}, but they're climbing. Parked for ${d.revisitAfterDays} days to see who else turns up.`,
        tier: 0,
      };
    }

    const sweetener =
      d.move === "counter" && listing.sweeteners?.length ? listing.sweeteners[0] : null;

    let text = renderTemplate(d.move, {
      counter: d.counter,
      sweetener,
      area: listing.area,
    });
    text = await vary(text);

    return finish({
      playbook,
      text,
      amount: c.amount,
      settings,
      listing,
      note: d.move === "accept" ? `$${c.amount} clears today's floor of $${floor}.` : null,
      tier: 0,
    });
  }

  /* ---- availability: highest volume, cheapest possible ---- */
  if (c.intent === "availability") {
    const text = await vary(renderTemplate("availability", {}));
    return finish({ playbook: "availability", text, settings, listing, tier: 0 });
  }

  /* ---- scheduling ---- */
  if (c.intent === "scheduling") {
    const slots = await proposeSlots(settings);
    if (!slots.length) {
      return escalate("scheduling", {
        reason: "They want to come by, but nothing in your availability windows is free.",
        buyerMessage: last.text,
      });
    }
    const text = await vary(
      renderTemplate("scheduling", { windows: slots.map((s) => s.label).join(", ") })
    );
    return finish({ playbook: "scheduling", text, settings, listing, slots, tier: 0 });
  }

  /* ---- anything else: model, and only from stated facts ---- */
  return await answerFromFacts({ last, listing, thread, settings });
}

/* ========================= factual answers (tier 2) ===================== */

const FACT_SYSTEM = `You answer a buyer's question about a used item on Facebook Marketplace, on the seller's behalf.

You may only use the facts listed below. If the question cannot be fully answered from them, you must decline to answer.

Reply with JSON only:
{"answerable": true|false, "reply": "under 40 words, casual, as the seller", "missing": "what you'd need to know"}

Never guess a measurement, a date, a condition detail, or whether something is included. Never offer shipping or delivery. If the answer is partly unknown, answerable is false.`;

async function answerFromFacts({ last, listing, thread, settings }) {
  // Compact state only — never the raw transcript. A negotiation's whole
  // relevant history is a handful of numbers.
  const facts = (listing.facts || []).map((f) => `- ${f}`).join("\n");
  const system = `${FACT_SYSTEM}

Item: ${listing.title}
Asking: $${listing.listPrice}
Facts you may use:
${facts || "- (none recorded)"}
Won't do: ${(listing.firmNos || []).join("; ") || "shipping"}`;

  let parsed;
  try {
    const raw = await cloud({
      system, // cached — same prefix for every message on this listing
      messages: [{ role: "user", content: last.text }],
      maxTokens: 300,
    });
    parsed = parseJson(raw);
  } catch (err) {
    return escalate("unknown", { reason: `Couldn't work out a reply: ${err.message}`, buyerMessage: last.text });
  }

  if (!parsed.answerable) {
    return escalate("factual", {
      reason: `They asked something your listing doesn't cover${parsed.missing ? `: ${parsed.missing}` : ""}.`,
      buyerMessage: last.text,
      tier: 2,
    });
  }

  return finish({ playbook: "factual", text: parsed.reply, settings, listing, tier: 2 });
}

/* ============================== guardrails ============================== */
// Applied after the decision, and they always win over the trust dial.

function finish({ playbook, text, amount, settings, listing, note, slots, tier }) {
  const modes = settings.modes || DEFAULT_MODES;
  let mode = PLAYBOOKS[playbook]?.graduatable ? modes[playbook] || "manual" : "manual";

  const held = [];

  // The single most useful control in the tool: a dollar ceiling on autonomy.
  if ((listing.listPrice || 0) >= settings.askAbove) {
    mode = "manual";
    held.push(`over your $${settings.askAbove} ask-me line`);
  }

  if (amount != null && amount < (listing.floorNow ?? 0)) {
    mode = "manual";
    held.push("would go under today's floor");
  }

  if (isQuietHours(settings)) {
    mode = "manual";
    held.push("quiet hours");
  }

  // The reader gate. If Dibs can't reliably tell your messages from the
  // buyer's, nothing goes out on its own regardless of any dial. This is the
  // single most important guardrail in the file — a misread thread means
  // countering your own offer.
  if (settings.readerHealthy === false) {
    mode = "manual";
    held.push("can't read the thread reliably");
  }

  if (!listing.provenPlaybooks?.includes(playbook) && mode !== "manual") {
    // First time a behaviour fires on a listing, you see it once.
    mode = "shadow";
    held.push("first time on this listing");
  }

  return {
    playbook,
    action: "reply",
    text,
    mode,
    heldBecause: held,
    note,
    slots,
    tier,
    delaySeconds: randomDelay(settings),
  };
}

function escalate(playbook, extra) {
  return { playbook, action: "escalate", mode: "manual", ...extra };
}

function isQuietHours(settings) {
  const [start, end] = settings.quietHours;
  const h = new Date().getHours();
  return start > end ? h >= start || h < end : h >= start && h < end;
}

function randomDelay(settings) {
  const [lo, hi] = settings.replyDelay;
  return Math.round(lo + Math.random() * (hi - lo));
}

/* ============================== buyer scoring =========================== */

export function scoreThread(thread, listing) {
  const offers = extractOffers(thread.messages);
  const buyerMsgs = thread.messages.filter((m) => m.from === "buyer");
  let score = 0;

  if (offers.length) {
    const best = Math.max(...offers);
    score += Math.min(0.5, (best / listing.target) * 0.5);
  }
  // A specific question beats ten "still available?"s.
  const specific = buyerMsgs.filter((m) => m.text.length > 40 && /\?/.test(m.text)).length;
  score += Math.min(0.2, specific * 0.1);
  if (buyerMsgs.some((m) => /\b(come|pick up|today|tomorrow|cash)\b/i.test(m.text))) score += 0.25;
  if (offers.length >= 2 && offers.at(-1) > offers[0]) score += 0.15; // they moved toward you

  return Math.min(1, Number(score.toFixed(2)));
}

export function extractOffers(messages) {
  const out = [];
  for (const m of messages) {
    if (m.from !== "buyer") continue;
    const n = readAmount(m.text);
    if (n != null && n > 0 && n < 1e6) out.push(n);
  }
  return out;
}
