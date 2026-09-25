// Three tiers, cheapest first. Nothing reaches the cloud that a regex or the
// on-device model can handle. Built this way from the start on purpose —
// retrofitting it later never happens.

import { getSettings, recordUsage } from "./storage.js";

/* ===================== TIER 0 — code only, zero tokens ===================== */

const AVAILABILITY = /\b(still|is it|is this|you still)\b.{0,20}\b(available|there|for sale|have it|got it)\b|^\s*(available|still available)\s*\??\s*$/i;
// Money in three shapes: "$45", "45 bucks", and the bare number people
// actually type — "how about 60", "would you do 50". The bare form needs
// offer language in front of it, otherwise "30 inches deep" reads as an offer.
const MONEY_EXPLICIT = /\$\s?(\d[\d,]*)|(\b\d[\d,]*)\s?(?:dollars|bucks)\b/i;
const MONEY_BARE = /\b(?:take|do|accept|give you|go|how about|what about|offer|for|down to|meet you at)\s+(\d{1,5})\b(?!\s*(?:inch|in\b|cm|mm|ft|foot|feet|lbs?|pounds?|kg|years?|yrs?|months?|am\b|pm\b|o'?clock|minutes?|mins?|miles?|%))/i;
// A whole message that is basically just a number: "130", "130 final",
// "$60 cash". Deliberately a closed whitelist of trailing words so that
// "30 inches deep" can't slip through as an offer.
const MONEY_ALONE = /^\s*\$?\s?(\d[\d,]{0,6})\s*(final|firm|cash|ok|okay|best|max|tops)?\s*[?!.]*\s*$/i;
// A number followed by a money word anywhere in the sentence: "70 cash, can
// come tomorrow", "60 firm". Very common phrasing and the strongest kind of
// offer there is, since they're telling you the terms too.
const MONEY_TRAILING = /\b(\d[\d,]{0,6})\s*(?:cash|firm|final|flat|even)\b/i;
const GREETING = /^\s*(hi|hey|hello|yo|sup|hiya|good (morning|afternoon|evening))[\s!.?]*$/i;
const PICKUP = /\b(come|pick(ing)? up|see it|look at it|stop by|swing by|today|tomorrow)\b/i;

function readAmount(text) {
  const e = text.match(MONEY_EXPLICIT);
  if (e) return parseInt((e[1] || e[2]).replace(/,/g, ""), 10);
  const tr = text.match(MONEY_TRAILING);
  if (tr) return parseInt(tr[1].replace(/,/g, ""), 10);
  const b = text.match(MONEY_BARE);
  if (b) return parseInt(b[1], 10);
  const a = text.match(MONEY_ALONE);
  if (a) return parseInt(a[1].replace(/,/g, ""), 10);
  return null;
}

const RED_FLAGS = [
  /\bship(ping|ped)?\b/i,
  /\b(zelle|cash ?app|venmo|paypal|wire|gift card|crypto)\b/i,
  /\b(my (mover|agent|driver)|third[- ]party)\b/i,
  /\b(text me at|email me at|whats ?app)\b/i,
  /\bcheck\b.{0,15}\bmail\b/i,
];

export function classify(text) {
  for (const rx of RED_FLAGS) if (rx.test(text)) return { intent: "red_flag", tier: 0 };

  const amount = readAmount(text);
  if (amount != null && amount > 0 && amount < 1e6) {
    return { intent: "offer", amount, tier: 0 };
  }

  if (AVAILABILITY.test(text)) return { intent: "availability", tier: 0 };

  // A bare "hey" is an opener, not a question. Treat it like an availability
  // ping rather than paying a model to tell us it means nothing.
  if (GREETING.test(text)) return { intent: "availability", tier: 0 };

  if (PICKUP.test(text)) return { intent: "scheduling", tier: 0 };
  return { intent: "unknown", tier: null };
}

export { readAmount };

// Today's floor. Pure arithmetic — this runs daily on every parked buyer and
// costs nothing, forever.
export function floorToday(target, settings, postedAt) {
  const days = Math.floor((Date.now() - postedAt) / 86400000);
  const band = days <= 3 ? "early" : days <= 9 ? "mid" : "late";
  return Math.round(target * (settings.floorPct / 100) * settings.floorDecay[band]);
}

// The negotiation decision. No inference needed: knowing that $35 on a $75
// item after a $70 counter is a dead end is subtraction.
export function decideOffer({ amount, listPrice, target, floor, offerHistory }) {
  const round = offerHistory.length;
  if (amount >= target) return { move: "accept" };
  if (round === 0) {
    return { move: "counter", counter: Math.round(listPrice * 0.93) };
  }
  const previous = offerHistory[offerHistory.length - 1];
  const climbed = amount - previous;
  const gapToFloor = floor - amount;
  if (climbed < gapToFloor * 0.25) return { move: "cold_off" };
  if (amount >= floor) return { move: "accept" };
  return { move: "consider", revisitAfterDays: 3 };
}

export function renderTemplate(move, ctx) {
  switch (move) {
    case "availability":
      // Never a bare "yes" — make them name a time. Costs them something to
      // answer, so tyre-kickers filter themselves out for free.
      return `Yep, still available — when were you thinking you could pick it up?`;
    case "accept":
      return `That works for me. When can you come get it? I'm at ${ctx.area}.`;
    case "counter":
      return ctx.sweetener
        ? `I could do $${ctx.counter} — ${ctx.sweetener}.`
        : `I could do $${ctx.counter} for it.`;
    case "cold_off":
      return null; // deliberate silence
    case "consider":
      return null; // parked; no reply for a few days
    case "scheduling":
      return `Sure. I'm around ${ctx.windows} — any of those work?`;
    default:
      return null;
  }
}

/* ============= TIER 1 — Gemini Nano, on-device, no billing ============= */

let nanoSession = null;

async function nanoAvailable() {
  try {
    if (typeof LanguageModel === "undefined") return false;
    const state = await LanguageModel.availability();
    return state === "available" || state === "downloadable";
  } catch {
    return false;
  }
}

export async function nano(prompt, systemPrompt) {
  if (!(await nanoAvailable())) return null;
  try {
    nanoSession ??= await LanguageModel.create({
      initialPrompts: [{ role: "system", content: systemPrompt }],
    });
    const out = await nanoSession.prompt(prompt);
    await recordUsage(1);
    return out.trim();
  } catch {
    return null; // always fall through to cloud rather than failing
  }
}

// Keeps twelve availability replies from being byte-identical. Nano is fine
// for this and it never leaves the machine.
export async function vary(text) {
  const out = await nano(
    `Reword in under 25 words, same meaning, same casual tone. Reply with only the reworded text.\n\n${text}`,
    "You rephrase short marketplace messages between neighbours. Plain and friendly."
  );
  return out || text;
}

/* ================== TIER 2 — cloud, the only paid path ================== */

export async function cloud({ system, messages, maxTokens = 900, cacheSystem = true }) {
  const { apiKey } = await getSettings();
  if (!apiKey) throw new Error("Add your Anthropic API key on the Tune tab first.");

  // Static prefix gets cached: item facts and rules don't change between
  // messages on the same listing, so a listing with 15 inquiries pays for
  // that context once instead of fifteen times.
  const systemBlocks = [
    cacheSystem
      ? { type: "text", text: system, cache_control: { type: "ephemeral" } }
      : { type: "text", text: system },
  ];

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      system: systemBlocks,
      messages,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  await recordUsage(2, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);
  return data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

export function parseJson(raw) {
  const cleaned = raw.replace(/^```(?:json)?/m, "").replace(/```$/m, "").trim();
  return JSON.parse(cleaned);
}
